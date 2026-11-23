import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { OpenAiCompatibleProvider } from "../../src/ai/adapters/openaiCompatible";
import { AiRouter } from "../../src/ai/router";

let server: http.Server;
let base = "";
let lastBody: any; let lastAuth: string | undefined;
let mode = "ok";

beforeAll(async () => {
  server = http.createServer((req, res) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      lastAuth = req.headers.authorization;
      lastBody = raw ? JSON.parse(raw) : undefined;
      const url = req.url ?? "";
      if (mode === "500") { res.statusCode = 500; return res.end("upstream exploded"); }
      if (mode === "400") { res.statusCode = 400; return res.end("bad schema"); }
      if (mode === "429") { res.statusCode = 429; return res.end("slow down"); }
      if (mode === "hang") return; // never respond
      if (url.endsWith("/models")) { res.setHeader("content-type", "application/json"); return res.end(JSON.stringify({ data: [{ id: "m1" }, { id: "m2" }] })); }
      if (url.endsWith("/embeddings")) {
        res.setHeader("content-type", "application/json");
        const n = lastBody.input.length;
        // return out of order to verify index sorting
        const data = Array.from({ length: n }, (_, i) => ({ index: i, embedding: [i, 1] })).reverse();
        return res.end(JSON.stringify({ model: "emb", data, usage: { prompt_tokens: 3, total_tokens: 3 } }));
      }
      if (lastBody?.stream) {
        res.setHeader("content-type", "text/event-stream");
        const send = (o: unknown) => res.write(`data: ${JSON.stringify(o)}\n\n`);
        if (mode === "stream-tools") {
          send({ choices: [{ delta: { tool_calls: [{ index: 0, id: "c1", function: { name: "create_", arguments: '{"ti' } }] } }] });
          send({ choices: [{ delta: { tool_calls: [{ index: 0, function: { name: "note", arguments: 'tle":"x"}' } }] } }] });
        } else if (mode === "stream-cut") {
          send({ choices: [{ delta: { content: "par" } }] });
          return res.end(); // no [DONE]
        } else {
          send({ choices: [{ delta: { content: "Hel" } }] });
          // split a frame across writes
          res.write('data: {"choices":[{"delta":{"con');
          setTimeout(() => {
            res.write('tent":"lo"}}]}\n\n');
            send({ choices: [], usage: { prompt_tokens: 5, completion_tokens: 2, total_tokens: 7 } });
            res.write("data: [DONE]\n\n"); res.end();
          }, 5);
          return;
        }
        res.write("data: [DONE]\n\n"); return res.end();
      }
      res.setHeader("content-type", "application/json");
      if (mode === "tool-chat") {
        return res.end(JSON.stringify({ model: "x", choices: [{ finish_reason: "tool_calls", message: { content: null, tool_calls: [{ id: "t1", function: { name: "f", arguments: '{"a":1}' } }] } }] }));
      }
      if (mode === "bad-args") {
        return res.end(JSON.stringify({ choices: [{ finish_reason: "tool_calls", message: { tool_calls: [{ id: "t1", function: { name: "f", arguments: "{oops" } }] } }] }));
      }
      res.end(JSON.stringify({ model: "served-model", choices: [{ finish_reason: "stop", message: { content: "pong" } }], usage: { prompt_tokens: 4, completion_tokens: 1, total_tokens: 5 } }));
    });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/v1/`;
});
afterAll(() => { server.closeAllConnections?.(); server.close(); });
beforeEach(() => { mode = "ok"; lastBody = undefined; lastAuth = undefined; });

const mk = () => new OpenAiCompatibleProvider({ id: "oai", baseUrl: base, locality: "self-host", defaultModel: "dm", defaultEmbeddingModel: "em", apiKey: "k" });
const req = { messages: [{ role: "user" as const, content: "ping" }] };

describe("OpenAiCompatibleProvider", () => {
  it("chat: maps request and response, sends bearer key", async () => {
    const r = await mk().chat({ ...req, temperature: 0, maxTokens: 10, jsonSchema: { type: "object" } });
    expect(r.text).toBe("pong");
    expect(r.model).toBe("served-model");
    expect(r.usage).toEqual({ promptTokens: 4, completionTokens: 1, totalTokens: 5 });
    expect(lastAuth).toBe("Bearer k");
    expect(lastBody.model).toBe("dm");
    expect(lastBody.response_format.type).toBe("json_schema");
    expect(lastBody.max_tokens).toBe(10);
  });
  it("tool calls parsed", async () => {
    mode = "tool-chat";
    const r = await mk().chat({ ...req, tools: [{ name: "f", description: "d", parameters: { type: "object" } }] });
    expect(r.toolCalls).toEqual([{ id: "t1", name: "f", arguments: { a: 1 } }]);
    expect(r.finishReason).toBe("tool_calls");
    expect(lastBody.tools[0].function.name).toBe("f");
  });
  it("malformed tool-call args -> BAD_OUTPUT", async () => {
    mode = "bad-args";
    await expect(mk().chat(req)).rejects.toMatchObject({ code: "BAD_OUTPUT" });
  });
  it("SSE streaming incl. split frames and usage", async () => {
    mode = "stream";
    let text = ""; let usage: any; let done = false;
    for await (const c of mk().stream(req)) { if (c.delta) text += c.delta; if (c.usage) usage = c.usage; if (c.done) done = true; }
    expect(text).toBe("Hello");
    expect(usage.totalTokens).toBe(7);
    expect(done).toBe(true);
    expect(lastBody.stream).toBe(true);
  });
  it("SSE streaming assembles tool-call fragments", async () => {
    mode = "stream-tools";
    let calls: any[] = [];
    for await (const c of mk().stream(req)) if (c.toolCalls) calls = c.toolCalls;
    expect(calls).toEqual([{ id: "c1", name: "create_note", arguments: { title: "x" } }]);
  });
  it("truncated stream is a retryable AI_UNAVAILABLE", async () => {
    mode = "stream-cut";
    await expect((async () => { for await (const _ of mk().stream(req)) { /* */ } })()).rejects.toMatchObject({ code: "AI_UNAVAILABLE", retryable: true });
  });
  it("HTTP errors are typed: 500/429 retryable, 400 INVALID_REQUEST", async () => {
    mode = "500"; await expect(mk().chat(req)).rejects.toMatchObject({ code: "AI_UNAVAILABLE", retryable: true, status: 500 });
    mode = "429"; await expect(mk().chat(req)).rejects.toMatchObject({ retryable: true, status: 429 });
    mode = "400"; await expect(mk().chat(req)).rejects.toMatchObject({ code: "INVALID_REQUEST" });
  });
  it("timeout -> TIMEOUT", async () => {
    mode = "hang";
    await expect(mk().chat({ ...req, timeoutMs: 50 })).rejects.toMatchObject({ code: "TIMEOUT" });
  });
  it("abort -> ABORTED", async () => {
    mode = "hang";
    const ctl = new AbortController(); setTimeout(() => ctl.abort(), 20);
    await expect(mk().chat({ ...req, signal: ctl.signal })).rejects.toMatchObject({ code: "ABORTED" });
  });
  it("unreachable server -> retryable AI_UNAVAILABLE", async () => {
    const p = new OpenAiCompatibleProvider({ id: "dead", baseUrl: "http://127.0.0.1:1/v1", locality: "local", defaultModel: "m" });
    await expect(p.chat(req)).rejects.toMatchObject({ code: "AI_UNAVAILABLE", retryable: true });
  });
  it("embed sorts by index; listModels", async () => {
    const e = await mk().embed({ input: ["a", "b", "c"] });
    expect(e.vectors).toEqual([[0, 1], [1, 1], [2, 1]]);
    expect(e.usage.promptTokens).toBe(3);
    expect((await mk().listModels()).map((m) => m.id)).toEqual(["m1", "m2"]);
  });
  it("works through the router (retry on 500 then typed failure)", async () => {
    mode = "500";
    const router = new AiRouter({ providers: [mk()], sleep: async () => {}, maxRetries: 1 });
    await expect(router.chat(req)).rejects.toMatchObject({ code: "AI_UNAVAILABLE" });
  });
  it("no model -> INVALID_REQUEST", async () => {
    const p = new OpenAiCompatibleProvider({ id: "x", baseUrl: base, locality: "local" });
    await expect(p.chat(req)).rejects.toMatchObject({ code: "INVALID_REQUEST" });
  });
});
