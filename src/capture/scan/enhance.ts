import type { GrayImage } from './image';

/** Otsu global threshold (0..255). */
export function otsuThreshold(g: GrayImage): number {
  const hist = new Array<number>(256).fill(0);
  for (let i = 0; i < g.data.length; i++) hist[g.data[i]]++;
  const total = g.data.length;
  let sumAll = 0;
  for (let i = 0; i < 256; i++) sumAll += i * hist[i];
  let wB = 0, sumB = 0, best = 0, bestVar = -1;
  for (let t = 0; t < 256; t++) {
    wB += hist[t];
    if (wB === 0) continue;
    const wF = total - wB;
    if (wF === 0) break;
    sumB += t * hist[t];
    const mB = sumB / wB, mF = (sumAll - sumB) / wF;
    const v = wB * wF * (mB - mF) * (mB - mF);
    if (v > bestVar) { bestVar = v; best = t; }
  }
  return best;
}

/**
 * Bradley-Roth adaptive threshold via an integral image: a pixel is "ink" (0) when it is more than
 * `t` fraction darker than the mean of its (window x window) neighbourhood. Output is 0 or 255
 * (255 = paper). Handles uneven lighting / shadows that defeat a global threshold.
 */
export function adaptiveThreshold(g: GrayImage, window = 15, t = 0.12): GrayImage {
  const { width: w, height: h } = g;
  const integral = new Float64Array((w + 1) * (h + 1));
  for (let y = 0; y < h; y++) {
    let row = 0;
    for (let x = 0; x < w; x++) {
      row += g.data[y * w + x];
      integral[(y + 1) * (w + 1) + x + 1] = integral[y * (w + 1) + x + 1] + row;
    }
  }
  const half = Math.max(1, window >> 1);
  const out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    const y0 = Math.max(0, y - half), y1 = Math.min(h - 1, y + half);
    for (let x = 0; x < w; x++) {
      const x0 = Math.max(0, x - half), x1 = Math.min(w - 1, x + half);
      const area = (x1 - x0 + 1) * (y1 - y0 + 1);
      const sum =
        integral[(y1 + 1) * (w + 1) + x1 + 1] - integral[y0 * (w + 1) + x1 + 1] - integral[(y1 + 1) * (w + 1) + x0] + integral[y0 * (w + 1) + x0];
      out[y * w + x] = g.data[y * w + x] * area <= sum * (1 - t) ? 0 : 255;
    }
  }
  return { width: w, height: h, data: out };
}

/** Linear contrast stretch between the lo/hi percentiles (default 1%/99%). */
export function stretchContrast(g: GrayImage, lowPct = 0.01, highPct = 0.99): GrayImage {
  const hist = new Array<number>(256).fill(0);
  for (let i = 0; i < g.data.length; i++) hist[g.data[i]]++;
  const total = g.data.length;
  let acc = 0, lo = 0, hi = 255;
  for (let i = 0; i < 256; i++) { acc += hist[i]; if (acc >= total * lowPct) { lo = i; break; } }
  acc = 0;
  for (let i = 0; i < 256; i++) { acc += hist[i]; if (acc >= total * highPct) { hi = i; break; } }
  if (hi <= lo) return g;
  const out = new Uint8Array(g.data.length);
  const scale = 255 / (hi - lo);
  for (let i = 0; i < out.length; i++) out[i] = Math.min(255, Math.max(0, (g.data[i] - lo) * scale));
  return { width: g.width, height: g.height, data: out };
}
