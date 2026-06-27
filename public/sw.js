/* Offline service worker for the Stillness PWA.
 *
 * - HTML / navigations: network-first (so new deploys load), cache fallback.
 * - Static assets (hashed JS/CSS, fonts, images, audio): cache-first, fetched
 *   and cached on demand — so played tracks work offline without precaching
 *   the whole 50+ MB library up front.
 */
// Bump this version to invalidate any previously-cached app shell (e.g. a stale
// page cached before the GitHub Pages deploy was serving the real app). The
// activate handler deletes every cache that isn't the current one.
const CACHE = 'stillness-v2';
const START = '/meditationApp/';

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((c) => c.addAll([START]).catch(() => {}))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.endsWith('/sw.js')) return; // never cache the worker itself

  // Navigations: network-first so the latest app shell loads when online.
  if (req.mode === 'navigate') {
    event.respondWith(
      (async () => {
        try {
          const fresh = await fetch(req);
          const cache = await caches.open(CACHE);
          cache.put(req, fresh.clone());
          return fresh;
        } catch (e) {
          return (await caches.match(req)) || (await caches.match(START)) || Response.error();
        }
      })(),
    );
    return;
  }

  // Static assets: cache-first, then network (and cache the result).
  event.respondWith(
    (async () => {
      const cached = await caches.match(req);
      if (cached) return cached;
      try {
        const fresh = await fetch(req);
        if (fresh && fresh.status === 200 && fresh.type === 'basic') {
          const cache = await caches.open(CACHE);
          cache.put(req, fresh.clone());
        }
        return fresh;
      } catch (e) {
        return cached || Response.error();
      }
    })(),
  );
});
