import { emptyState, editNote, syncOnce, SyncState, Transport } from "./syncEngine";
import { adoptNewerEntries, applyUiChanges, canon, mergeIntoUi, SeenMap, unionLegacy } from "./uiBridge";

export type SyncStatus = "idle" | "syncing" | "offline" | "error";

export interface Persisted {
  v: 1;
  /** Legacy (/api/notes) data has been imported into the v2 store. */
  migrated: boolean;
  state: SyncState;
}

export interface SyncStorage {
  load(): Promise<Persisted | null>;
  save(p: Persisted): Promise<void>;
  clear(): Promise<void>;
}

export interface ControllerDeps<T extends { id: string; updatedAt?: string }> {
  transport: Transport;
  storage: SyncStorage;
  /** Returns notes from the old whole-set endpoint, or null when it can't be reached (retry later). */
  fetchLegacy: () => Promise<any[] | null>;
  /** Latest UI notes (must reflect the most recent React state, e.g. via a ref). */
  getUi: () => T[];
  setUi: (updater: (current: T[]) => T[]) => void;
  onStatus?: (s: SyncStatus) => void;
  onRejected?: (items: { id: string; reason: string }[]) => void;
  onConflictCopies?: (count: number) => void;
}

const MAX_FOLLOW_UPS = 3;

/**
 * Orchestrates sync for one signed-in user. Framework-agnostic: the React hook is a thin wrapper.
 * At most one network cycle runs at a time; requests that arrive mid-cycle coalesce into one follow-up.
 */
export class SyncController<T extends { id: string; updatedAt?: string }> {
  private state: SyncState = emptyState();
  private migrated = false;
  private loaded = false;
  private reconciled = false;
  private seen: SeenMap = new Map();
  private running: Promise<void> | null = null;
  private again = false;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private disposed = false;

  constructor(private deps: ControllerDeps<T>) {}

  get pendingCount(): number {
    return Object.values(this.state.entries).filter((e) => e.dirty).length;
  }

  private async ensureLoaded() {
    if (this.loaded) return;
    try {
      const p = await this.deps.storage.load();
      if (p && p.v === 1) {
        this.state = p.state;
        this.migrated = p.migrated;
      }
    } catch (err) {
      console.warn("[sync] could not load persisted state; starting fresh", err);
    }
    this.loaded = true;
  }

  private async persist() {
    try {
      await this.deps.storage.save({ v: 1, migrated: this.migrated, state: this.state });
    } catch (err) {
      console.warn("[sync] could not persist sync state", err);
    }
  }

  /** Debounced: call whenever the UI notes change. */
  scheduleSync(delayMs = 1500) {
    if (this.disposed) return;
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.syncNow();
    }, delayMs);
  }

  dispose() {
    this.disposed = true;
    if (this.timer) clearTimeout(this.timer);
  }

  /** Runs a sync cycle now (coalescing with any cycle in flight). Never throws. */
  syncNow(): Promise<void> {
    if (this.disposed) return Promise.resolve();
    if (this.running) {
      this.again = true;
      return this.running;
    }
    this.running = (async () => {
      try {
        let followUps = 0;
        do {
          this.again = false;
          const more = await this.cycle();
          if (more && followUps++ < MAX_FOLLOW_UPS) this.again = true;
        } while (this.again && !this.disposed);
      } finally {
        this.running = null;
      }
    })();
    return this.running;
  }

  /** @returns true if dirty work remains that a follow-up cycle should push. */
  private async cycle(): Promise<boolean> {
    await this.ensureLoaded();
    const { deps } = this;
    deps.onStatus?.("syncing");

    let snapshot = deps.getUi();
    let migratedNow = false;

    if (!this.reconciled) {
      this.reconciled = true;
      const { list, replaced } = adoptNewerEntries(snapshot, this.state.entries);
      if (replaced.size) {
        deps.setUi((cur) => cur.map((n) => {
          const r = replaced.get(n.id);
          return r && canon(n) === canon(r.old) ? r.next : n;
        }));
        snapshot = list;
      }
    }

    if (!this.migrated) {
      const legacy = await deps.fetchLegacy().catch(() => null);
      if (legacy) {
        const union = unionLegacy(snapshot, legacy);
        if (union !== snapshot) {
          deps.setUi((cur) => unionLegacy(cur, legacy));
          snapshot = union;
        }
        migratedNow = true;
      }
    }

    this.state = applyUiChanges(this.state, snapshot, this.seen);

    let report;
    try {
      report = await syncOnce(this.state, deps.transport);
    } catch (err: any) {
      await this.persist(); // keep queued edits across reloads
      const offline = typeof navigator !== "undefined" && navigator.onLine === false;
      console.warn("[sync] cycle failed:", err?.message ?? err);
      deps.onStatus?.(offline || err?.name === "TypeError" ? "offline" : "error");
      return false;
    }

    let next = report.state;
    for (const copy of report.conflictCopies) next = editNote(next, copy);
    this.state = next;
    if (migratedNow) this.migrated = true;

    deps.setUi((cur) => mergeIntoUi(cur, snapshot, next.entries));
    if (report.conflictCopies.length) deps.onConflictCopies?.(report.conflictCopies.length);
    if (report.rejected.length) deps.onRejected?.(report.rejected);

    await this.persist();
    deps.onStatus?.("idle");
    return this.pendingCount > 0;
  }

  /**
   * "Clear cache & re-download". Pushes pending edits first and aborts if that fails,
   * so unsynced work is never discarded.
   */
  async resetAndPull(): Promise<boolean> {
    await this.syncNow();
    await this.ensureLoaded();
    if (this.pendingCount > 0) return false;
    this.state = emptyState();
    this.seen = new Map();
    this.migrated = true;
    await this.persist();
    this.deps.setUi(() => []);
    await this.syncNow();
    return true;
  }
}
