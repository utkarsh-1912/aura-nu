import * as Y from "yjs";

/**
 * Markdown <-> Y.Doc helpers (pure). The note body lives in Y.Text "body"; `meta` holds flags.
 */
export const BODY_KEY = "body";
export const META_KEY = "meta";
export const MAX_SEED_CHARS = 5_000_000;

/** FNV-1a 32-bit, used to derive a deterministic Yjs clientID from the seed content. */
export function fnv1a(str: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

export function exportMarkdown(doc: Y.Doc): string {
  return doc.getText(BODY_KEY).toString();
}

/**
 * Seeds the doc body from existing Markdown AT MOST ONCE across all clients.
 *
 * How: the seed is built in a scratch doc whose clientID is derived from the content hash, then its
 * update is applied to the real doc. Two clients seeding the SAME markdown concurrently produce the
 * identical (clientID, clock) operations, which Yjs de-duplicates, so the text appears once, not twice.
 * Clients with DIFFERENT markdown use different clientIDs, so nothing is ever corrupted; the
 * `meta.seeded` check (run after the provider has synced) prevents that case in the normal flow.
 *
 * Call only AFTER the first sync with the server (or after local persistence loaded and sync timed out),
 * otherwise an empty-looking doc may simply not have received remote state yet.
 * Returns true if this call seeded.
 */
export function seedFromMarkdown(doc: Y.Doc, markdown: string): boolean {
  if (typeof markdown !== "string" || markdown.length === 0) return false;
  if (markdown.length > MAX_SEED_CHARS) throw new Error("markdown too large to seed");
  const text = doc.getText(BODY_KEY);
  const meta = doc.getMap<string>(META_KEY);
  if (meta.get("seeded") !== undefined || text.length > 0) return false;

  const hash = fnv1a(markdown);
  const scratch = new Y.Doc();
  // Avoid 0 and collisions with real random 32-bit ids being impossible to rule out; the hash is
  // only ever shared by identical content, which is exactly the dedupe we want.
  scratch.clientID = hash === 0 ? 1 : hash;
  scratch.getText(BODY_KEY).insert(0, markdown);
  scratch.getMap<string>(META_KEY).set("seeded", hash.toString(16));
  Y.applyUpdate(doc, Y.encodeStateAsUpdate(scratch), "seed");
  scratch.destroy();
  return true;
}

/**
 * Applies `next` to a Y.Text with a minimal common-prefix/suffix diff, so editors that give you whole
 * strings (textarea, hand-rolled editor) don't replace the entire document and clobber remote edits.
 */
export function applyTextDiff(ytext: Y.Text, next: string): void {
  const prev = ytext.toString();
  if (prev === next) return;
  let start = 0;
  const max = Math.min(prev.length, next.length);
  while (start < max && prev.charCodeAt(start) === next.charCodeAt(start)) start++;
  let endPrev = prev.length;
  let endNext = next.length;
  while (endPrev > start && endNext > start && prev.charCodeAt(endPrev - 1) === next.charCodeAt(endNext - 1)) {
    endPrev--;
    endNext--;
  }
  // Don't split a surrogate pair.
  const isHigh = (c: number) => c >= 0xd800 && c <= 0xdbff;
  if (start > 0 && isHigh(prev.charCodeAt(start - 1))) start--;
  doc_transact(ytext, () => {
    if (endPrev > start) ytext.delete(start, endPrev - start);
    if (endNext > start) ytext.insert(start, next.slice(start, endNext));
  });
}

function doc_transact(ytext: Y.Text, fn: () => void) {
  if (ytext.doc) ytext.doc.transact(fn, "local-diff");
  else fn();
}
