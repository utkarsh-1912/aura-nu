import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import * as ts from '../../src/mobile/swLogic';
import { computeKeyboardInset, scrollDeltaToReveal } from '../../src/mobile/keyboard';
import { detectSwipe, isEdgeStart, SwipeTracker } from '../../src/mobile/swipe';
import { canShowInstall, installReducer, type InstallState } from '../../src/mobile/installPrompt';
import { insetsToCssVars, parsePx } from '../../src/mobile/safeArea';

// Load the REAL public/sw.js with a fake worker global and use its exported logic.
const src = readFileSync(resolve(__dirname, '../../public/sw.js'), 'utf8');
const mod: { exports: any } = { exports: {} };
new Function('self', 'module', 'caches', src)({ addEventListener() {}, location: { origin: 'https://aura.test' } }, mod, {});
const js = mod.exports;

const O = 'https://aura.test';
const impls: Array<[string, any]> = [['swLogic.ts', ts], ['public/sw.js', js]];

describe.each(impls)('SW decisions (%s)', (_name, L) => {
  const d = (url: string, o: any = {}) => L.decideRequest({ url, method: 'GET', ...o }, O);
  it('navigations use the navigate strategy', () => {
    expect(d('/notes/1', { mode: 'navigate' }).strategy).toBe('navigate');
  });
  it('static assets are stale-while-revalidate', () => {
    expect(d('/assets/index-abc.js').strategy).toBe('stale-while-revalidate');
    expect(d('/logo.png', { destination: 'image' }).strategy).toBe('stale-while-revalidate');
    expect(d('/x', { destination: 'font' }).strategy).toBe('stale-while-revalidate');
  });
  it('authenticated API GETs are cached only with an Authorization header (user scoped)', () => {
    expect(d('/api/notes', { hasAuth: true })).toMatchObject({ strategy: 'api-network-first', cacheApi: true });
    expect(d('/api/notes')).toMatchObject({ strategy: 'api-network-first', cacheApi: false });
  });
  it('auth endpoints and API writes are never cached; writes can queue', () => {
    expect(d('/api/auth/login', { hasAuth: true }).strategy).toBe('network-only');
    expect(d('/api/auth/me', { hasAuth: true }).strategy).toBe('network-only');
    expect(d('/api/notes', { method: 'POST', hasAuth: true })).toMatchObject({ strategy: 'network-only', queueOnFailure: true });
    expect(d('/api/notes/1', { method: 'DELETE' }).queueOnFailure).toBe(true);
  });
  it('cross-origin and other non-GET are left to the network', () => {
    expect(d('https://evil.test/api/notes', { hasAuth: true }).strategy).toBe('network-only');
    expect(d('/something', { method: 'POST' }).strategy).toBe('network-only');
    expect(d('/data/feed')).toMatchObject({ strategy: 'network-only' });
    expect(d('http://[bad').strategy).toBeDefined();
  });
  it('share target POST is handled', () => {
    expect(d('/share-target', { method: 'POST' }).strategy).toBe('share-target');
    expect(d('/share-target', { method: 'GET', mode: 'navigate' }).strategy).toBe('navigate');
  });
  it('cache keys are scoped per credential and never leak between users', () => {
    const a = L.apiCacheKey('/api/notes?x=1', 'Bearer alice', O);
    const b = L.apiCacheKey('/api/notes?x=1', 'Bearer bob', O);
    expect(a).not.toBe(b);
    expect(a).toBe(L.apiCacheKey('/api/notes?x=1', 'Bearer alice', O));
    expect(a).not.toContain('alice');
    expect(a).toContain('x=1');
  });
  it('response cacheability honours no-store/private/set-cookie/status', () => {
    expect(L.isCacheableResponse(200, 'public, max-age=60')).toBe(true);
    expect(L.isCacheableResponse(200, null)).toBe(true);
    expect(L.isCacheableResponse(200, 'no-store')).toBe(false);
    expect(L.isCacheableResponse(200, 'private, max-age=0')).toBe(false);
    expect(L.isCacheableResponse(200, 'max-age=1', true)).toBe(false);
    expect(L.isCacheableResponse(401, null)).toBe(false);
    expect(L.isCacheableResponse(500, null)).toBe(false);
  });
  it('activate cleanup removes only stale aura caches', () => {
    const n = L.cacheNames('v2');
    const cur = [n.shell, n.static, n.api, n.share];
    expect(L.cachesToDelete(['aura-shell-v1', n.shell, 'aura-share', 'other-app-cache'], cur)).toEqual(['aura-shell-v1']);
  });
});

describe('sw.js stays in sync with swLogic.ts', () => {
  it('same version, shell list and cache names', () => {
    expect(js.CACHE_VERSION).toBe(ts.CACHE_VERSION);
    expect(js.SHELL_URLS).toEqual(ts.SHELL_URLS);
    expect(js.cacheNames()).toEqual(ts.cacheNames());
    expect(js.scopeHash('Bearer abc')).toBe(ts.scopeHash('Bearer abc'));
  });
  it('shell includes offline page', () => {
    expect(ts.SHELL_URLS).toContain('/offline.html');
  });
});

describe('mobile helpers', () => {
  it('keyboard inset ignores small chrome changes', () => {
    expect(computeKeyboardInset(800, { height: 500, offsetTop: 0 })).toBe(300);
    expect(computeKeyboardInset(800, { height: 760, offsetTop: 0 })).toBe(0);
    expect(computeKeyboardInset(800, { height: 500, offsetTop: 100 })).toBe(200);
    expect(scrollDeltaToReveal(700, 600)).toBe(116);
    expect(scrollDeltaToReveal(100, 600)).toBe(0);
  });
  it('swipe detection', () => {
    expect(detectSwipe({ x: 0, y: 0 }, { x: 120, y: 10 }, 200)?.direction).toBe('right');
    expect(detectSwipe({ x: 100, y: 0 }, { x: 0, y: 5 }, 200)?.direction).toBe('left');
    expect(detectSwipe({ x: 0, y: 0 }, { x: 5, y: -150 }, 200)?.direction).toBe('up');
    expect(detectSwipe({ x: 0, y: 0 }, { x: 10, y: 10 }, 100)).toBeNull(); // too short
    expect(detectSwipe({ x: 0, y: 0 }, { x: 100, y: 90 }, 200)).toBeNull(); // diagonal
    expect(detectSwipe({ x: 0, y: 0 }, { x: 100, y: 0 }, 2000)).toBeNull(); // too slow
    expect(detectSwipe({ x: 0, y: 0 }, { x: 100, y: 0 }, 0)).toBeNull();
    expect(isEdgeStart(10, 375, 'left')).toBe(true);
    expect(isEdgeStart(10, 375, 'right')).toBe(false);
    const t = new SwipeTracker();
    expect(t.up(0, 0, 0)).toBeNull();
    t.down(0, 0, 0);
    expect(t.up(100, 0, 100)?.direction).toBe('right');
    expect(t.up(100, 0, 200)).toBeNull();
  });
  it('install prompt state machine', () => {
    let s: InstallState = { kind: 'idle' };
    s = installReducer(s, { type: 'platform', standalone: false, ios: false });
    expect(s.kind).toBe('idle');
    s = installReducer(s, { type: 'beforeinstallprompt' });
    expect(canShowInstall(s)).toBe(true);
    s = installReducer(s, { type: 'prompt' });
    expect(s.kind).toBe('prompting');
    s = installReducer(s, { type: 'userChoice', outcome: 'dismissed', now: 1000, cooldownMs: 500 });
    expect(s).toEqual({ kind: 'dismissed', until: 1500 });
    expect(installReducer(s, { type: 'tick', now: 1200 })).toBe(s);
    expect(installReducer(s, { type: 'tick', now: 1500 }).kind).toBe('available');
    expect(installReducer({ kind: 'prompting' }, { type: 'userChoice', outcome: 'accepted', now: 0 }).kind).toBe('installed');
    expect(installReducer({ kind: 'idle' }, { type: 'platform', standalone: true, ios: false }).kind).toBe('installed');
    expect(installReducer({ kind: 'idle' }, { type: 'platform', standalone: false, ios: true }).kind).toBe('ios-manual');
    expect(installReducer({ kind: 'available' }, { type: 'appinstalled' }).kind).toBe('installed');
  });
  it('safe area parsing', () => {
    expect(parsePx('44px')).toBe(44);
    expect(parsePx('')).toBe(0);
    expect(parsePx('auto')).toBe(0);
    expect(insetsToCssVars({ top: 1, right: 2, bottom: 3, left: 4 }, 300)['--keyboard-inset']).toBe('300px');
  });
});
