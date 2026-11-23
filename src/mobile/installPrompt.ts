/**
 * PWA install prompt state machine (pure reducer).
 *
 *   unsupported (no beforeinstallprompt, not iOS) ... terminal
 *   ios-manual  (iOS Safari: no event; show "Share > Add to Home Screen" instructions)
 *   idle -> available (beforeinstallprompt captured) -> prompting -> installed | dismissed(cooldown) -> available
 *   standalone display mode => installed
 */
export type InstallState =
  | { kind: 'idle' }
  | { kind: 'unsupported' }
  | { kind: 'ios-manual' }
  | { kind: 'available' }
  | { kind: 'prompting' }
  | { kind: 'installed' }
  | { kind: 'dismissed'; until: number };

export type InstallEvent =
  | { type: 'platform'; standalone: boolean; ios: boolean }
  | { type: 'beforeinstallprompt' }
  | { type: 'prompt' }
  | { type: 'userChoice'; outcome: 'accepted' | 'dismissed'; now: number; cooldownMs?: number }
  | { type: 'appinstalled' }
  | { type: 'tick'; now: number };

export const DEFAULT_COOLDOWN_MS = 7 * 24 * 3600 * 1000;

export function installReducer(s: InstallState, e: InstallEvent): InstallState {
  if (e.type === 'appinstalled') return { kind: 'installed' };
  switch (s.kind) {
    case 'idle':
      if (e.type === 'platform') return e.standalone ? { kind: 'installed' } : e.ios ? { kind: 'ios-manual' } : s;
      if (e.type === 'beforeinstallprompt') return { kind: 'available' };
      return s;
    case 'ios-manual':
    case 'unsupported':
      return s;
    case 'available':
      return e.type === 'prompt' ? { kind: 'prompting' } : s;
    case 'prompting':
      if (e.type === 'userChoice') {
        return e.outcome === 'accepted' ? { kind: 'installed' } : { kind: 'dismissed', until: e.now + (e.cooldownMs ?? DEFAULT_COOLDOWN_MS) };
      }
      return s;
    case 'dismissed':
      // Chrome only fires beforeinstallprompt once per page load; after the cooldown we re-offer the saved event.
      if (e.type === 'tick' && e.now >= s.until) return { kind: 'available' };
      return s;
    case 'installed':
      return s;
  }
}

/** Whether UI should render an install affordance. */
export const canShowInstall = (s: InstallState) => s.kind === 'available' || s.kind === 'ios-manual';
