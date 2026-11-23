/**
 * Safe expression + template engine. Hand-written tokenizer/parser/evaluator.
 * No eval / Function. Bounded length, depth, node count and evaluation steps.
 *
 *   "{{ note.title }}"                     -> typed value when the whole string is one placeholder
 *   "Hi {{ upper(note.title) }}!"          -> string interpolation
 *   "len(nodes.extract.output.items) > 0 and note.tags[0] == 'a'"  -> boolean
 */

export const LIMITS = {
  maxExprLength: 2000,
  maxTemplateLength: 20000,
  maxPlaceholders: 100,
  maxDepth: 32,
  maxNodes: 500,
  maxEvalSteps: 5000,
  maxStringLength: 100_000,
  maxArrayLength: 10_000,
};

export class ExprError extends Error {
  constructor(message: string, public pos = 0) {
    super(message);
    this.name = "ExprError";
  }
}

type Ast =
  | { t: "lit"; v: string | number | boolean | null }
  | { t: "id"; name: string }
  | { t: "member"; obj: Ast; prop: string }
  | { t: "index"; obj: Ast; idx: Ast }
  | { t: "call"; name: string; args: Ast[] }
  | { t: "unary"; op: "!" | "-"; arg: Ast }
  | { t: "bin"; op: string; l: Ast; r: Ast }
  | { t: "cond"; c: Ast; a: Ast; b: Ast };

interface Tok {
  k: "num" | "str" | "id" | "op" | "end";
  v: string;
  pos: number;
}

const OPS = ["===", "!==", "==", "!=", "<=", ">=", "&&", "||", "??", "<", ">", "+", "-", "*", "/", "%", "!", "(", ")", "[", "]", ".", ",", "?", ":"];

function tokenize(src: string): Tok[] {
  if (src.length > LIMITS.maxExprLength) throw new ExprError(`expression longer than ${LIMITS.maxExprLength} chars`);
  const toks: Tok[] = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (/\s/.test(c)) { i++; continue; }
    if (/[0-9]/.test(c)) {
      let j = i;
      while (j < src.length && /[0-9]/.test(src[j])) j++;
      if (src[j] === "." && /[0-9]/.test(src[j + 1] ?? "")) { j++; while (j < src.length && /[0-9]/.test(src[j])) j++; }
      toks.push({ k: "num", v: src.slice(i, j), pos: i });
      i = j;
      continue;
    }
    if (c === "'" || c === '"') {
      let j = i + 1;
      let out = "";
      for (;;) {
        if (j >= src.length) throw new ExprError("unterminated string", i);
        const d = src[j];
        if (d === "\\") {
          const e = src[j + 1];
          if (e === undefined) throw new ExprError("bad escape", j);
          out += e === "n" ? "\n" : e === "t" ? "\t" : e;
          j += 2;
          continue;
        }
        if (d === c) break;
        out += d;
        j++;
      }
      toks.push({ k: "str", v: out, pos: i });
      i = j + 1;
      continue;
    }
    if (/[A-Za-z_$]/.test(c)) {
      let j = i;
      while (j < src.length && /[A-Za-z0-9_$]/.test(src[j])) j++;
      toks.push({ k: "id", v: src.slice(i, j), pos: i });
      i = j;
      continue;
    }
    const op = OPS.find((o) => src.startsWith(o, i));
    if (!op) throw new ExprError(`unexpected character '${c}'`, i);
    toks.push({ k: "op", v: op, pos: i });
    i += op.length;
  }
  toks.push({ k: "end", v: "", pos: src.length });
  return toks;
}

class Parser {
  private p = 0;
  private nodes = 0;
  private depth = 0;
  constructor(private toks: Tok[]) {}

  parse(): Ast {
    const a = this.cond();
    if (this.peek().k !== "end") throw new ExprError(`unexpected '${this.peek().v}'`, this.peek().pos);
    return a;
  }
  private peek() { return this.toks[this.p]; }
  private next() { return this.toks[this.p++]; }
  private isOp(v: string) { const t = this.peek(); return t.k === "op" && t.v === v; }
  private isWord(v: string) { const t = this.peek(); return t.k === "id" && t.v === v; }
  private eat(v: string) {
    if (!this.isOp(v)) throw new ExprError(`expected '${v}'`, this.peek().pos);
    this.p++;
  }
  private mk<T extends Ast>(n: T): T {
    if (++this.nodes > LIMITS.maxNodes) throw new ExprError("expression too complex");
    return n;
  }
  private enter() { if (++this.depth > LIMITS.maxDepth) throw new ExprError("expression nested too deeply", this.peek().pos); }
  private leave() { this.depth--; }

  private cond(): Ast {
    this.enter();
    const c = this.bin(0);
    let res = c;
    if (this.isOp("?")) {
      this.p++;
      const a = this.cond();
      this.eat(":");
      const b = this.cond();
      res = this.mk({ t: "cond", c, a, b });
    }
    this.leave();
    return res;
  }

  // precedence levels (low -> high)
  private static LEVELS: string[][] = [["??"], ["||", "or"], ["&&", "and"], ["==", "!=", "===", "!=="], ["<", "<=", ">", ">="], ["+", "-"], ["*", "/", "%"]];

  private matchLevel(level: number): string | null {
    const t = this.peek();
    const ops = Parser.LEVELS[level];
    if ((t.k === "op" || (t.k === "id" && (t.v === "and" || t.v === "or"))) && ops.includes(t.v)) return t.v;
    return null;
  }

  private bin(level: number): Ast {
    if (level >= Parser.LEVELS.length) return this.unary();
    this.enter();
    let l = this.bin(level + 1);
    for (;;) {
      const op = this.matchLevel(level);
      if (!op) break;
      this.p++;
      const r = this.bin(level + 1);
      const norm = op === "and" ? "&&" : op === "or" ? "||" : op === "===" ? "==" : op === "!==" ? "!=" : op;
      l = this.mk({ t: "bin", op: norm, l, r });
    }
    this.leave();
    return l;
  }

  private unary(): Ast {
    this.enter();
    let res: Ast;
    if (this.isOp("!") || this.isWord("not")) {
      this.p++;
      res = this.mk({ t: "unary", op: "!", arg: this.unary() });
    } else if (this.isOp("-")) {
      this.p++;
      res = this.mk({ t: "unary", op: "-", arg: this.unary() });
    } else res = this.postfix();
    this.leave();
    return res;
  }

  private postfix(): Ast {
    let e = this.primary();
    for (;;) {
      if (this.isOp(".")) {
        this.p++;
        const t = this.next();
        if (t.k !== "id") throw new ExprError("expected property name", t.pos);
        if (this.isOp("(")) throw new ExprError("method calls are not allowed; use functions", t.pos);
        e = this.mk({ t: "member", obj: e, prop: t.v });
      } else if (this.isOp("[")) {
        this.p++;
        const idx = this.cond();
        this.eat("]");
        e = this.mk({ t: "index", obj: e, idx });
      } else break;
    }
    return e;
  }

  private primary(): Ast {
    const t = this.next();
    if (t.k === "num") return this.mk({ t: "lit", v: Number(t.v) });
    if (t.k === "str") return this.mk({ t: "lit", v: t.v });
    if (t.k === "id") {
      if (t.v === "true") return this.mk({ t: "lit", v: true });
      if (t.v === "false") return this.mk({ t: "lit", v: false });
      if (t.v === "null") return this.mk({ t: "lit", v: null });
      if (this.isOp("(")) {
        this.p++;
        const args: Ast[] = [];
        if (!this.isOp(")")) {
          for (;;) {
            args.push(this.cond());
            if (this.isOp(",")) { this.p++; continue; }
            break;
          }
        }
        this.eat(")");
        return this.mk({ t: "call", name: t.v, args });
      }
      return this.mk({ t: "id", name: t.v });
    }
    if (t.k === "op" && t.v === "(") {
      const e = this.cond();
      this.eat(")");
      return e;
    }
    throw new ExprError(t.k === "end" ? "unexpected end of expression" : `unexpected '${t.v}'`, t.pos);
  }
}

export function parseExpr(src: string): Ast {
  return new Parser(tokenize(src)).parse();
}

// ── Evaluation ──────────────────────────────────────────────────────────────

const FORBIDDEN_KEYS = new Set(["__proto__", "constructor", "prototype"]);
const hasOwn = (o: object, k: string) => Object.prototype.hasOwnProperty.call(o, k);

function getProp(obj: unknown, key: string | number): unknown {
  if (obj === null || obj === undefined) return undefined;
  if (typeof key === "string" && FORBIDDEN_KEYS.has(key)) return undefined;
  if (typeof obj === "string") {
    if (key === "length") return obj.length;
    return undefined;
  }
  if (Array.isArray(obj)) {
    if (key === "length") return obj.length;
    if (typeof key === "number" && Number.isInteger(key)) return obj[key];
    return undefined;
  }
  if (typeof obj === "object") {
    const k = String(key);
    return hasOwn(obj as object, k) ? (obj as Record<string, unknown>)[k] : undefined;
  }
  return undefined;
}

export function stringify(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  try {
    return JSON.stringify(v) ?? "";
  } catch {
    return "[unserializable]";
  }
}

const truthy = (v: unknown) => !!v;
const num = (v: unknown, fn: string): number => {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v))) return Number(v);
  throw new ExprError(`${fn}(): expected a number`);
};
const arr = (v: unknown, fn: string): unknown[] => {
  if (Array.isArray(v)) return v;
  throw new ExprError(`${fn}(): expected an array`);
};
const cap = (s: string) => {
  if (s.length > LIMITS.maxStringLength) throw new ExprError("string result too long");
  return s;
};

type Fn = (...a: unknown[]) => unknown;
/** Whitelist. Nothing here touches globals, prototypes or the network. */
export const FUNCTIONS: Record<string, Fn> = {
  len: (v) => (typeof v === "string" || Array.isArray(v) ? v.length : v && typeof v === "object" ? Object.keys(v).length : 0),
  lower: (v) => stringify(v).toLowerCase(),
  upper: (v) => stringify(v).toUpperCase(),
  trim: (v) => stringify(v).trim(),
  str: (v) => stringify(v),
  num: (v) => num(v, "num"),
  contains: (h, n) => (Array.isArray(h) ? h.some((x) => x === n) : stringify(h).includes(stringify(n))),
  startsWith: (h, n) => stringify(h).startsWith(stringify(n)),
  endsWith: (h, n) => stringify(h).endsWith(stringify(n)),
  replace: (s, a, b) => cap(stringify(s).split(stringify(a)).join(stringify(b))),
  join: (a, sep = ",") => cap(arr(a, "join").map(stringify).join(stringify(sep))),
  split: (s, sep = ",") => {
    const parts = stringify(s).split(stringify(sep));
    if (parts.length > LIMITS.maxArrayLength) throw new ExprError("split(): too many parts");
    return parts;
  },
  first: (a) => (Array.isArray(a) ? a[0] : undefined),
  last: (a) => (Array.isArray(a) ? a[a.length - 1] : undefined),
  slice: (a, s, e) => {
    const start = num(s ?? 0, "slice");
    const end = e === undefined ? undefined : num(e, "slice");
    if (typeof a === "string") return a.slice(start, end);
    return arr(a, "slice").slice(start, end);
  },
  round: (v) => Math.round(num(v, "round")),
  floor: (v) => Math.floor(num(v, "floor")),
  ceil: (v) => Math.ceil(num(v, "ceil")),
  abs: (v) => Math.abs(num(v, "abs")),
  min: (...a) => Math.min(...a.map((x) => num(x, "min"))),
  max: (...a) => Math.max(...a.map((x) => num(x, "max"))),
  coalesce: (...a) => a.find((x) => x !== null && x !== undefined && x !== ""),
  json: (v) => cap(stringify(v)),
  keys: (o) => (o && typeof o === "object" && !Array.isArray(o) ? Object.keys(o) : []),
  isEmpty: (v) => v === null || v === undefined || v === "" || (Array.isArray(v) && v.length === 0),
};

export function evalAst(ast: Ast, ctx: Record<string, unknown>): unknown {
  let steps = 0;
  const go = (n: Ast): unknown => {
    if (++steps > LIMITS.maxEvalSteps) throw new ExprError("evaluation step limit exceeded");
    switch (n.t) {
      case "lit": return n.v;
      case "id": return FORBIDDEN_KEYS.has(n.name) ? undefined : hasOwn(ctx, n.name) ? ctx[n.name] : undefined;
      case "member": return getProp(go(n.obj), n.prop);
      case "index": {
        const k = go(n.idx);
        if (typeof k !== "string" && typeof k !== "number") return undefined;
        return getProp(go(n.obj), k);
      }
      case "call": {
        if (!hasOwn(FUNCTIONS, n.name)) throw new ExprError(`unknown function '${n.name}'`);
        return FUNCTIONS[n.name](...n.args.map(go));
      }
      case "unary": {
        const v = go(n.arg);
        return n.op === "!" ? !truthy(v) : -num(v, "-");
      }
      case "cond": return truthy(go(n.c)) ? go(n.a) : go(n.b);
      case "bin": {
        if (n.op === "&&") { const l = go(n.l); return truthy(l) ? go(n.r) : l; }
        if (n.op === "||") { const l = go(n.l); return truthy(l) ? l : go(n.r); }
        if (n.op === "??") { const l = go(n.l); return l === null || l === undefined ? go(n.r) : l; }
        const l = go(n.l);
        const r = go(n.r);
        switch (n.op) {
          case "==": return l === r;
          case "!=": return l !== r;
          case "<": case "<=": case ">": case ">=": {
            const ok = (typeof l === "number" && typeof r === "number") || (typeof l === "string" && typeof r === "string");
            if (!ok) return false;
            const a = l as number, b = r as number;
            return n.op === "<" ? a < b : n.op === "<=" ? a <= b : n.op === ">" ? a > b : a >= b;
          }
          case "+":
            if (typeof l === "number" && typeof r === "number") return l + r;
            if (typeof l === "string" || typeof r === "string") return cap(stringify(l) + stringify(r));
            throw new ExprError("'+' needs numbers or a string operand");
          case "-": return num(l, "-") - num(r, "-");
          case "*": return num(l, "*") * num(r, "*");
          case "/": { const d = num(r, "/"); if (d === 0) throw new ExprError("division by zero"); return num(l, "/") / d; }
          case "%": { const d = num(r, "%"); if (d === 0) throw new ExprError("modulo by zero"); return num(l, "%") % d; }
        }
        throw new ExprError(`bad operator ${n.op}`);
      }
    }
  };
  return go(ast);
}

export function evalExpr(src: string, ctx: Record<string, unknown>): unknown {
  return evalAst(parseExpr(src), ctx);
}

// ── Templates ───────────────────────────────────────────────────────────────

export type TemplatePart = { text: string } | { expr: string; pos: number };

export function parseTemplate(src: string): TemplatePart[] {
  if (src.length > LIMITS.maxTemplateLength) throw new ExprError(`template longer than ${LIMITS.maxTemplateLength} chars`);
  const parts: TemplatePart[] = [];
  let i = 0;
  let placeholders = 0;
  while (i < src.length) {
    const open = src.indexOf("{{", i);
    if (open < 0) { parts.push({ text: src.slice(i) }); break; }
    if (open > i) parts.push({ text: src.slice(i, open) });
    let j = open + 2;
    let quote: string | null = null;
    let close = -1;
    while (j < src.length) {
      const c = src[j];
      if (quote) {
        if (c === "\\") j++;
        else if (c === quote) quote = null;
      } else if (c === "'" || c === '"') quote = c;
      else if (c === "}" && src[j + 1] === "}") { close = j; break; }
      j++;
    }
    if (close < 0) throw new ExprError("unterminated '{{'", open);
    if (++placeholders > LIMITS.maxPlaceholders) throw new ExprError("too many placeholders");
    parts.push({ expr: src.slice(open + 2, close), pos: open });
    i = close + 2;
  }
  return parts;
}

/** Whole-string single placeholder keeps its type; otherwise interpolates to a string. */
export function renderTemplate(src: string, ctx: Record<string, unknown>): unknown {
  const parts = parseTemplate(src);
  const exprs = parts.filter((p): p is { expr: string; pos: number } => "expr" in p);
  if (parts.length === 1 && exprs.length === 1) return evalExpr(exprs[0].expr, ctx);
  let out = "";
  for (const p of parts) {
    out += "text" in p ? p.text : stringify(evalExpr(p.expr, ctx));
    if (out.length > LIMITS.maxStringLength) throw new ExprError("rendered template too long");
  }
  return out;
}

export function renderString(src: string, ctx: Record<string, unknown>): string {
  return stringify(renderTemplate(src, ctx));
}

/** Render all string leaves of an args structure (bounded depth). */
export function renderDeep(value: unknown, ctx: Record<string, unknown>, depth = 0): unknown {
  if (depth > 8) throw new ExprError("args nested too deeply");
  if (typeof value === "string") return renderTemplate(value, ctx);
  if (Array.isArray(value)) return value.map((v) => renderDeep(v, ctx, depth + 1));
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      if (FORBIDDEN_KEYS.has(k)) throw new ExprError(`forbidden key '${k}'`);
      out[k] = renderDeep(v, ctx, depth + 1);
    }
    return out;
  }
  return value;
}

/** Syntax check only: returns null or an error message. */
export function checkTemplate(src: string): string | null {
  try {
    for (const p of parseTemplate(src)) if ("expr" in p) parseExpr(p.expr);
    return null;
  } catch (e) {
    return (e as Error).message;
  }
}
export function checkExpr(src: string): string | null {
  try { parseExpr(src); return null; } catch (e) { return (e as Error).message; }
}

/** Root identifiers (and first path segment) referenced, e.g. "note", "nodes.extract". */
export function collectRefs(ast: Ast, out = new Set<string>()): Set<string> {
  const path = (n: Ast): string | null => {
    if (n.t === "id") return n.name;
    if (n.t === "member") { const p = path(n.obj); return p ? `${p}.${n.prop}` : null; }
    return null;
  };
  const walk = (n: Ast) => {
    switch (n.t) {
      case "id": out.add(n.name); break;
      case "member": {
        const p = path(n);
        if (p) { const segs = p.split("."); out.add(segs[0] === "nodes" && segs.length > 1 ? `nodes.${segs[1]}` : segs[0]); }
        else walk(n.obj);
        break;
      }
      case "index": walk(n.obj); walk(n.idx); break;
      case "call": n.args.forEach(walk); break;
      case "unary": walk(n.arg); break;
      case "bin": walk(n.l); walk(n.r); break;
      case "cond": walk(n.c); walk(n.a); walk(n.b); break;
    }
  };
  walk(ast);
  return out;
}

export function templateRefs(src: string): Set<string> {
  const out = new Set<string>();
  try {
    for (const p of parseTemplate(src)) if ("expr" in p) collectRefs(parseExpr(p.expr), out);
  } catch { /* syntax errors are reported by the validator */ }
  return out;
}

export function exprRefs(src: string): Set<string> {
  try { return collectRefs(parseExpr(src)); } catch { return new Set(); }
}
