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

  // Siempre traer lo último del servidor para HTML y JS
  if (
    url.pathname.endsWith("/index.html") ||
    url.pathname.endsWith("/app.js") ||
    e.request.mode === "navigate"
  ) {
    e.respondWith(fetch(e.request));
    return;
  }

  // Assets: cache-first
  e.respondWith(caches.match(e.request).then(r => r || fetch(e.request)));
});

/* =========================
   ✅ Click en notificación
   Abre Deriv Trader DEMO + Rise/Fall + símbolo
========================= */
self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const url = event.notification?.data?.url || "https://app.deriv.com/dtrader";

  event.waitUntil((async () => {
    const allClients = await clients.matchAll({
      type: "window",
      includeUncontrolled: true
    });

    // Si ya hay Deriv abierto, enfocarlo y navegar al símbolo
    for (const client of allClients) {
      if (client.url && client.url.includes("app.deriv.com")) {
        await client.focus();
        if ("navigate" in client) await client.navigate(url);
        return;
      }
    }

    // Si no hay, abrir nuevo
    await clients.openWindow(url);
  })());
});