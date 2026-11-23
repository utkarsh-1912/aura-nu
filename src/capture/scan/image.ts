/** ImageData-compatible plain object (RGBA, row-major). No DOM needed. */
export interface ImageLike {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}

export interface GrayImage {
  width: number;
  height: number;
  data: Uint8Array;
}

export interface Point {
  x: number;
  y: number;
}

export function createImage(width: number, height: number, fill: [number, number, number] = [0, 0, 0]): ImageLike {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    data[i * 4] = fill[0];
    data[i * 4 + 1] = fill[1];
    data[i * 4 + 2] = fill[2];
    data[i * 4 + 3] = 255;
  }
  return { width, height, data };
}

/** Rec.601 luma. */
export function toGrayscale(img: ImageLike): GrayImage {
  const n = img.width * img.height;
  const out = new Uint8Array(n);
  const d = img.data;
  for (let i = 0; i < n; i++) out[i] = (d[i * 4] * 299 + d[i * 4 + 1] * 587 + d[i * 4 + 2] * 114 + 500) / 1000;
  return { width: img.width, height: img.height, data: out };
}

export function grayToImage(g: GrayImage): ImageLike {
  const data = new Uint8ClampedArray(g.width * g.height * 4);
  for (let i = 0; i < g.data.length; i++) {
    data[i * 4] = data[i * 4 + 1] = data[i * 4 + 2] = g.data[i];
    data[i * 4 + 3] = 255;
  }
  return { width: g.width, height: g.height, data };
}

/** Box-average downscale so the longest side is <= maxSide (returns the same image + scale 1 when already small). */
export function downscaleGray(g: GrayImage, maxSide: number): { img: GrayImage; scale: number } {
  const longest = Math.max(g.width, g.height);
  if (longest <= maxSide) return { img: g, scale: 1 };
  const scale = maxSide / longest;
  const w = Math.max(1, Math.round(g.width * scale));
  const h = Math.max(1, Math.round(g.height * scale));
  const out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    const y0 = Math.floor((y * g.height) / h), y1 = Math.max(y0 + 1, Math.floor(((y + 1) * g.height) / h));
    for (let x = 0; x < w; x++) {
      const x0 = Math.floor((x * g.width) / w), x1 = Math.max(x0 + 1, Math.floor(((x + 1) * g.width) / w));
      let sum = 0, cnt = 0;
      for (let yy = y0; yy < y1; yy++) for (let xx = x0; xx < x1; xx++) { sum += g.data[yy * g.width + xx]; cnt++; }
      out[y * w + x] = sum / cnt;
    }
  }
  return { img: { width: w, height: h, data: out }, scale: w / g.width };
}

/** Separable box blur (radius r), edge-clamped. */
export function boxBlur(g: GrayImage, r: number): GrayImage {
  if (r < 1) return g;
  const { width: w, height: h } = g;
  const tmp = new Float32Array(w * h);
  const out = new Uint8Array(w * h);
  const k = 2 * r + 1;
  for (let y = 0; y < h; y++) {
    let sum = 0;
    for (let x = -r; x <= r; x++) sum += g.data[y * w + Math.min(w - 1, Math.max(0, x))];
    for (let x = 0; x < w; x++) {
      tmp[y * w + x] = sum / k;
      sum += g.data[y * w + Math.min(w - 1, x + r + 1)] - g.data[y * w + Math.max(0, x - r)];
    }
  }
  for (let x = 0; x < w; x++) {
    let sum = 0;
    for (let y = -r; y <= r; y++) sum += tmp[Math.min(h - 1, Math.max(0, y)) * w + x];
    for (let y = 0; y < h; y++) {
      out[y * w + x] = sum / k;
      sum += tmp[Math.min(h - 1, y + r + 1) * w + x] - tmp[Math.max(0, y - r) * w + x];
    }
  }
  return { width: w, height: h, data: out };
}
