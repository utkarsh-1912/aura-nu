/**
 * WorkspaceApi over the app's real notes. The host supplies getNotes/updateNotes (the same path the
 * UI uses, so sync picks the changes up). Writes dedupe on the idempotency key; the key ledger is
 * persisted so a crash-resumed step never writes twice. Ids derived from the key add a second guard.
 */
import type { DlpFinding, NoteRef, WorkspaceApi } from "../../flow/types";
import { dlpScan } from "../../flow/tools";

export interface NoteLike {
  id: string;
  title: string;
  content: string;
  tags: string[];
  folder: string;
  updatedAt?: string;
  isTrashed?: boolean;
  isArchived?: boolean;
  [k: string]: any;
}
export interface ReminderLike { id: string; workspaceId?: string; text: string; date: string; completed: boolean; noteId?: string }

export interface IdempotencyStore {
  get(key: string): unknown | undefined;
  set(key: string, value: unknown): void;
}

export class MemoryIdempotencyStore implements IdempotencyStore {
  protected m = new Map<string, unknown>();
  get(k: string) { return this.m.get(k); }
  set(k: string, v: unknown) { this.m.set(k, v); }
}

/** Persisted ledger (FIFO capped). */
export class StorageIdempotencyStore extends MemoryIdempotencyStore {
  constructor(private storage: Pick<Storage, "getItem" | "setItem">, private storageKey: string, private cap = 2000) {
    super();
    try {
      const raw = storage.getItem(storageKey);
      if (raw) for (const [k, v] of JSON.parse(raw) as [string, unknown][]) this.m.set(k, v);
    } catch { /* corrupt: start empty */ }
  }
  set(k: string, v: unknown) {
    super.set(k, v);
    while (this.m.size > this.cap) this.m.delete(this.m.keys().next().value as string);
    try { this.storage.setItem(this.storageKey, JSON.stringify([...this.m])); } catch { /* quota */ }
  }
}

export interface WriteEvent { op: "create" | "update" | "tag" | "move" | "reminder"; noteId?: string; key: string; flowId?: string }

export interface WorkspaceBinding<N extends NoteLike = NoteLike> {
  getNotes(): N[];
  updateNotes(next: N[]): void;
  getReminders?(): ReminderLike[];
  updateReminders?(next: ReminderLike[]): void;
  workspaceId?: string;
  /** Make sure a folder exists (host persists the folder list). */
  ensureFolder?(name: string): void;
  idempotency: IdempotencyStore;
  /** Called after every real write (trigger runtime uses it for loop protection). */
  onWrite?: (e: WriteEvent) => void;
  flowId?: string;
  now?: () => string;
}

const hash = (s: string) => { let h = 5381; for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0; return (h >>> 0).toString(36); };
const words = (c: string) => (c.trim() ? c.trim().split(/\s+/).length : 0);

export const toNoteRef = (n: NoteLike): NoteRef => ({ id: n.id, title: n.title, content: n.content, tags: [...(n.tags ?? [])], folder: n.folder ?? "Inbox", updatedAt: n.updatedAt });

export function createWorkspaceApi<N extends NoteLike>(b: WorkspaceBinding<N>): WorkspaceApi {
  const now = () => (b.now ? b.now() : new Date().toISOString());
  const live = () => b.getNotes().filter((n) => !n.isTrashed);

  function once<T>(key: string, fn: () => T): T {
    const hit = b.idempotency.get(key);
    if (hit !== undefined) return hit as T;
    const r = fn();
    b.idempotency.set(key, r);
    return r;
  }
  const mutate = (id: string, fn: (n: N) => N): N => {
    const all = b.getNotes();
    const i = all.findIndex((n) => n.id === id);
    if (i < 0) throw new Error(`note not found: ${id}`);
    const next = fn(all[i]);
    const copy = all.slice();
    copy[i] = next;
    b.updateNotes(copy);
    return next;
  };
  const touch = (n: N, patch: Partial<NoteLike>): N => {
    const merged = { ...n, ...patch, updatedAt: now() } as N;
    if (patch.content !== undefined) { const wc = words(merged.content); (merged as NoteLike).wordCount = wc; (merged as NoteLike).readingTime = Math.max(1, Math.ceil(wc / 200)); }
    return merged;
  };

  return {
    async searchNotes(q) {
      const terms = q.query.toLowerCase().split(/\s+/).filter(Boolean);
      const scored = live()
        .filter((n) => (!q.tag || n.tags.includes(q.tag)) && (!q.folder || n.folder === q.folder))
        .map((n) => {
          const t = n.title.toLowerCase(), c = n.content.toLowerCase();
          const score = terms.length ? terms.reduce((s, w) => s + (t.includes(w) ? 3 : 0) + (c.includes(w) ? 1 : 0), 0) : 1;
          return { n, score };
        })
        .filter((x) => x.score > 0)
        .sort((a, c) => c.score - a.score || String(c.n.updatedAt ?? "").localeCompare(String(a.n.updatedAt ?? "")));
      return scored.slice(0, q.limit ?? 10).map((x) => toNoteRef(x.n));
    },
    async getNote(id) {
      const n = live().find((x) => x.id === id);
      return n ? toNoteRef(n) : null;
    },
    async createNote(input, key) {
      return once(key, () => {
        const id = `note_flow_${hash(key)}`;
        if (b.getNotes().some((n) => n.id === id)) return { id };
        if (input.folder) b.ensureFolder?.(input.folder);
        const ts = now();
        const content = input.content;
        const note = {
          id, workspaceId: b.workspaceId ?? "", title: input.title, content, tags: input.tags ?? [], isPinned: false, isShared: false,
          isFavorite: false, folder: input.folder ?? "Inbox", createdAt: ts, updatedAt: ts, wordCount: words(content),
          readingTime: Math.max(1, Math.ceil(words(content) / 200)), status: "Draft",
        } as unknown as N;
        b.updateNotes([note, ...b.getNotes()]);
        b.onWrite?.({ op: "create", noteId: id, key, flowId: b.flowId });
        return { id };
      });
    },
    async updateNote(id, patch, key) {
      return once(key, () => {
        mutate(id, (n) => touch(n, {
          ...(patch.title !== undefined ? { title: patch.title } : {}),
          ...(patch.content !== undefined ? { content: patch.content } : patch.appendContent ? { content: n.content + patch.appendContent } : {}),
        }));
        b.onWrite?.({ op: "update", noteId: id, key, flowId: b.flowId });
        return { id };
      });
    },
    async addTags(id, tags, key) {
      return once(key, () => {
        const n = mutate(id, (x) => touch(x, { tags: Array.from(new Set([...x.tags, ...tags])) }));
        b.onWrite?.({ op: "tag", noteId: id, key, flowId: b.flowId });
        return { id, tags: [...n.tags] };
      });
    },
    async moveNote(id, folder, key) {
      return once(key, () => {
        b.ensureFolder?.(folder);
        mutate(id, (x) => touch(x, { folder }));
        b.onWrite?.({ op: "move", noteId: id, key, flowId: b.flowId });
        return { id, folder };
      });
    },
    async createReminder(input, key) {
      return once(key, () => {
        if (!b.getReminders || !b.updateReminders) throw new Error("reminders are not available in this workspace");
        const id = `rem_flow_${hash(key)}`;
        const cur = b.getReminders();
        if (!cur.some((r) => r.id === id)) b.updateReminders([{ id, workspaceId: b.workspaceId, text: input.text, date: input.date, completed: false, noteId: input.noteId }, ...cur]);
        b.onWrite?.({ op: "reminder", noteId: input.noteId, key, flowId: b.flowId });
        return { id };
      });
    },
    async scanDlp(text): Promise<DlpFinding[]> {
      return dlpScan(text);
    },
  };
}
