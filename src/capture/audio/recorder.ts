/**
 * AudioRecorder: thin wrapper over getUserMedia + MediaRecorder with chunking, pause/resume,
 * max duration and typed errors. Browser APIs are injected (`env`) so the state machine is unit-tested
 * with fakes; the REAL MediaRecorder/getUserMedia behaviour is UNTESTED-IN-BROWSER.
 */
export type RecorderErrorCode = 'permission-denied' | 'no-device' | 'unsupported' | 'invalid-state' | 'recorder-error';

export class RecorderError extends Error {
  constructor(public code: RecorderErrorCode, message: string, public cause?: unknown) {
    super(message);
    this.name = 'RecorderError';
  }
}

export type RecorderState = 'idle' | 'recording' | 'paused' | 'stopped';

export interface RecorderEnv {
  getUserMedia(constraints: MediaStreamConstraints): Promise<MediaStream>;
  createRecorder(stream: MediaStream, opts: { mimeType?: string }): MediaRecorderLike;
  isTypeSupported(mime: string): boolean;
  now(): number;
}

/** Minimal MediaRecorder surface we depend on. */
export interface MediaRecorderLike {
  state: string;
  mimeType: string;
  ondataavailable: ((e: { data: Blob }) => void) | null;
  onstop: (() => void) | null;
  onerror: ((e: unknown) => void) | null;
  start(timesliceMs?: number): void;
  stop(): void;
  pause(): void;
  resume(): void;
}

export interface RecordingResult {
  blob: Blob;
  mimeType: string;
  durationMs: number;
  /** True when recording ended because maxDurationMs was reached. */
  hitMaxDuration: boolean;
}

export interface RecorderOptions {
  maxDurationMs?: number;
  /** MediaRecorder timeslice so data is flushed periodically (crash safety / live upload). Default 1000. */
  chunkMs?: number;
  preferredMimeTypes?: string[];
  onChunk?(chunk: Blob): void;
  onState?(s: RecorderState): void;
  onMaxDuration?(): void;
  onError?(e: RecorderError): void;
  env?: RecorderEnv;
}

const DEFAULT_MIMES = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'];

export function browserEnv(): RecorderEnv {
  return {
    getUserMedia: (c) => navigator.mediaDevices.getUserMedia(c),
    createRecorder: (stream, o) => new MediaRecorder(stream, o) as unknown as MediaRecorderLike,
    isTypeSupported: (m) => typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(m),
    now: () => Date.now(),
  };
}

export function mapMediaError(e: unknown): RecorderError {
  const name = (e as { name?: string } | null)?.name;
  if (name === 'NotAllowedError' || name === 'SecurityError') return new RecorderError('permission-denied', 'Microphone permission was denied.', e);
  if (name === 'NotFoundError' || name === 'OverconstrainedError') return new RecorderError('no-device', 'No microphone was found.', e);
  if (name === 'NotSupportedError' || name === 'TypeError') return new RecorderError('unsupported', 'Audio recording is not supported here.', e);
  return new RecorderError('recorder-error', 'Recording failed.', e);
}

export class AudioRecorder {
  private env: RecorderEnv;
  private rec: MediaRecorderLike | null = null;
  private stream: MediaStream | null = null;
  private chunks: Blob[] = [];
  private _state: RecorderState = 'idle';
  private accumulated = 0;
  private segmentStart = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private hitMax = false;
  private stopWaiters: Array<(r: RecordingResult) => void> = [];
  private result: RecordingResult | null = null;

  constructor(private opts: RecorderOptions = {}) {
    this.env = opts.env ?? browserEnv();
  }

  get state(): RecorderState {
    return this._state;
  }

  /** Elapsed recording time excluding paused time. */
  get elapsedMs(): number {
    return this.accumulated + (this._state === 'recording' ? this.env.now() - this.segmentStart : 0);
  }

  private set(s: RecorderState) {
    this._state = s;
    this.opts.onState?.(s);
  }

  async start(): Promise<void> {
    if (this._state !== 'idle') throw new RecorderError('invalid-state', `Cannot start from state ${this._state}.`);
    let stream: MediaStream;
    try {
      stream = await this.env.getUserMedia({ audio: true });
    } catch (e) {
      throw mapMediaError(e);
    }
    const mimeType = (this.opts.preferredMimeTypes ?? DEFAULT_MIMES).find((m) => this.env.isTypeSupported(m));
    let rec: MediaRecorderLike;
    try {
      rec = this.env.createRecorder(stream, mimeType ? { mimeType } : {});
    } catch (e) {
      stream.getTracks().forEach((t) => t.stop());
      throw mapMediaError(e);
    }
    this.stream = stream;
    this.rec = rec;
    rec.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) {
        this.chunks.push(e.data);
        this.opts.onChunk?.(e.data);
      }
    };
    rec.onerror = (e) => {
      const err = new RecorderError('recorder-error', 'Recording failed.', e);
      this.opts.onError?.(err);
    };
    rec.onstop = () => this.finish(rec.mimeType || mimeType || 'audio/webm');
    rec.start(this.opts.chunkMs ?? 1000);
    this.segmentStart = this.env.now();
    this.set('recording');
    this.armTimer();
  }

  private armTimer() {
    this.clearTimer();
    const max = this.opts.maxDurationMs;
    if (!max) return;
    const remaining = max - this.elapsedMs;
    this.timer = setTimeout(() => {
      this.hitMax = true;
      this.opts.onMaxDuration?.();
      void this.stop();
    }, Math.max(0, remaining));
  }

  private clearTimer() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  pause(): void {
    if (this._state !== 'recording' || !this.rec) throw new RecorderError('invalid-state', 'Not recording.');
    this.accumulated += this.env.now() - this.segmentStart;
    this.rec.pause();
    this.clearTimer();
    this.set('paused');
  }

  resume(): void {
    if (this._state !== 'paused' || !this.rec) throw new RecorderError('invalid-state', 'Not paused.');
    this.rec.resume();
    this.segmentStart = this.env.now();
    this.set('recording');
    this.armTimer();
  }

  /** Stop and resolve with the assembled recording. Idempotent once stopped. */
  stop(): Promise<RecordingResult> {
    if (this.result) return Promise.resolve(this.result);
    if ((this._state !== 'recording' && this._state !== 'paused') || !this.rec) {
      return Promise.reject(new RecorderError('invalid-state', 'Not recording.'));
    }
    if (this._state === 'recording') this.accumulated += this.env.now() - this.segmentStart;
    this.clearTimer();
    return new Promise((resolve) => {
      this.stopWaiters.push(resolve);
      this.rec!.stop();
    });
  }

  private finish(mimeType: string) {
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    const blob = new Blob(this.chunks, { type: mimeType });
    this.result = { blob, mimeType, durationMs: this.accumulated, hitMaxDuration: this.hitMax };
    this.set('stopped');
    this.stopWaiters.splice(0).forEach((w) => w(this.result!));
  }

  /** Abort and discard everything (e.g. user cancels). */
  cancel(): void {
    this.clearTimer();
    if (this.rec && this.rec.state !== 'inactive') {
      this.rec.ondataavailable = null;
      this.rec.onstop = null;
      try { this.rec.stop(); } catch { /* already stopped */ }
    }
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    this.chunks = [];
    this.set('stopped');
  }
}
