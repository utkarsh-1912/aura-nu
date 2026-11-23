/* Aura Next service worker.
 * UNTESTED-IN-BROWSER: the lifecycle/fetch handlers below have not been run in a real browser.
 * The decision logic inside <swlogic> is mirrored in src/mobile/swLogic.ts and unit-tested
 * (tests/capture/swLogic.test.ts runs the same cases against both). Edit both together.
 *
 * Versioning: bump CACHE_VERSION on any release that changes /, /offline.html or shell assets.
 * Hashed /assets/* files from Vite are cached at runtime (stale-while-revalidate) so no build-time
 * precache manifest is needed; the shell list below is the minimal set for offline start.
 */

// <swlogic>
var CACHE_VERSION = 'v1';
var CACHE_PREFIX = 'aura-';
var SHELL_URLS = ['/', '/offline.html', '/manifest.webmanifest', '/logo.png'];
var SYNC_TAG = 'aura-sync';
var STATIC_EXT = /\.(?:js|mjs|css|woff2?|ttf|png|jpe?g|gif|svg|webp|avif|ico|webmanifest|json|wasm)$/i;

function cacheNames(v) {
  v = v || CACHE_VERSION;
  return { shell: CACHE_PREFIX + 'shell-' + v, static: CACHE_PREFIX + 'static-' + v, api: CACHE_PREFIX + 'api-' + v, share: CACHE_PREFIX + 'share' };
}

function decideRequest(req, origin) {
  var u;
  try { u = new URL(req.url, origin); } catch (e) { return { strategy: 'network-only', reason: 'bad-url' }; }
  var method = req.method.toUpperCase();
  if (u.origin !== origin) return { strategy: 'network-only', reason: 'cross-origin' };
  if (method === 'POST' && u.pathname === '/share-target') return { strategy: 'share-target', reason: 'share-target' };
  if (u.pathname.indexOf('/api/') === 0) {
    if (u.pathname.indexOf('/api/auth') === 0) return { strategy: 'network-only', reason: 'auth-never-cached' };
    if (method === 'GET') {
      return { strategy: 'api-network-first', cacheApi: !!req.hasAuth, reason: req.hasAuth ? 'api-get-scoped' : 'api-get-unscoped' };
    }
    return { strategy: 'network-only', queueOnFailure: method !== 'GET' && method !== 'HEAD', reason: 'api-write' };
  }
  if (method !== 'GET') return { strategy: 'network-only', reason: 'non-get' };
  if (req.mode === 'navigate') return { strategy: 'navigate', reason: 'navigation' };
  if (u.pathname.indexOf('/assets/') === 0 || STATIC_EXT.test(u.pathname) || ['script', 'style', 'font', 'image', 'worker'].indexOf(req.destination || '') !== -1) {
    return { strategy: 'stale-while-revalidate', reason: 'static' };
  }
  return { strategy: 'network-only', reason: 'other' };
}

function scopeHash(s) {
  var h = 0x811c9dc5;
  for (var i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

function apiCacheKey(url, authHeader, origin) {
  var u = new URL(url, origin);
  u.searchParams.set('__aura_scope', scopeHash(authHeader));
  return u.toString();
}

function isCacheableResponse(status, cacheControl, hasSetCookie) {
  if (status !== 200) return false;
  if (hasSetCookie) return false;
  var cc = (cacheControl || '').toLowerCase();
  return !/(?:^|[\s,])(?:no-store|private)(?:[\s,=]|$)/.test(cc);
}

function cachesToDelete(existing, current) {
  return existing.filter(function (n) { return n.indexOf(CACHE_PREFIX) === 0 && current.indexOf(n) === -1; });
}
// </swlogic>

// ---- Lifecycle / fetch wiring (browser-only) ----
function reqInfo(request) {
  return {
    url: request.url,
    method: request.method,
    mode: request.mode,
    destination: request.destination,
    hasAuth: request.headers.has('Authorization'),
  };
}

function offlineJson() {
  return new Response(JSON.stringify({ error: 'offline' }), { status: 503, headers: { 'Content-Type': 'application/json', 'X-Aura-Offline': '1' } });
}

self.addEventListener('install', function (event) {
  var names = cacheNames();
  // No automatic skipWaiting: the page shows an "update available" prompt and posts SKIP_WAITING.
  event.waitUntil(
    caches.open(names.shell).then(function (c) {
      // addAll is atomic; use individual adds so one missing optional file does not fail install.
      return Promise.all(SHELL_URLS.map(function (u) { return c.add(new Request(u, { cache: 'reload' })).catch(function () {}); }));
    })
  );
});

self.addEventListener('activate', function (event) {
  var names = cacheNames();
  var current = [names.shell, names.static, names.api, names.share];
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(cachesToDelete(keys, current).map(function (k) { return caches.delete(k); }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('message', function (event) {
  var d = event.data || {};
  if (d.type === 'SKIP_WAITING') self.skipWaiting();
  // Sent on logout / account switch: drop every cached authenticated API response.
  if (d.type === 'CLEAR_USER_DATA') event.waitUntil(caches.delete(cacheNames().api));
});

// Background-sync STUB: the page-side sync engine owns the outbox; the SW only wakes it up.
self.addEventListener('sync', function (event) {
  if (event.tag === SYNC_TAG) {
    event.waitUntil(
      self.clients.matchAll({ includeUncontrolled: true }).then(function (cs) {
        cs.forEach(function (c) { c.postMessage({ type: 'SYNC_REQUESTED' }); });
      })
    );
  }
});

function networkFirstNavigate(request) {
  return fetch(request).catch(function () {
    return caches.open(cacheNames().shell).then(function (c) {
      return c.match('/').then(function (r) { return r || c.match('/offline.html'); });
    }).then(function (r) { return r || Response.error(); });
  });
}

function staleWhileRevalidate(request) {
  return caches.open(cacheNames().static).then(function (cache) {
    return cache.match(request).then(function (hit) {
      var net = fetch(request).then(function (res) {
        if (isCacheableResponse(res.status, res.headers.get('Cache-Control'), res.headers.has('Set-Cookie'))) cache.put(request, res.clone());
        return res;
      }).catch(function () { return hit; });
      return hit || net;
    });
  });
}

function apiNetworkFirst(request, decision) {
  var auth = request.headers.get('Authorization') || '';
  var key = decision.cacheApi ? apiCacheKey(request.url, auth, self.location.origin) : null;
  return fetch(request).then(function (res) {
    if (key && isCacheableResponse(res.status, res.headers.get('Cache-Control'), res.headers.has('Set-Cookie'))) {
      var copy = res.clone();
      caches.open(cacheNames().api).then(function (c) { return c.put(key, copy); });
    }
    return res;
  }).catch(function () {
    if (!key) return offlineJson();
    return caches.open(cacheNames().api).then(function (c) { return c.match(key); }).then(function (r) { return r || offlineJson(); });
  });
}

// Web Share Target (POST multipart): stash the payload for the app to pick up, then redirect into it.
function handleShareTarget(request) {
  return request.formData().then(function (fd) {
    var meta = { title: fd.get('title') || '', text: fd.get('text') || '', url: fd.get('url') || '', at: Date.now() };
    return caches.open(cacheNames().share).then(function (c) {
      var files = fd.getAll('files').filter(function (f) { return typeof f === 'object'; });
      var puts = [c.put('/__share/meta', new Response(JSON.stringify(meta), { headers: { 'Content-Type': 'application/json' } }))];
      files.forEach(function (f, i) { puts.push(c.put('/__share/file/' + i, new Response(f, { headers: { 'Content-Type': f.type || 'application/octet-stream', 'X-Filename': encodeURIComponent(f.name || 'file') } }))); });
      return Promise.all(puts);
    });
  }).then(function () { return Response.redirect('/?share=1', 303); })
    .catch(function () { return Response.redirect('/', 303); });
}

self.addEventListener('fetch', function (event) {
  var request = event.request;
  var decision = decideRequest(reqInfo(request), self.location.origin);
  switch (decision.strategy) {
    case 'share-target': event.respondWith(handleShareTarget(request)); break;
    case 'navigate': event.respondWith(networkFirstNavigate(request)); break;
    case 'stale-while-revalidate': event.respondWith(staleWhileRevalidate(request)); break;
    case 'api-network-first': event.respondWith(apiNetworkFirst(request, decision)); break;
    default: break; // network-only: let the browser handle it
  }
});

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { CACHE_VERSION: CACHE_VERSION, SHELL_URLS: SHELL_URLS, cacheNames: cacheNames, decideRequest: decideRequest, scopeHash: scopeHash, apiCacheKey: apiCacheKey, isCacheableResponse: isCacheableResponse, cachesToDelete: cachesToDelete };
}
