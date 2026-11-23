import { Router, Request, Response } from "express";
import { getUserEmail } from "../auth";
import { AiRouter } from "../../src/ai/router";
import { AiError, AiPolicy, ChatMessage, ChatRequest, ToolDefinition, Usage } from "../../src/ai/types";

/** Metering hook (interface only). The lead supplies a real implementation (Mongo/Redis/etc). */
export interface AiMeter {
  /** Return {allowed:false} to reject with 429 before any provider is called. */
  check(userEmail: string, kind: "chat" | "embed"): Promise<{ allowed: boolean; reason?: string }> | { allowed: boolean; reason?: string };
  record(userEmail: string, event: { kind: "chat" | "embed"; provider: string; model: string; usage: Usage; latencyMs?: number; ok: boolean; errorCode?: string }): Promise<void> | void;
}

export interface AiRouterDeps {
  router: AiRouter;
  /** Workspace policy is decided SERVER-SIDE; clients cannot choose or loosen it. */
  resolvePolicy: (userEmail: string, workspaceId?: string) => Promise<AiPolicy> | AiPolicy;
  meter?: AiMeter;
  /** If set, client-supplied model ids must be in this list; otherwise the provider default is used. */
  allowedModels?: string[];
  maxInputChars?: number;   // default 200_000
  maxMessages?: number;     // default 50
  maxEmbedInputs?: number;  // default 64
}

const STATUS: Record<string, number> = {
  POLICY_BLOCKED: 403, AI_UNAVAILABLE: 503, TIMEOUT: 504, BAD_OUTPUT: 502, INVALID_REQUEST: 400, ABORTED: 499,
};

function sendError(res: Response, e: unknown) {
  const err = e instanceof AiError ? e : new AiError("AI_UNAVAILABLE", "AI request failed.");
  if (res.headersSent) { res.end(); return; }
  // Do not leak upstream detail (URLs, keys in error text) to clients beyond the typed code + short message.
  const message = err.code === "POLICY_BLOCKED" || err.code === "INVALID_REQUEST" ? err.message : `AI request failed (${err.code}).`;
  res.status(STATUS[err.code] ?? 500).json({ error: message, code: err.code });
}

class ValidationError extends Error {}
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

function validateMessages(v: unknown, deps: Required<Pick<AiRouterDeps, "maxInputChars" | "maxMessages">>): ChatMessage[] {
  if (!Array.isArray(v) || v.length === 0) throw new ValidationError("messages must be a non-empty array");
  if (v.length > deps.maxMessages) throw new ValidationError("too many messages");
  let total = 0;
  return v.map((m, i) => {
    if (!isObj(m) || !["system", "user", "assistant", "tool"].includes(m.role as string) || typeof m.content !== "string") {
      throw new ValidationError(`messages[${i}] is invalid`);
    }
    total += m.content.length;
    if (total > deps.maxInputChars) throw new ValidationError("input too large");
    return { role: m.role as ChatMessage["role"], content: m.content, ...(typeof m.toolCallId === "string" ? { toolCallId: m.toolCallId } : {}) };
  });
}

function validateTools(v: unknown): ToolDefinition[] | undefined {
  if (v === undefined) return undefined;
  if (!Array.isArray(v) || v.length > 32) throw new ValidationError("tools must be an array (max 32)");
  return v.map((t, i) => {
    if (!isObj(t) || typeof t.name !== "string" || !/^[A-Za-z0-9_-]{1,64}$/.test(t.name) || typeof t.description !== "string" || !isObj(t.parameters)) {
      throw new ValidationError(`tools[${i}] is invalid`);
    }
    return { name: t.name, description: t.description.slice(0, 1000), parameters: t.parameters };
  });
}

export function createAiRouter(deps: AiRouterDeps): Router {
  const lim = { maxInputChars: deps.maxInputChars ?? 200_000, maxMessages: deps.maxMessages ?? 50 };
  const maxEmbed = deps.maxEmbedInputs ?? 64;
  const r = Router();

  const prepare = async (req: Request) => {
    const email = getUserEmail(req);
    if (!email) throw new AiError("INVALID_REQUEST", "Unauthenticated.");
    const body = req.body;
    if (!isObj(body)) throw new ValidationError("JSON body required");
    const workspaceId = typeof body.workspaceId === "string" ? body.workspaceId : undefined;
    const policy = await deps.resolvePolicy(email, workspaceId);
    let model: string | undefined;
    if (body.model !== undefined) {
      if (typeof body.model !== "string") throw new ValidationError("model must be a string");
      if (deps.allowedModels && !deps.allowedModels.includes(body.model)) throw new ValidationError("model not allowed");
      model = body.model;
    }
    // Clients may only TIGHTEN handling: "locked" restricts to local providers; anything else is treated as normal.
    const sensitivity = body.sensitivity === "locked" ? ("locked" as const) : ("normal" as const);
    return { email, body, policy, model, sensitivity };
  };

  const guard = async (res: Response, email: string, kind: "chat" | "embed"): Promise<boolean> => {
    if (!deps.meter) return true;
    const c = await deps.meter.check(email, kind);
    if (!c.allowed) { res.status(429).json({ error: c.reason ?? "AI usage limit reached.", code: "RATE_LIMITED" }); return false; }
    return true;
  };

  const handleChat = (forceText: boolean) => async (req: Request, res: Response) => {
    let email = "";
    try {
      const p = await prepare(req); email = p.email;
      const { body } = p;
      let messages: ChatMessage[];
      if (forceText) {
        // /complete: single prompt convenience
        if (typeof body.prompt !== "string" || !body.prompt) throw new ValidationError("prompt is required");
        if (body.prompt.length > lim.maxInputChars) throw new ValidationError("input too large");
        messages = [];
        if (typeof body.system === "string") messages.push({ role: "system", content: body.system.slice(0, 10_000) });
        messages.push({ role: "user", content: body.prompt });
      } else messages = validateMessages(body.messages, lim);

      if (body.temperature !== undefined && (typeof body.temperature !== "number" || body.temperature < 0 || body.temperature > 2)) throw new ValidationError("temperature must be 0..2");
      if (body.maxTokens !== undefined && (!Number.isInteger(body.maxTokens) || (body.maxTokens as number) < 1 || (body.maxTokens as number) > 32_000)) throw new ValidationError("maxTokens must be 1..32000");
      if (body.jsonSchema !== undefined && !isObj(body.jsonSchema)) throw new ValidationError("jsonSchema must be an object");
      if (body.stream !== undefined && typeof body.stream !== "boolean") throw new ValidationError("stream must be boolean");

      const chatReq: ChatRequest = {
        messages, model: p.model, sensitivity: p.sensitivity,
        temperature: body.temperature as number | undefined, maxTokens: body.maxTokens as number | undefined,
        jsonSchema: body.jsonSchema as Record<string, unknown> | undefined, tools: validateTools(body.tools),
      };
      if (!(await guard(res, email, "chat"))) return;
      const routed = deps.router.withPolicy(p.policy);
      const ac = new AbortController();
      res.on("close", () => { if (!res.writableFinished) ac.abort(); });
      chatReq.signal = ac.signal;

      if (body.stream === true && !forceText) {
        res.setHeader("Content-Type", "text/event-stream");
        res.setHeader("Cache-Control", "no-cache");
        res.flushHeaders?.();
        let provider = "", usage: Usage = { promptTokens: null, completionTokens: null, totalTokens: null };
        try {
          for await (const chunk of routed.stream(chatReq)) {
            provider = chunk.provider ?? provider; if (chunk.usage) usage = chunk.usage;
            res.write(`data: ${JSON.stringify(chunk)}\n\n`);
          }
          res.write("data: [DONE]\n\n"); res.end();
          await deps.meter?.record(email, { kind: "chat", provider, model: p.model ?? "", usage, ok: true });
        } catch (e) {
          const err = e instanceof AiError ? e : new AiError("AI_UNAVAILABLE", "stream failed");
          if (!res.writableEnded) { res.write(`event: error\ndata: ${JSON.stringify({ code: err.code })}\n\n`); res.end(); }
          await deps.meter?.record(email, { kind: "chat", provider, model: p.model ?? "", usage, ok: false, errorCode: err.code });
        }
        return;
      }

      try {
        const out = await routed.chat(chatReq);
        await deps.meter?.record(email, { kind: "chat", provider: out.provider, model: out.model, usage: out.usage, latencyMs: out.latencyMs, ok: true });
        res.json({ text: out.text, json: out.json, toolCalls: out.toolCalls, usage: out.usage, model: out.model, provider: out.provider, finishReason: out.finishReason });
      } catch (e) {
        await deps.meter?.record(email, { kind: "chat", provider: "", model: p.model ?? "", usage: { promptTokens: null, completionTokens: null, totalTokens: null }, ok: false, errorCode: (e as AiError).code });
        throw e;
      }
    } catch (e) {
      if (e instanceof ValidationError) return void res.status(400).json({ error: e.message, code: "INVALID_REQUEST" });
      sendError(res, e);
    }
  };

  r.post("/chat", handleChat(false));
  r.post("/complete", handleChat(true));

  r.post("/embed", async (req, res) => {
    try {
      const p = await prepare(req);
      const input = p.body.input;
      if (!Array.isArray(input) || input.length === 0 || input.length > maxEmbed || input.some((x) => typeof x !== "string")) {
        throw new ValidationError(`input must be 1..${maxEmbed} strings`);
      }
      if ((input as string[]).reduce((n, s) => n + s.length, 0) > lim.maxInputChars) throw new ValidationError("input too large");
      if (!(await guard(res, p.email, "embed"))) return;
      const ac = new AbortController();
      res.on("close", () => { if (!res.writableFinished) ac.abort(); });
      const out = await deps.router.withPolicy(p.policy).embed({ input: input as string[], model: p.model, sensitivity: p.sensitivity, signal: ac.signal });
      await deps.meter?.record(p.email, { kind: "embed", provider: out.provider, model: out.model, usage: out.usage, ok: true });
      res.json({ vectors: out.vectors, model: out.model, provider: out.provider, usage: out.usage });
    } catch (e) {
      if (e instanceof ValidationError) return void res.status(400).json({ error: e.message, code: "INVALID_REQUEST" });
      sendError(res, e);
    }
  });

  r.get("/models", async (req, res) => {
    try {
      const email = getUserEmail(req);
      if (!email) return void res.status(401).json({ error: "Unauthenticated." });
      const policy = await deps.resolvePolicy(email, typeof req.query.workspaceId === "string" ? req.query.workspaceId : undefined);
      const models = await deps.router.withPolicy(policy).listModels();
      res.json({ policy, models: deps.allowedModels ? models.filter((m) => deps.allowedModels!.includes(m.id)) : models });
    } catch (e) { sendError(res, e); }
  });

  return r;
}
