/**
 * Desktop (Tauri) wiring. Everything here is a no-op in the browser: `isDesktop()` is false there and
 * no timers, listeners or fs access are created. UNVERIFIED: cannot be exercised without the Tauri shell.
 *
 *  - quickNote.onSaved  -> create a note in the main window.
 *  - vault reconcile    -> debounced reconcile(app notes <-> vault files) through the normal note update path.
 */
import { useEffect, useRef } from "react";
import type { Folder, Note } from "../../types";
import { createTauriVaultFs, isDesktop, quickNote, vault } from "../../desktop/bridge";
import { loadIndex, saveIndex } from "../../desktop/vault/index";
import { reconcile } from "../../desktop/vault/reconcile";
import { sha256Hasher } from "../../desktop/vault/hash";
import { fromVaultUpserts, mergeReconcile, quickNoteFromPayload, toVaultNotes } from "./folderMap";

interface Opts {
  ready: boolean;
  workspaceId: string;
  notes: Note[];
  folders: Folder[];
  applyNotes: (next: Note[]) => void;
  applyFolders: (next: Folder[]) => void;
  onQuickNote: (n: { title: string; content: string; createdAt: string }) => void;
  onError: (msg: string) => void;
}

export function useDesktopBridge(opts: Opts) {
  const o = useRef(opts);
  o.current = opts;
  const desktop = typeof window !== "undefined" && isDesktop();

  // Quick-note window -> main window.
  useEffect(() => {
    if (!desktop || !opts.ready) return;
    let un: (() => void) | null = null;
    let cancelled = false;
    void quickNote.onSaved((p) => {
      const n = quickNoteFromPayload(p);
      if (n) o.current.onQuickNote(n);
    }).then((r) => { if (r.ok) { if (cancelled) r.value(); else un = r.value; } });
    return () => { cancelled = true; un?.(); };
  }, [desktop, opts.ready]);

  // Vault reconcile.
  const running = useRef(false);
  const dirty = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasVault = useRef(false);

  const run = useRef(async () => {
    if (running.current) { dirty.current = true; return; }
    running.current = true;
    try {
      const { workspaceId, notes, folders, applyNotes, applyFolders } = o.current;
      const cur = await vault.current();
      hasVault.current = cur.ok && !!cur.value;
      if (!hasVault.current) return;
      const fs = createTauriVaultFs();
      const wsNotes = notes.filter((n) => n.workspaceId === workspaceId);
      const wsFolders = folders.filter((f) => f.workspaceId === workspaceId);
      const res = await reconcile({
        fs, hasher: sha256Hasher, notes: toVaultNotes(wsNotes, wsFolders), index: await loadIndex(fs),
        workspaceId, newId: () => `note-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`, now: () => new Date().toISOString(),
      });
      await saveIndex(fs, res.index);
      if (res.upserts.length || res.removals.length) {
        const mapped = fromVaultUpserts(res.upserts, wsNotes, wsFolders, workspaceId, () => `f-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`);
        if (mapped.newFolders.length) applyFolders([...folders, ...mapped.newFolders]);
        applyNotes(mergeReconcile(notes, mapped.notes, res.removals));
      }
    } catch (e) {
      o.current.onError(`Vault sync failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      running.current = false;
      if (dirty.current) { dirty.current = false; schedule(1500); }
    }
  });

  const schedule = (ms: number) => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void run.current(), ms);
  };

  useEffect(() => {
    if (!desktop || !opts.ready) return;
    schedule(3000); // app edits (and the initial pass)
    return () => { if (timer.current) clearTimeout(timer.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [desktop, opts.ready, opts.notes, opts.workspaceId]);

  useEffect(() => {
    if (!desktop || !opts.ready) return;
    let un: (() => void) | null = null;
    let cancelled = false;
    void vault.onEvent(() => schedule(1500)).then((r) => { if (r.ok) { if (cancelled) r.value(); else un = r.value; } });
    return () => { cancelled = true; un?.(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [desktop, opts.ready]);
}
