/**
 * Web Share Target + manifest shortcut handling (pure logic; the SW stores the payload in cache `aura-share`).
 * The SW (public/sw.js) writes `/__share/meta` ({title,text,url,at}) and `/__share/file/<n>` (X-Filename header).
 */
import type { Note } from "../../types";
import { makeNote, applyContentChange } from "../noteUtils";

export const SHARE_CACHE = "aura-share";
export const INTENT_KEY = "aura-pending-launch";
const INTENT_TTL_MS = 10 * 60 * 1000;
const SHARE_TTL_MS = 60 * 60 * 1000;
/** Images up to this size are embedded in the note as data: URLs (notes are text; there is no attachment store yet). */
export const MAX_EMBED_BYTES = 1_000_000;

export type LaunchIntent = { kind: "share" | "new-note" | "quick-note"; at: number };

/** Parses `?share=1` / `?action=new-note|quick-note` (and a direct `/share-target` GET) into an intent. */
export function parseLaunchIntent(pathname: string, search: string, now = Date.now()): LaunchIntent | null {
  const q = new URLSearchParams(search);
  if (q.get("share") === "1" || pathname === "/share-target") return { kind: "share", at: now };
  const a = q.get("action");
  if (a === "new-note" || a === "quick-note") return { kind: a, at: now };
  return null;
}

export interface IntentStorage { getItem(k: string): string | null; setItem(k: string, v: string): void; removeItem(k: string): void }

export function stashIntent(intent: LaunchIntent, storage: IntentStorage): void {
  try { storage.setItem(INTENT_KEY, JSON.stringify(intent)); } catch { /* storage blocked: intent is lost, app still loads */ }
}
/** Reads and clears the pending intent. Expired or malformed values are discarded. */
export function consumeIntent(storage: IntentStorage, now = Date.now()): LaunchIntent | null {
  let raw: string | null = null;
  try { raw = storage.getItem(INTENT_KEY); storage.removeItem(INTENT_KEY); } catch { return null; }
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as LaunchIntent;
    if ((v.kind === "share" || v.kind === "new-note" || v.kind === "quick-note") && typeof v.at === "number" && now - v.at <= INTENT_TTL_MS) return v;
  } catch { /* malformed */ }
  return null;
}

export interface SharedFile { name: string; type: string; size: number; bytes?: ArrayBuffer }
export interface SharePayload { title: string; text: string; url: string; at: number; files: SharedFile[] }

export interface CacheLike {
  match(req: string): Promise<{ json(): Promise<unknown>; headers: { get(k: string): string | null }; arrayBuffer(): Promise<ArrayBuffer> } | undefined>;
  delete(req: string): Promise<boolean>;
}
export interface CacheStorageLike { open(name: string): Promise<CacheLike>; delete(name: string): Promise<boolean> }

/** Reads the stored share, then ALWAYS deletes it (even when unreadable). Returns null if nothing is stored or it is stale. */
export async function readAndClearShare(caches: CacheStorageLike | undefined, now = Date.now()): Promise<SharePayload | null> {
  if (!caches) return null;
  let cache: CacheLike;
  try { cache = await caches.open(SHARE_CACHE); } catch { return null; }
  try {
    const metaRes = await cache.match("/__share/meta");
    if (!metaRes) return null;
    const m = (await metaRes.json()) as Partial<SharePayload>;
    const files: SharedFile[] = [];
    for (let i = 0; i < 10; i++) {
      const r = await cache.match(`/__share/file/${i}`);
      if (!r) break;
      const name = decodeURIComponent(r.headers.get("X-Filename") ?? "file");
      const type = r.headers.get("Content-Type") ?? "application/octet-stream";
      const bytes = await r.arrayBuffer();
      files.push({ name, type, size: bytes.byteLength, bytes });
    }
    if (typeof m.at === "number" && now - m.at > SHARE_TTL_MS) return null;
    return { title: String(m.title ?? ""), text: String(m.text ?? ""), url: String(m.url ?? ""), at: m.at ?? now, files };
  } catch {
    return null;
  } finally {
    try { await caches.delete(SHARE_CACHE); } catch { /* ignore */ }
  }
}

const toBase64 = (buf: ArrayBuffer): string => {
  const bytes = new Uint8Array(buf);
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
};
const decodeText = (buf: ArrayBuffer) => new TextDecoder().decode(buf);

/** Turns a payload into Markdown. Small images are embedded, text files inlined, everything else noted as not saved. */
export function shareToMarkdown(p: SharePayload): { title: string; markdown: string; notes: string[] } {
  const parts: string[] = [];
  const notes: string[] = [];
  if (p.text.trim()) parts.push(p.text.trim());
  if (p.url.trim()) parts.push(/^https?:\/\//i.test(p.url.trim()) ? `[${p.url.trim()}](${p.url.trim()})` : p.url.trim());
  for (const f of p.files) {
    if (/^text\/(plain|markdown)$/.test(f.type) && f.bytes) parts.push(decodeText(f.bytes).slice(0, 200_000));
    else if (/^image\/(png|jpe?g|gif|webp)$/.test(f.type) && f.bytes && f.size <= MAX_EMBED_BYTES) parts.push(`![${f.name.replace(/[\[\]]/g, "")}](data:${f.type};base64,${toBase64(f.bytes)})`);
    else notes.push(`${f.name} (${f.type || "unknown type"}) was shared but not saved: only text and small images (under 1 MB) are stored in notes.`);
  }
  const firstLine = (p.title || p.text.split("\n").find((l) => l.trim()) || "").trim().slice(0, 80);
  let host = "";
  try { host = p.url ? new URL(p.url).hostname : ""; } catch { /* not a URL */ }
  const title = firstLine || host || "Shared note";
  return { title, markdown: parts.join("\n\n"), notes };
}

/** Create a new note from a share, or append to `targetId` when given and found. */
export function applyShare(
  notes: Note[],
  p: SharePayload,
  opts: { workspaceId: string; folder: string; newId: () => string; targetId?: string | null; now?: Date },
): { notes: Note[]; noteId: string; skipped: string[] } {
  const now = opts.now ?? new Date();
  const { title, markdown, notes: skipped } = shareToMarkdown(p);
  const target = opts.targetId ? notes.find((n) => n.id === opts.targetId && !n.isLocked) : undefined;
  if (target) {
    const next = applyContentChange(target, (target.content ? target.content.replace(/\s+$/, "") + "\n\n" : "") + markdown, now);
    return { notes: notes.map((n) => (n.id === target.id ? next : n)), noteId: target.id, skipped };
  }
  const note = makeNote({ id: opts.newId(), workspaceId: opts.workspaceId, title, content: markdown, folder: opts.folder, tags: ["From share"] }, now);
  return { notes: [note, ...notes], noteId: note.id, skipped };
}

export function quickNoteTitle(now: Date = new Date()): string {
  return `Quick note ${now.toLocaleDateString([], { month: "short", day: "numeric" })} ${now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
}
