import { describe, it, expect } from "vitest";
import { createWorkspaceApi, MemoryIdempotencyStore, StorageIdempotencyStore, type NoteLike, type ReminderLike } from "../../src/features/flows/workspaceApi";
import { FlowLibrary, MAX_VERSIONS } from "../../src/features/flows/flowLibrary";
import { createFlowRuntime } from "../../src/features/flows/services";
import { MockAiClient } from "../../src/flow/mock";
import { emptyFlow } from "../../src/flow/schema";
import { dlpScan } from "../../src/flow/tools";
import type { FlowGraph } from "../../src/flow/types";

const mkStorage = () => { const m = new Map<string, string>(); return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) }; };
const note = (id: string, o: Partial<NoteLike> = {}): NoteLike => ({ id, title: id, content: "body " + id, tags: [], folder: "Inbox", updatedAt: "2020-01-01T00:00:00Z", ...o });

function bind(initial: NoteLike[], idem = new MemoryIdempotencyStore()) {
  const st = { notes: initial, reminders: [] as ReminderLike[], folders: [] as string[], writes: [] as any[] };
  const api = createWorkspaceApi({
    getNotes: () => st.notes, updateNotes: (n) => { st.notes = n; },
    getReminders: () => st.reminders, updateReminders: (r) => { st.reminders = r; },
    ensureFolder: (f) => { st.folders.push(f); }, idempotency: idem, flowId: "f1", workspaceId: "w", now: () => "2030-01-01T00:00:00Z",
    onWrite: (e) => { st.writes.push(e); },
  });
  return { st, api };
}

describe("real WorkspaceApi", () => {
  it("searches, hides trashed notes, filters by tag/folder", async () => {
    const { api } = bind([note("a", { tags: ["x"], title: "Budget" }), note("b", { isTrashed: true, title: "Budget old" }), note("c", { folder: "Work", title: "Budget plan" })]);
    expect((await api.searchNotes({ query: "budget" })).map((n) => n.id).sort()).toEqual(["a", "c"]);
    expect((await api.searchNotes({ query: "budget", tag: "x" })).map((n) => n.id)).toEqual(["a"]);
    expect((await api.searchNotes({ query: "", folder: "Work" })).map((n) => n.id)).toEqual(["c"]);
    expect(await api.getNote("b")).toBeNull();
  });
  it("writes through updateNotes with bumped updatedAt, tags, move, folders", async () => {
    const { api, st } = bind([note("a")]);
    await api.addTags("a", ["t1", "t1", "t2"], "k1");
    await api.moveNote("a", "Finance", "k2");
    await api.updateNote("a", { appendContent: " more" }, "k3");
    expect(st.notes[0]).toMatchObject({ tags: ["t1", "t2"], folder: "Finance", content: "body a more", updatedAt: "2030-01-01T00:00:00Z" });
    expect(st.folders).toEqual(["Finance"]);
    expect(st.writes.map((w) => w.op)).toEqual(["tag", "move", "update"]);
    expect(st.writes[0].flowId).toBe("f1");
  });
  it("dedupes every write on the idempotency key", async () => {
    const { api, st } = bind([note("a")]);
    const r1 = await api.createNote({ title: "N", content: "c" }, "kc");
    const r2 = await api.createNote({ title: "N", content: "c" }, "kc");
    expect(r1).toEqual(r2);
    await api.updateNote("a", { appendContent: "!" }, "ku");
    await api.updateNote("a", { appendContent: "!" }, "ku");
    await api.createReminder({ text: "r", date: "2030-01-01" }, "kr");
    await api.createReminder({ text: "r", date: "2030-01-01" }, "kr");
    expect(st.notes.filter((n) => n.title === "N")).toHaveLength(1);
    expect(st.notes.find((n) => n.id === "a")!.content).toBe("body a!");
    expect(st.reminders).toHaveLength(1);
  });
  it("never double-creates even if the ledger was lost (key-derived ids)", async () => {
    const { api, st } = bind([]);
    await api.createNote({ title: "N", content: "c" }, "same");
    const again = createWorkspaceApi({ getNotes: () => st.notes, updateNotes: (n) => { st.notes = n; }, idempotency: new MemoryIdempotencyStore() });
    await again.createNote({ title: "N", content: "c" }, "same");
    expect(st.notes).toHaveLength(1);
  });
  it("persisted ledger survives a reload", () => {
    const s = mkStorage();
    new StorageIdempotencyStore(s, "k").set("x", { id: 1 });
    expect(new StorageIdempotencyStore(s, "k").get("x")).toEqual({ id: 1 });
  });
  it("errors for missing notes; reminders need host support", async () => {
    const { api } = bind([]);
    await expect(api.addTags("zz", ["t"], "k")).rejects.toThrow(/not found/);
    const noRem = createWorkspaceApi({ getNotes: () => [], updateNotes: () => undefined, idempotency: new MemoryIdempotencyStore() });
    await expect(noRem.createReminder({ text: "r", date: "2030-01-01" }, "k")).rejects.toThrow(/reminders/);
  });
  it("uses the real DLP engine and never returns raw values", () => {
    const f = dlpScan("card 4111 1111 1111 1111 and ssn 123-45-6789 key AKIAABCDEFGHIJKLMNOP");
    expect(f.map((x) => x.type).sort()).toEqual(["aws-access-key", "credit-card", "ssn"]);
    expect(JSON.stringify(f)).not.toContain("4111 1111 1111 1111");
    expect(dlpScan("nothing here")).toEqual([]);
  });
});

describe("crash resume never double-writes", () => {
  it("resume after a lost final journal write reuses the idempotency key", async () => {
    const storage = mkStorage();
    const lib = new FlowLibrary(storage, "u@x.io");
    let notes: NoteLike[] = [note("n1")];
    const g: FlowGraph = { ...emptyFlow("f1", "F"), nodes: [{ id: "trigger", type: "trigger", kind: "manual" }, { id: "mk", type: "action", tool: "create_note", args: { title: "T", content: "C" } }], edges: [{ id: "e", from: "trigger", port: "ok", to: "mk" }] };
    const rt = createFlowRuntime({ email: "u@x.io", storage, library: lib, ai: new MockAiClient(), binding: { getNotes: () => notes, updateNotes: (n) => { notes = n; } } });
    const run = await rt.start(g, {});
    expect(run.status).toBe("completed");
    const steps = await rt.store.getSteps(run.id);
    await rt.store.putStep({ ...steps.find((s) => s.nodeId === "mk")!, status: "started" });
    await rt.store.updateRun(run.id, { status: "running" });
    const rec = await rt.recover();
    expect(rec[0].status).toBe("completed");
    expect(notes.filter((n) => n.title === "T")).toHaveLength(1);
  });
});

describe("FlowLibrary", () => {
  const g = (id = "f1") => emptyFlow(id, "Flow");
  it("persists per user, versions, caps at 20 and restores as a new version", () => {
    const s = mkStorage();
    const lib = new FlowLibrary(s, "a@x.io");
    lib.create(g());
    for (let i = 0; i < 25; i++) { lib.saveDraft("f1", { ...lib.get("f1")!.graph, name: `n${i}` }); lib.commitVersion("f1", `c${i}`); }
    const f = lib.get("f1")!;
    expect(f.versions).toHaveLength(MAX_VERSIONS);
    expect(f.graph.version).toBe(26);
    const oldest = f.versions[0];
    lib.restore("f1", oldest.version);
    const r = lib.get("f1")!;
    expect(r.graph.name).toBe(oldest.graph.name);
    expect(r.graph.version).toBe(27);
    expect(new FlowLibrary(s, "a@x.io").list()).toHaveLength(1);
    expect(new FlowLibrary(s, "b@x.io").list()).toHaveLength(0);
  });
  it("duplicate / rename / delete / enable / kill switch / resolveFlow", async () => {
    const lib = new FlowLibrary(mkStorage(), "a@x.io");
    lib.create(g());
    const d = lib.duplicate("f1")!;
    expect(d.id).not.toBe("f1");
    expect(d.graph.name).toBe("Flow (copy)");
    expect(d.enabled).toBe(false);
    lib.rename("f1", "Renamed");
    expect(lib.get("f1")!.graph.name).toBe("Renamed");
    lib.setEnabled("f1", true);
    expect(lib.get("f1")!.enabled).toBe(true);
    expect((await lib.resolveFlow("f1"))?.name).toBe("Renamed");
    lib.setKilled(true);
    expect(lib.isKilled()).toBe(true);
    lib.remove(d.id);
    expect(lib.list()).toHaveLength(1);
    expect(await lib.resolveFlow("nope")).toBeNull();
  });
  it("tolerates corrupt storage", () => {
    const s = mkStorage(); s.setItem("aura-flows-a@x.io", "{oops");
    expect(new FlowLibrary(s, "a@x.io").list()).toEqual([]);
  });
});
