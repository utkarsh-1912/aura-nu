/** Pure helpers for building/updating Note objects through the same shape the legacy editor produces. */
import type { Note, Folder } from "../types";

export const countWords = (content: string): number => (content ? content.trim().split(/\s+/).filter(Boolean).length : 0);
export const readingTimeOf = (words: number): number => Math.max(1, Math.ceil(words / 200));

/** Mirrors EditorArea.handleContentChange: same version-history rule, same updatedAt + counters. */
export function applyContentChange(note: Note, content: string, now: Date = new Date()): Note {
  const history = note.versionHistory || [];
  const last = history[0];
  let nextHistory = [...history];
  if (!last || Math.abs(last.content.length - content.length) > 25) {
    nextHistory = [{ timestamp: now.toISOString(), content: note.content }, ...history.slice(0, 4)];
  }
  const words = countWords(content);
  return { ...note, content, versionHistory: nextHistory, wordCount: words, readingTime: readingTimeOf(words), updatedAt: now.toISOString() };
}

export interface NewNoteInit {
  id: string;
  workspaceId: string;
  title: string;
  content: string;
  folder: string;
  tags?: string[];
  createdAt?: string;
  updatedAt?: string;
}

export function makeNote(init: NewNoteInit, now: Date = new Date()): Note {
  const words = countWords(init.content);
  const iso = now.toISOString();
  return {
    id: init.id,
    workspaceId: init.workspaceId,
    title: init.title,
    content: init.content,
    tags: init.tags ?? [],
    isPinned: false,
    isShared: false,
    isFavorite: false,
    folder: init.folder,
    createdAt: init.createdAt ?? iso,
    updatedAt: init.updatedAt ?? iso,
    wordCount: words,
    readingTime: readingTimeOf(words),
    versionHistory: [],
  };
}

export const DEFAULT_FOLDER_ID = "f-general";

/** Find a folder by (case-insensitive) name path under a parent, or describe the one to create. */
export function resolveFolderPath(
  path: string[],
  existing: Folder[],
  workspaceId: string,
  newId: () => string,
): { folderId: string; created: Folder[] } {
  let parentId: string | undefined;
  const created: Folder[] = [];
  const pool = [...existing];
  for (const raw of path) {
    const name = raw.trim();
    if (!name) continue;
    const found = pool.find((f) => f.workspaceId === workspaceId && (f.parentId ?? undefined) === parentId && f.name.toLowerCase() === name.toLowerCase());
    if (found) { parentId = found.id; continue; }
    const f: Folder = { id: newId(), workspaceId, name, parentId, isExpanded: true };
    pool.push(f);
    created.push(f);
    parentId = f.id;
  }
  return { folderId: parentId ?? DEFAULT_FOLDER_ID, created };
}
