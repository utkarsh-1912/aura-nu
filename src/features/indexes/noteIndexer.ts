/**
 * Incremental owner of the LinkIndex + SearchIndex. Framework-free so it can be unit tested.
 *
 *   sync(notes)  -> diffs against what is indexed (reference compare, then the fields that matter)
 *                   and queues upserts/removals. Cheap: O(n) reference compares.
 *   step(budget) -> drains the queue until `budgetMs` elapsed. The React hook calls this from idle
 *                   callbacks so a 5k-note first build never blocks a frame for long.
 *
 * Encrypted notes (vaultCrypto envelopes) are indexed by TITLE ONLY: the ciphertext is never tokenised
 * and never parsed for links. Trashed notes stay indexed (search filters them) so restore is instant.
 */
import { LinkIndex, type LinkNote } from "../../core/links";
import { SearchIndex, type SearchDoc } from "../../core/search";
import { isLockedEnvelope } from "../../core/vaultCrypto";

export interface IndexableNote {
  id: string; title: string; content: string; tags: string[]; folder?: string; workspaceId: string; isTrashed?: boolean;
}

/** Cheap pre-check before the JSON.parse in isLockedEnvelope. */
export function isEncryptedContent(content: string | undefined): boolean {
  if (!content || content.charCodeAt(0) !== 123 /* { */ || content.length < 40) return false;
  return isLockedEnvelope(content);
}

const sameTags = (a: string[], b: string[]) => a.length === b.length && a.every((t, i) => t === b[i]);
const changed = (a: IndexableNote, b: IndexableNote) =>
  a.title !== b.title || a.content !== b.content || a.folder !== b.folder || !!a.isTrashed !== !!b.isTrashed || !sameTags(a.tags, b.tags) || a.workspaceId !== b.workspaceId;

export class NoteIndexer {
  readonly link = new LinkIndex();
  readonly search = new SearchIndex();
  private known = new Map<string, IndexableNote>();
  private queue = new Map<string, IndexableNote | null>(); // null = remove
  /** largest queue length of the current batch (progress denominator) */
  private batchTotal = 0;

  get pending(): number { return this.queue.size; }
  get total(): number { return this.batchTotal; }
  get indexed(): number { return this.known.size; }

  /** Queue the difference between `notes` and the indexed state. Returns the queue length. */
  sync(notes: IndexableNote[]): number {
    const seen = new Set<string>();
    for (const n of notes) {
      seen.add(n.id);
      const queued = this.queue.get(n.id);
      const prev = queued !== undefined ? queued : this.known.get(n.id);
      if (prev === n) continue;
      if (!prev || changed(prev, n)) this.queue.set(n.id, n);
    }
    for (const id of [...this.known.keys()]) if (!seen.has(id)) this.queue.set(id, null);
    for (const [id, v] of [...this.queue]) if (v === null && !seen.has(id) && !this.known.has(id)) this.queue.delete(id);
    if (this.queue.size > this.batchTotal) this.batchTotal = this.queue.size;
    return this.queue.size;
  }

  /** Process queued ops for up to budgetMs. Returns remaining queue length. */
  step(budgetMs = 8, now: () => number = () => (typeof performance !== "undefined" ? performance.now() : Date.now())): number {
    const start = now();
    for (const [id, n] of this.queue) {
      this.apply(id, n);
      this.queue.delete(id);
      if (now() - start >= budgetMs) break;
    }
    if (this.queue.size === 0) this.batchTotal = 0;
    return this.queue.size;
  }

  /** Drain everything synchronously (tests / small updates). */
  flush(): void {
    while (this.step(Infinity) > 0) { /* drained */ }
  }

  private apply(id: string, n: IndexableNote | null): void {
    if (n === null) {
      this.link.remove(id);
      this.search.remove(id);
      this.known.delete(id);
      return;
    }
    const body = isEncryptedContent(n.content) ? "" : n.content;
    const ln: LinkNote = { id: n.id, title: n.title, content: body, workspaceId: n.workspaceId, isTrashed: n.isTrashed };
    const sd: SearchDoc = { id: n.id, title: n.title, content: body, tags: n.tags, folder: n.folder, workspaceId: n.workspaceId, isTrashed: n.isTrashed };
    this.link.upsert(ln);
    this.search.upsert(sd);
    this.known.set(id, n);
  }

  /**
   * Plan a rename using LinkIndex.rename(). The index may already hold the NEW title (it follows edits),
   * so the renamed note is first reset to `oldTitle` so the link index finds the notes linking to it.
   */
  planRename(id: string, oldTitle: string, newTitle: string): { id: string; title?: string; content?: string }[] {
    this.flush();
    const cur = this.known.get(id);
    if (!cur) return [];
    this.link.upsert({ id, title: oldTitle, content: isEncryptedContent(cur.content) ? "" : cur.content, workspaceId: cur.workspaceId, isTrashed: cur.isTrashed });
    return this.link.rename(id, newTitle);
  }
}
