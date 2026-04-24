/* sw.js — Deriv Signals (network-first core + notificaciones abren PWA) */
"use strict";

const CACHE = "deriv-assets-v8-notif-pwa-1";

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

/* ✅ Click notificación: abre la PWA y pide abrir la señal/gráfico */
self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const data = event.notification?.data || {};
  const signalId = data.signalId || "";

  // El app.js actualizado manda data.url apuntando a la PWA con ?openSignal=...&openChart=1.
  // Si no viene url, caemos al scope de la PWA.
  const targetUrl = new URL(data.url || self.registration.scope, self.location.origin).toString();
  const target = new URL(targetUrl);

  event.waitUntil((async () => {
    const allClients = await clients.matchAll({
      type: "window",
      includeUncontrolled: true
    });

    // Primero intenta reutilizar una ventana ya abierta de la PWA.
    for (const client of allClients) {
      try {
        const clientUrl = new URL(client.url);

        const sameOrigin = clientUrl.origin === target.origin;
        const samePath =
          clientUrl.pathname.replace(/\/$/, "") === target.pathname.replace(/\/$/, "") ||
          clientUrl.pathname.endsWith("/index.html");

        if (sameOrigin && samePath) {
          await client.focus();

          // Si la PWA ya está abierta, le mandamos el ID de la señal para que abra el modal.
          client.postMessage({
            type: "OPEN_SIGNAL_FROM_NOTIFICATION",
            signalId,
            url: targetUrl
          });

          // Además navegamos con query por si el mensaje no llega en algún Android.
          if ("navigate" in client) {
            try {
              await client.navigate(targetUrl);
            } catch {}
          }

          return;
        }
      } catch {}
    }

    // Si no hay PWA abierta, abre una nueva con los parámetros para abrir la señal.
    await clients.openWindow(targetUrl);
  })());
});