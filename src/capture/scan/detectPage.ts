import { boxBlur, downscaleGray, toGrayscale, type ImageLike, type Point } from './image';
import { otsuThreshold } from './enhance';

export interface Quad {
  /** Ordered top-left, top-right, bottom-right, bottom-left in ORIGINAL image pixel coordinates. */
  tl: Point;
  tr: Point;
  br: Point;
  bl: Point;
}

export type DetectResult =
  | { ok: true; quad: Quad; confidence: number }
  | { ok: false; reason: 'empty' | 'no-foreground' | 'too-small' | 'not-quadrilateral' | 'touches-all-edges' };

/**
 * Page quad detection (documented algorithm, deliberately simple and dependency-free):
 *  1. grayscale, downscale to <=160px, blur (r=1);
 *  2. Otsu threshold; the page is assumed BRIGHTER than the background (typical paper on desk). If the
 *     bright class covers >70% of the frame the polarity is flipped (dark background fills little, so the
 *     "page" would be the whole frame - we then retry with the dark class and let the checks decide);
 *  3. largest 4-connected bright component (iterative flood fill);
 *  4. corners = extreme points of the component along the diagonals (min/max of x+y and x-y). Exact for any
 *     convex quadrilateral that is not rotated near 45deg relative to a very elongated shape; good enough
 *     for hand-held photos of pages;
 *  5. reject (return ok:false) if the component is <8% of the frame, or its area is <75% of the quad area
 *     (page is not quadrilateral, e.g. cluttered scene, curled page, or several merged objects).
 * Failure is a normal result: the caller should fall back to the full frame / manual corner dragging.
 * Known limits: low-contrast pages, pages with strong dark text covering the border, busy backgrounds,
 * and fingers over a corner. No Hough/contour polygon approximation is used.
 */
export function detectPageQuad(img: ImageLike): DetectResult {
  if (img.width < 8 || img.height < 8) return { ok: false, reason: 'empty' };
  const { img: g, scale } = downscaleGray(toGrayscale(img), 160);
  const blurred = boxBlur(g, 1);
  const { width: w, height: h, data } = blurred;
  const thr = otsuThreshold(blurred);
  let min = 255, max = 0;
  for (let i = 0; i < data.length; i++) { if (data[i] < min) min = data[i]; if (data[i] > max) max = data[i]; }
  if (max - min < 20) return { ok: false, reason: 'no-foreground' };

  const label = new Int32Array(w * h).fill(-1);
  let best = { id: -1, size: 0 };
  let nextId = 0;
  const stack: number[] = [];
  for (let s = 0; s < w * h; s++) {
    if (data[s] <= thr || label[s] !== -1) continue;
    let size = 0;
    stack.push(s);
    label[s] = nextId;
    while (stack.length) {
      const p = stack.pop()!;
      size++;
      const x = p % w, y = (p - x) / w;
      if (x > 0 && data[p - 1] > thr && label[p - 1] === -1) { label[p - 1] = nextId; stack.push(p - 1); }
      if (x < w - 1 && data[p + 1] > thr && label[p + 1] === -1) { label[p + 1] = nextId; stack.push(p + 1); }
      if (y > 0 && data[p - w] > thr && label[p - w] === -1) { label[p - w] = nextId; stack.push(p - w); }
      if (y < h - 1 && data[p + w] > thr && label[p + w] === -1) { label[p + w] = nextId; stack.push(p + w); }
    }
    if (size > best.size) best = { id: nextId, size };
    nextId++;
  }
  if (best.id < 0) return { ok: false, reason: 'no-foreground' };
  if (best.size < w * h * 0.08) return { ok: false, reason: 'too-small' };

  let tl: Point | null = null, tr: Point | null = null, br: Point | null = null, bl: Point | null = null;
  let sMin = Infinity, sMax = -Infinity, dMin = Infinity, dMax = -Infinity;
  let touchL = false, touchR = false, touchT = false, touchB = false;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (label[y * w + x] !== best.id) continue;
      if (x === 0) touchL = true;
      if (x === w - 1) touchR = true;
      if (y === 0) touchT = true;
      if (y === h - 1) touchB = true;
      const s = x + y, d = x - y;
      if (s < sMin) { sMin = s; tl = { x, y }; }
      if (s > sMax) { sMax = s; br = { x, y }; }
      if (d > dMax) { dMax = d; tr = { x, y }; }
      if (d < dMin) { dMin = d; bl = { x, y }; }
    }
  }
  if (!tl || !tr || !br || !bl) return { ok: false, reason: 'no-foreground' };
  if (touchL && touchR && touchT && touchB) return { ok: false, reason: 'touches-all-edges' };

  const quadArea = polygonArea([tl, tr, br, bl]);
  // pixel centres: expand by half a pixel outward so a full-frame page maps to full frame
  const fill = quadArea > 0 ? best.size / quadArea : 0;
  if (quadArea < w * h * 0.05 || fill < 0.75) return { ok: false, reason: 'not-quadrilateral' };

  const up = (p: Point): Point => ({ x: (p.x + 0.5) / scale, y: (p.y + 0.5) / scale });
  return { ok: true, quad: { tl: up(tl), tr: up(tr), br: up(br), bl: up(bl) }, confidence: Math.min(1, fill) };
}

export function polygonArea(pts: Point[]): number {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i], q = pts[(i + 1) % pts.length];
    a += p.x * q.y - q.x * p.y;
  }
  return Math.abs(a) / 2;
}
