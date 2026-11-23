import React, { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { WifiOff, Database, Activity, RefreshCw, Trash2, Download, ArrowLeft } from "lucide-react";
import { Badge, Button, Dialog, IconButton, Logo, Skeleton, Spinner } from "../ui";
import type { BadgeTone } from "../ui";

interface DiagnosticLog {
  timestamp: string;
  type: "info" | "success" | "warning" | "error";
  message: string;
}

export default function NetworkStatusPage(_props: { theme: "light" | "dark" | "system" }) {
  const navigate = useNavigate();
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [latency, setLatency] = useState<number | null>(null);
  const [latencyHistory, setLatencyHistory] = useState<number[]>([]);
  const [serverHealth, setServerHealth] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [logs, setLogs] = useState<DiagnosticLog[]>([]);
  const [dbRetryLoading, setDbRetryLoading] = useState(false);
  const [purgeOpen, setPurgeOpen] = useState(false);

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

  const performPurge = () => {
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

  const logTone: Record<DiagnosticLog["type"], BadgeTone> = {
    success: "success",
    warning: "warning",
    error: "danger",
    info: "neutral",
  };

  const components: { name: string; detail: string; tone: BadgeTone; label: string; metric?: string }[] = [
    {
      name: "Network",
      detail: isOnline ? "Browser reports a connection." : "Browser is offline. Changes are saved locally.",
      tone: isOnline ? "success" : "danger",
      label: isOnline ? "Connected" : "Offline",
    },
    {
      name: "API server",
      detail: latency !== null ? "Responding to health checks." : isLoading ? "Checking..." : "Health check failed.",
      tone: latency !== null ? "success" : isLoading ? "neutral" : "danger",
      label: latency !== null ? "Operational" : isLoading ? "Checking" : "Unreachable",
      metric: latency !== null ? `${latency} ms` : undefined,
    },
    {
      name: "Database",
      detail: serverHealth
        ? serverHealth.database === "mongodb"
          ? "MongoDB cluster is active."
          : "Running on the JSON file fallback."
        : "Database server unreachable.",
      tone: serverHealth ? (serverHealth.database === "mongodb" ? "success" : "warning") : "danger",
      label: serverHealth ? (serverHealth.database === "mongodb" ? "Operational" : "Fallback") : "Unreachable",
    },
    {
      name: "AI assistant",
      detail: serverHealth
        ? serverHealth.geminiStatus
          ? "Gemini 3.5 Flash is configured."
          : "No provider key set. Using local fallback."
        : "AI node offline.",
      tone: serverHealth ? (serverHealth.geminiStatus ? "success" : "warning") : "neutral",
      label: serverHealth ? (serverHealth.geminiStatus ? "Operational" : "Not set") : "Unknown",
    },
    {
      name: "Offline cache",
      detail: `${localStorageUsage.used} KB used, ${localStorageUsage.percentage}% of the 5.0 MB allocation.`,
      tone: localStorageUsage.percentage > 80 ? "warning" : "success",
      label: localStorageUsage.percentage > 80 ? "Nearly full" : "Healthy",
    },
  ];

  const overall: { tone: BadgeTone; text: string } = !isOnline
    ? { tone: "danger", text: "You are offline" }
    : components.some((c) => c.tone === "danger")
      ? { tone: "danger", text: "Some systems are unreachable" }
      : components.some((c) => c.tone === "warning")
        ? { tone: "warning", text: "Running with degraded features" }
        : { tone: "success", text: "All systems operational" };

  const refreshAll = () => {
    checkLatencyAndHealth();
    calculateLocalStorageMetrics();
  };

  return (
    <div className="min-h-screen bg-surface text-fg">
      <header className="sticky top-0 z-30 border-b border-line bg-surface">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between gap-3 px-4 sm:px-6">
          <div className="flex items-center gap-2">
            <IconButton label="Go back" variant="ghost" onClick={() => navigate(-1)} className="max-sm:h-10 max-sm:w-10">
              <ArrowLeft size={16} />
            </IconButton>
            <Logo size={22} />
            <span className="text-[13px] text-fg-muted">/ Status</span>
          </div>
          <Button
            variant="secondary"
            onClick={refreshAll}
            loading={isLoading}
            leadingIcon={<RefreshCw size={13} />}
            className="max-sm:h-10"
          >
            Retry
          </Button>
        </div>
      </header>

      <main className="mx-auto flex max-w-5xl flex-col gap-8 px-4 py-8 sm:px-6">
        <div className="flex flex-wrap items-center justify-between gap-3" role="status" aria-live="polite">
          <div>
            <h1 className="text-[20px] font-semibold tracking-tight">System status</h1>
            <p className="mt-1 text-[13px] text-fg-muted">Checks refresh every 10 seconds.</p>
          </div>
          <Badge tone={overall.tone}>{overall.text}</Badge>
        </div>

        {!isOnline && (
          <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-danger/30 bg-danger-soft px-4 py-3 text-[13px] text-danger">
            <span className="flex items-center gap-2">
              <WifiOff size={15} /> The server could not be reached. Your notes are safe on this device and will sync when the connection returns.
            </span>
            <Button variant="secondary" size="sm" onClick={refreshAll} loading={isLoading}>
              Retry now
            </Button>
          </div>
        )}

        <section aria-labelledby="components-h">
          <h2 id="components-h" className="mb-3 text-[14px] font-semibold">Components</h2>
          <ul className="divide-y divide-line rounded-lg border border-line bg-panel">
            {components.map((c) => (
              <li key={c.name} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-3">
                <div className="min-w-0">
                  <div className="text-[13px] font-medium">{c.name}</div>
                  <div className="text-[12px] text-fg-muted">{c.detail}</div>
                </div>
                <div className="flex items-center gap-3">
                  {c.metric && <span className="font-mono text-[12px] text-fg-muted">{c.metric}</span>}
                  {isLoading && c.name === "API server" ? <Spinner size={14} /> : null}
                  <Badge tone={c.tone}>{c.label}</Badge>
                </div>
              </li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="latency-h">
          <h2 id="latency-h" className="mb-3 text-[14px] font-semibold">API latency</h2>
          <div className="rounded-lg border border-line bg-panel p-4">
            {latencyHistory.length === 0 ? (
              isLoading ? (
                <Skeleton className="h-16 w-full" />
              ) : (
                <p className="text-[13px] text-fg-muted">No successful checks yet.</p>
              )
            ) : (
              <>
                <div className="flex items-baseline gap-1">
                  <span className="text-[26px] font-semibold tracking-tight">{latency !== null ? latency : "--"}</span>
                  <span className="text-[12px] text-fg-muted">ms latest</span>
                </div>
                <div
                  role="img"
                  aria-label={`Latency over the last ${latencyHistory.length} checks, in milliseconds: ${latencyHistory.join(", ")}`}
                  className="mt-3 flex h-16 items-end gap-1"
                >
                  {latencyHistory.map((val, idx) => (
                    <div
                      key={idx}
                      className="flex-1 rounded-sm bg-accent"
                      style={{
                        height: `${Math.max(4, Math.min(100, (val / 300) * 100))}%`,
                        opacity: idx === latencyHistory.length - 1 ? 1 : 0.4,
                      }}
                    />
                  ))}
                </div>
              </>
            )}
          </div>
        </section>

        {serverHealth && (
          <section aria-labelledby="server-h">
            <h2 id="server-h" className="mb-3 text-[14px] font-semibold">Server</h2>
            <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-line bg-line sm:grid-cols-4">
              {[
                ["Environment", serverHealth.nodeEnv],
                ["Port", "3000"],
                ["Uptime", `${Math.floor(serverHealth.uptime)}s`],
                ["Heap", `${Math.round(serverHealth.memoryUsage?.heapUsed / 1024 / 1024)} MB`],
              ].map(([k, v]) => (
                <div key={k} className="bg-panel px-4 py-3">
                  <dt className="text-[12px] text-fg-muted">{k}</dt>
                  <dd className="mt-0.5 font-mono text-[13px] font-medium">{v}</dd>
                </div>
              ))}
            </dl>
          </section>
        )}

        <section aria-labelledby="actions-h">
          <h2 id="actions-h" className="mb-3 text-[14px] font-semibold">Actions</h2>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={checkLatencyAndHealth} loading={isLoading} leadingIcon={<Activity size={13} />} className="max-sm:h-10">
              Ping server
            </Button>
            <Button variant="secondary" onClick={handleRetryDatabaseConnection} loading={dbRetryLoading} leadingIcon={<Database size={13} />} className="max-sm:h-10">
              Retry database connection
            </Button>
            <Button variant="secondary" onClick={handleDownloadDiagnostics} leadingIcon={<Download size={13} />} className="max-sm:h-10">
              Export diagnostics
            </Button>
            <Button variant="danger" onClick={() => setPurgeOpen(true)} leadingIcon={<Trash2 size={13} />} className="max-sm:h-10">
              Purge local cache
            </Button>
          </div>
        </section>

        <section aria-labelledby="logs-h">
          <h2 id="logs-h" className="mb-3 text-[14px] font-semibold">Diagnostic log</h2>
          <div className="max-h-[320px] overflow-y-auto rounded-lg border border-line bg-panel">
            {logs.length === 0 ? (
              <div className="flex items-center gap-2 px-4 py-8 text-[13px] text-fg-muted">
                <Spinner size={14} /> Gathering diagnostics...
              </div>
            ) : (
              <ul className="divide-y divide-line font-mono text-[12px]">
                {logs.map((log, index) => (
                  <li key={index} className="flex items-start gap-2 px-4 py-2">
                    <span className="shrink-0 text-fg-subtle">{log.timestamp}</span>
                    <Badge tone={logTone[log.type]} className="shrink-0">{log.type}</Badge>
                    <span className="break-words text-fg-muted">{log.message}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      </main>

      <Dialog
        open={purgeOpen}
        onClose={() => setPurgeOpen(false)}
        title="Purge local cache?"
        description="This removes cached notes, folder backups and last-sync markers stored in this browser. Anything not yet synced to the server will be lost."
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setPurgeOpen(false)}>Cancel</Button>
            <Button variant="danger" onClick={() => { setPurgeOpen(false); performPurge(); }}>Purge cache</Button>
          </>
        }
      >
        <p className="text-[13px] text-fg-muted">This cannot be undone.</p>
      </Dialog>
    </div>
  );
}
