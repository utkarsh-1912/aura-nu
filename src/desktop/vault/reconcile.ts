import type { NoteInput } from "../../core/sync";
import type { Hasher } from "./hash";
import { emptyIndex, type IndexEntry, type VaultIndex } from "./index";
import { markdownToNote, noteToMarkdown } from "./markdown";
import {
  allocatePath, dirname, folderToDir, INTERNAL_DIR, isInternal, matchesStem, pathKey, stemOf,
} from "./paths";
import type { VaultFs, VaultStat } from "./vaultFs";

/**
 * Three-way reconciler: app note list  <->  vault files, with the index as the common ancestor.
 *
 * Per note id, each side is `same` | `edited` | `deleted` relative to index.hash:
 *   app edited+file same   -> write file (rename if title/folder changed)
 *   app same+file edited   -> import file (external edit)
 *   both edited, differ    -> CONFLICT: file version wins the note id; app version is kept as a new note
 *                             saved at "<name> (conflict <date>).md". Nothing is dropped.
 *   edited vs deleted      -> the edit always wins (file recreated / note re-imported)
 *   deleted vs same        -> deletion propagates (files go to .aura/trash/, never hard-deleted)
 * New files (no/duplicate id) get an id assigned and the id written back into the file.
 *
 * Contract: caller applies `upserts`/`removals` to its note store and persists `index`. Running
 * reconcile again on the result performs no writes (idempotent).
 *
 * Limits: versionHistory is app-only (not stored in files); a note missing from `notes` is
 * interpreted as deleted, so never call with a partially-loaded list.
 */
export interface ReconcileOptions {
  fs: VaultFs;
  hasher: Hasher;
  notes: NoteInput[];
  index: VaultIndex | null;
  workspaceId: string;
  newId: () => string;
  /** ISO timestamp generator. */
  now: () => string;
}

export type ReconcileEvent =
  | { kind: "wrote"; id: string; path: string }
  | { kind: "renamed"; id: string; from: string; to: string }
  | { kind: "imported"; id: string; path: string }
  | { kind: "created-id"; id: string; path: string }
  | { kind: "conflict"; id: string; path: string; conflictId: string }
  | { kind: "trashed-file"; id: string; path: string; to: string }
  | { kind: "removed-note"; id: string }
  | { kind: "resurrected"; id: string; path: string }
  | { kind: "external-move"; id: string; from: string; to: string };

export interface ReconcileResult {
  index: VaultIndex;
  upserts: NoteInput[];
  removals: string[];
  events: ReconcileEvent[];
}

interface FileInfo { path: string; text: string; hash: string; stat: VaultStat; id?: string; }

export async function reconcile(o: ReconcileOptions): Promise<ReconcileResult> {
  const { fs, hasher } = o;
  const prev = o.index ?? emptyIndex();
  const nextIdx: VaultIndex = { version: 1, notes: {} };
  const events: ReconcileEvent[] = [];
  const upserts = new Map<string, NoteInput>();
  const removals: string[] = [];

  // ---- scan vault
  const stats = (await fs.list("")).filter((e) => !e.isDir && /\.md$/i.test(e.path) && !isInternal(e.path)).sort((a, b) => (a.path < b.path ? -1 : 1));
  const files = new Map<string, FileInfo>(); // by path
  for (const st of stats) {
    const text = await fs.readText(st.path);
    const parsed = markdownToNote(text, { workspaceId: o.workspaceId, id: "", fileStem: stemOf(st.path), mtimeIso: new Date(st.mtimeMs).toISOString() });
    files.set(st.path, { path: st.path, text, hash: await hasher(text), stat: st, id: parsed.hadId ? parsed.note.id : undefined });
  }
  const taken = new Set<string>(stats.map((s) => pathKey(s.path)));

  // ---- resolve file owner per id (index path wins, else first by path); the rest are "orphans" needing a new id
  const fileById = new Map<string, FileInfo>();
  const orphans: FileInfo[] = [];
  for (const f of files.values()) {
    if (!f.id) { orphans.push(f); continue; }
    const cur = fileById.get(f.id);
    if (!cur) { fileById.set(f.id, f); continue; }
    const indexed = prev.notes[f.id]?.path;
    if (indexed && pathKey(indexed) === pathKey(f.path)) { orphans.push(cur); fileById.set(f.id, f); } else orphans.push(f);
  }
  const notesById = new Map(o.notes.map((n) => [n.id, n]));

  const setEntry = async (note: NoteInput, path: string, text: string, extra?: IndexEntry["extra"]) => {
    nextIdx.notes[note.id] = { path, hash: await hasher(text), updatedAt: note.updatedAt, ...(extra && Object.keys(extra).length ? { extra } : {}) };
  };

  /** Desired path for a note, keeping the current one when still valid. */
  const desiredPath = (note: NoteInput, current?: string): string => {
    const dir = folderToDir(note.folder);
    if (current && matchesStem(current, dir, note.title)) return current;
    const t = new Set(taken);
    if (current) t.delete(pathKey(current));
    return allocatePath(dir, note.title, t);
  };

  const writeNote = async (note: NoteInput, entry: IndexEntry | undefined, currentPath: string | undefined, ev: "wrote" | "resurrected" = "wrote") => {
    const text = noteToMarkdown(note, entry?.extra);
    const target = desiredPath(note, currentPath);
    if (currentPath && pathKey(currentPath) !== pathKey(target)) {
      taken.delete(pathKey(currentPath));
      taken.add(pathKey(target));
      await fs.rename(currentPath, target);
      events.push({ kind: "renamed", id: note.id, from: currentPath, to: target });
    } else if (currentPath && currentPath !== target) {
      await fs.rename(currentPath, target); // case-only rename
    } else taken.add(pathKey(target));
    const existing = files.get(target);
    if (!existing || existing.text !== text || (currentPath && currentPath !== target)) await fs.writeText(target, text);
    events.push({ kind: ev, id: note.id, path: target });
    await setEntry(note, target, text, entry?.extra);
  };

  const importFile = async (f: FileInfo, id: string, base: NoteInput | undefined, entry: IndexEntry | undefined, ev: "imported" | "created-id" | "resurrected") => {
    const parsed = markdownToNote(f.text, {
      workspaceId: o.workspaceId, id, fileStem: stemOf(f.path), mtimeIso: new Date(f.stat.mtimeMs).toISOString(), base,
    });
    const note = parsed.note;
    note.id = id;
    // The directory is authoritative for the folder (moving a file == moving the note).
    note.folder = dirname(f.path);
    // Edited body but stale/unchanged frontmatter timestamp => use the file mtime.
    if (entry && note.updatedAt <= entry.updatedAt) note.updatedAt = new Date(f.stat.mtimeMs).toISOString();
    if (note.updatedAt < note.createdAt) note.createdAt = note.updatedAt;
    const text = noteToMarkdown(note, parsed.extra);
    if (text !== f.text) await fs.writeText(f.path, text); // normalize so a re-run is a no-op
    upserts.set(id, note);
    events.push({ kind: ev, id, path: f.path });
    await setEntry(note, f.path, text, parsed.extra);
  };

  const trashFile = async (id: string, f: FileInfo) => {
    const to = allocatePath(`${INTERNAL_DIR}/trash`, `${stemOf(f.path)}-${id}`, taken);
    await fs.rename(f.path, to);
    taken.delete(pathKey(f.path));
    taken.add(pathKey(to));
    events.push({ kind: "trashed-file", id, path: f.path, to });
  };

  // ---- 1) orphans: files with no usable / duplicate id get a fresh id written back
  for (const f of orphans) {
    const id = o.newId();
    const parsed = markdownToNote(f.text, { workspaceId: o.workspaceId, id, fileStem: stemOf(f.path), mtimeIso: new Date(f.stat.mtimeMs).toISOString() });
    parsed.note.id = id;
    parsed.note.folder = dirname(f.path);
    const text = noteToMarkdown(parsed.note, parsed.extra);
    await fs.writeText(f.path, text);
    upserts.set(id, parsed.note);
    events.push({ kind: "created-id", id, path: f.path });
    await setEntry(parsed.note, f.path, text, parsed.extra);
  }

  // ---- 2) known/unknown ids, deterministic order
  const ids = [...new Set([...notesById.keys(), ...Object.keys(prev.notes), ...fileById.keys()])].sort();
  for (const id of ids) {
    const app = notesById.get(id);
    const entry = prev.notes[id];
    const file = fileById.get(id);

    if (entry && file && pathKey(file.path) !== pathKey(entry.path)) {
      events.push({ kind: "external-move", id, from: entry.path, to: file.path });
    }

    if (!entry) {
      if (app && file) {
        const appText = noteToMarkdown(app);
        if (appText === file.text) { await setEntry(app, file.path, file.text); continue; }
        await conflict(id, app, file);
      } else if (app) await writeNote(app, undefined, undefined);
      else if (file) await importFile(file, id, undefined, undefined, "imported");
      continue;
    }

    const appText = app ? noteToMarkdown(app, entry.extra) : null;
    const appState = !app ? "deleted" : (await hasher(appText!)) === entry.hash ? "same" : "edited";
    // A file moved to another directory counts as an edit (the directory is the note's folder).
    const moved = !!file && dirname(file.path) !== dirname(entry.path);
    const fileState = !file ? "deleted" : file.hash === entry.hash && !moved ? "same" : "edited";

    if (appState === "deleted" && fileState === "deleted") continue; // entry dropped
    if (appState === "same" && fileState === "same") {
      await setEntry(app!, file!.path, file!.text, entry.extra);
      continue;
    }
    if (appState === "edited" && fileState === "same") { await writeNote(app!, entry, file!.path); continue; }
    if (appState === "same" && fileState === "edited") { await importFile(file!, id, app, entry, "imported"); continue; }
    if (appState === "edited" && fileState === "edited") {
      if (appText === file!.text) await setEntry(app!, file!.path, file!.text, entry.extra);
      else await conflict(id, app!, file!, entry);
      continue;
    }
    if (appState === "edited" && fileState === "deleted") { await writeNote(app!, entry, undefined, "resurrected"); continue; }
    if (appState === "deleted" && fileState === "edited") { await importFile(file!, id, undefined, entry, "resurrected"); continue; }
    if (appState === "deleted" && fileState === "same") { await trashFile(id, file!); continue; }
    if (appState === "same" && fileState === "deleted") { removals.push(id); events.push({ kind: "removed-note", id }); continue; }
  }

  /** Both sides changed differently: file wins the id, app version is preserved as a new conflict note. */
  async function conflict(id: string, app: NoteInput, file: FileInfo, entry?: IndexEntry) {
    const date = o.now().slice(0, 10);
    const cid = o.newId();
    const dir = folderToDir(app.folder);
    const cpath = allocatePath(dir, `${stemOf(file.path)} (conflict ${date})`, taken);
    const cnote: NoteInput = { ...app, id: cid, title: `${app.title} (conflict ${date})`, isPinned: false };
    const ctext = noteToMarkdown(cnote, entry?.extra);
    await fs.writeText(cpath, ctext);
    taken.add(pathKey(cpath));
    upserts.set(cid, cnote);
    await setEntry(cnote, cpath, ctext, entry?.extra);
    events.push({ kind: "conflict", id, path: cpath, conflictId: cid });
    await importFile(file, id, app, entry, "imported");
  }

  return { index: nextIdx, upserts: [...upserts.values()], removals, events };
}

/** Apply a ReconcileResult to a note array (helper for callers/tests). */
export function applyReconcile(notes: NoteInput[], r: ReconcileResult): NoteInput[] {
  const gone = new Set(r.removals);
  const up = new Map(r.upserts.map((n) => [n.id, n]));
  const out = notes.filter((n) => !gone.has(n.id)).map((n) => up.get(n.id) ?? n);
  for (const n of r.upserts) if (!notes.some((x) => x.id === n.id)) out.push(n);
  return out;
}
