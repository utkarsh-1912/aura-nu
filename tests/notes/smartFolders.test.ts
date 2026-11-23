import { describe, it, expect } from "vitest";
import { evaluateSmartFolder, validateRule, PRESET_RULES, SmartNote, Rule } from "../../src/core/smartFolders";

const NOW = Date.parse("2026-06-15T12:00:00Z");
const n = (id: string, o: Partial<SmartNote> = {}): SmartNote => ({
  id, title: id, content: "", tags: [], createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-06-14T00:00:00Z", ...o,
});
const notes = [
  n("a", { tags: ["Work", "urgent"], content: "- [ ] ship it", isPinned: true, folder: "Work/Q2" }),
  n("b", { tags: ["home"], content: "- [x] done\n| a | b |\n| - | - |", updatedAt: "2026-03-01T00:00:00Z", folder: "Home" }),
  n("c", { tags: ["work"], content: "see [[a]] ```\ncode\n```", isTrashed: true }),
  n("d", { content: "plain budget text", isShared: true, createdAt: "2026-06-10T00:00:00Z" }),
];
const ids = (r: unknown) => evaluateSmartFolder(r, notes, NOW).map((x) => x.id);
const c = (field: string, op: string, value?: unknown): Rule => ({ type: "cond", field, op, value });

describe("smart folders", () => {
  it("tags (case-insens), trashed excluded by default", () => {
    expect(ids(c("tag", "has", "work"))).toEqual(["a"]);
    expect(ids(c("tag", "hasAny", ["home", "urgent"]))).toEqual(["a", "b"]);
    expect(ids(c("tag", "hasNone", "work"))).toEqual(["b", "d"]);
  });
  it("trashed only when mentioned", () => expect(ids(c("trashed", "is", true))).toEqual(["c"]));
  it("text, title, folder", () => {
    expect(ids(c("text", "contains", "BUDGET"))).toEqual(["d"]);
    expect(ids(c("folder", "under", "Work"))).toEqual(["a"]);
    expect(ids(c("folder", "is", "Work"))).toEqual([]);
  });
  it("structure predicates", () => {
    expect(ids(c("hasChecklist", "is", true))).toEqual(["a", "b"]);
    expect(ids(c("hasUncheckedTasks", "is", true))).toEqual(["a"]);
    expect(ids(c("hasTable", "is", true))).toEqual(["b"]);
  });
  it("dates", () => {
    expect(ids(c("updatedAt", "withinDays", 7))).toEqual(["a", "d"]);
    expect(ids(c("createdAt", "after", "2026-06-01T00:00:00Z"))).toEqual(["d"]);
    expect(ids(c("updatedAt", "between", ["2026-02-01T00:00:00Z", "2026-04-01T00:00:00Z"]))).toEqual(["b"]);
  });
  it("AND/OR/NOT groups", () => {
    const r: Rule = { type: "group", op: "and", rules: [
      { type: "group", op: "or", rules: [c("pinned", "is", true), c("shared", "is", true)] },
      { type: "group", op: "and", not: true, rules: [c("tag", "has", "urgent")] },
    ] };
    expect(ids(r)).toEqual(["d"]);
  });
  it("is JSON round-trippable and validated", () => {
    const r = JSON.parse(JSON.stringify(PRESET_RULES["Pinned"]));
    expect(ids(r)).toEqual(["a"]);
    expect(validateRule({ type: "cond", field: "nope", op: "x" }).ok).toBe(false);
    expect(validateRule(c("pinned", "is", "yes")).ok).toBe(false);
    expect(validateRule(c("tag", "contains", "x")).ok).toBe(false);
    expect(ids({ type: "cond", field: "nope", op: "x" })).toEqual([]);
  });
  it("bounds nesting depth", () => {
    let r: Rule = c("pinned", "is", true);
    for (let i = 0; i < 10; i++) r = { type: "group", op: "and", rules: [r] };
    expect(validateRule(r).ok).toBe(false);
  });
});
