const CACHE = "deriv-assets-v7-live-trade-1";

const ASSETS = [
  "./",
  "./index.html",
  "./style.css",
  "./app.js",
  "./manifest.json",
  "./icon-192.png",
  "./icon-512.png",
  "./alert.mp3",
  "./bg-neon.png",
];

self.addEventListener("install", (e) => {
  e.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await cache.addAll(ASSETS);
  })());
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.map(k => (k !== CACHE ? caches.delete(k) : null)));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);

  const isHTML = e.request.mode === "navigate" || url.pathname.endsWith("/index.html");
  const isCore = url.pathname.endsWith("/app.js") || url.pathname.endsWith("/style.css");

  // ✅ Network-first para core (evita quedar clavado)
  if (isHTML || isCore) {
    e.respondWith((async () => {
      try {
        const fresh = await fetch(e.request, { cache: "no-store" });
        const cache = await caches.open(CACHE);
        cache.put(e.request, fresh.clone());
        return fresh;
      } catch {
        const cached = await caches.match(e.request);
        return cached || caches.match("./index.html");
      }
    })());
    return;
  }

  // ✅ Cache-first resto
  e.respondWith(
    caches.match(e.request).then(r => r || fetch(e.request))
  );
});

/* Click notificación */
self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const url = event.notification?.data?.url || "https://app.deriv.com/dtrader?account=demo";

  event.waitUntil((async () => {
    const allClients = await clients.matchAll({
      type: "window",
      includeUncontrolled: true
    });

    for (const client of allClients) {
      if (client.url && client.url.includes("app.deriv.com")) {
        await client.focus();
        if ("navigate" in client) await client.navigate(url);
        return;
      }
    }

    await clients.openWindow(url);
  })());
});