/**
 * [[wikilink]] / ![[embed]] parsing, backlink + unlinked-mention index,
 * rename-safe rewriting and orphan detection. Framework-free.
 *
 * Syntax: [[Target]], [[Target|alias]], [[Target#Heading]], [[Target#Heading|alias]], ![[Target]].
 * Links inside fenced code blocks and inline code are ignored.
 * Resolution is by case-insensitive, whitespace-collapsed note title (first note
 * wins on duplicate titles; ties are broken by id for determinism). Resolution is
 * done at query time, so renames/new notes re-resolve without reindexing others.
 */

export interface ParsedLink { target: string; heading: string; alias: string; embed: boolean; start: number; end: number }

const LINK_RE = /(!?)\[\[([^\[\]|#\n]+?)(?:#([^\[\]|\n]*))?(?:\|([^\[\]\n]*))?\]\]/g;

export const normalizeTitle = (t: string) => t.normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase();

/** Replace code blocks/spans with spaces (same length) so indices stay valid. */
export function maskCode(md: string): string {
  return md
    .replace(/(^|\n)(```|~~~)[^\n]*\n[\s\S]*?(\n\2[^\n]*(?=\n|$)|$)/g, (m) => m.replace(/[^\n]/g, " "))
    .replace(/`[^`\n]*`/g, (m) => " ".repeat(m.length));
}

export function parseLinks(md: string): ParsedLink[] {
  const masked = maskCode(String(md ?? ""));
  const out: ParsedLink[] = [];
  const re = new RegExp(LINK_RE.source, "g");
  let m: RegExpExecArray | null;
  while ((m = re.exec(masked))) {
    out.push({ embed: m[1] === "!", target: m[2].trim(), heading: (m[3] ?? "").trim(), alias: (m[4] ?? "").trim(), start: m.index, end: m.index + m[0].length });
    if (out.length >= 5000) break;
  }
  return out;
}

/** Rewrite links pointing at oldTitle so they point at newTitle (heading/alias/embed preserved). */
export function rewriteLinks(md: string, oldTitle: string, newTitle: string): { markdown: string; changed: number } {
  const src = String(md ?? "");
  const want = normalizeTitle(oldTitle);
  const links = parseLinks(src).filter((l) => normalizeTitle(l.target) === want);
  if (!links.length) return { markdown: src, changed: 0 };
  let out = "";
  let last = 0;
  for (const l of links) {
    out += src.slice(last, l.start);
    out += `${l.embed ? "!" : ""}[[${newTitle}${l.heading ? "#" + l.heading : ""}${l.alias ? "|" + l.alias : ""}]]`;
    last = l.end;
  }
  out += src.slice(last);
  return { markdown: out, changed: links.length };
}

export interface LinkNote { id: string; title: string; content: string; workspaceId?: string; isTrashed?: boolean }
export interface Backlink { sourceId: string; link: ParsedLink; context: string }
export interface UnlinkedMention { sourceId: string; index: number; context: string }

function ctx(text: string, start: number, end: number): string {
  const s = Math.max(0, start - 40);
  const e = Math.min(text.length, end + 40);
  return (s > 0 ? "…" : "") + text.slice(s, e).replace(/\s+/g, " ").trim() + (e < text.length ? "…" : "");
}

export class LinkIndex {
  private notes = new Map<string, LinkNote>();
  private outgoing = new Map<string, ParsedLink[]>();
  /** normalized target -> source ids that link to it */
  private byTarget = new Map<string, Set<string>>();
  /** normalized title -> ids */
  private byTitle = new Map<string, Set<string>>();

  /** Add or update a note (incremental: only this note is reparsed). */
  upsert(note: LinkNote): void {
    this.remove(note.id);
    this.notes.set(note.id, note);
    const nt = normalizeTitle(note.title);
    if (nt) (this.byTitle.get(nt) ?? this.byTitle.set(nt, new Set()).get(nt)!).add(note.id);
    const links = parseLinks(note.content);
    this.outgoing.set(note.id, links);
    for (const l of links) {
      const k = normalizeTitle(l.target);
      (this.byTarget.get(k) ?? this.byTarget.set(k, new Set()).get(k)!).add(note.id);
    }
  }

  remove(id: string): void {
    const old = this.notes.get(id);
    if (!old) return;
    const nt = normalizeTitle(old.title);
    this.byTitle.get(nt)?.delete(id);
    if (this.byTitle.get(nt)?.size === 0) this.byTitle.delete(nt);
    for (const l of this.outgoing.get(id) ?? []) {
      const k = normalizeTitle(l.target);
      this.byTarget.get(k)?.delete(id);
      if (this.byTarget.get(k)?.size === 0) this.byTarget.delete(k);
    }
    this.outgoing.delete(id);
    this.notes.delete(id);
  }

  resolve(target: string): string | undefined {
    const ids = this.byTitle.get(normalizeTitle(target));
    if (!ids?.size) return undefined;
    return [...ids].sort()[0];
  }

  outgoingLinks(id: string): { link: ParsedLink; targetId?: string }[] {
    return (this.outgoing.get(id) ?? []).map((link) => ({ link, targetId: this.resolve(link.target) }));
  }

  backlinks(id: string): Backlink[] {
    const note = this.notes.get(id);
    if (!note) return [];
    const out: Backlink[] = [];
    for (const src of this.byTarget.get(normalizeTitle(note.title)) ?? []) {
      if (src === id || this.resolve(note.title) !== id) continue;
      const sn = this.notes.get(src)!;
      for (const l of this.outgoing.get(src) ?? []) {
        if (normalizeTitle(l.target) === normalizeTitle(note.title)) out.push({ sourceId: src, link: l, context: ctx(sn.content, l.start, l.end) });
      }
    }
    return out.sort((a, b) => a.sourceId.localeCompare(b.sourceId) || a.link.start - b.link.start);
  }

  /** Links whose target matches no note title: target -> source ids. */
  unresolved(): Map<string, string[]> {
    const out = new Map<string, string[]>();
    for (const [k, srcs] of this.byTarget) if (!this.byTitle.has(k)) out.set(k, [...srcs].sort());
    return out;
  }

  /** Plain-text occurrences of this note's title in other notes that are not already links. O(total text); titles < 3 chars ignored. */
  unlinkedMentions(id: string, limit = 100): UnlinkedMention[] {
    const note = this.notes.get(id);
    if (!note || normalizeTitle(note.title).length < 3) return [];
    const needle = normalizeTitle(note.title);
    const out: UnlinkedMention[] = [];
    for (const [sid, sn] of this.notes) {
      if (sid === id || sn.isTrashed) continue;
      let text = maskCode(sn.content);
      for (const l of this.outgoing.get(sid) ?? []) text = text.slice(0, l.start) + " ".repeat(l.end - l.start) + text.slice(l.end);
      const hay = text.toLowerCase();
      let from = 0;
      for (;;) {
        const i = hay.indexOf(needle, from);
        if (i < 0) break;
        const before = hay[i - 1], after = hay[i + needle.length];
        const wordish = (c?: string) => !!c && /[\p{L}\p{N}_]/u.test(c);
        if (!wordish(before) && !wordish(after)) {
          out.push({ sourceId: sid, index: i, context: ctx(sn.content, i, i + needle.length) });
          if (out.length >= limit) return out;
          break; // one mention per note is enough for the UI
        }
        from = i + needle.length;
      }
    }
    return out;
  }

  /** Notes with no outgoing resolved link and no inbound link. Trashed notes are skipped. */
  orphans(): string[] {
    const out: string[] = [];
    for (const [id, n] of this.notes) {
      if (n.isTrashed) continue;
      const hasOut = (this.outgoing.get(id) ?? []).some((l) => this.resolve(l.target) !== undefined && this.resolve(l.target) !== id);
      if (hasOut) continue;
      if (this.backlinks(id).length) continue;
      out.push(id);
    }
    return out.sort();
  }

  /** Edges for a graph view (resolved links only). */
  edges(): { from: string; to: string }[] {
    const seen = new Set<string>();
    const out: { from: string; to: string }[] = [];
    for (const [id] of this.notes) for (const { targetId } of this.outgoingLinks(id)) {
      if (!targetId || targetId === id) continue;
      const k = `${id}\u0000${targetId}`;
      if (!seen.has(k)) { seen.add(k); out.push({ from: id, to: targetId }); }
    }
    return out;
  }

  /**
   * Rename `id` to newTitle. Returns the content rewrites for every OTHER note that linked to the old
   * title (and the new title for the renamed note). The caller persists them; the index is updated here.
   */
  rename(id: string, newTitle: string): { id: string; title?: string; content?: string }[] {
    const note = this.notes.get(id);
    if (!note) return [];
    const oldTitle = note.title;
    const changes: { id: string; title?: string; content?: string }[] = [{ id, title: newTitle }];
    const sources = [...(this.byTarget.get(normalizeTitle(oldTitle)) ?? [])];
    this.upsert({ ...note, title: newTitle });
    if (this.resolve(newTitle) !== id) return changes; // ambiguous new title: leave links alone
    for (const sid of sources) {
      const sn = this.notes.get(sid);
      if (!sn) continue;
      const r = rewriteLinks(sn.content, oldTitle, newTitle);
      if (r.changed) {
        changes.push({ id: sid, content: r.markdown });
        this.upsert({ ...sn, content: r.markdown });
      }
    }
    return changes;
  }
}
