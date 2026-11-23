/**
 * React wiring for NoteIndexer. Builds once after hydration, then keeps the indexes current.
 * Work is sliced into ~8ms chunks scheduled with requestIdleCallback (setTimeout fallback), so the
 * UI never blocks. (A Web Worker cannot share the mutable index objects without moving all querying
 * across a message boundary; time-sliced main-thread work keeps the exact classes the tests cover.)
 *
 * `version` bumps whenever the indexes changed, so consumers can re-run searches against it.
 * Indexes are purely in-memory, so guests/demo behave identically to signed-in users.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import type { Note } from "../../types";
import { NoteIndexer } from "./noteIndexer";

export interface NoteIndexes {
  link: NoteIndexer["link"];
  search: NoteIndexer["search"];
  indexer: NoteIndexer;
  version: number;
  status: "idle" | "building" | "ready";
  done: number;
  total: number;
}

const scheduleIdle = (cb: () => void): (() => void) => {
  const w = globalThis as unknown as { requestIdleCallback?: (f: () => void, o?: { timeout: number }) => number; cancelIdleCallback?: (h: number) => void };
  if (w.requestIdleCallback) {
    const h = w.requestIdleCallback(cb, { timeout: 200 });
    return () => w.cancelIdleCallback?.(h);
  }
  const h = setTimeout(cb, 0);
  return () => clearTimeout(h);
};

export function useNoteIndexes(notes: Note[], workspaceId: string, enabled: boolean): NoteIndexes {
  const indexer = useMemo(() => new NoteIndexer(), []);
  const [version, setVersion] = useState(0);
  const [progress, setProgress] = useState<{ status: NoteIndexes["status"]; done: number; total: number }>({ status: "idle", done: 0, total: 0 });
  const cancel = useRef<(() => void) | null>(null);
  const first = useRef(true);
  const wsNotes = useMemo(() => (enabled ? notes.filter((n) => n.workspaceId === workspaceId) : []), [notes, workspaceId, enabled]);

  useEffect(() => {
    if (!enabled) return;
    // Edits are debounced so typing does not re-index per keystroke; the first build starts at once.
    const delay = first.current ? 0 : 250;
    const timer = setTimeout(() => {
      const queued = indexer.sync(wsNotes);
      if (queued === 0) {
        first.current = false;
        setProgress((p) => (p.status === "ready" ? p : { status: "ready", done: 0, total: 0 }));
        return;
      }
      const big = queued > 200;
      if (big) setProgress({ status: "building", done: 0, total: indexer.total });
      cancel.current?.();
      const tick = () => {
        const left = indexer.step(8);
        setVersion((v) => v + 1);
        if (left > 0) {
          if (big) setProgress({ status: "building", done: indexer.total - left, total: indexer.total });
          cancel.current = scheduleIdle(tick);
        } else {
          first.current = false;
          setProgress({ status: "ready", done: 0, total: 0 });
        }
      };
      cancel.current = scheduleIdle(tick);
    }, delay);
    return () => clearTimeout(timer);
  }, [wsNotes, enabled, indexer]);

  useEffect(() => () => { cancel.current?.(); }, []);

  return { link: indexer.link, search: indexer.search, indexer, version, status: progress.status, done: progress.done, total: progress.total };
}
