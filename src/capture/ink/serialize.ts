import { INK_FORMAT_VERSION, INK_LIMITS, type InkDocument, type InkPoint, type InkStroke, type InkTool } from './types';

export class InkFormatError extends Error {
  constructor(msg: string) {
    super(msg);
    this.name = 'InkFormatError';
  }
}

/**
 * Compact JSON: {"v":1,"w":W,"h":H,"s":[[toolCode,color,size10,[dx,dy,p,dt, ...]],...]}
 * Coordinates are quantised to 0.1 px and delta-encoded as integers; pressure to 1/100; time to ms.
 * Quantisation is lossy by <=0.05px; round-trip is stable after the first pass.
 */
export function serializeInk(doc: InkDocument): string {
  if (doc.strokes.length > INK_LIMITS.maxStrokes) throw new InkFormatError('too many strokes');
  let total = 0;
  const s = doc.strokes.map((st) => {
    if (st.points.length > INK_LIMITS.maxPointsPerStroke) throw new InkFormatError('stroke too long');
    total += st.points.length;
    let px = 0, py = 0, pt = 0;
    const flat: number[] = [];
    for (const p of st.points) {
      const qx = Math.round(p.x * 10), qy = Math.round(p.y * 10), qt = Math.round(p.t);
      flat.push(qx - px, qy - py, Math.round(Math.min(1, Math.max(0, p.p)) * 100), qt - pt);
      px = qx; py = qy; pt = qt;
    }
    return [st.tool === 'highlighter' ? 1 : 0, st.color, Math.round(st.size * 10), flat];
  });
  if (total > INK_LIMITS.maxTotalPoints) throw new InkFormatError('too many points');
  const out = JSON.stringify({ v: INK_FORMAT_VERSION, w: doc.width, h: doc.height, s });
  if (out.length > INK_LIMITS.maxSerializedChars) throw new InkFormatError('serialized ink too large');
  return out;
}

const isNum = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n);

export function deserializeInk(json: string): InkDocument {
  if (typeof json !== 'string' || json.length > INK_LIMITS.maxSerializedChars) throw new InkFormatError('input too large');
  let raw: any;
  try { raw = JSON.parse(json); } catch { throw new InkFormatError('invalid JSON'); }
  if (!raw || typeof raw !== 'object') throw new InkFormatError('not an object');
  if (raw.v !== INK_FORMAT_VERSION) throw new InkFormatError(`unsupported ink version ${String(raw.v)}`);
  if (!isNum(raw.w) || !isNum(raw.h) || raw.w <= 0 || raw.h <= 0 || raw.w > INK_LIMITS.maxDimension || raw.h > INK_LIMITS.maxDimension)
    throw new InkFormatError('bad dimensions');
  if (!Array.isArray(raw.s) || raw.s.length > INK_LIMITS.maxStrokes) throw new InkFormatError('bad strokes');
  let total = 0;
  const strokes: InkStroke[] = raw.s.map((st: unknown, i: number) => {
    if (!Array.isArray(st) || st.length !== 4) throw new InkFormatError(`bad stroke ${i}`);
    const [tool, color, size, flat] = st;
    if ((tool !== 0 && tool !== 1) || typeof color !== 'string' || color.length > 40 || !isNum(size) || size <= 0 || !Array.isArray(flat) || flat.length % 4 !== 0)
      throw new InkFormatError(`bad stroke ${i}`);
    const n = flat.length / 4;
    total += n;
    if (n > INK_LIMITS.maxPointsPerStroke || total > INK_LIMITS.maxTotalPoints) throw new InkFormatError('too many points');
    const points: InkPoint[] = [];
    let x = 0, y = 0, t = 0;
    for (let k = 0; k < flat.length; k += 4) {
      if (!isNum(flat[k]) || !isNum(flat[k + 1]) || !isNum(flat[k + 2]) || !isNum(flat[k + 3])) throw new InkFormatError(`bad point in stroke ${i}`);
      x += flat[k]; y += flat[k + 1]; t += flat[k + 3];
      points.push({ x: x / 10, y: y / 10, p: flat[k + 2] / 100, t });
    }
    return { id: `s${i}`, tool: (tool === 1 ? 'highlighter' : 'pen') as InkTool, color, size: size / 10, points };
  });
  return { width: raw.w, height: raw.h, strokes };
}
