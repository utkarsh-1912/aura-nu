/**
 * Shared importer types + safe helpers. Importers are pure functions over bytes/strings:
 * they never touch the filesystem or network and never execute content. All HTML is
 * sanitised via core/markdown. Sizes and entry counts are bounded (zip-bomb defence).
 */
import { Unzip, UnzipInflate, UnzipPassThrough } from "fflate";

export interface ImportedAttachment { name: string; mimeType?: string; size: number; path?: string }
export interface ImportedNote {
  title: string;
  markdown: string;
  tags: string[];
  createdAt?: string; // ISO-8601, only when the source provided a valid date
  updatedAt?: string;
  folderPath: string[];
  attachments: ImportedAttachment[];
  source: "markdown" | "notion" | "evernote" | "apple-notes";
  warnings?: string[];
}
/** A file handed to an importer (e.g. from <input type=file webkitdirectory>). */
export interface ImportFile { path: string; content: string; createdAt?: string; modifiedAt?: string }

export interface ImportLimits {
  maxEntries: number;          // zip entries
  maxTotalBytes: number;       // total uncompressed bytes inflated
  maxEntryBytes: number;       // per-entry uncompressed bytes
  maxNotes: number;
  maxInputBytes: number;       // size of the archive / enex itself
}
export const DEFAULT_LIMITS: ImportLimits = {
  maxEntries: 20_000, maxTotalBytes: 500 * 1024 * 1024, maxEntryBytes: 20 * 1024 * 1024, maxNotes: 20_000, maxInputBytes: 500 * 1024 * 1024,
};
export class ImportError extends Error {
  constructor(public code: "TOO_MANY_ENTRIES" | "TOO_LARGE" | "BAD_ARCHIVE" | "BAD_INPUT", message: string) { super(message); this.name = "ImportError"; }
}

export function toIso(v: unknown): string | undefined {
  if (v == null || v === "") return undefined;
  const s = String(v).trim();
  const compact = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z?$/.exec(s); // Evernote
  const d = compact ? new Date(Date.UTC(+compact[1], +compact[2] - 1, +compact[3], +compact[4], +compact[5], +compact[6])) : new Date(s);
  const t = d.getTime();
  return isNaN(t) || t < 0 || t > 4_102_444_800_000 ? undefined : d.toISOString();
}

/** Normalise an archive path: forward slashes, no leading slash, no "." / ".." segments (zip-slip defence). */
export function cleanPath(p: string): string[] {
  return p.replace(/\\/g, "/").split("/").filter((s) => s && s !== "." && s !== ".." && !/[\u0000-\u001f]/.test(s)).map((s) => s.slice(0, 255));
}
export const extOf = (name: string) => (/\.([A-Za-z0-9]{1,8})$/.exec(name)?.[1] ?? "").toLowerCase();
export const stripExt = (name: string) => name.replace(/\.[A-Za-z0-9]{1,8}$/, "");

export function firstHeading(md: string): { title?: string; rest: string } {
  const m = /^\s*#\s+(.+?)\s*#*\s*(?:\r?\n|$)/.exec(md);
  return m ? { title: m[1].trim(), rest: md.slice(m[0].length).replace(/^\s*\n/, "") } : { rest: md };
}
export const normalizeNewlines = (s: string) => s.replace(/\r\n?/g, "\n");
export const clampTitle = (t: string) => (t.replace(/\s+/g, " ").trim() || "Untitled").slice(0, 200);

export const MIME_BY_EXT: Record<string, string> = {
  png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp", pdf: "application/pdf",
  mp3: "audio/mpeg", m4a: "audio/mp4", wav: "audio/wav", mp4: "video/mp4", mov: "video/quicktime", csv: "text/csv", txt: "text/plain",
};

export interface ZipEntry { path: string; bytes?: Uint8Array; size: number }

/**
 * Safely read a zip. Only entries accepted by `wanted(path)` are inflated (others are listed
 * with their declared size, uninflated). Inflation is streamed and aborted as soon as the
 * per-entry or total byte caps are exceeded, so a lying header cannot cause unbounded memory use.
 */
export function readZip(data: Uint8Array, wanted: (path: string) => boolean, limits: ImportLimits = DEFAULT_LIMITS): ZipEntry[] {
  if (data.length > limits.maxInputBytes) throw new ImportError("TOO_LARGE", "archive too large");
  const out: ZipEntry[] = [];
  let entries = 0;
  let total = 0;
  const u = new Unzip();
  u.register(UnzipInflate);
  u.register(UnzipPassThrough);
  u.onfile = (f) => {
    if (++entries > limits.maxEntries) throw new ImportError("TOO_MANY_ENTRIES", `archive has more than ${limits.maxEntries} entries`);
    if (f.name.endsWith("/")) return;
    const segs = cleanPath(f.name);
    if (!segs.length) return;
    const path = segs.join("/");
    if (!wanted(path)) { out.push({ path, size: f.originalSize ?? f.size ?? 0 }); return; }
    if ((f.originalSize ?? 0) > limits.maxEntryBytes) throw new ImportError("TOO_LARGE", `entry too large: ${path}`);
    const chunks: Uint8Array[] = [];
    let n = 0;
    const entry: ZipEntry = { path, size: 0 };
    out.push(entry);
    f.ondata = (err, chunk, final) => {
      if (err) throw new ImportError("BAD_ARCHIVE", String(err.message ?? err));
      n += chunk.length;
      total += chunk.length;
      if (n > limits.maxEntryBytes || total > limits.maxTotalBytes) {
        f.terminate();
        throw new ImportError("TOO_LARGE", "archive expands beyond the allowed size");
      }
      chunks.push(chunk);
      if (final) { // data arrives after onfile returns; assemble on the final chunk
        const bytes = new Uint8Array(n);
        let o = 0;
        for (const c of chunks) { bytes.set(c, o); o += c.length; }
        entry.bytes = bytes;
        entry.size = n;
      }
    };
    try { f.start(); } catch (e) {
      if (e instanceof ImportError) throw e;
      throw new ImportError("BAD_ARCHIVE", `cannot read ${path}`);
    }
  };
  try { u.push(data, true); } catch (e) {
    if (e instanceof ImportError) throw e;
    throw new ImportError("BAD_ARCHIVE", "not a valid zip file");
  }
  if (entries === 0) throw new ImportError("BAD_ARCHIVE", "not a valid zip file (no entries)");
  return out;
}

export const decodeUtf8 = (b: Uint8Array) => new TextDecoder("utf-8").decode(b).replace(/^﻿/, "");
