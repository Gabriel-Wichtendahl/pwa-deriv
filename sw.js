const CACHE = "deriv-assets-v6-1";
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

async function networkFirst(request, fallbackUrl = "./index.html") {
  try {
    const res = await fetch(request);
    const cache = await caches.open(CACHE);
    cache.put(request, res.clone());
    return res;
  } catch {
    const cached = await caches.match(request);
    if (cached) return cached;
    const fallback = await caches.match(fallbackUrl);
    return fallback || new Response("Offline", { status: 503, statusText: "Offline" });
  }
}

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);

  const isHTML =
    e.request.mode === "navigate" ||
    url.pathname.endsWith("/index.html") ||
    url.pathname === "/" ||
    url.pathname.endsWith("/");

  const isAppJs = url.pathname.endsWith("/app.js");

  // ✅ Network-first + fallback a cache para navegación/HTML/JS (evita blanco sin internet)
  if (isHTML) {
    e.respondWith(networkFirst(e.request, "./index.html"));
    return;
  }
  if (isAppJs) {
    e.respondWith(networkFirst(e.request, "./app.js"));
    return;
  }

  // ✅ Cache-first para assets
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