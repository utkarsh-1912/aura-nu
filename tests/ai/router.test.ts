import { describe, it, expect } from "vitest";
import { AiRouter } from "../../src/ai/router";
import { AiError } from "../../src/ai/types";
import { FakeProvider, ok } from "./fakes";

const req = { messages: [{ role: "user" as const, content: "hi" }] };
const noSleep = async () => {};
const mk = (providers: FakeProvider[], extra = {}) => new AiRouter({ providers, sleep: noSleep, ...extra });

describe("AiRouter policy", () => {
  const cloud = new FakeProvider("cloud", "cloud");
  const host = new FakeProvider("host", "self-host");
  const local = new FakeProvider("local", "local");
  it("cloud-allowed uses first provider in chain", async () => {
    const r = await mk([new FakeProvider("cloud", "cloud"), new FakeProvider("local", "local")]).chat(req);
    expect(r.provider).toBe("cloud");
  });
  it("self-host-only skips cloud", async () => {
    const r = await mk([cloud, host, local], { policy: "self-host-only" }).chat(req);
    expect(r.provider).toBe("host");
  });
  it("local-only skips cloud and self-host", async () => {
    const c = new FakeProvider("c", "cloud"); const h = new FakeProvider("h", "self-host");
    const r = await mk([c, h, new FakeProvider("l", "local")], { policy: "local-only" }).chat(req);
    expect(r.provider).toBe("l");
    expect(c.calls + h.calls).toBe(0);
  });
  it("POLICY_BLOCKED when nothing permitted", async () => {
    await expect(mk([new FakeProvider("c", "cloud")], { policy: "local-only" }).chat(req)).rejects.toMatchObject({ code: "POLICY_BLOCKED" });
  });
  it("locked notes only reach local providers even under cloud-allowed", async () => {
    const c = new FakeProvider("c", "cloud");
    const r = await mk([c, new FakeProvider("l", "local")]).chat({ ...req, sensitivity: "locked" });
    expect(r.provider).toBe("l");
    expect(c.calls).toBe(0);
    await expect(mk([c]).chat({ ...req, sensitivity: "locked" })).rejects.toMatchObject({ code: "POLICY_BLOCKED" });
    await expect(mk([c]).embed({ input: ["x"], sensitivity: "locked" })).rejects.toMatchObject({ code: "POLICY_BLOCKED" });
    await expect((async () => { for await (const _ of mk([c]).stream({ ...req, sensitivity: "locked" })) { /* */ } })()).rejects.toMatchObject({ code: "POLICY_BLOCKED" });
  });
  it("withPolicy shares providers but changes policy", async () => {
    const router = mk([new FakeProvider("c", "cloud"), new FakeProvider("l", "local")]);
    expect((await router.withPolicy("local-only").chat(req)).provider).toBe("l");
    expect((await router.chat(req)).provider).toBe("c");
  });
});

describe("AiRouter retry / fallback / breaker", () => {
  it("retries transient errors with backoff then succeeds", async () => {
    const sleeps: number[] = [];
    const p = new FakeProvider("a", "cloud", [new AiError("AI_UNAVAILABLE", "x", { retryable: true }), new AiError("AI_UNAVAILABLE", "x", { retryable: true }), ok("done")]);
    const r = await new AiRouter({ providers: [p], sleep: async (ms) => { sleeps.push(ms); }, backoffBaseMs: 10 }).chat(req);
    expect(r.text).toBe("done");
    expect(p.calls).toBe(3);
    expect(sleeps).toEqual([10, 20]);
  });
  it("does not retry non-transient errors; falls back to next provider", async () => {
    const a = new FakeProvider("a", "cloud", [new AiError("AI_UNAVAILABLE", "401", { retryable: false })]);
    const b = new FakeProvider("b", "cloud", [ok("from b")]);
    const r = await mk([a, b]).chat(req);
    expect(a.calls).toBe(1);
    expect(r.provider).toBe("b");
  });
  it("INVALID_REQUEST is surfaced immediately", async () => {
    const a = new FakeProvider("a", "cloud", [new AiError("INVALID_REQUEST", "bad")]);
    const b = new FakeProvider("b", "cloud");
    await expect(mk([a, b]).chat(req)).rejects.toMatchObject({ code: "INVALID_REQUEST" });
    expect(b.calls).toBe(0);
  });
  it("AI_UNAVAILABLE when all fail", async () => {
    const a = new FakeProvider("a", "cloud", [new Error("boom")]);
    await expect(mk([a], { maxRetries: 1 }).chat(req)).rejects.toMatchObject({ code: "AI_UNAVAILABLE" });
    expect(a.calls).toBe(2);
  });
  it("TIMEOUT when provider hangs", async () => {
    const hang = new FakeProvider("a", "cloud", [(r) => new Promise((_, rej) => r.signal!.addEventListener("abort", () => rej(new Error("aborted"))))]);
    await expect(mk([hang], { maxRetries: 0 }).chat({ ...req, timeoutMs: 20 })).rejects.toMatchObject({ code: "TIMEOUT" });
  });
  it("user abort yields ABORTED and no retry", async () => {
    const ctl = new AbortController();
    const hang = new FakeProvider("a", "cloud", [(r) => new Promise((_, rej) => r.signal!.addEventListener("abort", () => rej(new Error("aborted"))))]);
    const pr = mk([hang]).chat({ ...req, signal: ctl.signal, timeoutMs: 5000 });
    setTimeout(() => ctl.abort(), 10);
    await expect(pr).rejects.toMatchObject({ code: "ABORTED" });
    expect(hang.calls).toBe(1);
  });
  it("validates JSON schema output: BAD_OUTPUT on invalid, json on valid, fallback to next", async () => {
    const schema = { type: "object", required: ["tags"], properties: { tags: { type: "array", items: { type: "string" } } } };
    const bad = new FakeProvider("bad", "cloud", [ok("not json")]);
    await expect(mk([bad]).chat({ ...req, jsonSchema: schema })).rejects.toMatchObject({ code: "BAD_OUTPUT" });
    expect(bad.calls).toBe(1); // not retried
    const wrong = new FakeProvider("wrong", "cloud", [ok('{"tags":[1]}')]);
    const good = new FakeProvider("good", "cloud", [ok('```json\n{"tags":["a"]}\n```')]);
    const r = await mk([wrong, good]).chat({ ...req, jsonSchema: schema });
    expect(r.json).toEqual({ tags: ["a"] });
    expect(r.provider).toBe("good");
  });
  it("circuit breaker opens after threshold, skips provider, half-opens after cooldown", async () => {
    let t = 0;
    const a = new FakeProvider("a", "cloud", [new AiError("AI_UNAVAILABLE", "x"), new AiError("AI_UNAVAILABLE", "x"), ok("back")]);
    const b = new FakeProvider("b", "cloud", [ok("b")]);
    const router = new AiRouter({ providers: [a, b], sleep: noSleep, breakerThreshold: 2, breakerCooldownMs: 1000, now: () => t });
    await router.chat(req); await router.chat(req);
    expect(router.breakerState("a")).toBe("open");
    const callsBefore = a.calls;
    expect((await router.chat(req)).provider).toBe("b");
    expect(a.calls).toBe(callsBefore);
    t = 1500;
    expect(router.breakerState("a")).toBe("half-open");
    expect((await router.chat(req)).provider).toBe("a");
    expect(router.breakerState("a")).toBe("closed");
  });
});

describe("AiRouter stream/embed/models", () => {
  it("streams and tags provider", async () => {
    const chunks: string[] = [];
    for await (const c of mk([new FakeProvider("a", "cloud")]).stream(req)) if (c.delta) chunks.push(c.delta + ":" + c.provider);
    expect(chunks).toEqual(["a:a", "b:a"]);
  });
  it("stream falls back before first chunk but not mid-stream", async () => {
    const a = new FakeProvider("a", "cloud"); a.streamScript = [new AiError("AI_UNAVAILABLE", "down")];
    const b = new FakeProvider("b", "cloud");
    const out: string[] = [];
    for await (const c of mk([a, b]).stream(req)) if (c.delta) out.push(c.delta);
    expect(out).toEqual(["a", "b"]);
    const m = new FakeProvider("m", "cloud"); m.streamScript = [{ delta: "x" }, new AiError("AI_UNAVAILABLE", "cut")];
    await expect((async () => { for await (const _ of mk([m, b]).stream(req)) { /* */ } })()).rejects.toMatchObject({ code: "AI_UNAVAILABLE" });
  });
  it("embed routes by policy", async () => {
    const r = await mk([new FakeProvider("c", "cloud"), new FakeProvider("l", "local")], { policy: "local-only" }).embed({ input: ["a", "b"] });
    expect(r.provider).toBe("l");
    expect(r.vectors).toHaveLength(2);
  });
  it("no providers -> POLICY_BLOCKED", async () => {
    await expect(mk([]).chat(req)).rejects.toMatchObject({ code: "POLICY_BLOCKED" });
  });
});
