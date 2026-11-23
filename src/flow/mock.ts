/**
 * Deterministic MOCK implementations used by tests and the standalone Workflow Studio.
 * They are NOT real AI and NOT a real workspace. Output is prefixed "[MOCK]" where it imitates a model.
 */
import type { AiClient, NoteRef, WorkspaceApi } from "./types";
import { basicDlpScan } from "./tools";

export interface WriteLogEntry {
  op: string;
  key: string;
  args: unknown;
}

export class MemoryWorkspace implements WorkspaceApi {
  notes = new Map<string, NoteRef>();
  reminders: { id: string; text: string; date: string; noteId?: string }[] = [];
  writes: WriteLogEntry[] = [];
  private done = new Map<string, unknown>();
  private n = 0;

  constructor(seed: NoteRef[] = []) {
    for (const s of seed) this.notes.set(s.id, { ...s });
  }

  /** Executes a write at most once per idempotency key. */
  private once<T>(op: string, key: string, args: unknown, fn: () => T): T {
    if (this.done.has(key)) return this.done.get(key) as T;
    const r = fn();
    this.done.set(key, r);
    this.writes.push({ op, key, args });
    return r;
  }

  async searchNotes(q: { query: string; tag?: string; folder?: string; limit?: number }) {
    const words = q.query.toLowerCase().split(/\s+/).filter(Boolean);
    return [...this.notes.values()]
      .filter((n) => (!q.tag || n.tags.includes(q.tag)) && (!q.folder || n.folder === q.folder))
      .filter((n) => !words.length || words.some((w) => `${n.title} ${n.content}`.toLowerCase().includes(w)))
      .slice(0, q.limit ?? 10)
      .map((n) => ({ ...n }));
  }
  async getNote(id: string) {
    const n = this.notes.get(id);
    return n ? { ...n } : null;
  }
  async createNote(input: { title: string; content: string; folder?: string; tags?: string[] }, key: string) {
    return this.once("createNote", key, input, () => {
      const id = `note_${++this.n}`;
      this.notes.set(id, { id, title: input.title, content: input.content, tags: input.tags ?? [], folder: input.folder ?? "Inbox" });
      return { id };
    });
  }
  async updateNote(id: string, patch: { title?: string; content?: string; appendContent?: string }, key: string) {
    return this.once("updateNote", key, { id, patch }, () => {
      const n = this.notes.get(id);
      if (!n) throw new Error(`note not found: ${id}`);
      if (patch.title !== undefined) n.title = patch.title;
      if (patch.content !== undefined) n.content = patch.content;
      if (patch.appendContent) n.content += patch.appendContent;
      return { id };
    });
  }
  async addTags(id: string, tags: string[], key: string) {
    return this.once("addTags", key, { id, tags }, () => {
      const n = this.notes.get(id);
      if (!n) throw new Error(`note not found: ${id}`);
      n.tags = Array.from(new Set([...n.tags, ...tags]));
      return { id, tags: n.tags };
    });
  }
  async moveNote(id: string, folder: string, key: string) {
    return this.once("moveNote", key, { id, folder }, () => {
      const n = this.notes.get(id);
      if (!n) throw new Error(`note not found: ${id}`);
      n.folder = folder;
      return { id, folder };
    });
  }
  async createReminder(input: { text: string; date: string; noteId?: string }, key: string) {
    return this.once("createReminder", key, input, () => {
      const id = `rem_${++this.n}`;
      this.reminders.push({ id, ...input });
      return { id };
    });
  }
  async scanDlp(text: string) {
    return basicDlpScan(text);
  }
}

const tok = (s: string) => Math.max(1, Math.ceil(s.length / 4));

/** Heuristic stand-in for a model. Deterministic; clearly marked. */
export class MockAiClient implements AiClient {
  calls = 0;
  async complete(req: Parameters<AiClient["complete"]>[0]) {
    this.calls++;
    const lines = req.prompt.split("\n").map((l) => l.trim()).filter(Boolean);
    const actionLines = lines.filter((l) => /^(-\s*\[ \]|todo:|action:|\*\s*\[ \])/i.test(l));
    let text = `[MOCK] ${req.task}: ${lines.slice(0, 2).join(" ").slice(0, 160)}`;
    let json: unknown;
    const props = req.schema?.properties ?? {};
    if (req.schema?.type === "object") {
      const obj: Record<string, unknown> = {};
      if ("items" in props) obj.items = actionLines.map((l) => ({ text: l.replace(/^(-\s*\[ \]|\*\s*\[ \]|todo:|action:)\s*/i, ""), due: "2030-01-01" }));
      if ("summary" in props) obj.summary = text;
      if ("approved" in props) { const bad = /\[MOCK-REJECT\]/.test(req.prompt); obj.approved = !bad; obj.issues = bad ? ["[MOCK] flagged by test marker"] : []; }
      if ("label" in props) obj.label = /invoice|payment|receipt/i.test(req.prompt) ? "finance" : "general";
      json = obj;
      text = JSON.stringify(obj);
    }
    return { text, json, tokens: { input: tok(req.prompt), output: tok(text) } };
  }
  async agentStep(req: Parameters<AiClient["agentStep"]>[0]) {
    this.calls++;
    const obs = req.history.filter((h) => h.role === "observation");
    const searchable = req.tools.some((t) => t.name === "search_notes");
    if (!obs.length && searchable) {
      return { action: { type: "tool_call" as const, tool: "search_notes", args: { query: req.goal.slice(0, 80), limit: 5 }, thought: "[MOCK] search first" }, tokens: { input: tok(req.goal), output: 12 } };
    }
    return { action: { type: "final" as const, answer: `[MOCK] Finished "${req.goal.slice(0, 60)}" after ${obs.length} tool call(s).` }, tokens: { input: tok(req.goal), output: 20 } };
  }
}
