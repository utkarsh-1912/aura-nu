import type { DlpFinding, Diff, JsonSchema, ToolName, WorkspaceApi } from "./types";
import { validateJson } from "./jsonschema";
import { MAX_SCAN_CHARS, scan as coreScan } from "../core/dlp";

export type RiskLevel = "read" | "low" | "medium" | "high";
export type PermissionScope = "notes:read" | "notes:write" | "notes:organize" | "reminders:write" | "dlp:read";

export interface ToolContext {
  idempotencyKey: string;
  runId: string;
  dryRun: boolean;
}

export interface ToolDef {
  name: ToolName;
  description: string;
  schema: JsonSchema;
  risk: RiskLevel;
  scope: PermissionScope;
  writes: boolean;
  /** Output contains user-authored text: downstream decisions are tainted. */
  returnsUntrusted: boolean;
  run(api: WorkspaceApi, args: any, ctx: ToolContext): Promise<unknown>;
  /** Dry-run: describe what run() would do without writing. Only for writes. */
  plan?(api: WorkspaceApi, args: any, ctx: ToolContext): Promise<{ diffs: Diff[]; result: unknown }>;
}

export type ToolRegistry = Record<ToolName, ToolDef>;

const RISK_ORDER: Record<RiskLevel, number> = { read: 0, low: 1, medium: 2, high: 3 };

/** Policy: untrusted (note-derived) input + medium/high risk tool => human approval. */
export function requiresApproval(tool: ToolDef, tainted: boolean, requireForUntrusted = true): boolean {
  return requireForUntrusted && tainted && RISK_ORDER[tool.risk] >= RISK_ORDER.medium;
}

export function validateToolArgs(tool: ToolDef, args: unknown): string[] {
  return validateJson(tool.schema, args, "args");
}

// ── DLP (real engine: src/core/dlp.ts; WorkspaceApi.scanDlp may still override) ──

/** Scans with the production DLP detectors (checksums, bounded regexes). Findings never carry raw values. */
export function dlpScan(text: string): DlpFinding[] {
  const r = coreScan(text);
  const out: DlpFinding[] = r.findings.map((f) => ({ type: f.detector, masked: f.preview, index: f.start }));
  if (r.truncated) out.push({ type: "scan_truncated", masked: "", index: MAX_SCAN_CHARS });
  return out;
}
/** @deprecated kept for existing imports; now backed by the real engine. */
export const basicDlpScan = dlpScan;

// ── Registry ────────────────────────────────────────────────────────────────

const str = (maxLength = 2000): JsonSchema => ({ type: "string", maxLength });
const strArr: JsonSchema = { type: "array", items: str(100), maxItems: 50 };

export function createToolRegistry(): ToolRegistry {
  const reg: ToolRegistry = {
    search_notes: {
      name: "search_notes",
      description: "Full-text search over workspace notes.",
      schema: { type: "object", required: ["query"], properties: { query: str(500), tag: str(100), folder: str(200), limit: { type: "integer", minimum: 1, maximum: 50 } }, additionalProperties: false },
      risk: "read", scope: "notes:read", writes: false, returnsUntrusted: true,
      run: (api, a) => api.searchNotes({ query: a.query, tag: a.tag, folder: a.folder, limit: a.limit ?? 10 }),
    },
    get_note: {
      name: "get_note",
      description: "Fetch one note by id.",
      schema: { type: "object", required: ["id"], properties: { id: str(200) }, additionalProperties: false },
      risk: "read", scope: "notes:read", writes: false, returnsUntrusted: true,
      run: async (api, a) => {
        const n = await api.getNote(a.id);
        if (!n) throw new Error(`note not found: ${a.id}`);
        return n;
      },
    },
    create_note: {
      name: "create_note",
      description: "Create a new note.",
      schema: { type: "object", required: ["title", "content"], properties: { title: str(300), content: str(100_000), folder: str(200), tags: strArr }, additionalProperties: false },
      risk: "low", scope: "notes:write", writes: true, returnsUntrusted: false,
      run: (api, a, c) => api.createNote({ title: a.title, content: a.content, folder: a.folder, tags: a.tags }, c.idempotencyKey),
      plan: async (_api, a, c) => ({
        diffs: [{ kind: "create_note", target: `(new) ${a.title}`, after: { title: a.title, content: a.content, folder: a.folder ?? "Inbox", tags: a.tags ?? [] } }],
        result: { id: `dry:${c.idempotencyKey}`, dryRun: true },
      }),
    },
    update_note: {
      name: "update_note",
      description: "Edit an existing note (replace or append content).",
      schema: { type: "object", required: ["id"], properties: { id: str(200), title: str(300), content: str(100_000), appendContent: str(100_000) }, additionalProperties: false },
      risk: "medium", scope: "notes:write", writes: true, returnsUntrusted: false,
      run: (api, a, c) => api.updateNote(a.id, { title: a.title, content: a.content, appendContent: a.appendContent }, c.idempotencyKey),
      plan: async (api, a, c) => {
        const before = await api.getNote(a.id);
        const content = a.content ?? (a.appendContent !== undefined ? `${before?.content ?? ""}${a.appendContent}` : before?.content);
        return {
          diffs: [{ kind: "update_note", target: a.id, before: before ? { title: before.title, content: before.content } : null, after: { title: a.title ?? before?.title, content } }],
          result: { id: a.id, dryRun: true },
        };
      },
    },
    tag_note: {
      name: "tag_note",
      description: "Add tags to a note.",
      schema: { type: "object", required: ["id", "tags"], properties: { id: str(200), tags: strArr }, additionalProperties: false },
      risk: "low", scope: "notes:organize", writes: true, returnsUntrusted: false,
      run: (api, a, c) => api.addTags(a.id, a.tags, c.idempotencyKey),
      plan: async (api, a) => {
        const before = await api.getNote(a.id);
        const after = Array.from(new Set([...(before?.tags ?? []), ...a.tags]));
        return { diffs: [{ kind: "tag_note", target: a.id, before: before?.tags ?? [], after }], result: { id: a.id, tags: after, dryRun: true } };
      },
    },
    move_note: {
      name: "move_note",
      description: "Move a note to another folder.",
      schema: { type: "object", required: ["id", "folder"], properties: { id: str(200), folder: str(200) }, additionalProperties: false },
      risk: "medium", scope: "notes:organize", writes: true, returnsUntrusted: false,
      run: (api, a, c) => api.moveNote(a.id, a.folder, c.idempotencyKey),
      plan: async (api, a) => {
        const before = await api.getNote(a.id);
        return { diffs: [{ kind: "move_note", target: a.id, before: before?.folder ?? null, after: a.folder }], result: { id: a.id, folder: a.folder, dryRun: true } };
      },
    },
    create_reminder: {
      name: "create_reminder",
      description: "Create a reminder (ISO date).",
      schema: { type: "object", required: ["text", "date"], properties: { text: str(500), date: str(40), noteId: str(200) }, additionalProperties: false },
      risk: "low", scope: "reminders:write", writes: true, returnsUntrusted: false,
      run: (api, a, c) => {
        if (Number.isNaN(Date.parse(a.date))) throw new NonRetryableToolError(`invalid date: ${a.date}`);
        return api.createReminder({ text: a.text, date: a.date, noteId: a.noteId }, c.idempotencyKey);
      },
      plan: async (_api, a, c) => ({
        diffs: [{ kind: "create_reminder", target: "(new reminder)", after: { text: a.text, date: a.date, noteId: a.noteId } }],
        result: { id: `dry:${c.idempotencyKey}`, dryRun: true },
      }),
    },
    dlp_scan: {
      name: "dlp_scan",
      description: "Scan text for sensitive data (cards, SSNs, keys).",
      schema: { type: "object", required: ["text"], properties: { text: str(200_000) }, additionalProperties: false },
      risk: "read", scope: "dlp:read", writes: false, returnsUntrusted: false,
      run: async (api, a) => {
        const findings = api.scanDlp ? await api.scanDlp(a.text) : dlpScan(a.text);
        return { findings, clean: findings.length === 0, count: findings.length };
      },
    },
  };
  return reg;
}

/** Thrown by tools for errors that retrying cannot fix. */
export class NonRetryableToolError extends Error {
  readonly nonRetryable = true;
}
