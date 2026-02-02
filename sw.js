const CACHE = "deriv-assets-v1";
const ASSETS = [
  "./style.css",
  "./manifest.json",
  "./icon-192.png",
  "./icon-512.png",
  "./alert.mp3"
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.map(k => (k !== CACHE ? caches.delete(k) : null)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);

  // ✅ Siempre traer lo último del servidor para HTML y JS
  if (url.pathname.endsWith("/index.html") || url.pathname.endsWith("/app.js") || e.request.mode === "navigate") {
    e.respondWith(fetch(e.request));
    return;
  }

  // ✅ Assets: cache-first
  e.respondWith(
    caches.match(e.request).then(r => r || fetch(e.request))
  );
});