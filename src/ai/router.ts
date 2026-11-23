import {
  AiError, AiPolicy, AiProvider, ChatRequest, ChatResponse, EmbedRequest, EmbedResponse, ProviderLocality, StreamChunk,
} from "./types";
import { tryParseJson, validateJsonSchema } from "./jsonSchema";

export interface RouterOptions {
  /** Ordered fallback chain (first = preferred). */
  providers: AiProvider[];
  policy?: AiPolicy;
  maxRetries?: number;          // retries per provider on transient errors (default 2)
  backoffBaseMs?: number;       // default 250, exponential
  breakerThreshold?: number;    // consecutive failures to open (default 3)
  breakerCooldownMs?: number;   // default 30_000
  defaultTimeoutMs?: number;    // default 60_000
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
}

export function allowedLocalities(policy: AiPolicy, sensitivity: "normal" | "locked" = "normal"): ProviderLocality[] {
  if (sensitivity === "locked") return ["local"]; // hard rule: locked/E2E notes never leave the device
  if (policy === "local-only") return ["local"];
  if (policy === "self-host-only") return ["self-host", "local"];
  return ["cloud", "self-host", "local"];
}

interface Breaker { failures: number; openedAt: number | null }

type Need = "chat" | "stream" | "embed";

export class AiRouter {
  private opts: Required<Omit<RouterOptions, "providers">> & { providers: AiProvider[] };
  private breakers = new Map<string, Breaker>();

  constructor(options: RouterOptions) {
    this.opts = {
      policy: "cloud-allowed", maxRetries: 2, backoffBaseMs: 250, breakerThreshold: 3, breakerCooldownMs: 30_000,
      defaultTimeoutMs: 60_000, now: () => Date.now(), sleep: (ms: number) => new Promise<void>((r) => setTimeout(r, ms)),
      ...options,
    } as any;
  }

  setPolicy(policy: AiPolicy) { this.opts.policy = policy; }
  /** A view with a different policy that shares providers and circuit-breaker state (use per request/workspace). */
  withPolicy(policy: AiPolicy): AiRouter {
    const view = Object.create(this) as AiRouter;
    (view as any).opts = { ...this.opts, policy };
    return view;
  }
  get policy() { return this.opts.policy; }

  breakerState(id: string): "closed" | "open" | "half-open" {
    const b = this.breakers.get(id);
    if (!b || b.openedAt === null) return "closed";
    return this.opts.now() - b.openedAt >= this.opts.breakerCooldownMs ? "half-open" : "open";
  }

  private eligible(sensitivity: "normal" | "locked" | undefined, need: Need): AiProvider[] {
    const loc = allowedLocalities(this.opts.policy, sensitivity ?? "normal");
    const byPolicy = this.opts.providers.filter((p) => loc.includes(p.locality));
    if (byPolicy.length === 0) {
      throw new AiError("POLICY_BLOCKED",
        sensitivity === "locked"
          ? "Locked/E2E notes can only be processed by a local provider, and none is configured."
          : `No configured provider is permitted under policy "${this.opts.policy}".`);
    }
    const capable = byPolicy.filter((p) => (need === "embed" ? !!p.embed : need === "stream" ? !!p.stream : true));
    if (capable.length === 0) throw new AiError("AI_UNAVAILABLE", `No permitted provider supports ${need}.`);
    return capable;
  }

  private recordSuccess(id: string) { this.breakers.set(id, { failures: 0, openedAt: null }); }
  private recordFailure(id: string) {
    const b = this.breakers.get(id) ?? { failures: 0, openedAt: null };
    b.failures += 1;
    if (b.failures >= this.opts.breakerThreshold) b.openedAt = this.opts.now();
    this.breakers.set(id, b);
  }

  private timeoutSignal(user: AbortSignal | undefined, ms: number) {
    const ctl = new AbortController();
    let to = false;
    const t = setTimeout(() => { to = true; ctl.abort(); }, ms);
    const onAbort = () => ctl.abort();
    if (user) { if (user.aborted) ctl.abort(); else user.addEventListener("abort", onAbort, { once: true }); }
    return { signal: ctl.signal, timedOut: () => to, cleanup: () => { clearTimeout(t); user?.removeEventListener("abort", onAbort); } };
  }

  private normalize(e: unknown, p: AiProvider, userSignal: AbortSignal | undefined, timedOut: boolean, timeoutMs: number): AiError {
    if (e instanceof AiError) {
      if (timedOut && e.code === "ABORTED") return new AiError("TIMEOUT", `Provider ${p.id} timed out after ${timeoutMs}ms`, { retryable: true, provider: p.id });
      return e;
    }
    if (timedOut) return new AiError("TIMEOUT", `Provider ${p.id} timed out after ${timeoutMs}ms`, { retryable: true, provider: p.id });
    if (userSignal?.aborted) return new AiError("ABORTED", "Request aborted.", { provider: p.id });
    return new AiError("AI_UNAVAILABLE", `Provider ${p.id} failed: ${(e as Error)?.message ?? String(e)}`, { retryable: true, provider: p.id });
  }

  /** Run fn against a single provider with timeout + retry on transient errors only. */
  private async attempt<T>(p: AiProvider, userSignal: AbortSignal | undefined, timeoutMs: number, fn: (signal: AbortSignal) => Promise<T>): Promise<T> {
    for (let i = 0; ; i++) {
      if (userSignal?.aborted) throw new AiError("ABORTED", "Request aborted.", { provider: p.id });
      const t = this.timeoutSignal(userSignal, timeoutMs);
      try {
        return await fn(t.signal);
      } catch (e) {
        const err = this.normalize(e, p, userSignal, t.timedOut(), timeoutMs);
        if (err.code === "ABORTED" || !err.retryable || i >= this.opts.maxRetries) throw err;
        await this.opts.sleep(this.opts.backoffBaseMs * 2 ** i);
      } finally { t.cleanup(); }
    }
  }

  async chat(req: ChatRequest): Promise<ChatResponse> {
    const chain = this.eligible(req.sensitivity, "chat");
    const timeoutMs = req.timeoutMs ?? this.opts.defaultTimeoutMs;
    const errors: AiError[] = [];
    for (const p of chain) {
      if (this.breakerState(p.id) === "open") { errors.push(new AiError("AI_UNAVAILABLE", `Circuit open for ${p.id}`, { provider: p.id })); continue; }
      try {
        const started = this.opts.now();
        const res = await this.attempt(p, req.signal, timeoutMs, async (signal) => {
          const r = await p.chat({ ...req, signal });
          return this.validate(p, req, r);
        });
        this.recordSuccess(p.id);
        return { ...res, provider: p.id, latencyMs: this.opts.now() - started };
      } catch (e) {
        const err = e as AiError;
        if (err.code === "ABORTED" || err.code === "INVALID_REQUEST") throw err;
        this.recordFailure(p.id);
        errors.push(err);
      }
    }
    throw this.summarize(errors);
  }

  /** Validates structured output; BAD_OUTPUT is not retried (same prompt, same model) but falls through the chain. */
  private validate(p: AiProvider, req: ChatRequest, r: ChatResponse): ChatResponse {
    if (!req.jsonSchema) return r;
    const parsed = tryParseJson(r.text);
    if (!parsed.ok) throw new AiError("BAD_OUTPUT", `Provider ${p.id} returned non-JSON output.`, { provider: p.id });
    const issues = validateJsonSchema(parsed.value, req.jsonSchema);
    if (issues.length) throw new AiError("BAD_OUTPUT", `Provider ${p.id} output violates schema: ${issues[0].path} ${issues[0].message}`, { provider: p.id });
    return { ...r, json: parsed.value };
  }

  /** Streams from the first usable provider. Fallback only happens before the first chunk is emitted. */
  async *stream(req: ChatRequest): AsyncGenerator<StreamChunk> {
    const chain = this.eligible(req.sensitivity, "stream");
    const timeoutMs = req.timeoutMs ?? this.opts.defaultTimeoutMs;
    const errors: AiError[] = [];
    for (const p of chain) {
      if (this.breakerState(p.id) === "open") { errors.push(new AiError("AI_UNAVAILABLE", `Circuit open for ${p.id}`, { provider: p.id })); continue; }
      const t = this.timeoutSignal(req.signal, timeoutMs);
      let emitted = false;
      try {
        for await (const chunk of p.stream!({ ...req, signal: t.signal })) { emitted = true; yield { ...chunk, provider: p.id }; }
        this.recordSuccess(p.id);
        return;
      } catch (e) {
        const err = this.normalize(e, p, req.signal, t.timedOut(), timeoutMs);
        if (err.code === "ABORTED") throw err;
        this.recordFailure(p.id);
        if (emitted) throw err; // cannot silently switch providers mid-stream
        errors.push(err);
      } finally { t.cleanup(); }
    }
    throw this.summarize(errors);
  }

  async embed(req: EmbedRequest): Promise<EmbedResponse> {
    const chain = this.eligible(req.sensitivity, "embed");
    const timeoutMs = req.timeoutMs ?? this.opts.defaultTimeoutMs;
    const errors: AiError[] = [];
    for (const p of chain) {
      if (this.breakerState(p.id) === "open") { errors.push(new AiError("AI_UNAVAILABLE", `Circuit open for ${p.id}`, { provider: p.id })); continue; }
      try {
        const res = await this.attempt(p, req.signal, timeoutMs, (signal) => p.embed!({ ...req, signal }));
        this.recordSuccess(p.id);
        return { ...res, provider: p.id };
      } catch (e) {
        const err = e as AiError;
        if (err.code === "ABORTED" || err.code === "INVALID_REQUEST") throw err;
        this.recordFailure(p.id);
        errors.push(err);
      }
    }
    throw this.summarize(errors);
  }

  /** Models from all policy-eligible providers (individual provider failures are omitted). */
  async listModels(signal?: AbortSignal) {
    const loc = allowedLocalities(this.opts.policy);
    const out = [];
    for (const p of this.opts.providers.filter((x) => loc.includes(x.locality) && x.listModels)) {
      try { out.push(...(await p.listModels!(signal))); } catch { /* provider down: omit */ }
    }
    return out;
  }

  private summarize(errors: AiError[]): AiError {
    if (errors.length === 0) return new AiError("AI_UNAVAILABLE", "No AI provider available.");
    const pick = errors.find((e) => e.code === "BAD_OUTPUT") ?? errors.find((e) => e.code === "TIMEOUT") ?? errors[errors.length - 1];
    return new AiError(pick.code, errors.map((e) => `${e.provider ?? "?"}: ${e.message}`).join("; "), { provider: pick.provider });
  }
}
