import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  AudioRecorder, buildTranscriptNote, formatTimestamp, mapMediaError, NoopTranscription, RecorderError, segmentsToParagraphs,
  transcriptToMarkdown, type MediaRecorderLike, type RecorderEnv,
} from '../../src/capture/audio';

class FakeRec implements MediaRecorderLike {
  state = 'inactive';
  mimeType = 'audio/webm';
  ondataavailable: MediaRecorderLike['ondataavailable'] = null;
  onstop: (() => void) | null = null;
  onerror: ((e: unknown) => void) | null = null;
  start() { this.state = 'recording'; }
  pause() { this.state = 'paused'; }
  resume() { this.state = 'recording'; }
  stop() { this.state = 'inactive'; this.ondataavailable?.({ data: new Blob(['abc']) }); this.onstop?.(); }
}

let clock = 0;
function env(over: Partial<RecorderEnv> = {}): RecorderEnv & { rec: FakeRec; stopped: number } {
  const rec = new FakeRec();
  const o = {
    rec, stopped: 0,
    getUserMedia: async () => ({ getTracks: () => [{ stop: () => { o.stopped++; } }] }) as unknown as MediaStream,
    createRecorder: () => rec,
    isTypeSupported: (m: string) => m === 'audio/webm',
    now: () => clock,
    ...over,
  };
  return o;
}

describe('AudioRecorder', () => {
  beforeEach(() => { vi.useFakeTimers(); clock = 0; });
  afterEach(() => vi.useRealTimers());

  it('records, pauses (excluded from duration), resumes and stops', async () => {
    const e = env();
    const states: string[] = [];
    const r = new AudioRecorder({ env: e, onState: (s) => states.push(s) });
    await r.start();
    clock = 3000; r.pause();
    clock = 10000; r.resume();
    clock = 12000;
    expect(r.elapsedMs).toBe(5000);
    const res = await r.stop();
    expect(res.durationMs).toBe(5000);
    expect(res.mimeType).toBe('audio/webm');
    expect(res.blob.size).toBe(3);
    expect(states).toEqual(['recording', 'paused', 'recording', 'stopped']);
    expect(e.stopped).toBe(1); // mic released
    expect(await r.stop()).toBe(res); // idempotent
  });

  it('auto-stops at max duration, accounting for pauses', async () => {
    const e = env();
    const onMax = vi.fn();
    const r = new AudioRecorder({ env: e, maxDurationMs: 5000, onMaxDuration: onMax });
    await r.start();
    clock = 2000; r.pause(); clock = 9000; r.resume();
    clock = 12000; // 5000ms of recording
    await vi.advanceTimersByTimeAsync(2999);
    expect(onMax).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(2);
    expect(onMax).toHaveBeenCalled();
    expect(r.state).toBe('stopped');
  });

  it('types errors', async () => {
    const deny = new AudioRecorder({ env: env({ getUserMedia: async () => { throw Object.assign(new Error('x'), { name: 'NotAllowedError' }); } }) });
    await expect(deny.start()).rejects.toMatchObject({ code: 'permission-denied' });
    const none = new AudioRecorder({ env: env({ getUserMedia: async () => { throw Object.assign(new Error('x'), { name: 'NotFoundError' }); } }) });
    await expect(none.start()).rejects.toBeInstanceOf(RecorderError);
    expect(mapMediaError(new Error('?')).code).toBe('recorder-error');
    const r = new AudioRecorder({ env: env() });
    expect(() => r.pause()).toThrowError(/Not recording/);
    await expect(r.stop()).rejects.toMatchObject({ code: 'invalid-state' });
    await r.start();
    await expect(r.start()).rejects.toMatchObject({ code: 'invalid-state' });
  });

  it('cancel releases the mic and discards data', async () => {
    const e = env();
    const r = new AudioRecorder({ env: e });
    await r.start();
    r.cancel();
    expect(e.stopped).toBe(1);
    expect(r.state).toBe('stopped');
  });
});

describe('transcript formatting', () => {
  const segs = [
    { startMs: 0, endMs: 2000, text: ' Hello   there. ' },
    { startMs: 2500, endMs: 4000, text: 'This is a test.' },
    { startMs: 20000, endMs: 22000, text: 'New topic.' },
    { startMs: 30000, endMs: 31000, text: '   ' },
  ];
  it('formats timestamps', () => {
    expect(formatTimestamp(0)).toBe('00:00');
    expect(formatTimestamp(65_000)).toBe('01:05');
    expect(formatTimestamp(3_725_000)).toBe('1:02:05');
    expect(formatTimestamp(-5)).toBe('00:00');
  });
  it('groups into paragraphs by silence gap, sorts, drops empties', () => {
    const p = segmentsToParagraphs([...segs].reverse());
    expect(p).toEqual([
      { startMs: 0, endMs: 4000, text: 'Hello there. This is a test.' },
      { startMs: 20000, endMs: 22000, text: 'New topic.' },
    ]);
  });
  it('renders markdown deterministically', () => {
    const md = transcriptToMarkdown(segs, { title: 'Standup', recordedAt: new Date('2026-01-02T03:04:05Z'), durationMs: 31000, summary: 'Short.' });
    expect(md).toContain('# Standup');
    expect(md).toContain('_2026-01-02T03:04:05.000Z - duration 00:31_');
    expect(md).toContain('## Summary\n\nShort.');
    expect(md).toContain('**[00:00]** Hello there. This is a test.');
    expect(md).toContain('**[00:20]** New topic.');
    expect(transcriptToMarkdown([], {})).toContain('_No speech was transcribed._');
    expect(transcriptToMarkdown(segs, { timestamps: false })).not.toContain('**[');
  });
  it('summary hook is optional and failure-tolerant', async () => {
    const ok = await buildTranscriptNote(segs, { summarize: async (t) => `S(${t.length})` });
    expect(ok).toContain('## Summary');
    const bad = await buildTranscriptNote(segs, { summarize: async () => { throw new Error('x'); } });
    expect(bad).not.toContain('## Summary');
  });
  it('NoopTranscription is unavailable', async () => {
    const r = await new NoopTranscription().transcribe();
    expect(r.status).toBe('unavailable');
  });
});
