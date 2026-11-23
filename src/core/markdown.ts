/**
 * Markdown <-> HTML helpers (storage format = Markdown; the editor works on HTML).
 *
 * Pipeline:  markdown --marked--> HTML --sanitizeHtml--> (TipTap)  and
 *            HTML --sanitizeHtml--> turndown --> markdown.
 *
 * - GFM tables, task lists (`- [x]`), fenced code (with language), links,
 *   images, strikethrough and [[wikilinks]] / ![[embeds]] survive a round trip
 *   (see tests/notes/markdown.test.ts).
 * - Task lists are emitted in TipTap's HTML flavour (ul[data-type=taskList] /
 *   li[data-type=taskItem][data-checked]) so the editor can ingest them directly.
 * - Wikilinks are emitted as <a data-wikilink="Target" ...> so they survive as
 *   links in the editor and are turned back into [[...]] by htmlToMarkdown.
 * - Known limits: raw HTML blocks in Markdown are sanitised (not preserved
 *   verbatim); merged cells are flattened by GFM; table column alignment is not
 *   preserved; footnotes/math are not handled.
 * Everything that enters the editor or leaves an import passes sanitizeHtml.
 */
import { Marked, type Tokens } from "marked";
import TurndownService from "turndown";

// ---------------------------------------------------------------- sanitiser

const ALLOWED_TAGS = new Set([
  "p", "br", "hr", "h1", "h2", "h3", "h4", "h5", "h6", "strong", "b", "em", "i", "u", "s", "del", "strike",
  "code", "pre", "blockquote", "ul", "ol", "li", "a", "img", "table", "thead", "tbody", "tfoot", "tr", "th",
  "td", "span", "div", "sub", "sup", "mark", "input", "label", "caption", "colgroup", "col",
]);
/** Tags whose entire content is dropped. */
const DROP_CONTENT = ["script", "style", "iframe", "object", "embed", "noscript", "template", "svg", "math",
  "head", "title", "textarea", "select", "button", "form", "applet", "frameset", "frame"];

const ATTRS: Record<string, string[]> = {
  a: ["href", "title", "data-wikilink", "data-embed", "data-heading", "data-alias"],
  img: ["src", "alt", "title"],
  td: ["colspan", "rowspan", "align"],
  th: ["colspan", "rowspan", "align"],
  input: ["type", "checked", "disabled"],
  ul: ["data-type"],
  ol: ["start"],
  li: ["data-type", "data-checked"],
  code: ["class"],
  pre: ["class"],
  span: ["data-wikilink"],
};

function safeCp(n: number): string {
  try { return n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : ""; } catch { return ""; }
}
function decodeEntities(s: string): string {
  const named: Record<string, string> = { colon: ":", tab: "\t", newline: "\n", lt: "<", gt: ">", quot: '"', amp: "&", apos: "'" };
  return s
    .replace(/&#x([0-9a-f]+);?/gi, (_, h) => safeCp(parseInt(h, 16)))
    .replace(/&#(\d+);?/g, (_, d) => safeCp(parseInt(d, 10)))
    .replace(/&(colon|tab|newline|lt|gt|quot|amp|apos);/gi, (_, n) => named[n.toLowerCase()]);
}
function escAttr(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Allow http(s), mailto, tel, relative, #anchors, aura: ; images may also be raster data: URIs. */
export function isSafeUrl(raw: string, kind: "link" | "image" = "link"): boolean {
  const v = decodeEntities(raw).replace(/[\u0000- \u007f-\u009f]+/g, "");
  if (!v) return true;
  const m = /^([a-z][a-z0-9+.-]*):/i.exec(v);
  if (!m) return true; // relative
  const scheme = m[1].toLowerCase();
  if (scheme === "http" || scheme === "https") return true;
  if (kind === "link") return scheme === "mailto" || scheme === "tel" || scheme === "aura";
  if (scheme === "data") return /^data:image\/(png|jpe?g|gif|webp|avif);base64,/i.test(v);
  return scheme === "aura";
}

const TAG_RE = /<(\/?)([a-zA-Z][a-zA-Z0-9-]*)((?:"[^"]*"|'[^']*'|[^>"'])*)>/g;
const ATTR_RE = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g;

/** String-based allowlist sanitiser (no DOM needed, so it runs in Node and workers). */
export function sanitizeHtml(html: string, opts: { maxLength?: number } = {}): string {
  let s = String(html ?? "");
  const max = opts.maxLength ?? 5_000_000;
  if (s.length > max) s = s.slice(0, max);
  s = s.replace(/<!--[\s\S]*?(-->|$)/g, "").replace(/<!\[CDATA\[[\s\S]*?(\]\]>|$)/g, "").replace(/<![^>]*>/g, "").replace(/<\?[\s\S]*?\?>/g, "");
  for (const t of DROP_CONTENT) {
    s = s.replace(new RegExp(`<${t}\\b[^>]*>[\\s\\S]*?(?:<\\/${t}\\s*>|$)`, "gi"), "");
  }
  let out = "";
  let last = 0;
  const tagRe = new RegExp(TAG_RE.source, "g");
  let m: RegExpExecArray | null;
  const esc = (t: string) => t.replace(/</g, "&lt;").replace(/>/g, "&gt;");
  while ((m = tagRe.exec(s))) {
    out += esc(s.slice(last, m.index));
    last = m.index + m[0].length;
    const closing = m[1] === "/";
    const name = m[2].toLowerCase();
    if (!ALLOWED_TAGS.has(name)) continue;
    if (closing) { out += `</${name}>`; continue; }
    const allowed = ATTRS[name] ?? [];
    let attrs = "";
    let isHttpLink = false;
    const attrRe = new RegExp(ATTR_RE.source, "g");
    let a: RegExpExecArray | null;
    const seen = new Set<string>();
    while ((a = attrRe.exec(m[3]))) {
      const an = a[1].toLowerCase();
      if (!allowed.includes(an) || seen.has(an)) continue;
      const raw = a[2] ?? a[3] ?? a[4] ?? "";
      const val = decodeEntities(raw);
      if (an === "href" && !isSafeUrl(raw, "link")) continue;
      if (an === "src" && !isSafeUrl(raw, "image")) continue;
      if (an === "class" && !/^language-[\w+#.-]{1,32}$/.test(val)) continue;
      if (an === "type" && !(name === "input" && val.toLowerCase() === "checkbox")) continue;
      if (an === "data-type" && val !== "taskList" && val !== "taskItem") continue;
      if (an === "align" && !/^(left|right|center)$/i.test(val)) continue;
      if ((an === "colspan" || an === "rowspan" || an === "start") && !/^\d{1,4}$/.test(val)) continue;
      seen.add(an);
      if (an === "href" && /^https?:/i.test(val.trim())) isHttpLink = true;
      attrs += an === "checked" || an === "disabled" ? ` ${an}=""` : ` ${an}="${escAttr(val)}"`;
    }
    if (name === "input" && !/type="checkbox"/.test(attrs)) continue;
    if (isHttpLink) attrs += ' rel="noopener noreferrer"';
    out += `<${name}${attrs}>`;
  }
  out += esc(s.slice(last));
  return out;
}

// -------------------------------------------------------- markdown -> html

const WIKI_RE = /^(!?)\[\[([^\[\]|#\n]+?)(?:#([^\[\]|\n]*))?(?:\|([^\[\]\n]*))?\]\]/;

interface WikiToken extends Tokens.Generic { type: "wikilink"; target: string; heading: string; alias: string; embed: boolean }

const marked = new Marked({
  gfm: true,
  breaks: false,
  extensions: [
    {
      name: "wikilink",
      level: "inline",
      start(src: string) { const i = src.search(/!?\[\[/); return i < 0 ? undefined : i; },
      tokenizer(src: string) {
        const m = WIKI_RE.exec(src);
        if (!m) return undefined;
        const t: WikiToken = {
          type: "wikilink", raw: m[0], embed: m[1] === "!", target: m[2].trim(), heading: (m[3] ?? "").trim(), alias: (m[4] ?? "").trim(),
        };
        return t;
      },
      renderer(tok) {
        const t = tok as WikiToken;
        const label = t.alias || (t.heading ? `${t.target}#${t.heading}` : t.target);
        return `<a href="#" data-wikilink="${escAttr(t.target)}"${t.embed ? ' data-embed="true"' : ""}${t.heading ? ` data-heading="${escAttr(t.heading)}"` : ""}${t.alias ? ` data-alias="${escAttr(t.alias)}"` : ""}>${escAttr(label)}</a>`;
      },
    },
  ],
  renderer: {
    list(token) {
      const tag = token.ordered ? "ol" : "ul";
      const task = token.items.some((i) => i.task);
      const start = token.ordered && token.start !== "" && token.start !== 1 ? ` start="${Number(token.start)}"` : "";
      return `<${tag}${task ? ' data-type="taskList"' : ""}${start}>\n${token.items.map((i) => this.listitem(i)).join("")}</${tag}>\n`;
    },
    listitem(item) {
      const toks = item.tokens.filter((t) => t.type !== "checkbox");
      const inner = (this.parser as unknown as { parse(t: unknown, loose?: boolean): string }).parse(toks, !!item.loose);
      return item.task ? `<li data-type="taskItem" data-checked="${!!item.checked}">${inner}</li>\n` : `<li>${inner}</li>\n`;
    },
    checkbox() { return ""; },
  },
});

/** Markdown -> sanitised HTML suitable for TipTap `setContent`. */
export function markdownToHtml(md: string): string {
  const html = marked.parse(String(md ?? ""), { async: false }) as string;
  return sanitizeHtml(html);
}

// -------------------------------------------------------- html -> markdown

/** Minimal structural view of a DOM element (domino in Node, real DOM in browsers). */
interface DomEl {
  nodeName: string;
  getAttribute(n: string): string | null;
  querySelector(s: string): unknown;
  querySelectorAll(s: string): ArrayLike<DomEl>;
  innerHTML: string;
  parentNode: DomEl | null;
  children: ArrayLike<DomEl>;
  nextSibling: unknown;
}

function cellMd(inner: TurndownService, cell: DomEl): string {
  const md = inner.turndown(cell.innerHTML).trim();
  return md.replace(/\n+/g, "<br>").replace(/\|/g, "\\|");
}

function baseTurndown(): TurndownService {
  const td = new TurndownService({
    headingStyle: "atx", codeBlockStyle: "fenced", bulletListMarker: "-", emDelimiter: "*", strongDelimiter: "**", fence: "```", hr: "---",
  });
  td.addRule("strike", { filter: ["del", "s", "strike"] as never, replacement: (c) => `~~${c}~~` });
  td.addRule("wikilink", {
    filter: (n) => n.nodeName === "A" && (n as unknown as DomEl).getAttribute("data-wikilink") != null,
    replacement: (_c, node) => {
      const el = node as unknown as DomEl;
      const target = el.getAttribute("data-wikilink") ?? "";
      const heading = el.getAttribute("data-heading");
      const alias = el.getAttribute("data-alias");
      const embed = el.getAttribute("data-embed") === "true" ? "!" : "";
      return `${embed}[[${target}${heading ? "#" + heading : ""}${alias ? "|" + alias : ""}]]`;
    },
  });
  td.addRule("checkboxInput", { filter: (n) => n.nodeName === "INPUT", replacement: () => "" });
  td.addRule("taskLabel", { filter: (n) => n.nodeName === "LABEL" && !!(n as unknown as DomEl).querySelector("input"), replacement: () => "" });
  td.addRule("listItem", {
    filter: "li",
    replacement: (content, node, options) => {
      const el = node as unknown as DomEl;
      const parent = el.parentNode;
      const first = el.children.length > 0 ? el.children[0].nodeName : "";
      const isTask = el.getAttribute("data-type") === "taskItem" || (!!el.querySelector("input[type=checkbox]") && (first === "INPUT" || first === "LABEL"));
      let prefix = options.bulletListMarker + " ";
      if (parent && parent.nodeName === "OL") {
        const start = parent.getAttribute("start");
        const index = Array.prototype.indexOf.call(parent.children, el);
        prefix = `${start ? Number(start) + index : index + 1}. `;
      }
      let task = "";
      if (isTask) {
        const checked = el.getAttribute("data-checked") === "true" || !!el.querySelector("input[checked]");
        task = checked ? "[x] " : "[ ] ";
      }
      const indent = " ".repeat(prefix.length);
      const body = content.replace(/^\n+/, "").replace(/\n+$/, "\n").replace(/\n/gm, "\n" + indent);
      return prefix + task + body + (el.nextSibling && !/\n$/.test(body) ? "\n" : "");
    },
  });
  return td;
}

function buildTurndown(): TurndownService {
  const td = baseTurndown();
  const inner = baseTurndown();
  td.addRule("table", {
    filter: "table",
    replacement: (_c, node) => {
      const t = node as unknown as DomEl;
      const rows = Array.from(t.querySelectorAll("tr"));
      if (!rows.length) return "";
      const grid = rows.map((r) => Array.from(r.children).filter((c) => c.nodeName === "TD" || c.nodeName === "TH").map((c) => cellMd(inner, c)));
      const cols = Math.max(...grid.map((r) => r.length), 1);
      const norm = grid.map((r) => Array.from({ length: cols }, (_, i) => r[i] ?? ""));
      const line = (r: string[]) => `| ${r.join(" | ")} |`;
      return `\n\n${line(norm[0])}\n| ${Array(cols).fill("---").join(" | ")} |${norm.length > 1 ? "\n" + norm.slice(1).map(line).join("\n") : ""}\n\n`;
    },
  });
  return td;
}

let _td: TurndownService | null = null;
/** HTML (e.g. TipTap getHTML() or imported HTML) -> Markdown. Input is sanitised first. */
export function htmlToMarkdown(html: string): string {
  _td ??= buildTurndown();
  return _td.turndown(sanitizeHtml(html)).replace(/\n{3,}/g, "\n\n").trim();
}

// ----------------------------------------------------------- misc helpers

/** Plain text of a markdown note (for search indexing / previews / word counts). */
export function stripMarkdown(md: string): string {
  return String(md ?? "")
    .replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, "")
    .replace(/```[\s\S]*?```/g, (b) => b.replace(/```[^\n]*\n?/g, " "))
    .replace(/!\[\[([^\]|]+)(?:\|([^\]]*))?\]\]/g, "$2")
    .replace(/\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|([^\]]*))?\]\]/g, (_m, t, a) => a || t)
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/^\s{0,3}(#{1,6}|>|[-*+]|\d+\.)\s+(\[[ xX]\]\s+)?/gm, "")
    .replace(/[*_~`|]+/g, "")
    .replace(/^[-:| ]{3,}$/gm, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** #tags in body text (not in code, not URL fragments). Lower-cased, deduped. */
export function extractHashtags(md: string): string[] {
  const noCode = String(md ?? "").replace(/```[\s\S]*?```/g, " ").replace(/`[^`\n]*`/g, " ");
  const out = new Set<string>();
  const re = /(^|[\s(])#([\p{L}\p{N}_][\p{L}\p{N}_/-]{0,63})/gu;
  let m: RegExpExecArray | null;
  while ((m = re.exec(noCode))) out.add(m[2].toLowerCase());
  return [...out];
}

export interface Frontmatter { data: Record<string, string | string[] | boolean | number>; body: string }

function unquote(v: string): string {
  const t = v.trim();
  if (t.length >= 2 && ((t[0] === '"' && t.endsWith('"')) || (t[0] === "'" && t.endsWith("'")))) return t.slice(1, -1);
  return t;
}

/** Parse a small, safe YAML subset: `key: value`, `key: [a, b]`, and `- item` lists. */
export function parseFrontmatter(src: string): Frontmatter {
  const text = String(src ?? "").replace(/^﻿/, "");
  const m = /^---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/.exec(text);
  if (!m) return { data: {}, body: text };
  const data: Frontmatter["data"] = {};
  let key: string | null = null;
  for (const line of m[1].split(/\r?\n/).slice(0, 500)) {
    const li = /^\s*-\s+(.*)$/.exec(line);
    if (li && key) {
      const cur = data[key];
      data[key] = [...(Array.isArray(cur) ? cur : []), unquote(li[1])];
      continue;
    }
    const kv = /^([A-Za-z0-9_-]{1,64}):\s*(.*)$/.exec(line);
    if (!kv) continue;
    key = kv[1];
    const v = kv[2].trim();
    if (v === "") data[key] = [];
    else if (v.startsWith("[") && v.endsWith("]")) data[key] = v.slice(1, -1).split(",").map(unquote).filter(Boolean);
    else if (v === "true" || v === "false") data[key] = v === "true";
    else data[key] = unquote(v);
  }
  for (const k of Object.keys(data)) if (Array.isArray(data[k]) && (data[k] as string[]).length === 0) data[k] = "";
  return { data, body: text.slice(m[0].length) };
}

export function stringifyFrontmatter(data: Record<string, string | string[] | boolean | number | undefined>, body: string): string {
  const q = (s: string) => (/^[\w .\/-]+$/.test(s) && s !== "true" && s !== "false" ? s : JSON.stringify(s));
  const lines = Object.entries(data)
    .filter(([, v]) => v !== undefined && v !== "")
    .map(([k, v]) => (Array.isArray(v) ? `${k}: [${v.map(q).join(", ")}]` : `${k}: ${typeof v === "string" ? q(v) : v}`));
  return lines.length ? `---\n${lines.join("\n")}\n---\n\n${body}` : body;
}
