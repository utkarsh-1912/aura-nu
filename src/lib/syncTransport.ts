import type { NoteInput, SyncedNote } from "../core/sync";
import type { PutOutcome, Transport } from "../core/syncEngine";
import type { Persisted, SyncStorage } from "../core/syncController";
import { apiFetch } from "./apiClient";

/** HTTP transport for the /api/v2 per-note sync API. Network/5xx errors throw; 409 and 400 are outcomes. */
export function createHttpTransport(userEmail: string): Transport {
  const headers = { "Content-Type": "application/json", "X-User-Email": userEmail };

  const toOutcome = async (res: Response): Promise<PutOutcome> => {
    if (res.ok) return { status: "ok", note: (await res.json()).note as SyncedNote };
    if (res.status === 409) return { status: "conflict", current: ((await res.json()).current ?? null) as SyncedNote | null };
    if (res.status === 400) {
      const body = await res.json().catch(() => ({}));
      return { status: "rejected", reason: String(body?.error ?? "invalid note") };
    }
    throw new Error(`sync request failed: ${res.status}`);
  };

  return {
    async changes(since, limit) {
      const res = await apiFetch(`/api/v2/notes/changes?since=${since}&limit=${limit}`, { headers });
      if (!res.ok) throw new Error(`changes failed: ${res.status}`);
      return res.json();
    },
    async put(note: NoteInput, baseRev) {
      return toOutcome(
        await apiFetch(`/api/v2/notes/${encodeURIComponent(note.id)}`, {
          method: "PUT",
          headers,
          body: JSON.stringify({ baseRev, note }),
        }),
      );
    },
    async remove(id, baseRev) {
      return toOutcome(
        await apiFetch(`/api/v2/notes/${encodeURIComponent(id)}?baseRev=${baseRev}`, { method: "DELETE", headers }),
      );
    },
  };
}

/** One-time read of the legacy whole-set endpoint. null = unreachable (retry on a later cycle). */
export async function fetchLegacyNotes(userEmail: string): Promise<any[] | null> {
  try {
    const res = await apiFetch("/api/notes", { headers: { "X-User-Email": userEmail } });
    if (res.status === 401 || res.status >= 500) return null;
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data?.notes) ? data.notes : [];
  } catch {
    return null;
  }
}

/** IndexedDB-backed persistence for the sync state, one record per user. Silently no-ops where IDB is unavailable. */
export function createIdbSyncStorage(userEmail: string): SyncStorage {
  const open = () =>
    new Promise<IDBDatabase>((resolve, reject) => {
      if (typeof indexedDB === "undefined") return reject(new Error("IndexedDB unavailable"));
      const req = indexedDB.open("AuraSyncDB", 1);
      req.onupgradeneeded = () => req.result.createObjectStore("state");
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  const run = async <R>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<R>): Promise<R> => {
    const db = await open();
    try {
      return await new Promise<R>((resolve, reject) => {
        const req = fn(db.transaction("state", mode).objectStore("state"));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
    } finally {
      db.close();
    }
  };
  const key = `v2:${userEmail.toLowerCase()}`;
  return {
    load: async () => ((await run("readonly", (s) => s.get(key))) as Persisted | undefined) ?? null,
    save: async (p) => void (await run("readwrite", (s) => s.put(p, key))),
    clear: async () => void (await run("readwrite", (s) => s.delete(key))),
  };
}
