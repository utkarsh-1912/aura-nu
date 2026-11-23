import type { NoteInput } from "../../core/sync";
import type { Hasher } from "./hash";
import { markdownToNote } from "./markdown";
import { INTERNAL_DIR, isInternal, stemOf } from "./paths";
import type { VaultFs } from "./vaultFs";
import type { YamlMap } from "./yaml";

/** What we last agreed on for each note: the file text hash is the three-way-merge BASE. */
export interface IndexEntry {
  path: string;
  /** SHA-256 of the file text as last written/adopted. */
  hash: string;
  /** note.updatedAt at that time (used to detect "file edited but frontmatter timestamp stale"). */
  updatedAt: string;
  /** Unknown frontmatter keys preserved across rewrites. */
  extra?: YamlMap;
}
export interface VaultIndex {
  version: 1;
  notes: Record<string, IndexEntry>;
}

export const INDEX_PATH = `${INTERNAL_DIR}/index.json`;
export const emptyIndex = (): VaultIndex => ({ version: 1, notes: {} });

export function serializeIndex(ix: VaultIndex): string {
  const sorted: Record<string, IndexEntry> = {};
  for (const id of Object.keys(ix.notes).sort()) sorted[id] = ix.notes[id];
  return JSON.stringify({ version: 1, notes: sorted }, null, 1);
}

/** Tolerant parse: a corrupt/missing index yields an empty one (caller should then rebuildIndex). */
export function parseIndex(text: string | null | undefined): VaultIndex | null {
  if (!text) return null;
  try {
    const raw = JSON.parse(text);
    if (!raw || raw.version !== 1 || typeof raw.notes !== "object" || raw.notes === null) return null;
    const notes: Record<string, IndexEntry> = Object.create(null);
    for (const [id, e] of Object.entries<Record<string, unknown>>(raw.notes)) {
      if (id === "__proto__" || !e || typeof e.path !== "string" || typeof e.hash !== "string") return null;
      notes[id] = {
        path: e.path, hash: e.hash,
        updatedAt: typeof e.updatedAt === "string" ? e.updatedAt : "",
        ...(e.extra && typeof e.extra === "object" ? { extra: e.extra as YamlMap } : {}),
      };
    }
    return { version: 1, notes: { ...notes } };
  } catch {
    return null;
  }
}

export async function loadIndex(fs: VaultFs): Promise<VaultIndex | null> {
  try { return parseIndex(await fs.readText(INDEX_PATH)); } catch { return null; }
}
export async function saveIndex(fs: VaultFs, ix: VaultIndex): Promise<void> {
  await fs.writeText(INDEX_PATH, serializeIndex(ix));
}

export interface RebuildResult {
  index: VaultIndex;
  /** Notes parsed from disk (so an app can repopulate from the vault). */
  notes: NoteInput[];
  /** Files with no/duplicate id: skipped here; the next reconcile assigns ids to them. */
  skipped: string[];
}

/**
 * Rebuild the index purely from the files on disk, treating disk as the truth.
 * Index loss is therefore recoverable and never destroys files.
 */
export async function rebuildIndex(fs: VaultFs, hasher: Hasher, opts: { workspaceId: string; now: () => string }): Promise<RebuildResult> {
  const files = (await fs.list("")).filter((e) => !e.isDir && /\.md$/i.test(e.path) && !isInternal(e.path)).sort((a, b) => (a.path < b.path ? -1 : 1));
  const index = emptyIndex();
  const notes: NoteInput[] = [];
  const skipped: string[] = [];
  for (const f of files) {
    const text = await fs.readText(f.path);
    const { note, extra, hadId } = markdownToNote(text, {
      workspaceId: opts.workspaceId, id: "", fileStem: stemOf(f.path), mtimeIso: new Date(f.mtimeMs).toISOString(),
    });
    if (!hadId || index.notes[note.id]) { skipped.push(f.path); continue; }
    const slash = f.path.lastIndexOf("/");
    note.folder = slash < 0 ? "" : f.path.slice(0, slash);
    index.notes[note.id] = { path: f.path, hash: await hasher(text), updatedAt: note.updatedAt, ...(Object.keys(extra).length ? { extra } : {}) };
    notes.push(note);
  }
  return { index, notes, skipped };
}
