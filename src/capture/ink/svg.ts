import type { InkDocument, InkStroke } from './types';
import { boundsOf, catmullRom, pressureToWidth } from './geometry';

const f = (n: number) => (Math.round(n * 100) / 100).toString();

/** Only allow simple CSS colours so exported SVG cannot carry attribute injection. */
export function safeColor(c: string): string {
  return /^#[0-9a-fA-F]{3,8}$|^[a-zA-Z]{3,20}$|^(rgb|hsl)a?\([0-9.,%\s/-]+\)$/.test(c) ? c : '#000000';
}

/**
 * Variable-width outline polygon for a stroke, as an SVG path `d` string.
 * Offsets each (spline-resampled) point by +-width/2 along the local normal; round caps via arcs.
 */
export function strokeToPath(stroke: InkStroke): string {
  const raw = stroke.points;
  if (raw.length === 0) return '';
  if (raw.length === 1) {
    const r = pressureToWidth(stroke.size, raw[0].p) / 2;
    const { x, y } = raw[0];
    return `M${f(x - r)} ${f(y)}a${f(r)} ${f(r)} 0 1 0 ${f(2 * r)} 0a${f(r)} ${f(r)} 0 1 0 ${f(-2 * r)} 0Z`;
  }
  const pts = catmullRom(raw, 3);
  const left: string[] = [];
  const right: string[] = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[Math.max(0, i - 1)];
    const b = pts[Math.min(pts.length - 1, i + 1)];
    let dx = b.x - a.x, dy = b.y - a.y;
    const len = Math.hypot(dx, dy) || 1;
    dx /= len; dy /= len;
    const w = pressureToWidth(stroke.size, pts[i].p) / 2;
    left.push(`${f(pts[i].x - dy * w)} ${f(pts[i].y + dx * w)}`);
    right.push(`${f(pts[i].x + dy * w)} ${f(pts[i].y - dx * w)}`);
  }
  const endR = pressureToWidth(stroke.size, pts[pts.length - 1].p) / 2;
  const startR = pressureToWidth(stroke.size, pts[0].p) / 2;
  right.reverse();
  return `M${left.join('L')}A${f(endR)} ${f(endR)} 0 0 0 ${right[0]}L${right.join('L')}A${f(startR)} ${f(startR)} 0 0 0 ${left[0]}Z`;
}

/** Export a whole document as a standalone SVG string. */
export function documentToSvg(doc: InkDocument, opts: { background?: string; crop?: boolean } = {}): string {
  let { width, height } = doc;
  let vx = 0, vy = 0;
  if (opts.crop) {
    const b = boundsOf(doc.strokes);
    if (b) { vx = b.x; vy = b.y; width = b.w; height = b.h; }
  }
  const bg = opts.background
    ? `<rect x="${f(vx)}" y="${f(vy)}" width="${f(width)}" height="${f(height)}" fill="${safeColor(opts.background)}"/>`
    : '';
  const paths = doc.strokes
    .map((s) => {
      const d = strokeToPath(s);
      if (!d) return '';
      const op = s.tool === 'highlighter' ? ' fill-opacity="0.35"' : '';
      return `<path d="${d}" fill="${safeColor(s.color)}"${op}/>`;
    })
    .join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${f(vx)} ${f(vy)} ${f(width)} ${f(height)}" width="${f(width)}" height="${f(height)}">${bg}${paths}</svg>`;
}
