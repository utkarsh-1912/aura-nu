/**
 * Backlinks + unlinked mentions for the active note, from LinkIndex. Collapsed by default (the count is
 * cheap; unlinked mentions scan note text, so they are only computed while the panel is open).
 */
import React, { useDeferredValue, useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Link2 } from "lucide-react";
import type { Note } from "../../types";
import { Skeleton, cn } from "../../ui";
import type { NoteIndexes } from "../indexes/useNoteIndexes";

interface Props {
  note: Note;
  notes: Note[];
  indexes: NoteIndexes;
  onOpenNote: (id: string) => void;
}

export default function BacklinksPanel({ note, notes, indexes, onOpenNote }: Props) {
  const [open, setOpen] = useState(false);
  const version = useDeferredValue(indexes.version);
  const titleOf = useMemo(() => new Map(notes.map((n) => [n.id, n.title || "Untitled Note"])), [notes]);
  const building = indexes.status === "building";

  const backlinks = useMemo(() => {
    void version;
    const seen = new Set<string>();
    return indexes.link.backlinks(note.id).filter((b) => (seen.has(b.sourceId) ? false : (seen.add(b.sourceId), true)));
  }, [indexes.link, note.id, note.title, version]);

  const mentions = useMemo(() => {
    void version;
    return open ? indexes.link.unlinkedMentions(note.id, 25) : [];
  }, [indexes.link, note.id, note.title, version, open]);

  const Chevron = open ? ChevronDown : ChevronRight;
  return (
    <section aria-label="Linked notes" className="shrink-0 border-t border-line bg-surface select-none">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className="flex h-10 w-full cursor-pointer items-center gap-2 px-4 text-left text-[12px] font-medium text-fg-muted hover:bg-hover focus-visible:outline-2 focus-visible:outline-accent sm:h-8 sm:px-6"
      >
        <Chevron size={13} aria-hidden />
        <Link2 size={13} aria-hidden />
        <span>Linked notes</span>
        <span className="tabular-nums text-fg-subtle">
          {building ? "indexing…" : `${backlinks.length} backlink${backlinks.length === 1 ? "" : "s"}`}
        </span>
      </button>
      {open && (
        <div className="max-h-56 overflow-y-auto px-4 pb-3 sm:px-6">
          {building && backlinks.length === 0 ? (
            <div className="space-y-2 py-1" aria-busy="true"><Skeleton className="h-3.5 w-1/2" /><Skeleton className="h-3.5 w-3/4" /></div>
          ) : (
            <>
              <h4 className="pb-1 text-[11px] font-medium uppercase tracking-wide text-fg-subtle">Backlinks</h4>
              {backlinks.length === 0 ? (
                <p className="pb-2 text-[12px] text-fg-muted">No notes link here yet. Type [[ in another note to link to this one.</p>
              ) : (
                <ul className="pb-2">
                  {backlinks.map((b) => (
                    <li key={b.sourceId}>
                      <button type="button" onClick={() => onOpenNote(b.sourceId)} className={rowCls}>
                        <span className="block truncate text-[13px] font-medium text-fg">{titleOf.get(b.sourceId) ?? "Note"}</span>
                        <span className="block truncate text-[12px] text-fg-muted">{b.context}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <h4 className="pb-1 text-[11px] font-medium uppercase tracking-wide text-fg-subtle">Unlinked mentions</h4>
              {mentions.length === 0 ? (
                <p className="text-[12px] text-fg-muted">No other note mentions this title in plain text.</p>
              ) : (
                <ul>
                  {mentions.map((m) => (
                    <li key={m.sourceId}>
                      <button type="button" onClick={() => onOpenNote(m.sourceId)} className={rowCls}>
                        <span className="block truncate text-[13px] font-medium text-fg">{titleOf.get(m.sourceId) ?? "Note"}</span>
                        <span className="block truncate text-[12px] text-fg-muted">{m.context}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </div>
      )}
    </section>
  );
}

const rowCls = cn(
  "block min-h-10 w-full cursor-pointer rounded-md px-2 py-1 text-left hover:bg-hover",
  "focus-visible:outline-2 focus-visible:outline-accent",
);
