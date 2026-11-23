import type { InkStroke } from './types';

/** Snapshot-based undo/redo. Strokes are immutable so snapshots share structure cheaply. */
export interface InkHistory {
  past: readonly (readonly InkStroke[])[];
  present: readonly InkStroke[];
  future: readonly (readonly InkStroke[])[];
}

export const HISTORY_LIMIT = 200;

export function createHistory(initial: readonly InkStroke[] = []): InkHistory {
  return { past: [], present: initial, future: [] };
}

/** Commit a new state. No-op (same object) when `next === present`. Clears redo. */
export function commit(h: InkHistory, next: readonly InkStroke[]): InkHistory {
  if (next === h.present) return h;
  const past = [...h.past, h.present];
  if (past.length > HISTORY_LIMIT) past.splice(0, past.length - HISTORY_LIMIT);
  return { past, present: next, future: [] };
}

export const canUndo = (h: InkHistory) => h.past.length > 0;
export const canRedo = (h: InkHistory) => h.future.length > 0;

export function undo(h: InkHistory): InkHistory {
  if (!h.past.length) return h;
  const past = h.past.slice(0, -1);
  return { past, present: h.past[h.past.length - 1], future: [h.present, ...h.future] };
}

export function redo(h: InkHistory): InkHistory {
  if (!h.future.length) return h;
  const [next, ...future] = h.future;
  return { past: [...h.past, h.present], present: next, future };
}
