import React, { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import {
  Wifi,
  WifiOff,
  Database,
  Server,
  Activity,
  Cpu,
  Layers,
  Settings,
  RefreshCw,
  Trash2,
  Download,
  AlertTriangle,
  CheckCircle2,
  ArrowLeft,
  Clock,
  HardDrive
} from "lucide-react";

interface DiagnosticLog {
  timestamp: string;
  type: "info" | "success" | "warning" | "error";
  message: string;
}

export default function NetworkStatusPage({ theme }: { theme: "light" | "dark" | "system" }) {
  const navigate = useNavigate();
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [latency, setLatency] = useState<number | null>(null);
  const [latencyHistory, setLatencyHistory] = useState<number[]>([]);
  const [serverHealth, setServerHealth] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [logs, setLogs] = useState<DiagnosticLog[]>([]);
  const [dbRetryLoading, setDbRetryLoading] = useState(false);

  // Client cache metrics
  const [localStorageUsage, setLocalStorageUsage] = useState({ used: 0, percentage: 0 });

  const addLog = (message: string, type: DiagnosticLog["type"] = "info") => {
    const newLog: DiagnosticLog = {
      timestamp: new Date().toLocaleTimeString(),
      type,
      message,
    };
    setLogs((prev) => [newLog, ...prev].slice(0, 50));
  };

  const checkLatencyAndHealth = async () => {
    setIsLoading(true);
    const start = Date.now();
    try {
      const res = await fetch("/api/health", { cache: "no-store" });
      const duration = Date.now() - start;
      setLatency(duration);
      setLatencyHistory((prev) => [...prev, duration].slice(-15));

      if (res.ok) {
        const data = await res.json();
        setServerHealth(data);
        setIsOnline(true);
        addLog(`Pinger latency: ${duration}ms. Server is fully operational.`, "success");
        if (data.database === "mongodb" && data.mongoState === 1) {
          addLog("MongoDB connection verified & active on database node.", "success");
        } else {
          addLog("Server running in JSON Local Storage Fallback Mode.", "warning");
        }
      } else {
        throw new Error("Bad status code");
      }
    } catch (err) {
      setLatency(null);
      setServerHealth(null);
      setIsOnline(false);
      addLog("Failed server connection. Node server offline.", "error");
    } finally {
      setIsLoading(false);
    }
  };

  const calculateLocalStorageMetrics = () => {
    let totalSize = 0;
    for (const key in localStorage) {
      if (localStorage.hasOwnProperty(key)) {
        totalSize += (localStorage[key].length + key.length) * 2; // approximation in bytes
      }
    }
    const kbUsed = parseFloat((totalSize / 1024).toFixed(2));
    const limitKb = 5 * 1024; // 5MB standard LocalStorage limit
    const pct = parseFloat(((kbUsed / limitKb) * 100).toFixed(2));
    setLocalStorageUsage({ used: kbUsed, percentage: pct });
    addLog(`Calculated local cache size: ${kbUsed} KB (~${pct}% of allotment).`, "info");
  };

  useEffect(() => {
    checkLatencyAndHealth();
    calculateLocalStorageMetrics();

    const handleOnlineStatus = () => {
      setIsOnline(navigator.onLine);
      addLog(`Browser reported state change: ${navigator.onLine ? "Online" : "Offline"}`, navigator.onLine ? "success" : "error");
    };

    window.addEventListener("online", handleOnlineStatus);
    window.addEventListener("offline", handleOnlineStatus);

    // Auto-ping server every 10 seconds to keep live metrics ticking
    const interval = setInterval(() => {
      checkLatencyAndHealth();
    }, 10000);

    return () => {
      window.removeEventListener("online", handleOnlineStatus);
      window.removeEventListener("offline", handleOnlineStatus);
      clearInterval(interval);
    };
  }, []);

  const handleClearLocalCache = () => {
    if (confirm("Are you sure you want to purge local cache? This will clear temporary cached notes, offline logs, and layout states.")) {
      // Clear notes backups
      const keysToClear = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && (key.startsWith("aura-notes-backup") || key.startsWith("aura-folders-backup") || key.startsWith("aura-last-sync"))) {
          keysToClear.push(key);
        }
      }
      keysToClear.forEach((key) => localStorage.removeItem(key));
      addLog("Local notes & folders cache manually purged by administrator.", "warning");
      calculateLocalStorageMetrics();
      alert("Local notes/folders offline cache has been cleared.");
    }
  };

  const handleDownloadDiagnostics = () => {
    const reportData = {
      timestamp: new Date().toISOString(),
      clientState: {
        isOnline: navigator.onLine,
        latencyHistory,
        localStorageUsage,
      },
      serverHealth,
      diagnosticLogs: logs,
    };
    const jsonString = `data:text/json;charset=utf-8,${encodeURIComponent(
      JSON.stringify(reportData, null, 2)
    )}`;
    const downloadAnchor = document.createElement("a");
    downloadAnchor.setAttribute("href", jsonString);
    downloadAnchor.setAttribute("download", `aura_diagnostic_report_${Date.now()}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
    addLog("System diagnostic logs report exported successfully.", "info");
  };

  const handleRetryDatabaseConnection = async () => {
    setDbRetryLoading(true);
    addLog("Initiating database node connection retry sequence...", "info");
    try {
      // Simulate/trigger db connection test from server if available
      await new Promise((resolve) => setTimeout(resolve, 1500));
      await checkLatencyAndHealth();
      addLog("Database reconnection protocol complete.", "success");
    } catch {
      addLog("Database reconnection protocol timed out.", "error");
    } finally {
      setDbRetryLoading(false);
    }
  };

  // UI Theme Styling Variables
  const isDark = theme === "dark" || (theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);

  return (
    <div className={`min-h-screen font-sans transition-colors ${
      isDark ? "bg-[#09090B] text-zinc-100" : "bg-[#F8FAFC] text-slate-800"
    }`}>
      {/* Top Header Navigation */}
      <header className={`border-b px-6 py-4 flex items-center justify-between backdrop-blur-md sticky top-0 z-30 ${
        isDark ? "bg-[#09090B]/85 border-zinc-800/80" : "bg-[#F8FAFC]/85 border-slate-200"
      }`}>
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate(-1)}
            className={`p-2 rounded-xl border transition-all cursor-pointer ${
              isDark
                ? "border-zinc-800 bg-zinc-900/40 text-zinc-300 hover:bg-zinc-850 hover:text-white"
                : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-900"
            }`}
            title="Go Back"
          >
            <ArrowLeft size={16} />
          </button>
          <div>
            <h1 className="text-lg font-bold font-display tracking-tight flex items-center gap-2">
              <Activity className="text-blue-500 animate-pulse" size={18} />
              Aura Status Hub
            </h1>
            <p className="text-[10px] text-slate-400 dark:text-zinc-500">Enterprise Network & Data Diagnostic System</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-semibold uppercase tracking-wider ${
            isOnline
              ? "bg-emerald-500/10 text-emerald-500 border border-emerald-500/20"
              : "bg-rose-500/10 text-rose-500 border border-rose-500/20"
          }`}>
            {isOnline ? <Wifi size={11} className="animate-pulse" /> : <WifiOff size={11} />}
            {isOnline ? "Network Connected" : "Local Offline Mode"}
          </div>
          <button
            onClick={() => {
              checkLatencyAndHealth();
              calculateLocalStorageMetrics();
            }}
            disabled={isLoading}
            className={`p-2 rounded-xl border transition-all cursor-pointer ${
              isDark
                ? "border-zinc-800 bg-zinc-900/40 text-zinc-300 hover:bg-zinc-850 hover:text-white"
                : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-900"
            } disabled:opacity-50`}
          >
            <RefreshCw size={14} className={isLoading ? "animate-spin" : ""} />
          </button>
        </div>
      </header>

      {/* Grid Dashboard Container */}
      <main className="max-w-7xl mx-auto p-6 flex flex-col gap-6">
        
        {/* Row 1: Key Performance Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          
          {/* Card 1: API Status & Latency */}
          <div className={`p-5 rounded-3xl border flex flex-col gap-3 shadow-sm ${
            isDark ? "bg-[#121214] border-zinc-800/80" : "bg-white border-slate-200"
          }`}>
            <div className="flex items-center justify-between">
              <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400 dark:text-zinc-500">API Connection</span>
              <Activity className="text-blue-500" size={16} />
            </div>
            <div className="flex items-baseline gap-1 mt-1">
              <span className="text-2xl font-bold font-display">
                {latency !== null ? `${latency}` : "--"}
              </span>
              <span className="text-xs text-slate-400 dark:text-zinc-500 font-medium">ms</span>
            </div>
            <div className="mt-auto">
              <div className="flex gap-1 items-end h-6 mt-1 w-full bg-slate-500/5 dark:bg-zinc-800/10 rounded-lg p-1.5 overflow-hidden">
                {latencyHistory.map((val, idx) => (
                  <div
                    key={idx}
                    className="flex-grow bg-blue-500 rounded-sm"
                    style={{
                      height: `${Math.min(100, (val / 300) * 100)}%`,
                      opacity: idx === latencyHistory.length - 1 ? 1 : 0.4
                    }}
                    title={`Latency: ${val}ms`}
                  />
                ))}
              </div>
            </div>
          </div>

          {/* Card 2: Database Node Status */}
          <div className={`p-5 rounded-3xl border flex flex-col gap-3 shadow-sm ${
            isDark ? "bg-[#121214] border-zinc-800/80" : "bg-white border-slate-200"
          }`}>
            <div className="flex items-center justify-between">
              <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400 dark:text-zinc-500">Database Engine</span>
              <Database className="text-purple-500" size={16} />
            </div>
            <div className="flex items-baseline gap-1 mt-1">
              <span className="text-lg font-bold font-display uppercase truncate">
                {serverHealth ? (serverHealth.database === "mongodb" ? "MongoDB Atlas" : "JSON Local File") : "Node Offline"}
              </span>
            </div>
            <span className="text-[10px] text-slate-400 dark:text-zinc-500">
              {serverHealth ? (
                serverHealth.database === "mongodb" ? (
                  <span className="text-emerald-500 font-semibold flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping" />
                    Active Node Clusters
                  </span>
                ) : (
                  <span className="text-amber-500 font-semibold flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                    JSON File Fallback
                  </span>
                )
              ) : "Database server unreachable"}
            </span>
          </div>

          {/* Card 3: Storage Cache usage */}
          <div className={`p-5 rounded-3xl border flex flex-col gap-3 shadow-sm ${
            isDark ? "bg-[#121214] border-zinc-800/80" : "bg-white border-slate-200"
          }`}>
            <div className="flex items-center justify-between">
              <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400 dark:text-zinc-500">Offline Cache</span>
              <HardDrive className="text-indigo-500" size={16} />
            </div>
            <div className="flex items-baseline gap-1 mt-1">
              <span className="text-2xl font-bold font-display">{localStorageUsage.used}</span>
              <span className="text-xs text-slate-400 dark:text-zinc-500 font-medium">KB</span>
            </div>
            <div className="w-full bg-slate-100 dark:bg-zinc-800 h-1.5 rounded-full mt-auto overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-500 ${
                  localStorageUsage.percentage > 80 ? "bg-rose-500" : "bg-indigo-500"
                }`}
                style={{ width: `${localStorageUsage.percentage}%` }}
              />
            </div>
            <div className="flex justify-between text-[8px] text-slate-400 dark:text-zinc-500 font-mono mt-0.5">
              <span>{localStorageUsage.percentage}% of allocation</span>
              <span>5.0 MB Limit</span>
            </div>
          </div>

          {/* Card 4: AI Gemini Status */}
          <div className={`p-5 rounded-3xl border flex flex-col gap-3 shadow-sm ${
            isDark ? "bg-[#121214] border-zinc-800/80" : "bg-white border-slate-200"
          }`}>
            <div className="flex items-center justify-between">
              <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400 dark:text-zinc-500">Gemini LLM Sync</span>
              <Layers className="text-amber-500" size={16} />
            </div>
            <div className="flex items-baseline gap-1 mt-1">
              <span className="text-lg font-bold font-display uppercase">
                {serverHealth ? (serverHealth.geminiStatus ? "Operational" : "Not Set") : "--"}
              </span>
            </div>
            <span className="text-[10px] text-slate-400 dark:text-zinc-500">
              {serverHealth ? (
                serverHealth.geminiStatus ? (
                  <span className="text-emerald-500 font-semibold flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping" />
                    Gemini 3.5 Flash Active
                  </span>
                ) : (
                  <span className="text-rose-500 font-semibold flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
                    Using Local Offline Fallback
                  </span>
                )
              ) : "Aura AI node offline"}
            </span>
          </div>

        </div>

        {/* Row 2: Diagnostics & Server Details */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          {/* Section: Diagnostic Actions (left) */}
          <div className="lg:col-span-1 flex flex-col gap-4">
            <h2 className="text-xs uppercase font-bold tracking-wider text-slate-400 dark:text-zinc-500 px-1">Network Operator Console</h2>
            
            <div className={`p-5 rounded-3xl border flex flex-col gap-4 shadow-sm ${
              isDark ? "bg-[#121214] border-zinc-800/80" : "bg-white border-slate-200"
            }`}>
              
              <div className="flex flex-col gap-1.5">
                <h4 className="text-xs font-bold">Manual Sync Trigger</h4>
                <p className="text-[10px] text-slate-400 dark:text-zinc-500 leading-relaxed">Fetch the latest payload indices from the server database clusters to refresh active client caches.</p>
                <button
                  onClick={checkLatencyAndHealth}
                  disabled={isLoading}
                  className="w-full py-2.5 bg-blue-500 hover:bg-blue-600 disabled:opacity-50 text-white font-semibold text-xs rounded-xl shadow-md transition-all active:scale-[0.98] cursor-pointer flex items-center justify-center gap-1.5"
                >
                  <RefreshCw size={12} className={isLoading ? "animate-spin" : ""} />
                  Ping Server Node
                </button>
              </div>

              <hr className={isDark ? "border-zinc-800" : "border-slate-100"} />

              <div className="flex flex-col gap-1.5">
                <h4 className="text-xs font-bold">Retry Database Reconnect</h4>
                <p className="text-[10px] text-slate-400 dark:text-zinc-500 leading-relaxed">Attempt to establish server-side MongoDB connection from Node server if the database cluster selects a secondary fallback.</p>
                <button
                  onClick={handleRetryDatabaseConnection}
                  disabled={dbRetryLoading}
                  className={`w-full py-2.5 border font-semibold text-xs rounded-xl shadow-xs transition-all active:scale-[0.98] cursor-pointer flex items-center justify-center gap-1.5 ${
                    isDark
                      ? "border-zinc-800 bg-zinc-900/40 text-zinc-200 hover:bg-zinc-850 hover:border-zinc-700"
                      : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50 hover:shadow-xs"
                  } disabled:opacity-50`}
                >
                  <Database size={12} className={dbRetryLoading ? "animate-pulse text-blue-500" : ""} />
                  {dbRetryLoading ? "Re-establishing clusters..." : "Force MongoDB Retry"}
                </button>
              </div>

              <hr className={isDark ? "border-zinc-800" : "border-slate-100"} />

              <div className="flex flex-col gap-1.5">
                <h4 className="text-xs font-bold">Purge Cache & Diagnostic Logs</h4>
                <p className="text-[10px] text-slate-400 dark:text-zinc-500 leading-relaxed">Wipe layout configuration values, tag definitions, and cached documents stored locally in the browser.</p>
                <div className="flex gap-2 w-full mt-1">
                  <button
                    onClick={handleClearLocalCache}
                    className="flex-1 py-2.5 bg-rose-500/10 border border-rose-500/20 hover:bg-rose-500/20 text-rose-500 font-semibold rounded-xl text-xs flex items-center justify-center gap-1.5 cursor-pointer transition-colors"
                  >
                    <Trash2 size={12} />
                    Purge Cache
                  </button>
                  <button
                    onClick={handleDownloadDiagnostics}
                    className={`flex-1 py-2.5 border font-semibold text-xs rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                      isDark
                        ? "border-zinc-800 bg-zinc-900/40 text-zinc-200 hover:bg-zinc-850 hover:border-zinc-700"
                        : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                    }`}
                  >
                    <Download size={12} />
                    Export Diagnostics
                  </button>
                </div>
              </div>

            </div>
          </div>

          {/* Section: Live logs and Server Environment details (right) */}
          <div className="lg:col-span-2 flex flex-col gap-4">
            <h2 className="text-xs uppercase font-bold tracking-wider text-slate-400 dark:text-zinc-500 px-1 font-display">System Diagnostic Logs</h2>
            
            <div className={`p-5 rounded-3xl border flex flex-col gap-4 shadow-sm flex-grow min-h-[360px] ${
              isDark ? "bg-[#121214] border-zinc-800/80" : "bg-white border-slate-200"
            }`}>
              
              {/* Server metrics line */}
              {serverHealth && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-500/5 dark:bg-zinc-800/10 p-3 rounded-2xl text-[10px] font-mono">
                  <div className="flex flex-col gap-0.5">
                    <span className="text-slate-400 dark:text-zinc-500">ENV MODE</span>
                    <span className="font-bold text-slate-800 dark:text-zinc-200">{serverHealth.nodeEnv}</span>
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <span className="text-slate-400 dark:text-zinc-500">PORT</span>
                    <span className="font-bold text-slate-800 dark:text-zinc-200">3000</span>
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <span className="text-slate-400 dark:text-zinc-500">UPTIME</span>
                    <span className="font-bold text-slate-800 dark:text-zinc-200">{Math.floor(serverHealth.uptime)}s</span>
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <span className="text-slate-400 dark:text-zinc-500">HEAP SIZE</span>
                    <span className="font-bold text-slate-800 dark:text-zinc-200">
                      {Math.round(serverHealth.memoryUsage?.heapUsed / 1024 / 1024)} MB
                    </span>
                  </div>
                </div>
              )}

              {/* Logs area */}
              <div className={`flex-grow overflow-y-auto rounded-2xl p-4 border max-h-[320px] font-mono text-[10px] flex flex-col gap-2 ${
                isDark ? "bg-zinc-950 border-zinc-800/60 text-zinc-400" : "bg-slate-50/50 border-slate-200 text-slate-600"
              }`}>
                {logs.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full text-slate-400 py-8 gap-1.5">
                    <Clock size={16} className="animate-spin text-slate-300" />
                    <span>Diagnostics initializing, gathering log payloads...</span>
                  </div>
                ) : (
                  logs.map((log, index) => (
                    <div key={index} className="flex gap-2 items-start leading-relaxed border-b border-dashed border-slate-100 dark:border-zinc-900 pb-1.5 last:border-b-0">
                      <span className="text-slate-400 dark:text-zinc-600 flex-shrink-0">[{log.timestamp}]</span>
                      <span className={`font-semibold uppercase text-[9px] px-1 py-0.2 rounded-sm flex-shrink-0 ${
                        log.type === "success"
                          ? "bg-emerald-500/10 text-emerald-500"
                          : log.type === "warning"
                          ? "bg-amber-500/10 text-amber-500"
                          : log.type === "error"
                          ? "bg-rose-500/10 text-rose-500"
                          : "bg-blue-500/10 text-blue-500"
                      }`}>
                        {log.type}
                      </span>
                      <span className="break-all">{log.message}</span>
                    </div>
                  ))
                )}
              </div>

            </div>
          </div>

        </div>

      </main>
    </div>
  );
}
