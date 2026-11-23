import { describe, it, expect } from "vitest";
import { MemoryNoteStore } from "../server/noteStore";
import { SyncController, Persisted, SyncStorage } from "../src/core/syncController";
import { Transport } from "../src/core/syncEngine";
import { toSyncInput, canon, mergeIntoUi, applyUiChanges, adoptNewerEntries, unionLegacy } from "../src/core/uiBridge";
import { editNote, emptyState } from "../src/core/syncEngine";

type N = ReturnType<typeof mk>;
const mk = (id: string, over: Record<string, any> = {}) => ({
  id, workspaceId: "ws1", title: "T", content: "body", tags: [] as string[], isPinned: false, isShared: false,
  isFavorite: false, folder: "f-general", createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z",
  wordCount: 1, readingTime: 1, ...over,
});

const transportFor = (store: MemoryNoteStore, email = "u@x.io"): Transport => ({
  changes: (s, l) => store.changes(email, s, l),
  put: (n, r) => store.put(email, n, r),
  remove: (id, r) => store.remove(email, id, r),
});

const memStorage = (): SyncStorage & { data: Persisted | null } => {
  const s: any = {
    data: null,
    load: async () => (s.data ? structuredClone(s.data) : null),
    save: async (p: Persisted) => { s.data = structuredClone(p); },
    clear: async () => { s.data = null; },
  };
  return s;
};

/** A fake "device": a React-like notes list plus a controller wired to it. */
function device(store: MemoryNoteStore, opts: { storage?: SyncStorage; legacy?: any[] | null; initial?: N[] } = {}) {
  let ui: any[] = opts.initial ?? [];
  const events = { copies: 0, rejected: [] as any[], statuses: [] as string[] };
  const storage = opts.storage ?? memStorage();
  const c = new SyncController<any>({
    transport: transportFor(store),
    storage,
    fetchLegacy: async () => (opts.legacy === undefined ? [] : opts.legacy),
    getUi: () => ui,
    setUi: (u) => { ui = u(ui); },
    onStatus: (s) => events.statuses.push(s),
    onRejected: (r) => events.rejected.push(...r),
    onConflictCopies: (n) => { events.copies += n; },
  });
  return { c, storage, events, get ui() { return ui; }, set ui(v) { ui = v; } };
}

describe("toSyncInput", () => {
  it("is deterministic and strips legacy/Mongo extras", () => {
    const a = toSyncInput({ id: "a", title: "x", content: "one two", _id: "o", __v: 1, userEmail: "v@x.io" });
    expect(a).not.toHaveProperty("_id");
    expect(a).not.toHaveProperty("userEmail");
    expect(canon(a)).toBe(canon(toSyncInput({ id: "a", title: "x", content: "one two" })));
    expect(a.wordCount).toBe(2);
    expect(a.workspaceId).toBe("ws-aura-core");
  });
});

describe("applyUiChanges / mergeIntoUi", () => {
  it("detects edits, creations and removals, ignoring untouched notes", () => {
    const seen = new Map();
    let s = applyUiChanges(emptyState(), [mk("a"), mk("b")], seen);
    expect(Object.keys(s.entries).sort()).toEqual(["a", "b"]);
    s = { ...s, entries: Object.fromEntries(Object.entries(s.entries).map(([k, e]) => [k, { ...e, dirty: false, rev: 1, base: e.local }])) };
    const same = applyUiChanges(s, [mk("a"), mk("b")], seen); // new objects, same content
    expect(Object.values(same.entries).every((e) => !e.dirty)).toBe(true);
    const edited = applyUiChanges(s, [mk("a", { title: "new" })], seen); // b removed
    expect(edited.entries.a.dirty).toBe(true);
    expect(edited.entries.b.local).toBeNull();
  });

  it("keeps edits made while a sync was in flight", () => {
    const snapshot = [mk("a")];
    const current = [mk("a", { title: "typed during sync" })];
    const entries = { a: { base: toSyncInput(mk("a")), local: toSyncInput(mk("a", { title: "remote" })), rev: 2, dirty: false } };
    expect(mergeIntoUi(current, snapshot, entries)[0].title).toBe("typed during sync");
    expect(mergeIntoUi(snapshot, snapshot, entries)[0].title).toBe("remote");
  });

  it("does not resurrect notes the user deleted during the sync, but adds remote-new ones", () => {
    const entries = {
      a: { base: null, local: toSyncInput(mk("a")), rev: 1, dirty: false },
      n: { base: null, local: toSyncInput(mk("n")), rev: 1, dirty: false },
    };
    const out = mergeIntoUi([], [mk("a")], entries);
    expect(out.map((x) => x.id)).toEqual(["n"]);
  });
});

describe("adoptNewerEntries (stale cache guard)", () => {
  it("replaces only strictly older UI copies", () => {
    const e = toSyncInput(mk("a", { title: "newer", updatedAt: "2026-02-01T00:00:00.000Z" }));
    const entries = { a: { base: e, local: e, rev: 3, dirty: false } };
    const stale = adoptNewerEntries([mk("a", { title: "old" })], entries);
    expect(stale.list[0].title).toBe("newer");
    const fresh = adoptNewerEntries([mk("a", { title: "mine", updatedAt: "2026-03-01T00:00:00.000Z" })], entries);
    expect(fresh.list[0].title).toBe("mine");
  });
});

describe("unionLegacy", () => {
  it("imports missing and newer notes, strips Mongo fields, and is idempotent", () => {
    const cur = [mk("a")];
    const legacy = [{ ...mk("a", { updatedAt: "2026-05-01T00:00:00.000Z", title: "srv" }), _id: "x", userEmail: "u" }, mk("b")];
    const out = unionLegacy(cur, legacy);
    expect(out.find((n) => n.id === "a")!.title).toBe("srv");
    expect(out).toHaveLength(2);
    expect(out[0]).not.toHaveProperty("_id");
    expect(unionLegacy(out, legacy)).toBe(out);
  });
});

describe("SyncController", () => {
  it("syncs UI edits between two devices end to end", async () => {
    const store = new MemoryNoteStore();
    const A = device(store, { initial: [mk("a", { title: "first" })] });
    await A.c.syncNow();
    const B = device(store);
    await B.c.syncNow();
    expect(B.ui.map((n) => n.title)).toEqual(["first"]);

    B.ui = B.ui.map((n) => ({ ...n, title: "from B", updatedAt: "2026-02-01T00:00:00.000Z" }));
    await B.c.syncNow();
    await A.c.syncNow();
    expect(A.ui[0].title).toBe("from B");

    A.ui = []; // delete on A
    await A.c.syncNow();
    await B.c.syncNow();
    expect(B.ui).toHaveLength(0);
  });

  it("never loses a body edit made on two devices", async () => {
    const store = new MemoryNoteStore();
    const A = device(store, { initial: [mk("a")] });
    await A.c.syncNow();
    const B = device(store);
    await B.c.syncNow();

    A.ui = A.ui.map((n) => ({ ...n, content: "A text", updatedAt: "2026-02-01T00:00:00.000Z" }));
    B.ui = B.ui.map((n) => ({ ...n, content: "B text", updatedAt: "2026-02-02T00:00:00.000Z" }));
    await A.c.syncNow();
    await B.c.syncNow();
    const bodies = B.ui.map((n) => n.content).sort();
    expect(bodies).toEqual(["A text", "B text"]); // one live note + one conflict copy
    expect(B.events.copies).toBe(1);
    await B.c.syncNow(); // pushes the conflict copy
    await A.c.syncNow();
    expect(A.ui.map((n) => n.content).sort()).toEqual(["A text", "B text"]);
  });

  it("imports legacy notes once and persists state across restarts", async () => {
    const store = new MemoryNoteStore();
    const storage = memStorage();
    const d1 = device(store, { storage, legacy: [mk("old1"), mk("old2")] });
    await d1.c.syncNow();
    expect(d1.ui.map((n) => n.id).sort()).toEqual(["old1", "old2"]);
    expect(storage.data!.migrated).toBe(true);

    const d2 = device(store, { storage, legacy: [mk("ghost")], initial: d1.ui }); // restart
    await d2.c.syncNow();
    expect(d2.ui.map((n) => n.id).sort()).toEqual(["old1", "old2"]); // no re-import
    expect((await store.changes("u@x.io", 0, 10)).notes).toHaveLength(2);
  });

  it("retries legacy import when the legacy endpoint is unreachable", async () => {
    const store = new MemoryNoteStore();
    const storage = memStorage();
    const d = device(store, { storage, legacy: null, initial: [mk("a")] });
    await d.c.syncNow();
    expect(storage.data!.migrated).toBe(false);
  });

  it("keeps edits queued when offline and pushes them later", async () => {
    const store = new MemoryNoteStore();
    const storage = memStorage();
    let online = false;
    let ui: any[] = [mk("a")];
    const t = transportFor(store);
    const c = new SyncController<any>({
      transport: { ...t, changes: (...a) => (online ? t.changes(...a) : Promise.reject(new Error("offline"))), put: (...a) => (online ? t.put(...a) : Promise.reject(new Error("offline"))) },
      storage, fetchLegacy: async () => [], getUi: () => ui, setUi: (u) => { ui = u(ui); },
    });
    await c.syncNow();
    expect(c.pendingCount).toBe(1);
    expect((await store.changes("u@x.io", 0, 10)).notes).toHaveLength(0);
    online = true;
    await c.syncNow();
    expect(c.pendingCount).toBe(0);
    expect((await store.changes("u@x.io", 0, 10)).notes).toHaveLength(1);
  });

  it("reports server-rejected notes and does not retry them forever", async () => {
    const store = new MemoryNoteStore();
    const t = transportFor(store);
    let puts = 0;
    let ui: any[] = [mk("big")];
    const c = new SyncController<any>({
      transport: { ...t, put: async () => { puts++; return { status: "rejected", reason: "invalid content" }; } },
      storage: memStorage(), fetchLegacy: async () => [], getUi: () => ui, setUi: (u) => { ui = u(ui); },
      onRejected: () => {},
    });
    await c.syncNow();
    await c.syncNow();
    expect(puts).toBe(1);
    expect(c.pendingCount).toBe(0);
    expect(ui).toHaveLength(1); // still visible locally
  });

  it("does not overwrite newer remote edits with a stale UI cache after restart", async () => {
    const store = new MemoryNoteStore();
    const storage = memStorage();
    const A = device(store, { storage, initial: [mk("a")] });
    await A.c.syncNow();
    // Another device edits; this device pulls it (engine state persisted) ...
    const other = device(store);
    await other.c.syncNow();
    other.ui = other.ui.map((n) => ({ ...n, title: "remote edit", updatedAt: "2026-04-01T00:00:00.000Z" }));
    await other.c.syncNow();
    await A.c.syncNow();
    // ... but the UI cache on A is stale after a reload.
    const restarted = device(store, { storage, initial: [mk("a")] });
    await restarted.c.syncNow();
    expect(restarted.ui[0].title).toBe("remote edit");
    const { notes } = await store.changes("u@x.io", 0, 10);
    expect(notes[0].title).toBe("remote edit");
  });

  it("resetAndPull refuses to discard unsynced edits", async () => {
    const store = new MemoryNoteStore();
    const t = transportFor(store);
    let ui: any[] = [mk("a")];
    const c = new SyncController<any>({
      transport: { ...t, put: () => Promise.reject(new Error("offline")) },
      storage: memStorage(), fetchLegacy: async () => [], getUi: () => ui, setUi: (u) => { ui = u(ui); },
    });
    expect(await c.resetAndPull()).toBe(false);
    expect(ui).toHaveLength(1);
  });

  it("coalesces overlapping sync requests", async () => {
    const store = new MemoryNoteStore();
    const d = device(store, { initial: [mk("a")] });
    await Promise.all([d.c.syncNow(), d.c.syncNow(), d.c.syncNow()]);
    expect((await store.changes("u@x.io", 0, 10)).notes).toHaveLength(1);
  });
});
