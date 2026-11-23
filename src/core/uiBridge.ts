import { LIMITS, NOTE_STATUSES, NoteInput } from "./sync";
import { deleteNote, editNote, Entry, SyncState } from "./syncEngine";

/**
 * Bridges the React app's `notes` array to the sync engine. Pure functions only.
 * The UI stays the source of truth for what the user sees; the engine learns about
 * changes by diffing, so every existing mutation site is covered without touching it.
 */

const EPOCH = "1970-01-01T00:00:00.000Z"; // stable fallback: defaults must be deterministic or diffs never settle
const str = (v: unknown): string | undefined => (typeof v === "string" ? v : undefined);

/** Stable stringify (sorted keys) so key order never causes phantom edits. */
export function canon(v: unknown): string {
  return JSON.stringify(v, (_k, val) =>
    val && typeof val === "object" && !Array.isArray(val)
      ? Object.fromEntries(Object.entries(val).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
      : val,
  );
}

/** Normalises any note-shaped object (including legacy/Mongo extras) into a valid, deterministic NoteInput. */
export function toSyncInput(raw: any): NoteInput {
  const content = str(raw?.content) ?? "";
  const words = content.trim() ? content.trim().split(/\s+/).length : 0;
  const fin = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : undefined);

  const out: NoteInput = {
    id: String(raw?.id ?? ""),
    workspaceId: (str(raw?.workspaceId) || "ws-aura-core").slice(0, LIMITS.id),
    title: (str(raw?.title) ?? "").slice(0, LIMITS.title),
    content,
    tags: Array.isArray(raw?.tags)
      ? raw.tags.filter((t: unknown): t is string => typeof t === "string").slice(0, LIMITS.tags).map((t: string) => t.slice(0, LIMITS.tagLength))
      : [],
    isPinned: !!raw?.isPinned,
    isShared: !!raw?.isShared,
    isFavorite: !!raw?.isFavorite,
    folder: (str(raw?.folder) || "f-general").slice(0, LIMITS.folder),
    createdAt: str(raw?.createdAt) || str(raw?.updatedAt) || EPOCH,
    updatedAt: str(raw?.updatedAt) || EPOCH,
    wordCount: fin(raw?.wordCount) ?? words,
    readingTime: fin(raw?.readingTime) ?? Math.max(1, Math.ceil(words / 200)),
  };
  const dep = str(raw?.departmentId);
  if (dep) out.departmentId = dep.slice(0, LIMITS.id);
  const proj = str(raw?.projectId);
  if (proj) out.projectId = proj.slice(0, LIMITS.id);
  for (const k of ["isArchived", "isTrashed", "isLocked"] as const) {
    if (typeof raw?.[k] === "boolean") out[k] = raw[k];
  }
  if ((NOTE_STATUSES as readonly unknown[]).includes(raw?.status)) out.status = raw.status;
  if (Array.isArray(raw?.versionHistory)) {
    out.versionHistory = raw.versionHistory
      .filter((v: any) => v && typeof v.timestamp === "string" && typeof v.content === "string")
      .slice(-LIMITS.versionHistory)
      .map((v: any) => ({ timestamp: v.timestamp, content: v.content }));
  }
  return out;
}

/** Last UI object seen per note id: reference equality lets the diff skip untouched notes cheaply. */
export type SeenMap = Map<string, unknown>;

/** Feeds UI changes (edits, creations, removals) into the engine state. */
export function applyUiChanges(state: SyncState, ui: readonly { id: string }[], seen: SeenMap): SyncState {
  let next = state;
  const uiIds = new Set<string>();
  for (const note of ui) {
    uiIds.add(note.id);
    if (seen.get(note.id) === note && next.entries[note.id]) continue; // same object as last time
    seen.set(note.id, note);
    const input = toSyncInput(note);
    const e = next.entries[note.id];
    if (e?.local && canon(e.local) === canon(input)) continue; // content-identical
    if (e && e.local === null && e.dirty === false) continue;
    next = editNote(next, input);
  }
  for (const [id, e] of Object.entries(next.entries)) {
    if (e.local && !uiIds.has(id)) {
      next = deleteNote(next, id);
      seen.delete(id);
    }
  }
  return next;
}

/**
 * After an async sync, folds the engine result back into the live UI list without clobbering
 * anything the user did while the request was in flight.
 *  - note unchanged since `snapshot`  -> take the engine's (merged/remote) version
 *  - note edited meanwhile            -> keep the UI version (it becomes the next edit)
 *  - note gone remotely               -> drop it only if the user did not touch it meanwhile
 *  - note new from remote / conflict copy -> add it
 */
export function mergeIntoUi<T extends { id: string }>(
  current: readonly T[],
  snapshot: readonly T[],
  entries: Record<string, Entry>,
): T[] {
  const snapById = new Map(snapshot.map((n) => [n.id, n]));
  const out: T[] = [];
  const present = new Set<string>();

  for (const u of current) {
    present.add(u.id);
    const snap = snapById.get(u.id);
    const e = entries[u.id];
    const untouched = snap !== undefined && (snap === u || canon(snap) === canon(u));
    if (!e) {
      if (snap !== undefined && untouched) continue; // deleted remotely, user did not touch it
      out.push(u);
      continue;
    }
    if (untouched && e.local && canon(toSyncInput(u)) !== canon(e.local)) out.push({ ...e.local } as unknown as T);
    else out.push(u);
  }
  for (const [id, e] of Object.entries(entries)) {
    if (present.has(id) || !e.local) continue;
    if (snapById.has(id)) continue; // user removed it during the sync; the next diff will delete it
    out.push(e.local as unknown as T); // new from another device, or a conflict copy
  }
  return out;
}

/** One-time import of notes that only exist in the legacy store. Newest `updatedAt` wins; idempotent. */
export function unionLegacy<T extends { id: string; updatedAt?: string }>(current: readonly T[], legacy: readonly any[]): T[] {
  const byId = new Map(current.map((n) => [n.id, n]));
  let changed = false;
  for (const raw of legacy) {
    if (!raw || typeof raw.id !== "string") continue;
    const have = byId.get(raw.id);
    if (!have || (str(raw.updatedAt) ?? "") > (have.updatedAt ?? "")) {
      const { _id, __v, userEmail, ...rest } = raw;
      byId.set(raw.id, rest as T);
      changed = true;
    }
  }
  return changed ? Array.from(byId.values()) : (current as T[]);
}

/**
 * Startup guard against stale UI caches. The engine state (IndexedDB) can be newer than the UI's
 * localStorage copy (e.g. the tab closed right after a sync pulled remote edits). Without this,
 * the stale UI copy would be mistaken for a fresh local edit and pushed over the newer version.
 * A UI note counts as stale only when its `updatedAt` is strictly older than the engine's copy.
 */
export function adoptNewerEntries<T extends { id: string; updatedAt?: string }>(
  ui: readonly T[],
  entries: Record<string, Entry>,
): { list: T[]; replaced: Map<string, { old: T; next: T }> } {
  const replaced = new Map<string, { old: T; next: T }>();
  const list = ui.map((n) => {
    const e = entries[n.id];
    if (!e?.local) return n;
    if ((n.updatedAt ?? "") >= (e.local.updatedAt ?? "")) return n;
    if (canon(toSyncInput(n)) === canon(e.local)) return n;
    const next = { ...e.local } as unknown as T;
    replaced.set(n.id, { old: n, next });
    return next;
  });
  return { list: replaced.size ? list : (ui as T[]), replaced };
}
