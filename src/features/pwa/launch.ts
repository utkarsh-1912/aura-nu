/** Captures ?share=1 / ?action=... at first load (before auth redirects drop the query) into sessionStorage. */
import { parseLaunchIntent, stashIntent } from "./shareTarget";

let captured = false;
export function captureLaunchIntent(): void {
  if (captured || typeof window === "undefined") return;
  captured = true;
  const intent = parseLaunchIntent(window.location.pathname, window.location.search);
  if (!intent) return;
  try { stashIntent(intent, window.sessionStorage); } catch { /* ignore */ }
  try {
    // Remove the one-shot params so a reload does not repeat the action.
    const url = new URL(window.location.href);
    url.searchParams.delete("share");
    url.searchParams.delete("action");
    if (url.pathname === "/share-target") url.pathname = "/";
    window.history.replaceState(null, "", url.pathname + url.search + url.hash);
  } catch { /* ignore */ }
}
