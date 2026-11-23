import { createImage, downscaleGray, toGrayscale, type GrayImage, type ImageLike } from './image';
import { adaptiveThreshold } from './enhance';
import { bilinearSample } from './warp';

/**
 * Estimate text-line skew in degrees (positive = lines descend to the right, image y-down) with a
 * projection-profile search: binarise, then for each candidate angle histogram dark pixels by
 * y' = y - x*tan(a) and score the sum of squared bin counts (peaks when lines are horizontal).
 * Coarse pass over [-maxAngle,maxAngle] then a fine pass. Returns 0 when there is too little ink.
 */
export function estimateSkew(img: ImageLike, maxAngle = 15): number {
  const { img: g } = downscaleGray(toGrayscale(img), 600);
  const bin = adaptiveThreshold(g, 15, 0.15);
  const pts: number[] = [];
  for (let y = 0; y < bin.height; y++) for (let x = 0; x < bin.width; x++) if (bin.data[y * bin.width + x] === 0) pts.push(x, y);
  if (pts.length < 50) return 0;
  const score = (angle: number) => profileScore(bin, pts, angle);
  let best = 0, bestScore = -1;
  for (let a = -maxAngle; a <= maxAngle + 1e-9; a += 0.5) {
    const s = score(a);
    if (s > bestScore) { bestScore = s; best = a; }
  }
  const centre = best;
  for (let a = centre - 0.5; a <= centre + 0.5 + 1e-9; a += 0.1) {
    const s = score(a);
    if (s > bestScore) { bestScore = s; best = a; }
  }
  return Math.round(best * 10) / 10;
}

function profileScore(g: GrayImage, pts: number[], angleDeg: number): number {
  const t = Math.tan((angleDeg * Math.PI) / 180);
  const off = Math.ceil(g.width * Math.abs(t)) + 1;
  const bins = new Float64Array(g.height + 2 * off + 2);
  for (let i = 0; i < pts.length; i += 2) bins[Math.round(pts[i + 1] - pts[i] * t) + off]++;
  let s = 0;
  for (let i = 0; i < bins.length; i++) s += bins[i] * bins[i];
  return s;
}

/** Rotate about the centre by `deg` (positive = clockwise on screen), bilinear, white fill. Same canvas size. */
export function rotateImage(img: ImageLike, deg: number, fill = 255): ImageLike {
  const out = createImage(img.width, img.height, [fill, fill, fill]);
  const r = (deg * Math.PI) / 180;
  const cos = Math.cos(r), sin = Math.sin(r);
  const cx = (img.width - 1) / 2, cy = (img.height - 1) / 2;
  const px = [0, 0, 0, 0];
  for (let y = 0; y < img.height; y++) {
    for (let x = 0; x < img.width; x++) {
      // inverse rotation: where did this output pixel come from?
      const dx = x - cx, dy = y - cy;
      const sx = cos * dx + sin * dy + cx;
      const sy = -sin * dx + cos * dy + cy;
      if (sx < 0 || sy < 0 || sx > img.width - 1 || sy > img.height - 1) continue;
      bilinearSample(img, sx, sy, px);
      const o = (y * img.width + x) * 4;
      out.data[o] = px[0]; out.data[o + 1] = px[1]; out.data[o + 2] = px[2]; out.data[o + 3] = 255;
    }
  }
  return out;
}

/** Estimate then undo skew. Skips rotation when |skew| < 0.3deg. */
export function deskew(img: ImageLike, maxAngle = 15): { image: ImageLike; angle: number } {
  const angle = estimateSkew(img, maxAngle);
  if (Math.abs(angle) < 0.3) return { image: img, angle: 0 };
  return { image: rotateImage(img, -angle), angle };
}
