export interface Insets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export const ZERO_INSETS: Insets = { top: 0, right: 0, bottom: 0, left: 0 };

/** Parse "12px" style computed values; anything non-numeric becomes 0. */
export function parsePx(v: string | null | undefined): number {
  const n = parseFloat(v ?? '');
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/**
 * Read env(safe-area-inset-*) through a probe element's computed padding.
 * UNTESTED-IN-BROWSER. Requires `viewport-fit=cover` in the viewport meta tag to be non-zero on iOS.
 */
export function readSafeAreaInsets(doc: Document = document): Insets {
  const probe = doc.createElement('div');
  probe.style.cssText =
    'position:fixed;visibility:hidden;pointer-events:none;padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)';
  doc.body.appendChild(probe);
  const cs = doc.defaultView!.getComputedStyle(probe);
  const out = { top: parsePx(cs.paddingTop), right: parsePx(cs.paddingRight), bottom: parsePx(cs.paddingBottom), left: parsePx(cs.paddingLeft) };
  probe.remove();
  return out;
}

/** CSS custom properties a root element can set so Tailwind arbitrary values (pb-[var(--safe-bottom)]) work. */
export function insetsToCssVars(i: Insets, keyboard = 0): Record<string, string> {
  return {
    '--safe-top': `${i.top}px`,
    '--safe-right': `${i.right}px`,
    '--safe-bottom': `${i.bottom}px`,
    '--safe-left': `${i.left}px`,
    '--keyboard-inset': `${keyboard}px`,
  };
}
