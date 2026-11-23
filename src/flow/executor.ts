/**
 * Durable workflow executor.
 *
 * Durability model: the run's step journal (RunStore) is the source of truth. Execution is a
 * deterministic traversal of the graph; every unit of work has a stable step key
 * (scope path + node id). On resume the traversal is replayed and any step already completed
 * in the journal returns its recorded result without re-running — so a crash at any point loses
 * at most the one in-flight step, which is re-run under the SAME idempotency key.
 */
import type {
  AgentMessage, AgentNode, ActionNode, AiClient, ApprovalNode, Diff, FlowEdge, FlowGraph, FlowNode,
  CriticNode, JsonSchema, LoopNode, PortName, RunRecord, RunStatus, RunStore, StepRecord, SubflowNode, SupervisorNode, ToolName, TriggerInput, WorkspaceApi,
} from "./types";
import { FlowAiError } from "./types";
import { ExprError, evalExpr, exprRefs, renderDeep, renderString, templateRefs } from "./expr";
import { validateJson } from "./jsonschema";
import { hasErrors, validateFlow } from "./schema";
import { ToolRegistry, ToolDef, requiresApproval, validateToolArgs } from "./tools";

export interface ExecutorDeps {
  store: RunStore;
  tools: ToolRegistry;
  workspace: WorkspaceApi;
  ai: AiClient;
  resolveFlow?: (flowId: string) => Promise<FlowGraph | null>;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  newId?: () => string;
  /** Per AI call timeout (complete / agentStep). Default 60s. A timed-out call fails with code TIMEOUT. */
  aiTimeoutMs?: number;
}

export interface StartOptions {
  input?: TriggerInput;
  dryRun?: boolean;
  startedBy?: string;
}

export interface ApprovalDecision {
  approved: boolean;
  by: string;
  comment?: string;
  /** If provided, the decider must hold the role the step asks for. */
  deciderRoles?: string[];
}

class PauseSignal extends Error {}
class CancelSignal extends Error {}
class BudgetSignal extends Error {}
class FlowFailure extends Error {}
class NonRetryable extends Error {
  readonly nonRetryable = true;
}

const TERMINAL: RunStatus[] = ["completed", "failed", "cancelled", "budget_exceeded"];
const MAX_SUBFLOW_DEPTH = 3;
const DEFAULT_RETRY = { maxAttempts: 3, baseDelayMs: 500 };
const clone = <T,>(v: T): T => (v === undefined ? v : JSON.parse(JSON.stringify(v)));
const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e));
const isSignal = (e: unknown) => e instanceof PauseSignal || e instanceof CancelSignal || e instanceof BudgetSignal;

interface Scope {
  graph: FlowGraph;
  prefix: string;
  ctx: Record<string, unknown> & { trigger: Record<string, any>; nodes: Record<string, { output: unknown; port?: PortName }> };
  visited: Set<string>;
  tainted: Set<string>;
  triggerTainted: boolean;
  itemTainted: boolean;
  allowed: Set<string>;
  stopAt?: string;
  depth: number;
}

interface StepResult {
  output: unknown;
  port?: PortName;
  tokens?: number;
  diffs?: Diff[];
  input?: unknown;
}
interface StepMeta {
  nodeId: string;
  nodeType: StepRecord["nodeType"];
  title: string;
  retry?: { maxAttempts: number; baseDelayMs: number };
  tainted?: boolean;
  countStep?: boolean;
}

export class FlowExecutor {
  private now: () => number;
  private sleep: (ms: number) => Promise<void>;
  private newId: () => string;

  constructor(private deps: ExecutorDeps) {
    this.now = deps.now ?? Date.now;
    this.sleep = deps.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
    this.newId = deps.newId ?? (() => `run_${this.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`);
  }

  async start(graph: FlowGraph, opts: StartOptions = {}): Promise<RunRecord> {
    const issues = validateFlow(graph);
    if (hasErrors(issues)) throw new Error(`invalid flow: ${issues.filter((i) => i.severity === "error").map((i) => `${i.path}: ${i.message}`).join("; ")}`);
    const ts = new Date(this.now()).toISOString();
    const run: RunRecord = {
      id: this.newId(), flowId: graph.id, flowVersion: graph.version, graph: clone(graph), status: "running",
      dryRun: !!opts.dryRun, input: clone(opts.input ?? {}), startedBy: opts.startedBy ?? "unknown",
      startedAt: ts, updatedAt: ts, usage: { steps: 0, tokens: 0, activeMs: 0 },
    };
    await this.deps.store.createRun(run);
    return this.drive(run.id);
  }

  /** Continue a run after a crash or approval. Terminal runs are returned unchanged. */
  resume(runId: string): Promise<RunRecord> {
    return this.drive(runId);
  }

  async cancel(runId: string): Promise<RunRecord> {
    const run = await this.mustRun(runId);
    if (TERMINAL.includes(run.status)) return run;
    return this.deps.store.updateRun(runId, { status: "cancelled", endedAt: new Date(this.now()).toISOString(), error: "cancelled by user" });
  }

  async pendingApprovals(runId: string): Promise<StepRecord[]> {
    return (await this.deps.store.getSteps(runId)).filter((s) => s.status === "waiting");
  }

  async resolveApproval(runId: string, stepKey: string, d: ApprovalDecision): Promise<RunRecord> {
    const steps = await this.deps.store.getSteps(runId);
    const rec = steps.find((s) => s.key === stepKey);
    if (!rec || rec.status !== "waiting" || !rec.approval) throw new Error(`no pending approval '${stepKey}'`);
    if (d.deciderRoles && !d.deciderRoles.includes(rec.approval.role)) throw new Error(`decider lacks required role '${rec.approval.role}'`);
    rec.status = d.approved ? "approved" : "rejected";
    rec.approval = { ...rec.approval, decidedBy: d.by, comment: d.comment };
    rec.endedAt = new Date(this.now()).toISOString();
    await this.deps.store.putStep(rec);
    return this.drive(runId);
  }

  private async mustRun(id: string): Promise<RunRecord> {
    const r = await this.deps.store.getRun(id);
    if (!r) throw new Error(`run not found: ${id}`);
    return r;
  }

  private async drive(runId: string): Promise<RunRecord> {
    let run = await this.mustRun(runId);
    if (TERMINAL.includes(run.status)) return run;
    run = await this.deps.store.updateRun(runId, { status: "running" });
    const session = new Session(this, run, await this.deps.store.getSteps(runId));
    const finish = async (status: RunStatus, extra: Partial<RunRecord> = {}) => {
      const cur = await this.mustRun(runId);
      if (cur.status === "cancelled") return cur;
      return this.deps.store.updateRun(runId, { status, usage: session.usageNow(), ...(TERMINAL.includes(status) ? { endedAt: new Date(this.now()).toISOString() } : {}), ...extra });
    };
    try {
      await session.runRoot();
      return await finish("completed", { output: session.lastOutput });
    } catch (e) {
      if (e instanceof PauseSignal) return finish("paused_approval");
      if (e instanceof CancelSignal) return this.mustRun(runId);
      if (e instanceof BudgetSignal) return finish("budget_exceeded", { error: e.message });
      if (e instanceof FlowFailure) return finish("failed", { error: e.message });
      throw e; // infrastructure failure (e.g. store crash): run stays resumable
    }
  }

  /** @internal */
  get internals() {
    return { deps: this.deps, now: this.now, sleep: this.sleep };
  }
}

class Session {
  private steps = new Map<string, StepRecord>();
  private seq: number;
  private t0: number;
  private baseActive: number;
  lastOutput: unknown;
  private deps: ExecutorDeps;

  constructor(private ex: FlowExecutor, private run: RunRecord, existing: StepRecord[]) {
    this.deps = ex.internals.deps;
    for (const s of existing) this.steps.set(s.key, s);
    this.seq = existing.reduce((m, s) => Math.max(m, s.seq), 0);
    this.t0 = ex.internals.now();
    this.baseActive = run.usage.activeMs;
  }

  usageNow() {
    return { ...this.run.usage, activeMs: this.baseActive + (this.ex.internals.now() - this.t0) };
  }

  async runRoot(): Promise<void> {
    const g = this.run.graph;
    const trig = g.nodes.find((n) => n.type === "trigger")!;
    const input = this.run.input;
    const scope = this.newScope(g, "", { kind: (trig as any).kind, payload: input.payload ?? {}, note: input.note }, new Set(g.policy.allowedTools), 0);
    scope.triggerTainted = !!input.note || (trig as any).kind !== "manual";
    await this.walk(scope, [trig.id]);
  }

  private newScope(graph: FlowGraph, prefix: string, trigger: Record<string, unknown>, allowed: Set<string>, depth: number): Scope {
    return {
      graph, prefix, depth, allowed, visited: new Set(), tainted: new Set(), triggerTainted: false, itemTainted: false,
      ctx: { trigger, note: trigger.note, nodes: {} },
    };
  }

  /** Runs one AI call with an AbortSignal and a hard timeout; failures are typed (FlowAiError). */
  private async aiCall<T>(fn: (signal: AbortSignal) => Promise<T>): Promise<T> {
    const ms = this.deps.aiTimeoutMs ?? 60_000;
    const ac = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, rej) => {
      timer = setTimeout(() => { rej(new FlowAiError("TIMEOUT", `AI call timed out after ${ms}ms`)); ac.abort(); }, ms);
    });
    try {
      return await Promise.race([fn(ac.signal), timeout]);
    } catch (e) {
      if (e instanceof FlowAiError) throw e;
      if ((e as any)?.name === "AbortError") throw new FlowAiError("ABORTED", "AI call aborted");
      throw e;
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  /** complete() + schema validation (BAD_OUTPUT on failure). */
  private async aiComplete(req: { task: any; prompt: string; model?: string; schema?: JsonSchema; tainted?: boolean }) {
    const r = await this.aiCall((signal) => this.deps.ai.complete({ ...req, signal }));
    const tokens = (r.tokens?.input ?? 0) + (r.tokens?.output ?? 0);
    let data: unknown = r.text;
    if (req.schema) {
      data = r.json;
      if (data === undefined) { try { data = JSON.parse(r.text); } catch { /* validated below */ } }
      const bad = data === undefined ? ["model returned no JSON"] : validateJson(req.schema, data, "output");
      if (bad.length) throw new FlowAiError("BAD_OUTPUT", `AI output failed schema: ${bad.join("; ")}`);
    }
    return { text: r.text, data, tokens };
  }

  // ── journal ───────────────────────────────────────────────────────────────

  private async checkpoint() {
    const cur = await this.deps.store.getRun(this.run.id);
    if (cur?.status === "cancelled") throw new CancelSignal();
    const b = this.run.graph.budgets;
    const u = this.run.usage;
    if (u.steps >= b.maxSteps) throw new BudgetSignal(`step budget exhausted (${b.maxSteps})`);
    if (u.tokens >= b.maxTokens) throw new BudgetSignal(`token budget exhausted (${b.maxTokens})`);
    if (this.usageNow().activeMs > b.maxWallMs) throw new BudgetSignal(`wall-time budget exhausted (${b.maxWallMs}ms)`);
  }

  private mkRec(key: string, meta: StepMeta): StepRecord {
    return {
      key, runId: this.run.id, seq: ++this.seq, nodeId: meta.nodeId, nodeType: meta.nodeType, title: meta.title,
      status: "started", attempts: 0, tokens: 0, idempotencyKey: `${this.run.id}:${key}`, tainted: meta.tainted,
      startedAt: new Date(this.ex.internals.now()).toISOString(),
    };
  }

  private async step(key: string, meta: StepMeta, fn: (attempt: number) => Promise<StepResult>): Promise<StepRecord> {
    const existing = this.steps.get(key);
    if (existing && (existing.status === "completed" || existing.status === "failed")) return existing; // replay
    await this.checkpoint();
    const rec = existing ?? this.mkRec(key, meta);
    rec.status = "started";
    rec.attempts = 0; // a re-run after a crash restarts the retry budget (same idempotency key)
    this.steps.set(key, rec);
    await this.deps.store.putStep(rec);
    const policy = meta.retry ?? { maxAttempts: 1, baseDelayMs: 0 };
    let lastErr: unknown;
    let res: StepResult | undefined;
    while (rec.attempts < policy.maxAttempts) {
      rec.attempts++;
      try {
        res = await fn(rec.attempts);
        break;
      } catch (e) {
        if (isSignal(e)) throw e;
        lastErr = e;
        if ((e as any)?.nonRetryable || e instanceof ExprError || rec.attempts >= policy.maxAttempts) break;
        await this.ex.internals.sleep(policy.baseDelayMs * 2 ** (rec.attempts - 1));
      }
    }
    if (res) {
      Object.assign(rec, { status: "completed", output: clone(res.output), input: clone(res.input), port: res.port ?? "ok", tokens: res.tokens ?? 0, diffs: res.diffs, error: undefined });
    } else {
      Object.assign(rec, { status: "failed", error: errMsg(lastErr), port: "error" });
    }
    rec.endedAt = new Date(this.ex.internals.now()).toISOString();
    if (meta.countStep !== false) this.run.usage.steps++;
    this.run.usage.tokens += rec.tokens;
    this.run.usage = this.usageNow();
    // usage first: a crash between the two writes over-counts (safe) rather than under-counts
    await this.deps.store.updateRun(this.run.id, { usage: this.run.usage });
    await this.deps.store.putStep(rec);
    if ((rec.status as string) === "completed") this.lastOutput = rec.output;
    if (this.run.usage.tokens > this.run.graph.budgets.maxTokens) throw new BudgetSignal(`token budget exhausted (${this.run.graph.budgets.maxTokens})`);
    return rec;
  }

  /** Human gate. Throws PauseSignal until a decision is recorded. Returns true when approved. */
  private async gate(key: string, meta: { nodeId: string; role: string; reason: string; timeoutMs: number; title: string }): Promise<boolean> {
    if (this.run.dryRun) return true; // nothing is written in dry-run
    let rec = this.steps.get(key);
    const nowMs = this.ex.internals.now();
    if (!rec) {
      rec = this.mkRec(key, { nodeId: meta.nodeId, nodeType: "gate", title: meta.title });
      rec.status = "waiting";
      rec.approval = { role: meta.role, reason: meta.reason, requestedAt: new Date(nowMs).toISOString(), expiresAt: new Date(nowMs + meta.timeoutMs).toISOString() };
      this.steps.set(key, rec);
      await this.deps.store.putStep(rec);
      throw new PauseSignal();
    }
    if (rec.status === "approved") return true;
    if (rec.status === "rejected") return false;
    if (rec.status === "waiting") {
      if (rec.approval && nowMs > Date.parse(rec.approval.expiresAt)) {
        rec.status = "rejected";
        rec.approval = { ...rec.approval, decidedBy: "system", comment: "timed out" };
        rec.endedAt = new Date(nowMs).toISOString();
        await this.deps.store.putStep(rec);
        return false;
      }
      throw new PauseSignal();
    }
    return false;
  }

  // ── traversal ─────────────────────────────────────────────────────────────

  private edgesFrom(g: FlowGraph, id: string, port: PortName): FlowEdge[] {
    return g.edges.filter((e) => e.from === id && e.port === port);
  }

  private async walk(scope: Scope, starts: string[]): Promise<void> {
    const queue = [...starts];
    while (queue.length) {
      const id = queue.shift()!;
      if (id === scope.stopAt || scope.visited.has(id)) continue;
      scope.visited.add(id);
      const node = scope.graph.nodes.find((n) => n.id === id);
      if (!node) throw new FlowFailure(`node '${id}' not found`);
      const { port, rec } = await this.execNode(node, scope);
      if (rec.status === "failed" && this.edgesFrom(scope.graph, id, "error").length === 0) {
        throw new FlowFailure(`node '${id}' failed: ${rec.error}`);
      }
      for (const e of this.edgesFrom(scope.graph, id, port)) queue.push(e.to);
    }
  }

  private isTainted(refs: Set<string>, s: Scope): boolean {
    for (const r of refs) {
      if (r === "note" || r === "trigger") { if (s.triggerTainted) return true; }
      else if (r === "item" || r === "index") { if (s.itemTainted) return true; }
      else if (r === "nodes") { if (s.tainted.size) return true; }
      else if (r.startsWith("nodes.")) { if (s.tainted.has(r.slice(6))) return true; }
    }
    return false;
  }

  private async execNode(node: FlowNode, s: Scope): Promise<{ port: PortName; rec: StepRecord }> {
    const key = `${s.prefix}${node.id}`;
    const meta = (extra: Partial<StepMeta> = {}): StepMeta => ({ nodeId: node.id, nodeType: node.type, title: node.label ?? node.id, ...extra });
    let rec: StepRecord;
    switch (node.type) {
      case "trigger":
        rec = await this.step(key, meta(), async () => ({ output: { kind: node.kind, payload: s.ctx.trigger.payload ?? {}, note: s.ctx.note ?? null } }));
        if (s.triggerTainted) s.tainted.add(node.id);
        break;
      case "action": rec = await this.execAction(node, s, key, meta); break;
      case "ai": rec = await this.execAi(node, s, key, meta); break;
      case "agent": rec = await this.execAgent(node, s, key, meta); break;
      case "branch": {
        rec = await this.step(key, meta(), async () => {
          const raw = evalExpr(node.when, s.ctx);
          return { input: { when: node.when }, output: { value: !!raw, raw }, port: raw ? "true" : "false" };
        });
        break;
      }
      case "loop": return this.execLoop(node, s, key, meta);
      case "approval": return this.execApproval(node, s, key, meta);
      case "subflow": rec = await this.execSubflow(node, s, key, meta); break;
      case "critic": rec = await this.execCritic(node, s, key, meta); break;
      case "supervisor": rec = await this.execSupervisor(node, s, key, meta); break;
    }
    this.publish(node, s, rec);
    return { port: rec.status === "failed" ? "error" : (rec.port as PortName) ?? "ok", rec };
  }

  private publish(node: FlowNode, s: Scope, rec: StepRecord) {
    s.ctx.nodes[node.id] = { output: rec.status === "failed" ? { error: rec.error } : rec.output, port: rec.port };
    if (rec.tainted) s.tainted.add(node.id);
  }

  private async execAction(node: ActionNode, s: Scope, key: string, meta: (e?: Partial<StepMeta>) => StepMeta) {
    const tool = this.deps.tools[node.tool] as ToolDef | undefined;
    const tainted = this.isTainted(collectArgRefs(node.args), s);
    const outTainted = tainted || !!tool?.returnsUntrusted;
    const rec = await this.step(key, meta({ retry: node.retry ?? DEFAULT_RETRY, tainted: outTainted }), async () => {
      if (!tool) throw new NonRetryable(`unknown tool '${node.tool}'`);
      if (!s.allowed.has(node.tool)) throw new NonRetryable(`tool '${node.tool}' is not in the flow's allow-list`);
      const args = renderDeep(node.args, s.ctx);
      const bad = validateToolArgs(tool, args);
      if (bad.length) throw new NonRetryable(`invalid args: ${bad.join("; ")}`);
      if (requiresApproval(tool, tainted, s.graph.policy.requireApprovalForUntrusted)) {
        const ok = await this.gate(`${key}#gate`, { nodeId: node.id, role: "editor", title: `Approve ${node.tool}`, timeoutMs: 24 * 3_600_000, reason: `'${node.tool}' (${tool.risk} risk) was triggered by untrusted note content` });
        if (!ok) throw new NonRetryable("rejected by approver");
      }
      return this.callTool(tool, args, key);
    });
    return rec;
  }

  private async callTool(tool: ToolDef, args: unknown, key: string): Promise<StepResult> {
    const ctx = { idempotencyKey: `${this.run.id}:${key}`, runId: this.run.id, dryRun: this.run.dryRun };
    if (tool.writes && this.run.dryRun && tool.plan) {
      const p = await tool.plan(this.deps.workspace, args, ctx);
      return { input: args, output: p.result, diffs: p.diffs };
    }
    return { input: args, output: await tool.run(this.deps.workspace, args, ctx) };
  }

  private async execAi(node: Extract<FlowNode, { type: "ai" }>, s: Scope, key: string, meta: (e?: Partial<StepMeta>) => StepMeta) {
    const tainted = this.isTainted(templateRefs(node.prompt), s);
    return this.step(key, meta({ retry: node.retry ?? DEFAULT_RETRY, tainted }), async () => {
      const prompt = renderString(node.prompt, s.ctx);
      const r = await this.aiComplete({ task: node.task, prompt, model: node.model, schema: node.schema, tainted });
      return { input: { prompt, model: node.model, task: node.task }, output: { text: r.text, data: r.data }, tokens: r.tokens };
    });
  }

  private async execLoop(node: LoopNode, s: Scope, key: string, meta: (e?: Partial<StepMeta>) => StepMeta) {
    const g = s.graph;
    const limit = Math.min(node.maxIterations ?? g.budgets.maxLoopIterations, g.budgets.maxLoopIterations);
    const overTainted = this.isTainted(exprRefs(node.over), s);
    const rec = await this.step(key, meta({ tainted: overTainted }), async () => {
      const v = evalExpr(node.over, s.ctx);
      if (!Array.isArray(v)) throw new NonRetryable(`loop 'over' must evaluate to an array, got ${v === null ? "null" : typeof v}`);
      if (v.length > limit) throw new NonRetryable(`loop limit exceeded: ${v.length} items > ${limit}`);
      return { input: { over: node.over }, output: { count: v.length, items: v }, port: "true" };
    });
    this.publish(node, s, rec);
    if (rec.status === "failed") return { port: "error" as PortName, rec };
    const items = (rec.output as { items: unknown[] }).items;
    const results: Record<string, unknown>[] = [];
    const bodyStarts = this.edgesFrom(g, node.id, "true").map((e) => e.to);
    for (let i = 0; i < items.length; i++) {
      const child: Scope = {
        ...s, prefix: `${key}/i${i}/`, visited: new Set(), stopAt: node.id, itemTainted: overTainted,
        ctx: { ...s.ctx, item: items[i], index: i, nodes: { ...s.ctx.nodes } },
      };
      await this.walk(child, bodyStarts);
      const iter: Record<string, unknown> = {};
      for (const [id, v] of Object.entries(child.ctx.nodes)) if (s.ctx.nodes[id] !== v) iter[id] = v.output;
      results.push(iter);
      for (const id of child.tainted) s.tainted.add(id);
    }
    const done = await this.step(`${key}#done`, meta({ countStep: false, tainted: overTainted }), async () => ({ output: { count: items.length, results } }));
    s.ctx.nodes[node.id] = { output: done.output, port: "ok" };
    if (overTainted) s.tainted.add(node.id);
    return { port: "ok" as PortName, rec: done };
  }

  private async execApproval(node: ApprovalNode, s: Scope, key: string, meta: (e?: Partial<StepMeta>) => StepMeta) {
    const existing = this.steps.get(key);
    let rec: StepRecord;
    if (existing && (existing.status === "completed" || existing.status === "failed")) rec = existing;
    else {
      await this.checkpoint();
      const message = node.message ? renderString(node.message, s.ctx) : `Approval required from role '${node.role}'`;
      const ok = await this.gate(`${key}#approval`, { nodeId: node.id, role: node.role, reason: message, timeoutMs: node.timeoutMs, title: node.label ?? node.id });
      const g = this.steps.get(`${key}#approval`);
      rec = this.mkRec(key, meta());
      Object.assign(rec, {
        status: "completed", port: ok ? "ok" : "error", endedAt: new Date(this.ex.internals.now()).toISOString(),
        output: { approved: ok, decidedBy: g?.approval?.decidedBy ?? "dry-run", comment: g?.approval?.comment ?? null, reason: message },
      });
      this.steps.set(key, rec);
      await this.deps.store.putStep(rec);
    }
    this.publish(node, s, rec);
    if (rec.port === "error" && this.edgesFrom(s.graph, node.id, "error").length === 0) throw new FlowFailure(`approval '${node.id}' was rejected or timed out`);
    return { port: (rec.port as PortName) ?? "ok", rec };
  }

  private async execSubflow(node: SubflowNode, s: Scope, key: string, meta: (e?: Partial<StepMeta>) => StepMeta) {
    let failure: string | undefined;
    let sub: Scope | undefined;
    const done = this.steps.get(key);
    if (!(done && (done.status === "completed" || done.status === "failed"))) {
      try {
        if (s.depth >= MAX_SUBFLOW_DEPTH) throw new NonRetryable(`subflow depth limit (${MAX_SUBFLOW_DEPTH}) exceeded`);
        const gkey = `${key}#graph`;
        let graph = this.steps.get(gkey)?.output as FlowGraph | undefined;
        if (!graph) {
          const resolved = await this.deps.resolveFlow?.(node.flowId);
          if (!resolved) throw new NonRetryable(`subflow '${node.flowId}' not found`);
          const issues = validateFlow(resolved);
          if (hasErrors(issues)) throw new NonRetryable(`subflow '${node.flowId}' is invalid: ${issues[0].path}: ${issues[0].message}`);
          graph = clone(resolved);
          const g = this.mkRec(gkey, { nodeId: node.id, nodeType: "subflow", title: `load ${node.flowId}` });
          Object.assign(g, { status: "completed", output: graph, endedAt: g.startedAt });
          this.steps.set(gkey, g);
          await this.deps.store.putStep(g);
        }
        const payload: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(node.input ?? {})) payload[k] = renderDeep(v, s.ctx);
        const allowed = new Set([...graph.policy.allowedTools].filter((t) => s.allowed.has(t)));
        sub = this.newScope(graph, `${key}/sub/`, { kind: "subflow", payload, note: s.ctx.note }, allowed, s.depth + 1);
        sub.triggerTainted = this.isTainted(new Set(Object.values(node.input ?? {}).flatMap((t) => [...templateRefs(t)])), s) || s.triggerTainted;
        const trig = graph.nodes.find((n) => n.type === "trigger")!;
        await this.walk(sub, [trig.id]);
      } catch (e) {
        if (isSignal(e)) throw e;
        if (e instanceof FlowFailure || e instanceof NonRetryable) failure = e.message;
        else throw e;
      }
    }
    const rec = await this.step(key, meta({ tainted: !!sub && (sub.tainted.size > 0 || sub.triggerTainted) }), async () => {
      if (failure) throw new NonRetryable(failure);
      const outputs: Record<string, unknown> = {};
      for (const [id, v] of Object.entries(sub?.ctx.nodes ?? {})) outputs[id] = v.output;
      return { input: { flowId: node.flowId }, output: { nodes: outputs } };
    });
    return rec;
  }

  private async execCritic(node: CriticNode, s: Scope, key: string, meta: (e?: Partial<StepMeta>) => StepMeta) {
    const tainted = this.isTainted(new Set([...templateRefs(node.subject), ...templateRefs(node.criteria)]), s);
    return this.step(key, meta({ retry: node.retry ?? { maxAttempts: 2, baseDelayMs: 500 }, tainted }), async () => {
      const criteria = renderString(node.criteria, s.ctx);
      const subject = renderString(node.subject, s.ctx);
      const prompt = `You are an independent reviewer. Decide whether the PROPOSED CONTENT satisfies the CRITERIA. Be strict: approve only if every criterion is met.\n\nCRITERIA:\n${criteria}\n\nPROPOSED CONTENT:\n${subject}`;
      const r = await this.aiComplete({ task: "custom", prompt, schema: CRITIC_SCHEMA, tainted });
      const v = r.data as { approved: boolean; issues: string[] };
      return { input: { criteria, subject: subject.slice(0, 2000) }, output: { approved: v.approved, issues: v.issues, text: r.text }, port: v.approved ? "true" : "false", tokens: r.tokens };
    });
  }

  private async execSupervisor(node: SupervisorNode, s: Scope, key: string, meta: (e?: Partial<StepMeta>) => StepMeta) {
    const baseTainted = this.isTainted(new Set([...exprRefs(node.fanOut), ...templateRefs(node.goal), ...templateRefs(node.workerGoal)]), s);
    const done = this.steps.get(key);
    const settled = done && (done.status === "completed" || done.status === "failed");
    let failure: string | undefined;
    let anyTainted = baseTainted;
    const workers: { index: number; status: string; answer?: string; toolCalls?: unknown; error?: string }[] = [];
    let synthesis: string | undefined;
    if (!settled) {
      const plan = await this.step(`${key}#plan`, meta({ countStep: false, tainted: baseTainted }), async () => {
        const v = evalExpr(node.fanOut, s.ctx);
        if (!Array.isArray(v)) throw new NonRetryable(`supervisor 'fanOut' must evaluate to an array, got ${v === null ? "null" : typeof v}`);
        if (v.length > node.maxWorkers) throw new NonRetryable(`supervisor worker limit exceeded: ${v.length} items > ${node.maxWorkers}`);
        return { input: { fanOut: node.fanOut }, output: { items: v } };
      });
      if (plan.status === "failed") failure = plan.error;
      else {
        const items = (plan.output as { items: unknown[] }).items;
        const results: typeof workers = new Array(items.length);
        let next = 0;
        const signals: unknown[] = [];
        let fatal: unknown;
        const runWorker = async (i: number) => {
          const child: Scope = {
            ...s, visited: new Set(), tainted: new Set(s.tainted), itemTainted: baseTainted,
            ctx: { ...s.ctx, item: items[i], index: i, nodes: { ...s.ctx.nodes } },
          };
          const wnode: AgentNode = {
            id: node.id, type: "agent", agentId: `${node.id}.worker`, goal: node.workerGoal, instructions: node.workerInstructions,
            maxSteps: node.workerMaxSteps, tools: node.workerTools, mode: node.workerMode, retry: node.retry,
          };
          const rec = await this.execAgent(wnode, child, `${key}/w${i}`, (extra = {}) => ({ nodeId: node.id, nodeType: "agent", title: `${node.label ?? node.id}: worker ${i + 1}`, ...extra }));
          if (rec.tainted) anyTainted = true;
          const out = rec.output as { answer?: string; toolCalls?: unknown } | undefined;
          results[i] = rec.status === "failed" ? { index: i, status: "failed", error: rec.error } : { index: i, status: "completed", answer: out?.answer, toolCalls: out?.toolCalls };
        };
        const lane = async () => {
          for (;;) {
            if (signals.length || fatal) return;
            const i = next++;
            if (i >= items.length) return;
            try { await runWorker(i); } catch (e) { if (isSignal(e)) signals.push(e); else fatal = e; return; }
          }
        };
        await Promise.all(Array.from({ length: Math.min(node.concurrency, items.length) }, lane));
        if (fatal) throw fatal;
        if (signals.length) throw signals.find((e) => e instanceof CancelSignal) ?? signals.find((e) => e instanceof BudgetSignal) ?? signals[0];
        workers.push(...results);
        if (node.synthesize) {
          const syn = await this.step(`${key}#synth`, meta({ countStep: false, retry: node.retry ?? DEFAULT_RETRY, tainted: anyTainted }), async () => {
            const body = JSON.stringify(workers.map((w) => ({ index: w.index, status: w.status, answer: w.answer, error: w.error }))).slice(0, 20_000);
            const prompt = node.synthesisPrompt ? renderString(node.synthesisPrompt, { ...s.ctx, workers }) : `${renderString(node.goal, s.ctx)}\n\nCombine these worker results into one answer. Mention which results failed.\n\n${body}`;
            const r = await this.aiComplete({ task: "summarize", prompt, tainted: true });
            return { input: { workers: workers.length }, output: { text: r.text }, tokens: r.tokens };
          });
          if (syn.status === "failed") failure = `synthesis failed: ${syn.error}`;
          else synthesis = (syn.output as { text: string }).text;
        }
      }
    }
    return this.step(key, meta({ tainted: anyTainted }), async () => {
      if (failure) throw new NonRetryable(failure);
      return { input: { fanOut: node.fanOut, concurrency: node.concurrency }, output: { count: workers.length, workers, synthesis, text: synthesis } };
    });
  }

  private async execAgent(node: AgentNode, s: Scope, key: string, meta: (e?: Partial<StepMeta>) => StepMeta) {
    const goalRefs = templateRefs(node.goal);
    let tainted = this.isTainted(goalRefs, s) || (!!node.instructions && this.isTainted(templateRefs(node.instructions), s));
    let failure: string | undefined;
    let answer: string | undefined;
    const history: AgentMessage[] = [];
    const calls: { tool: string; args: unknown; status: string }[] = [];
    const existing = this.steps.get(key);
    const settled = existing && (existing.status === "completed" || existing.status === "failed");
    if (!settled) {
      const goal = renderString(node.goal, s.ctx);
      const specs = node.tools.filter((t) => s.allowed.has(t) && this.deps.tools[t]).map((t) => ({ name: t, description: this.deps.tools[t].description, schema: this.deps.tools[t].schema }));
      for (let i = 0; i < node.maxSteps && answer === undefined; i++) {
        const m = await this.step(`${key}/m${i}`, { nodeId: node.id, nodeType: "agent_model", title: `${node.label ?? node.id}: plan ${i + 1}`, retry: node.retry ?? { maxAttempts: 2, baseDelayMs: 500 } }, async () => {
          const r = await this.aiCall((signal) => this.deps.ai.agentStep({ goal, instructions: node.instructions, tools: specs, history: clone(history), signal, tainted }));
          return { input: { goal, historyLength: history.length }, output: r.action, tokens: (r.tokens?.input ?? 0) + (r.tokens?.output ?? 0) };
        });
        if (m.status === "failed") { failure = `model call failed: ${m.error}`; break; }
        const action = m.output as { type: string; tool?: string; args?: Record<string, unknown>; thought?: string; answer?: string };
        if (action.type === "final") { answer = String(action.answer ?? ""); break; }
        const toolName = String(action.tool);
        const args = action.args ?? {};
        history.push({ role: "assistant", tool: toolName, args, thought: action.thought });
        const tool = (node.tools as string[]).includes(toolName) && s.allowed.has(toolName) ? (this.deps.tools[toolName as ToolName] as ToolDef | undefined) : undefined;
        const t = await this.step(`${key}/t${i}`, { nodeId: node.id, nodeType: "agent_tool", title: `${toolName}`, retry: node.retry ?? { maxAttempts: 2, baseDelayMs: 500 }, tainted }, async () => {
          if (!tool) throw new NonRetryable(`tool '${toolName}' is not permitted for this agent`);
          const bad = validateToolArgs(tool, args);
          if (bad.length) throw new NonRetryable(`invalid args: ${bad.join("; ")}`);
          if (tool.writes && node.mode === "propose_only") {
            const p = tool.plan ? await tool.plan(this.deps.workspace, args, { idempotencyKey: `${this.run.id}:${key}/t${i}`, runId: this.run.id, dryRun: true }) : { diffs: [], result: { proposed: true } };
            return { input: args, output: { proposed: true, result: p.result }, diffs: p.diffs };
          }
          const needs = (tool.writes && node.mode === "approve_writes") || requiresApproval(tool, tainted, s.graph.policy.requireApprovalForUntrusted);
          if (needs) {
            const ok = await this.gate(`${key}/t${i}#gate`, { nodeId: node.id, role: "editor", title: `Approve ${toolName}`, timeoutMs: 24 * 3_600_000, reason: `agent '${node.agentId}' wants to run '${toolName}'${tainted ? " after reading untrusted note content" : ""}` });
            if (!ok) throw new NonRetryable("rejected by approver");
          }
          return this.callTool(tool, args, `${key}/t${i}`);
        });
        calls.push({ tool: toolName, args, status: t.status });
        if (tool?.returnsUntrusted) tainted = true;
        const content = t.status === "failed" ? `ERROR: ${t.error}` : JSON.stringify(t.output).slice(0, 4000);
        history.push({ role: "observation", tool: toolName, content });
      }
      if (!failure && answer === undefined) failure = `agent did not finish within ${node.maxSteps} steps`;
    }
    return this.step(key, meta({ tainted: tainted || this.isTainted(goalRefs, s) }), async () => {
      if (failure) throw new NonRetryable(failure);
      return { input: { goal: node.goal, mode: node.mode }, output: { answer, toolCalls: calls } };
    });
  }
}

const CRITIC_SCHEMA: JsonSchema = {
  type: "object", required: ["approved", "issues"], additionalProperties: false,
  properties: { approved: { type: "boolean" }, issues: { type: "array", maxItems: 20, items: { type: "string", maxLength: 500 } } },
};

function collectArgRefs(v: unknown, out = new Set<string>(), depth = 0): Set<string> {
  if (depth > 8) return out;
  if (typeof v === "string") templateRefs(v).forEach((r) => out.add(r));
  else if (Array.isArray(v)) v.forEach((x) => collectArgRefs(x, out, depth + 1));
  else if (v && typeof v === "object") Object.values(v).forEach((x) => collectArgRefs(x, out, depth + 1));
  return out;
}
