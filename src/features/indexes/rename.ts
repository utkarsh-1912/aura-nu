/** Applies LinkIndex.rename() output to a note list through the normal note shape (counts + updatedAt). */
import type { Note } from "../../types";
import { countWords, readingTimeOf } from "../noteUtils";

export function applyRenameChanges(
  notes: Note[],
  changes: { id: string; title?: string; content?: string }[],
  skipId: string,
  now: Date = new Date(),
): { notes: Note[]; rewritten: number } {
  const byId = new Map(changes.filter((c) => c.id !== skipId && c.content !== undefined).map((c) => [c.id, c]));
  if (byId.size === 0) return { notes, rewritten: 0 };
  const iso = now.toISOString();
  let rewritten = 0;
  const out = notes.map((n) => {
    const c = byId.get(n.id);
    if (!c || c.content === undefined || c.content === n.content) return n;
    rewritten++;
    const words = countWords(c.content);
    return { ...n, content: c.content, wordCount: words, readingTime: readingTimeOf(words), updatedAt: iso };
  });
  return { notes: out, rewritten };
}
