/**
 * Markdown file / folder-of-markdown importer (Obsidian-style vaults, plain .md folders).
 * Frontmatter keys understood: title, tags / tag, created / date / created_at, updated / modified / updated_at.
 * Folder structure becomes folderPath (file name excluded). Non-markdown files become attachment metadata
 * of the notes in the same folder are NOT guessed; they are ignored (reported via warnings on the first note).
 */
import { parseFrontmatter, extractHashtags } from "../core/markdown";
import { ImportedNote, ImportFile, cleanPath, clampTitle, extOf, firstHeading, normalizeNewlines, stripExt, toIso, DEFAULT_LIMITS } from "./common";

const pick = (d: Record<string, unknown>, ...keys: string[]) => keys.map((k) => d[k]).find((v) => v !== undefined && v !== "");

export function importMarkdownFiles(files: ImportFile[], opts: { maxNotes?: number; hashtagsAsTags?: boolean } = {}): ImportedNote[] {
  const max = opts.maxNotes ?? DEFAULT_LIMITS.maxNotes;
  const notes: ImportedNote[] = [];
  let skipped = 0;
  for (const f of files) {
    const segs = cleanPath(f.path);
    const name = segs[segs.length - 1] ?? "";
    if (!["md", "markdown", "mdown"].includes(extOf(name)) || segs.some((s) => s.startsWith(".")) ) { skipped++; continue; }
    if (notes.length >= max) { skipped++; continue; }
    const { data, body } = parseFrontmatter(normalizeNewlines(f.content.slice(0, DEFAULT_LIMITS.maxEntryBytes)));
    const fmTitle = pick(data, "title");
    let md = body.trim();
    let title = typeof fmTitle === "string" ? fmTitle : undefined;
    if (!title) {
      const h = firstHeading(md);
      if (h.title) { title = h.title; md = h.rest.trim(); }
    }
    title = clampTitle(title ?? stripExt(name));
    const rawTags = pick(data, "tags", "tag");
    const tags = new Set<string>((Array.isArray(rawTags) ? rawTags : typeof rawTags === "string" ? rawTags.split(/[,\s]+/) : []).map((t) => String(t).replace(/^#/, "").trim().toLowerCase()).filter(Boolean));
    if (opts.hashtagsAsTags) extractHashtags(md).forEach((t) => tags.add(t));
    notes.push({
      title, markdown: md, tags: [...tags].slice(0, 50),
      createdAt: toIso(pick(data, "created", "date", "created_at")) ?? toIso(f.createdAt),
      updatedAt: toIso(pick(data, "updated", "modified", "updated_at")) ?? toIso(f.modifiedAt),
      folderPath: segs.slice(0, -1), attachments: [], source: "markdown",
    });
  }
  if (skipped && notes.length) notes[0].warnings = [`${skipped} non-markdown, hidden or over-limit file(s) were skipped`];
  return notes;
}
