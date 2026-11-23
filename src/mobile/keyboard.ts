export interface ViewportLike {
  height: number;
  offsetTop: number;
}

/**
 * Height of the on-screen keyboard (or other bottom UI) covering the layout viewport, derived from
 * visualViewport. Values under `threshold` px are treated as browser chrome jitter, not a keyboard.
 */
export function computeKeyboardInset(layoutHeight: number, vv: ViewportLike, threshold = 80): number {
  const inset = layoutHeight - vv.height - vv.offsetTop;
  return inset > threshold ? Math.round(inset) : 0;
}

/** Scroll delta needed to bring a caret/element rect above the keyboard with `margin` px of space. */
export function scrollDeltaToReveal(elementBottom: number, visibleBottom: number, margin = 16): number {
  const over = elementBottom + margin - visibleBottom;
  return over > 0 ? Math.ceil(over) : 0;
}
