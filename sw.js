/* Offline support: everything is cached on first visit, so the app opens
   with no network. Bump VERSION whenever you change any file. */
const VERSION = "camp-v10";
const FILES = [
  "./", "./index.html", "./data.js", "./pwa.js", "./manifest.webmanifest",
  "./v2/", "./v2/index.html", "./v2/manifest.webmanifest",
  "./assets/nysc-logo.png",
  "./icons/icon-192.png", "./icons/icon-512.png", "./icons/maskable-192.png",
  "./icons/maskable-512.png", "./icons/apple-touch-icon.png", "./icons/favicon.png",
  "./fonts/inter-400.woff2",
  "./fonts/inter-500.woff2", "./fonts/inter-600.woff2", "./fonts/inter-700.woff2"
];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

/* Serve from cache instantly, refresh the cache in the background */
self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET" || new URL(req.url).origin !== location.origin) return;
  e.respondWith(
    caches.open(VERSION).then(cache =>
      cache.match(req, { ignoreSearch: true }).then(hit => {
        const net = fetch(req).then(res => {
          if (res && res.ok) cache.put(req, res.clone());
          return res;
        }).catch(() => hit);
        return hit || net;
      })
    )
  );
});
