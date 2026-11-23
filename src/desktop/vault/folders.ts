import { folderToDir } from "./paths";

/** Minimal shape of the app's Folder (src/types.ts) so this module stays dependency-free. */
export interface FolderLike { id: string; name: string; parentId?: string }

/** "Work/Projects/Q4" path for a folder id (cycle- and missing-parent-safe). "" if unknown. */
export function folderPathOf(folders: FolderLike[], id: string | undefined): string {
  if (!id) return "";
  const byId = new Map(folders.map((f) => [f.id, f]));
  const parts: string[] = [];
  const seen = new Set<string>();
  for (let cur = byId.get(id); cur && !seen.has(cur.id); cur = cur.parentId ? byId.get(cur.parentId) : undefined) {
    seen.add(cur.id);
    parts.unshift(cur.name);
  }
  return parts.join("/");
}

/** Directory on disk for a folder id. */
export const folderDirOf = (folders: FolderLike[], id: string | undefined): string => folderToDir(folderPathOf(folders, id));

/** Every ancestor directory of the given note folder paths, e.g. ["A/B"] -> ["A","A/B"]. */
export function dirsFromFolderPaths(paths: string[]): string[] {
  const out = new Set<string>();
  for (const p of paths) {
    const segs = p.split("/").filter(Boolean);
    for (let i = 1; i <= segs.length; i++) out.add(segs.slice(0, i).join("/"));
  }
  return [...out].sort();
}

/** Build a folder tree (stable synthetic ids from the path) out of directories found on disk. */
export function foldersFromDirs(dirs: string[], workspaceId: string): Array<FolderLike & { workspaceId: string }> {
  return dirsFromFolderPaths(dirs).map((d) => {
    const i = d.lastIndexOf("/");
    return { id: `vault:${d}`, workspaceId, name: d.slice(i + 1), ...(i >= 0 ? { parentId: `vault:${d.slice(0, i)}` } : {}) };
  });
}
