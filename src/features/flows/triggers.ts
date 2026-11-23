/**
 * Trigger runtime (pure core). Turns note diffs + schedules into flow runs while the app is open.
 * Features: per-flow enable, debounce, per-flow serialization, loop protection (self writes and
 * chain depth), rate limit, global kill switch. Timers are injectable so tests use fake timers.
 */
import type { FlowGraph, NoteRef, TriggerKind } from "../../flow/types";

export interface TriggerFlow { id: string; enabled: boolean; graph: FlowGraph }
export interface RunMeta { trigger: TriggerKind; chain: string[] }
export type StartRun = (flow: TriggerFlow, input: { note?: NoteRef; payload: Record<string, unknown> }, meta: RunMeta) => Promise<unknown>;

export type NoteEventType = "note.created" | "note.updated" | "note.tagged" | "folder.changed";
export interface NoteEvent { type: NoteEventType; note: NoteRef; addedTags?: string[]; fromFolder?: string }

export interface TriggerLogEntry { flowId: string; kind: "started" | "skipped" | "error" | "finished"; reason?: string; trigger?: TriggerKind }

export interface TriggerOptions {
  startRun: StartRun;
  debounceMs?: number;
  selfWriteWindowMs?: number;
  maxChain?: number;
  maxRunsPerMinute?: number;
  maxQueue?: number;
  now?: () => number;
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (h: unknown) => void;
  onLog?: (e: TriggerLogEntry) => void;
}

// ── cron-lite ──────────────────────────────────────────────────────────────

export type ScheduleSpec = { kind: "interval"; ms: number } | { kind: "cron"; fields: Set<number>[] };

const UNIT: Record<string, number> = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 };
const RANGES: [number, number][] = [[0, 59], [0, 23], [1, 31], [1, 12], [0, 6]];

function parseField(f: string, [lo, hi]: [number, number]): Set<number> | null {
  const out = new Set<number>();
  for (const part of f.split(",")) {
    const m = /^(\*|\d+)(?:\/(\d+))?$/.exec(part);
    if (!m) return null;
    const step = m[2] ? Number(m[2]) : 1;
    if (step < 1) return null;
    const start = m[1] === "*" ? lo : Number(m[1]);
    const end = m[1] === "*" || m[2] ? hi : start;
    if (start < lo || start > hi) return null;
    for (let v = start; v <= end; v += step) out.add(v);
  }
  return out;
}

/** config.every = "30s|15m|2h|1d" (min 10s) or config.cron = 5-field cron-lite (`*`, n, a,b, *\/n). */
export function parseSchedule(config: Record<string, string> | undefined): ScheduleSpec | null {
  const every = config?.every?.trim();
  if (every) {
    const m = /^(\d+)([smhd])$/.exec(every);
    if (!m) return null;
    const ms = Number(m[1]) * UNIT[m[2]];
    return ms >= 10_000 ? { kind: "interval", ms } : null;
  }
  const cron = config?.cron?.trim();
  if (!cron) return null;
  const parts = cron.split(/\s+/);
  if (parts.length !== 5) return null;
  const fields: Set<number>[] = [];
  for (let i = 0; i < 5; i++) { const f = parseField(parts[i], RANGES[i]); if (!f) return null; fields.push(f); }
  return { kind: "cron", fields };
}

/** Next fire time strictly after `from` (ms). Local time. Returns null when none within ~13 months. */
export function nextRun(spec: ScheduleSpec, from: number): number | null {
  if (spec.kind === "interval") return from + spec.ms;
  const d = new Date(from);
  d.setSeconds(0, 0);
  d.setMinutes(d.getMinutes() + 1);
  const [mi, ho, dom, mo, dow] = spec.fields;
  for (let i = 0; i < 600_000; i++) {
    if (mo.has(d.getMonth() + 1) && (dom.has(d.getDate()) && dow.has(d.getDay())) && ho.has(d.getHours()) && mi.has(d.getMinutes())) return d.getTime();
    // skip whole days/hours when impossible
    if (!mo.has(d.getMonth() + 1) || !dom.has(d.getDate()) || !dow.has(d.getDay())) { d.setHours(0, 0, 0, 0); d.setDate(d.getDate() + 1); }
    else if (!ho.has(d.getHours())) { d.setMinutes(0, 0, 0); d.setHours(d.getHours() + 1); }
    else d.setMinutes(d.getMinutes() + 1);
  }
  return null;
}

// ── engine ─────────────────────────────────────────────────────────────────

const key = (n: NoteRef) => JSON.stringify([n.title, n.content, n.tags, n.folder]);
const triggerOf = (g: FlowGraph) => g.nodes.find((n) => n.type === "trigger") as Extract<FlowGraph["nodes"][number], { type: "trigger" }> | undefined;

export class TriggerEngine {
  private flows: TriggerFlow[] = [];
  private killed = false;
  private prev: Map<string, NoteRef> | null = null;
  private selfWrites = new Map<string, { flows: Set<string>; at: number }>();
  private pending = new Map<string, { flow: TriggerFlow; ev: NoteEvent; chain: string[]; timer: unknown }>();
  private queues = new Map<string, { chain: () => Promise<void>; n: number }>();
  private sched = new Map<string, unknown>();
  private recent = new Map<string, number[]>();
  private o: Required<Omit<TriggerOptions, "onLog">> & { onLog?: TriggerOptions["onLog"] };

  constructor(opts: TriggerOptions) {
    this.o = {
      debounceMs: 2000, selfWriteWindowMs: 15_000, maxChain: 3, maxRunsPerMinute: 10, maxQueue: 20,
      now: Date.now, setTimer: (f, ms) => setTimeout(f, ms), clearTimer: (h) => clearTimeout(h as any), ...opts,
    } as any;
  }

  private log(e: TriggerLogEntry) { this.o.onLog?.(e); }

  setKillSwitch(on: boolean) {
    this.killed = on;
    if (on) { this.clearPending(); this.clearSchedules(); } else this.armSchedules();
  }
  isKilled() { return this.killed; }

  setFlows(flows: TriggerFlow[]) {
    this.flows = flows;
    for (const [id, p] of this.pending) if (!flows.some((f) => f.id === p.flow.id && f.enabled)) { this.o.clearTimer(p.timer); this.pending.delete(id); }
    this.clearSchedules();
    this.armSchedules();
  }

  dispose() { this.clearPending(); this.clearSchedules(); }
  private clearPending() { for (const p of this.pending.values()) this.o.clearTimer(p.timer); this.pending.clear(); }
  private clearSchedules() { for (const h of this.sched.values()) this.o.clearTimer(h); this.sched.clear(); }

  /** Called by the workspace API after every flow write. */
  recordSelfWrite(flowId: string, noteId: string, chain: string[] = []) {
    const cur = this.selfWrites.get(noteId);
    const flows = cur && this.o.now() - cur.at < this.o.selfWriteWindowMs ? cur.flows : new Set<string>();
    flows.add(flowId);
    for (const c of chain) flows.add(c);
    this.selfWrites.set(noteId, { flows, at: this.o.now() });
  }

  /** Manual runs bypass the enable switch but never the kill switch. */
  async runManual(flow: TriggerFlow, note?: NoteRef, payload: Record<string, unknown> = {}) {
    if (this.killed) { this.log({ flowId: flow.id, kind: "skipped", reason: "kill switch", trigger: "manual" }); return; }
    await this.enqueue(flow, { note, payload }, { trigger: "manual", chain: [flow.id] });
  }

  /** Feed the full current note list. The first call is a baseline and fires nothing. */
  ingestNotes(notes: NoteRef[]) {
    const cur = new Map(notes.map((n) => [n.id, n]));
    const prev = this.prev;
    this.prev = cur;
    if (!prev) return;
    for (const [id, n] of cur) {
      const o = prev.get(id);
      if (!o) { this.emit({ type: "note.created", note: n }); continue; }
      if (key(o) === key(n)) continue;
      const added = n.tags.filter((t) => !o.tags.includes(t));
      if (added.length) this.emit({ type: "note.tagged", note: n, addedTags: added });
      if (o.folder !== n.folder) this.emit({ type: "folder.changed", note: n, fromFolder: o.folder });
      if (o.title !== n.title || o.content !== n.content) this.emit({ type: "note.updated", note: n });
    }
  }

  private matches(flow: TriggerFlow, ev: NoteEvent): boolean {
    const t = triggerOf(flow.graph);
    if (!t || t.kind !== ev.type) return false;
    const c = t.config ?? {};
    if (c.folder && ev.note.folder !== c.folder) return false;
    if (c.tag) {
      if (ev.type === "note.tagged") { if (!ev.addedTags?.includes(c.tag)) return false; }
      else if (!ev.note.tags.includes(c.tag)) return false;
    }
    return true;
  }

  emit(ev: NoteEvent) {
    if (this.killed) return;
    const sw = this.selfWrites.get(ev.note.id);
    const selfFlows = sw && this.o.now() - sw.at < this.o.selfWriteWindowMs ? sw.flows : undefined;
    for (const flow of this.flows) {
      if (!flow.enabled || !this.matches(flow, ev)) continue;
      if (selfFlows?.has(flow.id)) { this.log({ flowId: flow.id, kind: "skipped", reason: "loop protection: change made by this flow", trigger: ev.type }); continue; }
      const chain = selfFlows ? [...selfFlows] : [];
      if (chain.length >= this.o.maxChain) { this.log({ flowId: flow.id, kind: "skipped", reason: "loop protection: chain too deep", trigger: ev.type }); continue; }
      const pk = `${flow.id}|${ev.note.id}|${ev.type}`;
      const old = this.pending.get(pk);
      if (old) this.o.clearTimer(old.timer);
      const timer = this.o.setTimer(() => {
        this.pending.delete(pk);
        if (this.killed) return;
        void this.enqueue(flow, { note: ev.note, payload: { event: ev.type, addedTags: ev.addedTags ?? [], fromFolder: ev.fromFolder ?? null } }, { trigger: ev.type, chain: [...chain, flow.id] });
      }, this.o.debounceMs);
      this.pending.set(pk, { flow, ev, chain, timer });
    }
  }

  private armSchedules() {
    if (this.killed) return;
    for (const flow of this.flows) {
      const t = triggerOf(flow.graph);
      if (!flow.enabled || t?.kind !== "schedule") continue;
      const spec = parseSchedule(t.config);
      if (!spec) { this.log({ flowId: flow.id, kind: "error", reason: "invalid schedule", trigger: "schedule" }); continue; }
      this.armOne(flow, spec);
    }
  }
  private armOne(flow: TriggerFlow, spec: ScheduleSpec) {
    const at = nextRun(spec, this.o.now());
    if (at === null) return;
    const step = () => {
      if (this.killed) return;
      const left = at - this.o.now();
      if (left > 1000) { this.sched.set(flow.id, this.o.setTimer(step, Math.min(left, 60_000))); return; }
      void this.enqueue(flow, { payload: { scheduledFor: new Date(at).toISOString() } }, { trigger: "schedule", chain: [flow.id] });
      this.armOne(flow, spec);
    };
    this.sched.set(flow.id, this.o.setTimer(step, Math.min(Math.max(at - this.o.now(), 0), 60_000)));
  }

  private rateOk(flowId: string) {
    const t = this.o.now();
    const arr = (this.recent.get(flowId) ?? []).filter((x) => t - x < 60_000);
    if (arr.length >= this.o.maxRunsPerMinute) { this.recent.set(flowId, arr); return false; }
    arr.push(t);
    this.recent.set(flowId, arr);
    return true;
  }

  /** Serializes runs per flow. */
  private enqueue(flow: TriggerFlow, input: { note?: NoteRef; payload: Record<string, unknown> }, meta: RunMeta): Promise<void> {
    const q = this.queues.get(flow.id) ?? { chain: () => Promise.resolve(), n: 0 };
    if (q.n >= this.o.maxQueue) { this.log({ flowId: flow.id, kind: "skipped", reason: "queue full", trigger: meta.trigger }); return Promise.resolve(); }
    if (!this.rateOk(flow.id)) { this.log({ flowId: flow.id, kind: "skipped", reason: "rate limit", trigger: meta.trigger }); return Promise.resolve(); }
    q.n++;
    const prevP = (q as any).p ?? Promise.resolve();
    const p: Promise<void> = prevP.then(async () => {
      if (this.killed) { this.log({ flowId: flow.id, kind: "skipped", reason: "kill switch", trigger: meta.trigger }); return; }
      this.log({ flowId: flow.id, kind: "started", trigger: meta.trigger });
      try { await this.o.startRun(flow, input, meta); this.log({ flowId: flow.id, kind: "finished", trigger: meta.trigger }); }
      catch (e) { this.log({ flowId: flow.id, kind: "error", reason: (e as Error).message, trigger: meta.trigger }); }
    }).finally(() => { q.n--; });
    (q as any).p = p;
    this.queues.set(flow.id, q);
    return p;
  }
}
