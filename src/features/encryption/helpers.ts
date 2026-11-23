/**
 * Opt-in "Encrypt this note" (vaultCrypto: AES-GCM, PBKDF2-SHA256 600k). SEPARATE from the legacy read-only
 * Lock toggle, which stays a plain flag.
 *
 *  - Marker: note.content IS the JSON envelope ({"v":1,"kdf":"PBKDF2-SHA256",...}); detect with isEncryptedNote().
 *    note.isLocked is also set so every legacy surface treats the note as read-only.
 *  - versionHistory is wiped on encrypt (its snapshots are plaintext).
 *  - Title, folder, tags, timestamps, word count and the ciphertext length stay visible (not hidden).
 *  - There is NO password recovery. Lose the password and the content is gone.
 *  - Encrypted notes are indexed by title only (see indexes/noteIndexer.ts).
 */
import type { Note } from "../../types";
import { changePassword, lockText, unlockText, VaultError } from "../../core/vaultCrypto";
import { isEncryptedContent } from "../indexes/noteIndexer";
import { countWords, readingTimeOf } from "../noteUtils";

export const isEncryptedNote = (note: Pick<Note, "content"> | null | undefined): boolean => !!note && isEncryptedContent(note.content);

export async function encryptNote(note: Note, password: string, now: Date = new Date()): Promise<Note> {
  if (isEncryptedNote(note)) throw new Error("Note is already encrypted");
  const envelope = await lockText(note.content, password);
  return { ...note, content: envelope, isLocked: true, versionHistory: [], updatedAt: now.toISOString() };
}

/** Decrypts to a string for in-memory viewing; never persisted. */
export const viewEncrypted = (note: Note, password: string): Promise<string> => unlockText(note.content, password);

export async function removeEncryption(note: Note, password: string, now: Date = new Date()): Promise<Note> {
  const plain = await unlockText(note.content, password);
  const words = countWords(plain);
  return { ...note, content: plain, isLocked: false, wordCount: words, readingTime: readingTimeOf(words), versionHistory: [], updatedAt: now.toISOString() };
}

export async function changeNotePassword(note: Note, oldPw: string, newPw: string, now: Date = new Date()): Promise<Note> {
  return { ...note, content: await changePassword(note.content, oldPw, newPw), updatedAt: now.toISOString() };
}

export function describeVaultError(e: unknown): string {
  if (e instanceof VaultError) {
    if (e.code === "WRONG_PASSWORD") return "Wrong password.";
    if (e.code === "TAMPERED") return "This note failed its integrity check and cannot be decrypted.";
    return "This note's encrypted data is not readable.";
  }
  return "Something went wrong. Try again.";
}
