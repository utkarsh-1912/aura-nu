/**
 * Evernote .enex importer. Input: the .enex file text.
 * - XML parsed with fast-xml-parser (no DTD/external entity resolution; entity expansion capped).
 * - ENML -> HTML-ish -> sanitised -> Markdown. <en-todo> becomes a checklist item.
 * - Attachments (<resource>) are reported as metadata only (name, mime, approx. size); the base64
 *   payload is not retained. <en-media> in the body becomes a "[attachment: name-or-mime]" marker
 *   because Evernote links media by MD5 and WebCrypto has no MD5 to resolve it reliably.
 * - <en-crypt> (Evernote encrypted text) is replaced by "[encrypted text omitted]" - not decrypted.
 * - Notebook name is not present in .enex; folderPath is empty (caller may set it from the file name).
 */
import { XMLParser } from "fast-xml-parser";
import { htmlToMarkdown } from "../core/markdown";
import { ImportedNote, ImportLimits, DEFAULT_LIMITS, ImportError, clampTitle, toIso } from "./common";

const asArray = <T,>(v: T | T[] | undefined): T[] => (v === undefined ? [] : Array.isArray(v) ? v : [v]);
const text = (v: unknown): string => (typeof v === "string" ? v : typeof v === "number" ? String(v) : v && typeof v === "object" && "#text" in (v as object) ? String((v as Record<string, unknown>)["#text"]) : "");

export function enmlToMarkdown(enml: string): string {
  let h = enml
    .replace(/<\?xml[\s\S]*?\?>/g, "").replace(/<!DOCTYPE[\s\S]*?>/gi, "")
    .replace(/<en-todo\b([^>]*?)\/?>/gi, (_m, a: string) => `<input type="checkbox"${/checked\s*=\s*["']?true/i.test(a) ? " checked" : ""}>`)
    .replace(/<en-media\b([^>]*?)\/?>/gi, (_m, a: string) => `<span>[attachment: ${/type\s*=\s*"([^"]*)"/i.exec(a)?.[1]?.replace(/[<>&"]/g, "") ?? "file"}]</span>`)
    .replace(/<en-crypt\b[\s\S]*?(<\/en-crypt>|\/>)/gi, "<span>[encrypted text omitted]</span>")
    .replace(/<\/?en-note\b[^>]*>/gi, "");
  // Evernote checklists are inline <input> inside <div>s, not <li>s. Put each on its own list line.
  h = h.replace(/<div>\s*(<input type="checkbox"[^>]*>)([\s\S]*?)<\/div>/gi, (_m, box: string, rest: string) => `<ul><li>${box}${rest}</li></ul>`);
  return htmlToMarkdown(h)
    .replace(/(- \[[ x]\] [^\n]*)\n\n(?=- \[[ x]\] )/g, "$1\n")
    .replace(/\\\[(attachment: [^\]\n]*|encrypted text omitted)\\\]/g, "[$1]");
}

export function importEnex(xml: string, limits: ImportLimits = DEFAULT_LIMITS): ImportedNote[] {
  if (xml.length > limits.maxInputBytes) throw new ImportError("TOO_LARGE", "file too large");
  if (!/<en-export\b/.test(xml.slice(0, 5000))) throw new ImportError("BAD_INPUT", "not an Evernote export (.enex)");
  const parser = new XMLParser({
    ignoreAttributes: false, attributeNamePrefix: "@_", parseTagValue: false, parseAttributeValue: false, trimValues: false,
    processEntities: { enabled: true, maxTotalExpansions: 1000, maxEntitySize: 1000 },
    isArray: (name) => ["note", "tag", "resource"].includes(name),
  });
  let doc: { "en-export"?: { note?: Record<string, unknown>[] } };
  try { doc = parser.parse(xml); } catch (e) { throw new ImportError("BAD_INPUT", "invalid XML: " + (e as Error).message); }
  const raw = asArray(doc["en-export"]?.note);
  const out: ImportedNote[] = [];
  for (const n of raw.slice(0, limits.maxNotes)) {
    const warnings: string[] = [];
    const content = text(n.content);
    if (/<en-crypt\b/i.test(content)) warnings.push("contains encrypted text that was omitted");
    const resources = asArray(n.resource as Record<string, unknown>[] | undefined).slice(0, 200);
    const attachments = resources.map((r, i) => {
      const attrs = (r["resource-attributes"] ?? {}) as Record<string, unknown>;
      const b64 = text((r.data as Record<string, unknown> | undefined) ?? "").replace(/\s+/g, "");
      return { name: clampTitle(text(attrs["file-name"]) || `attachment-${i + 1}`), mimeType: text(r.mime) || undefined, size: Math.floor((b64.length * 3) / 4) };
    });
    if (attachments.length) warnings.push(`${attachments.length} attachment(s) listed as metadata only (file data not imported)`);
    out.push({
      title: clampTitle(text(n.title)),
      markdown: enmlToMarkdown(content),
      tags: asArray(n.tag as unknown[]).map((t) => text(t).trim().toLowerCase()).filter(Boolean).slice(0, 50),
      createdAt: toIso(text(n.created)), updatedAt: toIso(text(n.updated)),
      folderPath: [], attachments, source: "evernote", ...(warnings.length ? { warnings } : {}),
    });
  }
  return out;
}
