import type { IncomingMessage, Server } from "node:http";
import type { Duplex } from "node:stream";
import { WebSocketServer, WebSocket, type RawData } from "ws";
import * as Y from "yjs";
import * as syncProtocol from "y-protocols/sync";
import * as awarenessProtocol from "y-protocols/awareness";
import * as encoding from "lib0/encoding";
import * as decoding from "lib0/decoding";
import { resolveIdentity, readAuthConfig } from "../auth";
import { roleCan, type ShareRole } from "../../src/core/acl";
import type { DocStore } from "./docStore";

/** y-websocket wire constants. */
const MSG_SYNC = 0;
const MSG_AWARENESS = 1;
export const SUBPROTOCOL = "aura-collab.v1";
export const BEARER_PREFIX = "bearer.";
export const ROOM_RE = /^note:[A-Za-z0-9_-]{1,128}$/;

export interface AccessChecker {
  /** Effective role of `email` on the room, or null for no access. Throwing is treated as deny. */
  getRole(email: string, room: string): Promise<ShareRole | null>;
}

export interface CollabLimits {
  maxMessageBytes: number;
  maxMessagesPerSec: number;
  maxBytesPerSec: number;
  maxDocBytes: number;
  maxConnsPerRoom: number;
  maxConnsPerUser: number;
  /** Compact the log once this many updates were appended since the last snapshot. */
  compactAfterUpdates: number;
  idleRoomMs: number;
  /** Re-check access of live connections (revocation/downgrade) this often. 0 disables. */
  recheckMs: number;
  heartbeatMs: number;
}

export const DEFAULT_LIMITS: CollabLimits = {
  maxMessageBytes: 1 * 1024 * 1024,
  maxMessagesPerSec: 200,
  maxBytesPerSec: 4 * 1024 * 1024,
  maxDocBytes: 32 * 1024 * 1024,
  maxConnsPerRoom: 100,
  maxConnsPerUser: 20,
  compactAfterUpdates: 200,
  idleRoomMs: 60_000,
  recheckMs: 30_000,
  heartbeatMs: 30_000,
};

export interface CollabDeps {
  store: DocStore;
  access: AccessChecker;
  /** Returns the verified email or null. Default: Firebase token via resolveIdentity (server/auth.ts). */
  authenticate?: (token: string | null, req: IncomingMessage) => Promise<{ email: string } | null>;
  /** Exact-match Origin allow-list. If set, browser requests with another Origin are refused. */
  allowedOrigins?: string[];
  path?: string;
  limits?: Partial<CollabLimits>;
  log?: (event: string, meta?: Record<string, unknown>) => void;
}

export interface CollabServer {
  close(): Promise<void>;
  readonly roomCount: number;
  /** Test/ops hook: force-compact and evict idle rooms now. */
  sweep(): Promise<void>;
}

interface Conn {
  ws: WebSocket;
  email: string;
  role: ShareRole;
  awarenessIds: Set<number>;
  alive: boolean;
  winStart: number;
  winMsgs: number;
  winBytes: number;
}

class Room {
  doc = new Y.Doc();
  awareness = new awarenessProtocol.Awareness(this.doc);
  conns = new Set<Conn>();
  updatesSinceCompact = 0;
  bytes = 0;
  idleSince: number | null = Date.now();
  private chain: Promise<unknown> = Promise.resolve();
  ready: Promise<void>;
  closed = false;

  constructor(public name: string, private store: DocStore, private log: NonNullable<CollabDeps["log"]>) {
    this.awareness.setLocalState(null); // the server itself has no presence
    this.ready = this.load();
    this.doc.on("update", (update: Uint8Array, origin: unknown) => {
      if (origin === "load") return;
      this.bytes += update.length;
      this.updatesSinceCompact++;
      this.enqueue(() => this.store.append(this.name, update));
      const enc = encoding.createEncoder();
      encoding.writeVarUint(enc, MSG_SYNC);
      syncProtocol.writeUpdate(enc, update);
      this.broadcast(encoding.toUint8Array(enc));
    });
    this.awareness.on(
      "update",
      ({ added, updated, removed }: { added: number[]; updated: number[]; removed: number[] }, origin: unknown) => {
        const conn = this.findConn(origin);
        if (conn) {
          for (const id of added) conn.awarenessIds.add(id);
          for (const id of removed) conn.awarenessIds.delete(id);
        }
        const changed = added.concat(updated, removed);
        const enc = encoding.createEncoder();
        encoding.writeVarUint(enc, MSG_AWARENESS);
        encoding.writeVarUint8Array(enc, awarenessProtocol.encodeAwarenessUpdate(this.awareness, changed));
        this.broadcast(encoding.toUint8Array(enc));
      },
    );
  }

  private findConn(origin: unknown): Conn | null {
    for (const c of this.conns) if (c.ws === origin) return c;
    return null;
  }

  private enqueue(fn: () => Promise<unknown>) {
    this.chain = this.chain.then(fn).catch((e) => this.log("store_error", { room: this.name, err: String(e?.message ?? e) }));
    return this.chain;
  }

  private async load() {
    const updates = await this.store.load(this.name);
    this.doc.transact(() => {
      for (const u of updates) Y.applyUpdate(this.doc, u, "load");
    }, "load");
    this.bytes = updates.reduce((n, u) => n + u.length, 0);
  }

  broadcast(msg: Uint8Array) {
    for (const c of this.conns) if (c.ws.readyState === WebSocket.OPEN) c.ws.send(msg);
  }

  compact() {
    const snap = Y.encodeStateAsUpdate(this.doc);
    this.updatesSinceCompact = 0;
    this.bytes = snap.length;
    return this.enqueue(() => this.store.compact(this.name, snap));
  }

  async flush() {
    await this.chain;
  }

  async destroy() {
    this.closed = true;
    await this.ready.catch(() => undefined);
    if (this.updatesSinceCompact > 0) await this.compact();
    await this.flush();
    this.awareness.destroy();
    this.doc.destroy();
  }
}

function parseProtocols(req: IncomingMessage): { token: string | null; ok: boolean } {
  const raw = req.headers["sec-websocket-protocol"];
  const list = (Array.isArray(raw) ? raw.join(",") : raw ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  if (!list.includes(SUBPROTOCOL)) return { token: null, ok: false };
  const b = list.find((p) => p.startsWith(BEARER_PREFIX));
  return { token: b ? b.slice(BEARER_PREFIX.length) : null, ok: true };
}

function reject(socket: Duplex, status: number, text: string) {
  try {
    socket.write(`HTTP/1.1 ${status} ${text}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`);
  } catch {
    /* ignore */
  }
  socket.destroy();
}

async function defaultAuthenticate(token: string | null, req: IncomingMessage) {
  const fake = {
    headers: {
      authorization: token ? `Bearer ${token}` : undefined,
      "x-user-email": req.headers["x-user-email"],
    },
  } as any;
  const r = await resolveIdentity(fake, readAuthConfig());
  return r.ok ? { email: r.email } : null;
}

export function attachCollabServer(httpServer: Server, deps: CollabDeps): CollabServer {
  const limits: CollabLimits = { ...DEFAULT_LIMITS, ...deps.limits };
  const basePath = deps.path ?? "/collab";
  const log = deps.log ?? (() => undefined);
  const authenticate = deps.authenticate ?? defaultAuthenticate;
  const rooms = new Map<string, Room>();
  const perUser = new Map<string, number>();
  const wss = new WebSocketServer({
    noServer: true,
    maxPayload: limits.maxMessageBytes,
    perMessageDeflate: false,
    handleProtocols: (protocols) => (protocols.has(SUBPROTOCOL) ? SUBPROTOCOL : false),
  });
  let closing = false;

  const getRoom = (name: string): Room => {
    let r = rooms.get(name);
    if (!r) {
      r = new Room(name, deps.store, log);
      rooms.set(name, r);
    }
    return r;
  };

  const onUpgrade = async (req: IncomingMessage, socket: Duplex, head: Buffer) => {
    let url: URL;
    try {
      url = new URL(req.url ?? "", "http://x");
    } catch {
      return reject(socket, 400, "Bad Request");
    }
    if (!url.pathname.startsWith(basePath + "/")) return; // not ours: let other upgrade listeners handle it
    socket.on("error", () => undefined);
    if (closing) return reject(socket, 503, "Service Unavailable");

    const origin = req.headers.origin;
    if (deps.allowedOrigins && origin && !deps.allowedOrigins.includes(origin)) return reject(socket, 403, "Forbidden");

    let room: string;
    try {
      room = decodeURIComponent(url.pathname.slice(basePath.length + 1));
    } catch {
      return reject(socket, 400, "Bad Request");
    }
    if (!ROOM_RE.test(room)) return reject(socket, 400, "Bad Request");

    const { token, ok } = parseProtocols(req);
    if (!ok) return reject(socket, 400, "Bad Request");

    let email: string;
    try {
      const id = await authenticate(token, req);
      if (!id) return reject(socket, 401, "Unauthorized");
      email = id.email.toLowerCase();
    } catch {
      return reject(socket, 401, "Unauthorized");
    }

    let role: ShareRole | null;
    try {
      role = await deps.access.getRole(email, room);
    } catch (e) {
      log("access_error", { room });
      role = null;
    }
    // Same status for "no such room" and "no access" so rooms cannot be probed.
    if (!role || !roleCan(role, "read")) return reject(socket, 403, "Forbidden");

    const r0 = rooms.get(room);
    if ((r0?.conns.size ?? 0) >= limits.maxConnsPerRoom || (perUser.get(email) ?? 0) >= limits.maxConnsPerUser) {
      return reject(socket, 429, "Too Many Requests");
    }
    if (closing) return reject(socket, 503, "Service Unavailable");

    wss.handleUpgrade(req, socket, head, (ws) => void onConnection(ws, room, email, role!));
  };

  async function onConnection(ws: WebSocket, roomName: string, email: string, role: ShareRole) {
    const room = getRoom(roomName);
    const conn: Conn = {
      ws, email, role, awarenessIds: new Set(), alive: true,
      winStart: Date.now(), winMsgs: 0, winBytes: 0,
    };
    ws.binaryType = "nodebuffer";
    perUser.set(email, (perUser.get(email) ?? 0) + 1);
    // Register synchronously so the room is not evicted while loading.
    room.conns.add(conn);
    room.idleSince = null;

    const queue: RawData[] = [];
    let ready = false;
    ws.on("message", (data) => (ready ? handle(room, conn, data) : queue.push(data)));
    ws.on("pong", () => (conn.alive = true));
    ws.on("error", () => undefined);
    ws.on("close", () => {
      room.conns.delete(conn);
      perUser.set(email, Math.max(0, (perUser.get(email) ?? 1) - 1));
      if (perUser.get(email) === 0) perUser.delete(email);
      if (conn.awarenessIds.size) awarenessProtocol.removeAwarenessStates(room.awareness, [...conn.awarenessIds], null);
      if (room.conns.size === 0) room.idleSince = Date.now();
    });

    try {
      await room.ready;
    } catch {
      ws.close(1011, "load failed");
      return;
    }
    if (ws.readyState !== WebSocket.OPEN) return;
    // y-websocket handshake: server sends sync step 1, then current awareness states.
    const enc = encoding.createEncoder();
    encoding.writeVarUint(enc, MSG_SYNC);
    syncProtocol.writeSyncStep1(enc, room.doc);
    ws.send(encoding.toUint8Array(enc));
    const states = room.awareness.getStates();
    if (states.size > 0) {
      const e2 = encoding.createEncoder();
      encoding.writeVarUint(e2, MSG_AWARENESS);
      encoding.writeVarUint8Array(e2, awarenessProtocol.encodeAwarenessUpdate(room.awareness, [...states.keys()]));
      ws.send(encoding.toUint8Array(e2));
    }
    ready = true;
    for (const m of queue.splice(0)) handle(room, conn, m);
  }

  function handle(room: Room, conn: Conn, data: RawData) {
    const buf = Array.isArray(data) ? Buffer.concat(data) : Buffer.isBuffer(data) ? data : Buffer.from(data as ArrayBuffer);
    if (buf.length > limits.maxMessageBytes) return conn.ws.close(1009, "message too big");

    const now = Date.now();
    if (now - conn.winStart >= 1000) {
      conn.winStart = now;
      conn.winMsgs = 0;
      conn.winBytes = 0;
    }
    conn.winMsgs++;
    conn.winBytes += buf.length;
    if (conn.winMsgs > limits.maxMessagesPerSec || conn.winBytes > limits.maxBytesPerSec) {
      log("rate_limited", { room: room.name });
      return conn.ws.close(1008, "rate limit");
    }

    try {
      const dec = decoding.createDecoder(new Uint8Array(buf));
      const type = decoding.readVarUint(dec);
      if (type === MSG_SYNC) {
        // Peek the sync sub-type: 0 = step1 (request), 1 = step2 (data), 2 = update (data).
        const peek = decoding.createDecoder(new Uint8Array(buf));
        decoding.readVarUint(peek);
        const sub = decoding.readVarUint(peek);
        const isWrite = sub === syncProtocol.messageYjsSyncStep2 || sub === syncProtocol.messageYjsUpdate;
        if (isWrite) {
          if (!roleCan(conn.role, "write")) {
            log("write_denied", { room: room.name });
            return; // silently dropped; the client stays read-only
          }
          if (room.bytes + buf.length > limits.maxDocBytes) return conn.ws.close(1009, "document too large");
        }
        const enc = encoding.createEncoder();
        encoding.writeVarUint(enc, MSG_SYNC);
        syncProtocol.readSyncMessage(dec, enc, room.doc, conn.ws);
        if (encoding.length(enc) > 1) conn.ws.send(encoding.toUint8Array(enc));
        if (room.updatesSinceCompact >= limits.compactAfterUpdates) void room.compact();
      } else if (type === MSG_AWARENESS) {
        awarenessProtocol.applyAwarenessUpdate(room.awareness, decoding.readVarUint8Array(dec), conn.ws);
      } else {
        return conn.ws.close(1003, "unsupported message");
      }
    } catch {
      conn.ws.close(1007, "malformed message");
    }
  }

  const recheck = async () => {
    for (const room of rooms.values()) {
      for (const conn of [...room.conns]) {
        let role: ShareRole | null = null;
        try {
          role = await deps.access.getRole(conn.email, room.name);
        } catch {
          role = null; // fail closed
        }
        if (!role || !roleCan(role, "read")) conn.ws.close(4403, "access revoked");
        else conn.role = role;
      }
    }
  };

  const sweep = async () => {
    const t = Date.now();
    for (const [name, room] of [...rooms]) {
      if (room.conns.size === 0 && room.idleSince !== null && t - room.idleSince >= limits.idleRoomMs) {
        rooms.delete(name);
        await room.destroy();
      } else if (room.updatesSinceCompact >= limits.compactAfterUpdates) {
        await room.compact();
      }
    }
  };

  httpServer.on("upgrade", onUpgrade);
  const timers: NodeJS.Timeout[] = [];
  timers.push(setInterval(() => void sweep(), Math.max(1000, Math.min(limits.idleRoomMs, 15_000))));
  if (limits.recheckMs > 0) timers.push(setInterval(() => void recheck(), limits.recheckMs));
  timers.push(
    setInterval(() => {
      for (const room of rooms.values())
        for (const c of room.conns) {
          if (!c.alive) c.ws.terminate();
          else {
            c.alive = false;
            c.ws.ping();
          }
        }
    }, limits.heartbeatMs),
  );
  timers.forEach((t) => t.unref());

  return {
    get roomCount() {
      return rooms.size;
    },
    sweep,
    async close() {
      closing = true;
      httpServer.off("upgrade", onUpgrade);
      timers.forEach(clearInterval);
      for (const room of rooms.values()) for (const c of room.conns) c.ws.close(1001, "server shutting down");
      await new Promise<void>((res) => wss.close(() => res()));
      for (const room of rooms.values()) await room.destroy();
      rooms.clear();
      await deps.store.close?.();
    },
  };
}
