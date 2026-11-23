// Provider-agnostic AI types. Framework-free: runs in web, desktop, server and tests.

export type AiPolicy = "cloud-allowed" | "self-host-only" | "local-only";
/** Where a provider executes. Policy decides which localities may receive data. */
export type ProviderLocality = "cloud" | "self-host" | "local";
/** "locked" = E2E/locked notes: may ONLY go to local providers, regardless of policy. */
export type Sensitivity = "normal" | "locked";

export type AiErrorCode =
  | "AI_UNAVAILABLE"
  | "POLICY_BLOCKED"
  | "TIMEOUT"
  | "BAD_OUTPUT"
  | "ABORTED"
  | "INVALID_REQUEST";

export class AiError extends Error {
  readonly code: AiErrorCode;
  readonly retryable: boolean;
  readonly provider?: string;
  readonly status?: number;
  constructor(code: AiErrorCode, message: string, opts: { retryable?: boolean; provider?: string; status?: number } = {}) {
    super(message);
    this.name = "AiError";
    this.code = code;
    this.retryable = opts.retryable ?? false;
    this.provider = opts.provider;
    this.status = opts.status;
  }
}

export interface ToolDefinition {
  name: string;
  description: string;
  /** JSON Schema for arguments */
  parameters: Record<string, unknown>;
}
export interface ToolCall {
  id: string;
  name: string;
  /** Parsed arguments (already JSON-parsed; adapters set BAD_OUTPUT if unparsable). */
  arguments: Record<string, unknown>;
}
export interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  toolCalls?: ToolCall[];
  toolCallId?: string;
}
export interface Usage {
  promptTokens: number | null;
  completionTokens: number | null;
  totalTokens: number | null;
}
export interface ChatRequest {
  messages: ChatMessage[];
  model?: string;
  temperature?: number;
  maxTokens?: number;
  /** When set, output must be JSON conforming to this (subset of) JSON Schema. */
  jsonSchema?: Record<string, unknown>;
  tools?: ToolDefinition[];
  signal?: AbortSignal;
  timeoutMs?: number;
  sensitivity?: Sensitivity;
}
export interface ChatResponse {
  text: string;
  /** Parsed JSON when jsonSchema was requested and output validated. */
  json?: unknown;
  toolCalls: ToolCall[];
  usage: Usage;
  model: string;
  provider: string;
  finishReason: "stop" | "length" | "tool_calls" | "other";
  latencyMs?: number;
}
export interface StreamChunk {
  delta?: string;
  toolCalls?: ToolCall[];
  usage?: Usage;
  done?: boolean;
  provider?: string;
}
export interface EmbedRequest {
  input: string[];
  model?: string;
  signal?: AbortSignal;
  timeoutMs?: number;
  sensitivity?: Sensitivity;
}
export interface EmbedResponse {
  vectors: number[][];
  model: string;
  provider: string;
  usage: Usage;
}
export interface ModelInfo {
  id: string;
  provider: string;
  kind?: "chat" | "embedding" | "unknown";
}

export interface AiProvider {
  readonly id: string;
  readonly locality: ProviderLocality;
  chat(req: ChatRequest): Promise<ChatResponse>;
  stream?(req: ChatRequest): AsyncIterable<StreamChunk>;
  embed?(req: EmbedRequest): Promise<EmbedResponse>;
  listModels?(signal?: AbortSignal): Promise<ModelInfo[]>;
}

export const EMPTY_USAGE: Usage = { promptTokens: null, completionTokens: null, totalTokens: null };
