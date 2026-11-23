import { describe, it, expect } from "vitest";
import { evalExpr, renderTemplate, renderString, checkTemplate, ExprError, LIMITS } from "../../src/flow/expr";
import { validateFlow, hasErrors, emptyFlow, agentToFlow, parseFlowJson } from "../../src/flow/schema";
import { FLOW_TEMPLATES } from "../../src/flow/templates";
import type { FlowGraph } from "../../src/flow/types";

const ctx = { note: { title: "Plan", tags: ["a", "b"], n: 3 }, nodes: { x: { output: { items: [1, 2, 3] } } } };

describe("expr", () => {
  it("evaluates paths, comparisons, boolean ops, ternary", () => {
    expect(evalExpr("note.title == 'Plan'", ctx)).toBe(true);
    expect(evalExpr("note.n > 2 and note.n <= 3", ctx)).toBe(true);
    expect(evalExpr("not (note.n == 3) or false", ctx)).toBe(false);
    expect(evalExpr("note.n > 5 ? 'big' : 'small'", ctx)).toBe("small");
    expect(evalExpr("note.tags[1]", ctx)).toBe("b");
    expect(evalExpr("len(nodes.x.output.items) * 2 + 1", ctx)).toBe(7);
    expect(evalExpr("missing.deep.path ?? 'dflt'", ctx)).toBe("dflt");
    expect(evalExpr("upper(trim('  hi '))", ctx)).toBe("HI");
  });
  it("renders templates, keeping type for a lone placeholder", () => {
    expect(renderTemplate("{{ note.n }}", ctx)).toBe(3);
    expect(renderTemplate("{{ note.tags }}", ctx)).toEqual(["a", "b"]);
    expect(renderString("Title: {{ note.title }}!", ctx)).toBe("Title: Plan!");
    expect(renderString("{{ '}}' + note.title }}", ctx)).toBe("}}Plan");
  });
  it("blocks prototype access and unknown functions", () => {
    expect(evalExpr("note.constructor", ctx)).toBeUndefined();
    expect(evalExpr("note.__proto__", ctx)).toBeUndefined();
    expect(evalExpr("note['constructor']", ctx)).toBeUndefined();
    expect(evalExpr("constructor", ctx)).toBeUndefined();
    expect(() => evalExpr("eval('1')", ctx)).toThrow(ExprError);
    expect(() => evalExpr("note.title.toString()", ctx)).toThrow(ExprError);
    expect(() => evalExpr("(function(){})()", ctx)).toThrow(ExprError);
    expect(() => evalExpr("this.constructor.constructor('return 1')()", ctx)).toThrow(ExprError);
  });
  it("does not execute injected code in note content", () => {
    const evil = { note: { title: "{{ process.exit(1) }}", content: "'); alert(1); ('" } };
    expect(renderString("{{ note.title }}", evil)).toBe("{{ process.exit(1) }}");
    expect(renderString("{{ note.content }}", evil)).toContain("alert(1)");
  });
  it("bounds length, depth, placeholders and division", () => {
    expect(() => evalExpr("1+".repeat(LIMITS.maxExprLength) + "1", ctx)).toThrow(/longer/);
    expect(() => evalExpr("(".repeat(100) + "1" + ")".repeat(100), ctx)).toThrow(/deeply|complex/);
    expect(() => renderTemplate("{{1}}".repeat(LIMITS.maxPlaceholders + 1), ctx)).toThrow(/too many/);
    expect(() => evalExpr("1/0", ctx)).toThrow(/zero/);
    expect(checkTemplate("{{ 1 + }}")).toMatch(/unexpected/);
    expect(checkTemplate("{{ oops")).toMatch(/unterminated/);
  });
});

const base = (): FlowGraph => ({
  ...emptyFlow("f1", "Test"),
  nodes: [
    { id: "trigger", type: "trigger", kind: "manual" },
    { id: "a", type: "action", tool: "tag_note", args: { id: "x", tags: ["t"] } },
  ],
  edges: [{ id: "e1", from: "trigger", port: "ok", to: "a" }],
});
const codes = (f: unknown) => validateFlow(f).filter((i) => i.severity === "error").map((i) => `${i.code}@${i.path}`);

describe("validator", () => {
  it("accepts a minimal flow", () => expect(codes(base())).toEqual([]));
  it("reports dangling edges with precise paths", () => {
    const f = base();
    f.edges.push({ id: "e2", from: "a", port: "ok", to: "ghost" });
    expect(codes(f)).toContain("dangling_edge@edges[1].to");
  });
  it("enforces port rules", () => {
    const f = base();
    f.edges[0].port = "true";
    expect(codes(f)).toContain("bad_port@edges[0].port");
  });
  it("detects unreachable nodes", () => {
    const f = base();
    f.nodes.push({ id: "b", type: "action", tool: "tag_note", args: { id: "x", tags: [] } });
    expect(codes(f)).toContain("unreachable@nodes[2]");
  });
  it("rejects cycles without a loop but allows them through a loop", () => {
    const f = base();
    f.nodes.push({ id: "b", type: "action", tool: "tag_note", args: { id: "x", tags: [] } });
    f.edges.push({ id: "e2", from: "a", port: "ok", to: "b" }, { id: "e3", from: "b", port: "ok", to: "a" });
    expect(codes(f).some((c) => c.startsWith("cycle@"))).toBe(true);

    const g = base();
    g.nodes = [
      { id: "trigger", type: "trigger", kind: "manual" },
      { id: "lp", type: "loop", over: "[1,2]".length ? "trigger.payload.list" : "" },
      { id: "a", type: "action", tool: "tag_note", args: { id: "x", tags: [] } },
    ];
    g.edges = [
      { id: "e1", from: "trigger", port: "ok", to: "lp" },
      { id: "e2", from: "lp", port: "true", to: "a" },
      { id: "e3", from: "a", port: "ok", to: "lp" },
    ];
    expect(codes(g)).toEqual([]);
    g.edges.push({ id: "e4", from: "lp", port: "ok", to: "lp" });
    expect(codes(g)).toContain("loop_exit_cycle@nodes[1]");
  });
  it("enforces the tool allow-list and unknown tools", () => {
    const f = base();
    f.policy.allowedTools = ["create_note"];
    expect(codes(f)).toContain("tool_not_allowed@nodes[1].tool");
    (f.nodes[1] as any).tool = "rm_rf";
    expect(codes(f)).toContain("unknown_tool@nodes[1].tool");
  });
  it("requires budgets", () => {
    const f: any = base();
    delete f.budgets.maxTokens;
    f.budgets.maxSteps = 99999999;
    expect(codes(f)).toEqual(expect.arrayContaining(["budget_missing@budgets.maxTokens", "budget_range@budgets.maxSteps"]));
  });
  it("checks template/expr syntax and duplicate ids", () => {
    const f: any = base();
    f.nodes[1].args.id = "{{ 1 + }}";
    f.nodes.push({ id: "a", type: "branch", when: "(" });
    const c = codes(f);
    expect(c).toContain("template_syntax@nodes[1].args.id");
    expect(c).toContain("duplicate_id@nodes[2].id");
    expect(c).toContain("expr_syntax@nodes[2].when");
  });
  it("rejects garbage input", () => {
    expect(codes(null)).toEqual(["type@$"]);
    expect(parseFlowJson("{nope").issues[0].code).toBe("json");
  });
  it("all starter templates validate cleanly", () => {
    expect(FLOW_TEMPLATES).toHaveLength(7);
    for (const t of FLOW_TEMPLATES) expect(validateFlow(t.flow).filter((i) => i.severity === "error"), t.id).toEqual([]);
  });
});

describe("migration", () => {
  it("maps a legacy agent to a valid flow", () => {
    const f = agentToFlow({
      id: "agent-pm", name: "OKR", description: "d", systemPrompt: "p", autonomyLevel: "require_approval", trigger: "on_note_publish",
      allowedTools: ["search_workspace_notes", "create_workspace_reminders", "organize_notes_into_folders"] as any,
    });
    expect(hasErrors(validateFlow(f))).toBe(false);
    expect((f.nodes[0] as any).kind).toBe("note.published");
    const agent: any = f.nodes[1];
    expect(agent.mode).toBe("approve_writes");
    expect(agent.tools).toEqual(["search_notes", "get_note", "create_reminder", "move_note", "tag_note"]);
  });
});
