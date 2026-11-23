import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { SyncController, SyncStatus } from "../core/syncController";
import { auth, isFirebaseConfigured } from "../firebase";
import { createHttpTransport, createIdbSyncStorage, fetchLegacyNotes } from "../lib/syncTransport";

interface Options<T extends { id: string; updatedAt?: string }> {
  userEmail: string;
  /** False until `notes` has been loaded for `userEmail`; syncing an unhydrated list would tombstone real notes. */
  enabled: boolean;
  notes: T[];
  setNotes: (updater: (current: T[]) => T[]) => void;
  onToast?: (text: string, type: "success" | "info" | "error") => void;
}

/**
 * Keeps the `notes` array in sync with the per-note v2 API. Changes are detected by diffing, so
 * every existing place that updates `notes` is covered. Sync runs shortly after edits, on mount,
 * on reconnect (via syncNow) and on a slow interval.
 */
export function useNoteSync<T extends { id: string; updatedAt?: string }>({ userEmail, enabled: enabledProp, notes, setNotes, onToast }: Options<T>) {
  // Guest/demo sessions have no Firebase identity, so the server (which requires a verified token
  // whenever Firebase is configured) would answer 401. They stay local-only.
  const canReachServer = !isFirebaseConfigured || !!auth?.currentUser;
  const enabled = enabledProp && canReachServer;
  const notesRef = useRef(notes);
  notesRef.current = notes;
  const toastRef = useRef(onToast);
  toastRef.current = onToast;
  const setNotesRef = useRef(setNotes);
  setNotesRef.current = setNotes;

  const [status, setStatus] = useState<SyncStatus>("idle");
  const [pending, setPending] = useState(0);
  const reported = useRef(new Set<string>());

  const controller = useMemo(
    () =>
      new SyncController<T>({
        transport: createHttpTransport(userEmail),
        storage: createIdbSyncStorage(userEmail),
        fetchLegacy: () => fetchLegacyNotes(userEmail),
        getUi: () => notesRef.current,
        setUi: (u) => setNotesRef.current(u),
        onStatus: setStatus,
        onRejected: (items) => {
          for (const it of items) {
            const k = `${it.id}:${it.reason}`;
            if (reported.current.has(k)) continue;
            reported.current.add(k);
            toastRef.current?.(`A note could not be synced (${it.reason}). It is kept on this device.`, "error");
          }
        },
        onConflictCopies: (n) =>
          toastRef.current?.(`${n} note${n > 1 ? "s were" : " was"} edited on two devices. A "conflict copy" keeps the other version.`, "info"),
      }),
    [userEmail],
  );

  // Sync soon after any change to the notes list.
  useEffect(() => {
    if (!enabled) return;
    controller.scheduleSync();
    setPending(controller.pendingCount);
  }, [notes, controller, enabled]);

  // Initial sync + slow safety-net interval.
  useEffect(() => {
    if (!enabled) return;
    void controller.syncNow();
    const id = setInterval(() => void controller.syncNow(), 30_000);
    return () => clearInterval(id);
  }, [controller, enabled]);

  useEffect(() => () => controller.dispose(), [controller]);

  const syncNow = useCallback(() => (enabled ? controller.syncNow() : Promise.resolve()).then(() => setPending(controller.pendingCount)), [controller, enabled]);
  const resetAndPull = useCallback(() => controller.resetAndPull(), [controller]);

  return { status, pending, syncNow, resetAndPull };
}
