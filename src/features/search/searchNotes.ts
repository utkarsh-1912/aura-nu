/** Thin, testable layer between SearchIndex and the UI lists. */
import { tokenize, type SearchHit } from "../../core/search";
import type { NoteIndexer } from "../indexes/noteIndexer";

export interface NoteSearchResult { order: string[]; hits: Map<string, SearchHit> }

/**
 * Runs a query against the index. `#tag` tokens become tag filters (AND), the rest is the text query.
 * Returns hit ids in score order.
 */
export function searchNotes(index: NoteIndexer["search"], raw: string, opts: { workspaceId?: string; includeTrashed?: boolean; limit?: number } = {}): NoteSearchResult | null {
  const tags: string[] = [];
  const text = raw.replace(/(^|\s)#([\p{L}\p{N}_-]+)/gu, (_m, _s, t: string) => { tags.push(t); return " "; }).trim();
  if (!text && tags.length === 0) return null;
  const q = text || tags.join(" ");
  if (tokenize(q).length === 0) return null; // punctuation only: let the caller use its substring fallback
  const hits = index.search(q, { workspaceId: opts.workspaceId, includeTrashed: opts.includeTrashed, limit: opts.limit ?? 200, tags: text ? tags : undefined, snippetLength: 140 });
  const map = new Map<string, SearchHit>();
  for (const h of hits) map.set(h.id, h);
  return { order: hits.map((h) => h.id), hits: map };
}
