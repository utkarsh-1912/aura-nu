import { useEffect, useRef } from "react";
import { consumeIntent, readAndClearShare, type CacheStorageLike, type SharePayload } from "./shareTarget";

/**
 * Runs the pending launch intent (share target / manifest shortcut) once the workspace has hydrated.
 * Handlers are read through a ref so they always see current state.
 */
export function useLaunchIntents(opts: {
  ready: boolean;
  onNewNote: () => void;
  onQuickNote: () => void;
  onShare: (payload: SharePayload) => void;
}) {
  const h = useRef(opts);
  h.current = opts;
  useEffect(() => {
    if (!opts.ready) return;
    let storage: Storage | null = null;
    try { storage = window.sessionStorage; } catch { return; }
    const intent = consumeIntent(storage);
    if (!intent) return;
    if (intent.kind === "new-note") h.current.onNewNote();
    else if (intent.kind === "quick-note") h.current.onQuickNote();
    else {
      void readAndClearShare((typeof caches !== "undefined" ? caches : undefined) as unknown as CacheStorageLike | undefined)
        .then((p) => { if (p) h.current.onShare(p); });
    }
  }, [opts.ready]);
}
