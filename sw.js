self.addEventListener("install", e => {
  e.waitUntil(
    caches.open("deriv-v1").then(cache =>
      cache.addAll([
        "./",
        "./index.html",
        "./style.css",
        "./app.js"
      ])
    )
  );
});

self.addEventListener("fetch", e => {
  e.respondWith(
    caches.match(e.request).then(r => r || fetch(e.request))
  );
});