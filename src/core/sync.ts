/**
 * Pure, framework-free sync primitives shared by the server and every client.
 * (Seed of the future `@aura/core` package: keep this file free of React/DOM/Node APIs.)
 */

export const NOTE_STATUSES = ["Draft", "In Review", "Published", "Archived"] as const;

export const LIMITS = {
  id: 128,
  title: 500,
  content: 2_000_000,
  tags: 100,
  tagLength: 64,
  versionHistory: 50,
  folder: 200,
} as const;

/** Client-editable note fields. Server-managed fields (rev, seq, deleted) are not in here. */
export interface NoteInput {
  id: string;
  workspaceId: string;
  departmentId?: string;
  projectId?: string;
  title: string;
  content: string;
  tags: string[];
  isPinned: boolean;
  isShared: boolean;
  isFavorite: boolean;
  folder: string;
  createdAt: string;
  updatedAt: string;
  wordCount: number;
  readingTime: number;
  isArchived?: boolean;
  isTrashed?: boolean;
  isLocked?: boolean;
  status?: (typeof NOTE_STATUSES)[number];
  versionHistory?: { timestamp: string; content: string }[];
}

/** A note as stored/served by the sync API. */
export type SyncedNote = Partial<NoteInput> & {
  id: string;
  /** Per-note revision, +1 on every accepted write. 0 never exists on the server. */
  rev: number;
  /** Per-user monotonically increasing change cursor. */
  seq: number;
  /** Tombstone: content is dropped, id is kept so deletes propagate. */
  deleted: boolean;
};

export type Validation<T> = { ok: true; value: T } | { ok: false; error: string };

const ID_RE = /^[A-Za-z0-9._:-]+$/;
const isStr = (v: unknown): v is string => typeof v === "string";
const isBool = (v: unknown): v is boolean => typeof v === "boolean";
const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

export function isValidNoteId(id: unknown): id is string {
  return isStr(id) && id.length > 0 && id.length <= LIMITS.id && ID_RE.test(id);
}

/** Whitelists, type-checks and size-limits an untrusted note payload. Unknown keys are dropped. */
export function validateNoteInput(raw: unknown): Validation<NoteInput> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { ok: false, error: "note must be an object" };
  const r = raw as Record<string, unknown>;

  if (!isValidNoteId(r.id)) return { ok: false, error: "invalid id" };
  if (!isStr(r.workspaceId) || !r.workspaceId || r.workspaceId.length > LIMITS.id) return { ok: false, error: "invalid workspaceId" };
  if (!isStr(r.title) || r.title.length > LIMITS.title) return { ok: false, error: "invalid title" };
  if (!isStr(r.content) || r.content.length > LIMITS.content) return { ok: false, error: "invalid content" };
  if (!Array.isArray(r.tags) || r.tags.length > LIMITS.tags || !r.tags.every((t) => isStr(t) && t.length <= LIMITS.tagLength)) {
    return { ok: false, error: "invalid tags" };
  }
  for (const k of ["isPinned", "isShared", "isFavorite"] as const) {
    if (!isBool(r[k])) return { ok: false, error: `invalid ${k}` };
  }
  if (!isStr(r.folder) || r.folder.length > LIMITS.folder) return { ok: false, error: "invalid folder" };
  if (!isStr(r.createdAt) || !isStr(r.updatedAt)) return { ok: false, error: "invalid timestamps" };
  if (!isNum(r.wordCount) || !isNum(r.readingTime)) return { ok: false, error: "invalid counters" };

  for (const k of ["departmentId", "projectId"] as const) {
    if (r[k] !== undefined && (!isStr(r[k]) || (r[k] as string).length > LIMITS.id)) return { ok: false, error: `invalid ${k}` };
  }
  for (const k of ["isArchived", "isTrashed", "isLocked"] as const) {
    if (r[k] !== undefined && !isBool(r[k])) return { ok: false, error: `invalid ${k}` };
  }
  if (r.status !== undefined && !(NOTE_STATUSES as readonly unknown[]).includes(r.status)) return { ok: false, error: "invalid status" };

  let versionHistory: NoteInput["versionHistory"];
  if (r.versionHistory !== undefined) {
    if (!Array.isArray(r.versionHistory)) return { ok: false, error: "invalid versionHistory" };
    versionHistory = [];
    for (const v of r.versionHistory.slice(-LIMITS.versionHistory)) {
      const vv = v as Record<string, unknown>;
      if (!vv || !isStr(vv.timestamp) || !isStr(vv.content) || vv.content.length > LIMITS.content) {
        return { ok: false, error: "invalid versionHistory entry" };
      }
      versionHistory.push({ timestamp: vv.timestamp, content: vv.content });
    }
  }

  const note: NoteInput = {
    id: r.id,
    workspaceId: r.workspaceId,
    title: r.title,
    content: r.content,
    tags: r.tags as string[],
    isPinned: r.isPinned as boolean,
    isShared: r.isShared as boolean,
    isFavorite: r.isFavorite as boolean,
    folder: r.folder,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
    wordCount: r.wordCount as number,
    readingTime: r.readingTime as number,
  };
  if (r.departmentId !== undefined) note.departmentId = r.departmentId as string;
  if (r.projectId !== undefined) note.projectId = r.projectId as string;
  if (r.isArchived !== undefined) note.isArchived = r.isArchived as boolean;
  if (r.isTrashed !== undefined) note.isTrashed = r.isTrashed as boolean;
  if (r.isLocked !== undefined) note.isLocked = r.isLocked as boolean;
  if (r.status !== undefined) note.status = r.status as NoteInput["status"];
  if (versionHistory) note.versionHistory = versionHistory;
  return { ok: true, value: note };
}

/**
 * Guard for the legacy "replace everything" endpoint: refuses payloads that would delete
 * every stored note, or more than half of them (beyond a small allowance).
 */
export function isDestructiveSync(existingIds: readonly string[], incomingIds: readonly string[]): boolean {
  if (existingIds.length === 0) return false;
  const incoming = new Set(incomingIds);
  const removed = existingIds.filter((id) => !incoming.has(id)).length;
  if (removed === 0) return false;
  if (incoming.size === 0) return true;
  return removed > Math.max(5, Math.floor(existingIds.length / 2));
}

export interface MergeResult {
  /** Remote version with the non-conflicting local edits applied; local wins on true conflicts. */
  merged: NoteInput;
  /** Fields where both sides changed to different values. */
  conflicts: string[];
  /** True when merged equals remote, i.e. nothing is left to push. */
  alreadyApplied: boolean;
}

const eq = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/**
 * Three-way, field-level merge used after a 409. `base` is the last version this client
 * synced, `local` its current edit, `remote` the server's current version.
 * Text bodies are NOT merged character-wise here (Phase 2 moves bodies to Yjs); a body
 * edited on both sides is reported as a conflict so the caller can keep a conflict copy.
 */
export function mergeNoteFields(base: NoteInput | null, local: NoteInput, remote: NoteInput): MergeResult {
  const merged: Record<string, unknown> = { ...remote };
  const conflicts: string[] = [];
  const keys = new Set<string>([...Object.keys(local), ...Object.keys(remote), ...Object.keys(base ?? {})]);
  keys.delete("id");

  for (const k of keys) {
    const b = base ? (base as any)[k] : undefined;
    const l = (local as any)[k];
    const r = (remote as any)[k];
    if (eq(l, r)) continue;
    if (base && eq(l, b)) continue; // only remote changed: keep remote (already in merged)
    if (base && eq(r, b)) {
      merged[k] = l; // only local changed
      continue;
    }
    if (k === "updatedAt") {
      merged[k] = [l, r].sort().pop();
      continue;
    }
    if (k === "wordCount" || k === "readingTime") {
      merged[k] = l; // derived values follow whichever body wins
      continue;
    }
    if (k === "tags" && Array.isArray(l) && Array.isArray(r)) {
      merged[k] = Array.from(new Set([...(r as string[]), ...(l as string[])]));
      continue;
    }
    merged[k] = l;
    conflicts.push(k);
  }
  const mergedNote = merged as unknown as NoteInput;
  return { merged: mergedNote, conflicts, alreadyApplied: eq(mergedNote, remote) };
}
