/**
 * Smart folder rule engine. Rules are plain JSON (persistable / syncable) and are
 * evaluated over notes. No regex or eval: all text operators are substring matches
 * so user-authored rules cannot cause ReDoS or code execution.
 *
 *   { type: "group", op: "and"|"or", not?: boolean, rules: [...] }
 *   { type: "cond", field, op, value? }
 *
 * Fields / ops:
 *   tag        has | hasAny | hasNone        value: string | string[]
 *   text       contains | notContains        value: string   (title + body, case-insensitive)
 *   title      contains | is                 value: string
 *   folder     is | under                    value: string
 *   pinned|favorite|shared|locked|archived|trashed   is       value: boolean
 *   hasChecklist | hasUncheckedTasks | hasLinks | hasImages | hasTable | hasCode   is   value: boolean
 *   createdAt|updatedAt   before | after | between | withinDays   value: ISO string | [ISO, ISO] | number
 *   wordCount  gt | lt | eq                  value: number
 */
export type Rule = Group | Cond;
export interface Group { type: "group"; op: "and" | "or"; not?: boolean; rules: Rule[] }
export interface Cond { type: "cond"; field: string; op: string; value?: unknown }

export interface SmartNote {
  id: string; title: string; content: string; tags: string[]; folder?: string;
  isPinned?: boolean; isFavorite?: boolean; isShared?: boolean; isLocked?: boolean; isArchived?: boolean; isTrashed?: boolean;
  createdAt: string; updatedAt: string; wordCount?: number;
}

const BOOL_FIELDS: Record<string, (n: SmartNote) => boolean> = {
  pinned: (n) => !!n.isPinned, favorite: (n) => !!n.isFavorite, shared: (n) => !!n.isShared, locked: (n) => !!n.isLocked,
  archived: (n) => !!n.isArchived, trashed: (n) => !!n.isTrashed,
  hasChecklist: (n) => /^\s*[-*+]\s+\[[ xX]\]\s/m.test(n.content),
  hasUncheckedTasks: (n) => /^\s*[-*+]\s+\[ \]\s/m.test(n.content),
  hasLinks: (n) => /\[\[[^\]\n]+\]\]|\]\(https?:\/\//.test(n.content),
  hasImages: (n) => /!\[[^\]]*\]\([^)]+\)|!\[\[[^\]]+\]\]/.test(n.content),
  hasTable: (n) => /^\s*\|.+\|\s*\n\s*\|[\s:|-]+\|/m.test(n.content),
  hasCode: (n) => /^```/m.test(n.content),
};
const OPS: Record<string, string[]> = {
  tag: ["has", "hasAny", "hasNone"], text: ["contains", "notContains"], title: ["contains", "is"], folder: ["is", "under"],
  createdAt: ["before", "after", "between", "withinDays"], updatedAt: ["before", "after", "between", "withinDays"],
  wordCount: ["gt", "lt", "eq"],
  ...Object.fromEntries(Object.keys(BOOL_FIELDS).map((k) => [k, ["is"]])),
};

const MAX_DEPTH = 6, MAX_NODES = 200;

export function validateRule(r: unknown): { ok: true; rule: Rule } | { ok: false; error: string } {
  let nodes = 0;
  const err = (e: string) => ({ ok: false as const, error: e });
  const walk = (x: unknown, depth: number): string | null => {
    if (++nodes > MAX_NODES) return "too many rules";
    if (depth > MAX_DEPTH) return "rules nested too deeply";
    if (!x || typeof x !== "object") return "rule must be an object";
    const o = x as Record<string, unknown>;
    if (o.type === "group") {
      if (o.op !== "and" && o.op !== "or") return "group.op must be and|or";
      if (!Array.isArray(o.rules)) return "group.rules must be an array";
      for (const c of o.rules) { const e = walk(c, depth + 1); if (e) return e; }
      return null;
    }
    if (o.type === "cond") {
      const ops = typeof o.field === "string" ? OPS[o.field] : undefined;
      if (!ops) return `unknown field: ${String(o.field)}`;
      if (typeof o.op !== "string" || !ops.includes(o.op)) return `invalid op for ${o.field}: ${String(o.op)}`;
      const v = o.value;
      if (String(o.field) in BOOL_FIELDS) return typeof v === "boolean" ? null : `${o.field} needs a boolean`;
      if (o.field === "wordCount") return typeof v === "number" && isFinite(v) ? null : "wordCount needs a number";
      if (o.field === "tag") return typeof v === "string" || (Array.isArray(v) && v.every((s) => typeof s === "string") && v.length <= 100) ? null : "tag needs string(s)";
      if (o.field === "createdAt" || o.field === "updatedAt") {
        if (o.op === "withinDays") return typeof v === "number" && v >= 0 ? null : "withinDays needs a number";
        if (o.op === "between") return Array.isArray(v) && v.length === 2 && v.every((d) => typeof d === "string" && !isNaN(Date.parse(d))) ? null : "between needs two ISO dates";
        return typeof v === "string" && !isNaN(Date.parse(v)) ? null : "date needs an ISO string";
      }
      return typeof v === "string" && v.length <= 500 ? null : `${o.field} needs a string`;
    }
    return "rule.type must be group|cond";
  };
  const e = walk(r, 0);
  return e ? err(e) : { ok: true, rule: r as Rule };
}

const norm = (s: string) => s.normalize("NFKC").toLowerCase();
const DAY = 86_400_000;

function evalCond(c: Cond, n: SmartNote, now: number): boolean {
  const v = c.value;
  if (c.field in BOOL_FIELDS) return BOOL_FIELDS[c.field](n) === v;
  switch (c.field) {
    case "tag": {
      const have = new Set(n.tags.map((t) => norm(t).replace(/^#/, "")));
      const want = (Array.isArray(v) ? v : [v]).map((t) => norm(String(t)).replace(/^#/, ""));
      if (c.op === "has") return want.every((t) => have.has(t));
      if (c.op === "hasAny") return want.some((t) => have.has(t));
      return !want.some((t) => have.has(t));
    }
    case "text": {
      const hit = norm(`${n.title}\n${n.content}`).includes(norm(String(v)));
      return c.op === "contains" ? hit : !hit;
    }
    case "title": return c.op === "is" ? norm(n.title) === norm(String(v)) : norm(n.title).includes(norm(String(v)));
    case "folder": {
      const f = n.folder ?? "", w = String(v);
      return c.op === "is" ? f === w : f === w || f.startsWith(w + "/");
    }
    case "wordCount": {
      const wc = n.wordCount ?? n.content.split(/\s+/).filter(Boolean).length;
      return c.op === "gt" ? wc > (v as number) : c.op === "lt" ? wc < (v as number) : wc === v;
    }
    case "createdAt": case "updatedAt": {
      const t = Date.parse(c.field === "createdAt" ? n.createdAt : n.updatedAt);
      if (isNaN(t)) return false;
      if (c.op === "before") return t < Date.parse(v as string);
      if (c.op === "after") return t > Date.parse(v as string);
      if (c.op === "between") { const [a, b] = (v as string[]).map((d) => Date.parse(d)); return t >= a && t <= b; }
      return t >= now - (v as number) * DAY && t <= now;
    }
  }
  return false;
}

/** Evaluate a (validated) rule against one note. Invalid rules match nothing. */
export function matchesRule(rule: Rule, note: SmartNote, now: number = Date.now()): boolean {
  if (rule.type === "cond") return evalCond(rule, note, now);
  if (!rule.rules.length) return !rule.not; // empty group matches everything
  const r = rule.op === "and" ? rule.rules.every((x) => matchesRule(x, note, now)) : rule.rules.some((x) => matchesRule(x, note, now));
  return rule.not ? !r : r;
}

/** Notes matching a rule. Trashed notes are excluded unless the rule itself mentions `trashed`. */
export function evaluateSmartFolder(rule: unknown, notes: SmartNote[], now: number = Date.now()): SmartNote[] {
  const v = validateRule(rule);
  if (!v.ok) return [];
  const mentionsTrash = JSON.stringify(v.rule).includes('"field":"trashed"');
  return notes.filter((n) => (mentionsTrash || !n.isTrashed) && matchesRule(v.rule, n, now));
}

/** Convenience presets mirroring Apple Notes' common smart folders. */
export const PRESET_RULES: Record<string, Rule> = {
  "Pinned": { type: "cond", field: "pinned", op: "is", value: true },
  "Checklists with open items": { type: "cond", field: "hasUncheckedTasks", op: "is", value: true },
  "Edited this week": { type: "cond", field: "updatedAt", op: "withinDays", value: 7 },
  "Shared": { type: "cond", field: "shared", op: "is", value: true },
};
