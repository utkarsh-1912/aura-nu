/** Smart folder persistence: localStorage `aura-smart-folders-<email>`. Pure parse/serialise helpers are unit tested. */
import { validateRule, type Rule } from "../../core/smartFolders";

export const SMART_PREFIX = "smart:";
export interface SmartFolder { id: string; name: string; rule: Rule }
export const smartFoldersKey = (email: string) => `aura-smart-folders-${email}`;

/** Tolerant parser: drops malformed entries and invalid rules instead of throwing. */
export function parseSmartFolders(raw: string | null | undefined): SmartFolder[] {
  if (!raw) return [];
  let data: unknown;
  try { data = JSON.parse(raw); } catch { return []; }
  if (!Array.isArray(data)) return [];
  const out: SmartFolder[] = [];
  const ids = new Set<string>();
  for (const d of data) {
    if (!d || typeof d !== "object") continue;
    const o = d as Record<string, unknown>;
    if (typeof o.id !== "string" || !o.id || typeof o.name !== "string" || ids.has(o.id)) continue;
    const v = validateRule(o.rule);
    if (!v.ok) continue;
    ids.add(o.id);
    out.push({ id: o.id, name: o.name.slice(0, 80) || "Untitled", rule: v.rule });
  }
  return out;
}

export function loadSmartFolders(email: string): SmartFolder[] {
  try { return parseSmartFolders(localStorage.getItem(smartFoldersKey(email))); } catch { return []; }
}
export function saveSmartFolders(email: string, list: SmartFolder[]): void {
  try { localStorage.setItem(smartFoldersKey(email), JSON.stringify(list)); } catch { /* quota / private mode: keep in memory only */ }
}

export function upsertSmartFolder(list: SmartFolder[], sf: SmartFolder): SmartFolder[] {
  return list.some((f) => f.id === sf.id) ? list.map((f) => (f.id === sf.id ? sf : f)) : [...list, sf];
}
export const removeSmartFolder = (list: SmartFolder[], id: string): SmartFolder[] => list.filter((f) => f.id !== id);
