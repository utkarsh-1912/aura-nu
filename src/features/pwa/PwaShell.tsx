/**
 * Shell-level PWA UI: "update available" toast and a dismissible install banner.
 * Renders nothing in dev (no service worker is registered there) and nothing on non-workspace routes.
 */
import React, { useEffect, useState } from "react";
import { Download, RefreshCw, X } from "lucide-react";
import { useLocation } from "react-router-dom";
import { Button, IconButton } from "../../ui";
import { canShowInstall } from "../../mobile/installPrompt";
import { useInstallPrompt } from "../../mobile/hooks";
import type { SwHandle } from "../../mobile";
import { subscribeSwUpdate } from "./swBoot";

const DISMISS_KEY = "aura-install-dismissed-until";
const COOLDOWN = 7 * 24 * 3600 * 1000;

function dismissedUntil(): number {
  try { return Number(localStorage.getItem(DISMISS_KEY) || 0); } catch { return 0; }
}

export default function PwaShell() {
  const { pathname } = useLocation();
  const [update, setUpdate] = useState<SwHandle | null>(null);
  const [updateHidden, setUpdateHidden] = useState(false);
  const { state, promptInstall } = useInstallPrompt();
  const [bannerHidden, setBannerHidden] = useState(() => dismissedUntil() > Date.now());

  useEffect(() => subscribeSwUpdate(setUpdate), []);

  if (!import.meta.env.PROD) return null;
  const inWorkspace = pathname.startsWith("/w/");
  const showInstall = inWorkspace && !bannerHidden && canShowInstall(state);

  const dismissInstall = () => {
    setBannerHidden(true);
    try { localStorage.setItem(DISMISS_KEY, String(Date.now() + COOLDOWN)); } catch { /* ignore */ }
  };

  return (
    <>
      {update && !updateHidden && (
        <div role="status" className="fixed bottom-4 left-4 z-[110] flex max-w-[min(92vw,380px)] items-center gap-3 rounded-lg border border-line bg-raised px-3 py-2.5 shadow-pop">
          <RefreshCw size={15} className="shrink-0 text-accent" aria-hidden />
          <p className="min-w-0 flex-1 text-[13px] text-fg">A new version of Aura is ready.</p>
          <Button size="sm" variant="primary" onClick={() => update.applyUpdate()}>Update</Button>
          <IconButton label="Dismiss update notice" size="sm" onClick={() => setUpdateHidden(true)}><X size={13} /></IconButton>
        </div>
      )}
      {showInstall && (
        <div role="region" aria-label="Install app" className="fixed inset-x-3 bottom-[calc(env(safe-area-inset-bottom)+4.5rem)] z-[105] mx-auto flex max-w-md items-center gap-3 rounded-lg border border-line bg-raised px-3 py-2.5 shadow-pop md:bottom-4 md:left-auto md:right-4 md:mx-0">
          <Download size={16} className="shrink-0 text-accent" aria-hidden />
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-medium text-fg">Install Aura</p>
            <p className="text-[12px] text-fg-muted">
              {state.kind === "ios-manual" ? "Tap Share, then “Add to Home Screen”." : "Open it like an app and capture notes offline."}
            </p>
          </div>
          {state.kind === "available" && <Button size="sm" variant="primary" onClick={() => void promptInstall()}>Install</Button>}
          <IconButton label="Not now" size="sm" onClick={dismissInstall}><X size={13} /></IconButton>
        </div>
      )}
    </>
  );
}
