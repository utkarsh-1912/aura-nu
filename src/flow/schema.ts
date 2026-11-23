import type {
  AgentMode,
  FlowBudgets,
  FlowEdge,
  FlowGraph,
  FlowNode,
  FlowPolicy,
  NodeType,
  PortName,
  ToolName,
  TriggerKind,
  ValidationIssue,
} from "./types";
import { FLOW_SCHEMA_VERSION, TOOL_NAMES } from "./types";
import { checkExpr, checkTemplate } from "./expr";
import type { AgentDefinition } from "../types";

export const DEFAULT_BUDGETS: FlowBudgets = { maxSteps: 200, maxTokens: 100_000, maxWallMs: 5 * 60_000, maxLoopIterations: 50 };
export const BUDGET_CEILINGS: FlowBudgets = { maxSteps: 10_000, maxTokens: 5_000_000, maxWallMs: 24 * 3_600_000, maxLoopIterations: 1_000 };

export const NODE_PORTS: Record<NodeType, PortName[]> = {
  trigger: ["ok"],
  action: ["ok", "error"],
  ai: ["ok", "error"],
  agent: ["ok", "error"],
  branch: ["true", "false", "error"],
  loop: ["true", "ok", "error"],
  approval: ["ok", "error"],
  subflow: ["ok", "error"],
  supervisor: ["ok", "error"],
  critic: ["true", "false", "error"],
};

const NODE_TYPES = Object.keys(NODE_PORTS) as NodeType[];
const TRIGGER_KINDS: TriggerKind[] = ["manual", "note.created", "note.updated", "note.tagged", "note.published", "schedule", "webhook", "folder.changed"];
const AI_TASKS = ["summarize", "extract", "classify", "rewrite", "embed", "custom"];
const AGENT_MODES: AgentMode[] = ["act", "approve_writes", "propose_only"];
const ID_RE = /^[A-Za-z_][A-Za-z0-9_]{0,63}$/;
const MAX_NODES = 200;
const MAX_EDGES = 600;
const MAX_TIMEOUT_MS = 30 * 24 * 3_600_000;

export const WRITE_TOOLS: readonly ToolName[] = ["create_note", "update_note", "tag_note", "move_note", "create_reminder"];
const isWriteTool = (t: unknown) => WRITE_TOOLS.includes(t as ToolName);

export function defaultPolicy(allowed: readonly ToolName[] = TOOL_NAMES): FlowPolicy {
  return { allowedTools: [...allowed], requireApprovalForUntrusted: true };
}

export function emptyFlow(id: string, name: string): FlowGraph {
  return {
    schemaVersion: FLOW_SCHEMA_VERSION,
    id,
    name,
    version: 1,
    nodes: [{ id: "trigger", type: "trigger", kind: "manual", position: { x: 0, y: 0 } }],
    edges: [],
    budgets: { ...DEFAULT_BUDGETS },
    policy: defaultPolicy(),
  };
}

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

export function validateFlow(input: unknown, opts: { knownTools?: readonly string[] } = {}): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const err = (path: string, code: string, message: string) => issues.push({ path, code, message, severity: "error" });
  const warn = (path: string, code: string, message: string) => issues.push({ path, code, message, severity: "warning" });
  const known = new Set<string>(opts.knownTools ?? TOOL_NAMES);

  if (!isObj(input)) { err("$", "type", "flow must be an object"); return issues; }
  if (input.schemaVersion !== FLOW_SCHEMA_VERSION) err("schemaVersion", "schema_version", `expected schemaVersion ${FLOW_SCHEMA_VERSION}`);
  if (typeof input.id !== "string" || !input.id) err("id", "required", "id is required");
  if (typeof input.name !== "string" || !input.name.trim()) err("name", "required", "name is required");
  if (!Number.isInteger(input.version) || (input.version as number) < 1) err("version", "range", "version must be a positive integer");

  // budgets
  if (!isObj(input.budgets)) err("budgets", "budget_missing", "budgets are required (steps, tokens, wall time, loop iterations)");
  else {
    for (const k of Object.keys(BUDGET_CEILINGS) as (keyof FlowBudgets)[]) {
      const v = (input.budgets as Record<string, unknown>)[k];
      if (v === undefined) err(`budgets.${k}`, "budget_missing", `${k} is required`);
      else if (typeof v !== "number" || !Number.isInteger(v) || v < 1) err(`budgets.${k}`, "budget_range", `${k} must be a positive integer`);
      else if (v > BUDGET_CEILINGS[k]) err(`budgets.${k}`, "budget_range", `${k} exceeds the maximum of ${BUDGET_CEILINGS[k]}`);
    }
  }

  // policy
  let allowed = new Set<string>();
  if (!isObj(input.policy) || !Array.isArray(input.policy.allowedTools)) err("policy.allowedTools", "required", "policy.allowedTools (tool allow-list) is required");
  else {
    (input.policy.allowedTools as unknown[]).forEach((t, i) => {
      if (typeof t !== "string" || !known.has(t)) err(`policy.allowedTools[${i}]`, "unknown_tool", `unknown tool '${String(t)}'`);
      else allowed.add(t);
    });
    if (typeof input.policy.requireApprovalForUntrusted !== "boolean") err("policy.requireApprovalForUntrusted", "type", "must be boolean");
    if (input.policy.requireCriticBeforeWrites !== undefined && typeof input.policy.requireCriticBeforeWrites !== "boolean") err("policy.requireCriticBeforeWrites", "type", "must be boolean");
  }

  if (!Array.isArray(input.nodes)) { err("nodes", "type", "nodes must be an array"); return issues; }
  if (!Array.isArray(input.edges)) { err("edges", "type", "edges must be an array"); return issues; }
  if (input.nodes.length > MAX_NODES) err("nodes", "limit", `at most ${MAX_NODES} nodes`);
  if (input.edges.length > MAX_EDGES) err("edges", "limit", `at most ${MAX_EDGES} edges`);

  const nodeById = new Map<string, FlowNode>();
  const nodeIdx = new Map<string, number>();
  const checkTpl = (path: string, v: unknown) => {
    if (typeof v !== "string") return err(path, "type", "must be a string");
    const m = checkTemplate(v);
    if (m) err(path, "template_syntax", m);
  };
  const checkToolRef = (path: string, t: unknown) => {
    if (typeof t !== "string" || !known.has(t)) return err(path, "unknown_tool", `unknown tool '${String(t)}'`);
    if (!allowed.has(t)) err(path, "tool_not_allowed", `tool '${t}' is not in policy.allowedTools`);
  };
  const walkArgs = (path: string, v: unknown, depth = 0) => {
    if (depth > 8) return err(path, "depth", "args nested too deeply");
    if (typeof v === "string") { const m = checkTemplate(v); if (m) err(path, "template_syntax", m); }
    else if (Array.isArray(v)) v.forEach((x, i) => walkArgs(`${path}[${i}]`, x, depth + 1));
    else if (isObj(v)) for (const [k, x] of Object.entries(v)) walkArgs(`${path}.${k}`, x, depth + 1);
  };

  (input.nodes as unknown[]).forEach((raw, i) => {
    const p = `nodes[${i}]`;
    if (!isObj(raw)) return err(p, "type", "node must be an object");
    const id = raw.id;
    if (typeof id !== "string" || !ID_RE.test(id)) err(`${p}.id`, "node_id", "id must match [A-Za-z_][A-Za-z0-9_]* (max 64) so expressions can reference it");
    else if (nodeById.has(id)) err(`${p}.id`, "duplicate_id", `duplicate node id '${id}'`);
    else { nodeById.set(id, raw as unknown as FlowNode); nodeIdx.set(id, i); }
    const type = raw.type as NodeType;
    if (!NODE_TYPES.includes(type)) return err(`${p}.type`, "node_type", `unknown node type '${String(raw.type)}'`);
    if (raw.retry !== undefined) {
      const r = raw.retry as Record<string, unknown>;
      if (!isObj(r) || !Number.isInteger(r.maxAttempts) || (r.maxAttempts as number) < 1 || (r.maxAttempts as number) > 10) err(`${p}.retry.maxAttempts`, "range", "maxAttempts must be 1..10");
      if (!isObj(r) || typeof r.baseDelayMs !== "number" || r.baseDelayMs < 0 || r.baseDelayMs > 60_000) err(`${p}.retry.baseDelayMs`, "range", "baseDelayMs must be 0..60000");
    }
    switch (type) {
      case "trigger":
        if (!TRIGGER_KINDS.includes(raw.kind as TriggerKind)) err(`${p}.kind`, "trigger_kind", `kind must be one of ${TRIGGER_KINDS.join(", ")}`);
        break;
      case "action": {
        checkToolRef(`${p}.tool`, raw.tool);
        if (!isObj(raw.args)) err(`${p}.args`, "type", "args must be an object");
        else walkArgs(`${p}.args`, raw.args);
        break;
      }
      case "ai":
        if (!AI_TASKS.includes(raw.task as string)) err(`${p}.task`, "ai_task", `task must be one of ${AI_TASKS.join(", ")}`);
        checkTpl(`${p}.prompt`, raw.prompt);
        if (raw.model !== undefined && typeof raw.model !== "string") err(`${p}.model`, "type", "model must be a string");
        if (raw.schema !== undefined && !isObj(raw.schema)) err(`${p}.schema`, "type", "schema must be an object");
        break;
      case "agent":
        if (typeof raw.agentId !== "string" || !raw.agentId) err(`${p}.agentId`, "required", "agentId is required");
        checkTpl(`${p}.goal`, raw.goal);
        if (!Number.isInteger(raw.maxSteps) || (raw.maxSteps as number) < 1 || (raw.maxSteps as number) > 50) err(`${p}.maxSteps`, "budget_range", "agent maxSteps must be an integer 1..50");
        if (!AGENT_MODES.includes(raw.mode as AgentMode)) err(`${p}.mode`, "agent_mode", `mode must be one of ${AGENT_MODES.join(", ")}`);
        if (!Array.isArray(raw.tools)) err(`${p}.tools`, "type", "tools must be an array");
        else (raw.tools as unknown[]).forEach((t, j) => checkToolRef(`${p}.tools[${j}]`, t));
        break;
      case "branch":
        if (typeof raw.when !== "string" || !raw.when.trim()) err(`${p}.when`, "required", "when expression is required");
        else { const m = checkExpr(raw.when); if (m) err(`${p}.when`, "expr_syntax", m); }
        break;
      case "loop":
        if (typeof raw.over !== "string" || !raw.over.trim()) err(`${p}.over`, "required", "over expression is required");
        else { const m = checkExpr(raw.over); if (m) err(`${p}.over`, "expr_syntax", m); }
        if (raw.maxIterations !== undefined && (!Number.isInteger(raw.maxIterations) || (raw.maxIterations as number) < 1 || (raw.maxIterations as number) > BUDGET_CEILINGS.maxLoopIterations))
          err(`${p}.maxIterations`, "budget_range", `maxIterations must be an integer 1..${BUDGET_CEILINGS.maxLoopIterations}`);
        break;
      case "approval":
        if (typeof raw.role !== "string" || !raw.role.trim()) err(`${p}.role`, "required", "approval role is required");
        if (typeof raw.timeoutMs !== "number" || raw.timeoutMs < 1000 || raw.timeoutMs > MAX_TIMEOUT_MS) err(`${p}.timeoutMs`, "range", "timeoutMs must be 1000..2592000000");
        break;
      case "supervisor": {
        checkTpl(`${p}.goal`, raw.goal);
        checkTpl(`${p}.workerGoal`, raw.workerGoal);
        if (typeof raw.fanOut !== "string" || !raw.fanOut.trim()) err(`${p}.fanOut`, "required", "fanOut expression is required");
        else { const m = checkExpr(raw.fanOut); if (m) err(`${p}.fanOut`, "expr_syntax", m); }
        if (!Number.isInteger(raw.workerMaxSteps) || (raw.workerMaxSteps as number) < 1 || (raw.workerMaxSteps as number) > 50) err(`${p}.workerMaxSteps`, "budget_range", "workerMaxSteps must be an integer 1..50");
        if (!Number.isInteger(raw.maxWorkers) || (raw.maxWorkers as number) < 1 || (raw.maxWorkers as number) > 50) err(`${p}.maxWorkers`, "budget_range", "maxWorkers must be an integer 1..50");
        if (!Number.isInteger(raw.concurrency) || (raw.concurrency as number) < 1 || (raw.concurrency as number) > 8) err(`${p}.concurrency`, "budget_range", "concurrency must be an integer 1..8");
        if (!AGENT_MODES.includes(raw.workerMode as AgentMode)) err(`${p}.workerMode`, "agent_mode", `workerMode must be one of ${AGENT_MODES.join(", ")}`);
        if (!Array.isArray(raw.workerTools)) err(`${p}.workerTools`, "type", "workerTools must be an array");
        else (raw.workerTools as unknown[]).forEach((t, j) => checkToolRef(`${p}.workerTools[${j}]`, t));
        if (raw.synthesisPrompt !== undefined) checkTpl(`${p}.synthesisPrompt`, raw.synthesisPrompt);
        break;
      }
      case "critic":
        checkTpl(`${p}.criteria`, raw.criteria);
        checkTpl(`${p}.subject`, raw.subject);
        break;
      case "subflow":
        if (typeof raw.flowId !== "string" || !raw.flowId) err(`${p}.flowId`, "required", "flowId is required");
        else if (raw.flowId === input.id) err(`${p}.flowId`, "subflow_self", "a flow cannot call itself");
        if (raw.input !== undefined) {
          if (!isObj(raw.input)) err(`${p}.input`, "type", "input must be an object of templates");
          else for (const [k, v] of Object.entries(raw.input)) checkTpl(`${p}.input.${k}`, v);
        }
        break;
    }
  });

  // triggers
  const triggers = [...nodeById.values()].filter((n) => n.type === "trigger");
  if (triggers.length === 0) err("nodes", "no_trigger", "flow needs exactly one trigger node");
  else if (triggers.length > 1) triggers.slice(1).forEach((t) => err(`nodes[${nodeIdx.get(t.id)}]`, "multiple_triggers", "only one trigger node is allowed"));

  // edges
  const edgeIds = new Set<string>();
  const seenEdge = new Set<string>();
  const good: FlowEdge[] = [];
  (input.edges as unknown[]).forEach((raw, i) => {
    const p = `edges[${i}]`;
    if (!isObj(raw)) return err(p, "type", "edge must be an object");
    if (typeof raw.id !== "string" || !raw.id) err(`${p}.id`, "required", "edge id is required");
    else if (edgeIds.has(raw.id)) err(`${p}.id`, "duplicate_id", `duplicate edge id '${raw.id}'`);
    else edgeIds.add(raw.id);
    const from = typeof raw.from === "string" ? nodeById.get(raw.from) : undefined;
    const to = typeof raw.to === "string" ? nodeById.get(raw.to) : undefined;
    if (!from) err(`${p}.from`, "dangling_edge", `source node '${String(raw.from)}' does not exist`);
    if (!to) err(`${p}.to`, "dangling_edge", `target node '${String(raw.to)}' does not exist`);
    if (!from || !to) return;
    const ports = NODE_PORTS[from.type];
    if (!ports.includes(raw.port as PortName)) return err(`${p}.port`, "bad_port", `a ${from.type} node has ports [${ports.join(", ")}], not '${String(raw.port)}'`);
    if (to.type === "trigger") err(`${p}.to`, "edge_into_trigger", "nothing may connect into the trigger");
    const sig = `${from.id}|${raw.port}|${to.id}`;
    if (seenEdge.has(sig)) err(p, "duplicate_edge", "duplicate edge");
    seenEdge.add(sig);
    good.push(raw as unknown as FlowEdge);
  });

  // graph structure
  const out = new Map<string, FlowEdge[]>();
  for (const e of good) (out.get(e.from) ?? out.set(e.from, []).get(e.from)!).push(e);
  const reach = (starts: string[], skipEdge: (e: FlowEdge) => boolean, stopAt?: string): Set<string> => {
    const seen = new Set<string>();
    const stack = [...starts];
    while (stack.length) {
      const id = stack.pop()!;
      if (seen.has(id) || id === stopAt) continue;
      seen.add(id);
      for (const e of out.get(id) ?? []) if (!skipEdge(e)) stack.push(e.to);
    }
    return seen;
  };

  const trig = triggers[0];
  if (trig) {
    const reached = reach([trig.id], () => false);
    for (const [id, n] of nodeById) if (!reached.has(id)) err(`nodes[${nodeIdx.get(id)}]`, "unreachable", `node '${id}' (${n.type}) is not reachable from the trigger`);
  }

  // critic gate: with policy.requireCriticBeforeWrites every write must sit behind a critic's 'true' port
  if (trig && isObj(input.policy) && input.policy.requireCriticBeforeWrites === true) {
    const unguarded = reach([trig.id], (e) => nodeById.get(e.from)?.type === "critic" && e.port === "true");
    for (const id of unguarded) {
      const n = nodeById.get(id)!;
      const i = nodeIdx.get(id);
      const writes = n.type === "action" ? isWriteTool(n.tool)
        : n.type === "agent" ? n.mode !== "propose_only" && Array.isArray(n.tools) && n.tools.some(isWriteTool)
        : n.type === "supervisor" ? n.workerMode !== "propose_only" && Array.isArray(n.workerTools) && n.workerTools.some(isWriteTool)
        : false;
      if (writes) err(`nodes[${i}]`, "critic_required", `'${id}' can write notes but is reachable without a critic approval (policy.requireCriticBeforeWrites)`);
    }
  }

  // cycles: every cycle must pass through a loop node
  const loops = [...nodeById.values()].filter((n) => n.type === "loop");
  const color = new Map<string, number>();
  let cyc: string[] | null = null;
  const dfs = (id: string, stack: string[]) => {
    if (cyc) return;
    color.set(id, 1);
    stack.push(id);
    for (const e of out.get(id) ?? []) {
      const t = nodeById.get(e.to);
      if (!t || t.type === "loop") continue; // edges into loop nodes are legal back-edges
      if (color.get(e.to) === 1) { cyc = [...stack.slice(stack.indexOf(e.to)), e.to]; return; }
      if (!color.get(e.to)) dfs(e.to, stack);
      if (cyc) return;
    }
    stack.pop();
    color.set(id, 2);
  };
  for (const id of nodeById.keys()) if (!color.get(id) && nodeById.get(id)!.type !== "loop") dfs(id, []);
  if (cyc) err(`nodes[${nodeIdx.get((cyc as string[])[0])}]`, "cycle", `cycle without a loop node: ${(cyc as string[]).join(" -> ")}. Cycles are only allowed through an explicit loop node`);

  for (const L of loops) {
    const bodyTargets = (out.get(L.id) ?? []).filter((e) => e.port === "true").map((e) => e.to);
    const exitTargets = (out.get(L.id) ?? []).filter((e) => e.port !== "true").map((e) => e.to);
    const body = reach(bodyTargets, () => false, L.id);
    if (exitTargets.some((t) => reach([t], () => false).has(L.id))) err(`nodes[${nodeIdx.get(L.id)}]`, "loop_exit_cycle", `loop '${L.id}' may only be re-entered from its body ('true' port), not from its exit`);
    if (trig) {
      const outside = reach([trig.id], (e) => e.from === L.id && e.port === "true");
      const leak = [...body].filter((id) => outside.has(id));
      if (leak.length) err(`nodes[${nodeIdx.get(L.id)}]`, "loop_scope_leak", `loop '${L.id}' body shares nodes with the rest of the flow: ${leak.join(", ")}`);
    }
    if (bodyTargets.length === 0) warn(`nodes[${nodeIdx.get(L.id)}]`, "loop_empty", `loop '${L.id}' has no body ('true' port)`);
  }

  // soft checks
  for (const [id, n] of nodeById) {
    const i = nodeIdx.get(id);
    if (n.type === "branch") {
      const ports = new Set((out.get(id) ?? []).map((e) => e.port));
      if (!ports.has("true") || !ports.has("false")) warn(`nodes[${i}]`, "branch_incomplete", `branch '${id}' should connect both 'true' and 'false'`);
    }
  }
  if (isObj(input.policy) && input.policy.requireApprovalForUntrusted === false)
    warn("policy.requireApprovalForUntrusted", "unsafe_policy", "note content is untrusted; disabling approvals exposes the flow to prompt injection");

  return issues;
}

export const hasErrors = (issues: ValidationIssue[]) => issues.some((i) => i.severity === "error");

/** Parse JSON text and validate. flow is only returned when there are no errors. */
export function parseFlowJson(text: string): { flow?: FlowGraph; issues: ValidationIssue[] } {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch (e) {
    return { issues: [{ path: "$", code: "json", message: `invalid JSON: ${(e as Error).message}`, severity: "error" }] };
  }
  const issues = validateFlow(data);
  return { flow: hasErrors(issues) ? undefined : (data as FlowGraph), issues };
}

// ── Layout ──────────────────────────────────────────────────────────────────

/** Layered left-to-right layout; sets node.position for nodes lacking one (or all when force). */
export function autoLayout(flow: FlowGraph, force = false): FlowGraph {
  const depth = new Map<string, number>();
  const trig = flow.nodes.find((n) => n.type === "trigger");
  const q: string[] = trig ? [trig.id] : [];
  if (trig) depth.set(trig.id, 0);
  while (q.length) {
    const id = q.shift()!;
    for (const e of flow.edges) {
      if (e.from === id && !depth.has(e.to) && depth.size < 1000) { depth.set(e.to, depth.get(id)! + 1); q.push(e.to); }
    }
  }
  const rows = new Map<number, number>();
  const nodes = flow.nodes.map((n) => {
    if (n.position && !force) return n;
    const d = depth.get(n.id) ?? 0;
    const r = rows.get(d) ?? 0;
    rows.set(d, r + 1);
    return { ...n, position: { x: d * 280, y: r * 150 } };
  });
  return { ...flow, nodes };
}

// ── Migration from legacy AgentDefinition ───────────────────────────────────

const LEGACY_TOOL_MAP: Record<string, ToolName[]> = {
  search_workspace_notes: ["search_notes", "get_note"],
  search_workspace: ["search_notes", "get_note"],
  create_structured_note: ["create_note"],
  create_note: ["create_note"],
  update_existing_note: ["update_note"],
  update_note: ["update_note"],
  organize_notes_into_folders: ["move_note", "tag_note"],
  organize_folders_tags: ["move_note", "tag_note"],
  create_workspace_reminders: ["create_reminder"],
  extract_tasks_and_reminders: ["create_reminder"],
  run_compliance_audit: ["dlp_scan"],
  compliance_dlp_scan: ["dlp_scan"],
};

export function migrateLegacyTools(tools: readonly string[]): ToolName[] {
  const out: ToolName[] = [];
  for (const t of tools) for (const m of LEGACY_TOOL_MAP[t] ?? []) if (!out.includes(m)) out.push(m);
  return out;
}

type LegacyAgent = Pick<AgentDefinition, "id" | "name" | "description" | "systemPrompt" | "autonomyLevel" | "trigger"> & { allowedTools: readonly string[] };

export function agentToFlow(agent: LegacyAgent): FlowGraph {
  const tools = migrateLegacyTools(agent.allowedTools);
  const trigger: FlowNode =
    agent.trigger === "on_note_publish" ? { id: "trigger", type: "trigger", kind: "note.published" }
    : agent.trigger === "scheduled_daily" ? { id: "trigger", type: "trigger", kind: "schedule", config: { cron: "0 9 * * *" } }
    : agent.trigger === "on_compliance_flag" ? { id: "trigger", type: "trigger", kind: "note.tagged", config: { tag: "compliance-flag" } }
    : { id: "trigger", type: "trigger", kind: "manual" };
  const mode: AgentMode = agent.autonomyLevel === "autonomous" ? "act" : agent.autonomyLevel === "advisory_only" ? "propose_only" : "approve_writes";
  const flow: FlowGraph = {
    schemaVersion: FLOW_SCHEMA_VERSION,
    id: `flow_${agent.id.replace(/[^A-Za-z0-9_]/g, "_")}`,
    name: agent.name,
    description: agent.description,
    version: 1,
    nodes: [
      trigger,
      {
        id: "agent",
        type: "agent",
        agentId: agent.id,
        goal: `{{ coalesce(trigger.payload.goal, note.title, ${JSON.stringify(agent.name)}) }}`,
        instructions: agent.systemPrompt.slice(0, 4000),
        maxSteps: 8,
        tools,
        mode,
      },
    ],
    edges: [{ id: "e_trigger_agent", from: "trigger", port: "ok", to: "agent" }],
    budgets: { ...DEFAULT_BUDGETS },
    policy: defaultPolicy(tools),
  };
  return autoLayout(flow);
}
