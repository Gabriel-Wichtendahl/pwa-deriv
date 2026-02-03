const CACHE = "deriv-assets-v1";

const ASSETS = [
  "./",
  "./index.html",
  "./app.js",
  "./style.css",
  "./manifest.json",
  "./icon-192.png",
  "./icon-512.png",
  "./alert.mp3"
];

/* =========================
   Install
========================= */
self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

/* =========================
   Activate
========================= */
self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.map((k) => (k !== CACHE ? caches.delete(k) : null)))
    )
  );
  self.clients.claim();
});

/* =========================
   Fetch
   - HTML/JS: network-first (si falla, cache)
   - Assets: cache-first
========================= */
self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);

  const isHTML =
    e.request.mode === "navigate" ||
    url.pathname.endsWith("/index.html") ||
    url.pathname.endsWith("/");

  const isJS = url.pathname.endsWith("/app.js");

  // ✅ Siempre traer lo último del servidor para navegación y app.js
  if (isHTML || isJS) {
    e.respondWith(
      fetch(e.request)
        .then((res) => {
          // refrescar cache en background para evitar versiones viejas
          const copy = res.clone();
          caches.open(CACHE).then((cache) => cache.put(e.request, copy));
          return res;
        })
        .catch(() => caches.match(e.request))
    );
    return;
  }

  // ✅ Assets: cache-first
  e.respondWith(
    caches.match(e.request).then((r) => r || fetch(e.request))
  );
});

/* =========================
   ✅ Click en notificación
   Abre Deriv Trader con el símbolo exacto
   (demo + rise/fall ya vienen en el URL que mandamos desde app.js)
========================= */
self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const url = event.notification?.data?.url || "https://app.deriv.com/dtrader";

  event.waitUntil((async () => {
    const allClients = await clients.matchAll({
      type: "window",
      includeUncontrolled: true
    });

    // ✅ Si ya hay una pestaña de Deriv abierta, enfocarla y navegar ahí
    for (const client of allClients) {
      if (client.url && client.url.includes("app.deriv.com")) {
        await client.focus();
        if ("navigate" in client) await client.navigate(url);
        return;
      }
    }

    // ✅ Si no hay ninguna, abrir nueva
    await clients.openWindow(url);
  })());
});
