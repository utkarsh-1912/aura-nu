import {
  AiError, AiProvider, ChatRequest, ChatResponse, EmbedRequest, EmbedResponse, ModelInfo, ProviderLocality, StreamChunk, ToolCall, Usage,
} from "../types";

export interface OpenAiCompatibleConfig {
  id: string;
  /** e.g. http://localhost:11434/v1 (Ollama), http://localhost:8000/v1 (vLLM), http://localhost:1234/v1 (LM Studio) */
  baseUrl: string;
  apiKey?: string;
  /** "local" = same machine; "self-host" = your own infra; "cloud" = third party (e.g. HF Inference Providers). */
  locality: ProviderLocality;
  defaultModel?: string;
  defaultEmbeddingModel?: string;
  /** How to request structured output. Servers differ; default json_schema. */
  jsonMode?: "json_schema" | "json_object" | "prompt";
  headers?: Record<string, string>;
  fetchImpl?: typeof fetch;
}

function usageOf(u: any): Usage {
  return {
    promptTokens: typeof u?.prompt_tokens === "number" ? u.prompt_tokens : null,
    completionTokens: typeof u?.completion_tokens === "number" ? u.completion_tokens : null,
    totalTokens: typeof u?.total_tokens === "number" ? u.total_tokens : null,
  };
}

function parseArgs(raw: unknown, provider: string): Record<string, unknown> {
  if (raw && typeof raw === "object") return raw as Record<string, unknown>;
  if (typeof raw !== "string" || raw.trim() === "") return {};
  try {
    const v = JSON.parse(raw);
    if (v && typeof v === "object" && !Array.isArray(v)) return v;
  } catch { /* fallthrough */ }
  throw new AiError("BAD_OUTPUT", "Tool call arguments were not valid JSON.", { provider });
}

function mapFinish(r: string | null | undefined): ChatResponse["finishReason"] {
  return r === "stop" ? "stop" : r === "length" ? "length" : r === "tool_calls" || r === "function_call" ? "tool_calls" : "other";
}

export class OpenAiCompatibleProvider implements AiProvider {
  readonly id: string;
  readonly locality: ProviderLocality;
  private cfg: OpenAiCompatibleConfig;
  private f: typeof fetch;

  constructor(cfg: OpenAiCompatibleConfig) {
    this.cfg = cfg;
    this.id = cfg.id;
    this.locality = cfg.locality;
    this.f = cfg.fetchImpl ?? ((...a: Parameters<typeof fetch>) => fetch(...a));
  }

  private url(p: string) { return this.cfg.baseUrl.replace(/\/+$/, "") + p; }

  private headers(): Record<string, string> {
    const h: Record<string, string> = { "Content-Type": "application/json", ...(this.cfg.headers ?? {}) };
    if (this.cfg.apiKey) h.Authorization = `Bearer ${this.cfg.apiKey}`;
    return h;
  }

  /** The timeout covers connect + headers; body reads are governed by the caller signal. */
  private async request(path: string, init: RequestInit, signal?: AbortSignal, timeoutMs?: number): Promise<Response> {
    const ctl = new AbortController();
    let timedOut = false;
    const t = timeoutMs ? setTimeout(() => { timedOut = true; ctl.abort(); }, timeoutMs) : undefined;
    const onAbort = () => ctl.abort();
    if (signal) { if (signal.aborted) ctl.abort(); else signal.addEventListener("abort", onAbort, { once: true }); }
    try {
      const res = await this.f(this.url(path), { ...init, signal: ctl.signal });
      if (!res.ok) {
        let detail = "";
        try { detail = (await res.text()).slice(0, 300); } catch { /* ignore */ }
        const s = res.status;
        if (s === 400 || s === 422) throw new AiError("INVALID_REQUEST", `${this.id} rejected request (${s}): ${detail}`, { provider: this.id, status: s });
        throw new AiError("AI_UNAVAILABLE", `${this.id} HTTP ${s}: ${detail}`, { provider: this.id, status: s, retryable: s === 429 || s === 408 || s >= 500 });
      }
      return res;
    } catch (e) {
      if (e instanceof AiError) throw e;
      if (timedOut) throw new AiError("TIMEOUT", `${this.id} timed out after ${timeoutMs}ms`, { provider: this.id, retryable: true });
      if (signal?.aborted) throw new AiError("ABORTED", "Request aborted.", { provider: this.id });
      throw new AiError("AI_UNAVAILABLE", `${this.id} unreachable: ${(e as Error)?.message}`, { provider: this.id, retryable: true });
    } finally {
      if (t) clearTimeout(t);
      signal?.removeEventListener("abort", onAbort);
    }
  }

  private body(req: ChatRequest, stream: boolean): Record<string, unknown> {
    const model = req.model ?? this.cfg.defaultModel;
    if (!model) throw new AiError("INVALID_REQUEST", `${this.id}: no model specified`, { provider: this.id });
    const messages: any[] = req.messages.map((m) => {
      if (m.role === "tool") return { role: "tool", content: m.content, tool_call_id: m.toolCallId };
      if (m.role === "assistant" && m.toolCalls?.length) {
        return { role: "assistant", content: m.content || null, tool_calls: m.toolCalls.map((c) => ({ id: c.id, type: "function", function: { name: c.name, arguments: JSON.stringify(c.arguments) } })) };
      }
      return { role: m.role, content: m.content };
    });
    const mode = this.cfg.jsonMode ?? "json_schema";
    const b: Record<string, unknown> = { model, messages, stream };
    if (req.temperature !== undefined) b.temperature = req.temperature;
    if (req.maxTokens !== undefined) b.max_tokens = req.maxTokens;
    if (stream) b.stream_options = { include_usage: true };
    if (req.tools?.length) b.tools = req.tools.map((t) => ({ type: "function", function: { name: t.name, description: t.description, parameters: t.parameters } }));
    if (req.jsonSchema) {
      if (mode === "json_schema") b.response_format = { type: "json_schema", json_schema: { name: "aura_output", schema: req.jsonSchema, strict: false } };
      else if (mode === "json_object") b.response_format = { type: "json_object" };
      else messages.push({ role: "system", content: `Respond with JSON only matching this schema: ${JSON.stringify(req.jsonSchema)}` });
    }
    return b;
  }

  async chat(req: ChatRequest): Promise<ChatResponse> {
    const started = Date.now();
    const res = await this.request("/chat/completions", { method: "POST", headers: this.headers(), body: JSON.stringify(this.body(req, false)) }, req.signal, req.timeoutMs);
    let data: any;
    try { data = await res.json(); } catch { throw new AiError("BAD_OUTPUT", `${this.id} returned a non-JSON body.`, { provider: this.id }); }
    const choice = data?.choices?.[0];
    if (!choice?.message) throw new AiError("BAD_OUTPUT", `${this.id} response had no choices.`, { provider: this.id });
    const toolCalls: ToolCall[] = (choice.message.tool_calls ?? []).map((c: any, i: number) => ({
      id: c.id ?? `call_${i}`, name: c.function?.name ?? "", arguments: parseArgs(c.function?.arguments, this.id),
    }));
    return {
      text: typeof choice.message.content === "string" ? choice.message.content : "",
      toolCalls, usage: usageOf(data.usage), model: data.model ?? (req.model ?? this.cfg.defaultModel ?? ""),
      provider: this.id, finishReason: mapFinish(choice.finish_reason), latencyMs: Date.now() - started,
    };
  }

  async *stream(req: ChatRequest): AsyncGenerator<StreamChunk> {
    const res = await this.request("/chat/completions", { method: "POST", headers: this.headers(), body: JSON.stringify(this.body(req, true)) }, req.signal, req.timeoutMs);
    if (!res.body) throw new AiError("BAD_OUTPUT", `${this.id} returned no stream body.`, { provider: this.id });
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = "";
    const partial = new Map<number, { id: string; name: string; args: string }>();
    let usage: Usage | undefined;
    const flushTools = (): ToolCall[] => {
      const out = [...partial.entries()].sort((a, b) => a[0] - b[0]).map(([i, c]) => ({ id: c.id || `call_${i}`, name: c.name, arguments: parseArgs(c.args, this.id) }));
      partial.clear();
      return out;
    };
    try {
      for (;;) {
        let r: ReadableStreamReadResult<Uint8Array>;
        try { r = await reader.read(); } catch (e) {
          if (req.signal?.aborted) throw new AiError("ABORTED", "Request aborted.", { provider: this.id });
          throw new AiError("AI_UNAVAILABLE", `${this.id} stream broke: ${(e as Error)?.message}`, { provider: this.id, retryable: true });
        }
        if (r.done) break;
        buf += dec.decode(r.value, { stream: true });
        let idx: number;
        while ((idx = buf.indexOf("\n")) >= 0) {
          const line = buf.slice(0, idx).replace(/\r$/, "");
          buf = buf.slice(idx + 1);
          if (!line.startsWith("data:")) continue;
          const payload = line.slice(5).trim();
          if (payload === "[DONE]") { const tc = flushTools(); yield { toolCalls: tc.length ? tc : undefined, usage, done: true }; return; }
          let j: any;
          try { j = JSON.parse(payload); } catch { throw new AiError("BAD_OUTPUT", `${this.id} sent malformed SSE JSON.`, { provider: this.id }); }
          if (j.error) throw new AiError("AI_UNAVAILABLE", `${this.id} stream error: ${j.error.message ?? "unknown"}`, { provider: this.id, retryable: true });
          if (j.usage) usage = usageOf(j.usage);
          const d = j.choices?.[0]?.delta;
          if (d?.content) yield { delta: d.content };
          for (const tc of d?.tool_calls ?? []) {
            const k = tc.index ?? 0;
            const cur = partial.get(k) ?? { id: "", name: "", args: "" };
            if (tc.id) cur.id = tc.id;
            if (tc.function?.name) cur.name += tc.function.name;
            if (tc.function?.arguments) cur.args += tc.function.arguments;
            partial.set(k, cur);
          }
        }
      }
      throw new AiError("AI_UNAVAILABLE", `${this.id} stream ended unexpectedly.`, { provider: this.id, retryable: true });
    } finally { try { await reader.cancel(); } catch { /* ignore */ } }
  }

  async embed(req: EmbedRequest): Promise<EmbedResponse> {
    const model = req.model ?? this.cfg.defaultEmbeddingModel;
    if (!model) throw new AiError("INVALID_REQUEST", `${this.id}: no embedding model specified`, { provider: this.id });
    const res = await this.request("/embeddings", { method: "POST", headers: this.headers(), body: JSON.stringify({ model, input: req.input }) }, req.signal, req.timeoutMs);
    let data: any;
    try { data = await res.json(); } catch { throw new AiError("BAD_OUTPUT", `${this.id} returned a non-JSON body.`, { provider: this.id }); }
    const rows = [...(data?.data ?? [])].sort((a: any, b: any) => (a.index ?? 0) - (b.index ?? 0));
    if (rows.length !== req.input.length || rows.some((r: any) => !Array.isArray(r.embedding))) {
      throw new AiError("BAD_OUTPUT", `${this.id} returned ${rows.length} embeddings for ${req.input.length} inputs.`, { provider: this.id });
    }
    return { vectors: rows.map((r: any) => r.embedding as number[]), model: data.model ?? model, provider: this.id, usage: usageOf(data.usage) };
  }

  async listModels(signal?: AbortSignal): Promise<ModelInfo[]> {
    const res = await this.request("/models", { method: "GET", headers: this.headers() }, signal, 10_000);
    const data: any = await res.json().catch(() => ({}));
    return (data?.data ?? []).map((m: any) => ({ id: String(m.id), provider: this.id, kind: "unknown" as const }));
  }
}
