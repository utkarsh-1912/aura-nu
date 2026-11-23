/**
 * When a note's title settles on a new value (1.2s without typing, or the user switches notes),
 * rewrite [[old title]] links in other notes via LinkIndex.rename() and persist them through
 * `applyNotes` (WorkspacePage's normal update + sync path).
 */
import { useEffect, useRef } from "react";
import type { Note } from "../../types";
import { normalizeTitle } from "../../core/links";
import type { NoteIndexes } from "./useNoteIndexes";
import { applyRenameChanges } from "./rename";

const SETTLE_MS = 1200;

export function useTitleRename(opts: {
  activeNote: Note | null;
  notes: Note[];
  indexes: NoteIndexes;
  applyNotes: (next: Note[]) => void;
  onRewritten?: (count: number, newTitle: string) => void;
}) {
  const latest = useRef(opts);
  latest.current = opts;
  const baseline = useRef<{ id: string; title: string } | null>(null);

  /** Returns false when the index is still catching up and the caller should retry. */
  const settle = (noteId: string): boolean => {
    const { notes, indexes: ix, applyNotes, onRewritten } = latest.current;
    const base = baseline.current;
    const note = notes.find((n) => n.id === noteId);
    if (!note || !base || base.id !== noteId) return true;
    const next = note.title.trim();
    const prev = base.title.trim();
    if (!next || !prev || normalizeTitle(next) === normalizeTitle(prev)) { base.title = note.title; return true; }
    if (ix.indexer.pending > 50) return false;
    const changes = ix.indexer.planRename(noteId, prev, next);
    const res = applyRenameChanges(notes, changes, noteId);
    base.title = note.title;
    if (res.rewritten > 0) {
      applyNotes(res.notes);
      onRewritten?.(res.rewritten, next);
    }
    return true;
  };

  const id = opts.activeNote?.id ?? null;
  const title = opts.activeNote?.title ?? "";

  // Switching notes: settle the previous note first, then re-baseline on the new one.
  useEffect(() => {
    const prev = baseline.current;
    if (prev && prev.id !== id) settle(prev.id);
    const note = latest.current.activeNote;
    baseline.current = note ? { id: note.id, title: note.title } : null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    if (!id || !baseline.current || baseline.current.id !== id) return;
    if (normalizeTitle(title) === normalizeTitle(baseline.current.title)) return;
    let t: ReturnType<typeof setTimeout>;
    const attempt = () => { if (!settle(id)) t = setTimeout(attempt, 1000); };
    t = setTimeout(attempt, SETTLE_MS);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, title, opts.indexes.version]);
}
