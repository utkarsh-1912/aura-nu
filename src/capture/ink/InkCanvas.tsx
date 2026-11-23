/**
 * InkCanvas: Pointer Events drawing surface. UNTESTED-IN-BROWSER (pure logic lives in the sibling modules
 * and is unit-tested; pointer pressure, coalesced events, palm rejection and canvas rendering are not).
 */
import { useCallback, useEffect, useImperativeHandle, useRef, useState, forwardRef } from 'react';
import type { InkDocument, InkPoint, InkStroke, InkTool } from './types';
import { catmullRom, pressureToWidth, smoothPoints } from './geometry';
import { eraseStrokes, erasePartial } from './eraser';
import { canRedo, canUndo, commit, createHistory, redo, undo, type InkHistory } from './history';
import { documentToSvg } from './svg';
import { initialPalmState, normalizePressure, notePointerDown, notePointerUp, shouldAcceptPointer, type PalmState } from './palm';

export type InkMode = 'pen' | 'highlighter' | 'eraser-stroke' | 'eraser-partial';

export interface InkCanvasHandle {
  undo(): void;
  redo(): void;
  clear(): void;
  toSvg(opts?: { background?: string; crop?: boolean }): string;
  getDocument(): InkDocument;
}

export interface InkCanvasProps {
  width: number;
  height: number;
  initial?: readonly InkStroke[];
  mode?: InkMode;
  color?: string;
  size?: number;
  eraserRadius?: number;
  className?: string;
  onChange?(doc: InkDocument, state: { canUndo: boolean; canRedo: boolean }): void;
}

let idCounter = 0;
const newId = () => `k${Date.now().toString(36)}${(idCounter++).toString(36)}`;

function drawStroke(ctx: CanvasRenderingContext2D, s: InkStroke) {
  const pts = s.points.length > 2 ? catmullRom(s.points, 3) : s.points;
  ctx.save();
  ctx.globalAlpha = s.tool === 'highlighter' ? 0.35 : 1;
  ctx.fillStyle = s.color;
  ctx.strokeStyle = s.color;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  if (pts.length === 1) {
    ctx.beginPath();
    ctx.arc(pts[0].x, pts[0].y, pressureToWidth(s.size, pts[0].p) / 2, 0, Math.PI * 2);
    ctx.fill();
  } else {
    // Per-segment width (canvas cannot vary lineWidth inside one path). Highlighter alpha overlaps are accepted.
    for (let i = 1; i < pts.length; i++) {
      ctx.lineWidth = pressureToWidth(s.size, (pts[i - 1].p + pts[i].p) / 2);
      ctx.beginPath();
      ctx.moveTo(pts[i - 1].x, pts[i - 1].y);
      ctx.lineTo(pts[i].x, pts[i].y);
      ctx.stroke();
    }
  }
  ctx.restore();
}

export const InkCanvas = forwardRef<InkCanvasHandle, InkCanvasProps>(function InkCanvas(
  { width, height, initial = [], mode = 'pen', color = '#111827', size = 3, eraserRadius = 10, className, onChange },
  ref,
) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [hist, setHist] = useState<InkHistory>(() => createHistory(initial));
  const histRef = useRef(hist);
  histRef.current = hist;
  const live = useRef<{ points: InkPoint[]; t0: number; tool: InkTool } | null>(null);
  const erasing = useRef(false);
  const palm = useRef<PalmState>(initialPalmState());

  const render = useCallback(() => {
    const c = canvasRef.current;
    const ctx = c?.getContext('2d');
    if (!c || !ctx) return;
    const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
    if (c.width !== Math.round(width * dpr)) {
      c.width = Math.round(width * dpr);
      c.height = Math.round(height * dpr);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
    for (const s of histRef.current.present) drawStroke(ctx, s);
    if (live.current && live.current.points.length) {
      drawStroke(ctx, { id: 'live', tool: live.current.tool, color, size, points: live.current.points });
    }
  }, [width, height, color, size]);

  useEffect(render, [hist, render]);

  useEffect(() => {
    onChange?.({ width, height, strokes: hist.present }, { canUndo: canUndo(hist), canRedo: canRedo(hist) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hist]);

  useImperativeHandle(ref, () => ({
    undo: () => setHist((h) => undo(h)),
    redo: () => setHist((h) => redo(h)),
    clear: () => setHist((h) => commit(h, [])),
    toSvg: (o) => documentToSvg({ width, height, strokes: histRef.current.present }, o),
    getDocument: () => ({ width, height, strokes: histRef.current.present }),
  }));

  const local = (e: React.PointerEvent): { x: number; y: number } => {
    const r = canvasRef.current!.getBoundingClientRect();
    return { x: ((e.clientX - r.left) * width) / r.width, y: ((e.clientY - r.top) * height) / r.height };
  };

  const eraseAt = (e: React.PointerEvent) => {
    const { x, y } = local(e);
    const fn = mode === 'eraser-partial' ? erasePartial : eraseStrokes;
    const next = fn(histRef.current.present, x, y, eraserRadius);
    if (next !== histRef.current.present) {
      // Coalesce a whole erase gesture into a single undo step: replace present, history committed on pointer up.
      histRef.current = { ...histRef.current, present: next };
      setHist(histRef.current);
    }
  };

  const onDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!shouldAcceptPointer(palm.current, e.nativeEvent)) return;
    palm.current = notePointerDown(palm.current, e.nativeEvent);
    e.currentTarget.setPointerCapture(e.pointerId);
    e.preventDefault();
    if (mode.startsWith('eraser')) {
      erasing.current = true;
      eraseStartRef.current = histRef.current.present;
      eraseAt(e);
      return;
    }
    const { x, y } = local(e);
    live.current = { points: [{ x, y, p: normalizePressure(e.pointerType, e.pressure), t: 0 }], t0: e.timeStamp, tool: mode as InkTool };
    render();
  };
  const eraseStartRef = useRef<readonly InkStroke[]>([]);

  const onMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (palm.current.activePointerId !== e.pointerId) return;
    if (erasing.current) return eraseAt(e);
    const l = live.current;
    if (!l) return;
    // getCoalescedEvents gives the full-rate samples between frames (not in all browsers).
    const evs = e.nativeEvent.getCoalescedEvents?.() ?? [e.nativeEvent];
    const r = canvasRef.current!.getBoundingClientRect();
    for (const ev of evs.length ? evs : [e.nativeEvent]) {
      l.points.push({
        x: ((ev.clientX - r.left) * width) / r.width,
        y: ((ev.clientY - r.top) * height) / r.height,
        p: normalizePressure(e.pointerType, ev.pressure),
        t: Math.max(0, ev.timeStamp - l.t0),
      });
    }
    render();
  };

  const finish = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (palm.current.activePointerId !== e.pointerId) return;
    palm.current = notePointerUp(palm.current, e);
    if (erasing.current) {
      erasing.current = false;
      const after = histRef.current.present;
      // restore pre-gesture present as the undo base, then commit once
      const base: InkHistory = { ...histRef.current, present: eraseStartRef.current };
      setHist(commit(base, after));
      return;
    }
    const l = live.current;
    live.current = null;
    if (!l) return;
    const pts = l.points.length > 2 ? smoothPoints(l.points) : l.points;
    setHist((h) => commit(h, [...h.present, { id: newId(), tool: l.tool, color, size, points: pts }]));
  };

  return (
    <canvas
      ref={canvasRef}
      className={className}
      style={{ width: '100%', aspectRatio: `${width} / ${height}`, touchAction: 'none', userSelect: 'none' }}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={finish}
      onPointerCancel={finish}
    />
  );
});
