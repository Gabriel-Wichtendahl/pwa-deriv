// sw.js — v6.2.2
// - Network-first: index.html, app.js, style.css, manifest.json
// - Cache-first: resto de assets
// - Bump cache para forzar update

const CACHE = "deriv-assets-v6-2-2";

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
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.map(k => (k !== CACHE ? caches.delete(k) : null)));
    await self.clients.claim();
  })());
});

async function networkFirst(request) {
  try {
    const fresh = await fetch(request);
    const cache = await caches.open(CACHE);
    cache.put(request, fresh.clone());
    return fresh;
  } catch {
    const cached = await caches.match(request);
    return cached || Response.error();
  }
}

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  const fresh = await fetch(request);
  const cache = await caches.open(CACHE);
  cache.put(request, fresh.clone());
  return fresh;
}

self.addEventListener("fetch", (e) => {
  const req = e.request;
  const url = new URL(req.url);

  if (url.origin !== self.location.origin) return;

  const isHTML =
    req.mode === "navigate" ||
    url.pathname.endsWith("/index.html") ||
    (url.pathname.endsWith("/") && !url.pathname.includes("."));

  const isJS = url.pathname.endsWith("/app.js");
  const isCSS = url.pathname.endsWith("/style.css");
  const isManifest = url.pathname.endsWith("/manifest.json");

  // ✅ SIEMPRE lo último para HTML/JS/CSS/manifest
  if (isHTML || isJS || isCSS || isManifest) {
    e.respondWith(networkFirst(req));
    return;
  }

  e.respondWith(cacheFirst(req));
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