/**
 * Notes binding over the app's localStorage backup (`aura-notes-backup-<email>`), used by Workflow Studio
 * which cannot reach WorkspacePage state. Reads are always fresh; writes bump updatedAt so the sync
 * controller picks them up when WorkspacePage next loads. Prefer the prop-based binding (see handoff).
 */
import type { NoteLike, ReminderLike, WorkspaceBinding } from "./workspaceApi";

type S = Pick<Storage, "getItem" | "setItem">;
export const notesKey = (e: string) => `aura-notes-backup-${e}`;
export const remindersKey = (e: string) => `aura-reminders-${e}`;
export const foldersKey = (e: string) => `aura-folders-backup-${e}`;

function readArr<T>(s: S, k: string): T[] {
  try { const v = JSON.parse(s.getItem(k) ?? "[]"); return Array.isArray(v) ? v : []; } catch { return []; }
}

export function readLocalNotes(s: S, email: string): NoteLike[] { return readArr<NoteLike>(s, notesKey(email)); }

export function localBinding(s: S, email: string, workspaceId?: string): Omit<WorkspaceBinding, "idempotency" | "flowId"> {
  return {
    workspaceId,
    getNotes: () => readLocalNotes(s, email),
    updateNotes: (next) => { s.setItem(notesKey(email), JSON.stringify(next)); },
    getReminders: () => readArr<ReminderLike>(s, remindersKey(email)),
    updateReminders: (next) => { s.setItem(remindersKey(email), JSON.stringify(next)); },
    ensureFolder: (name) => {
      const folders = readArr<any>(s, foldersKey(email));
      if (folders.some((f) => f?.name === name)) return;
      if (folders.length && typeof folders[0] === "object") s.setItem(foldersKey(email), JSON.stringify([...folders, { id: `folder_flow_${name}`, name, workspaceId }]));
    },
  };
}
