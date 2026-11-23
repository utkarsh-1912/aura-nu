import React, { useState, useEffect, useMemo } from "react";
import {
  Layout, Sliders, Keyboard, HardDrive, Bell, Sparkles, Globe, Sun, Moon, Monitor,
  CreditCard, Key, Shield, Plus, Trash2, RefreshCw, Link, Check, AlertCircle,
} from "lucide-react";
import { Settings } from "../types";
import { Dialog, Button, IconButton, Input, Field, Select, Switch, Segmented, Badge, Kbd, EmptyState, cn } from "../ui";
import { SettingsGroup, SettingRow, InfoBanner, DataTable } from "./settings/parts";
import { FileUp } from "lucide-react";
import { FLAG_TIPTAP_EDITOR, useFlag } from "../features/flags";
import ImportPanel from "../features/import/ImportPanel";
import type { ImportPlan } from "../features/import/plan";
import VaultSettings from "../features/desktop/VaultSettings";
import type { Folder } from "../types";

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: Settings;
  onUpdateSettings: (settings: Settings) => void;
  theme: "light" | "dark" | "system";
  setTheme: (theme: "light" | "dark" | "system") => void;
  currentUserEmail: string;
  notes?: any[];
  onForceSync?: () => Promise<void>;
  onClearCache?: () => Promise<void>;
  /** Enables Settings > Import. */
  importContext?: { workspaceId: string; folders: Folder[]; onImport: (plan: ImportPlan) => void };
}

type TabType =
  | "appearance" | "editor" | "language" | "notifications" | "storage"
  | "privacy" | "ai" | "integrations" | "billing" | "apikeys" | "shortcuts" | "import";

const NAV: { group: string; items: { id: TabType; label: string; icon: React.ComponentType<{ size?: number }> }[] }[] = [
  { group: "Preferences", items: [
    { id: "language", label: "General", icon: Globe },
    { id: "appearance", label: "Appearance", icon: Layout },
    { id: "editor", label: "Editor", icon: Sliders },
    { id: "notifications", label: "Notifications", icon: Bell },
    { id: "shortcuts", label: "Shortcuts", icon: Keyboard },
  ] },
  { group: "Intelligence", items: [{ id: "ai", label: "AI", icon: Sparkles }] },
  { group: "Data", items: [
    { id: "storage", label: "Sync & storage", icon: HardDrive },
    { id: "import", label: "Import", icon: FileUp },
    { id: "integrations", label: "Connected accounts", icon: Link },
    { id: "apikeys", label: "API keys", icon: Key },
  ] },
  { group: "Account", items: [
    { id: "privacy", label: "Privacy & security", icon: Shield },
    { id: "billing", label: "Billing & plan", icon: CreditCard },
  ] },
];
const ALL_ITEMS = NAV.flatMap((g) => g.items);

const FONT_ITEMS = [
  { id: "sm" as const, label: "Small" },
  { id: "base" as const, label: "Normal" },
  { id: "lg" as const, label: "Large" },
  { id: "xl" as const, label: "XL" },
];

const SHORTCUTS: [string, string[]][] = [
  ["Search / action palette", ["Ctrl", "K"]],
  ["New note", ["Alt", "N"]],
  ["Toggle settings", ["Alt", "S"]],
  ["Toggle focus mode", ["Alt", "F"]],
  ["Duplicate note", ["Alt", "D"]],
  ["Archive note", ["Alt", "A"]],
  ["Trash note", ["Alt", "T"]],
  ["Lock / unlock note", ["Alt", "L"]],
  ["Slash commands", ["/"]],
];

function usePersisted(key: string, initial: boolean) {
  const [v, setV] = useState<boolean>(() => {
    const saved = localStorage.getItem(key);
    return saved !== null ? saved === "true" : initial;
  });
  const set = (next: boolean) => {
    setV(next);
    localStorage.setItem(key, String(next));
  };
  return [v, set] as const;
}

export default function SettingsModal({
  isOpen, onClose, settings, onUpdateSettings, theme, setTheme, currentUserEmail, notes = [], onForceSync, onClearCache, importContext,
}: SettingsModalProps) {
  const [tiptapOn, setTiptapOn] = useFlag(FLAG_TIPTAP_EDITOR);
  const [activeTab, setActiveTab] = useState<TabType>("appearance");

  const [language, setLanguage] = useState(() => localStorage.getItem(`aura-language-${currentUserEmail}`) || "en");
  const [soundAlerts, setSoundAlerts] = usePersisted(`aura-soundAlerts-${currentUserEmail}`, true);
  const [desktopNotif, setDesktopNotif] = usePersisted(`aura-desktopNotif-${currentUserEmail}`, true);
  const [newsletterAlerts, setNewsletterAlerts] = usePersisted(`aura-newsletterAlerts-${currentUserEmail}`, false);
  const [twoFactorActive, setTwoFactorActive] = usePersisted(`aura-twoFactorActive-${currentUserEmail}`, false);

  const [aiModel, setAiModel] = useState(settings.aiModel || "gemini-3.5-flash");
  const [aiTemperature, setAiTemperature] = useState(() => {
    const saved = localStorage.getItem(`aura-aiTemperature-${currentUserEmail}`);
    return saved !== null ? parseFloat(saved) : 0.7;
  });

  const [isSyncingNow, setIsSyncingNow] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [lastSync, setLastSync] = useState<Date | null>(null);
  const [syncStatus, setSyncStatus] = useState<{ tone: "info" | "warning" | "danger"; text: string } | null>(null);

  const [apiTokens, setApiTokens] = useState<{ id: string; name: string; key: string; created: string }[]>(() => {
    const saved = localStorage.getItem(`aura-api-tokens-${currentUserEmail}`);
    return saved ? JSON.parse(saved) : [{ id: "tok-1", name: "Production Retries", key: "aura_live_21h17sXy...uN89", created: "2026-06-12" }];
  });
  const [newTokenName, setNewTokenName] = useState("");

  useEffect(() => {
    localStorage.setItem(`aura-api-tokens-${currentUserEmail}`, JSON.stringify(apiTokens));
  }, [apiTokens, currentUserEmail]);

  const storageUsed = useMemo(() => (notes.reduce((acc, note) => acc + (note.content?.length || 0), 0) / 1024).toFixed(2), [notes]);
  const storagePercentage = useMemo(() => Math.min((parseFloat(storageUsed) / 5120) * 100, 100).toFixed(1), [storageUsed]);

  const currentBrowser = useMemo(() => {
    const ua = navigator.userAgent;
    if (ua.includes("Chrome") && !ua.includes("Chromium") && !ua.includes("Edg")) return "Chrome";
    if (ua.includes("Safari") && !ua.includes("Chrome")) return "Safari";
    if (ua.includes("Firefox")) return "Firefox";
    if (ua.includes("Edg")) return "Edge";
    return "Web Browser";
  }, []);
  const currentOS = useMemo(() => {
    const ua = navigator.userAgent;
    if (ua.includes("Windows")) return "Windows";
    if (ua.includes("Macintosh") || ua.includes("Mac OS X")) return "macOS";
    if (ua.includes("Linux")) return "Linux";
    if (ua.includes("Android")) return "Android";
    if (ua.includes("iPhone") || ua.includes("iPad")) return "iOS";
    return "Desktop Client";
  }, []);

  const [integrations, setIntegrations] = useState<{ [key: string]: boolean }>(() => {
    const saved = localStorage.getItem(`aura-integrations-${currentUserEmail}`);
    return saved ? JSON.parse(saved) : { "Google Drive Backup": true, "Slack Communications": false, "GitHub Repository Sync": false };
  });
  const toggleIntegration = (name: string) => {
    const updated = { ...integrations, [name]: !integrations[name] };
    setIntegrations(updated);
    localStorage.setItem(`aura-integrations-${currentUserEmail}`, JSON.stringify(updated));
  };

  const nextRenewalDate = useMemo(() => {
    const d = new Date();
    d.setMonth(d.getMonth() + 1);
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  }, []);

  if (!isOpen) return null;

  const toggleTheme = (t: "light" | "dark" | "system") => {
    setTheme(t);
    onUpdateSettings({ ...settings, theme: t });
  };

  const handleForceSync = async () => {
    setIsSyncingNow(true);
    setSyncStatus(null);
    try {
      if (onForceSync) await onForceSync();
      setLastSync(new Date());
      setSyncStatus({ tone: "info", text: "Sync complete. Your notes are up to date with the server." });
    } catch {
      setSyncStatus({ tone: "danger", text: "Sync failed. Check your connection and try again." });
    } finally {
      setIsSyncingNow(false);
    }
  };

  const handleClearCache = async () => {
    setIsSyncingNow(true);
    setSyncStatus(null);
    setConfirmClear(false);
    try {
      if (onClearCache) await onClearCache();
      setLastSync(new Date());
      setSyncStatus({ tone: "info", text: "Offline cache cleared and re-downloaded from the server." });
    } catch {
      setSyncStatus({ tone: "danger", text: "Could not clear the local cache. Try again." });
    } finally {
      setIsSyncingNow(false);
    }
  };

  const handleGenerateToken = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTokenName.trim()) return;
    const keyVal = `aura_live_${Math.random().toString(36).substring(2, 10)}${Math.random().toString(36).substring(2, 10)}`;
    setApiTokens([
      ...apiTokens,
      {
        id: `tok-${Date.now()}`,
        name: newTokenName.trim(),
        key: `${keyVal.substring(0, 14)}...${keyVal.substring(keyVal.length - 4)}`,
        created: new Date().toISOString().split("T")[0],
      },
    ]);
    setNewTokenName("");
  };
  const handleDeleteToken = (id: string) => setApiTokens(apiTokens.filter((t) => t.id !== id));

  const activeItem = ALL_ITEMS.find((t) => t.id === activeTab)!;

  return (
    <Dialog open={isOpen} onClose={onClose} title="Settings" size="xl" className="sm:h-[600px]">
      <div id="settings-modal-overlay" className="flex min-h-[420px] flex-col gap-4 sm:h-full sm:min-h-0 sm:flex-row sm:gap-6">
        {/* Nav: top list on phones, left column from sm */}
        <nav aria-label="Settings sections" className="shrink-0 sm:w-48 sm:overflow-y-auto sm:border-r sm:border-line sm:pr-3">
          <div className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1 sm:mx-0 sm:flex-col sm:gap-4 sm:overflow-visible sm:px-0 sm:pb-0">
            {NAV.map((g) => (
              <div key={g.group} className="flex gap-1 sm:flex-col">
                <p className="hidden px-2 pb-1 text-[11px] font-medium uppercase tracking-wide text-fg-subtle sm:block">{g.group}</p>
                {g.items.map((t) => {
                  const on = t.id === activeTab;
                  return (
                    <button
                      key={t.id}
                      onClick={() => setActiveTab(t.id)}
                      aria-current={on ? "page" : undefined}
                      className={cn(
                        "flex h-10 shrink-0 items-center gap-2 whitespace-nowrap rounded-md px-2.5 text-[13px] font-medium transition-colors sm:h-8",
                        "focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent",
                        on ? "bg-accent-soft text-accent" : "text-fg-muted hover:bg-hover hover:text-fg",
                      )}
                    >
                      <t.icon size={14} />
                      {t.label}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        </nav>

        <div className="min-w-0 flex-1 sm:overflow-y-auto sm:pr-1" role="region" aria-label={activeItem.label}>
          <h3 className="mb-3 text-[16px] font-semibold text-fg">{activeItem.label}</h3>

          {activeTab === "appearance" && (
            <SettingsGroup>
              <SettingRow title="Theme" hint="Choose a light or dark interface, or follow your device.">
                <Segmented
                  value={theme}
                  onChange={toggleTheme}
                  items={[
                    { id: "light", label: "Light", icon: <Sun size={13} /> },
                    { id: "dark", label: "Dark", icon: <Moon size={13} /> },
                    { id: "system", label: "System", icon: <Monitor size={13} /> },
                  ]}
                />
              </SettingRow>
              <SettingRow title="Match system theme" hint="Switch automatically with your operating system.">
                <Switch label="Match system theme" checked={theme === "system"} onChange={(v) => toggleTheme(v ? "system" : "light")} />
              </SettingRow>
            </SettingsGroup>
          )}

          {activeTab === "editor" && (
            <SettingsGroup>
              <SettingRow title="Font size" hint="Scale the editor text for comfortable reading.">
                <Segmented value={settings.fontSize} onChange={(sz) => onUpdateSettings({ ...settings, fontSize: sz })} items={FONT_ITEMS} />
              </SettingRow>
              <SettingRow title="Auto-save to cloud" hint="Sync edits to the server as you type.">
                <Switch label="Auto-save to cloud" checked={!!settings.autoSave} onChange={() => onUpdateSettings({ ...settings, autoSave: !settings.autoSave })} />
              </SettingRow>
              <SettingRow title="New editor (beta)" hint="Rich-text editor with [[wikilinks]], task lists and tables. Notes stay Markdown. Off by default.">
                <Switch label="New editor (beta)" checked={tiptapOn} onChange={setTiptapOn} />
              </SettingRow>
              <SettingRow title="Line wrapping" hint="Wrap long lines instead of scrolling horizontally.">
                <Switch label="Line wrapping" checked={!!settings.lineWrapping} onChange={() => onUpdateSettings({ ...settings, lineWrapping: !settings.lineWrapping })} />
              </SettingRow>
            </SettingsGroup>
          )}

          {activeTab === "import" && (
            importContext ? <ImportPanel workspaceId={importContext.workspaceId} folders={importContext.folders} onImport={importContext.onImport} /> : <p className="text-[13px] text-fg-muted">Import is not available here.</p>
          )}

          {activeTab === "language" && (
            <SettingsGroup>
              <Field label="Language" hint="AI responses are translated to this language.">
                {(p) => (
                  <Select
                    {...p}
                    value={language}
                    onChange={(e) => {
                      setLanguage(e.target.value);
                      localStorage.setItem(`aura-language-${currentUserEmail}`, e.target.value);
                    }}
                  >
                    <option value="en">English (United States)</option>
                    <option value="es">Español</option>
                    <option value="de">Deutsch</option>
                    <option value="ja">日本語</option>
                    <option value="hi">हिन्दी</option>
                  </Select>
                )}
              </Field>
            </SettingsGroup>
          )}

          {activeTab === "notifications" && (
            <SettingsGroup>
              <SettingRow title="Sound alerts" hint="Play a soft tone on sync success or timer expiry.">
                <Switch label="Sound alerts" checked={soundAlerts} onChange={setSoundAlerts} />
              </SettingRow>
              <SettingRow title="Desktop notifications" hint="Show a banner in your operating system.">
                <Switch label="Desktop notifications" checked={desktopNotif} onChange={setDesktopNotif} />
              </SettingRow>
              <SettingRow title="Product newsletter" hint="Weekly tips on workflows.">
                <Switch label="Product newsletter" checked={newsletterAlerts} onChange={setNewsletterAlerts} />
              </SettingRow>
            </SettingsGroup>
          )}

          {activeTab === "storage" && <VaultSettings />}
          {activeTab === "storage" && (
            <div className="space-y-6">
              <SettingsGroup title="Status" description="Notes sync to the server; a copy is kept offline in this browser.">
                <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {[
                    ["Last sync", lastSync ? lastSync.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "None this session"],
                    ["Notes", String(notes.length)],
                    ["Auto-save", settings.autoSave ? "On" : "Off"],
                  ].map(([k, v]) => (
                    <div key={k} className="rounded-lg border border-line bg-panel px-3 py-2.5">
                      <dt className="text-[12px] text-fg-muted">{k}</dt>
                      <dd className="mt-0.5 text-[14px] font-medium text-fg">{v}</dd>
                    </div>
                  ))}
                </dl>
                <div>
                  <div
                    role="progressbar"
                    aria-label="Storage used"
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={parseFloat(storagePercentage)}
                    className="h-1.5 w-full overflow-hidden rounded-full bg-hover"
                  >
                    <div className="h-full rounded-full bg-accent transition-[width] duration-200" style={{ width: `${storagePercentage}%` }} />
                  </div>
                  <div className="mt-1.5 flex justify-between text-[12px] text-fg-muted">
                    <span>~{storageUsed} KB used</span>
                    <span>5.0 MB allotment</span>
                  </div>
                </div>
              </SettingsGroup>

              {syncStatus && (
                <div role={syncStatus.tone === "danger" ? "alert" : "status"}>
                  <InfoBanner tone={syncStatus.tone}>
                    <span className="inline-flex items-center gap-1.5">
                      {syncStatus.tone === "danger" ? <AlertCircle size={13} className="text-danger" /> : <Check size={13} className="text-success" />}
                      {syncStatus.text}
                    </span>
                  </InfoBanner>
                </div>
              )}

              <SettingsGroup title="Actions">
                <div className="flex flex-wrap gap-2">
                  <Button variant="primary" loading={isSyncingNow} onClick={handleForceSync} leadingIcon={<RefreshCw size={13} />}>
                    {isSyncingNow ? "Syncing..." : "Force sync"}
                  </Button>
                  <Button variant="secondary" disabled={isSyncingNow} onClick={() => setConfirmClear(true)}>
                    Clear offline cache
                  </Button>
                </div>
                {confirmClear && (
                  <div role="alertdialog" aria-label="Confirm clear cache" className="rounded-lg border border-line bg-danger-soft p-3">
                    <p className="text-[13px] font-medium text-fg">Clear the offline cache?</p>
                    <p className="mt-0.5 text-[12px] text-fg-muted">
                      Local copies of {notes.length} notes are removed and downloaded again from the server. Unsynced changes may be lost.
                    </p>
                    <div className="mt-3 flex gap-2">
                      <Button variant="danger" size="sm" onClick={handleClearCache}>Clear cache</Button>
                      <Button variant="ghost" size="sm" onClick={() => setConfirmClear(false)} data-autofocus>Cancel</Button>
                    </div>
                  </div>
                )}
              </SettingsGroup>
            </div>
          )}

          {activeTab === "privacy" && (
            <div className="space-y-6">
              <SettingsGroup>
                <SettingRow title="Two-factor authentication" hint="Require a 6-digit code when signing in.">
                  <Switch label="Two-factor authentication" checked={twoFactorActive} onChange={setTwoFactorActive} />
                </SettingRow>
              </SettingsGroup>
              <SettingsGroup title="Active sessions">
                <DataTable
                  head={["Device", "IP address", "Status"]}
                  rows={[
                    [`${currentBrowser} (${currentOS})`, "127.0.0.1", <Badge key="a" tone="success">Active now</Badge>],
                    ["iPhone 15 mobile client", "124.90.11.45", <span key="b" className="text-fg-muted">2 hours ago</span>],
                  ]}
                />
              </SettingsGroup>
            </div>
          )}

          {activeTab === "ai" && (
            <SettingsGroup>
              <Field label="Model" hint="Used for summaries, rewrites and agent runs.">
                {(p) => (
                  <Select
                    {...p}
                    value={aiModel}
                    onChange={(e) => {
                      setAiModel(e.target.value);
                      onUpdateSettings({ ...settings, aiModel: e.target.value });
                    }}
                  >
                    <option value="gemini-3.5-flash">Gemini 3.5 Flash (fast)</option>
                    <option value="gemini-1.5-pro">Gemini 1.5 Pro (deep reasoning)</option>
                    <option value="claude-3.5-sonnet">Claude 3.5 Sonnet (long-form drafting)</option>
                  </Select>
                )}
              </Field>
              <Field label={`Creativity: ${aiTemperature} (${aiTemperature < 0.4 ? "precise" : aiTemperature > 0.8 ? "creative" : "balanced"})`}>
                {(p) => (
                  <input
                    id={p.id}
                    aria-describedby={p["aria-describedby"]}
                    type="range"
                    min="0.1"
                    max="1.2"
                    step="0.1"
                    value={aiTemperature}
                    onChange={(e) => {
                      const val = parseFloat(e.target.value);
                      setAiTemperature(val);
                      localStorage.setItem(`aura-aiTemperature-${currentUserEmail}`, String(val));
                    }}
                    className="h-6 w-full cursor-pointer accent-[var(--c-accent)]"
                  />
                )}
              </Field>
            </SettingsGroup>
          )}

          {activeTab === "integrations" && (
            <SettingsGroup description="Connect tools to sync notes as tickets, specs or backups.">
              <ul className="space-y-2">
                {[
                  { name: "Google Drive Backup", desc: "Export PDFs into private Drive folders.", icon: HardDrive },
                  { name: "Slack Communications", desc: "Post minutes and summaries to channels.", icon: Link },
                  { name: "GitHub Repository Sync", desc: "Commit Markdown files to a repository on save.", icon: Key },
                ].map((item) => {
                  const on = !!integrations[item.name];
                  return (
                    <li key={item.name} className="flex items-center gap-3 rounded-lg border border-line bg-panel p-3">
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-hover text-fg-muted"><item.icon size={14} /></span>
                      <div className="min-w-0 flex-1">
                        <p className="text-[13px] font-medium text-fg">{item.name}</p>
                        <p className="text-[12px] text-fg-muted">{item.desc}</p>
                      </div>
                      <Button size="sm" variant={on ? "secondary" : "primary"} aria-pressed={on} onClick={() => toggleIntegration(item.name)} leadingIcon={on ? <Check size={12} /> : undefined}>
                        {on ? "Linked" : "Connect"}
                      </Button>
                    </li>
                  );
                })}
              </ul>
            </SettingsGroup>
          )}

          {activeTab === "billing" && (
            <div className="space-y-6">
              <div className="rounded-lg border border-line bg-panel p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-[12px] text-fg-muted">Current plan</p>
                    <p className="mt-0.5 text-[16px] font-semibold text-fg">Aura Pro Enterprise</p>
                  </div>
                  <Badge tone="success">Active</Badge>
                </div>
                <div className="mt-3 flex justify-between border-t border-line pt-3 text-[12px] text-fg-muted">
                  <span>$12 / month</span>
                  <span>Renews {nextRenewalDate}</span>
                </div>
              </div>
              <SettingsGroup title="Invoices">
                <DataTable head={["Invoice", "Date", "Receipt"]} rows={[["#INV-405111", "2026-07-05", <span key="d" className="text-accent">Download</span>]]} />
              </SettingsGroup>
            </div>
          )}

          {activeTab === "apikeys" && (
            <div className="space-y-4">
              <p className="text-[12px] text-fg-muted">Access your notes from external scripts. Name a key to generate it.</p>
              <form onSubmit={handleGenerateToken} className="flex items-end gap-2">
                <div className="flex-1">
                  <Field label="Key label">
                    {(p) => <Input {...p} value={newTokenName} onChange={(e) => setNewTokenName(e.target.value)} placeholder="e.g. CI pipeline" />}
                  </Field>
                </div>
                <Button type="submit" variant="primary" leadingIcon={<Plus size={13} />}>Generate</Button>
              </form>
              {apiTokens.length === 0 ? (
                <EmptyState icon={<Key size={18} />} title="No API keys" description="Generate a key to call the Aura API." />
              ) : (
                <ul className="space-y-2">
                  {apiTokens.map((tok) => (
                    <li key={tok.id} className="flex items-center justify-between gap-3 rounded-lg border border-line bg-panel p-3">
                      <div className="min-w-0">
                        <p className="truncate text-[13px] font-medium text-fg">{tok.name}</p>
                        <p className="truncate font-mono text-[12px] text-fg-muted">{tok.key}</p>
                      </div>
                      <IconButton label={`Delete key ${tok.name}`} onClick={() => handleDeleteToken(tok.id)} className="max-sm:!h-10 max-sm:!w-10 hover:!text-danger">
                        <Trash2 size={14} />
                      </IconButton>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {activeTab === "shortcuts" && (
            <SettingsGroup>
              <SettingRow title="Keyboard shortcuts" hint="Enable or disable global shortcuts.">
                <Switch label="Keyboard shortcuts" checked={settings.shortcutsEnabled !== false} onChange={() => onUpdateSettings({ ...settings, shortcutsEnabled: settings.shortcutsEnabled === false })} />
              </SettingRow>
              <ul className="rounded-lg border border-line">
                {SHORTCUTS.map(([cmd, keys]) => (
                  <li key={cmd} className="flex items-center justify-between gap-3 border-b border-line px-3 py-2 last:border-b-0">
                    <span className="text-[13px] text-fg">{cmd}</span>
                    <span className="flex items-center gap-1">
                      {keys.map((k) => <Kbd key={k}>{k}</Kbd>)}
                    </span>
                  </li>
                ))}
              </ul>
            </SettingsGroup>
          )}
        </div>
      </div>
    </Dialog>
  );
}
