/**
 * The vault reconciler stores folders as DIRECTORY PATHS ("Projects/Alpha"); the app stores folder IDs.
 * These pure helpers translate around reconcile(). UNVERIFIED against a real vault (needs the Tauri shell).
 */
import type { Folder, Note } from "../../types";
import type { NoteInput } from "../../core/sync";
import { DEFAULT_FOLDER_ID, resolveFolderPath } from "../noteUtils";

export function folderIdToPath(folders: Folder[], id: string): string {
  const byId = new Map(folders.map((f) => [f.id, f]));
  const parts: string[] = [];
  let cur = byId.get(id);
  for (let guard = 0; cur && guard < 32; guard++) { parts.unshift(cur.name); cur = cur.parentId ? byId.get(cur.parentId) : undefined; }
  return parts.join("/");
}

export const toVaultNotes = (notes: Note[], folders: Folder[]): NoteInput[] =>
  notes.map((n) => ({ ...n, folder: folderIdToPath(folders, n.folder) }) as unknown as NoteInput);

export function fromVaultUpserts(
  upserts: NoteInput[], existing: Note[], folders: Folder[], workspaceId: string, newId: () => string,
): { notes: Note[]; newFolders: Folder[] } {
  const prev = new Map(existing.map((n) => [n.id, n]));
  const pool = [...folders];
  const newFolders: Folder[] = [];
  const notes = upserts.map((u) => {
    const old = prev.get(u.id);
    let folder: string;
    if (old && folderIdToPath(pool, old.folder) === (u.folder ?? "")) folder = old.folder; // unchanged directory: keep the id
    else if (!u.folder) folder = DEFAULT_FOLDER_ID;
    else {
      const r = resolveFolderPath(u.folder.split("/"), pool, workspaceId, newId);
      for (const f of r.created) { pool.push(f); newFolders.push(f); }
      folder = r.folderId;
    }
    return { ...(old ?? {}), ...u, workspaceId, folder } as Note;
  });
  return { notes, newFolders };
}

/** Apply removals + upserts to the FULL note list (other workspaces untouched). */
export function mergeReconcile(all: Note[], upserts: Note[], removals: string[]): Note[] {
  const gone = new Set(removals);
  const up = new Map(upserts.map((n) => [n.id, n]));
  const out = all.filter((n) => !gone.has(n.id)).map((n) => up.get(n.id) ?? n);
  const have = new Set(all.map((n) => n.id));
  for (const n of upserts) if (!have.has(n.id)) out.push(n);
  return out;
}

/** quickNote.onSaved payload -> note fields. createdAt arrives as epoch-millis string. */
export function quickNoteFromPayload(p: { text: string; createdAt: string }): { title: string; content: string; createdAt: string } | null {
  const text = (p.text ?? "").replace(/\r\n?/g, "\n").trim();
  if (!text) return null;
  const ms = Number(p.createdAt);
  const d = Number.isFinite(ms) && ms > 0 ? new Date(ms) : new Date(p.createdAt);
  const createdAt = isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
  const first = text.split("\n").find((l) => l.trim())!.replace(/^#+\s*/, "").trim().slice(0, 80);
  return { title: first || "Quick note", content: text, createdAt };
}
