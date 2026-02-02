const CACHE = "pwa-deriv-v1";

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE).then(cache =>
      cache.addAll([
        "/pwa-deriv/",
        "/pwa-deriv/index.html",
        "/pwa-deriv/styles.css",
        "/pwa-deriv/app.js"
      ])
    )
  );
});

self.addEventListener("fetch", event => {
  event.respondWith(
    caches.match(event.request).then(
      response => response || fetch(event.request)
    )
  );
});