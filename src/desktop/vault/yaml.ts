/**
 * Tiny, safe YAML-subset parser/serializer for note frontmatter.
 * Supports: flat `key: value` maps; values = string | number | boolean | null | string[].
 * No eval, no anchors/tags/multi-line scalars/nested maps. Anything else throws YamlError
 * so callers can fall back to treating the file as plain Markdown (no data loss).
 */
export type YamlScalar = string | number | boolean | null;
export type YamlValue = YamlScalar | string[];
export type YamlMap = Record<string, YamlValue>;

export class YamlError extends Error {}

const PLAIN_RE = /^[A-Za-z_][A-Za-z0-9 _./@-]*$/;
const RESERVED = /^(true|false|null|yes|no|on|off|y|n|~)$/i;
const KEY_RE = /^[A-Za-z_][A-Za-z0-9_-]*$/;
const FORBIDDEN_KEYS = new Set(["__proto__", "constructor", "prototype"]);

function scalarOut(v: YamlScalar): string {
  if (v === null) return "null";
  if (typeof v === "boolean") return v ? "true" : "false";
  if (typeof v === "number") {
    if (!Number.isFinite(v)) throw new YamlError("non-finite number");
    return String(v);
  }
  if (PLAIN_RE.test(v) && !RESERVED.test(v) && v === v.trim()) return v;
  return JSON.stringify(v); // JSON strings are valid YAML double-quoted scalars
}

export function serializeYaml(map: YamlMap): string {
  let out = "";
  for (const key of Object.keys(map)) {
    if (!KEY_RE.test(key) || FORBIDDEN_KEYS.has(key)) throw new YamlError(`bad key ${key}`);
    const v = map[key];
    if (Array.isArray(v)) {
      if (v.length === 0) out += `${key}: []\n`;
      else out += `${key}:\n` + v.map((x) => `  - ${scalarOut(x)}\n`).join("");
    } else out += `${key}: ${scalarOut(v)}\n`;
  }
  return out;
}

function parseScalar(raw: string): YamlScalar {
  const s = raw.trim();
  if (s === "" || s === "~" || s === "null") return null;
  if (s === "true") return true;
  if (s === "false") return false;
  if (/^-?\d+(\.\d+)?$/.test(s)) {
    const n = Number(s);
    if (Number.isSafeInteger(n) || s.includes(".")) return n;
    return s; // huge ints stay strings (no precision loss)
  }
  if (s.startsWith('"')) {
    if (s.length < 2 || !s.endsWith('"')) throw new YamlError("unterminated string");
    try {
      const v = JSON.parse(s);
      if (typeof v === "string") return v;
    } catch {
      /* fallthrough */
    }
    throw new YamlError("bad double-quoted string");
  }
  if (s.startsWith("'")) {
    if (s.length < 2 || !s.endsWith("'")) throw new YamlError("unterminated string");
    return s.slice(1, -1).replace(/''/g, "'");
  }
  if (/^[&*!|>{@`%[]/.test(s)) throw new YamlError(`unsupported scalar: ${s.slice(0, 20)}`);
  return s.replace(/\s+#.*$/, "");
}

function parseFlowList(s: string): string[] {
  const inner = s.slice(1, -1).trim();
  if (!inner) return [];
  const items: string[] = [];
  let cur = "";
  let quote = "";
  for (let i = 0; i < inner.length; i++) {
    const c = inner[i];
    if (quote) {
      cur += c;
      if (c === "\\" && quote === '"') cur += inner[++i] ?? "";
      else if (c === quote) quote = "";
    } else if (c === '"' || c === "'") {
      quote = c;
      cur += c;
    } else if (c === ",") {
      items.push(cur);
      cur = "";
    } else cur += c;
  }
  if (quote) throw new YamlError("unterminated string in list");
  items.push(cur);
  return items.map((x) => {
    const v = parseScalar(x);
    return v === null ? "" : String(v);
  });
}

export function parseYaml(text: string): YamlMap {
  const out: Record<string, YamlValue> = Object.create(null);
  const pending = new Set<string>(); // `key:` with nothing after, so far
  let listKey: string | null = null;
  for (const line of text.replace(/\r\n?/g, "\n").split("\n")) {
    if (line.trim() === "" || line.trim().startsWith("#")) continue;
    const item = /^\s+-(?:\s+(.*))?$/.exec(line) ?? /^-(?:\s+(.*))?$/.exec(line);
    if (item && listKey !== null) {
      let cur = out[listKey];
      if (pending.has(listKey)) {
        pending.delete(listKey);
        cur = [];
        out[listKey] = cur;
      }
      if (!Array.isArray(cur)) throw new YamlError("list item under non-list");
      const v = parseScalar(item[1] ?? "");
      cur.push(v === null ? "" : String(v));
      continue;
    }
    const m = /^([A-Za-z_][A-Za-z0-9_-]*):(?:\s+(.*)|\s*)$/.exec(line);
    if (!m) throw new YamlError(`cannot parse line: ${line.slice(0, 40)}`);
    const key = m[1];
    if (FORBIDDEN_KEYS.has(key)) throw new YamlError("forbidden key");
    if (key in out) throw new YamlError(`duplicate key ${key}`);
    const rest = (m[2] ?? "").trim();
    listKey = null;
    if (rest === "") {
      out[key] = null;
      pending.add(key);
      listKey = key;
    } else if (rest.startsWith("[")) {
      if (!rest.endsWith("]")) throw new YamlError("unterminated list");
      out[key] = parseFlowList(rest);
    } else out[key] = parseScalar(rest);
  }
  return { ...out };
}
