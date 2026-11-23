export type SwipeDirection = 'left' | 'right' | 'up' | 'down';

export interface SwipeOptions {
  /** Minimum travel in px. */
  minDistance?: number;
  /** Maximum duration in ms for a "swipe" (slower = drag). */
  maxDurationMs?: number;
  /** Off-axis travel must be below axisRatio * main-axis travel. */
  axisRatio?: number;
  /** Minimum velocity px/ms. */
  minVelocity?: number;
}

export interface SwipeResult {
  direction: SwipeDirection;
  distance: number;
  velocity: number;
}

/** Classify a gesture from start/end points. Returns null if it is a tap, a diagonal, or too slow/short. */
export function detectSwipe(
  start: { x: number; y: number },
  end: { x: number; y: number },
  durationMs: number,
  o: SwipeOptions = {},
): SwipeResult | null {
  const minDistance = o.minDistance ?? 50;
  const maxDuration = o.maxDurationMs ?? 600;
  const axisRatio = o.axisRatio ?? 0.6;
  const minVelocity = o.minVelocity ?? 0.1;
  const dx = end.x - start.x, dy = end.y - start.y;
  const ax = Math.abs(dx), ay = Math.abs(dy);
  const main = Math.max(ax, ay), off = Math.min(ax, ay);
  if (main < minDistance || durationMs <= 0 || durationMs > maxDuration) return null;
  if (off > main * axisRatio) return null;
  const velocity = main / durationMs;
  if (velocity < minVelocity) return null;
  const direction: SwipeDirection = ax > ay ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up';
  return { direction, distance: main, velocity };
}

/**
 * Edge-swipe helper (e.g. open sidebar by dragging from the left edge). `edgePx` is the activation zone.
 */
export function isEdgeStart(x: number, viewportWidth: number, edge: 'left' | 'right', edgePx = 24): boolean {
  return edge === 'left' ? x <= edgePx : x >= viewportWidth - edgePx;
}

/** Stateful tracker usable from touch/pointer handlers. */
export class SwipeTracker {
  private start: { x: number; y: number; t: number } | null = null;
  constructor(private opts: SwipeOptions = {}) {}
  down(x: number, y: number, t: number) {
    this.start = { x, y, t };
  }
  up(x: number, y: number, t: number): SwipeResult | null {
    const s = this.start;
    this.start = null;
    return s ? detectSwipe(s, { x, y }, t - s.t, this.opts) : null;
  }
  cancel() {
    this.start = null;
  }
}
