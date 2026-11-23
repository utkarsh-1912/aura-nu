/** Dialog + panel for opt-in note encryption. All strings are plain; no recovery exists and the UI says so. */
import React, { useEffect, useState } from "react";
import { KeyRound, Lock } from "lucide-react";
import type { Note } from "../../types";
import { Button, Dialog, EmptyState, Field, Input } from "../../ui";
import { changeNotePassword, describeVaultError, encryptNote, removeEncryption, viewEncrypted } from "./helpers";

const MIN_LEN = 8;

export function EncryptNoteDialog({ open, note, onClose, onEncrypted }: { open: boolean; note: Note; onClose: () => void; onEncrypted: (n: Note) => void }) {
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => { if (open) { setPw(""); setPw2(""); setError(""); setBusy(false); } }, [open]);

  const submit = async () => {
    if (pw.length < MIN_LEN) { setError(`Use at least ${MIN_LEN} characters.`); return; }
    if (pw !== pw2) { setError("The passwords do not match."); return; }
    setBusy(true);
    try {
      onEncrypted(await encryptNote(note, pw));
      onClose();
    } catch (e) {
      setError(describeVaultError(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={busy ? () => {} : onClose}
      title="Encrypt this note"
      description="The content is encrypted on this device with your password (AES-256-GCM)."
      size="sm"
      footer={<div className="flex justify-end gap-2"><Button variant="secondary" onClick={onClose} disabled={busy}>Cancel</Button><Button variant="primary" loading={busy} onClick={submit}>Encrypt note</Button></div>}
    >
      <div className="space-y-3">
        <p className="rounded-lg border border-line bg-warning-soft px-3 py-2 text-[12px] text-fg">
          There is no password recovery. If you forget this password the note cannot be opened by anyone, including Aura.
          Title, folder, tags and note length stay visible. Earlier version history of this note is deleted. Encrypted notes are not searched and not sent to AI.
        </p>
        <Field label="Password">{(p) => <Input {...p} type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} />}</Field>
        <Field label="Confirm password" error={error}>{(p) => <Input {...p} type="password" autoComplete="new-password" value={pw2} onChange={(e) => setPw2(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") void submit(); }} />}</Field>
      </div>
    </Dialog>
  );
}

/** Replaces the note body for an encrypted note. Decrypted text is held in component state only. */
export function EncryptedNotePanel({ note, onUpdateNote }: { note: Note; onUpdateNote: (n: Note) => void }) {
  const [pw, setPw] = useState("");
  const [plain, setPlain] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [changing, setChanging] = useState(false);
  const [newPw, setNewPw] = useState("");

  useEffect(() => { setPw(""); setPlain(null); setError(""); setChanging(false); setNewPw(""); }, [note.id]);
  // Hide again whenever the stored envelope changes (sync from another device, password change).
  useEffect(() => { setPlain(null); }, [note.content]);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true); setError("");
    try { await fn(); } catch (e) { setError(describeVaultError(e)); } finally { setBusy(false); }
  };

  return (
    <div className="mx-auto w-full max-w-[720px] px-4 py-6 sm:px-6" id="encrypted-note-panel">
      {plain === null ? (
        <EmptyState
          icon={<Lock size={18} />}
          title="This note is encrypted"
          description="Enter the password to read it. Nothing is stored decrypted, and there is no way to recover a forgotten password."
          action={
            <form className="flex w-full max-w-xs flex-col gap-2" onSubmit={(e) => { e.preventDefault(); void run(async () => setPlain(await viewEncrypted(note, pw))); }}>
              <Input aria-label="Password" type="password" autoComplete="current-password" value={pw} onChange={(e) => setPw(e.target.value)} invalid={!!error} />
              {error && <p role="alert" className="text-[12px] text-danger">{error}</p>}
              <Button type="submit" variant="primary" loading={busy} disabled={!pw}>Unlock to read</Button>
            </form>
          }
        />
      ) : (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" variant="secondary" onClick={() => { setPlain(null); setPw(""); }}>Hide</Button>
            <Button size="sm" variant="secondary" loading={busy} onClick={() => void run(async () => onUpdateNote(await removeEncryption(note, pw)))}>Remove encryption</Button>
            <Button size="sm" variant="ghost" leadingIcon={<KeyRound size={13} />} onClick={() => setChanging(!changing)}>Change password</Button>
          </div>
          {changing && (
            <form className="flex flex-wrap items-end gap-2" onSubmit={(e) => { e.preventDefault(); if (newPw.length < MIN_LEN) { setError(`Use at least ${MIN_LEN} characters.`); return; } void run(async () => { onUpdateNote(await changeNotePassword(note, pw, newPw)); setChanging(false); setNewPw(""); setPw(newPw); }); }}>
              <Input aria-label="New password" type="password" autoComplete="new-password" className="max-w-xs" value={newPw} onChange={(e) => setNewPw(e.target.value)} />
              <Button type="submit" size="sm" variant="primary" loading={busy}>Save password</Button>
            </form>
          )}
          {error && <p role="alert" className="text-[12px] text-danger">{error}</p>}
          <p className="text-[12px] text-fg-muted">Read-only view. To edit, remove encryption first, then encrypt again when you are done.</p>
          <pre className="whitespace-pre-wrap break-words rounded-lg border border-line bg-panel p-4 font-sans text-[14.5px] leading-relaxed text-fg">{plain}</pre>
        </div>
      )}
    </div>
  );
}
