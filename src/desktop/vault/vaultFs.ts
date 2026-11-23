import { isInternal, normalizeVaultPath, pathKey, VaultPathError } from "./paths";

export interface VaultStat {
  path: string;
  isDir: boolean;
  size: number;
  /** Milliseconds since epoch. */
  mtimeMs: number;
}

export type VaultEvent =
  | { type: "create" | "modify" | "delete"; path: string }
  | { type: "rename"; from: string; path: string };

/**
 * Abstract vault filesystem. All paths are relative to the vault root, "/"-separated.
 * Implementations MUST reject traversal (use normalizeVaultPath) and SHOULD write atomically.
 * The Tauri implementation lives in src/desktop/bridge.ts (calls Rust commands); tests use MemoryVaultFs.
 */
export interface VaultFs {
  readText(path: string): Promise<string>;
  /** Creates parent dirs. */
  writeText(path: string, text: string): Promise<void>;
  /** Recursive listing of files and dirs under `dir` ("" = root). */
  list(dir: string): Promise<VaultStat[]>;
  stat(path: string): Promise<VaultStat | null>;
  rename(from: string, to: string): Promise<void>;
  remove(path: string): Promise<void>;
  /** Subscribe to external + internal changes. Returns unsubscribe. */
  watch(cb: (e: VaultEvent) => void): () => void;
}

export { isInternal };

interface MemFile { name: string; text: string; mtimeMs: number }

/** In-memory VaultFs. Optionally case-insensitive (Windows/macOS defaults) to exercise collisions. */
export class MemoryVaultFs implements VaultFs {
  private files = new Map<string, MemFile>();
  private listeners = new Set<(e: VaultEvent) => void>();
  private clock = 1_700_000_000_000;
  /** Counts mutating calls; used by idempotency tests. */
  writes = 0;

  constructor(private readonly caseInsensitive = true) {}

  private k(p: string) {
    const n = normalizeVaultPath(p);
    return this.caseInsensitive ? pathKey(n) : n;
  }
  private emit(e: VaultEvent) { this.listeners.forEach((l) => l(e)); }
  private tick() { return (this.clock += 1000); }

  async readText(path: string): Promise<string> {
    const f = this.files.get(this.k(path));
    if (!f) throw new Error(`ENOENT: ${path}`);
    return f.text;
  }
  async writeText(path: string, text: string): Promise<void> {
    const key = this.k(path);
    const existing = this.files.get(key);
    const name = normalizeVaultPath(path);
    this.files.set(key, { name: existing?.name ?? name, text, mtimeMs: this.tick() });
    this.writes++;
    this.emit({ type: existing ? "modify" : "create", path: existing?.name ?? name });
  }
  async list(dir: string): Promise<VaultStat[]> {
    const prefix = dir ? normalizeVaultPath(dir) + "/" : "";
    const pk = this.caseInsensitive ? pathKey(prefix) : prefix;
    const out: VaultStat[] = [];
    const dirs = new Set<string>();
    for (const [key, f] of this.files) {
      if (!key.startsWith(pk)) continue;
      out.push({ path: f.name, isDir: false, size: f.text.length, mtimeMs: f.mtimeMs });
      const parts = f.name.split("/");
      for (let i = 1; i < parts.length; i++) dirs.add(parts.slice(0, i).join("/"));
    }
    for (const d of dirs) if (!prefix || (this.caseInsensitive ? pathKey(d + "/") : d + "/").startsWith(pk)) out.push({ path: d, isDir: true, size: 0, mtimeMs: 0 });
    return out.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  }
  async stat(path: string): Promise<VaultStat | null> {
    const f = this.files.get(this.k(path));
    return f ? { path: f.name, isDir: false, size: f.text.length, mtimeMs: f.mtimeMs } : null;
  }
  async rename(from: string, to: string): Promise<void> {
    const fk = this.k(from);
    const tk = this.k(to);
    const f = this.files.get(fk);
    if (!f) throw new Error(`ENOENT: ${from}`);
    const dest = this.files.get(tk);
    if (dest && tk !== fk) throw new Error(`EEXIST: ${to}`); // never overwrite silently
    this.files.delete(fk);
    const name = normalizeVaultPath(to);
    this.files.set(tk, { ...f, name, mtimeMs: this.tick() });
    this.writes++;
    this.emit({ type: "rename", from: f.name, path: name });
  }
  async remove(path: string): Promise<void> {
    const f = this.files.get(this.k(path));
    if (!f) return;
    this.files.delete(this.k(path));
    this.writes++;
    this.emit({ type: "delete", path: f.name });
  }
  watch(cb: (e: VaultEvent) => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }
  /** Test helper: files as a plain object. */
  snapshot(): Record<string, string> {
    return Object.fromEntries([...this.files.values()].map((f) => [f.name, f.text]));
  }
}

export { VaultPathError };
