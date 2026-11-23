import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { f1, fuzzyMatch, jaccard, jsonSchemaValid, keywordCoverage, mean, percentile, recallAtK } from "../../bench/metrics";
import { formatTable, runBench, type BenchTarget, type BenchTask } from "../../bench/runner";
import { AiError, type ChatRequest } from "../../src/ai/types";
import { fakeEmbed } from "./fakes";

const file = JSON.parse(readFileSync("bench/tasks/aura-bench-v0.json", "utf8"));
const tasks: BenchTask[] = file.tasks;

describe("task file", () => {
  it("has >=30 clearly synthetic tasks across all six kinds with unique ids", () => {
    expect(tasks.length).toBeGreaterThanOrEqual(30);
    expect(new Set(tasks.map((t) => t.id)).size).toBe(tasks.length);
    expect(new Set(tasks.map((t) => t.kind)).size).toBe(6);
    for (const t of tasks) {
      expect(t.synthetic).toBe(true);
      const text = t.note ?? t.instruction ?? t.corpus?.[0]?.text;
      expect(text).toMatch(/^\[SYNTHETIC\]/);
    }
  });
});

describe("metrics", () => {
  it("f1", () => {
    expect(f1(["a", "b"], ["a", "b"]).f1).toBe(1);
    const r = f1(["a", "x"], ["a", "b"]);
    expect(r.precision).toBe(0.5); expect(r.recall).toBe(0.5); expect(r.f1).toBe(0.5);
    expect(f1([], []).f1).toBe(1);
    expect(f1(["a"], []).f1).toBe(0);
    expect(f1(["A "], ["a"]).f1).toBe(1);
    expect(f1(["a", "a"], ["a"]).precision).toBe(0.5); // one-to-one matching
  });
  it("fuzzy matching", () => {
    expect(jaccard("send the sla document", "send them the SLA document")).toBeGreaterThan(0.5);
    expect(f1(["Priya will update the API docs"], ["Priya update the API docs"], fuzzyMatch(0.5)).f1).toBe(1);
  });
  it("keywordCoverage, recall@k, percentile, mean, schema validity", () => {
    expect(keywordCoverage("The Login redesign ships", ["login", "payments"])).toBe(0.5);
    expect(recallAtK(["a", "b", "c"], ["c", "z"], 2)).toBe(0);
    expect(recallAtK(["a", "b", "c"], ["c", "a"], 3)).toBe(1);
    expect(recallAtK(["a", "b", "c"], ["a", "z"], 3)).toBe(0.5);
    expect(percentile([5, 1, 3, 2, 4], 50)).toBe(3);
    expect(percentile([], 50)).toBeNull();
    expect(mean([1, 2, 3])).toBe(2);
    const s = { type: "object", required: ["a"], properties: { a: { type: "string" } } };
    expect(jsonSchemaValid({ a: "x" }, s)).toBe(true);
    expect(jsonSchemaValid({ a: 1 }, s)).toBe(false);
  });
});

/** Fake model that "knows" the answers by reading expectations from a table; proves the runner scores correctly. */
function oracle(): BenchTarget {
  const byNote = new Map<string, BenchTask>();
  for (const t of tasks) { const k = t.note ?? t.instruction; if (k) byNote.set(k, t); }
  return {
    async chat(req: ChatRequest) {
      const user = req.messages[req.messages.length - 1].content;
      const t = [...byNote].find(([k]) => user.includes(k))?.[1];
      const resp = (text: string, extra: any = {}) => ({ text, toolCalls: [], usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 }, model: "o", provider: "o", finishReason: "stop" as const, ...extra });
      if (!t) throw new AiError("AI_UNAVAILABLE", "unknown task");
      switch (t.kind) {
        case "summarize": return resp(t.expectedKeywords.join(" "));
        case "action-items": return resp(JSON.stringify({ items: t.expectedItems }));
        case "tagging": return resp(JSON.stringify({ tags: t.expectedTags }));
        case "folder-routing": return resp(JSON.stringify({ folder: t.expectedFolder }));
        case "tool-call": {
          const def = t.tools.find((x: any) => x.name === t.expectedTool);
          const args = Object.fromEntries(def.parameters.required.map((k: string) => [k, "x"]));
          return resp("", { toolCalls: [{ id: "1", name: t.expectedTool, arguments: args }] });
        }
      }
      throw new Error("n/a");
    },
    async embed(r) { return { vectors: r.input.map((x) => fakeEmbed(x)), model: "e", provider: "o", usage: { promptTokens: null, completionTokens: null, totalTokens: null } }; },
  };
}

describe("runner", () => {
  it("oracle fake provider scores 1.0 on every kind (validates scoring plumbing, NOT any real model)", async () => {
    const { results, summary } = await runBench(tasks, oracle());
    expect(results.length).toBe(tasks.length);
    expect(results.filter((r) => r.error)).toEqual([]);
    for (const s of summary) expect(s.meanScore, s.kind).toBeGreaterThanOrEqual(0.99);
    expect(summary.find((s) => s.kind === "tool-call")!.jsonValidRate).toBe(1);
  });
  it("wrong answers score low; garbage JSON is an error scored 0, not skipped", async () => {
    const wrong: BenchTarget = {
      async chat(req) {
        const base = { toolCalls: [], usage: { promptTokens: null, completionTokens: null, totalTokens: null }, model: "w", provider: "w", finishReason: "stop" as const };
        if (req.tools) return { ...base, text: "", toolCalls: [{ id: "1", name: "search_notes", arguments: { query: 5 } }] };
        return { ...base, text: "not json at all" };
      },
    };
    const { results, summary } = await runBench(tasks.filter((t) => t.kind !== "retrieval"), wrong);
    expect(results.length).toBe(30);
    const tool = summary.find((s) => s.kind === "tool-call")!;
    expect(tool.meanScore).toBe(0);
    expect(tool.jsonValidRate).toBe(0);
    expect(summary.find((s) => s.kind === "tagging")!.errors).toBe(6);
    expect(summary.find((s) => s.kind === "tagging")!.meanScore).toBe(0);
  });
  it("retrieval without embed() errors honestly; deterministic clock gives latency stats; table renders", async () => {
    let t = 0;
    const noEmbed: BenchTarget = { chat: oracle().chat };
    const r = await runBench(tasks.filter((x) => x.kind === "retrieval"), noEmbed, { now: () => (t += 10) });
    expect(r.results.every((x) => x.error?.includes("embed"))).toBe(true);
    expect(r.summary[0].p50Ms).toBe(10);
    const table = formatTable(r.summary, "fake");
    expect(table).toContain("not a validated benchmark");
    expect(table).toContain("retrieval");
  });
  it("kinds filter", async () => {
    const { results } = await runBench(tasks, oracle(), { kinds: ["folder-routing"] });
    expect(results.length).toBe(6);
  });
});
