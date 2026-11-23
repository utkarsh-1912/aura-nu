import { GoogleGenAI } from "@google/genai";
import { AiError, AiProvider, ChatRequest, ChatResponse, EmbedRequest, EmbedResponse, StreamChunk, Usage } from "../types";

/** Server-side only (holds an API key). Mirrors api/index.ts: model "gemini-3.5-flash", responseMimeType json for structured output. */
export interface GeminiConfig {
  apiKey: string;
  id?: string;
  defaultModel?: string;      // default "gemini-3.5-flash" (same as legacy endpoints)
  embeddingModel?: string;    // legacy code uses no embedding model; must be supplied to use embed()
  client?: Pick<GoogleGenAI, "models">; // injectable for tests
}

const usageOf = (u: any): Usage => ({
  promptTokens: u?.promptTokenCount ?? null, completionTokens: u?.candidatesTokenCount ?? null, totalTokens: u?.totalTokenCount ?? null,
});

export class GeminiProvider implements AiProvider {
  readonly id: string;
  readonly locality = "cloud" as const;
  private client: Pick<GoogleGenAI, "models">;
  constructor(private cfg: GeminiConfig) {
    this.id = cfg.id ?? "gemini";
    this.client = cfg.client ?? new GoogleGenAI({ apiKey: cfg.apiKey });
  }

  private params(req: ChatRequest) {
    const system = req.messages.filter((m) => m.role === "system").map((m) => m.content).join("\n\n");
    const contents = req.messages.filter((m) => m.role !== "system").map((m) => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] }));
    const config: Record<string, unknown> = { temperature: req.temperature ?? 0.2 };
    if (system) config.systemInstruction = system;
    if (req.maxTokens) config.maxOutputTokens = req.maxTokens;
    if (req.jsonSchema) config.responseMimeType = "application/json";
    if (req.tools?.length) config.tools = [{ functionDeclarations: req.tools.map((t) => ({ name: t.name, description: t.description, parametersJsonSchema: t.parameters })) }];
    if (req.signal) config.abortSignal = req.signal;
    return { model: req.model ?? this.cfg.defaultModel ?? "gemini-3.5-flash", contents, config };
  }

  private wrap(e: unknown): AiError {
    if (e instanceof AiError) return e;
    const status = (e as any)?.status ?? (e as any)?.code;
    const n = typeof status === "number" ? status : undefined;
    return new AiError("AI_UNAVAILABLE", `${this.id} request failed`, { provider: this.id, status: n, retryable: n === undefined || n === 429 || n >= 500 });
  }

  async chat(req: ChatRequest): Promise<ChatResponse> {
    if (req.signal?.aborted) throw new AiError("ABORTED", "Request aborted.", { provider: this.id });
    const p = this.params(req);
    try {
      const r: any = await this.client.models.generateContent(p as any);
      const calls = (r.functionCalls ?? []) as any[];
      return {
        text: r.text ?? "", provider: this.id, model: p.model, usage: usageOf(r.usageMetadata),
        toolCalls: calls.map((c, i) => ({ id: c.id ?? `call_${i}`, name: c.name, arguments: c.args ?? {} })),
        finishReason: calls.length ? "tool_calls" : "stop",
      };
    } catch (e) {
      if (req.signal?.aborted) throw new AiError("ABORTED", "Request aborted.", { provider: this.id });
      throw this.wrap(e);
    }
  }

  async *stream(req: ChatRequest): AsyncGenerator<StreamChunk> {
    const p = this.params(req);
    try {
      const it: AsyncIterable<any> = await (this.client.models as any).generateContentStream(p);
      let usage: Usage | undefined;
      for await (const c of it) {
        if (c.usageMetadata) usage = usageOf(c.usageMetadata);
        if (c.text) yield { delta: c.text };
      }
      yield { done: true, usage };
    } catch (e) {
      if (req.signal?.aborted) throw new AiError("ABORTED", "Request aborted.", { provider: this.id });
      throw this.wrap(e);
    }
  }

  async embed(req: EmbedRequest): Promise<EmbedResponse> {
    const model = req.model ?? this.cfg.embeddingModel;
    if (!model) throw new AiError("INVALID_REQUEST", "Gemini embedding model not configured.", { provider: this.id });
    try {
      const r: any = await (this.client.models as any).embedContent({ model, contents: req.input });
      const vectors = (r.embeddings ?? []).map((e: any) => e.values as number[]);
      if (vectors.length !== req.input.length) throw new AiError("BAD_OUTPUT", "Embedding count mismatch.", { provider: this.id });
      return { vectors, model, provider: this.id, usage: { promptTokens: null, completionTokens: null, totalTokens: null } };
    } catch (e) { throw this.wrap(e); }
  }
}
