/** Pure ranking for the [[wikilink]] suggestion popup. */
import { normalizeTitle } from "../../core/links";

export interface SuggestNote { id: string; title: string; isTrashed?: boolean; isArchived?: boolean; updatedAt?: string }
export interface Suggestion { kind: "note" | "create"; title: string; id?: string }

/**
 * Prefix matches first, then substring, then (empty query) most recently edited. Trashed notes are never
 * offered; the note currently being edited is excluded. If nothing equals the query a "Create" option
 * is appended (the note itself is only created when the link is CLICKED).
 */
export function rankTitleSuggestions(notes: SuggestNote[], query: string, currentId: string | null, limit = 8): Suggestion[] {
  const q = normalizeTitle(query);
  const pool = notes.filter((n) => !n.isTrashed && n.id !== currentId && n.title.trim());
  const scored: { n: SuggestNote; s: number }[] = [];
  for (const n of pool) {
    const t = normalizeTitle(n.title);
    if (!q) { scored.push({ n, s: 0 }); continue; }
    if (t === q) scored.push({ n, s: 3 });
    else if (t.startsWith(q)) scored.push({ n, s: 2 });
    else if (t.includes(q)) scored.push({ n, s: 1 });
  }
  scored.sort((a, b) => b.s - a.s || (b.n.updatedAt ?? "").localeCompare(a.n.updatedAt ?? "") || a.n.title.localeCompare(b.n.title));
  const out: Suggestion[] = scored.slice(0, limit).map(({ n }) => ({ kind: "note", title: n.title, id: n.id }));
  const trimmed = query.trim();
  if (trimmed && !notes.some((n) => !n.isTrashed && normalizeTitle(n.title) === q)) out.push({ kind: "create", title: trimmed });
  return out;
}
