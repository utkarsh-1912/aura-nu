/** Wires executor + tools + run store + workspace + AI for one user. Framework-free (testable). */
import { FlowExecutor } from "../../flow/executor";
import { LocalStorageRunStore, MemoryRunStore } from "../../flow/stores";
import { createToolRegistry } from "../../flow/tools";
import type { AiClient, FlowGraph, NoteRef, RunRecord, RunStore, TriggerInput, WorkspaceApi } from "../../flow/types";
import { createWorkspaceApi, StorageIdempotencyStore, type NoteLike, type WorkspaceBinding, type WriteEvent } from "./workspaceApi";
import type { FlowLibrary } from "./flowLibrary";

export interface FlowRuntimeOptions<N extends NoteLike = NoteLike> {
  email: string;
  storage: Pick<Storage, "getItem" | "setItem">;
  library: FlowLibrary;
  ai: AiClient;
  binding: Omit<WorkspaceBinding<N>, "idempotency" | "flowId">;
  store?: RunStore;
  onWrite?: (e: WriteEvent) => void;
  aiTimeoutMs?: number;
  sleep?: (ms: number) => Promise<void>;
}

export function createFlowRuntime<N extends NoteLike>(o: FlowRuntimeOptions<N>) {
  const store = o.store ?? new LocalStorageRunStore(`aura-flow-runs-${o.email}`, 50);
  const idem = new StorageIdempotencyStore(o.storage, `aura-flow-idem-${o.email}`);
  const cache = new Map<string, { ex: FlowExecutor; ws: WorkspaceApi }>();
  const tools = createToolRegistry();

  function executorFor(flowId: string) {
    let c = cache.get(flowId);
    if (!c) {
      const ws = createWorkspaceApi<N>({ ...o.binding, idempotency: idem, flowId, onWrite: (e) => { o.binding.onWrite?.(e); o.onWrite?.(e); } });
      const ex = new FlowExecutor({ store, tools, workspace: ws, ai: o.ai, resolveFlow: o.library.resolveFlow, aiTimeoutMs: o.aiTimeoutMs, sleep: o.sleep });
      c = { ex, ws };
      cache.set(flowId, c);
    }
    return c.ex;
  }

  return {
    store,
    executorFor,
    start(graph: FlowGraph, input: TriggerInput, opts: { dryRun?: boolean; startedBy?: string } = {}): Promise<RunRecord> {
      return executorFor(graph.id).start(graph, { input, dryRun: opts.dryRun, startedBy: opts.startedBy ?? o.email });
    },
    /** Resume runs left "running" by a crash/reload. Safe: writes dedupe on idempotency keys. */
    async recover(): Promise<RunRecord[]> {
      const out: RunRecord[] = [];
      for (const r of await store.listRuns()) if (r.status === "running") out.push(await executorFor(r.flowId).resume(r.id));
      return out;
    },
  };
}

export type FlowRuntime = ReturnType<typeof createFlowRuntime>;
export { MemoryRunStore };
export type { NoteRef };
