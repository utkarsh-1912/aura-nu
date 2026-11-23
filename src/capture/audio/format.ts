import type { TranscriptSegment } from './transcription';

export function formatTimestamp(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600), m = Math.floor((total % 3600) / 60), s = total % 60;
  const mm = String(m).padStart(2, '0'), ss = String(s).padStart(2, '0');
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

export interface Paragraph {
  startMs: number;
  endMs: number;
  text: string;
}

/**
 * Group segments into speaker-less paragraphs: a new paragraph starts after a silence gap >= gapMs
 * or when the current one exceeds maxChars (broken at the next segment boundary). Segments are sorted
 * by start time and empty text is dropped.
 */
export function segmentsToParagraphs(segments: readonly TranscriptSegment[], opts: { gapMs?: number; maxChars?: number } = {}): Paragraph[] {
  const gapMs = opts.gapMs ?? 2000;
  const maxChars = opts.maxChars ?? 500;
  const sorted = segments
    .map((s) => ({ ...s, text: s.text.replace(/\s+/g, ' ').trim() }))
    .filter((s) => s.text)
    .sort((a, b) => a.startMs - b.startMs);
  const out: Paragraph[] = [];
  for (const s of sorted) {
    const last = out[out.length - 1];
    if (last && s.startMs - last.endMs < gapMs && last.text.length < maxChars) {
      last.text += ' ' + s.text;
      last.endMs = Math.max(last.endMs, s.endMs);
    } else {
      out.push({ startMs: s.startMs, endMs: s.endMs, text: s.text });
    }
  }
  return out;
}

export interface TranscriptNoteOptions {
  title?: string;
  recordedAt?: Date;
  durationMs?: number;
  /** Pre-computed summary (e.g. from the AI router). Rendered under "Summary" when present. */
  summary?: string;
  timestamps?: boolean;
  gapMs?: number;
}

/** Pure Markdown formatter. Output is deterministic (no clock reads). */
export function transcriptToMarkdown(segments: readonly TranscriptSegment[], opts: TranscriptNoteOptions = {}): string {
  const lines: string[] = [];
  lines.push(`# ${opts.title?.trim() || 'Audio note'}`);
  const meta: string[] = [];
  if (opts.recordedAt) meta.push(opts.recordedAt.toISOString());
  if (opts.durationMs !== undefined) meta.push(`duration ${formatTimestamp(opts.durationMs)}`);
  if (meta.length) lines.push('', `_${meta.join(' - ')}_`);
  if (opts.summary?.trim()) lines.push('', '## Summary', '', opts.summary.trim());
  const paras = segmentsToParagraphs(segments, { gapMs: opts.gapMs });
  lines.push('', '## Transcript', '');
  if (!paras.length) lines.push('_No speech was transcribed._');
  for (const p of paras) lines.push(opts.timestamps === false ? p.text : `**[${formatTimestamp(p.startMs)}]** ${p.text}`, '');
  return lines.join('\n').replace(/\n+$/, '\n');
}

/** Summary hook: the caller supplies the summariser (AI router); failures degrade to no summary. */
export type Summarizer = (plainText: string) => Promise<string>;

export async function buildTranscriptNote(
  segments: readonly TranscriptSegment[],
  opts: TranscriptNoteOptions & { summarize?: Summarizer } = {},
): Promise<string> {
  let summary = opts.summary;
  if (!summary && opts.summarize && segments.length) {
    try {
      summary = await opts.summarize(segmentsToParagraphs(segments).map((p) => p.text).join('\n\n'));
    } catch {
      summary = undefined;
    }
  }
  return transcriptToMarkdown(segments, { ...opts, summary });
}
