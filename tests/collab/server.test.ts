// @vitest-environment node
import { describe, it, expect, afterEach } from "vitest";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { mkdtempSync, rmSync } from "node:fs";
import type { AddressInfo } from "node:net";
import WebSocket from "ws";
import * as Y from "yjs";
import { WebsocketProvider } from "y-websocket";
import { attachCollabServer, SUBPROTOCOL, type CollabServer, type AccessChecker } from "../../api/collab/server";
import { MemoryDocStore, FileDocStore, type DocStore } from "../../api/collab/docStore";
import { createAclAccessChecker } from "../../api/collab/access";
import type { ShareRole } from "../../src/core/acl";

const ROOM = "note:abc123";
// token == email in tests; "bad" fails authentication.
const authenticate = async (token: string | null) => (token && token !== "bad" ? { email: token } : null);
const roles: Record<string, ShareRole | null> = { ed1: "Editor", ed2: "Editor", view: "Viewer", nobody: null };
const access: AccessChecker = { getRole: async (email) => roles[email] ?? null };

let cleanup: Array<() => Promise<void> | void> = [];
afterEach(async () => {
  for (const c of cleanup.reverse()) await c();
  cleanup = [];
});

async function start(store: DocStore = new MemoryDocStore(), extra: Partial<Parameters<typeof attachCollabServer>[1]> = {}) {
  const server = http.createServer();
  const collab: CollabServer = attachCollabServer(server, { store, access, authenticate, ...extra });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const port = (server.address() as AddressInfo).port;
  const stop = async () => {
    await collab.close();
    await new Promise<void>((r) => {
      server.closeAllConnections?.();
      server.close(() => r());
    });
  };
  cleanup.push(stop);
  return { port, collab, stop: async () => { cleanup = cleanup.filter((c) => c !== stop); await stop(); } };
}

function client(port: number, token: string, room = ROOM) {
  const doc = new Y.Doc();
  const provider = new WebsocketProvider(`ws://127.0.0.1:${port}/collab`, room, doc, {
    WebSocketPolyfill: WebSocket as any,
    protocols: [SUBPROTOCOL, `bearer.${token}`],
    maxBackoffTime: 100,
    disableBc: true,
  });
  cleanup.push(() => { provider.destroy(); doc.destroy(); });
  return { doc, provider, text: doc.getText("body") };
}
const synced = (p: WebsocketProvider) => (p.synced ? Promise.resolve() : new Promise<void>((r) => (p as any).once("sync", (s: boolean) => s && r())));
async function until(fn: () => boolean, ms = 4000) {
  const t0 = Date.now();
  while (!fn()) {
    if (Date.now() - t0 > ms) throw new Error("timeout waiting for condition");
    await new Promise((r) => setTimeout(r, 15));
  }
}
const rawConnect = (port: number, protocols: string[], room = ROOM, headers: Record<string, string> = {}) =>
  new Promise<{ status: number | "open" }>((resolve) => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/collab/${encodeURIComponent(room)}`, protocols, { headers });
    ws.on("open", () => { ws.close(); resolve({ status: "open" }); });
    ws.on("unexpected-response", (_q, res) => { resolve({ status: res.statusCode! }); res.destroy(); });
    ws.on("error", () => undefined);
  });

describe("collab server", () => {
  it("converges two editors, and a late joiner", async () => {
    const { port } = await start();
    const a = client(port, "ed1");
    const b = client(port, "ed2");
    await Promise.all([synced(a.provider), synced(b.provider)]);
    a.text.insert(0, "hello");
    await until(() => b.text.toString() === "hello");
    b.text.insert(5, " world");
    a.text.insert(0, ">> ");
    await until(() => a.text.toString() === b.text.toString() && a.text.toString().includes("world"));
    expect(a.text.toString()).toBe(">> hello world");
    const c = client(port, "ed1");
    await synced(c.provider);
    expect(c.text.toString()).toBe(">> hello world");
  });

  it("viewer receives content but cannot write", async () => {
    const { port } = await start();
    const ed = client(port, "ed1");
    await synced(ed.provider);
    ed.text.insert(0, "secret plan");
    const v = client(port, "view");
    await until(() => v.text.toString() === "secret plan");
    v.text.insert(0, "HACK ");
    await new Promise((r) => setTimeout(r, 300));
    expect(ed.text.toString()).toBe("secret plan");
    const fresh = client(port, "ed2");
    await synced(fresh.provider);
    expect(fresh.text.toString()).toBe("secret plan");
  });

  it("rejects unauthenticated, bad-token, unauthorised, bad room, bad origin", async () => {
    const { port } = await start(new MemoryDocStore(), { allowedOrigins: ["https://app.example"] });
    expect(await rawConnect(port, [SUBPROTOCOL])).toEqual({ status: 401 });
    expect(await rawConnect(port, [SUBPROTOCOL, "bearer.bad"])).toEqual({ status: 401 });
    expect(await rawConnect(port, [SUBPROTOCOL, "bearer.nobody"])).toEqual({ status: 403 });
    expect(await rawConnect(port, ["other", "bearer.ed1"])).toEqual({ status: 400 });
    expect(await rawConnect(port, [SUBPROTOCOL, "bearer.ed1"], "note:../../etc")).toEqual({ status: 400 });
    expect(await rawConnect(port, [SUBPROTOCOL, "bearer.ed1"], "workspace:1")).toEqual({ status: 400 });
    expect(await rawConnect(port, [SUBPROTOCOL, "bearer.ed1"], ROOM, { Origin: "https://evil.example" })).toEqual({ status: 403 });
    expect(await rawConnect(port, [SUBPROTOCOL, "bearer.ed1"], ROOM, { Origin: "https://app.example" })).toEqual({ status: "open" });
  });

  it("never accepts a token in the URL query string", async () => {
    const { port } = await start();
    const r = await new Promise<number | string>((resolve) => {
      const ws = new WebSocket(`ws://127.0.0.1:${port}/collab/${ROOM}?token=ed1`, [SUBPROTOCOL]);
      ws.on("open", () => { ws.close(); resolve("open"); });
      ws.on("unexpected-response", (_q, res) => { resolve(res.statusCode!); res.destroy(); });
      ws.on("error", () => undefined);
    });
    expect(r).toBe(401);
  });

  it("closes connections that exceed the message size or rate limit", async () => {
    const { port } = await start(new MemoryDocStore(), { limits: { maxMessageBytes: 2048, maxMessagesPerSec: 5 } });
    const open = (): Promise<WebSocket> => new Promise((res) => {
      const ws = new WebSocket(`ws://127.0.0.1:${port}/collab/${ROOM}`, [SUBPROTOCOL, "bearer.ed1"]);
      ws.on("open", () => res(ws));
    });
    const big = await open();
    const closedBig = new Promise<number>((r) => big.on("close", (c) => r(c)));
    big.send(Buffer.alloc(5000, 1));
    expect(await closedBig).toBe(1009);
    const fast = await open();
    const closedFast = new Promise<number>((r) => fast.on("close", (c) => r(c)));
    for (let i = 0; i < 20; i++) fast.send(Buffer.from([0, 0, 1, 0])); // valid sync step1 frames
    expect(await closedFast).toBe(1008);
  });

  it("closes on garbage and drops unknown message types", async () => {
    const { port } = await start();
    const ws: WebSocket = await new Promise((res) => {
      const w = new WebSocket(`ws://127.0.0.1:${port}/collab/${ROOM}`, [SUBPROTOCOL, "bearer.ed1"]);
      w.on("open", () => res(w));
    });
    const closed = new Promise<number>((r) => ws.on("close", (c) => r(c)));
    ws.send(Buffer.from([9, 1, 2]));
    expect(await closed).toBe(1003);
  });

  it("persists across restart (file store) and compacts", async () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), "collab-"));
    cleanup.push(() => rmSync(dir, { recursive: true, force: true }));
    const s1 = await start(new FileDocStore(dir), { limits: { compactAfterUpdates: 3 } });
    const a = client(s1.port, "ed1");
    await synced(a.provider);
    for (let i = 0; i < 10; i++) a.text.insert(a.text.length, `line${i};`);
    await until(() => a.text.length > 0);
    await new Promise((r) => setTimeout(r, 300));
    a.provider.destroy();
    await s1.stop();

    const store2 = new FileDocStore(dir);
    const updates = await store2.load(ROOM);
    expect(updates.length).toBeGreaterThan(0);
    const s2 = await start(store2);
    const b = client(s2.port, "ed2");
    await synced(b.provider);
    expect(b.text.toString()).toBe(Array.from({ length: 10 }, (_, i) => `line${i};`).join(""));
    // after graceful shutdown the log is a single compacted snapshot
    await s2.stop();
    expect((await new FileDocStore(dir).load(ROOM)).length).toBe(1);
  });

  it("evicts idle rooms", async () => {
    const { port, collab } = await start(new MemoryDocStore(), { limits: { idleRoomMs: 50 } });
    const a = client(port, "ed1");
    await synced(a.provider);
    expect(collab.roomCount).toBe(1);
    a.provider.destroy();
    await until(() => true);
    await new Promise((r) => setTimeout(r, 150));
    await collab.sweep();
    expect(collab.roomCount).toBe(0);
  });

  it("revocation closes live connections and downgrade makes them read-only", async () => {
    const dyn: Record<string, ShareRole | null> = { ed1: "Editor", ed2: "Editor" };
    const { port, collab } = await start(new MemoryDocStore(), {
      access: { getRole: async (e) => dyn[e] ?? null },
      limits: { recheckMs: 50 },
    });
    const a = client(port, "ed1");
    const b = client(port, "ed2");
    await Promise.all([synced(a.provider), synced(b.provider)]);
    dyn.ed2 = "Viewer";
    await new Promise((r) => setTimeout(r, 200));
    b.text.insert(0, "nope");
    await new Promise((r) => setTimeout(r, 200));
    expect(a.text.toString()).toBe("");
    dyn.ed1 = null;
    await until(() => !a.provider.wsconnected, 3000);
    expect(collab.roomCount).toBe(1);
  });
});

describe("createAclAccessChecker", () => {
  it("resolves via the ACL and denies unknown notes / non-note rooms", async () => {
    const chk = createAclAccessChecker({
      loadChain: async (id) => (id === "n1" ? [{ type: "workspace", id: "w", ownerEmail: "o@x.io" }, { type: "note", id: "n1" }] : null),
      loadGrants: async () => [{ id: "g", resourceType: "workspace", resourceId: "w", principal: { type: "group", id: "eng" }, role: "Commenter" }],
      loadGroups: async (e) => (e === "a@x.io" ? ["eng"] : []),
    });
    expect(await chk.getRole("a@x.io", "note:n1")).toBe("Commenter");
    expect(await chk.getRole("b@x.io", "note:n1")).toBeNull();
    expect(await chk.getRole("o@x.io", "note:n1")).toBe("Owner");
    expect(await chk.getRole("a@x.io", "note:zzz")).toBeNull();
    expect(await chk.getRole("a@x.io", "workspace:w")).toBeNull();
  });
});
