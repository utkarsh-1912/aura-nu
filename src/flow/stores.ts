import type { RunRecord, RunStore, StepRecord } from "./types";

const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v));

/** In-memory RunStore. Values are JSON-cloned so it behaves like a real persistent store. */
export class MemoryRunStore implements RunStore {
  protected runs = new Map<string, RunRecord>();
  protected steps = new Map<string, Map<string, StepRecord>>();

  protected async changed(): Promise<void> {}

  async createRun(run: RunRecord) {
    this.runs.set(run.id, clone(run));
    this.steps.set(run.id, new Map());
    await this.changed();
  }
  async getRun(id: string) {
    const r = this.runs.get(id);
    return r ? clone(r) : null;
  }
  async updateRun(id: string, patch: Partial<RunRecord>) {
    const cur = this.runs.get(id);
    if (!cur) throw new Error(`run not found: ${id}`);
    const next = { ...cur, ...clone(patch), updatedAt: new Date().toISOString() } as RunRecord;
    this.runs.set(id, next);
    await this.changed();
    return clone(next);
  }
  async putStep(step: StepRecord) {
    const m = this.steps.get(step.runId);
    if (!m) throw new Error(`run not found: ${step.runId}`);
    m.set(step.key, clone(step));
    await this.changed();
  }
  async getSteps(runId: string) {
    return [...(this.steps.get(runId)?.values() ?? [])].sort((a, b) => a.seq - b.seq).map(clone);
  }
  async listRuns(flowId?: string) {
    return [...this.runs.values()]
      .filter((r) => !flowId || r.flowId === flowId)
      .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
      .map(clone);
  }
}

/** Browser persistence (best-effort; keeps the newest runs only). */
export class LocalStorageRunStore extends MemoryRunStore {
  constructor(private storageKey = "aura.flow.runs.v1", private maxRuns = 30) {
    super();
    try {
      const raw = typeof localStorage !== "undefined" ? localStorage.getItem(storageKey) : null;
      if (raw) {
        const data = JSON.parse(raw) as { runs: RunRecord[]; steps: StepRecord[] };
        for (const r of data.runs) { this.runs.set(r.id, r); this.steps.set(r.id, new Map()); }
        for (const s of data.steps) this.steps.get(s.runId)?.set(s.key, s);
      }
    } catch { /* corrupt or unavailable storage: start empty */ }
  }

  protected async changed() {
    try {
      const keep = [...this.runs.values()].sort((a, b) => b.startedAt.localeCompare(a.startedAt)).slice(0, this.maxRuns);
      const ids = new Set(keep.map((r) => r.id));
      for (const id of [...this.runs.keys()]) if (!ids.has(id)) { this.runs.delete(id); this.steps.delete(id); }
      const steps = keep.flatMap((r) => [...(this.steps.get(r.id)?.values() ?? [])]);
      localStorage.setItem(this.storageKey, JSON.stringify({ runs: keep, steps }));
    } catch { /* quota / private mode: in-memory only */ }
  }
}
