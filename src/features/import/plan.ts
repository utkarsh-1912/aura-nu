/** Pure import planning: classify chosen files per importer, then map ImportedNote -> Note + folders. */
import type { Note, Folder } from "../../types";
import type { ImportedNote } from "../../import/common";
import { makeNote, resolveFolderPath } from "../noteUtils";

export type ImportSource = "auto" | "markdown" | "notion" | "evernote" | "apple";
export type GroupKind = "markdown" | "notion" | "evernote" | "apple";
export interface PickedFile { path: string; size: number }
export interface FileGroup { kind: GroupKind; paths: string[] }

const extOf = (p: string) => (/\.([A-Za-z0-9]{1,8})$/.exec(p)?.[1] ?? "").toLowerCase();
/** Hard cap per file read into memory (the importers enforce their own, tighter limits too). */
export const MAX_FILE_BYTES = 200 * 1024 * 1024;

/**
 * Decides which importer handles which file. In "auto": .zip = Notion export, .enex = Evernote, .md/.markdown =
 * Markdown, .html/.htm/.txt = Apple Notes exports. Explicit sources only take the extensions they understand.
 */
export function classifyFiles(files: PickedFile[], source: ImportSource): { groups: FileGroup[]; skipped: { path: string; reason: string }[] } {
  const g: Record<GroupKind, string[]> = { markdown: [], notion: [], evernote: [], apple: [] };
  const skipped: { path: string; reason: string }[] = [];
  for (const f of files) {
    const ext = extOf(f.path);
    const hidden = f.path.split("/").some((s) => s.startsWith("."));
    if (hidden) { skipped.push({ path: f.path, reason: "hidden file" }); continue; }
    if (f.size > MAX_FILE_BYTES) { skipped.push({ path: f.path, reason: "file is larger than 200 MB" }); continue; }
    let kind: GroupKind | null = null;
    const md = ext === "md" || ext === "markdown";
    const apple = ext === "html" || ext === "htm" || ext === "txt";
    if (source === "auto") kind = ext === "zip" ? "notion" : ext === "enex" ? "evernote" : md ? "markdown" : apple ? "apple" : null;
    else if (source === "markdown") kind = md ? "markdown" : null;
    else if (source === "notion") kind = ext === "zip" ? "notion" : null;
    else if (source === "evernote") kind = ext === "enex" ? "evernote" : null;
    else if (source === "apple") kind = md || apple ? "apple" : null;
    if (!kind) { skipped.push({ path: f.path, reason: ext ? `.${ext} is not supported by this importer` : "unsupported file" }); continue; }
    g[kind].push(f.path);
  }
  const groups = (Object.keys(g) as GroupKind[]).filter((k) => g[k].length).map((k) => ({ kind: k, paths: g[k] }));
  return { groups, skipped };
}

export interface ImportPlan {
  notes: Note[];
  newFolders: Folder[];
  /** folder display path -> number of notes, for the preview */
  folderSummary: { path: string; count: number; isNew: boolean }[];
  warnings: string[];
}

export function planImport(
  imported: ImportedNote[],
  existingFolders: Folder[],
  workspaceId: string,
  newId: () => string,
  now: Date = new Date(),
): ImportPlan {
  const pool: Folder[] = [...existingFolders];
  const newFolders: Folder[] = [];
  const summary = new Map<string, { count: number; isNew: boolean }>();
  const warnings: string[] = [];
  const notes: Note[] = [];
  let attachments = 0;
  for (const im of imported) {
    const { folderId, created } = resolveFolderPath(im.folderPath, pool, workspaceId, newId);
    for (const f of created) { pool.push(f); newFolders.push(f); }
    const key = im.folderPath.filter(Boolean).join(" / ") || "General (default folder)";
    const prev = summary.get(key);
    summary.set(key, { count: (prev?.count ?? 0) + 1, isNew: (prev?.isNew ?? false) || created.length > 0 });
    notes.push(makeNote({
      id: newId(), workspaceId, title: im.title, content: im.markdown, folder: folderId,
      tags: [...new Set(im.tags)], createdAt: im.createdAt, updatedAt: im.updatedAt ?? im.createdAt,
    }, now));
    attachments += im.attachments.length;
    for (const w of im.warnings ?? []) if (warnings.length < 50) warnings.push(`${im.title}: ${w}`);
  }
  if (attachments > 0) warnings.unshift(`${attachments} attachment${attachments === 1 ? "" : "s"} were listed in the export but are not imported (only note text is).`);
  return {
    notes, newFolders, warnings,
    folderSummary: [...summary].map(([path, v]) => ({ path, ...v })).sort((a, b) => a.path.localeCompare(b.path)),
  };
}
