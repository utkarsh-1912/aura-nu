/**
 * Rendered for `index.html?window=quicknote` inside the Tauri quick-note window. UNVERIFIED (needs the desktop shell).
 * Ctrl/Cmd+Enter saves via the Rust command `quicknote_save`; Esc hides the window. In a plain browser it shows a notice.
 */
import React, { useEffect, useRef, useState } from "react";
import { isDesktop, quickNote } from "../../desktop/bridge";
import { Button } from "../../ui";

type Invoke = (cmd: string, args?: Record<string, unknown>) => Promise<unknown>;
const getInvoke = (): Invoke | null =>
  (globalThis as { __TAURI__?: { core?: { invoke?: Invoke } } }).__TAURI__?.core?.invoke ?? null;

export const isQuickNoteWindow = (search: string = typeof window !== "undefined" ? window.location.search : ""): boolean =>
  new URLSearchParams(search).get("window") === "quicknote";

export default function QuickNoteWindow() {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => { ref.current?.focus(); }, []);

  if (!isDesktop()) {
    return <div className="flex h-dvh items-center justify-center bg-surface p-6 text-[13px] text-fg-muted">The quick note window is only available in the Aura desktop app.</div>;
  }

  const save = async () => {
    const t = text.trim();
    if (!t) return;
    const invoke = getInvoke();
    if (!invoke) { setError("Desktop runtime unavailable."); return; }
    setBusy(true); setError("");
    try { await invoke("quicknote_save", { text: t }); setText(""); await quickNote.hide(); }
    catch (e) { setError(String(e)); }
    finally { setBusy(false); }
  };

  return (
    <div className="flex h-dvh flex-col gap-2 bg-surface p-3 text-fg" onKeyDown={(e) => {
      if (e.key === "Escape") { e.preventDefault(); void quickNote.hide(); }
      if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); void save(); }
    }}>
      <textarea
        ref={ref}
        aria-label="Quick note"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Capture a thought…"
        className="min-h-0 flex-1 resize-none rounded-md border border-line bg-panel p-3 text-[14px] text-fg outline-none placeholder:text-fg-subtle focus:border-accent"
      />
      {error && <p role="alert" className="text-[12px] text-danger">{error}</p>}
      <div className="flex items-center justify-between">
        <span className="text-[12px] text-fg-subtle">Ctrl+Enter to save, Esc to close</span>
        <Button variant="primary" size="sm" loading={busy} disabled={!text.trim()} onClick={() => void save()}>Save note</Button>
      </div>
    </div>
  );
}
