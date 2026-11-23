/**
 * Notion export importer (Settings > Export > Markdown & CSV, or HTML). Input: the .zip bytes.
 * - Reads .md and .html pages; other files become attachment metadata (bytes are NOT inflated or kept).
 * - Strips Notion's 32-hex id suffix from page/folder names; folder structure -> folderPath.
 * - Relative links to other exported pages ([x](Page%20<id>.md)) become [[Page]] wikilinks.
 * - One level of nested zips (Notion splits big exports into "Export-...-Part-1.zip") is unwrapped.
 * - Not handled: CSV databases (listed as attachments), page-property tables beyond the leading
 *   "Key: value" block (kept as text), toggle/callout blocks (kept as whatever Notion emitted).
 */
import { htmlToMarkdown, sanitizeHtml } from "../core/markdown";
import { ImportedNote, ImportedAttachment, ImportLimits, DEFAULT_LIMITS, MIME_BY_EXT, clampTitle, decodeUtf8, extOf, firstHeading, normalizeNewlines, readZip, stripExt, toIso, ImportError } from "./common";

const ID_SUFFIX = /\s+[0-9a-f]{32}$/i;
const cleanName = (s: string) => s.replace(ID_SUFFIX, "").trim();

export function importNotionZip(data: Uint8Array, limits: ImportLimits = DEFAULT_LIMITS, depth = 0): ImportedNote[] {
  const entries = readZip(data, (p) => ["md", "html", "htm", "zip"].includes(extOf(p)), limits);
  const notes: ImportedNote[] = [];
  const attachments = new Map<string, ImportedAttachment[]>(); // folder -> attachments
  for (const e of entries) {
    const ext = extOf(e.path);
    const segs = e.path.split("/");
    const folder = segs.slice(0, -1).map(cleanName);
    if (ext === "zip" && e.bytes) {
      if (depth >= 1) continue;
      notes.push(...importNotionZip(e.bytes, limits, depth + 1));
      continue;
    }
    if (!["md", "html", "htm"].includes(ext) || !e.bytes) {
      const key = folder.join("/");
      const list = attachments.get(key) ?? [];
      list.push({ name: segs[segs.length - 1], mimeType: MIME_BY_EXT[ext], size: e.size, path: e.path });
      attachments.set(key, list);
      continue;
    }
    if (notes.length >= limits.maxNotes) throw new ImportError("TOO_MANY_ENTRIES", "too many notes");
    const raw = normalizeNewlines(decodeUtf8(e.bytes));
    let md: string;
    let title: string | undefined;
    if (ext === "md") {
      const h = firstHeading(raw);
      title = h.title;
      md = h.rest;
    } else {
      const t = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(raw)?.[1];
      const body = /<body[^>]*>([\s\S]*)<\/body>/i.exec(raw)?.[1] ?? raw;
      md = htmlToMarkdown(sanitizeHtml(body));
      const h = firstHeading(md);
      title = h.title ?? (t ? htmlToMarkdown(t) : undefined);
      if (h.title) md = h.rest;
    }
    // Relative page links -> wikilinks
    md = md.replace(/\[([^\]]+)\]\(((?!https?:|mailto:|#)[^)\s]+?\.(?:md|html))\)/gi, (_m, text, href) => {
      let target = href;
      try { target = decodeURIComponent(href); } catch { /* keep raw */ }
      const leaf = cleanName(stripExt(target.split("/").pop() ?? ""));
      return leaf ? `[[${leaf}${leaf === text ? "" : "|" + text}]]` : text;
    });
    // Leading "Key: value" property block (Notion database rows)
    const props: Record<string, string> = {};
    md = md.replace(/^((?:[A-Za-z][\w ]{0,30}: .*\n)+)\n/, (m, block: string) => {
      for (const line of block.trim().split("\n")) { const i = line.indexOf(": "); props[line.slice(0, i).trim().toLowerCase()] = line.slice(i + 2).trim(); }
      return m; // keep as text; we only mine dates/tags from it
    });
    const tags = (props["tags"] ?? "").split(",").map((t) => t.trim().toLowerCase()).filter(Boolean).slice(0, 50);
    notes.push({
      title: clampTitle(title ?? cleanName(stripExt(segs[segs.length - 1]))),
      markdown: md.trim(), tags,
      createdAt: toIso(props["created"] ?? props["created time"]),
      updatedAt: toIso(props["last edited"] ?? props["last edited time"] ?? props["updated"]),
      folderPath: folder, attachments: [], source: "notion",
    });
  }
  // Attach asset metadata to notes sharing the same folder (Notion puts assets in a folder named after the page).
  for (const n of notes) {
    const own = attachments.get([...n.folderPath, n.title].join("/")) ?? attachments.get(n.folderPath.join("/")) ?? [];
    n.attachments = own.slice(0, 200);
  }
  return notes;
}
