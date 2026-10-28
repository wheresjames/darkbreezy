// Dark Breezy's service worker: an offline shell (Tier 3), and nothing more.
//
// It never serves stale code while online: every request for the app's own
// files goes to the network first (with whatever cache mode the page asked
// for, so the updater's cache: 'reload' still works), and the copy kept
// here is used only when the network fails. What to keep comes from the
// updater's file list (files-<build>.json, docs/cache-bust.md): the page
// posts it here, so there's one source of truth. Requests to the weather
// services and deployment.json are never touched: weather data lives in
// localStorage (state/cache.js), never in this worker.

const CACHE = 'darkbreezy-shell';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

/** { type: 'precache', paths: [...] }: keep exactly these files. */
self.addEventListener('message', (e) => {
  if (e.data?.type !== 'precache' || !Array.isArray(e.data.paths)) return;
  e.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    const base = new URL('./', self.registration.scope);
    const wanted = new Set(e.data.paths.map((p) => new URL(p, base).href));
    wanted.add(base.href);
    for (const req of await cache.keys()) if (!wanted.has(req.url)) await cache.delete(req);
    for (const url of wanted) {
      if (await cache.match(url)) continue;
      try {
        const res = await fetch(url, { cache: 'no-cache' });
        if (res.ok) await cache.put(url, res);
      } catch { /* offline now: the next list fills it */ }
    }
  })());
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;
  if (/\/deployment\.json$/.test(url.pathname)) return;
  e.respondWith((async () => {
    try {
      const res = await fetch(req);
      // Keep the cached copy of a listed file current.
      if (res.ok && req.cache !== 'no-store') {
        const cache = await caches.open(CACHE);
        const key = url.origin + url.pathname;
        if (await cache.match(key)) cache.put(key, res.clone());
      }
      return res;
    } catch (err) {
      const cache = await caches.open(CACHE);
      const hit = await cache.match(url.origin + url.pathname)
        || (req.mode === 'navigate' && (await cache.match(new URL('./', self.registration.scope).href) || await cache.match(new URL('index.html', self.registration.scope).href)));
      if (hit) return hit;
      throw err;
    }
  })());
});
