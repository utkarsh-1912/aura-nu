/** Ink (handwriting/drawing) data model. Pure TS, no DOM. */
export type InkTool = 'pen' | 'highlighter';

export interface InkPoint {
  x: number;
  y: number;
  /** Normalised pressure 0..1 (0.5 for devices without pressure). */
  p: number;
  /** Milliseconds since stroke start. */
  t: number;
}

export interface InkStroke {
  id: string;
  tool: InkTool;
  color: string;
  /** Base width in document units (pixels at zoom 1). */
  size: number;
  points: readonly InkPoint[];
}

export interface InkDocument {
  width: number;
  height: number;
  strokes: readonly InkStroke[];
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export const INK_FORMAT_VERSION = 1;
export const INK_LIMITS = {
  maxStrokes: 5000,
  maxPointsPerStroke: 20000,
  maxTotalPoints: 500000,
  maxSerializedChars: 8 * 1024 * 1024,
  maxDimension: 20000,
} as const;
