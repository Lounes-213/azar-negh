// Azar Neɣ PWA Service Worker
const CACHE_NAME = "azar-negh-v1";
const STATIC_ASSETS = [
  "/",
  "/manifest.webmanifest",
  "/favicon.svg",
  "/brand/icon.svg",
  "/brand/icon-192.png",
  "/brand/icon-512.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // Skip API routes and non-GET requests so dynamic calls and uploads always go to network
  if (url.pathname.startsWith("/api/") || event.request.method !== "GET") {
    return;
  }

  // Stale-while-revalidate or Network-first with cache fallback
  event.respondWith(
    fetch(event.request)
      .then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200 && networkResponse.type === "basic") {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });
        }
        return networkResponse;
      })
      .catch(() => caches.match(event.request))
  );
});
