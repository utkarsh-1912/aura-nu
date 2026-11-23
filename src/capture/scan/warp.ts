import { createImage, type ImageLike, type Point } from './image';
import type { Quad } from './detectPage';

/** 3x3 homography as 9 numbers, row-major, h[8] normalised to 1. */
export type Homography = number[];

/** Solve A x = b by Gaussian elimination with partial pivoting. Returns null if singular. */
export function solveLinear(A: number[][], b: number[]): number[] | null {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]]);
  for (let c = 0; c < n; c++) {
    let piv = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[piv][c])) piv = r;
    if (Math.abs(M[piv][c]) < 1e-12) return null;
    [M[c], M[piv]] = [M[piv], M[c]];
    for (let r = c + 1; r < n; r++) {
      const f = M[r][c] / M[c][c];
      for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k];
    }
  }
  const x = new Array<number>(n).fill(0);
  for (let r = n - 1; r >= 0; r--) {
    let s = M[r][n];
    for (let k = r + 1; k < n; k++) s -= M[r][k] * x[k];
    x[r] = s / M[r][r];
  }
  return x;
}

/** Homography mapping each src[i] -> dst[i] (4 point pairs). null if degenerate (e.g. collinear points). */
export function solveHomography(src: Point[], dst: Point[]): Homography | null {
  if (src.length !== 4 || dst.length !== 4) return null;
  const A: number[][] = [];
  const b: number[] = [];
  for (let i = 0; i < 4; i++) {
    const { x, y } = src[i];
    const { x: u, y: v } = dst[i];
    A.push([x, y, 1, 0, 0, 0, -u * x, -u * y]);
    b.push(u);
    A.push([0, 0, 0, x, y, 1, -v * x, -v * y]);
    b.push(v);
  }
  const h = solveLinear(A, b);
  return h ? [...h, 1] : null;
}

export function applyHomography(h: Homography, p: Point): Point {
  const w = h[6] * p.x + h[7] * p.y + h[8];
  return { x: (h[0] * p.x + h[1] * p.y + h[2]) / w, y: (h[3] * p.x + h[4] * p.y + h[5]) / w };
}

export function bilinearSample(img: ImageLike, x: number, y: number, out: number[]): void {
  const { width: w, height: h, data } = img;
  const cx = Math.min(w - 1, Math.max(0, x)), cy = Math.min(h - 1, Math.max(0, y));
  const x0 = Math.floor(cx), y0 = Math.floor(cy);
  const x1 = Math.min(w - 1, x0 + 1), y1 = Math.min(h - 1, y0 + 1);
  const fx = cx - x0, fy = cy - y0;
  for (let c = 0; c < 4; c++) {
    const a = data[(y0 * w + x0) * 4 + c], b = data[(y0 * w + x1) * 4 + c];
    const d = data[(y1 * w + x0) * 4 + c], e = data[(y1 * w + x1) * 4 + c];
    out[c] = (a * (1 - fx) + b * fx) * (1 - fy) + (d * (1 - fx) + e * fx) * fy;
  }
}

const dist = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);

/** Natural output size for a quad: mean of opposite edge lengths (aspect ratio preserved approx.). */
export function quadOutputSize(q: Quad, maxSide = 2400): { width: number; height: number } {
  let w = (dist(q.tl, q.tr) + dist(q.bl, q.br)) / 2;
  let h = (dist(q.tl, q.bl) + dist(q.tr, q.br)) / 2;
  const s = Math.min(1, maxSide / Math.max(w, h));
  w *= s; h *= s;
  return { width: Math.max(1, Math.round(w)), height: Math.max(1, Math.round(h)) };
}

/**
 * Perspective-correct: produce a width x height rectangle by sampling `img` through the inverse
 * homography (dst rect -> src quad) with bilinear interpolation. Returns null for degenerate quads.
 */
export function warpPerspective(img: ImageLike, quad: Quad, size?: { width: number; height: number }): ImageLike | null {
  const { width, height } = size ?? quadOutputSize(quad);
  const dst: Point[] = [{ x: 0, y: 0 }, { x: width - 1, y: 0 }, { x: width - 1, y: height - 1 }, { x: 0, y: height - 1 }];
  const H = solveHomography(dst, [quad.tl, quad.tr, quad.br, quad.bl]);
  if (!H) return null;
  const out = createImage(width, height);
  const px = [0, 0, 0, 0];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const s = applyHomography(H, { x, y });
      bilinearSample(img, s.x, s.y, px);
      const o = (y * width + x) * 4;
      out.data[o] = px[0]; out.data[o + 1] = px[1]; out.data[o + 2] = px[2]; out.data[o + 3] = px[3];
    }
  }
  return out;
}
