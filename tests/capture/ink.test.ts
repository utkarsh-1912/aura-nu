import { describe, expect, it } from 'vitest';
import {
  boundsOf, canRedo, canUndo, catmullRom, commit, createHistory, deserializeInk, documentToSvg, erasePartial, eraseStrokes,
  hitTest, hitTestStroke, initialPalmState, InkFormatError, normalizePressure, notePointerDown, notePointerUp, OneEuroFilter,
  pressureToWidth, redo, serializeInk, shouldAcceptPointer, smoothPoints, strokeBounds, strokeToPath, undo,
  type InkStroke,
} from '../../src/capture/ink';

const line = (id: string, x0: number, y0: number, x1: number, y1: number, n = 11, size = 2): InkStroke => ({
  id, tool: 'pen', color: '#112233', size,
  points: Array.from({ length: n }, (_, i) => ({ x: x0 + ((x1 - x0) * i) / (n - 1), y: y0 + ((y1 - y0) * i) / (n - 1), p: 0.5, t: i * 10 })),
});

describe('ink geometry', () => {
  it('pressure maps monotonically within [min,1]*size', () => {
    expect(pressureToWidth(10, 0)).toBeCloseTo(3.5);
    expect(pressureToWidth(10, 1)).toBeCloseTo(10);
    expect(pressureToWidth(10, 0.3)).toBeLessThan(pressureToWidth(10, 0.7));
    expect(pressureToWidth(10, NaN)).toBeGreaterThan(0);
    expect(pressureToWidth(10, 5)).toBeCloseTo(10);
  });
  it('one-euro filter reduces jitter but keeps endpoints', () => {
    const pts = Array.from({ length: 60 }, (_, i) => ({ x: i * 2 + (i % 2 ? 1.5 : -1.5), y: 10, p: 0.5, t: i * 8 }));
    const sm = smoothPoints(pts);
    expect(sm[0].x).toBe(pts[0].x);
    expect(sm.at(-1)!.x).toBe(pts.at(-1)!.x);
    const varOf = (a: number[]) => { const m = a.reduce((s, v) => s + v, 0) / a.length; return a.reduce((s, v) => s + (v - m) ** 2, 0) / a.length; };
    const dev = (arr: typeof pts) => varOf(arr.map((p, i) => p.x - i * 2));
    expect(dev(sm)).toBeLessThan(dev(pts));
    const f = new OneEuroFilter();
    expect(f.filter(5, 0)).toBe(5);
  });
  it('catmull-rom passes through original points and densifies', () => {
    const s = line('a', 0, 0, 10, 10, 4);
    const r = catmullRom(s.points, 4);
    expect(r.length).toBe((4 - 1) * 4 + 1);
    expect(r[0]).toMatchObject({ x: 0, y: 0 });
    expect(r[4].x).toBeCloseTo(s.points[1].x);
    expect(r.at(-1)!.x).toBe(10);
  });
  it('bounds and hit testing', () => {
    const a = line('a', 0, 0, 100, 0), b = line('b', 0, 50, 100, 50);
    expect(strokeBounds(a)).toEqual({ x: -1, y: -1, w: 102, h: 2 });
    expect(boundsOf([a, b])).toEqual({ x: -1, y: -1, w: 102, h: 52 });
    expect(boundsOf([])).toBeNull();
    expect(hitTestStroke(a, 50, 3, 3)).toBe(true);
    expect(hitTestStroke(a, 50, 10, 3)).toBe(false);
    expect(hitTest([a, b], 50, 50, 1)?.id).toBe('b');
    expect(hitTest([a, b], 500, 500, 1)).toBeNull();
  });
});

describe('eraser', () => {
  it('stroke eraser removes touched strokes only; identity when nothing hit', () => {
    const a = line('a', 0, 0, 100, 0), b = line('b', 0, 50, 100, 50);
    const arr = [a, b];
    expect(eraseStrokes(arr, 500, 500, 5)).toBe(arr);
    expect(eraseStrokes(arr, 50, 2, 5).map((s) => s.id)).toEqual(['b']);
  });
  it('partial eraser splits a stroke in two', () => {
    const a = line('a', 0, 0, 100, 0, 101);
    const out = erasePartial([a], 50, 0, 5);
    expect(out.map((s) => s.id)).toEqual(['a~0', 'a~1']);
    expect(out[0].points.at(-1)!.x).toBeLessThan(45);
    expect(out[1].points[0].x).toBeGreaterThan(55);
  });
  it('partial eraser cuts between sparse points and drops 1-point remnants', () => {
    const sparse = line('s', 0, 0, 100, 0, 2); // two points only, segment crosses eraser
    expect(erasePartial([sparse], 50, 0, 3)).toEqual([]); // both remnants are single points
    const mid = line('m', 0, 0, 100, 0, 3); // points at 0,50,100
    const out = erasePartial([mid], 25, 0, 3);
    expect(out.map((s) => s.points.length)).toEqual([2]); // [p0] dropped, [50,100] survives
    expect(erasePartial([mid], 500, 500, 3)).toEqual([mid]);
  });
});

describe('history', () => {
  it('undo/redo/commit semantics', () => {
    const a = line('a', 0, 0, 1, 1), b = line('b', 0, 0, 2, 2);
    let h = createHistory();
    expect(canUndo(h)).toBe(false);
    h = commit(h, [a]);
    h = commit(h, [a, b]);
    expect(h.present.length).toBe(2);
    h = undo(h);
    expect(h.present).toEqual([a]);
    expect(canRedo(h)).toBe(true);
    h = redo(h);
    expect(h.present.length).toBe(2);
    h = undo(undo(h));
    expect(h.present).toEqual([]);
    expect(undo(h)).toBe(h);
    h = commit(h, [b]);
    expect(canRedo(h)).toBe(false);
    expect(commit(h, h.present)).toBe(h);
  });
  it('caps history length', () => {
    let h = createHistory();
    for (let i = 0; i < 300; i++) h = commit(h, [line(`s${i}`, 0, 0, 1, 1)]);
    expect(h.past.length).toBe(200);
  });
});

describe('serialize', () => {
  const doc = { width: 800, height: 600, strokes: [line('a', 1.23, 4.56, 100.1, 50.9, 20), { ...line('b', 5, 5, 9, 9, 3), tool: 'highlighter' as const, color: '#ff0' }] };
  it('round-trips within quantisation and is stable on second pass', () => {
    const json = serializeInk(doc);
    const back = deserializeInk(json);
    expect(back.width).toBe(800);
    expect(back.strokes[1].tool).toBe('highlighter');
    expect(back.strokes[0].points[0].x).toBeCloseTo(1.2, 1);
    expect(back.strokes[0].points[3].t).toBe(30);
    expect(serializeInk(back)).toBe(json);
    expect(JSON.parse(json).v).toBe(1);
  });
  it('is compact vs naive JSON', () => {
    const naive = JSON.stringify(doc).length;
    expect(serializeInk(doc).length).toBeLessThan(naive * 0.6);
  });
  it('rejects bad input', () => {
    expect(() => deserializeInk('nope')).toThrow(InkFormatError);
    expect(() => deserializeInk(JSON.stringify({ v: 99, w: 1, h: 1, s: [] }))).toThrow(/version/);
    expect(() => deserializeInk(JSON.stringify({ v: 1, w: -1, h: 1, s: [] }))).toThrow(/dimensions/);
    expect(() => deserializeInk(JSON.stringify({ v: 1, w: 10, h: 10, s: [[0, '#000', 20, [1, 2, 3]]] }))).toThrow(/bad stroke/);
    expect(() => deserializeInk(JSON.stringify({ v: 1, w: 10, h: 10, s: [[0, '#000', 20, [1, 2, 3, 'x']]] }))).toThrow(/bad point/);
    expect(() => deserializeInk('x'.repeat(9 * 1024 * 1024))).toThrow(/too large/);
  });
  it('enforces size bounds on serialize', () => {
    const big = { width: 10, height: 10, strokes: Array.from({ length: 5001 }, (_, i) => line(`s${i}`, 0, 0, 1, 1, 2)) };
    expect(() => serializeInk(big)).toThrow(/too many strokes/);
  });
});

describe('svg export', () => {
  it('produces a well-formed svg with paths and sanitised colours', () => {
    const evil: InkStroke = { ...line('e', 0, 0, 10, 10), color: '"><script>x</script>' };
    const svg = documentToSvg({ width: 100, height: 100, strokes: [line('a', 0, 0, 50, 50), evil, { ...line('d', 5, 5, 5, 5, 1) }] }, { background: '#fff' });
    expect(svg.startsWith('<svg')).toBe(true);
    expect(svg).not.toContain('<script');
    expect((svg.match(/<path /g) ?? []).length).toBe(3);
    expect(svg).toContain('viewBox="0 0 100 100"');
    expect(strokeToPath(line('a', 0, 0, 50, 50))).toMatch(/^M[\d.\- L]+A/);
    expect(strokeToPath({ ...line('x', 0, 0, 0, 0, 1), points: [] })).toBe('');
  });
  it('crop uses stroke bounds', () => {
    const svg = documentToSvg({ width: 500, height: 500, strokes: [line('a', 100, 100, 200, 150)] }, { crop: true });
    expect(svg).toContain('viewBox="99 99 102 52"');
  });
});

describe('palm rejection', () => {
  const ev = (o: Partial<Parameters<typeof shouldAcceptPointer>[1]>) => ({ pointerId: 1, pointerType: 'touch', timeStamp: 1000, ...o });
  it('rejects touch shortly after pen, accepts later', () => {
    let s = initialPalmState();
    s = notePointerDown(s, ev({ pointerType: 'pen', timeStamp: 100 }));
    s = notePointerUp(s, { pointerId: 1 });
    expect(shouldAcceptPointer(s, ev({ pointerId: 2, timeStamp: 400 }))).toBe(false);
    expect(shouldAcceptPointer(s, ev({ pointerId: 2, timeStamp: 900 }))).toBe(true);
  });
  it('rejects large contact and second pointer', () => {
    const s = initialPalmState();
    expect(shouldAcceptPointer(s, ev({ width: 80, height: 80 }))).toBe(false);
    const down = notePointerDown(s, ev({ pointerType: 'mouse' }));
    expect(shouldAcceptPointer(down, ev({ pointerId: 7, pointerType: 'mouse' }))).toBe(false);
    expect(shouldAcceptPointer(down, ev({ pointerId: 1, pointerType: 'mouse' }))).toBe(true);
  });
  it('normalises pressure', () => {
    expect(normalizePressure('pen', 0.8)).toBe(0.8);
    expect(normalizePressure('pen', 0)).toBe(0.5);
    expect(normalizePressure('mouse', 1)).toBe(0.5);
  });
});
