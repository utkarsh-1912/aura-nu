/**
 * Safe path/filename handling for the on-disk vault. Pure TS.
 * Vault paths are always relative, "/"-separated, and never escape the vault root.
 */
export class VaultPathError extends Error {}

// eslint-disable-next-line no-control-regex
const FORBIDDEN_CHARS = /[<>:"/\\|?*\u0000-\u001f\u007f]/g;
const RESERVED_WIN = /^(con|prn|aux|nul|com[0-9¹²³]|lpt[0-9¹²³])(\..*)?$/i;
export const MAX_SEGMENT = 100;
export const INTERNAL_DIR = ".aura";

/** Validate + canonicalize a relative vault path. Throws VaultPathError on traversal/absolute/NUL/illegal names. */
export function normalizeVaultPath(p: string): string {
  if (typeof p !== "string") throw new VaultPathError("path must be a string");
  if (p.includes("\0")) throw new VaultPathError("NUL in path");
  const s = p.replace(/\\/g, "/");
  if (s.startsWith("/") || /^[A-Za-z]:/.test(s)) throw new VaultPathError("absolute path");
  const out: string[] = [];
  for (const seg of s.split("/")) {
    if (seg === "" || seg === ".") continue;
    if (seg === "..") throw new VaultPathError("path traversal");
    // eslint-disable-next-line no-control-regex
    if (/[<>:"|?*\u0000-\u001f]/.test(seg)) throw new VaultPathError(`illegal character in "${seg}"`);
    if (/[. ]$/.test(seg)) throw new VaultPathError(`segment ends with dot/space: "${seg}"`);
    if (RESERVED_WIN.test(seg)) throw new VaultPathError(`reserved name: "${seg}"`);
    out.push(seg);
  }
  return out.join("/");
}

/** Turn arbitrary user text into one safe file/dir segment (never "", ".", "..", reserved, trailing dot, or hidden). */
export function sanitizeSegment(name: string, fallback = "Untitled"): string {
  let s = (name ?? "").normalize("NFC").replace(FORBIDDEN_CHARS, "-").replace(/\s+/g, " ").trim();
  s = [...s].slice(0, MAX_SEGMENT).join("");
  s = s.replace(/[. ]+$/, "").replace(/^\.+/, "_");
  if (s === "") s = fallback;
  if (RESERVED_WIN.test(s)) s = `_${s}`;
  return s;
}

/** Sanitize each segment of a "/"-separated folder path ("" = vault root). */
export function folderToDir(folder: string | undefined | null): string {
  if (!folder) return "";
  return folder
    .replace(/\\/g, "/")
    .split("/")
    .map((x) => x.trim())
    .filter((x) => x && x !== "." && x !== "..")
    .map((x) => sanitizeSegment(x, "Folder"))
    .join("/");
}

/** Key for case-insensitive, Unicode-normalized comparison of paths. */
export const pathKey = (p: string): string => p.normalize("NFC").toLowerCase();

export const dirname = (p: string): string => {
  const i = p.lastIndexOf("/");
  return i < 0 ? "" : p.slice(0, i);
};
export const basename = (p: string): string => p.slice(p.lastIndexOf("/") + 1);
export const join = (dir: string, name: string): string => (dir ? `${dir}/${name}` : name);
export const stemOf = (p: string): string => basename(p).replace(/\.md$/i, "");
export const isInternal = (p: string): boolean => p.split("/").some((s) => s.startsWith("."));

/** Pick `dir/stem.md`, else `dir/stem (2).md`, ... not in `taken` (keys from pathKey). Does not mutate `taken`. */
export function allocatePath(dir: string, stem: string, taken: ReadonlySet<string>, ext = ".md"): string {
  const base = sanitizeSegment(stem);
  for (let n = 1; ; n++) {
    const suffix = n === 1 ? "" : ` (${n})`;
    const trimmed = [...base].slice(0, MAX_SEGMENT - suffix.length).join("").replace(/[. ]+$/, "") || "Untitled";
    const cand = join(dir, `${trimmed}${suffix}${ext}`);
    if (!taken.has(pathKey(cand))) return cand;
  }
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** True if `path` is `dir/stem.md` or `dir/stem (n).md` (keeps names stable across reconciles). */
export function matchesStem(path: string, dir: string, stem: string): boolean {
  if (dirname(path) !== dir) return false;
  const have = pathKey(stemOf(path));
  const want = pathKey([...sanitizeSegment(stem)].slice(0, MAX_SEGMENT - 6).join("").replace(/[. ]+$/, "") || "Untitled");
  return have === want || new RegExp(`^${escapeRe(want)}( \\(\\d+\\))?$`).test(have);
}
