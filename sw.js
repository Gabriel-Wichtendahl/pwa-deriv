/* sw.js — Deriv Signals v113.17 (precisión real + rescate tardío + refinamiento fino) */
"use strict";

const CACHE = "deriv-assets-v113-17-real-precision-late-rescue";

const CORE_ASSETS = [
  "./",
  "./index.html",
  "./style.css",
  "./app.js",
  "./manifest.json",
  "./alert.mp3",
];

const OPTIONAL_ASSETS = [
  "./icon-192.png",
  "./icon-512.png",
  "./bg-neon.png",
  "./pausa-visual-bg.png",
];

self.addEventListener("install", (e) => {
  e.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    // Los archivos esenciales sí deben quedar disponibles.
    await cache.addAll(CORE_ASSETS);
    // Un asset visual ausente no puede impedir la instalación de la versión nueva.
    await Promise.allSettled(OPTIONAL_ASSETS.map((asset) => cache.add(asset)));
  })());
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.map((k) => (k !== CACHE ? caches.delete(k) : null)));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);

  const isHTML =
    e.request.mode === "navigate" ||
    url.pathname.endsWith("/index.html") ||
    url.pathname.endsWith("/");

  const isCore =
    url.pathname.endsWith("/app.js") ||
    url.pathname.endsWith("/style.css") ||
    url.pathname.endsWith("/manifest.json");

  // ✅ Network-first core (HTML/CSS/JS) para NO quedar clavado
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

  // ✅ Cache-first para assets
  e.respondWith(
    caches.match(e.request).then((r) => r || fetch(e.request))
  );
});

/* ✅ Click notificación:
   - Si la PWA ya está abierta: enfoca y manda mensaje SIN recargar.
   - Si no está abierta: abre una ventana nueva con ?openSignal=...&openChart=1.
*/
self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const data = event.notification?.data || {};
  const signalId = data.signalId || "";

  const targetUrl = new URL(data.url || self.registration.scope, self.location.origin).toString();
  const target = new URL(targetUrl);

  event.waitUntil((async () => {
    const allClients = await clients.matchAll({
      type: "window",
      includeUncontrolled: true
    });

    for (const client of allClients) {
      try {
        const clientUrl = new URL(client.url);

        const sameOrigin = clientUrl.origin === target.origin;

        const normalizedClientPath = clientUrl.pathname.replace(/\/index\.html$/, "").replace(/\/$/, "");
        const normalizedTargetPath = target.pathname.replace(/\/index\.html$/, "").replace(/\/$/, "");

        const samePwa =
          sameOrigin &&
          (
            normalizedClientPath === normalizedTargetPath ||
            clientUrl.pathname.endsWith("/index.html")
          );

        if (samePwa) {
          // IMPORTANTE:
          // No hacemos client.navigate(targetUrl) cuando la app ya está abierta,
          // porque recarga la PWA y se pierden los ticks vivos del gráfico.
          await client.focus();

          client.postMessage({
            type: "OPEN_SIGNAL_FROM_NOTIFICATION",
            signalId,
            url: targetUrl
          });

          return;
        }
      } catch {}
    }

    await clients.openWindow(targetUrl);
  })());
});
