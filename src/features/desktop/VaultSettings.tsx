/** Settings row for the local-folder vault (desktop app only). Renders nothing in the browser. UNVERIFIED. */
import React, { useEffect, useState } from "react";
import { FolderOpen } from "lucide-react";
import { isDesktop, vault, type VaultInfo } from "../../desktop/bridge";
import { Button } from "../../ui";
import { SettingRow, SettingsGroup } from "../../components/settings/parts";

export default function VaultSettings() {
  const desktop = isDesktop();
  const [info, setInfo] = useState<VaultInfo | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!desktop) return;
    void vault.current().then((r) => { if (r.ok) setInfo(r.value); });
  }, [desktop]);
  if (!desktop) return null;

  const pick = async () => {
    setBusy(true); setError("");
    const r = await vault.pick();
    setBusy(false);
    if (r.ok) { if (r.value) setInfo(r.value); } else { const f = r as { reason?: string; error?: string }; setError(f.reason === "error" ? f.error ?? "Could not open the folder." : "Desktop runtime unavailable."); }
  };
  const close = async () => {
    setBusy(true);
    const r = await vault.close();
    setBusy(false);
    if (r.ok) setInfo(null);
  };

  return (
    <SettingsGroup title="Local vault" description="Keep notes as Markdown files in a folder you choose. Edits in either place are merged; conflicts are kept as separate notes.">
      <SettingRow title={info ? info.name : "No folder selected"} hint={info ? info.root : "Choose a folder to sync with this workspace."}>
        <div className="flex gap-2">
          <Button variant="secondary" size="sm" leadingIcon={<FolderOpen size={13} />} loading={busy} onClick={() => void pick()}>{info ? "Change folder" : "Choose folder"}</Button>
          {info && <Button variant="ghost" size="sm" disabled={busy} onClick={() => void close()}>Disconnect</Button>}
        </div>
      </SettingRow>
      {error && <p role="alert" className="text-[12px] text-danger">{error}</p>}
    </SettingsGroup>
  );
}
