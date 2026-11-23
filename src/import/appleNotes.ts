/**
 * Apple Notes importer - HONEST SCOPE.
 * Apple publishes NO export format for Notes (the NoteStore.sqlite database is undocumented,
 * protobuf-encoded and gzip-compressed; this module does NOT read it). Practical routes supported:
 *   1. A folder of .html files produced by common exporters (one file per note, folder = Notes folder).
 *   2. A folder of .md/.markdown files produced by exporters (delegates to the Markdown importer).
 *   3. Plain .txt files (e.g. copy/paste, or "Save as" from Notes); first line becomes the title.
 * Not supported: locked notes, inline drawings/scans, attachments (only referenced by name when an
 * exporter links them), shared-note metadata, and any binary .notesbackup/.icloud formats.
 * Dates come from the optional createdAt/modifiedAt on each ImportFile (e.g. File.lastModified) or from
 * <meta name="created|date|modified"> tags in the HTML; otherwise they are left undefined.
 */
import { htmlToMarkdown } from "../core/markdown";
import { importMarkdownFiles } from "./markdownImport";
import { ImportedNote, ImportFile, DEFAULT_LIMITS, cleanPath, clampTitle, extOf, firstHeading, normalizeNewlines, stripExt, toIso } from "./common";

const meta = (html: string, ...names: string[]) => {
  for (const n of names) {
    const m = new RegExp(`<meta[^>]+name=["']${n}["'][^>]*content=["']([^"']*)["']`, "i").exec(html) ?? new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]*name=["']${n}["']`, "i").exec(html);
    if (m) return m[1];
  }
  return undefined;
};

export function importAppleNotesFiles(files: ImportFile[], opts: { maxNotes?: number } = {}): ImportedNote[] {
  const max = opts.maxNotes ?? DEFAULT_LIMITS.maxNotes;
  const out: ImportedNote[] = importMarkdownFiles(files.filter((f) => ["md", "markdown"].includes(extOf(f.path))), { maxNotes: max })
    .map((n) => ({ ...n, source: "apple-notes" as const }));
  let skipped = 0;
  for (const f of files) {
    const segs = cleanPath(f.path);
    const name = segs[segs.length - 1] ?? "";
    const ext = extOf(name);
    if (!["html", "htm", "txt"].includes(ext) || segs.some((s) => s.startsWith("."))) { if (!["md", "markdown"].includes(ext)) skipped++; continue; }
    if (out.length >= max) { skipped++; continue; }
    const raw = normalizeNewlines(f.content.slice(0, DEFAULT_LIMITS.maxEntryBytes));
    let title: string | undefined;
    let md: string;
    let created = toIso(f.createdAt), updated = toIso(f.modifiedAt);
    if (ext === "txt") {
      const lines = raw.split("\n");
      const i = lines.findIndex((l) => l.trim());
      title = i >= 0 ? lines[i].trim().slice(0, 200) : undefined;
      md = lines.slice(i + 1).join("\n").trim();
    } else {
      const t = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(raw)?.[1];
      created = toIso(meta(raw, "created", "date", "creation-date")) ?? created;
      updated = toIso(meta(raw, "modified", "last-modified", "updated")) ?? updated;
      md = htmlToMarkdown(/<body[^>]*>([\s\S]*)<\/body>/i.exec(raw)?.[1] ?? raw);
      const h = firstHeading(md);
      if (h.title) { title = h.title; md = h.rest.trim(); }
      else if (t) title = htmlToMarkdown(t).replace(/\s+/g, " ").trim();
    }
    out.push({
      title: clampTitle(title ?? stripExt(name)), markdown: md, tags: [], createdAt: created, updatedAt: updated,
      folderPath: segs.slice(0, -1), attachments: [], source: "apple-notes",
    });
  }
  if (skipped && out.length) out[0].warnings = [...(out[0].warnings ?? []), `${skipped} unsupported file(s) skipped (only .html, .md and .txt are read)`];
  return out;
}
