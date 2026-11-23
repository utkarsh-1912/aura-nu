import type { InkPoint, InkStroke, Rect } from './types';

/** One-Euro filter (Casiez et al. 2012): low jitter at rest, low lag when moving fast. */
export class OneEuroFilter {
  private xPrev: number | null = null;
  private dxPrev = 0;
  private tPrev = 0;
  constructor(
    private minCutoff = 1.2,
    private beta = 0.02,
    private dCutoff = 1,
  ) {}
  private static alpha(cutoff: number, dt: number): number {
    const tau = 1 / (2 * Math.PI * cutoff);
    return 1 / (1 + tau / dt);
  }
  filter(x: number, tMs: number): number {
    if (this.xPrev === null) {
      this.xPrev = x;
      this.tPrev = tMs;
      return x;
    }
    const dt = Math.max((tMs - this.tPrev) / 1000, 1e-3);
    const dx = (x - this.xPrev) / dt;
    const aD = OneEuroFilter.alpha(this.dCutoff, dt);
    const dxHat = aD * dx + (1 - aD) * this.dxPrev;
    const cutoff = this.minCutoff + this.beta * Math.abs(dxHat);
    const a = OneEuroFilter.alpha(cutoff, dt);
    const xHat = a * x + (1 - a) * this.xPrev;
    this.xPrev = xHat;
    this.dxPrev = dxHat;
    this.tPrev = tMs;
    return xHat;
  }
}

/** Smooth a point list (x/y only; pressure and t preserved). First and last points are kept exact. */
export function smoothPoints(points: readonly InkPoint[], minCutoff = 1.2, beta = 0.02): InkPoint[] {
  if (points.length < 3) return points.map((p) => ({ ...p }));
  const fx = new OneEuroFilter(minCutoff, beta);
  const fy = new OneEuroFilter(minCutoff, beta);
  const out = points.map((p) => ({ ...p, x: fx.filter(p.x, p.t), y: fy.filter(p.y, p.t) }));
  out[0] = { ...points[0] };
  out[out.length - 1] = { ...points[points.length - 1] };
  return out;
}

/** Pressure (0..1) -> rendered width. gamma<1 makes light pressure thicker. */
export function pressureToWidth(size: number, pressure: number, minRatio = 0.35, gamma = 0.8): number {
  const p = Math.min(1, Math.max(0, Number.isFinite(pressure) ? pressure : 0.5));
  return size * (minRatio + (1 - minRatio) * Math.pow(p, gamma));
}

/** Catmull-Rom spline resampling; `segments` points inserted per span. */
export function catmullRom(points: readonly InkPoint[], segments = 4): InkPoint[] {
  if (points.length < 3) return points.map((p) => ({ ...p }));
  const out: InkPoint[] = [];
  const n = points.length;
  for (let i = 0; i < n - 1; i++) {
    const p0 = points[Math.max(0, i - 1)];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[Math.min(n - 1, i + 2)];
    for (let s = 0; s < segments; s++) {
      const u = s / segments;
      const u2 = u * u;
      const u3 = u2 * u;
      const f = (a: number, b: number, c: number, d: number) =>
        0.5 * (2 * b + (-a + c) * u + (2 * a - 5 * b + 4 * c - d) * u2 + (-a + 3 * b - 3 * c + d) * u3);
      out.push({
        x: f(p0.x, p1.x, p2.x, p3.x),
        y: f(p0.y, p1.y, p2.y, p3.y),
        p: p1.p + (p2.p - p1.p) * u,
        t: p1.t + (p2.t - p1.t) * u,
      });
    }
  }
  out.push({ ...points[n - 1] });
  return out;
}

export function strokeBounds(stroke: InkStroke): Rect {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of stroke.points) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  if (!Number.isFinite(minX)) return { x: 0, y: 0, w: 0, h: 0 };
  const pad = stroke.size / 2;
  return { x: minX - pad, y: minY - pad, w: maxX - minX + stroke.size, h: maxY - minY + stroke.size };
}

export function boundsOf(strokes: readonly InkStroke[]): Rect | null {
  if (!strokes.length) return null;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const s of strokes) {
    const b = strokeBounds(s);
    x0 = Math.min(x0, b.x);
    y0 = Math.min(y0, b.y);
    x1 = Math.max(x1, b.x + b.w);
    y1 = Math.max(y1, b.y + b.h);
  }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

export function rectsIntersect(a: Rect, b: Rect): boolean {
  return a.x <= b.x + b.w && b.x <= a.x + a.w && a.y <= b.y + b.h && b.y <= a.y + a.h;
}

export function distToSegment(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax, dy = by - ay;
  const len2 = dx * dx + dy * dy;
  let t = len2 === 0 ? 0 : ((px - ax) * dx + (py - ay) * dy) / len2;
  t = Math.min(1, Math.max(0, t));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

/** True if (x,y) lies within `radius` of the stroke's centreline (plus half its width). */
export function hitTestStroke(stroke: InkStroke, x: number, y: number, radius = 0): boolean {
  const r = radius + stroke.size / 2;
  const pts = stroke.points;
  if (pts.length === 0) return false;
  if (pts.length === 1) return Math.hypot(x - pts[0].x, y - pts[0].y) <= r;
  const b = strokeBounds(stroke);
  if (x < b.x - radius || x > b.x + b.w + radius || y < b.y - radius || y > b.y + b.h + radius) return false;
  for (let i = 0; i < pts.length - 1; i++) {
    if (distToSegment(x, y, pts[i].x, pts[i].y, pts[i + 1].x, pts[i + 1].y) <= r) return true;
  }
  return false;
}

/** Topmost stroke hit (last in array = drawn last = on top). */
export function hitTest(strokes: readonly InkStroke[], x: number, y: number, radius = 0): InkStroke | null {
  for (let i = strokes.length - 1; i >= 0; i--) if (hitTestStroke(strokes[i], x, y, radius)) return strokes[i];
  return null;
}
