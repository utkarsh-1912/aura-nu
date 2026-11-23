import { describe, it, expect } from "vitest";
import express from "express";
import request from "supertest";
import { createAiRouter, type AiMeter } from "../../api/ai/router";
import { AiRouter } from "../../src/ai/router";
import { AiError } from "../../src/ai/types";
import { FakeProvider, ok } from "./fakes";

function app(providers: FakeProvider[], over: Partial<Parameters<typeof createAiRouter>[0]> = {}, email: string | null = "u@x.com") {
  const a = express();
  a.use(express.json());
  a.use((req, _res, next) => { (req as any).userEmail = email; next(); });
  a.use("/api/ai", createAiRouter({ router: new AiRouter({ providers, sleep: async () => {} }), resolvePolicy: () => "cloud-allowed", ...over }));
  return a;
}
const msgs = { messages: [{ role: "user", content: "hello" }] };

describe("api/ai router", () => {
  it("chat happy path", async () => {
    const r = await request(app([new FakeProvider("c", "cloud", [ok("yo")])])).post("/api/ai/chat").send(msgs);
    expect(r.status).toBe(200);
    expect(r.body.text).toBe("yo");
    expect(r.body.provider).toBe("c");
  });
  it("complete converts prompt to messages", async () => {
    const p = new FakeProvider("c", "cloud");
    const r = await request(app([p])).post("/api/ai/complete").send({ prompt: "p", system: "s" });
    expect(r.status).toBe(200);
    expect(p.seen[0].messages.map((m) => m.role)).toEqual(["system", "user"]);
  });
  it("validates input", async () => {
    const a = app([new FakeProvider("c", "cloud")]);
    expect((await request(a).post("/api/ai/chat").send({})).status).toBe(400);
    expect((await request(a).post("/api/ai/chat").send({ messages: [{ role: "root", content: "x" }] })).status).toBe(400);
    expect((await request(a).post("/api/ai/chat").send({ ...msgs, temperature: 9 })).status).toBe(400);
    expect((await request(a).post("/api/ai/chat").send({ ...msgs, tools: [{ name: "bad name!", description: "", parameters: {} }] })).status).toBe(400);
    expect((await request(a).post("/api/ai/embed").send({ input: [] })).status).toBe(400);
    expect((await request(app([new FakeProvider("c", "cloud")], { maxInputChars: 3 })).post("/api/ai/chat").send(msgs)).status).toBe(400);
  });
  it("policy comes from the server; blocked -> 403 and provider is not called", async () => {
    const p = new FakeProvider("c", "cloud");
    const r = await request(app([p], { resolvePolicy: () => "local-only" })).post("/api/ai/chat").send({ ...msgs, policy: "cloud-allowed" });
    expect(r.status).toBe(403);
    expect(r.body.code).toBe("POLICY_BLOCKED");
    expect(p.calls).toBe(0);
  });
  it("sensitivity=locked cannot reach cloud", async () => {
    const p = new FakeProvider("c", "cloud");
    const r = await request(app([p])).post("/api/ai/chat").send({ ...msgs, sensitivity: "locked" });
    expect(r.status).toBe(403);
    expect(p.calls).toBe(0);
  });
  it("error mapping hides upstream detail", async () => {
    const p = new FakeProvider("c", "cloud", [new AiError("AI_UNAVAILABLE", "secret-url http://internal/key=abc")]);
    const r = await request(app([p])).post("/api/ai/chat").send(msgs);
    expect(r.status).toBe(503);
    expect(JSON.stringify(r.body)).not.toContain("secret-url");
    const t = new FakeProvider("t", "cloud", [new AiError("TIMEOUT", "slow")]);
    expect((await request(app([t])).post("/api/ai/chat").send(msgs)).status).toBe(504);
    const b = new FakeProvider("b", "cloud", [ok("nope")]);
    expect((await request(app([b])).post("/api/ai/chat").send({ ...msgs, jsonSchema: { type: "object" } })).status).toBe(502);
  });
  it("meter can reject (429) and records usage", async () => {
    const events: any[] = [];
    const meter: AiMeter = { check: (e) => ({ allowed: e !== "limited@x.com" }), record: (_e, ev) => { events.push(ev); } };
    const p = new FakeProvider("c", "cloud");
    const ok1 = await request(app([p], { meter })).post("/api/ai/chat").send(msgs);
    expect(ok1.status).toBe(200);
    expect(events[0]).toMatchObject({ kind: "chat", provider: "c", ok: true });
    const lim = await request(app([p], { meter }, "limited@x.com")).post("/api/ai/chat").send(msgs);
    expect(lim.status).toBe(429);
  });
  it("allowedModels enforced", async () => {
    const a = app([new FakeProvider("c", "cloud")], { allowedModels: ["good"] });
    expect((await request(a).post("/api/ai/chat").send({ ...msgs, model: "evil" })).status).toBe(400);
    expect((await request(a).post("/api/ai/chat").send({ ...msgs, model: "good" })).status).toBe(200);
  });
  it("unauthenticated is rejected", async () => {
    const r = await request(app([new FakeProvider("c", "cloud")], {}, null)).post("/api/ai/chat").send(msgs);
    expect(r.status).toBe(400);
    expect((await request(app([], {}, null)).get("/api/ai/models")).status).toBe(401);
  });
  it("embed works and streaming emits SSE", async () => {
    const p = new FakeProvider("c", "cloud");
    const e = await request(app([p])).post("/api/ai/embed").send({ input: ["a", "b"] });
    expect(e.status).toBe(200);
    expect(e.body.vectors).toHaveLength(2);
    const s = await request(app([p])).post("/api/ai/chat").send({ ...msgs, stream: true });
    expect(s.status).toBe(200);
    expect(s.text).toContain('"delta":"a"');
    expect(s.text).toContain("[DONE]");
  });
  it("models lists from permitted providers", async () => {
    const p = new FakeProvider("c", "cloud") as any;
    p.listModels = async () => [{ id: "m1", provider: "c" }];
    const r = await request(app([p])).get("/api/ai/models");
    expect(r.body.models).toHaveLength(1);
    expect(r.body.policy).toBe("cloud-allowed");
  });
});
