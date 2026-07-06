import React, { useState, useEffect } from "react";
import {
  X,
  User,
  Layout,
  Sliders,
  Keyboard,
  HardDrive,
  Bell,
  Sparkles,
  Lock,
  Globe,
  Sun,
  Moon,
  Check,
  CreditCard,
  Key,
  Shield,
  Activity,
  Plus,
  Trash2,
  RefreshCw,
  Link,
  ChevronRight
} from "lucide-react";
import { Settings } from "../types";

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: Settings;
  onUpdateSettings: (settings: Settings) => void;
  theme: "light" | "dark" | "system";
  setTheme: (theme: "light" | "dark" | "system") => void;
  currentUserEmail: string;
  notes?: any[];
}

type TabType =
  | "appearance"
  | "editor"
  | "language"
  | "notifications"
  | "storage"
  | "privacy"
  | "ai"
  | "integrations"
  | "billing"
  | "apikeys"
  | "shortcuts";

export default function SettingsModal({
  isOpen,
  onClose,
  settings,
  onUpdateSettings,
  theme,
  setTheme,
  currentUserEmail,
  notes = [],
}: SettingsModalProps) {
  const [activeTab, setActiveTab] = useState<TabType>("appearance");

  // Local state extensions for all the new features
  const [language, setLanguage] = useState(() => {
    return localStorage.getItem(`aura-language-${currentUserEmail}`) || "en";
  });
  const [soundAlerts, setSoundAlerts] = useState(() => {
    const saved = localStorage.getItem(`aura-soundAlerts-${currentUserEmail}`);
    return saved !== null ? saved === "true" : true;
  });
  const [desktopNotif, setDesktopNotif] = useState(() => {
    const saved = localStorage.getItem(`aura-desktopNotif-${currentUserEmail}`);
    return saved !== null ? saved === "true" : true;
  });
  const [newsletterAlerts, setNewsletterAlerts] = useState(() => {
    const saved = localStorage.getItem(`aura-newsletterAlerts-${currentUserEmail}`);
    return saved === "true";
  });
  
  const [aiModel, setAiModel] = useState(settings.aiModel || "gemini-3.5-flash");
  const [aiTemperature, setAiTemperature] = useState(() => {
    const saved = localStorage.getItem(`aura-aiTemperature-${currentUserEmail}`);
    return saved !== null ? parseFloat(saved) : 0.7;
  });
  
  const [twoFactorActive, setTwoFactorActive] = useState(() => {
    const saved = localStorage.getItem(`aura-twoFactorActive-${currentUserEmail}`);
    return saved === "true";
  });
  const [isSyncingNow, setIsSyncingNow] = useState(false);

  // API key generator state
  const [apiTokens, setApiTokens] = useState<{ id: string; name: string; key: string; created: string }[]>(() => {
    const saved = localStorage.getItem(`aura-api-tokens-${currentUserEmail}`);
    return saved ? JSON.parse(saved) : [
      { id: "tok-1", name: "Production Retries", key: "aura_live_21h17sXy...uN89", created: "2026-06-12" },
    ];
  });
  const [newTokenName, setNewTokenName] = useState("");

  useEffect(() => {
    localStorage.setItem(`aura-api-tokens-${currentUserEmail}`, JSON.stringify(apiTokens));
  }, [apiTokens, currentUserEmail]);

  const activeTheme = React.useMemo<"light" | "dark">(() => {
    if (theme === "system") {
      const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
      return prefersDark ? "dark" : "light";
    }
    return theme;
  }, [theme]);

  const storageUsed = React.useMemo(() => {
    return (notes.reduce((acc, note) => acc + (note.content?.length || 0), 0) / 1024).toFixed(2); // KB
  }, [notes]);

  const storagePercentage = React.useMemo(() => {
    return Math.min((parseFloat(storageUsed) / 5120) * 100, 100).toFixed(1);
  }, [storageUsed]);

  const currentBrowser = React.useMemo(() => {
    const ua = navigator.userAgent;
    if (ua.includes("Chrome") && !ua.includes("Chromium") && !ua.includes("Edg")) return "Chrome";
    if (ua.includes("Safari") && !ua.includes("Chrome")) return "Safari";
    if (ua.includes("Firefox")) return "Firefox";
    if (ua.includes("Edg")) return "Edge";
    return "Web Browser";
  }, []);

  const currentOS = React.useMemo(() => {
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
    return saved ? JSON.parse(saved) : {
      "Google Drive Backup": true,
      "Slack Communications": false,
      "GitHub Repository Sync": false
    };
  });

  const toggleIntegration = (name: string) => {
    const updated = { ...integrations, [name]: !integrations[name] };
    setIntegrations(updated);
    localStorage.setItem(`aura-integrations-${currentUserEmail}`, JSON.stringify(updated));
  };

  const nextRenewalDate = React.useMemo(() => {
    const d = new Date();
    d.setMonth(d.getMonth() + 1);
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  }, []);

  if (!isOpen) return null;

  const tabs = [
    { id: "appearance", label: "Appearance", icon: Layout },
    { id: "editor", label: "Editor Preferences", icon: Sliders },
    { id: "language", label: "Language & Regional", icon: Globe },
    { id: "notifications", label: "Notifications", icon: Bell },
    { id: "storage", label: "Storage & Sync", icon: HardDrive },
    { id: "privacy", label: "Privacy & Security", icon: Shield },
    { id: "ai", label: "AI Preferences", icon: Sparkles },
    { id: "integrations", label: "Connected Accounts", icon: Link },
    { id: "billing", label: "Billing & Plans", icon: CreditCard },
    { id: "apikeys", label: "Developer API Keys", icon: Key },
    { id: "shortcuts", label: "Keyboard Shortcuts", icon: Keyboard },
  ] as const;

  const toggleTheme = (newTheme: "light" | "dark" | "system") => {
    setTheme(newTheme);
    onUpdateSettings({ ...settings, theme: newTheme });
  };

  const handleToggleAutoSave = () => {
    onUpdateSettings({ ...settings, autoSave: !settings.autoSave });
  };

  const handleToggleShortcuts = () => {
    onUpdateSettings({ ...settings, shortcutsEnabled: !settings.shortcutsEnabled });
  };

  const handleChangeFontSize = (size: Settings["fontSize"]) => {
    onUpdateSettings({ ...settings, fontSize: size });
  };

  const handleForceSync = () => {
    setIsSyncingNow(true);
    setTimeout(() => {
      setIsSyncingNow(false);
      alert("Aura database volumes synchronized with cloud nodes successfully.");
    }, 1200);
  };

  const handleGenerateToken = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTokenName.trim()) return;
    const keyVal = `aura_live_${Math.random().toString(36).substring(2, 10)}${Math.random().toString(36).substring(2, 10)}`;
    const newTok = {
      id: `tok-${Date.now()}`,
      name: newTokenName.trim(),
      key: `${keyVal.substring(0, 14)}...${keyVal.substring(keyVal.length - 4)}`,
      created: new Date().toISOString().split("T")[0],
    };
    setApiTokens([...apiTokens, newTok]);
    setNewTokenName("");
  };

  const handleDeleteToken = (id: string) => {
    setApiTokens(apiTokens.filter((t) => t.id !== id));
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs select-none">
      <div
        id="settings-modal"
        className={`w-full max-w-3xl h-[540px] rounded-3xl shadow-2xl flex flex-col md:flex-row border overflow-hidden transition-all ${
          activeTheme === "dark"
            ? "bg-[#141416] border-zinc-800 text-zinc-100 shadow-black/80"
            : "bg-white border-slate-200 text-slate-800"
        }`}
      >
        {/* Left tabs menu - collapses to a horizontal bar on mobile screens */}
        <div className={`w-full md:w-56 border-b md:border-b-0 md:border-r p-4 flex flex-col gap-1 overflow-x-auto md:overflow-y-auto shrink-0 ${
          activeTheme === "dark" ? "bg-zinc-950/20 border-zinc-800" : "bg-[#fafafc] border-slate-200"
        }`}>
          <div className="hidden md:block text-[10px] font-bold text-slate-400 dark:text-zinc-500 uppercase tracking-widest px-2 mb-3">
            Aura Settings
          </div>
          <div className="flex md:flex-col gap-1 w-full overflow-x-auto scrollbar-none pr-2">
            {tabs.map((tab) => {
              const isTabActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-all ${
                    isTabActive
                      ? activeTheme === "dark"
                        ? "bg-zinc-800 text-white"
                        : "bg-white text-slate-950 shadow-sm border border-slate-200/50"
                      : "text-slate-500 hover:text-slate-800 dark:text-zinc-400 dark:hover:text-white"
                  } cursor-pointer`}
                >
                  <tab.icon size={13.5} className={isTabActive ? "text-blue-500" : "opacity-60"} />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>
          <div className="hidden md:block mt-auto px-2 text-[9px] text-slate-400 dark:text-zinc-500 font-mono">
            Aura Suite v1.2.5 • Verified
          </div>
        </div>

        {/* Right content view area */}
        <div className="flex-grow flex flex-col min-w-0">
          {/* Header */}
          <div className="px-6 py-4 border-b border-slate-100 dark:border-zinc-850 flex items-center justify-between">
            <h3 className="font-display font-extrabold text-sm text-slate-900 dark:text-white uppercase tracking-wider">
              {tabs.find((t) => t.id === activeTab)?.label}
            </h3>
            <button
              id="settings-close-btn"
              onClick={onClose}
              className="p-1.5 hover:bg-slate-100 dark:hover:bg-zinc-800 rounded-xl text-slate-400 hover:text-slate-800 dark:text-zinc-500 dark:hover:text-zinc-200 transition-colors cursor-pointer"
            >
              <X size={15} />
            </button>
          </div>

          {/* Body with vertical scroll */}
          <div className="flex-grow overflow-y-auto p-6 text-xs leading-relaxed">
                       {/* 1. Appearance Tab */}
            {activeTab === "appearance" && (
              <div className="flex flex-col gap-5">
                <div>
                  <h4 className="font-semibold text-sm text-slate-900 dark:text-zinc-100 mb-1">Color Palette Theme</h4>
                  <p className="text-[11px] text-slate-400 dark:text-zinc-500">Pick the interface shade matching your current ambient setup.</p>
                  
                  <div className="grid grid-cols-3 gap-3 mt-3">
                    <button
                      onClick={() => toggleTheme("light")}
                      className={`p-3 rounded-xl border flex items-center gap-2 justify-center transition-all ${
                        theme === "light"
                          ? "border-blue-500 bg-blue-500/[0.02] text-blue-500"
                          : "border-slate-200 hover:border-slate-300 dark:border-zinc-800 text-slate-600 dark:text-zinc-400"
                      } cursor-pointer`}
                    >
                      <Sun size={14} />
                      <span className="font-semibold text-xs">Light</span>
                      {theme === "light" && <Check size={10} className="stroke-[3]" />}
                    </button>

                    <button
                      onClick={() => toggleTheme("dark")}
                      className={`p-3 rounded-xl border flex items-center gap-2 justify-center transition-all ${
                        theme === "dark"
                          ? "border-blue-500 bg-blue-500/[0.02] text-indigo-400"
                          : "border-slate-200 hover:border-slate-300 dark:border-zinc-800 text-slate-600 dark:text-zinc-400"
                      } cursor-pointer`}
                    >
                      <Moon size={14} />
                      <span className="font-semibold text-xs">Dark</span>
                      {theme === "dark" && <Check size={10} className="stroke-[3]" />}
                    </button>

                    <button
                      onClick={() => toggleTheme("system")}
                      className={`p-3 rounded-xl border flex items-center gap-2 justify-center transition-all ${
                        theme === "system"
                          ? "border-blue-500 bg-blue-500/[0.02] text-purple-500"
                          : "border-slate-200 hover:border-slate-300 dark:border-zinc-800 text-slate-600 dark:text-zinc-400"
                      } cursor-pointer`}
                    >
                      <Sparkles size={14} />
                      <span className="font-semibold text-xs">System</span>
                      {theme === "system" && <Check size={10} className="stroke-[3]" />}
                    </button>
                  </div>
                </div>

                <div className="pt-4 border-t border-slate-100 dark:border-zinc-800/80 flex justify-between items-center">
                  <div>
                    <h4 className="font-semibold text-slate-900 dark:text-zinc-100">Synchronize System Theme</h4>
                    <p className="text-[11px] text-slate-400 dark:text-zinc-500 mt-0.5">Adapt visual modes with system level settings automatically.</p>
                  </div>
                  <div className={`w-8 h-4.5 rounded-full p-0.5 cursor-pointer ${theme === "system" ? "bg-blue-500" : "bg-slate-200 dark:bg-zinc-800"}`} onClick={() => toggleTheme(theme === "system" ? "light" : "system")}>
                    <div className={`w-3.5 h-3.5 bg-white rounded-full shadow-xs transition-transform transform ${theme === "system" ? "translate-x-3.5" : "translate-x-0"}`}></div>
                  </div>
                </div>
              </div>
            )}

            {/* 2. Editor Preferences Tab */}
            {activeTab === "editor" && (
              <div className="flex flex-col gap-5">
                <div>
                  <h4 className="font-semibold text-sm text-slate-900 dark:text-zinc-100 mb-1">Editor Font Sizing</h4>
                  <p className="text-[11px] text-slate-400 dark:text-zinc-500 mb-3">Adjust scale preferences for optimal legibility.</p>
                  
                  <div className="flex gap-2">
                    {(["sm", "base", "lg", "xl"] as const).map((sz) => (
                      <button
                        key={sz}
                        onClick={() => handleChangeFontSize(sz)}
                        className={`flex-grow py-2 rounded-xl border text-xs capitalize transition-all ${
                          settings.fontSize === sz
                            ? "bg-blue-500 text-white border-blue-500 font-semibold"
                            : "border-slate-200 dark:border-zinc-800 text-slate-500 hover:bg-slate-50 dark:hover:bg-zinc-900"
                        } cursor-pointer`}
                      >
                        {sz === "base" ? "Normal" : sz}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="pt-4 border-t border-slate-100 dark:border-zinc-800/80 flex flex-col gap-4">
                  <div className="flex justify-between items-center">
                    <div>
                      <h4 className="font-semibold text-slate-900 dark:text-zinc-100">Auto Save to Cloud</h4>
                      <p className="text-[11px] text-slate-400 dark:text-zinc-500 mt-0.5">Sync adjustments automatically to the container server-side volume.</p>
                    </div>
                    <button
                      onClick={handleToggleAutoSave}
                      className={`w-9 h-5 rounded-full p-0.5 transition-colors cursor-pointer ${
                        settings.autoSave ? "bg-blue-500" : "bg-slate-300 dark:bg-zinc-700"
                      }`}
                    >
                      <div className={`w-4 h-4 bg-white rounded-full transition-transform transform ${
                        settings.autoSave ? "translate-x-4" : "translate-x-0"
                      }`}></div>
                    </button>
                  </div>

                  {/* Line Wrapping Toggle */}
                  <div className="flex justify-between items-center pt-3 border-t border-slate-100/50 dark:border-zinc-800/40">
                    <div>
                      <h4 className="font-semibold text-xs text-slate-900 dark:text-zinc-100">Enable Line Wrapping</h4>
                      <p className="text-[11px] text-slate-400 dark:text-zinc-500 mt-0.5">Wrap lines to the viewport width instead of horizontal overflow scrolling.</p>
                    </div>
                    <button
                      onClick={() => onUpdateSettings({ ...settings, lineWrapping: !settings.lineWrapping })}
                      className={`w-9 h-5 rounded-full p-0.5 transition-colors cursor-pointer ${
                        settings.lineWrapping ? "bg-blue-500" : "bg-slate-300 dark:bg-zinc-700"
                      }`}
                    >
                      <div className={`w-4 h-4 bg-white rounded-full transition-transform transform ${
                        settings.lineWrapping ? "translate-x-4" : "translate-x-0"
                      }`}></div>
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* 3. Language & Regional Settings */}
            {activeTab === "language" && (
              <div className="flex flex-col gap-4">
                <div>
                  <h4 className="font-semibold text-sm text-slate-900 dark:text-zinc-100 mb-1">Language Workspace Preferences</h4>
                  <p className="text-[11px] text-slate-400 dark:text-zinc-500 mb-3">Modify system translations, keyboard shortcuts, and character sets.</p>
                  
                  <select
                    value={language}
                    onChange={(e) => setLanguage(e.target.value)}
                    className={`w-full px-3 py-2 rounded-xl border outline-none text-xs font-semibold ${
                      activeTheme === "dark" ? "bg-zinc-950 border-zinc-800 text-zinc-300" : "bg-slate-50 border-slate-200 text-slate-700"
                    }`}
                  >
                    <option value="en">English (United States)</option>
                    <option value="es">Español (Castellano)</option>
                    <option value="de">Deutsch (Deutschland)</option>
                    <option value="ja">日本語 (Japan)</option>
                    <option value="hi">हिन्दी (India)</option>
                  </select>
                </div>

                <div className="p-3 bg-blue-500/5 border border-blue-500/10 rounded-xl leading-relaxed">
                  <span className="font-semibold text-blue-500 block mb-1">AI Translation Grounding:</span>
                  Changing Workspace Language will instruct Aura Gemini commands to translate response structures into your native regional language format automatically.
                </div>
              </div>
            )}

            {/* 4. Notifications */}
            {activeTab === "notifications" && (
              <div className="flex flex-col gap-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="font-semibold text-slate-900 dark:text-zinc-100">Sound Audio Alerts</h4>
                    <p className="text-[11px] text-slate-400 dark:text-zinc-500">Play delicate ambient microtones on sync success or timer expirations.</p>
                  </div>
                  <button
                    onClick={() => {
                      const next = !soundAlerts;
                      setSoundAlerts(next);
                      localStorage.setItem(`aura-soundAlerts-${currentUserEmail}`, String(next));
                    }}
                    className={`w-9 h-5 rounded-full p-0.5 transition-colors cursor-pointer ${
                      soundAlerts ? "bg-blue-500" : "bg-slate-300 dark:bg-zinc-700"
                    }`}
                  >
                    <div className={`w-4 h-4 bg-white rounded-full transition-transform transform ${
                      soundAlerts ? "translate-x-4" : "translate-x-0"
                    }`}></div>
                  </button>
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="font-semibold text-slate-900 dark:text-zinc-100">Desktop Push Notifications</h4>
                    <p className="text-[11px] text-slate-400 dark:text-zinc-500">Show notification banner on your primary operating system window.</p>
                  </div>
                  <button
                    onClick={() => {
                      const next = !desktopNotif;
                      setDesktopNotif(next);
                      localStorage.setItem(`aura-desktopNotif-${currentUserEmail}`, String(next));
                    }}
                    className={`w-9 h-5 rounded-full p-0.5 transition-colors cursor-pointer ${
                      desktopNotif ? "bg-blue-500" : "bg-slate-300 dark:bg-zinc-700"
                    }`}
                  >
                    <div className={`w-4 h-4 bg-white rounded-full transition-transform transform ${
                      desktopNotif ? "translate-x-4" : "translate-x-0"
                    }`}></div>
                  </button>
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="font-semibold text-slate-900 dark:text-zinc-100">Telemetry Newsletter</h4>
                    <p className="text-[11px] text-slate-400 dark:text-zinc-500">Receive weekly emails on high productivity workflows or strategy blueprints.</p>
                  </div>
                  <button
                    onClick={() => {
                      const next = !newsletterAlerts;
                      setNewsletterAlerts(next);
                      localStorage.setItem(`aura-newsletterAlerts-${currentUserEmail}`, String(next));
                    }}
                    className={`w-9 h-5 rounded-full p-0.5 transition-colors cursor-pointer ${
                      newsletterAlerts ? "bg-blue-500" : "bg-slate-300 dark:bg-zinc-700"
                    }`}
                  >
                    <div className={`w-4 h-4 bg-white rounded-full transition-transform transform ${
                      newsletterAlerts ? "translate-x-4" : "translate-x-0"
                    }`}></div>
                  </button>
                </div>
              </div>
            )}

            {/* 5. Storage & Cloud Sync */}
            {activeTab === "storage" && (
              <div className="flex flex-col gap-5">
                <div className="flex flex-col gap-2">
                  <h4 className="font-semibold text-slate-900 dark:text-zinc-100 flex items-center gap-2">
                    <HardDrive size={13} />
                    Volume Telemetry (Sync Center)
                  </h4>
                  <p className="text-[11px] text-slate-400 dark:text-zinc-500">Notes are synchronized back to the Cloud Run Express storage databases.</p>
                   <div className="w-full h-2.5 bg-slate-100 dark:bg-zinc-800 rounded-full overflow-hidden">
                    <div className="h-full bg-blue-500 rounded-full transition-all duration-300" style={{ width: `${storagePercentage}%` }}></div>
                  </div>
                  <div className="flex justify-between text-[10px] text-slate-400 font-mono mt-0.5">
                    <span>Current usage: ~{storageUsed} KB</span>
                    <span>Total free allotment: 5.0 MB</span>
                  </div>
                </div>

                <div className="pt-4 border-t border-slate-100 dark:border-zinc-800 flex gap-2">
                  <button
                    onClick={handleForceSync}
                    disabled={isSyncingNow}
                    className="flex-grow py-2.5 bg-blue-500 text-white font-semibold rounded-xl text-xs flex items-center justify-center gap-2 shadow-xs cursor-pointer active:scale-[0.98]"
                  >
                    <RefreshCw size={12} className={isSyncingNow ? "animate-spin" : ""} />
                    <span>{isSyncingNow ? "Re-syncing..." : "Force Database Cloud Re-Sync"}</span>
                  </button>

                  <button
                    onClick={() => {
                      localStorage.clear();
                      alert("Offline Cache storage wiped. Refresh page to restart sandbox.");
                    }}
                    className="px-4 py-2.5 bg-rose-500/10 border border-rose-500/20 hover:bg-rose-500/20 text-rose-500 font-semibold rounded-xl text-xs cursor-pointer"
                  >
                    Clear Cache
                  </button>
                </div>
              </div>
            )}

            {/* 6. Privacy & Security */}
            {activeTab === "privacy" && (
              <div className="flex flex-col gap-5">
                <div className="flex justify-between items-center">
                  <div>
                    <h4 className="font-semibold text-slate-900 dark:text-zinc-100">Multi-Factor Authentication (MFA)</h4>
                    <p className="text-[11px] text-slate-400 dark:text-zinc-500 mt-0.5">Prompt for a 6-digit PIN on authentication to secure note logs.</p>
                  </div>
                  <button
                    onClick={() => {
                      const next = !twoFactorActive;
                      setTwoFactorActive(next);
                      localStorage.setItem(`aura-twoFactorActive-${currentUserEmail}`, String(next));
                    }}
                    className={`w-9 h-5 rounded-full p-0.5 transition-colors cursor-pointer ${
                      twoFactorActive ? "bg-blue-500" : "bg-slate-300 dark:bg-zinc-700"
                    }`}
                  >
                    <div className={`w-4 h-4 bg-white rounded-full transition-transform transform ${
                      twoFactorActive ? "translate-x-4" : "translate-x-0"
                    }`}></div>
                  </button>
                </div>

                <div className="pt-4 border-t border-slate-100 dark:border-zinc-800/80">
                  <h4 className="font-semibold text-slate-900 dark:text-zinc-100 mb-2">Active Sessions (Telemetry logs)</h4>
                  <div className="border border-slate-100 dark:border-zinc-800 rounded-xl overflow-hidden text-[10px] font-mono">
                    <table className="w-full text-left">
                      <tr className="bg-slate-50 dark:bg-zinc-900 text-slate-400 border-b border-slate-100 dark:border-zinc-800">
                        <th className="p-2">Device / Platform</th>
                        <th className="p-2">IP Address</th>
                        <th className="p-2">Status</th>
                      </tr>
                      <tr className="hover:bg-slate-50/20 text-slate-600 dark:text-zinc-300">
                        <td className="p-2 font-sans font-medium">{currentBrowser} Browser ({currentOS})</td>
                        <td className="p-2">127.0.0.1 (Current)</td>
                        <td className="p-2 text-emerald-500 font-bold">Active Now</td>
                      </tr>
                      <tr className="hover:bg-slate-50/20 text-slate-400">
                        <td className="p-2 font-sans">iPhone 15 Mobile Client</td>
                        <td className="p-2">124.90.11.45</td>
                        <td className="p-2">2 hours ago</td>
                      </tr>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {/* 7. AI Preferences */}
            {activeTab === "ai" && (
              <div className="flex flex-col gap-4">
                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-semibold text-slate-400 dark:text-zinc-500 uppercase tracking-widest">Generative Model Engine</label>
                  <select
                    value={aiModel}
                    onChange={(e) => {
                      const val = e.target.value;
                      setAiModel(val);
                      onUpdateSettings({ ...settings, aiModel: val });
                    }}
                    className={`w-full px-3 py-2 rounded-xl border outline-none text-xs font-semibold ${
                      activeTheme === "dark" ? "bg-zinc-950 border-zinc-800 text-zinc-300" : "bg-slate-50 border-slate-200 text-slate-700"
                    }`}
                  >
                    <option value="gemini-3.5-flash">Gemini 3.5 Flash (Supercharged speed & actions)</option>
                    <option value="gemini-1.5-pro">Gemini 1.5 Pro (Deep logical formulations)</option>
                    <option value="claude-3.5-sonnet">Claude 3.5 Sonnet (Extended creative drafting)</option>
                  </select>
                </div>

                <div className="flex flex-col gap-1.5">
                  <div className="flex justify-between text-[11px]">
                    <span className="font-semibold text-slate-900 dark:text-zinc-100">AI Temperature Accent: {aiTemperature}</span>
                    <span className="text-slate-400 dark:text-zinc-500 font-mono">{aiTemperature < 0.4 ? "Precise/Strategic" : aiTemperature > 0.8 ? "Highly Creative" : "Balanced"}</span>
                  </div>
                  <input
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
                    className="w-full h-1 bg-slate-200 dark:bg-zinc-800 rounded-lg appearance-none cursor-pointer"
                  />
                </div>
              </div>
            )}

            {/* 8. Connected Accounts */}
            {activeTab === "integrations" && (
              <div className="flex flex-col gap-3">
                <p className="text-[11px] text-slate-400 dark:text-zinc-500 mb-2">Connect third-party enterprise tools to sync notes directly as task tickets or specs.</p>
                
                {[
                  { name: "Google Drive Backup", desc: "Automate raw PDF export formats into private storage folders.", icon: HardDrive },
                  { name: "Slack Communications", desc: "Broadcast generated board minutes and summaries to selected channels.", icon: Link },
                  { name: "GitHub Repository Sync", desc: "Commit markdown document files straight to codebases on save.", icon: Key },
                ].map((item, i) => {
                  const isConnected = !!integrations[item.name];
                  return (
                    <div
                      key={i}
                      className={`p-3 rounded-xl border flex items-center justify-between ${
                        activeTheme === "dark" ? "bg-zinc-950/40 border-zinc-800" : "bg-slate-50 border-slate-100"
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center text-blue-500">
                          <item.icon size={13} />
                        </div>
                        <div className="flex flex-col">
                          <span className="font-semibold text-slate-900 dark:text-zinc-200">{item.name}</span>
                          <span className="text-[10px] text-slate-400 mt-0.5 leading-tight">{item.desc}</span>
                        </div>
                      </div>

                      <button
                        onClick={() => toggleIntegration(item.name)}
                        className={`px-2.5 py-1 text-[10px] font-bold rounded-lg cursor-pointer ${
                          isConnected
                            ? "bg-emerald-500/10 text-emerald-500 border border-emerald-500/20"
                            : "bg-slate-950 text-white dark:bg-white dark:text-zinc-950"
                        }`}
                      >
                        {isConnected ? "Linked" : "Connect"}
                      </button>
                    </div>
                  );
                })}
              </div>
            )}

            {/* 9. Billing & Subscription */}
            {activeTab === "billing" && (
              <div className="flex flex-col gap-5">
                <div className="p-4 rounded-xl bg-gradient-to-tr from-blue-500 to-indigo-500 text-white flex flex-col gap-3.5 shadow-md">
                  <div className="flex justify-between items-start">
                    <div className="flex flex-col">
                      <span className="text-[10px] font-mono uppercase tracking-widest text-blue-100">Subscription Tier</span>
                      <span className="font-display font-extrabold text-lg mt-0.5">Aura Pro Enterprise Suite</span>
                    </div>
                    <span className="px-2 py-0.5 bg-white/20 rounded-full font-mono font-bold text-[9px] uppercase tracking-wider">Active</span>
                  </div>

                  <div className="flex justify-between text-xs pt-2 border-t border-white/20 text-blue-100">
                    <span>Re-bills Monthly ($12/mo)</span>
                    <span>Next renewal: {nextRenewalDate}</span>
                  </div>
                </div>

                <div>
                  <h4 className="font-semibold text-slate-900 dark:text-zinc-100 mb-2">Billing History Invoice logs</h4>
                  <div className="border border-slate-100 dark:border-zinc-800 rounded-xl overflow-hidden text-[10px] font-mono">
                    <table className="w-full text-left">
                      <tr className="bg-slate-50 dark:bg-zinc-900 text-slate-400 border-b border-slate-100 dark:border-zinc-800">
                        <th className="p-2">Invoice Code</th>
                        <th className="p-2">Billed Date</th>
                        <th className="p-2">Receipt PDF</th>
                      </tr>
                      <tr className="hover:bg-slate-50/20 text-slate-600 dark:text-zinc-300">
                        <td className="p-2 font-medium">#INV-405111</td>
                        <td className="p-2">2026-07-05</td>
                        <td className="p-2 text-blue-500 cursor-pointer hover:underline font-bold">Download</td>
                      </tr>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {/* 10. Developer API Keys */}
            {activeTab === "apikeys" && (
              <div className="flex flex-col gap-4">
                <p className="text-[11px] text-slate-400 dark:text-zinc-500">Query your strategy drafts from outside scripts. Provide names to generate a secure secret credentials key.</p>
                
                <form onSubmit={handleGenerateToken} className="flex gap-2">
                  <input
                    type="text"
                    value={newTokenName}
                    onChange={(e) => setNewTokenName(e.target.value)}
                    placeholder="Key label (e.g. CI pipeline RETRO)"
                    className={`flex-grow text-xs px-3 py-2.5 rounded-xl border outline-none ${
                      activeTheme === "dark"
                        ? "bg-zinc-950 border-zinc-800 text-zinc-300"
                        : "bg-slate-50 border-slate-200 text-slate-700"
                    }`}
                  />
                  <button type="submit" className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white font-semibold rounded-xl text-xs flex items-center gap-1 shadow-sm cursor-pointer">
                    <Plus size={13} />
                    Generate
                  </button>
                </form>

                <div className="flex flex-col gap-1.5 mt-2">
                  {apiTokens.map((tok) => (
                    <div
                      key={tok.id}
                      className={`p-3 rounded-xl border flex items-center justify-between text-[11px] font-mono ${
                        activeTheme === "dark" ? "bg-zinc-950/40 border-zinc-800" : "bg-slate-50 border-slate-100"
                      }`}
                    >
                      <div className="flex flex-col">
                        <span className="font-sans font-bold text-slate-800 dark:text-zinc-100">{tok.name}</span>
                        <span className="text-[10px] text-blue-500 mt-0.5">{tok.key}</span>
                      </div>
                      <button
                        onClick={() => handleDeleteToken(tok.id)}
                        className="text-slate-400 hover:text-rose-500 transition-colors cursor-pointer"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 11. Keyboard shortcuts tab */}
            {activeTab === "shortcuts" && (
              <div className="flex flex-col gap-4">
                <div className="flex items-center gap-2 mb-2">
                  <Keyboard size={15} className="text-blue-500" />
                  <span className="font-semibold text-sm text-slate-900 dark:text-zinc-100">Command Bindings Matrix</span>
                </div>
                
                <div className="border border-slate-100 dark:border-zinc-800 rounded-xl overflow-hidden">
                  <table className="w-full text-left">
                    <thead>
                      <tr className="bg-slate-50 dark:bg-zinc-900 text-slate-400 dark:text-zinc-500 font-semibold border-b border-slate-100 dark:border-zinc-800">
                        <th className="p-2.5">Command</th>
                        <th className="p-2.5">Key Binding</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-zinc-800/50">
                      {[
                        { cmd: "Search Action Palette", keys: "⌘ K or Ctrl + K" },
                        { cmd: "Initialize New Note", keys: "Alt + N" },
                        { cmd: "Toggle Settings Drawer", keys: "Alt + S" },
                        { cmd: "Toggle Full-Screen Focus", keys: "Alt + F" },
                        { cmd: "Duplicate Active Note", keys: "Alt + D" },
                        { cmd: "Archive Active Note", keys: "Alt + A" },
                        { cmd: "Trash Active Note", keys: "Alt + T" },
                        { cmd: "Lock / Unlock Note", keys: "Alt + L" },
                        { cmd: "Trigger Slash commands", keys: "/ (on new line)" },
                      ].map((item, idx) => (
                        <tr key={idx} className="hover:bg-slate-50/50 dark:hover:bg-zinc-900/20">
                          <td className="p-2.5 text-slate-700 dark:text-zinc-300 font-medium">{item.cmd}</td>
                          <td className="p-2.5 font-mono text-[11px] text-blue-500 dark:text-indigo-400">{item.keys}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

          </div>
        </div>
      </div>
    </div>
  );
}
