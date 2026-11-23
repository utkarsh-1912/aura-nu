import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { TriggerEngine, nextRun, parseSchedule, type TriggerFlow } from "../../src/features/flows/triggers";
import { emptyFlow } from "../../src/flow/schema";
import type { NoteRef, TriggerKind } from "../../src/flow/types";

const n = (id: string, o: Partial<NoteRef> = {}): NoteRef => ({ id, title: id, content: "c", tags: [], folder: "Inbox", ...o });
const flow = (id: string, kind: TriggerKind, config?: Record<string, string>, enabled = true): TriggerFlow => {
  const g = emptyFlow(id, id);
  g.nodes[0] = { id: "trigger", type: "trigger", kind, config };
  return { id, enabled, graph: g };
};

let runs: { flow: string; note?: string; trigger: string; chain: string[] }[];
let logs: any[];
const mk = (extra: any = {}) => new TriggerEngine({
  debounceMs: 1000, startRun: async (f, input, meta) => { runs.push({ flow: f.id, note: input.note?.id, trigger: meta.trigger, chain: meta.chain }); },
  onLog: (e) => logs.push(e), ...extra,
});

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date(2030, 0, 1, 8, 0, 0)); runs = []; logs = []; });
afterEach(() => vi.useRealTimers());

describe("cron-lite", () => {
  it("parses and rejects", () => {
    expect(parseSchedule({ every: "15m" })).toEqual({ kind: "interval", ms: 900_000 });
    expect(parseSchedule({ every: "1s" })).toBeNull();
    expect(parseSchedule({ cron: "0 9 * * 1" })).not.toBeNull();
    expect(parseSchedule({ cron: "99 9 * * *" })).toBeNull();
    expect(parseSchedule({ cron: "bad" })).toBeNull();
    expect(parseSchedule({})).toBeNull();
  });
  it("computes next fire times (local time)", () => {
    const from = new Date(2030, 0, 1, 8, 0, 0).getTime(); // Tue Jan 1 2030
    const d = (t: number | null) => new Date(t!);
    expect(d(nextRun(parseSchedule({ cron: "30 9 * * *" })!, from)).getHours()).toBe(9);
    expect(d(nextRun(parseSchedule({ cron: "*/15 * * * *" })!, from)).getMinutes()).toBe(15);
    const mon = d(nextRun(parseSchedule({ cron: "0 9 * * 1" })!, from));
    expect([mon.getDay(), mon.getHours(), mon.getDate()]).toEqual([1, 9, 7]);
    expect(nextRun({ kind: "interval", ms: 5000 }, from)).toBe(from + 5000);
  });
});

describe("note events", () => {
  it("baseline fires nothing; created/updated/tagged/folder events match configs", async () => {
    const e = mk();
    e.setFlows([flow("c", "note.created", { folder: "Inbox" }), flow("u", "note.updated"), flow("t", "note.tagged", { tag: "meeting" }), flow("f", "folder.changed", { folder: "Finance" })]);
    e.ingestNotes([n("a")]);
    await vi.advanceTimersByTimeAsync(5000);
    expect(runs).toEqual([]);
    e.ingestNotes([n("a"), n("b")]);
    await vi.advanceTimersByTimeAsync(1000);
    expect(runs.map((r) => r.flow)).toEqual(["c"]);
    runs = [];
    e.ingestNotes([n("a", { content: "new" }), n("b")]);
    await vi.advanceTimersByTimeAsync(1000);
    expect(runs.map((r) => r.flow)).toEqual(["u"]);
    runs = [];
    e.ingestNotes([n("a", { content: "new", tags: ["other"] }), n("b")]);
    await vi.advanceTimersByTimeAsync(1000);
    expect(runs).toEqual([]);
    e.ingestNotes([n("a", { content: "new", tags: ["other", "meeting"], folder: "Finance" }), n("b")]);
    await vi.advanceTimersByTimeAsync(1000);
    expect(runs.map((r) => r.flow).sort()).toEqual(["f", "t"]);
  });
  it("debounces bursts into one run per note with the latest snapshot", async () => {
    const e = mk();
    e.setFlows([flow("u", "note.updated")]);
    e.ingestNotes([n("a")]);
    for (let i = 1; i <= 5; i++) { e.ingestNotes([n("a", { content: `v${i}` })]); await vi.advanceTimersByTimeAsync(300); }
    expect(runs).toEqual([]);
    await vi.advanceTimersByTimeAsync(1000);
    expect(runs).toHaveLength(1);
  });
  it("disabled flows never fire; enabling later does", async () => {
    const e = mk();
    e.setFlows([flow("u", "note.updated", undefined, false)]);
    e.ingestNotes([n("a")]);
    e.ingestNotes([n("a", { content: "x" })]);
    await vi.advanceTimersByTimeAsync(2000);
    expect(runs).toEqual([]);
    e.setFlows([flow("u", "note.updated", undefined, true)]);
    e.ingestNotes([n("a", { content: "y" })]);
    await vi.advanceTimersByTimeAsync(2000);
    expect(runs).toHaveLength(1);
  });
  it("kill switch drops pending and blocks new runs (including manual)", async () => {
    const e = mk();
    e.setFlows([flow("u", "note.updated"), flow("s", "schedule", { every: "10s" })]);
    e.ingestNotes([n("a")]);
    e.ingestNotes([n("a", { content: "x" })]);
    e.setKillSwitch(true);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(runs).toEqual([]);
    await e.runManual(flow("u", "manual"));
    expect(runs).toEqual([]);
    expect(logs.some((l) => l.reason === "kill switch")).toBe(true);
    e.setKillSwitch(false);
    await vi.advanceTimersByTimeAsync(11_000);
    expect(runs.some((r) => r.flow === "s")).toBe(true);
  });
});

describe("loop protection", () => {
  it("a flow's own writes do not retrigger itself, other flows still see them", async () => {
    const e = mk();
    e.setFlows([flow("a", "note.updated"), flow("b", "note.updated")]);
    e.ingestNotes([n("x")]);
    e.recordSelfWrite("a", "x");
    e.ingestNotes([n("x", { content: "written by a" })]);
    await vi.advanceTimersByTimeAsync(1000);
    expect(runs.map((r) => r.flow)).toEqual(["b"]);
    expect(runs[0].chain).toEqual(["a", "b"]);
    expect(logs.some((l) => l.flowId === "a" && /loop protection/.test(l.reason))).toBe(true);
  });
  it("chain depth limit stops A -> B -> C -> D cascades", async () => {
    const e = mk({ maxChain: 3 });
    e.setFlows([flow("d", "note.updated")]);
    e.ingestNotes([n("x")]);
    e.recordSelfWrite("a", "x", ["b", "c"]);
    e.ingestNotes([n("x", { content: "y" })]);
    await vi.advanceTimersByTimeAsync(1000);
    expect(runs).toEqual([]);
    expect(logs.some((l) => /chain too deep/.test(l.reason))).toBe(true);
  });
  it("self-write protection expires", async () => {
    const e = mk({ selfWriteWindowMs: 5000 });
    e.setFlows([flow("a", "note.updated")]);
    e.ingestNotes([n("x")]);
    e.recordSelfWrite("a", "x");
    await vi.advanceTimersByTimeAsync(6000);
    e.ingestNotes([n("x", { content: "user edit" })]);
    await vi.advanceTimersByTimeAsync(1000);
    expect(runs).toHaveLength(1);
  });
});

describe("schedule", () => {
  it("fires on interval and keeps re-arming; stops when flow removed", async () => {
    const e = mk();
    e.setFlows([flow("s", "schedule", { every: "30s" })]);
    await vi.advanceTimersByTimeAsync(95_000);
    expect(runs.filter((r) => r.trigger === "schedule")).toHaveLength(3);
    e.setFlows([]);
    await vi.advanceTimersByTimeAsync(120_000);
    expect(runs).toHaveLength(3);
  });
  it("cron fires at the next matching minute", async () => {
    const e = mk();
    e.setFlows([flow("s", "schedule", { cron: "30 8 * * *" })]);
    await vi.advanceTimersByTimeAsync(29 * 60_000);
    expect(runs).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(2 * 60_000);
    expect(runs).toHaveLength(1);
  });
  it("invalid schedule is logged, not armed", async () => {
    const e = mk();
    e.setFlows([flow("s", "schedule", { cron: "nope" })]);
    await vi.advanceTimersByTimeAsync(120_000);
    expect(runs).toEqual([]);
    expect(logs.some((l) => l.reason === "invalid schedule")).toBe(true);
  });
});

describe("throttling and serialization", () => {
  it("rate limits runaway flows", async () => {
    const e = mk({ maxRunsPerMinute: 2, debounceMs: 10 });
    e.setFlows([flow("u", "note.updated")]);
    e.ingestNotes([n("a")]);
    for (let i = 0; i < 5; i++) { e.ingestNotes([n("a", { content: `v${i}` })]); await vi.advanceTimersByTimeAsync(50); }
    expect(runs).toHaveLength(2);
    expect(logs.some((l) => l.reason === "rate limit")).toBe(true);
  });
  it("runs of one flow are serialized", async () => {
    let active = 0, peak = 0;
    const e = new TriggerEngine({ debounceMs: 10, startRun: async () => { active++; peak = Math.max(peak, active); await new Promise((r) => setTimeout(r, 100)); active--; } });
    e.setFlows([flow("u", "note.updated")]);
    e.ingestNotes([n("a"), n("b")]);
    e.ingestNotes([n("a", { content: "1" }), n("b", { content: "1" })]);
    await vi.advanceTimersByTimeAsync(1000);
    expect(peak).toBe(1);
  });
  it("a failing run is logged and does not wedge the queue", async () => {
    const e = new TriggerEngine({ debounceMs: 10, startRun: async () => { throw new Error("boom"); }, onLog: (l) => logs.push(l) });
    e.setFlows([flow("u", "note.updated")]);
    e.ingestNotes([n("a")]);
    e.ingestNotes([n("a", { content: "1" })]);
    await vi.advanceTimersByTimeAsync(100);
    e.ingestNotes([n("a", { content: "2" })]);
    await vi.advanceTimersByTimeAsync(100);
    expect(logs.filter((l) => l.kind === "error")).toHaveLength(2);
  });
});
