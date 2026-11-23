import { mergeNoteFields, NoteInput, SyncedNote } from "./sync";

/**
 * Client-side sync engine for the per-note v2 API. Pure state transitions plus an injected
 * transport, so it runs identically in the web app, the desktop app and tests.
 *
 * Model: every note has `base` (last version agreed with the server), `local` (current edit,
 * null = deleted locally), `rev` (server revision of base) and a `dirty` flag.
 *
 * Rules:
 *  - Edit vs edit      -> three-way field merge; true conflicts keep local and save the remote
 *                         version as a "conflict copy" so nothing is ever silently lost.
 *  - Edit vs delete    -> the edit wins (note is revived).
 *  - Delete vs edit    -> the remote edit wins (delete is dropped).
 */

/** Re-read this many seqs behind the cursor; covers out-of-order seq visibility on the Mongo store. */
export const OVERLAP = 20;
const MAX_PUSH_ATTEMPTS = 4;
const PAGE = 200;

export interface Entry {
  base: NoteInput | null;
  local: NoteInput | null;
  rev: number | null;
  dirty: boolean;
}
export interface SyncState {
  cursor: number;
  entries: Record<string, Entry>;
}
export type PutOutcome =
  | { status: "ok"; note: SyncedNote }
  | { status: "conflict"; current: SyncedNote | null }
  /** Permanent refusal (e.g. validation). Retrying the same payload can never succeed. */
  | { status: "rejected"; reason: string };
export interface Transport {
  changes(since: number, limit: number): Promise<{ notes: SyncedNote[]; cursor: number; hasMore: boolean }>;
  put(note: NoteInput, baseRev: number | null): Promise<PutOutcome>;
  remove(id: string, baseRev: number): Promise<PutOutcome>;
}
export interface SyncReport {
  state: SyncState;
  /** Remote versions preserved because both sides edited the same field. Add these as new notes. */
  conflictCopies: NoteInput[];
  pushed: number;
  pulled: number;
  /** Notes the server permanently refused; they stay local-only until edited again. */
  rejected: { id: string; reason: string }[];
}

export const emptyState = (): SyncState => ({ cursor: 0, entries: {} });

export function toInput(n: SyncedNote): NoteInput {
  const { rev: _r, seq: _s, deleted: _d, ...rest } = n;
  return rest as NoteInput;
}

export function editNote(state: SyncState, note: NoteInput): SyncState {
  const prev = state.entries[note.id];
  return {
    ...state,
    entries: { ...state.entries, [note.id]: { base: prev?.base ?? null, rev: prev?.rev ?? null, local: note, dirty: true } },
  };
}

export function deleteNote(state: SyncState, id: string): SyncState {
  const prev = state.entries[id];
  if (!prev) return state;
  if (prev.rev === null) {
    const { [id]: _gone, ...rest } = state.entries; // never reached the server
    return { ...state, entries: rest };
  }
  return { ...state, entries: { ...state.entries, [id]: { ...prev, local: null, dirty: true } } };
}

export function visibleNotes(state: SyncState): NoteInput[] {
  return Object.values(state.entries).map((e) => e.local).filter((n): n is NoteInput => !!n);
}

const adopt = (n: SyncedNote): Entry => {
  const input = toInput(n);
  return { base: input, local: input, rev: n.rev, dirty: false };
};

/** One full cycle: push local changes, then pull remote ones. Network errors propagate; entries stay dirty. */
export async function syncOnce(initial: SyncState, t: Transport): Promise<SyncReport> {
  const entries: Record<string, Entry> = { ...initial.entries };
  const conflictCopies: NoteInput[] = [];
  let pushed = 0;
  let pulled = 0;
  const rejected: { id: string; reason: string }[] = [];

  // ---- push ----
  for (const id of Object.keys(entries)) {
    for (let attempt = 0; entries[id]?.dirty && attempt < MAX_PUSH_ATTEMPTS; attempt++) {
      const e = entries[id];
      const res = e.local ? await t.put(e.local, e.rev) : await t.remove(id, e.rev as number);
      if (res.status === "ok") {
        if (res.note.deleted) delete entries[id];
        else entries[id] = adopt(res.note);
        pushed++;
        break;
      }

      if (res.status === "rejected") {
        entries[id] = { ...e, dirty: false };
        rejected.push({ id, reason: res.reason });
        break;
      }

      const cur = res.current;
      if (!cur) {
        // Server has no such note (e.g. wiped). A local edit recreates it; a local delete is moot.
        if (e.local) entries[id] = { ...e, rev: null };
        else delete entries[id];
        continue;
      }
      if (!e.local) {
        // Delete vs remote change: remote wins unless it is already deleted.
        if (cur.deleted) delete entries[id];
        else entries[id] = adopt(cur);
        break;
      }
      if (cur.deleted) {
        entries[id] = { ...e, rev: cur.rev, base: null }; // edit beats delete: revive on next attempt
        continue;
      }
      const remote = toInput(cur);
      const m = mergeNoteFields(e.base, e.local, remote);
      if (m.conflicts.length > 0) {
        conflictCopies.push({
          ...remote,
          id: `${id}-conflict-${cur.rev}`,
          title: `${remote.title} (conflict copy)`,
        });
      }
      if (m.alreadyApplied) {
        entries[id] = adopt(cur);
        break;
      }
      entries[id] = { base: remote, local: m.merged, rev: cur.rev, dirty: true };
    }
  }

  // ---- pull ----
  let cursor = initial.cursor;
  let since = Math.max(0, cursor - OVERLAP);
  for (;;) {
    const page = await t.changes(since, PAGE);
    for (const n of page.notes) {
      const e = entries[n.id];
      if (e && e.rev !== null && n.rev <= e.rev) continue; // already have it
      if (e?.dirty) continue; // local edits that failed to push keep priority; they merge on next push
      if (n.deleted) delete entries[n.id];
      else {
        entries[n.id] = adopt(n);
        pulled++;
      }
    }
    cursor = Math.max(cursor, page.cursor);
    if (!page.hasMore) break;
    since = page.cursor;
  }

  return { state: { cursor, entries }, conflictCopies, pushed, pulled, rejected };
}
