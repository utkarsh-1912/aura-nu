/**
 * Service worker registration + update flow. UNTESTED-IN-BROWSER.
 * Wiring (lead): call `registerServiceWorker({ onUpdateReady })` once from src/main.tsx in production,
 * show a toast with an "Update" button, and call `applyUpdate()` when clicked (it posts SKIP_WAITING and
 * reloads on controllerchange). Call `clearUserCaches()` on logout / account switch.
 */
export interface SwHandle {
  registration: ServiceWorkerRegistration;
  /** Activate the waiting worker and reload once it takes control. */
  applyUpdate(): void;
}

export async function registerServiceWorker(opts: { onUpdateReady?(h: SwHandle): void; url?: string } = {}): Promise<SwHandle | null> {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return null;
  const registration = await navigator.serviceWorker.register(opts.url ?? '/sw.js', { scope: '/' });
  const handle: SwHandle = {
    registration,
    applyUpdate() {
      let reloaded = false;
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (reloaded) return;
        reloaded = true;
        location.reload();
      });
      registration.waiting?.postMessage({ type: 'SKIP_WAITING' });
    },
  };
  const notifyIfWaiting = () => {
    // Only an update when a controller already exists (first install is not an "update").
    if (registration.waiting && navigator.serviceWorker.controller) opts.onUpdateReady?.(handle);
  };
  notifyIfWaiting();
  registration.addEventListener('updatefound', () => {
    const w = registration.installing;
    w?.addEventListener('statechange', () => {
      if (w.state === 'installed') notifyIfWaiting();
    });
  });
  return handle;
}

export function clearUserCaches(): void {
  if (typeof navigator === 'undefined' || !navigator.serviceWorker?.controller) return;
  navigator.serviceWorker.controller.postMessage({ type: 'CLEAR_USER_DATA' });
}

/** Ask the SW to wake the sync engine when connectivity returns (Background Sync API, Chromium only). */
export async function requestBackgroundSync(tag = 'aura-sync'): Promise<boolean> {
  try {
    const reg = await navigator.serviceWorker.ready;
    const sync = (reg as unknown as { sync?: { register(t: string): Promise<void> } }).sync;
    if (!sync) return false;
    await sync.register(tag);
    return true;
  } catch {
    return false;
  }
}
