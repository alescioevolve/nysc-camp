/* Offline support: everything is cached on first visit, so the app opens
   with no network. Bump VERSION whenever you change any file. */
const VERSION = "camp-v18";
const FILES = [
  "./", "./index.html", "./data.js", "./pwa.js",
  "./app/", "./app/index.html", "./app/manifest.webmanifest",
  "./v2/", "./v2/index.html", "./v2/manifest.webmanifest",
  "./assets/nysc-logo.png",
  "./icons/icon-192.png", "./icons/icon-512.png", "./icons/maskable-192.png",
  "./icons/maskable-512.png", "./icons/apple-touch-icon.png", "./icons/favicon.png",
  "./private-admin/manifest.webmanifest", "./icons/camp-admin-48.png", "./icons/camp-admin-96.png",
  "./icons/camp-admin-180.png", "./icons/camp-admin-192.png", "./icons/camp-admin-512.png",
  "./icons/camp-admin-maskable-192.png", "./icons/camp-admin-maskable-512.png",
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

/* Pages: fetch fresh when there is signal (4 s limit), saved copy when offline.
   Everything else: serve the saved copy instantly and refresh it in the background. */
self.addEventListener("fetch", e => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== location.origin) return;
  /* Live camp data is never cached here: the app keeps its own last copy and must always see the newest one */
  if (url.pathname.includes("/live/") || url.pathname.includes("/api/")) return;
  if (req.mode === "navigate") {
    e.respondWith(caches.open(VERSION).then(cache => {
      const net = fetch(req).then(res => { if (res && res.ok) cache.put(req, res.clone()); return res; });
      const slow = new Promise(r => setTimeout(r, 4000)).then(() => cache.match(req, { ignoreSearch: true }));
      return Promise.race([net.catch(() => cache.match(req, { ignoreSearch: true })), slow.then(h => h || net)])
        .then(r => r || cache.match("./app/") || net);
    }));
    return;
  }
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
