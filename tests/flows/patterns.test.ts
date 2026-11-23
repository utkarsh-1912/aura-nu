import { describe, it, expect } from "vitest";
import { FlowExecutor } from "../../src/flow/executor";
import { MemoryRunStore } from "../../src/flow/stores";
import { MemoryWorkspace, MockAiClient } from "../../src/flow/mock";
import { createToolRegistry } from "../../src/flow/tools";
import { emptyFlow, validateFlow } from "../../src/flow/schema";
import { cloneTemplateFlow } from "../../src/flow/templates";
import { McpRegistry, qualifiedMcpName } from "../../src/flow/mcp";
import { FlowAiError } from "../../src/flow/types";
import type { AiClient, FlowEdge, FlowGraph, FlowNode, NoteRef, SupervisorNode } from "../../src/flow/types";

const N = (id: string, o: Partial<NoteRef> = {}): NoteRef => ({ id, title: `Note ${id}`, content: `content ${id}`, tags: [], folder: "Inbox", ...o });
const flow = (nodes: FlowNode[], edges: [string, FlowEdge["port"], string][], patch: Partial<FlowGraph> = {}): FlowGraph => ({
  ...emptyFlow("f", "F"),
  nodes: [{ id: "trigger", type: "trigger", kind: "manual" }, ...nodes],
  edges: edges.map(([from, port, to], i) => ({ id: `e${i}`, from, port, to })),
  ...patch,
});
function setup(ai: AiClient = new MockAiClient(), notes = [N("1"), N("2"), N("3"), N("4")], aiTimeoutMs?: number) {
  const ws = new MemoryWorkspace(notes);
  const store = new MemoryRunStore();
  const ex = new FlowExecutor({ store, tools: createToolRegistry(), workspace: ws, ai, aiTimeoutMs, sleep: async () => undefined });
  return { ex, ws, store };
}
const sup = (o: Partial<SupervisorNode> = {}): SupervisorNode => ({
  id: "sup", type: "supervisor", goal: "triage", fanOut: "trigger.payload.ids", workerGoal: "look at {{ item }}", workerTools: ["get_note"],
  workerMaxSteps: 3, workerMode: "act", maxWorkers: 10, concurrency: 2, ...o,
});
const input = { payload: { ids: ["1", "2", "3", "4"] } };

describe("supervisor fan-out / fan-in", () => {
  it("runs one worker per item and collects results in order", async () => {
    const { ex, store } = setup();
    const run = await ex.start(flow([sup()], [["trigger", "ok", "sup"]]), { input });
    expect(run.status).toBe("completed");
    const out = (await store.getSteps(run.id)).find((s) => s.key === "sup")!.output as any;
    expect(out.count).toBe(4);
    expect(out.workers.map((w: any) => w.index)).toEqual([0, 1, 2, 3]);
    expect(out.workers.every((w: any) => w.status === "completed")).toBe(true);
  });
  it("never exceeds the concurrency limit", async () => {
    let active = 0, peak = 0;
    const base = new MockAiClient();
    const ai: AiClient = {
      complete: (r) => base.complete(r),
      agentStep: async (r) => { active++; peak = Math.max(peak, active); await new Promise((x) => setTimeout(x, 15)); active--; return base.agentStep(r); },
    };
    const { ex } = setup(ai);
    await ex.start(flow([sup({ concurrency: 2 })], [["trigger", "ok", "sup"]]), { input });
    expect(peak).toBe(2);
    const b = setup(ai);
    peak = 0;
    await b.ex.start(flow([sup({ concurrency: 1 })], [["trigger", "ok", "sup"]]), { input });
    expect(peak).toBe(1);
  });
  it("a failing worker is reported, the others still finish; synthesis runs", async () => {
    const base = new MockAiClient();
    let calls = 0;
    const ai: AiClient = { complete: (r) => base.complete(r), agentStep: async (r) => { if (r.goal.includes("look at 2")) throw new FlowAiError("POLICY_BLOCKED", "blocked"); calls++; return base.agentStep(r); } };
    const { ex, store } = setup(ai);
    const run = await ex.start(flow([sup({ synthesize: true })], [["trigger", "ok", "sup"]]), { input });
    expect(run.status).toBe("completed");
    const out = (await store.getSteps(run.id)).find((s) => s.key === "sup")!.output as any;
    expect(out.workers.map((w: any) => w.status)).toEqual(["completed", "failed", "completed", "completed"]);
    expect(out.workers[1].error).toMatch(/POLICY_BLOCKED/);
    expect(out.synthesis).toContain("[MOCK]");
    expect(calls).toBeGreaterThan(0);
  });
  it("fails when fan-out exceeds maxWorkers", async () => {
    const { ex } = setup();
    const run = await ex.start(flow([sup({ maxWorkers: 2 })], [["trigger", "ok", "sup"]]), { input });
    expect(run.status).toBe("failed");
    expect(run.error).toMatch(/worker limit/);
  });
  it("pauses on a worker approval then resumes without re-running finished workers", async () => {
    const base = new MockAiClient();
    let steps = 0;
    const ai: AiClient = { complete: (r) => base.complete(r), agentStep: async (r) => { steps++; return r.history.length ? base.agentStep(r) : { action: { type: "tool_call", tool: "tag_note", args: { id: "1", tags: ["x"] } }, tokens: { input: 1, output: 1 } }; } };
    const { ex, ws } = setup(ai);
    const g = flow([sup({ fanOut: "trigger.payload.ids", workerTools: ["tag_note"], workerMode: "approve_writes", concurrency: 1, maxWorkers: 1 })], [["trigger", "ok", "sup"]]);
    let run = await ex.start(g, { input: { payload: { ids: ["1"] } } });
    expect(run.status).toBe("paused_approval");
    const [wait] = await ex.pendingApprovals(run.id);
    run = await ex.resolveApproval(run.id, wait.key, { approved: true, by: "me" });
    expect(run.status).toBe("completed");
    expect(ws.notes.get("1")!.tags).toEqual(["x"]);
    expect(ws.writes.filter((w) => w.op === "addTags")).toHaveLength(1);
    expect(steps).toBeGreaterThan(0);
  });
  it("validator checks supervisor fields", () => {
    const g = flow([sup({ concurrency: 99, maxWorkers: 0, fanOut: "" })], [["trigger", "ok", "sup"]]);
    const codes = validateFlow(g).filter((i) => i.severity === "error").map((i) => i.path);
    expect(codes).toEqual(expect.arrayContaining(["nodes[1].concurrency", "nodes[1].maxWorkers", "nodes[1].fanOut"]));
  });
});

describe("critic", () => {
  const mk = (subject: string) => flow(
    [{ id: "critic", type: "critic", criteria: "be accurate", subject }, { id: "save", type: "action", tool: "create_note", args: { title: "T", content: "C" } }],
    [["trigger", "ok", "critic"], ["critic", "true", "save"]],
    { policy: { allowedTools: ["create_note"], requireApprovalForUntrusted: true, requireCriticBeforeWrites: true } },
  );
  it("approved content flows to the write; rejected content never writes", async () => {
    const a = setup();
    expect((await a.ex.start(mk("good text"), {})).status).toBe("completed");
    expect([...a.ws.notes.values()].some((n) => n.title === "T")).toBe(true);
    const b = setup();
    const r = await b.ex.start(mk("bad [MOCK-REJECT]"), {});
    expect(r.status).toBe("completed");
    expect([...b.ws.notes.values()].some((n) => n.title === "T")).toBe(false);
    expect((await b.store.getSteps(r.id)).find((s) => s.nodeId === "critic")!.port).toBe("false");
  });
  it("critic output must match its schema (BAD_OUTPUT fails the run)", async () => {
    const ai: AiClient = { complete: async () => ({ text: "yes", tokens: { input: 1, output: 1 }, json: { approved: "yes" } }), agentStep: new MockAiClient().agentStep };
    const { ex } = setup(ai);
    const r = await ex.start(mk("x"), {});
    expect(r.status).toBe("failed");
    expect(r.error).toMatch(/BAD_OUTPUT/);
  });
  it("policy.requireCriticBeforeWrites rejects unguarded writes (action, agent, supervisor)", () => {
    const policy = { allowedTools: ["create_note", "get_note", "tag_note"] as any, requireApprovalForUntrusted: true, requireCriticBeforeWrites: true };
    const direct = flow([{ id: "save", type: "action", tool: "create_note", args: { title: "T", content: "C" } }], [["trigger", "ok", "save"]], { policy });
    expect(validateFlow(direct).some((i) => i.code === "critic_required")).toBe(true);
    const viaFalse = flow([{ id: "critic", type: "critic", criteria: "c", subject: "s" }, { id: "save", type: "action", tool: "create_note", args: { title: "T", content: "C" } }], [["trigger", "ok", "critic"], ["critic", "false", "save"]], { policy });
    expect(validateFlow(viaFalse).some((i) => i.code === "critic_required")).toBe(true);
    const agent = flow([{ id: "a", type: "agent", agentId: "a", goal: "g", maxSteps: 2, tools: ["tag_note"], mode: "act" }], [["trigger", "ok", "a"]], { policy });
    expect(validateFlow(agent).some((i) => i.code === "critic_required")).toBe(true);
    const proposeOnly = flow([{ id: "a", type: "agent", agentId: "a", goal: "g", maxSteps: 2, tools: ["tag_note"], mode: "propose_only" }], [["trigger", "ok", "a"]], { policy });
    expect(validateFlow(proposeOnly).some((i) => i.code === "critic_required")).toBe(false);
    const s = flow([sup({ workerTools: ["tag_note"] })], [["trigger", "ok", "sup"]], { policy });
    expect(validateFlow(s).some((i) => i.code === "critic_required")).toBe(true);
    const off = flow([{ id: "save", type: "action", tool: "create_note", args: { title: "T", content: "C" } }], [["trigger", "ok", "save"]], { policy: { ...policy, requireCriticBeforeWrites: false } });
    expect(validateFlow(off).some((i) => i.code === "critic_required")).toBe(false);
  });
});

describe("templates", () => {
  it("research synthesis with critic completes and saves a critic-approved briefing", async () => {
    const { ex, ws } = setup();
    const r = await ex.start(cloneTemplateFlow("tpl_research_critic", "m"), { input: { payload: { topic: "sync" } } });
    expect(r.status).toBe("completed");
    expect([...ws.notes.values()].find((n) => n.title === "Briefing: sync")?.tags).toContain("critic-approved");
  });
  it("supervised triage fans out over inbox notes and saves a report", async () => {
    const { ex, ws } = setup();
    const r = await ex.start(cloneTemplateFlow("tpl_supervised_triage", "m"), {});
    expect(r.status).toBe("completed");
    expect([...ws.notes.values()].some((n) => n.title === "Inbox triage report")).toBe(true);
  });
});

describe("AI timeouts and typed errors", () => {
  const aiFlow = flow([{ id: "ai", type: "ai", task: "summarize", prompt: "hi", retry: { maxAttempts: 1, baseDelayMs: 0 } }], [["trigger", "ok", "ai"]]);
  it("a hung AI call fails with TIMEOUT and aborts the signal", async () => {
    let aborted = false;
    const ai: AiClient = { complete: (r) => new Promise((_res, rej) => r.signal?.addEventListener("abort", () => { aborted = true; rej(new Error("x")); })), agentStep: new MockAiClient().agentStep };
    const { ex } = setup(ai, undefined, 30);
    const r = await ex.start(aiFlow, {});
    expect(r.status).toBe("failed");
    expect(r.error).toMatch(/TIMEOUT/);
    expect(aborted).toBe(true);
  });
  it("AI_UNAVAILABLE and POLICY_BLOCKED fail honestly; POLICY_BLOCKED is not retried", async () => {
    for (const code of ["AI_UNAVAILABLE", "POLICY_BLOCKED"] as const) {
      let calls = 0;
      const ai: AiClient = { complete: async () => { calls++; throw new FlowAiError(code, "no model"); }, agentStep: new MockAiClient().agentStep };
      const { ex } = setup(ai);
      const g = flow([{ id: "ai", type: "ai", task: "summarize", prompt: "hi", retry: { maxAttempts: 3, baseDelayMs: 0 } }], [["trigger", "ok", "ai"]]);
      const r = await ex.start(g, {});
      expect(r.status).toBe("failed");
      expect(r.error).toContain(code);
      expect(calls).toBe(code === "POLICY_BLOCKED" ? 1 : 3);
    }
  });
  it("tainted prompts are flagged to the AI client", async () => {
    const seen: boolean[] = [];
    const ai: AiClient = { complete: async (r) => { seen.push(!!r.tainted); return { text: "ok", tokens: { input: 1, output: 1 } }; }, agentStep: new MockAiClient().agentStep };
    const { ex } = setup(ai);
    const g = flow([{ id: "ai", type: "ai", task: "summarize", prompt: "{{ note.content }}" }], [["trigger", "ok", "ai"]]);
    await ex.start(g, { input: { note: N("1") } });
    expect(seen).toEqual([true]);
  });
});

describe("MCP registry", () => {
  const desc = (name: string, writes = false) => ({ name, description: name, schema: { type: "object" as const, required: ["q"], properties: { q: { type: "string" as const } } }, risk: writes ? ("high" as const) : ("read" as const), writes, returnsUntrusted: true });
  const calls: any[] = [];
  const mk = () => {
    const r = new McpRegistry({ call: async (s, t, a) => { calls.push([s, t, a]); return { ok: true }; } });
    r.register({ id: "wiki", label: "Wiki", tools: [desc("search"), desc("edit", true), desc("hidden")], allowTools: ["search", "edit"] });
    return r;
  };
  const ctx = { runId: "r", idempotencyKey: "k", dryRun: false };
  it("lists only allow-listed tools; blocks others", async () => {
    const r = mk();
    expect(r.list().map((t) => t.name)).toEqual([qualifiedMcpName("wiki", "search"), qualifiedMcpName("wiki", "edit")]);
    await expect(r.call("mcp:wiki/hidden", { q: "x" }, ctx)).rejects.toMatchObject({ code: "NOT_ALLOWED" });
    await expect(r.call("mcp:nope/x", { q: "x" }, ctx)).rejects.toMatchObject({ code: "NOT_ALLOWED" });
  });
  it("approval policy: writes always need approval; dry-run never calls out; args validated", async () => {
    const r = mk();
    expect(r.decide("mcp:wiki/search", { tainted: true })).toMatchObject({ allowed: true, needsApproval: false });
    expect(r.decide("mcp:wiki/edit", { tainted: false }).needsApproval).toBe(true);
    await expect(r.call("mcp:wiki/edit", { q: "x" }, ctx)).rejects.toThrow(/approval/);
    calls.length = 0;
    expect(await r.call("mcp:wiki/edit", { q: "x" }, { ...ctx, approved: true, dryRun: true })).toMatchObject({ dryRun: true });
    expect(calls).toHaveLength(0);
    await r.call("mcp:wiki/edit", { q: "x" }, { ...ctx, approved: true });
    expect(calls).toHaveLength(1);
    await expect(r.call("mcp:wiki/search", { q: 5 }, ctx)).rejects.toMatchObject({ code: "INVALID_ARGS" });
  });
  it("no transport => NO_TRANSPORT; allow-list must name real tools", async () => {
    const r = new McpRegistry();
    r.register({ id: "s", label: "s", tools: [desc("t")], allowTools: ["t"] });
    await expect(r.call("mcp:s/t", { q: "x" }, ctx)).rejects.toMatchObject({ code: "NO_TRANSPORT" });
    expect(() => r.register({ id: "z", label: "z", tools: [desc("t")], allowTools: ["missing"] })).toThrow();
    r.register({ id: "empty", label: "e", tools: [desc("t")], allowTools: [] });
    expect(r.decide("mcp:empty/t", { tainted: false }).allowed).toBe(false);
  });
});
