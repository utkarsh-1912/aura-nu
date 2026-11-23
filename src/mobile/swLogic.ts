/**
 * Pure service-worker decision logic.
 *
 * KEEP IN SYNC with the block between `// <swlogic>` and `// </swlogic>` in public/sw.js (the SW cannot
 * import TS and the repo has no SW build step). tests/capture/swLogic.test.ts runs the SAME cases against
 * both this module and the code extracted from sw.js, so drift fails CI.
 */

export const CACHE_VERSION = 'v1';
export const CACHE_PREFIX = 'aura-';

export const cacheNames = (v: string = CACHE_VERSION) => ({
  shell: `${CACHE_PREFIX}shell-${v}`,
  static: `${CACHE_PREFIX}static-${v}`,
  api: `${CACHE_PREFIX}api-${v}`,
  share: `${CACHE_PREFIX}share`,
});

export const SHELL_URLS = ['/', '/offline.html', '/manifest.webmanifest', '/logo.png'];

export interface SwRequestInfo {
  url: string;
  method: string;
  /** Request.mode ('navigate' for page loads). */
  mode?: string;
  /** Request.destination ('script', 'style', 'image', 'font', ...). */
  destination?: string;
  /** True when the request carries an Authorization header. */
  hasAuth?: boolean;
}

export type SwStrategy =
  | 'network-only'
  | 'navigate' // network-first, fall back to cached shell, then /offline.html
  | 'api-network-first' // network-first with user-scoped cache + offline fallback
  | 'stale-while-revalidate'
  | 'share-target';

export interface SwDecision {
  strategy: SwStrategy;
  /** For API strategies: whether the response may be written to the (user-scoped) API cache. */
  cacheApi?: boolean;
  /** For failed API writes: enqueue for background sync. */
  queueOnFailure?: boolean;
  reason: string;
}

const STATIC_EXT = /\.(?:js|mjs|css|woff2?|ttf|png|jpe?g|gif|svg|webp|avif|ico|webmanifest|json|wasm)$/i;

export function decideRequest(req: SwRequestInfo, origin: string): SwDecision {
  let u: URL;
  try {
    u = new URL(req.url, origin);
  } catch {
    return { strategy: 'network-only', reason: 'bad-url' };
  }
  const method = req.method.toUpperCase();
  if (u.origin !== origin) return { strategy: 'network-only', reason: 'cross-origin' };
  if (method === 'POST' && u.pathname === '/share-target') return { strategy: 'share-target', reason: 'share-target' };
  if (u.pathname.startsWith('/api/')) {
    if (u.pathname.startsWith('/api/auth')) return { strategy: 'network-only', reason: 'auth-never-cached' };
    if (method === 'GET') {
      // Without an Authorization header there is no user scope to key the cache on -> do not cache.
      return { strategy: 'api-network-first', cacheApi: !!req.hasAuth, reason: req.hasAuth ? 'api-get-scoped' : 'api-get-unscoped' };
    }
    return { strategy: 'network-only', queueOnFailure: method !== 'GET' && method !== 'HEAD', reason: 'api-write' };
  }
  if (method !== 'GET') return { strategy: 'network-only', reason: 'non-get' };
  if (req.mode === 'navigate') return { strategy: 'navigate', reason: 'navigation' };
  if (u.pathname.startsWith('/assets/') || STATIC_EXT.test(u.pathname) || ['script', 'style', 'font', 'image', 'worker'].includes(req.destination ?? '')) {
    return { strategy: 'stale-while-revalidate', reason: 'static' };
  }
  return { strategy: 'network-only', reason: 'other' };
}

/** FNV-1a 32-bit, hex. Used only to scope cache keys; the token itself is never stored. */
export function scopeHash(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

/** Cache key for an authenticated API GET: the URL plus a hash of the credential. Users never share keys. */
export function apiCacheKey(url: string, authHeader: string, origin: string): string {
  const u = new URL(url, origin);
  u.searchParams.set('__aura_scope', scopeHash(authHeader));
  return u.toString();
}

/** Never store responses that opt out of caching or are not plain successes. */
export function isCacheableResponse(status: number, cacheControl: string | null | undefined, hasSetCookie = false): boolean {
  if (status !== 200) return false;
  if (hasSetCookie) return false;
  const cc = (cacheControl ?? '').toLowerCase();
  return !/(?:^|[\s,])(?:no-store|private)(?:[\s,=]|$)/.test(cc);
}

/** On activate, delete our own caches from other versions (never touch foreign caches). */
export function cachesToDelete(existing: string[], current: string[]): string[] {
  return existing.filter((n) => n.startsWith(CACHE_PREFIX) && !current.includes(n));
}

export const SYNC_TAG = 'aura-sync';
