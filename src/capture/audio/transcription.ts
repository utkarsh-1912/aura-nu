export interface TranscriptSegment {
  startMs: number;
  endMs: number;
  text: string;
  /** Optional confidence 0..1 from the engine. */
  confidence?: number;
}

export type TranscriptionResult =
  | { status: 'ok'; segments: TranscriptSegment[]; language?: string; engine: string }
  | { status: 'unavailable'; reason: string }
  | { status: 'error'; message: string };

/**
 * Transcription backends implement this. Intended (NOT shipped here): whisper.cpp sidecar on desktop,
 * an authenticated server endpoint, or on-device web speech where policy allows. Default: NoopTranscription.
 */
export interface TranscriptionAdapter {
  readonly id: string;
  isAvailable(): Promise<boolean>;
  transcribe(audio: Blob, opts?: { language?: string; signal?: AbortSignal }): Promise<TranscriptionResult>;
}

export class NoopTranscription implements TranscriptionAdapter {
  readonly id = 'none';
  async isAvailable() {
    return false;
  }
  async transcribe(): Promise<TranscriptionResult> {
    return { status: 'unavailable', reason: 'No transcription engine is configured.' };
  }
}
