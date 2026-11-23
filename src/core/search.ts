/**
 * In-memory full-text index: tokeniser, BM25F-style scoring (title/tags/body weights),
 * prefix + typo-tolerant matching, filters and snippet highlighting. Framework-free.
 *
 * - Incremental: upsert(doc) / remove(id) touch only that document's postings.
 * - Matching: every query token must match (match: "all", default) or any ("any").
 *   Tokens match exactly (weight 1), as a prefix (0.7; only the LAST token is
 *   prefix-expanded unless prefixAll) or fuzzily (0.45; edit distance 1 for tokens
 *   of length 4-7, 2 for 8+; only used when the token has no exact/prefix hit).
 * - This is lexical search. Semantic/vector search is a separate concern (Phase 3).
 * - Not done: CJK segmentation (CJK text is indexed per whitespace/punct-delimited run),
 *   stemming, phrase queries.
 */
import { stripMarkdown } from "./markdown";

export interface SearchDoc {
  id: string; title: string; content: string; tags?: string[]; folder?: string; workspaceId?: string; isTrashed?: boolean;
}
export interface SearchFilters { tags?: string[]; folder?: string; workspaceId?: string; includeTrashed?: boolean }
export interface SearchOptions extends SearchFilters { limit?: number; match?: "all" | "any"; prefixAll?: boolean; snippetLength?: number }
export interface Snippet { text: string; ranges: [number, number][] }
export interface SearchHit { id: string; score: number; snippet: Snippet; titleRanges: [number, number][] }

const FIELD_W = { title: 3, tags: 2, body: 1 } as const;
const K1 = 1.2, B = 0.75;

export function tokenize(text: string): string[] {
  return tokensWithPos(text).map((t) => t.term);
}
function fold(s: string): string {
  return s.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase();
}
function tokensWithPos(text: string): { term: string; start: number; end: number }[] {
  const out: { term: string; start: number; end: number }[] = [];
  const re = /[\p{L}\p{N}]+(?:['’][\p{L}]+)?/gu;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const term = fold(m[0]).replace(/['’]/g, "");
    if (term.length > 0 && term.length <= 64) out.push({ term, start: m.index, end: m.index + m[0].length });
  }
  return out;
}

function withinDistance(a: string, b: string, max: number): boolean {
  if (Math.abs(a.length - b.length) > max) return false;
  // Optimal-string-alignment distance: insert/delete/substitute/adjacent transposition.
  let prev2: number[] = [];
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      let v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, prev2[j - 2] + 1);
      cur[j] = v;
      if (v < rowMin) rowMin = v;
    }
    if (rowMin > max + 1) return false;
    prev2 = prev;
    prev = cur;
  }
  return prev[b.length] <= max;
}
const maxTypos = (t: string) => (t.length >= 8 ? 2 : t.length >= 4 ? 1 : 0);

interface DocMeta { doc: SearchDoc; len: number; terms: string[]; tags: Set<string> }
interface Posting { w: number } // weighted tf

export class SearchIndex {
  private docs = new Map<string, DocMeta>();
  private postings = new Map<string, Map<string, Posting>>();
  private totalLen = 0;
  private sortedTerms: string[] | null = null;

  get size(): number { return this.docs.size; }

  upsert(doc: SearchDoc): void {
    this.remove(doc.id);
    const body = stripMarkdown(doc.content ?? "");
    const tf = new Map<string, number>();
    let len = 0;
    const add = (text: string, w: number) => {
      for (const t of tokenize(text)) { tf.set(t, (tf.get(t) ?? 0) + w); len += w; }
    };
    add(doc.title ?? "", FIELD_W.title);
    add((doc.tags ?? []).join(" "), FIELD_W.tags);
    add(body, FIELD_W.body);
    for (const [term, w] of tf) {
      let p = this.postings.get(term);
      if (!p) { p = new Map(); this.postings.set(term, p); this.sortedTerms = null; }
      p.set(doc.id, { w });
    }
    this.docs.set(doc.id, { doc, len, terms: [...tf.keys()], tags: new Set((doc.tags ?? []).map((t) => t.toLowerCase())) });
    this.totalLen += len;
  }

  remove(id: string): void {
    const m = this.docs.get(id);
    if (!m) return;
    for (const t of m.terms) {
      const p = this.postings.get(t);
      p?.delete(id);
      if (p && p.size === 0) { this.postings.delete(t); this.sortedTerms = null; }
    }
    this.totalLen -= m.len;
    this.docs.delete(id);
  }

  private terms(): string[] {
    return (this.sortedTerms ??= [...this.postings.keys()].sort());
  }

  private prefixTerms(prefix: string, cap = 50): string[] {
    const arr = this.terms();
    let lo = 0, hi = arr.length;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (arr[mid] < prefix) lo = mid + 1; else hi = mid; }
    const out: string[] = [];
    for (let i = lo; i < arr.length && arr[i].startsWith(prefix) && out.length < cap; i++) out.push(arr[i]);
    return out;
  }

  /** Expand a query token to [{term, weight}] */
  private expand(tok: string, prefix: boolean): { term: string; weight: number }[] {
    const out = new Map<string, number>();
    if (this.postings.has(tok)) out.set(tok, 1);
    if (prefix && tok.length >= 1) for (const t of this.prefixTerms(tok)) if (!out.has(t)) out.set(t, 0.7);
    if (out.size === 0) {
      const d = maxTypos(tok);
      if (d > 0) {
        for (const t of this.postings.keys()) {
          if (Math.abs(t.length - tok.length) <= d && t[0] === tok[0] && withinDistance(tok, t, d)) out.set(t, 0.45);
          else if (Math.abs(t.length - tok.length) <= d && withinDistance(tok, t, d) && tok.length >= 6) out.set(t, 0.4);
        }
      }
    }
    return [...out].map(([term, weight]) => ({ term, weight }));
  }

  private passes(m: DocMeta, f: SearchFilters): boolean {
    if (!f.includeTrashed && m.doc.isTrashed) return false;
    if (f.workspaceId && m.doc.workspaceId !== f.workspaceId) return false;
    if (f.folder) {
      const d = m.doc.folder ?? "";
      if (d !== f.folder && !d.startsWith(f.folder + "/")) return false;
    }
    if (f.tags?.length && !f.tags.every((t) => m.tags.has(t.toLowerCase().replace(/^#/, "")))) return false;
    return true;
  }

  search(query: string, opts: SearchOptions = {}): SearchHit[] {
    const qt = tokenize(query);
    if (!qt.length) return [];
    const N = this.docs.size || 1;
    const avg = this.totalLen / N || 1;
    const mode = opts.match ?? "all";
    const scores = new Map<string, number>();
    const matchedTokens = new Map<string, number>();
    const expansions = qt.map((tok, i) => this.expand(tok, i === qt.length - 1 || !!opts.prefixAll));
    expansions.forEach((exp) => {
      const perDoc = new Map<string, number>();
      for (const { term, weight } of exp) {
        const post = this.postings.get(term)!;
        const idf = Math.log(1 + (N - post.size + 0.5) / (post.size + 0.5));
        for (const [id, p] of post) {
          const m = this.docs.get(id)!;
          const s = weight * idf * ((p.w * (K1 + 1)) / (p.w + K1 * (1 - B + (B * m.len) / avg)));
          if (s > (perDoc.get(id) ?? 0)) perDoc.set(id, s);
        }
      }
      for (const [id, s] of perDoc) {
        scores.set(id, (scores.get(id) ?? 0) + s);
        matchedTokens.set(id, (matchedTokens.get(id) ?? 0) + 1);
      }
    });
    const hits: { id: string; score: number }[] = [];
    for (const [id, score] of scores) {
      if (mode === "all" && (matchedTokens.get(id) ?? 0) < qt.length) continue;
      const m = this.docs.get(id)!;
      if (!this.passes(m, opts)) continue;
      hits.push({ id, score });
    }
    hits.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
    const limit = opts.limit ?? 50;
    const matcher = this.makeMatcher(qt, expansions);
    return hits.slice(0, limit).map((h) => {
      const d = this.docs.get(h.id)!.doc;
      return {
        id: h.id, score: h.score,
        snippet: makeSnippet(stripMarkdown(d.content), matcher, opts.snippetLength ?? 160),
        titleRanges: tokensWithPos(d.title).filter((t) => matcher(t.term)).map((t) => [t.start, t.end] as [number, number]),
      };
    });
  }

  private makeMatcher(qt: string[], expansions: { term: string; weight: number }[][]): (term: string) => boolean {
    const set = new Set<string>();
    expansions.forEach((e) => e.forEach((x) => set.add(x.term)));
    qt.forEach((t) => set.add(t));
    return (term) => set.has(term);
  }

  /** Autocomplete helper: indexed terms starting with prefix, most frequent first. */
  suggest(prefix: string, limit = 8): string[] {
    const p = fold(prefix);
    if (!p) return [];
    return this.prefixTerms(p, 200).sort((a, b) => this.postings.get(b)!.size - this.postings.get(a)!.size || a.localeCompare(b)).slice(0, limit);
  }
}

/** Build a snippet around the densest cluster of matched words. Ranges index into `text`. */
export function makeSnippet(plain: string, isMatch: (term: string) => boolean, length = 160): Snippet {
  const toks = tokensWithPos(plain);
  const hits = toks.filter((t) => isMatch(t.term));
  if (!hits.length) return { text: plain.slice(0, length) + (plain.length > length ? "…" : ""), ranges: [] };
  let best = hits[0];
  let bestCount = 0;
  for (const h of hits) {
    const c = hits.filter((x) => x.start >= h.start && x.end <= h.start + length).length;
    if (c > bestCount) { bestCount = c; best = h; }
  }
  let start = Math.max(0, best.start - Math.floor(length / 4));
  if (start > 0) { const sp = plain.indexOf(" ", start); if (sp >= 0 && sp < best.start) start = sp + 1; }
  const end = Math.min(plain.length, start + length);
  const prefix = start > 0 ? "…" : "";
  const text = prefix + plain.slice(start, end) + (end < plain.length ? "…" : "");
  const ranges = hits.filter((h) => h.start >= start && h.end <= end).map((h) => [h.start - start + prefix.length, h.end - start + prefix.length] as [number, number]);
  return { text, ranges };
}

/** Render a snippet to HTML-safe string with <mark> around matches (text is escaped). */
export function snippetToHtml(s: Snippet): string {
  const esc = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  let out = "";
  let last = 0;
  for (const [a, b] of s.ranges) { out += esc(s.text.slice(last, a)) + "<mark>" + esc(s.text.slice(a, b)) + "</mark>"; last = b; }
  return out + esc(s.text.slice(last));
}
