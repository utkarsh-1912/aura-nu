import type { ImageLike } from './image';
import { grayToImage, toGrayscale } from './image';
import { adaptiveThreshold, stretchContrast } from './enhance';
import { detectPageQuad, type Quad } from './detectPage';
import { warpPerspective } from './warp';
import { deskew } from './deskew';
import { NoopOcr, type OcrAdapter, type OcrResult } from './ocr';

export interface ScanOptions {
  /** 'color' keeps colour, 'gray' contrast-stretched, 'bw' adaptive-threshold document look. */
  filter?: 'color' | 'gray' | 'bw';
  /** Manually supplied corners override detection (user dragged handles). */
  quad?: Quad;
  deskew?: boolean;
  ocr?: OcrAdapter;
}

export interface ScanResult {
  image: ImageLike;
  quadSource: 'manual' | 'detected' | 'full-frame';
  detectFailure?: string;
  skewDegrees: number;
  ocr: OcrResult;
}

export async function runScan(input: ImageLike, opts: ScanOptions = {}): Promise<ScanResult> {
  let quad = opts.quad;
  let quadSource: ScanResult['quadSource'] = quad ? 'manual' : 'full-frame';
  let detectFailure: string | undefined;
  if (!quad) {
    const d = detectPageQuad(input);
    if (d.ok === true) { quad = d.quad; quadSource = 'detected'; } else detectFailure = (d as { reason: string }).reason;
  }
  let img = input;
  if (quad) {
    const warped = warpPerspective(input, quad);
    if (warped) img = warped;
    else { quadSource = 'full-frame'; detectFailure = 'degenerate-quad'; }
  }

  let skewDegrees = 0;
  if (opts.deskew !== false) {
    const r = deskew(img);
    img = r.image;
    skewDegrees = r.angle;
  }
  const filter = opts.filter ?? 'gray';
  if (filter !== 'color') {
    const g = toGrayscale(img);
    img = grayToImage(filter === 'bw' ? adaptiveThreshold(g, 21, 0.1) : stretchContrast(g));
  }
  const ocr = await (opts.ocr ?? new NoopOcr()).recognize(img);
  return { image: img, quadSource, detectFailure, skewDegrees, ocr };
}
