/**
 * Flat form <-> Rule conversion for the smart-folder dialog. The dialog edits "match ALL / ANY of these
 * conditions"; rules that are nested (groups inside groups / NOT) open in the JSON tab instead.
 */
import type { Cond, Rule } from "../../core/smartFolders";

export type FieldKind = "text" | "tags" | "folder" | "bool" | "number" | "days" | "date";
export interface FieldDef { id: string; label: string; kind: FieldKind; ops: { id: string; label: string }[] }

const BOOL = (id: string, label: string): FieldDef => ({ id, label, kind: "bool", ops: [{ id: "is", label: "is" }] });
export const FIELDS: FieldDef[] = [
  { id: "tag", label: "Tag", kind: "tags", ops: [{ id: "has", label: "has all of" }, { id: "hasAny", label: "has any of" }, { id: "hasNone", label: "has none of" }] },
  { id: "text", label: "Title or text", kind: "text", ops: [{ id: "contains", label: "contains" }, { id: "notContains", label: "does not contain" }] },
  { id: "title", label: "Title", kind: "text", ops: [{ id: "contains", label: "contains" }, { id: "is", label: "is" }] },
  { id: "folder", label: "Folder", kind: "folder", ops: [{ id: "is", label: "is" }] },
  BOOL("pinned", "Pinned"), BOOL("favorite", "Favorite"), BOOL("shared", "Shared"), BOOL("locked", "Locked"),
  BOOL("hasChecklist", "Has checklist"), BOOL("hasUncheckedTasks", "Has open tasks"), BOOL("hasLinks", "Has links"),
  BOOL("hasImages", "Has images"), BOOL("hasTable", "Has table"), BOOL("hasCode", "Has code"),
  { id: "updatedAt", label: "Edited", kind: "days", ops: [{ id: "withinDays", label: "within the last (days)" }, { id: "before", label: "before" }, { id: "after", label: "after" }] },
  { id: "createdAt", label: "Created", kind: "days", ops: [{ id: "withinDays", label: "within the last (days)" }, { id: "before", label: "before" }, { id: "after", label: "after" }] },
  { id: "wordCount", label: "Word count", kind: "number", ops: [{ id: "gt", label: "more than" }, { id: "lt", label: "fewer than" }, { id: "eq", label: "exactly" }] },
];
export const fieldDef = (id: string) => FIELDS.find((f) => f.id === id);

export interface FormCond { field: string; op: string; value: string }
export interface RuleForm { match: "and" | "or"; conds: FormCond[] }

export const blankCond = (): FormCond => ({ field: "tag", op: "has", value: "" });

/** Converts form rows to a Rule; returns an error string for rows that cannot be valid. */
export function formToRule(form: RuleForm): { ok: true; rule: Rule } | { ok: false; error: string } {
  if (form.conds.length === 0) return { ok: false, error: "Add at least one condition." };
  const rules: Cond[] = [];
  for (const c of form.conds) {
    const def = fieldDef(c.field);
    if (!def) return { ok: false, error: `Unknown field ${c.field}` };
    const v = c.value.trim();
    switch (def.kind) {
      case "bool": rules.push({ type: "cond", field: c.field, op: "is", value: c.value !== "false" }); break;
      case "tags": {
        const tags = v.split(",").map((t) => t.trim().replace(/^#/, "")).filter(Boolean);
        if (!tags.length) return { ok: false, error: "Enter at least one tag (comma separated)." };
        rules.push({ type: "cond", field: c.field, op: c.op, value: tags }); break;
      }
      case "number": {
        const n = Number(v);
        if (v === "" || !isFinite(n)) return { ok: false, error: `${def.label} needs a number.` };
        rules.push({ type: "cond", field: c.field, op: c.op, value: n }); break;
      }
      case "days": {
        if (c.op === "withinDays") {
          const n = Number(v);
          if (v === "" || !isFinite(n) || n < 0) return { ok: false, error: `${def.label}: enter a number of days.` };
          rules.push({ type: "cond", field: c.field, op: c.op, value: n });
        } else {
          if (!v || isNaN(Date.parse(v))) return { ok: false, error: `${def.label}: pick a date.` };
          rules.push({ type: "cond", field: c.field, op: c.op, value: new Date(v).toISOString() });
        }
        break;
      }
      default:
        if (!v) return { ok: false, error: `${def.label}: enter a value.` };
        rules.push({ type: "cond", field: c.field, op: c.op, value: v.slice(0, 500) });
    }
  }
  return { ok: true, rule: { type: "group", op: form.match, rules } };
}

/** Inverse of formToRule for flat rules; null when the rule needs the JSON editor. */
export function ruleToForm(rule: Rule): RuleForm | null {
  const g: Rule = rule.type === "cond" ? { type: "group", op: "and", rules: [rule] } : rule;
  if (g.type !== "group" || g.not) return null;
  const conds: FormCond[] = [];
  for (const r of g.rules) {
    if (r.type !== "cond") return null;
    const def = fieldDef(r.field);
    if (!def) return null;
    let value = "";
    if (def.kind === "bool") value = String(r.value !== false);
    else if (Array.isArray(r.value)) { if (def.kind !== "tags") return null; value = r.value.join(", "); }
    else if (def.kind === "days" && r.op !== "withinDays") value = typeof r.value === "string" ? r.value.slice(0, 10) : "";
    else value = r.value === undefined ? "" : String(r.value);
    conds.push({ field: r.field, op: r.op, value });
  }
  return { match: g.op, conds };
}
