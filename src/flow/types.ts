/**
 * @aura/flow — workflow graph model, run records and injected interfaces.
 * Framework-free: runs in web, desktop and tests.
 */

export const FLOW_SCHEMA_VERSION = 1 as const;

export const TOOL_NAMES = [
  "search_notes",
  "get_note",
  "create_note",
  "update_note",
  "tag_note",
  "move_note",
  "create_reminder",
  "dlp_scan",
] as const;
export type ToolName = (typeof TOOL_NAMES)[number];

export type PortName = "ok" | "error" | "true" | "false";
export type NodeType = "trigger" | "action" | "ai" | "agent" | "branch" | "loop" | "approval" | "subflow" | "supervisor" | "critic";

export type TriggerKind =
  | "manual"
  | "note.created"
  | "note.updated"
  | "note.tagged"
  | "note.published"
  | "schedule"
  | "webhook"
  | "folder.changed";

export type AiTask = "summarize" | "extract" | "classify" | "rewrite" | "embed" | "custom";
export type AgentMode = "act" | "approve_writes" | "propose_only";

/** Subset of JSON Schema used for tool args and AI structured output. */
export interface JsonSchema {
  type?: "string" | "number" | "integer" | "boolean" | "array" | "object" | "null";
  description?: string;
  enum?: unknown[];
  properties?: Record<string, JsonSchema>;
  required?: string[];
  additionalProperties?: boolean;
  items?: JsonSchema;
  minLength?: number;
  maxLength?: number;
  minimum?: number;
  maximum?: number;
  maxItems?: number;
}

export interface RetryPolicy {
  maxAttempts: number;
  baseDelayMs: number;
}

interface NodeBase {
  id: string;
  label?: string;
  position?: { x: number; y: number };
  retry?: RetryPolicy;
}

export interface TriggerNode extends NodeBase {
  type: "trigger";
  kind: TriggerKind;
  config?: Record<string, string>;
}
export interface ActionNode extends NodeBase {
  type: "action";
  tool: ToolName;
  /** String values are templates; nested objects/arrays are walked. */
  args: Record<string, unknown>;
}
export interface AiNode extends NodeBase {
  type: "ai";
  task: AiTask;
  prompt: string;
  model?: string;
  schema?: JsonSchema;
}
export interface AgentNode extends NodeBase {
  type: "agent";
  agentId: string;
  goal: string;
  instructions?: string;
  maxSteps: number;
  tools: ToolName[];
  mode: AgentMode;
}
export interface BranchNode extends NodeBase {
  type: "branch";
  when: string;
}
export interface LoopNode extends NodeBase {
  type: "loop";
  over: string;
  maxIterations?: number;
}
export interface ApprovalNode extends NodeBase {
  type: "approval";
  role: string;
  timeoutMs: number;
  message?: string;
}
export interface SubflowNode extends NodeBase {
  type: "subflow";
  flowId: string;
  input?: Record<string, string>;
}

/**
 * Supervisor -> workers. Fans out over `fanOut` (an expression returning a list); each element is
 * handled by one worker agent (`item`, `index` available in its templates). At most `concurrency`
 * workers run at once; results are fanned back in as `output.workers` and optionally synthesized.
 */
export interface SupervisorNode extends NodeBase {
  type: "supervisor";
  goal: string;
  fanOut: string;
  workerGoal: string;
  workerInstructions?: string;
  workerTools: ToolName[];
  workerMaxSteps: number;
  workerMode: AgentMode;
  maxWorkers: number;
  concurrency: number;
  synthesize?: boolean;
  synthesisPrompt?: string;
}
/** Reviews `subject` against `criteria` with the model. Port `true` = approved, `false` = rejected. */
export interface CriticNode extends NodeBase {
  type: "critic";
  criteria: string;
  subject: string;
}

export type FlowNode =
  | SupervisorNode
  | CriticNode
  | TriggerNode
  | ActionNode
  | AiNode
  | AgentNode
  | BranchNode
  | LoopNode
  | ApprovalNode
  | SubflowNode;

export interface FlowEdge {
  id: string;
  from: string;
  port: PortName;
  to: string;
}

export interface FlowBudgets {
  maxSteps: number;
  maxTokens: number;
  maxWallMs: number;
  maxLoopIterations: number;
}

export interface FlowPolicy {
  /** Tool allow-list for the whole flow (action + agent nodes must be inside). */
  allowedTools: ToolName[];
  /** Medium/high-risk tools driven by note content need human approval. */
  requireApprovalForUntrusted: boolean;
  /** When true, every write (action/agent/worker) must be reachable only through a critic's 'true' port. */
  requireCriticBeforeWrites?: boolean;
}

export interface FlowGraph {
  schemaVersion: typeof FLOW_SCHEMA_VERSION;
  id: string;
  name: string;
  description?: string;
  version: number;
  nodes: FlowNode[];
  edges: FlowEdge[];
  budgets: FlowBudgets;
  policy: FlowPolicy;
}

// ── Validation ──────────────────────────────────────────────────────────────

export interface ValidationIssue {
  path: string;
  code: string;
  message: string;
  severity: "error" | "warning";
}

// ── Runs ────────────────────────────────────────────────────────────────────

export type RunStatus =
  | "running"
  | "paused_approval"
  | "completed"
  | "failed"
  | "cancelled"
  | "budget_exceeded";

export type StepStatus = "started" | "completed" | "failed" | "waiting" | "approved" | "rejected";

export interface Diff {
  kind: "create_note" | "update_note" | "tag_note" | "move_note" | "create_reminder";
  target: string;
  before?: unknown;
  after: unknown;
}

export interface StepRecord {
  key: string;
  runId: string;
  seq: number;
  nodeId: string;
  nodeType: NodeType | "gate" | "agent_model" | "agent_tool";
  title: string;
  status: StepStatus;
  port?: PortName;
  input?: unknown;
  output?: unknown;
  error?: string;
  attempts: number;
  tokens: number;
  idempotencyKey: string;
  tainted?: boolean;
  diffs?: Diff[];
  approval?: { role: string; reason: string; requestedAt: string; expiresAt: string; decidedBy?: string; comment?: string };
  startedAt: string;
  endedAt?: string;
}

export interface RunUsage {
  steps: number;
  tokens: number;
  activeMs: number;
}

export interface TriggerInput {
  note?: NoteRef;
  payload?: Record<string, unknown>;
}

export interface RunRecord {
  id: string;
  flowId: string;
  flowVersion: number;
  graph: FlowGraph;
  status: RunStatus;
  dryRun: boolean;
  input: TriggerInput;
  startedBy: string;
  startedAt: string;
  updatedAt: string;
  endedAt?: string;
  usage: RunUsage;
  error?: string;
  output?: unknown;
}

export interface RunStore {
  createRun(run: RunRecord): Promise<void>;
  getRun(id: string): Promise<RunRecord | null>;
  updateRun(id: string, patch: Partial<RunRecord>): Promise<RunRecord>;
  putStep(step: StepRecord): Promise<void>;
  getSteps(runId: string): Promise<StepRecord[]>;
  listRuns(flowId?: string): Promise<RunRecord[]>;
}

// ── Injected services ───────────────────────────────────────────────────────

export interface NoteRef {
  id: string;
  title: string;
  content: string;
  tags: string[];
  folder: string;
  updatedAt?: string;
}

export interface DlpFinding {
  type: string;
  masked: string;
  index: number;
}

export interface WorkspaceApi {
  searchNotes(q: { query: string; tag?: string; folder?: string; limit?: number }): Promise<NoteRef[]>;
  getNote(id: string): Promise<NoteRef | null>;
  createNote(input: { title: string; content: string; folder?: string; tags?: string[] }, idempotencyKey: string): Promise<{ id: string }>;
  updateNote(id: string, patch: { title?: string; content?: string; appendContent?: string }, idempotencyKey: string): Promise<{ id: string }>;
  addTags(id: string, tags: string[], idempotencyKey: string): Promise<{ id: string; tags: string[] }>;
  moveNote(id: string, folder: string, idempotencyKey: string): Promise<{ id: string; folder: string }>;
  createReminder(input: { text: string; date: string; noteId?: string }, idempotencyKey: string): Promise<{ id: string }>;
  scanDlp?(text: string): Promise<DlpFinding[]>;
}

export interface AiTokens {
  input: number;
  output: number;
}

export type AgentMessage =
  | { role: "assistant"; tool: string; args: Record<string, unknown>; thought?: string }
  | { role: "observation"; tool: string; content: string };

export interface AiCallOptions {
  /** Aborted by the executor when the per-call timeout fires. */
  signal?: AbortSignal;
  /** True when the prompt embeds note-derived (untrusted) text; real clients must fence it. */
  tainted?: boolean;
}
export interface AiCompleteRequest extends AiCallOptions {
  task: AiTask;
  prompt: string;
  model?: string;
  schema?: JsonSchema;
}
export interface AiAgentStepRequest extends AiCallOptions {
  goal: string;
  instructions?: string;
  tools: { name: string; description: string; schema: JsonSchema }[];
  history: AgentMessage[];
}

export type FlowAiErrorCode = "AI_UNAVAILABLE" | "POLICY_BLOCKED" | "TIMEOUT" | "BAD_OUTPUT" | "ABORTED";

/** Typed AI failure. POLICY_BLOCKED and ABORTED are never retried. Message always starts with the code. */
export class FlowAiError extends Error {
  readonly code: FlowAiErrorCode;
  readonly nonRetryable: boolean;
  constructor(code: FlowAiErrorCode, message: string) {
    super(message.startsWith(code) ? message : `${code}: ${message}`);
    this.name = "FlowAiError";
    this.code = code;
    this.nonRetryable = code === "POLICY_BLOCKED" || code === "ABORTED";
  }
}

/** Minimal AI surface; the real client (src/ai) is adapted to this by the host. */
export interface AiClient {
  complete(req: AiCompleteRequest): Promise<{ text: string; json?: unknown; tokens: AiTokens }>;
  agentStep(req: AiAgentStepRequest): Promise<{
    action: { type: "tool_call"; tool: string; args: Record<string, unknown>; thought?: string } | { type: "final"; answer: string };
    tokens: AiTokens;
  }>;
}
