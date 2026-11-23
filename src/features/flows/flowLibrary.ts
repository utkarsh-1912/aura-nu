/** Per-user flow library persisted in `aura-flows-<email>`: drafts, versions (last 20), enable switches. */
import type { FlowGraph } from "../../flow/types";

export const MAX_VERSIONS = 20;

export interface FlowVersion { version: number; savedAt: string; label?: string; graph: FlowGraph }
export interface StoredFlow {
  id: string;
  enabled: boolean;
  graph: FlowGraph;
  versions: FlowVersion[];
  createdAt: string;
  updatedAt: string;
}
type StorageLike = Pick<Storage, "getItem" | "setItem">;

const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v));
export const flowsKey = (email: string) => `aura-flows-${email}`;
export const killSwitchKey = (email: string) => `aura-flows-killswitch-${email}`;

export class FlowLibrary {
  private flows: StoredFlow[] = [];
  private listeners = new Set<() => void>();

  constructor(private storage: StorageLike, readonly email: string, private now: () => string = () => new Date().toISOString()) {
    this.reload();
  }

  reload() {
    try {
      const raw = this.storage.getItem(flowsKey(this.email));
      const d = raw ? JSON.parse(raw) : null;
      this.flows = d && d.v === 1 && Array.isArray(d.flows) ? d.flows : [];
    } catch { this.flows = []; }
  }
  private persist() {
    try { this.storage.setItem(flowsKey(this.email), JSON.stringify({ v: 1, flows: this.flows })); } catch { /* quota */ }
    this.listeners.forEach((l) => l());
  }
  subscribe(fn: () => void) { this.listeners.add(fn); return () => { this.listeners.delete(fn); }; }

  list(): StoredFlow[] { return this.flows.map(clone); }
  get(id: string): StoredFlow | undefined { const f = this.flows.find((x) => x.id === id); return f ? clone(f) : undefined; }
  isKilled(): boolean { try { return this.storage.getItem(killSwitchKey(this.email)) === "1"; } catch { return false; } }
  setKilled(on: boolean) { try { this.storage.setItem(killSwitchKey(this.email), on ? "1" : "0"); } catch { /* ignore */ } this.listeners.forEach((l) => l()); }

  private uniqueId(base: string) {
    let id = base, i = 2;
    while (this.flows.some((f) => f.id === id)) id = `${base}_${i++}`;
    return id;
  }

  /** Adds a flow (id made unique). Starts disabled so nothing runs automatically until the user opts in. */
  create(graph: FlowGraph): StoredFlow {
    const g = clone(graph);
    g.id = this.uniqueId(g.id);
    const ts = this.now();
    const f: StoredFlow = { id: g.id, enabled: false, graph: g, versions: [], createdAt: ts, updatedAt: ts };
    this.flows.push(f);
    this.persist();
    return clone(f);
  }

  /** Autosave of the working copy: no version bump. */
  saveDraft(id: string, graph: FlowGraph) {
    const f = this.flows.find((x) => x.id === id);
    if (!f) return;
    f.graph = { ...clone(graph), id, version: f.graph.version };
    f.updatedAt = this.now();
    this.persist();
  }

  /** Snapshots the current graph into history and bumps the version. */
  commitVersion(id: string, label?: string): StoredFlow | undefined {
    const f = this.flows.find((x) => x.id === id);
    if (!f) return;
    f.versions.push({ version: f.graph.version, savedAt: this.now(), label, graph: clone(f.graph) });
    if (f.versions.length > MAX_VERSIONS) f.versions.splice(0, f.versions.length - MAX_VERSIONS);
    f.graph.version += 1;
    f.updatedAt = this.now();
    this.persist();
    return clone(f);
  }

  /** Restores an old version as a NEW version (history is never rewritten). */
  restore(id: string, version: number): StoredFlow | undefined {
    const f = this.flows.find((x) => x.id === id);
    const v = f?.versions.find((x) => x.version === version);
    if (!f || !v) return;
    const keepEnabled = f.enabled;
    this.commitVersion(id, `before rollback to v${version}`);
    f.graph = { ...clone(v.graph), id, version: f.graph.version };
    f.enabled = keepEnabled;
    this.persist();
    return clone(f);
  }

  rename(id: string, name: string) {
    const f = this.flows.find((x) => x.id === id);
    if (!f || !name.trim()) return;
    f.graph.name = name.trim();
    f.updatedAt = this.now();
    this.persist();
  }
  duplicate(id: string): StoredFlow | undefined {
    const f = this.flows.find((x) => x.id === id);
    if (!f) return;
    const g = clone(f.graph);
    g.name = `${g.name} (copy)`;
    g.version = 1;
    g.id = this.uniqueId(`${id}_copy`);
    return this.create(g);
  }
  remove(id: string) {
    this.flows = this.flows.filter((x) => x.id !== id);
    this.persist();
  }
  setEnabled(id: string, on: boolean) {
    const f = this.flows.find((x) => x.id === id);
    if (!f) return;
    f.enabled = on;
    this.persist();
  }
  /** Used by subflow nodes. */
  resolveFlow = async (flowId: string): Promise<FlowGraph | null> => this.get(flowId)?.graph ?? null;
}
