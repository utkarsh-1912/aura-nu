import * as Y from "yjs";
import { WebsocketProvider } from "y-websocket";
import { IndexeddbPersistence } from "y-indexeddb";
import type { Awareness } from "y-protocols/awareness";
import { BODY_KEY } from "./markdown";
import { makeLocalUser, setLocalUser } from "./presence";

export const SUBPROTOCOL = "aura-collab.v1";

/** Exponential backoff with full jitter; pure and injectable for tests. */
export function backoffDelay(attempt: number, opts: { baseMs?: number; maxMs?: number; rand?: () => number } = {}): number {
  const { baseMs = 250, maxMs = 15_000, rand = Math.random } = opts;
  const ceil = Math.min(maxMs, baseMs * 2 ** Math.min(attempt, 20));
  return Math.floor(ceil / 2 + (rand() * ceil) / 2);
}

export type CollabStatus = "connecting" | "connected" | "offline" | "denied" | "closed";

export interface NoteCollabOptions {
  noteId: string;
  /** e.g. wss://collab.example.com/collab. */
  serverUrl: string;
  /** Fresh Firebase ID token for each (re)connect; the token travels in Sec-WebSocket-Protocol, never the URL. */
  getToken: () => Promise<string | null>;
  user: { email: string; name?: string | null };
  /** Default true in browsers; set false in tests/SSR. */
  offlinePersistence?: boolean;
  WebSocketPolyfill?: typeof WebSocket;
  /** After this many consecutive failed connects (never opened) the provider stops and reports "denied". */
  maxDeniedAttempts?: number;
  onStatus?: (s: CollabStatus) => void;
  maxBackoffMs?: number;
}

export interface NoteCollab {
  doc: Y.Doc;
  text: Y.Text;
  awareness: Awareness;
  readonly status: CollabStatus;
  /** Resolves after first server sync (or immediately rejects if denied). */
  whenSynced: Promise<void>;
  /** Resolves when local IndexedDB state has loaded (immediately if persistence is off). */
  whenLocalLoaded: Promise<void>;
  destroy(): void;
}

export function roomForNote(noteId: string): string {
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(noteId)) throw new Error("invalid note id");
  return `note:${noteId}`;
}

export function createNoteCollab(opts: NoteCollabOptions): NoteCollab {
  const doc = new Y.Doc();
  const room = roomForNote(opts.noteId);
  const useIdb = opts.offlinePersistence ?? typeof indexedDB !== "undefined";
  const idb = useIdb ? new IndexeddbPersistence(`aura-collab-${room}`, doc) : null;
  const whenLocalLoaded: Promise<void> = idb ? idb.whenSynced.then(() => undefined) : Promise.resolve();

  const provider = new WebsocketProvider(opts.serverUrl, room, doc, {
    connect: false,
    protocols: [SUBPROTOCOL],
    WebSocketPolyfill: opts.WebSocketPolyfill ?? (typeof WebSocket !== "undefined" ? WebSocket : undefined),
    disableBc: false,
  } as any);
  setLocalUser(provider.awareness, makeLocalUser(opts.user.email, opts.user.name));

  let status: CollabStatus = "connecting";
  let attempt = 0;
  let failedBeforeOpen = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let destroyed = false;
  let handlingClose = false;
  let everSynced = false;
  const setStatus = (s: CollabStatus) => {
    if (status !== s) {
      status = s;
      opts.onStatus?.(s);
    }
  };

  let resolveSynced!: () => void;
  let rejectSynced!: (e: Error) => void;
  const whenSynced = new Promise<void>((res, rej) => {
    resolveSynced = res;
    rejectSynced = rej;
  });
  whenSynced.catch(() => undefined); // avoid unhandled rejection when nobody awaits

  async function connect() {
    if (destroyed) return;
    setStatus(everSynced ? "offline" : "connecting");
    let token: string | null = null;
    try {
      token = await opts.getToken();
    } catch {
      token = null;
    }
    if (destroyed) return;
    if (!token || !/^[A-Za-z0-9._~+-]+$/.test(token)) return scheduleReconnect(); // not signed in yet / token refresh failed: retry, never connect unauthenticated
    provider.protocols = [SUBPROTOCOL, `bearer.${token}`];
    provider.connect();
  }

  function scheduleReconnect() {
    if (destroyed) return;
    if (timer) clearTimeout(timer);
    timer = setTimeout(connect, backoffDelay(attempt++, { maxMs: opts.maxBackoffMs }));
  }

  provider.on("status", ({ status: s }: { status: string }) => {
    if (s === "connected") {
      attempt = 0;
      failedBeforeOpen = 0;
      setStatus("connected");
    }
  });
  provider.on("sync", (isSynced: boolean) => {
    if (isSynced) {
      everSynced = true;
      resolveSynced();
    }
  });
  provider.on("connection-close", () => {
    if (destroyed || handlingClose) return;
    handlingClose = true;
    try {
      onClose();
    } finally {
      handlingClose = false;
    }
  });
  function onClose() {
    // We own reconnection so every attempt gets a fresh token and bounded jittered backoff.
    const wasConnected = status === "connected";
    provider.disconnect();
    if (!wasConnected) {
      failedBeforeOpen++;
      if (failedBeforeOpen >= (opts.maxDeniedAttempts ?? 5)) {
        setStatus("denied");
        rejectSynced(new Error("collaboration access denied or unavailable"));
        return;
      }
    }
    setStatus(everSynced ? "offline" : "connecting");
    scheduleReconnect();
  }
  provider.on("connection-error", () => undefined);

  void connect();

  return {
    doc,
    text: doc.getText(BODY_KEY),
    awareness: provider.awareness,
    get status() {
      return status;
    },
    whenSynced,
    whenLocalLoaded,
    destroy() {
      if (destroyed) return;
      destroyed = true;
      if (timer) clearTimeout(timer);
      provider.destroy();
      void idb?.destroy();
      doc.destroy();
      setStatus("closed");
    },
  };
}
