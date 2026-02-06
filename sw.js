const CACHE = "deriv-assets-v6-2";

const ASSETS = [
  "./",
  "./index.html",
  "./style.css",
  "./app.js",
  "./manifest.json",
  "./icon-192.png",
  "./icon-512.png",
  "./alert.mp3",
  "./bg-neon.png"
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

  // ✅ Network-first para HTML/JS/CSS (evita desfasajes de cache)
  if (
    url.pathname.endsWith("/index.html") ||
    url.pathname.endsWith("/app.js") ||
    url.pathname.endsWith("/style.css") ||
    e.request.mode === "navigate"
  ) {
    e.respondWith(fetch(e.request).catch(() => caches.match(e.request)));
    return;
  }

  // Cache-first para assets estáticos
  e.respondWith(
    caches.match(e.request).then(r => r || fetch(e.request))
  );
});

/* ✅ Click en notificación: abre Deriv en DEMO / Rise-Fall / símbolo */
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
