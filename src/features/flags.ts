/**
 * Tiny feature-flag store backed by localStorage. Flags default OFF. All access is try/catch'd so
 * private-mode / blocked storage never breaks the app. Changes are broadcast in-tab via a custom event
 * and cross-tab via the native `storage` event.
 */
import { useEffect, useState } from "react";

export const FLAG_TIPTAP_EDITOR = "aura-flag-tiptap-editor";
const EVENT = "aura-flag-change";

export interface FlagStorage { getItem(k: string): string | null; setItem(k: string, v: string): void }

function defaultStorage(): FlagStorage | null {
  try { return typeof localStorage === "undefined" ? null : localStorage; } catch { return null; }
}

/** Parses a stored flag value. Only the literal "true" (or "1") enables a flag. */
export function parseFlag(raw: string | null | undefined): boolean {
  return raw === "true" || raw === "1";
}

export function readFlag(key: string, storage: FlagStorage | null = defaultStorage()): boolean {
  try { return parseFlag(storage?.getItem(key)); } catch { return false; }
}

export function writeFlag(key: string, value: boolean, storage: FlagStorage | null = defaultStorage()): void {
  try { storage?.setItem(key, value ? "true" : "false"); } catch { /* storage unavailable: flag simply stays off */ }
  try { if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(EVENT, { detail: { key } })); } catch { /* ignore */ }
}

export function useFlag(key: string): [boolean, (v: boolean) => void] {
  const [v, setV] = useState<boolean>(() => readFlag(key));
  useEffect(() => {
    const sync = () => setV(readFlag(key));
    const onStorage = (e: StorageEvent) => { if (e.key === key || e.key === null) sync(); };
    window.addEventListener(EVENT, sync);
    window.addEventListener("storage", onStorage);
    return () => { window.removeEventListener(EVENT, sync); window.removeEventListener("storage", onStorage); };
  }, [key]);
  return [v, (next) => { writeFlag(key, next); setV(next); }];
}
