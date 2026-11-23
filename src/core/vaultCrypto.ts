/**
 * Per-note lock ("vault") using WebCrypto: AES-256-GCM with a key derived from the
 * user's password via PBKDF2-HMAC-SHA256 (default 600,000 iterations, random 16-byte
 * salt, random 12-byte IV per encryption). Works in browsers and Node 22 (globalThis.crypto).
 *
 * Envelope (JSON string, versioned):
 *   { v:1, kdf:"PBKDF2-SHA256", iter, salt, iv, check, ct }   (all binary fields base64)
 *   - `check` = SHA-256 of a second 32 bytes derived from the same PBKDF2 run. It lets us
 *     tell WRONG_PASSWORD apart from TAMPERED. It gives an attacker no advantage over the
 *     GCM tag (both are offline password-guess oracles bounded by PBKDF2 cost).
 *   - The header (v, kdf, iter, salt, iv, check) is bound as AES-GCM additional data, so
 *     any edit to it (e.g. lowering `iter`) is detected as TAMPERED.
 *
 * THREAT MODEL
 *   Protects: note content at rest / on the sync server / in backups, against anyone
 *   without the password (incl. server operators), and detects modification of the ciphertext.
 *   Does NOT protect: a compromised device or browser while the note is unlocked; weak
 *   passwords (use a long passphrase; PBKDF2 is not memory-hard); metadata (title, folder,
 *   timestamps, approximate length - ciphertext length reveals plaintext length within a
 *   few bytes, no padding); rollback to an older valid envelope of the same note.
 *   NO PASSWORD RECOVERY: if the password is lost the content is unrecoverable by design.
 *   Passwords are NFKC-normalised so equivalent Unicode forms unlock the same note.
 *   This module is unaudited: do not market it as audited E2E encryption until reviewed.
 */

export type VaultErrorCode = "WRONG_PASSWORD" | "TAMPERED" | "BAD_ENVELOPE" | "UNSUPPORTED_VERSION";
export class VaultError extends Error {
  constructor(public code: VaultErrorCode, message?: string) { super(message ?? code); this.name = "VaultError"; }
}

export const DEFAULT_ITERATIONS = 600_000;
const MIN_ITER = 1_000;   // hard floor (tests); production callers should keep the default
const MAX_ITER = 10_000_000;
const MAX_CT_BYTES = 50_000_000;

interface Envelope { v: 1; kdf: "PBKDF2-SHA256"; iter: number; salt: string; iv: string; check: string; ct: string }

const enc = new TextEncoder();
const dec = new TextDecoder();

function b64(buf: Uint8Array): string {
  let s = "";
  for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  return btoa(s);
}
function unb64(s: string): Uint8Array {
  if (typeof s !== "string" || !/^[A-Za-z0-9+/]*={0,2}$/.test(s)) throw new VaultError("BAD_ENVELOPE", "invalid base64");
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
const subtle = () => {
  const c = (globalThis as { crypto?: Crypto }).crypto;
  if (!c?.subtle) throw new Error("WebCrypto is not available in this environment");
  return c;
};
function ctEq(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a[i] ^ b[i];
  return d === 0;
}
const headerAad = (e: Omit<Envelope, "ct">) => enc.encode(`${e.v}|${e.kdf}|${e.iter}|${e.salt}|${e.iv}|${e.check}`);

async function derive(password: string, salt: Uint8Array, iter: number): Promise<{ key: CryptoKey; check: Uint8Array }> {
  const c = subtle();
  const base = await c.subtle.importKey("raw", enc.encode(password.normalize("NFKC")), "PBKDF2", false, ["deriveBits"]);
  const bits = new Uint8Array(await c.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: salt as BufferSource, iterations: iter }, base, 512));
  const key = await c.subtle.importKey("raw", bits.slice(0, 32), "AES-GCM", false, ["encrypt", "decrypt"]);
  const check = new Uint8Array(await c.subtle.digest("SHA-256", bits.slice(32)));
  bits.fill(0);
  return { key, check };
}

/** Encrypt plaintext with a password; returns a JSON envelope string safe to store as note content. */
export async function lockText(plaintext: string, password: string, opts: { iterations?: number } = {}): Promise<string> {
  if (!password) throw new VaultError("BAD_ENVELOPE", "password required");
  const iter = opts.iterations ?? DEFAULT_ITERATIONS;
  if (!Number.isInteger(iter) || iter < MIN_ITER || iter > MAX_ITER) throw new RangeError("iterations out of range");
  const c = subtle();
  const salt = c.getRandomValues(new Uint8Array(16));
  const iv = c.getRandomValues(new Uint8Array(12));
  const { key, check } = await derive(password, salt, iter);
  const header = { v: 1 as const, kdf: "PBKDF2-SHA256" as const, iter, salt: b64(salt), iv: b64(iv), check: b64(check) };
  const ct = new Uint8Array(await c.subtle.encrypt({ name: "AES-GCM", iv: iv as BufferSource, additionalData: headerAad(header) as BufferSource }, key, enc.encode(plaintext)));
  return JSON.stringify({ ...header, ct: b64(ct) });
}

export function isLockedEnvelope(s: string): boolean {
  try { const o = JSON.parse(s); return !!o && o.v === 1 && o.kdf === "PBKDF2-SHA256" && typeof o.ct === "string"; } catch { return false; }
}

/** Decrypt an envelope. Throws VaultError: WRONG_PASSWORD | TAMPERED | BAD_ENVELOPE | UNSUPPORTED_VERSION. */
export async function unlockText(envelope: string, password: string): Promise<string> {
  let o: Envelope;
  try { o = JSON.parse(envelope); } catch { throw new VaultError("BAD_ENVELOPE", "not JSON"); }
  if (!o || typeof o !== "object") throw new VaultError("BAD_ENVELOPE");
  if (o.v !== 1) throw new VaultError("UNSUPPORTED_VERSION", `unsupported envelope version ${String((o as { v?: unknown }).v)}`);
  if (o.kdf !== "PBKDF2-SHA256" || !Number.isInteger(o.iter) || o.iter < MIN_ITER || o.iter > MAX_ITER) throw new VaultError("BAD_ENVELOPE", "bad kdf parameters");
  const salt = unb64(o.salt), iv = unb64(o.iv), check = unb64(o.check), ct = unb64(o.ct);
  if (salt.length !== 16 || iv.length !== 12 || check.length !== 32 || ct.length < 16 || ct.length > MAX_CT_BYTES) throw new VaultError("BAD_ENVELOPE", "bad field sizes");
  const { key, check: derivedCheck } = await derive(password ?? "", salt, o.iter);
  if (!ctEq(check, derivedCheck)) {
    // Could also be a tampered `check`; indistinguishable from a wrong password by design.
    throw new VaultError("WRONG_PASSWORD");
  }
  try {
    const pt = await subtle().subtle.decrypt({ name: "AES-GCM", iv: iv as BufferSource, additionalData: headerAad(o) as BufferSource }, key, ct as BufferSource);
    return dec.decode(pt);
  } catch {
    throw new VaultError("TAMPERED", "ciphertext or header failed authentication");
  }
}

/** Re-encrypt under a new password (requires the old one). */
export async function changePassword(envelope: string, oldPassword: string, newPassword: string, opts: { iterations?: number } = {}): Promise<string> {
  return lockText(await unlockText(envelope, oldPassword), newPassword, opts);
}
