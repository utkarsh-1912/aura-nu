/**
 * Typed bridge from the web UI to native (Tauri v2) features. Safe to import in the browser:
 * every call returns `{ ok:false, reason:"unavailable" }` when not running inside the desktop shell.
 *
 * No npm dependency needed: the desktop shell sets `app.withGlobalTauri = true`, which exposes
 * `window.__TAURI__.core.invoke` / `.event.listen` (https://v2.tauri.app/reference/config/#withglobaltauri).
 * If you later install `@tauri-apps/api`, call `setTauriRuntime({ invoke, listen })` once at startup instead.
 *
 * Rust side: apps/desktop/src-tauri/src (UNBUILT/UNTESTED; command names below must match `invoke_handler`).
 */
import type { VaultEvent, VaultFs, VaultStat } from "./vault/vaultFs";

export type BridgeResult<T> =
  | { ok: true; value: T }
  | { ok: false; reason: "unavailable" | "error"; error?: string };

export type Unlisten = () => void;
export interface TauriRuntime {
  invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T>;
  listen<T>(event: string, cb: (payload: T) => void): Promise<Unlisten>;
}

let injected: TauriRuntime | null = null;
export function setTauriRuntime(rt: TauriRuntime | null): void { injected = rt; }

interface GlobalTauri {
  core?: { invoke: (cmd: string, args?: Record<string, unknown>) => Promise<unknown> };
  event?: { listen: (ev: string, cb: (e: { payload: unknown }) => void) => Promise<Unlisten> };
}

function runtime(): TauriRuntime | null {
  if (injected) return injected;
  const g = (globalThis as { __TAURI__?: GlobalTauri }).__TAURI__;
  if (!g?.core?.invoke) return null;
  return {
    invoke: (cmd, args) => g.core!.invoke(cmd, args) as never,
    listen: (ev, cb) => g.event!.listen(ev, (e) => cb(e.payload as never)),
  };
}

/** True inside the desktop shell. */
export const isDesktop = (): boolean => runtime() !== null;

const UNAVAILABLE = { ok: false, reason: "unavailable" } as const;

async function call<T>(cmd: string, args?: Record<string, unknown>): Promise<BridgeResult<T>> {
  const rt = runtime();
  if (!rt) return UNAVAILABLE;
  try {
    return { ok: true, value: await rt.invoke<T>(cmd, args) };
  } catch (e) {
    return { ok: false, reason: "error", error: typeof e === "string" ? e : e instanceof Error ? e.message : JSON.stringify(e) };
  }
}

async function subscribe<T>(event: string, cb: (p: T) => void): Promise<BridgeResult<Unlisten>> {
  const rt = runtime();
  if (!rt) return UNAVAILABLE;
  try { return { ok: true, value: await rt.listen<T>(event, cb) }; }
  catch (e) { return { ok: false, reason: "error", error: String(e) }; }
}

// ---------------- capabilities ----------------
export interface DesktopCapabilities {
  vault: boolean; quickNote: boolean; globalShortcut: boolean; sidecar: boolean; models: boolean; keychain: boolean; updater: boolean;
  platform: "windows" | "macos" | "linux" | "unknown";
  appVersion: string;
}
export const capabilities = () => call<DesktopCapabilities>("app_capabilities");

// ---------------- vault ----------------
export interface VaultInfo { root: string; name: string }
export const vault = {
  /** Native folder picker; Rust grants fs scope to ONLY the chosen dir at runtime. */
  pick: () => call<VaultInfo | null>("vault_pick"),
  open: (root: string) => call<VaultInfo>("vault_open", { root }),
  current: () => call<VaultInfo | null>("vault_current"),
  close: () => call<void>("vault_close"),
  onEvent: (cb: (e: VaultEvent) => void) => subscribe<VaultEvent>("vault://event", cb),
};

/** VaultFs backed by Rust commands. All paths are vault-relative; Rust re-validates them (never trust the webview). */
export function createTauriVaultFs(): VaultFs {
  const must = async <T,>(cmd: string, args?: Record<string, unknown>): Promise<T> => {
    const r = await call<T>(cmd, args);
    if (r.ok) return r.value;
    const f = r as { reason?: string; error?: string }; // cast: repo tsconfig is non-strict, so union narrowing fails
    throw new Error(f.reason === "unavailable" ? "desktop runtime unavailable" : f.error ?? "vault error");
  };
  return {
    readText: (path) => must<string>("vault_read", { path }),
    writeText: (path, text) => must<void>("vault_write", { path, text }),
    list: (dir) => must<VaultStat[]>("vault_list", { dir }),
    stat: (path) => must<VaultStat | null>("vault_stat", { path }),
    rename: (from, to) => must<void>("vault_rename", { from, to }),
    remove: (path) => must<void>("vault_remove", { path }),
    watch(cb) {
      let un: Unlisten | null = null;
      let cancelled = false;
      void call<void>("vault_watch_start").then(() => subscribe<VaultEvent>("vault://event", cb)).then((r) => {
        if (r.ok) { if (cancelled) r.value(); else un = r.value; }
      });
      return () => { cancelled = true; un?.(); };
    },
  };
}

// ---------------- quick note + global shortcut ----------------
export const quickNote = {
  show: () => call<void>("quicknote_show"),
  hide: () => call<void>("quicknote_hide"),
  /** Rust re-registers the OS-wide accelerator, e.g. "CommandOrControl+Shift+N". Fails if taken by another app. */
  setShortcut: (accelerator: string) => call<void>("quicknote_set_shortcut", { accelerator }),
  /** Fired in the MAIN window when the quick-note window saves text. */
  onSaved: (cb: (p: { text: string; createdAt: string }) => void) => subscribe("quicknote://saved", cb),
};

// ---------------- local model runtime (llama.cpp sidecar) ----------------
export interface SidecarStatus {
  state: "stopped" | "starting" | "ready" | "error";
  /** OpenAI-compatible base URL, always http://127.0.0.1:<random port>/v1 */
  baseUrl?: string;
  /** Bearer token the UI must send; random per start; never persisted. */
  token?: string;
  modelId?: string;
  error?: string;
}
export const sidecar = {
  start: (opts: { modelId: string; contextSize?: number; gpuLayers?: number }) => call<SidecarStatus>("sidecar_start", { ...opts }),
  stop: () => call<void>("sidecar_stop"),
  status: () => call<SidecarStatus>("sidecar_status"),
  onStatus: (cb: (s: SidecarStatus) => void) => subscribe<SidecarStatus>("sidecar://status", cb),
};

// ---------------- model manager ----------------
export interface InstalledModel { id: string; file: string; sizeBytes: number; sha256: string; verifiedAt: string }
export interface DownloadProgress { id: string; receivedBytes: number; totalBytes: number; phase: "downloading" | "verifying" | "done" | "error"; error?: string }
export const models = {
  list: () => call<InstalledModel[]>("models_list"),
  /** Rust enforces https + host allowlist, quota, streams to *.part, verifies SHA-256, then renames. */
  /** Takes ONLY a catalog id; Rust looks url/sha256/size up in the catalog bundled with the app (never trusts webview-sent hashes). */
  download: (id: string) => call<InstalledModel>("models_download", { id }),
  cancel: (id: string) => call<void>("models_cancel", { id }),
  verify: (id: string) => call<boolean>("models_verify", { id }),
  remove: (id: string) => call<void>("models_remove", { id }),
  diskUsage: () => call<{ usedBytes: number; quotaBytes: number; freeBytes: number }>("models_disk_usage"),
  setQuota: (quotaBytes: number) => call<void>("models_set_quota", { quotaBytes }),
  onProgress: (cb: (p: DownloadProgress) => void) => subscribe<DownloadProgress>("models://progress", cb),
};

// ---------------- OS keychain (API keys) ----------------
export const keychain = {
  set: (name: string, secret: string) => call<void>("keychain_set", { name, secret }),
  get: (name: string) => call<string | null>("keychain_get", { name }),
  delete: (name: string) => call<void>("keychain_delete", { name }),
};

// ---------------- updater ----------------
export interface UpdateInfo { available: boolean; version?: string; notes?: string }
export const updater = {
  check: () => call<UpdateInfo>("update_check"),
  /** Downloads, verifies the minisign signature (Rust/plugin), installs, relaunches. */
  installAndRelaunch: () => call<void>("update_install"),
};

export const desktop = { isDesktop, capabilities, vault, quickNote, sidecar, models, keychain, updater };
