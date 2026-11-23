/// <reference types="vite/client" />
/**
 * Service worker boot. PRODUCTION BUILDS ONLY (the caller in main.tsx gates on import.meta.env.PROD, and this
 * module re-checks so a mistaken call in dev is a no-op). Publishes "update ready" to the PwaShell toast.
 */
import { registerServiceWorker, type SwHandle } from "../../mobile";

type Listener = (h: SwHandle | null) => void;
let pending: SwHandle | null = null;
const listeners = new Set<Listener>();

export function subscribeSwUpdate(l: Listener): () => void {
  listeners.add(l);
  l(pending);
  return () => { listeners.delete(l); };
}

export function bootServiceWorker(isProd: boolean = import.meta.env.PROD): void {
  if (!isProd || typeof window === "undefined") return;
  const start = () => {
    registerServiceWorker({
      onUpdateReady: (h) => { pending = h; listeners.forEach((l) => l(h)); },
    }).catch((err) => console.warn("Service worker registration failed", err));
  };
  if (document.readyState === "complete") start();
  else window.addEventListener("load", start, { once: true });
}
