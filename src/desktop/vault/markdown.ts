import type { NoteInput } from "../../core/sync";
import { NOTE_STATUSES } from "../../core/sync";
import { parseYaml, serializeYaml, YamlError, type YamlMap, type YamlValue } from "./yaml";

/** Frontmatter keys owned by the app. Any other key in a user's file is preserved verbatim as `extra`. */
export const CORE_KEYS = [
  "id", "title", "tags", "pinned", "favorite", "shared", "archived", "trashed", "locked",
  "status", "workspace", "department", "project", "folder", "created", "updated",
] as const;
const CORE = new Set<string>(CORE_KEYS);

export interface ParsedMarkdown {
  meta: YamlMap | null;
  body: string;
  /** Set when a frontmatter block existed but was unparseable; the whole text is then the body (nothing lost). */
  frontmatterError?: string;
}

const norm = (t: string) => t.replace(/^﻿/, "").replace(/\r\n?/g, "\n");

export function splitFrontmatter(raw: string): ParsedMarkdown {
  const text = norm(raw);
  if (!text.startsWith("---\n")) return { meta: null, body: text };
  const lines = text.split("\n");
  let end = -1;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i] === "---") { end = i; break; }
  }
  if (end < 0) return { meta: null, body: text };
  const yamlText = lines.slice(1, end).join("\n");
  let body = lines.slice(end + 1).join("\n");
  if (body.startsWith("\n")) body = body.slice(1);
  try {
    return { meta: parseYaml(yamlText), body };
  } catch (e) {
    return { meta: null, body: text, frontmatterError: e instanceof YamlError ? e.message : String(e) };
  }
}

export function countWords(s: string): number {
  const m = s.trim().match(/\S+/g);
  return m ? m.length : 0;
}

/** Deterministic canonical text for a note. `extra` = preserved unknown frontmatter keys. */
export function noteToMarkdown(note: NoteInput, extra: YamlMap = {}): string {
  const meta: YamlMap = {
    id: note.id,
    title: note.title,
    tags: [...note.tags],
    pinned: !!note.isPinned,
    favorite: !!note.isFavorite,
    shared: !!note.isShared,
  };
  if (note.isArchived) meta.archived = true;
  if (note.isTrashed) meta.trashed = true;
  if (note.isLocked) meta.locked = true;
  if (note.status) meta.status = note.status;
  meta.workspace = note.workspaceId;
  if (note.departmentId) meta.department = note.departmentId;
  if (note.projectId) meta.project = note.projectId;
  meta.folder = note.folder ?? "";
  meta.created = note.createdAt;
  meta.updated = note.updatedAt;
  for (const k of Object.keys(extra).sort()) if (!CORE.has(k)) meta[k] = extra[k];
  return `---\n${serializeYaml(meta)}---\n\n${note.content}`;
}

export interface ImportContext {
  workspaceId: string;
  /** Fallback id (only used if the file has none). */
  id: string;
  /** Fallback title source, e.g. file stem. */
  fileStem: string;
  /** ISO time used when frontmatter has no usable timestamps. */
  mtimeIso: string;
  /** Existing app note to inherit non-file fields from (versionHistory, ...). */
  base?: NoteInput;
}

const str = (v: YamlValue | undefined): string | undefined => (typeof v === "string" && v ? v : undefined);
const bool = (v: YamlValue | undefined): boolean => v === true;
const isIso = (v: unknown): v is string => typeof v === "string" && !Number.isNaN(Date.parse(v));

export function firstHeading(body: string): string | undefined {
  const m = /^#{1,6}\s+(.+?)\s*#*\s*$/m.exec(body);
  return m ? m[1].trim() : undefined;
}

/** Build a note + preserved extra keys from file text. Never throws. */
export function markdownToNote(text: string, ctx: ImportContext): { note: NoteInput; extra: YamlMap; hadId: boolean; frontmatterError?: string } {
  const { meta, body, frontmatterError } = splitFrontmatter(text);
  const m: YamlMap = meta ?? {};
  const extra: YamlMap = {};
  for (const k of Object.keys(m)) if (!CORE.has(k)) extra[k] = m[k];
  const id = str(m.id) && /^[A-Za-z0-9._:-]{1,128}$/.test(str(m.id)!) ? str(m.id)! : undefined;
  const tags = Array.isArray(m.tags) ? m.tags.filter((t) => t.length > 0).slice(0, 100) : typeof m.tags === "string" ? [m.tags] : [];
  const status = NOTE_STATUSES.find((s) => s === m.status);
  const words = countWords(body);
  const created = isIso(m.created) ? m.created : ctx.base?.createdAt ?? ctx.mtimeIso;
  const updated = isIso(m.updated) ? m.updated : ctx.mtimeIso;
  const note: NoteInput = {
    ...(ctx.base ?? {}),
    id: id ?? ctx.id,
    workspaceId: str(m.workspace) ?? ctx.base?.workspaceId ?? ctx.workspaceId,
    title: str(m.title) ?? firstHeading(body) ?? ctx.fileStem,
    content: body,
    tags,
    isPinned: bool(m.pinned),
    isFavorite: bool(m.favorite),
    isShared: bool(m.shared),
    folder: typeof m.folder === "string" ? m.folder : "",
    createdAt: created,
    updatedAt: updated,
    wordCount: words,
    readingTime: Math.max(1, Math.ceil(words / 200)),
  };
  for (const [k, v] of [["isArchived", m.archived], ["isTrashed", m.trashed], ["isLocked", m.locked]] as const) {
    if (bool(v)) note[k] = true; else delete note[k];
  }
  if (status) note.status = status; else delete note.status;
  const dep = str(m.department); if (dep) note.departmentId = dep; else delete note.departmentId;
  const prj = str(m.project); if (prj) note.projectId = prj; else delete note.projectId;
  return { note, extra, hadId: !!id, frontmatterError };
}
