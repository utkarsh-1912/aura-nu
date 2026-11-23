/** React hooks for mobile ergonomics. UNTESTED-IN-BROWSER (the pure logic they call is unit-tested). */
import { useEffect, useReducer, useRef, useState } from 'react';
import { computeKeyboardInset } from './keyboard';
import { readSafeAreaInsets, ZERO_INSETS, type Insets } from './safeArea';
import { SwipeTracker, type SwipeOptions, type SwipeResult } from './swipe';
import { installReducer, type InstallState } from './installPrompt';

export function useSafeAreaInsets(): Insets {
  const [insets, setInsets] = useState<Insets>(ZERO_INSETS);
  useEffect(() => {
    const update = () => setInsets(readSafeAreaInsets());
    update();
    window.addEventListener('orientationchange', update);
    window.addEventListener('resize', update);
    return () => {
      window.removeEventListener('orientationchange', update);
      window.removeEventListener('resize', update);
    };
  }, []);
  return insets;
}

/** Keyboard height in px (0 when hidden) from visualViewport. */
export function useVirtualKeyboardInset(): number {
  const [inset, setInset] = useState(0);
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const update = () => setInset(computeKeyboardInset(window.innerHeight, vv));
    vv.addEventListener('resize', update);
    vv.addEventListener('scroll', update);
    update();
    return () => {
      vv.removeEventListener('resize', update);
      vv.removeEventListener('scroll', update);
    };
  }, []);
  return inset;
}

/** Returns touch handlers to spread on an element. */
export function useSwipe(onSwipe: (r: SwipeResult) => void, opts?: SwipeOptions) {
  const tracker = useRef(new SwipeTracker(opts));
  const cb = useRef(onSwipe);
  cb.current = onSwipe;
  return {
    onPointerDown: (e: React.PointerEvent) => tracker.current.down(e.clientX, e.clientY, e.timeStamp),
    onPointerUp: (e: React.PointerEvent) => {
      const r = tracker.current.up(e.clientX, e.clientY, e.timeStamp);
      if (r) cb.current(r);
    },
    onPointerCancel: () => tracker.current.cancel(),
  };
}

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export function useInstallPrompt(): { state: InstallState; promptInstall(): Promise<void> } {
  const [state, dispatch] = useReducer(installReducer, { kind: 'idle' } as InstallState);
  const deferred = useRef<BeforeInstallPromptEvent | null>(null);
  useEffect(() => {
    const standalone = window.matchMedia?.('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true;
    const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
    dispatch({ type: 'platform', standalone: !!standalone, ios });
    const onBip = (e: Event) => {
      e.preventDefault();
      deferred.current = e as BeforeInstallPromptEvent;
      dispatch({ type: 'beforeinstallprompt' });
    };
    const onInstalled = () => dispatch({ type: 'appinstalled' });
    window.addEventListener('beforeinstallprompt', onBip);
    window.addEventListener('appinstalled', onInstalled);
    const iv = setInterval(() => dispatch({ type: 'tick', now: Date.now() }), 60_000);
    return () => {
      window.removeEventListener('beforeinstallprompt', onBip);
      window.removeEventListener('appinstalled', onInstalled);
      clearInterval(iv);
    };
  }, []);
  return {
    state,
    async promptInstall() {
      const ev = deferred.current;
      if (!ev) return;
      dispatch({ type: 'prompt' });
      await ev.prompt();
      const { outcome } = await ev.userChoice;
      dispatch({ type: 'userChoice', outcome, now: Date.now() });
    },
  };
}
