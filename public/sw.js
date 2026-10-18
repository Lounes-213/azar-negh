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

  // Cached product and avatar images from R2
  const isImageApi = url.pathname.startsWith("/api/images/");

  // Dynamic API calls (except immutable images) and non-GET requests always go to network
  if ((url.pathname.startsWith("/api/") && !isImageApi) || event.request.method !== "GET") {
    return;
  }

  // Cache-first for images to drastically cut R2 calls & cellular data usage
  if (isImageApi) {
    event.respondWith(
      caches.match(event.request).then((cached) => {
        if (cached) return cached;
        return fetch(event.request).then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const clone = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return networkResponse;
        });
      })
    );
    return;
  }

  // Stale-while-revalidate for static shell assets
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

// Background Push Notifications (receives alerts even when phone screen is locked or browser is closed)
self.addEventListener("push", (event) => {
  let promise;
  if (event.data) {
    try {
      const data = event.data.json();
      promise = self.registration.showNotification(data.title || "Azar Neɣ — آزار نغ", {
        body: data.body || "لديك إشعار جديد في منصة آزار نغ",
        icon: "/brand/icon-192.png",
        badge: "/brand/icon-192.png",
        data: { url: data.url || "/compte/notifications" },
        vibrate: [200, 100, 200],
      });
    } catch {
      promise = self.registration.showNotification("Azar Neɣ — آزار نغ", {
        body: event.data.text() || "لديك إشعار جديد في منصة آزار نغ",
        icon: "/brand/icon-192.png",
        badge: "/brand/icon-192.png",
        data: { url: "/compte/notifications" },
        vibrate: [200, 100, 200],
      });
    }
  } else {
    // If push ping, fetch the latest user notification from the server
    promise = fetch("/api/notifications?perPage=1")
      .then((res) => res.json())
      .then((data) => {
        const latest = data?.notifications?.items?.[0];
        const title = latest?.title || "Azar Neɣ — آزار نغ";
        const body = latest?.body || "لديك إشعار وتحديث جديد على المنصة";
        const url = latest?.link || "/compte/notifications";
        return self.registration.showNotification(title, {
          body,
          icon: "/brand/icon-192.png",
          badge: "/brand/icon-192.png",
          data: { url },
          vibrate: [200, 100, 200],
        });
      })
      .catch(() => {
        return self.registration.showNotification("Azar Neɣ — آزار نغ", {
          body: "لديك إشعار وتحديث جديد على المنصة",
          icon: "/brand/icon-192.png",
          badge: "/brand/icon-192.png",
          data: { url: "/compte/notifications" },
          vibrate: [200, 100, 200],
        });
      });
  }
  event.waitUntil(promise);
});

// Click handler: opens or focuses the app when the user taps on the phone notification
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const urlToOpen = event.notification.data?.url || "/compte/notifications";
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((windowClients) => {
      for (const client of windowClients) {
        if (client.url.includes(urlToOpen) && "focus" in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(urlToOpen);
      }
    })
  );
});

