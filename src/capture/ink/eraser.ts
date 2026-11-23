import type { InkPoint, InkStroke } from './types';
import { distToSegment, hitTestStroke } from './geometry';

/** Stroke eraser: removes every stroke touched by a circle at (x,y). Returns same array if nothing hit. */
export function eraseStrokes(strokes: readonly InkStroke[], x: number, y: number, radius: number): readonly InkStroke[] {
  const kept = strokes.filter((s) => !hitTestStroke(s, x, y, radius));
  return kept.length === strokes.length ? strokes : kept;
}

/**
 * Partial (pixel) eraser: erases points inside the circle and splits strokes into surviving pieces.
 * The circle is also tested against segments so fast passes between sparse points still cut.
 * Pieces with fewer than 2 points are dropped. Piece ids are `<id>~<n>` (deterministic).
 */
export function erasePartial(strokes: readonly InkStroke[], x: number, y: number, radius: number): readonly InkStroke[] {
  let changed = false;
  const out: InkStroke[] = [];
  for (const s of strokes) {
    if (!hitTestStroke(s, x, y, radius)) {
      out.push(s);
      continue;
    }
    changed = true;
    const r = radius + s.size / 2;
    const pieces: InkPoint[][] = [];
    let cur: InkPoint[] = [];
    const pts = s.points;
    const cut = (i: number) => Math.hypot(pts[i].x - x, pts[i].y - y) <= r;
    for (let i = 0; i < pts.length; i++) {
      if (cut(i)) {
        if (cur.length) pieces.push(cur);
        cur = [];
        continue;
      }
      cur.push(pts[i]);
      // segment to next point passes through the eraser circle -> split here
      if (i < pts.length - 1 && !cut(i + 1) && distToSegment(x, y, pts[i].x, pts[i].y, pts[i + 1].x, pts[i + 1].y) <= r) {
        pieces.push(cur);
        cur = [];
      }
    }
    if (cur.length) pieces.push(cur);
    let n = 0;
    for (const piece of pieces) {
      if (piece.length >= 2) out.push({ ...s, id: `${s.id}~${n++}`, points: piece });
    }
  }
  return changed ? out : strokes;
}
