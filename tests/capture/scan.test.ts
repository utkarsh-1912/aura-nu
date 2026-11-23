import { describe, expect, it } from 'vitest';
import {
  adaptiveThreshold, applyHomography, createImage, deskew, detectPageQuad, estimateSkew, grayToImage, NoopOcr, otsuThreshold,
  rotateImage, runScan, selectOcr, solveHomography, stretchContrast, toGrayscale, warpPerspective, type ImageLike, type OcrAdapter, type Point,
} from '../../src/capture/scan';

function fillPolygon(img: ImageLike, poly: Point[], v: number) {
  const xs = poly.map((p) => p.x), ys = poly.map((p) => p.y);
  for (let y = Math.max(0, Math.floor(Math.min(...ys))); y <= Math.min(img.height - 1, Math.ceil(Math.max(...ys))); y++) {
    for (let x = Math.max(0, Math.floor(Math.min(...xs))); x <= Math.min(img.width - 1, Math.ceil(Math.max(...xs))); x++) {
      let inside = true, sign = 0;
      for (let i = 0; i < poly.length; i++) {
        const a = poly[i], b = poly[(i + 1) % poly.length];
        const c = (b.x - a.x) * (y - a.y) - (b.y - a.y) * (x - a.x);
        if (c !== 0) { if (sign === 0) sign = Math.sign(c); else if (Math.sign(c) !== sign) { inside = false; break; } }
      }
      if (inside) { const o = (y * img.width + x) * 4; img.data[o] = img.data[o + 1] = img.data[o + 2] = v; }
    }
  }
}

const near = (a: Point, b: Point, tol: number) => Math.hypot(a.x - b.x, a.y - b.y) <= tol;

describe('page detection', () => {
  it('finds a skewed bright page on a dark background within tolerance', () => {
    const W = 400, H = 300;
    const img = createImage(W, H, [30, 30, 30]);
    const quad = [{ x: 70, y: 40 }, { x: 330, y: 60 }, { x: 310, y: 260 }, { x: 90, y: 240 }];
    fillPolygon(img, quad, 230);
    const r = detectPageQuad(img);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const tol = 8; // ~2% of width; detection runs on a 160px thumbnail
    expect(near(r.quad.tl, quad[0], tol)).toBe(true);
    expect(near(r.quad.tr, quad[1], tol)).toBe(true);
    expect(near(r.quad.br, quad[2], tol)).toBe(true);
    expect(near(r.quad.bl, quad[3], tol)).toBe(true);
    expect(r.confidence).toBeGreaterThan(0.8);
  });
  it('finds a 20-degree rotated rectangle', () => {
    const img = createImage(300, 300, [20, 20, 20]);
    const c = 150, a = (20 * Math.PI) / 180, hw = 90, hh = 120;
    const pts = [[-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh]].map(([x, y]) => ({ x: c + x * Math.cos(a) - y * Math.sin(a), y: c + x * Math.sin(a) + y * Math.cos(a) }));
    fillPolygon(img, pts, 240);
    const r = detectPageQuad(img);
    expect(r.ok).toBe(true);
    if (r.ok) for (const p of [r.quad.tl, r.quad.tr, r.quad.br, r.quad.bl]) expect(pts.some((q) => near(p, q, 10))).toBe(true);
  });
  it('fails gracefully on flat, empty and cluttered images', () => {
    expect(detectPageQuad(createImage(200, 200, [100, 100, 100]))).toEqual({ ok: false, reason: 'no-foreground' });
    expect(detectPageQuad(createImage(2, 2)).ok).toBe(false);
    const tiny = createImage(300, 300, [10, 10, 10]);
    fillPolygon(tiny, [{ x: 10, y: 10 }, { x: 30, y: 10 }, { x: 30, y: 30 }, { x: 10, y: 30 }], 250);
    const r = detectPageQuad(tiny);
    expect(r.ok).toBe(false);
    // L-shaped (non-quadrilateral) bright region
    const l = createImage(300, 300, [10, 10, 10]);
    fillPolygon(l, [{ x: 20, y: 20 }, { x: 280, y: 20 }, { x: 280, y: 80 }, { x: 20, y: 80 }], 250);
    fillPolygon(l, [{ x: 20, y: 20 }, { x: 80, y: 20 }, { x: 80, y: 280 }, { x: 20, y: 280 }], 250);
    const rl = detectPageQuad(l);
    expect(rl.ok).toBe(false);
    if (!rl.ok) expect((rl as { reason: string }).reason).toBe('not-quadrilateral');
  });
});

describe('homography and warp', () => {
  it('solves and applies a known homography', () => {
    const src = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }];
    const dst = [{ x: 10, y: 5 }, { x: 120, y: 15 }, { x: 110, y: 130 }, { x: 0, y: 100 }];
    const H = solveHomography(src, dst)!;
    src.forEach((p, i) => expect(near(applyHomography(H, p), dst[i], 1e-6)).toBe(true));
    expect(solveHomography([{ x: 0, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 2 }, { x: 3, y: 3 }], dst)).toBeNull();
  });
  it('rectifies a skewed page: output is uniformly the page colour with a marker at the right corner', () => {
    const img = createImage(300, 240, [0, 0, 0]);
    const quad = [{ x: 50, y: 30 }, { x: 250, y: 50 }, { x: 230, y: 210 }, { x: 70, y: 190 }];
    fillPolygon(img, quad, 200);
    // red-ish marker near the TL corner of the page
    for (let y = 36; y < 46; y++) for (let x = 56; x < 66; x++) { const o = (y * 300 + x) * 4; img.data[o] = 255; img.data[o + 1] = 0; img.data[o + 2] = 0; }
    const out = warpPerspective(img, { tl: quad[0], tr: quad[1], br: quad[2], bl: quad[3] }, { width: 200, height: 160 })!;
    expect(out.width).toBe(200);
    const px = (x: number, y: number) => out.data[(y * 200 + x) * 4];
    expect(px(100, 80)).toBeGreaterThan(190);
    expect(px(100, 80)).toBeLessThan(210);
    expect(px(190, 150)).toBeGreaterThan(190); // near BR corner still page
    // marker (red channel 255, green 0) appears near top-left of output
    const g = (x: number, y: number) => out.data[(y * 200 + x) * 4 + 1];
    expect(g(8, 8)).toBeLessThan(100);
    expect(g(150, 100)).toBeGreaterThan(150);
  });
});

function textLines(w: number, h: number, slopeDeg: number): ImageLike {
  const img = createImage(w, h, [255, 255, 255]);
  const t = Math.tan((slopeDeg * Math.PI) / 180);
  for (let line = 0; line < 8; line++) {
    const y0 = 60 + line * 40;
    for (let x = 40; x < w - 40; x++) {
      if ((x / 6) % 5 > 4) continue; // word gaps
      for (let th = 0; th < 3; th++) {
        const y = Math.round(y0 + (x - w / 2) * t + th);
        if (y >= 0 && y < h) { const o = (y * w + x) * 4; img.data[o] = img.data[o + 1] = img.data[o + 2] = 20; }
      }
    }
  }
  return img;
}

describe('deskew', () => {
  it('estimates a known skew within 1 degree', () => {
    for (const a of [-6, 0, 4, 9]) {
      const est = estimateSkew(textLines(500, 420, a));
      expect(Math.abs(est - a)).toBeLessThanOrEqual(1);
    }
  });
  it('deskew reduces residual skew', () => {
    const { image, angle } = deskew(textLines(500, 420, 7));
    expect(angle).toBeGreaterThan(5);
    expect(Math.abs(estimateSkew(image))).toBeLessThanOrEqual(1);
  });
  it('rotateImage by 0 is identity-ish', () => {
    const img = textLines(60, 60, 0);
    const r = rotateImage(img, 0);
    expect(r.data[(30 * 60 + 30) * 4]).toBe(img.data[(30 * 60 + 30) * 4]);
  });
});

describe('enhance', () => {
  it('otsu separates two modes; adaptive threshold copes with a gradient', () => {
    const g = { width: 4, height: 1, data: new Uint8Array([10, 12, 200, 210]) };
    const t = otsuThreshold(g);
    expect(t).toBeGreaterThanOrEqual(12);
    expect(t).toBeLessThan(200);
    // gradient background with dark text pixels
    const w = 100, h = 20, data = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) data[y * w + x] = 100 + x; // 100..199
    for (let x = 10; x < 90; x += 10) data[10 * w + x] = 40 + x;
    const out = adaptiveThreshold({ width: w, height: h, data }, 15, 0.12);
    expect(out.data[10 * w + 20]).toBe(0); // ink
    expect(out.data[5 * w + 20]).toBe(255); // paper
    expect(out.data[5 * w + 90]).toBe(255); // bright side still paper
  });
  it('stretches contrast and converts gray<->rgba', () => {
    const g = toGrayscale({ width: 2, height: 1, data: new Uint8ClampedArray([100, 100, 100, 255, 140, 140, 140, 255]) });
    expect([...g.data]).toEqual([100, 140]);
    const s = stretchContrast({ width: 4, height: 1, data: new Uint8Array([100, 110, 120, 130]) }, 0.01, 0.99);
    expect(s.data[0]).toBe(0);
    expect(s.data[3]).toBe(255);
    expect(grayToImage(g).data[3]).toBe(255);
  });
});

describe('OCR adapter + pipeline', () => {
  it('NoopOcr never fakes text', async () => {
    const r = await new NoopOcr().recognize();
    expect(r.status).toBe('unavailable');
    expect('text' in r).toBe(false);
    expect((await selectOcr([])).id).toBe('none');
    const broken: OcrAdapter = { id: 'b', isAvailable: async () => { throw new Error('x'); }, recognize: async () => ({ status: 'error', message: 'x' }) };
    expect((await selectOcr([broken])).id).toBe('none');
  });
  it('runScan detects, warps, deskews and reports unavailable OCR', async () => {
    const img = createImage(400, 300, [25, 25, 25]);
    fillPolygon(img, [{ x: 60, y: 40 }, { x: 340, y: 50 }, { x: 330, y: 260 }, { x: 70, y: 250 }], 235);
    const r = await runScan(img, { filter: 'gray' });
    expect(r.quadSource).toBe('detected');
    expect(r.ocr.status).toBe('unavailable');
    expect(r.image.width).toBeGreaterThan(200);
    const flat = await runScan(createImage(50, 50, [90, 90, 90]));
    expect(flat.quadSource).toBe('full-frame');
    expect(flat.detectFailure).toBe('no-foreground');
  });
});
