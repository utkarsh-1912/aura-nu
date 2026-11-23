import type { ImageLike } from './image';

export interface OcrWord {
  text: string;
  /** Bounding box in image pixels. */
  box: { x: number; y: number; w: number; h: number };
  confidence: number;
}

export type OcrResult =
  | { status: 'ok'; text: string; words?: OcrWord[]; language?: string; engine: string }
  | { status: 'unavailable'; reason: string }
  | { status: 'error'; message: string };

/**
 * OCR backends implement this. Intended implementations (NONE are shipped here):
 *  - desktop: OS-native OCR through the Tauri shell (Windows.Media.Ocr / Apple Vision) -> `engine: 'os-native'`
 *  - web: WASM (tesseract.js) or transformers.js model, lazily loaded, only after user consent
 *  - default: NoopOcr
 */
export interface OcrAdapter {
  readonly id: string;
  isAvailable(): Promise<boolean>;
  recognize(image: ImageLike, opts?: { languages?: string[]; signal?: AbortSignal }): Promise<OcrResult>;
}

/** Default adapter: always reports unavailable. Never returns text. */
export class NoopOcr implements OcrAdapter {
  readonly id = 'none';
  async isAvailable() {
    return false;
  }
  async recognize(): Promise<OcrResult> {
    return { status: 'unavailable', reason: 'No OCR engine is configured. Install the desktop app or enable an OCR provider.' };
  }
}

/** Pick the first available adapter, else NoopOcr. */
export async function selectOcr(candidates: OcrAdapter[]): Promise<OcrAdapter> {
  for (const c of candidates) {
    try {
      if (await c.isAvailable()) return c;
    } catch {
      /* skip broken adapter */
    }
  }
  return new NoopOcr();
}
