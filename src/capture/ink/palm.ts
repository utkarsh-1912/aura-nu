/**
 * Palm-rejection heuristics (pure). Policy:
 *  - Once a pen has been seen recently, touch pointers are ignored for `penGraceMs`.
 *  - Touches with a large contact area (width/height) are treated as palms.
 *  - A second simultaneous pointer while another one is drawing is ignored.
 * Heuristics only; real behaviour is UNTESTED-IN-BROWSER across devices.
 */
export interface PointerSample {
  pointerId: number;
  pointerType: 'pen' | 'touch' | 'mouse' | string;
  width?: number;
  height?: number;
  timeStamp: number;
}

export interface PalmState {
  lastPenTime: number;
  activePointerId: number | null;
}

export const initialPalmState = (): PalmState => ({ lastPenTime: -Infinity, activePointerId: null });

export function shouldAcceptPointer(
  s: PalmState,
  e: PointerSample,
  opts: { penGraceMs?: number; maxTouchContact?: number } = {},
): boolean {
  const grace = opts.penGraceMs ?? 600;
  const maxContact = opts.maxTouchContact ?? 30;
  if (s.activePointerId !== null && s.activePointerId !== e.pointerId) return false;
  if (e.pointerType === 'touch') {
    if (e.timeStamp - s.lastPenTime < grace) return false;
    if ((e.width ?? 0) > maxContact || (e.height ?? 0) > maxContact) return false;
  }
  return true;
}

export function notePointerDown(s: PalmState, e: PointerSample): PalmState {
  return {
    lastPenTime: e.pointerType === 'pen' ? e.timeStamp : s.lastPenTime,
    activePointerId: e.pointerId,
  };
}

export function notePointerUp(s: PalmState, e: { pointerId: number }): PalmState {
  return s.activePointerId === e.pointerId ? { ...s, activePointerId: null } : s;
}

/** Mouse and touch report 0 or a constant; only pens carry real pressure. */
export function normalizePressure(pointerType: string, pressure: number): number {
  if (pointerType === 'pen') return pressure > 0 ? Math.min(1, pressure) : 0.5;
  return 0.5;
}
