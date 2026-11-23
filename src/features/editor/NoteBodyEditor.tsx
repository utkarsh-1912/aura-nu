/**
 * Flag-gated wrapper around AuraEditor (TipTap). Rendered by EditorArea instead of the legacy body
 * editor only when localStorage `aura-flag-tiptap-editor` is "true".
 *
 * - Markdown in (note.content) / Markdown out (onChange -> EditorArea.handleContentChange, i.e. the exact
 *   same autosave / wordCount / updatedAt / versionHistory path as the legacy editor).
 * - [[ triggers a popup of note titles; clicking a wikilink opens the note (creating it if unresolved).
 * - The component is keyed by note id by the parent: a pending debounced edit is flushed on unmount so a
 *   quick note switch cannot lose or misroute it (AuraEditor itself drops its timer on unmount).
 */
import React, { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from "react";
import "./editor.css";
import type { AuraEditorHandle, WikiSuggestState } from "../../editor/AuraEditor";
import { htmlToMarkdown } from "../../core/markdown";
import { Skeleton } from "../../ui";
import { rankTitleSuggestions, type SuggestNote, type Suggestion } from "./wikiSuggest";

const AuraEditor = lazy(() => import("../../editor/AuraEditor"));

export interface NoteBodyEditorProps {
  noteId: string;
  value: string;
  readOnly: boolean;
  /** Candidate notes for [[ suggestions (current workspace). */
  notes: SuggestNote[];
  onChange: (markdown: string) => void;
  onOpenLink: (title: string) => void;
}

export default function NoteBodyEditor({ noteId, value, readOnly, notes, onChange, onOpenLink }: NoteBodyEditorProps) {
  const handle = useRef<AuraEditorHandle>(null);
  const dirty = useRef(false);
  const cb = useRef({ onChange, onOpenLink, value });
  cb.current = { onChange, onOpenLink, value };
  const [suggest, setSuggest] = useState<WikiSuggestState | null>(null);
  const [active, setActive] = useState(0);

  const options: Suggestion[] = useMemo(
    () => (suggest ? rankTitleSuggestions(notes, suggest.query, noteId) : []),
    [suggest, notes, noteId],
  );
  useEffect(() => setActive(0), [suggest?.query]);

  const emit = useCallback((md: string) => {
    // TipTap may normalise Markdown while mounting. That must not count as an edit (it would bump
    // updatedAt and add a version just for opening a note), so only emit after a real interaction.
    if (!dirty.current) return;
    dirty.current = false;
    cb.current.onChange(md);
  }, []);

  // Flush a pending (debounced) edit when this editor unmounts (note switch / mode switch).
  useEffect(() => () => {
    if (!dirty.current) return;
    try {
      const ed = handle.current?.editor;
      if (ed && !ed.isDestroyed) {
        const md = htmlToMarkdown(ed.getHTML());
        if (md !== cb.current.value) cb.current.onChange(md);
      }
    } catch { /* editor already torn down: nothing to flush */ }
  }, []);

  const pick = useCallback((s: Suggestion) => {
    if (!suggest) return;
    dirty.current = true; // picking a suggestion is a real edit (the popup swallows the key event before it reaches the wrapper)
    handle.current?.insertWikiLink({ from: suggest.from, to: suggest.to }, s.title);
    setSuggest(null);
  }, [suggest]);

  // Keyboard handling for the popup (captured so ProseMirror does not also act on Enter / arrows).
  useEffect(() => {
    if (!suggest || options.length === 0) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowDown") { e.preventDefault(); e.stopPropagation(); setActive((a) => (a + 1) % options.length); }
      else if (e.key === "ArrowUp") { e.preventDefault(); e.stopPropagation(); setActive((a) => (a - 1 + options.length) % options.length); }
      else if (e.key === "Enter" || e.key === "Tab") { e.preventDefault(); e.stopPropagation(); pick(options[Math.min(active, options.length - 1)]); }
      else if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); setSuggest(null); }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [suggest, options, active, pick]);

  const markDirty = () => { dirty.current = true; };

  const popupStyle: React.CSSProperties | undefined = suggest
    ? { left: Math.max(8, Math.min(suggest.coords.left, window.innerWidth - 328)), top: Math.min(suggest.coords.bottom + 6, window.innerHeight - 290) }
    : undefined;

  return (
    <div
      className="aura-note-editor"
      data-readonly={readOnly ? "true" : "false"}
      onInput={markDirty}
      onKeyDownCapture={markDirty}
      onBeforeInputCapture={markDirty}
      onPasteCapture={markDirty}
      onDropCapture={markDirty}
      onCutCapture={markDirty}
      onClickCapture={(e) => { if ((e.target as HTMLElement).tagName === "INPUT") markDirty(); }}
    >
      <Suspense fallback={<div className="space-y-2" aria-busy="true"><Skeleton className="h-4 w-2/3" /><Skeleton className="h-4 w-full" /><Skeleton className="h-4 w-1/2" /></div>}>
        <AuraEditor
          ref={handle}
          value={value}
          readOnly={readOnly}
          onChange={emit}
          onWikiLinkClick={(target) => cb.current.onOpenLink(target)}
          onWikiSuggest={readOnly ? undefined : setSuggest}
        />
      </Suspense>
      {suggest && options.length > 0 && (
        <div className="aura-wiki-suggest" style={popupStyle} role="listbox" aria-label="Link to a note" onMouseDown={(e) => e.preventDefault()}>
          <div className="hint">Link to a note</div>
          {options.map((o, i) => (
            <button key={`${o.kind}-${o.id ?? o.title}`} type="button" role="option" aria-selected={i === active} onMouseEnter={() => setActive(i)} onClick={() => pick(o)}>
              <span className="truncate">{o.kind === "create" ? `Create "${o.title}"` : o.title}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
