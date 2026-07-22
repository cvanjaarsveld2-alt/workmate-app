// ─── PowerMate Service Worker ─────────────────────────────────────────────────
// Handles: offline page caching, push notifications, background sync.
// ─────────────────────────────────────────────────────────────────────────────
const CACHE_NAME = "powermate-v2";
const PRECACHE = [
  "/",
  "/index.html",
  "/icons/icon-192.png",
];

// ── Install: precache shell (graceful — missing files don't break install) ──
self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      for (const url of PRECACHE) {
        try { await cache.add(url); } catch { console.warn("[SW] Precache skip:", url); }
      }
    }).then(() => self.skipWaiting())
  );
});

// ── Activate: clean old caches ────────────────────────────────────────────────
self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// ── Fetch: network-first for API, cache-first for assets ──────────────────────
self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);

  // Skip non-GET and Supabase API calls
  if (e.request.method !== "GET") return;
  if (url.hostname.includes("supabase")) return;

  // For navigation requests (HTML pages): network first, fallback to cache
  if (e.request.mode === "navigate") {
    e.respondWith(
      fetch(e.request)
        .then(res => {
          const clone = res.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(e.request, clone));
          return res;
        })
        .catch(() => caches.match(e.request).then(r => r || caches.match("/")))
    );
    return;
  }

  // For assets (JS, CSS, images): cache first, fallback to network
  if (url.pathname.match(/\.(js|css|png|jpg|jpeg|svg|ico|woff2?)$/)) {
    e.respondWith(
      caches.match(e.request).then(cached => {
        if (cached) return cached;
        return fetch(e.request).then(res => {
          if (res.ok) {
            const clone = res.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(e.request, clone));
          }
          return res;
        });
      })
    );
    return;
  }
});

// ── Push notifications ────────────────────────────────────────────────────────
self.addEventListener("push", (e) => {
  let data = { title: "PowerMate", body: "You have a notification", url: "/" };
  try {
    if (e.data) data = { ...data, ...e.data.json() };
  } catch {}

  e.waitUntil(
    self.registration.showNotification(data.title, {
      body:      data.body,
      icon:      "/icons/icon-192.png",
      badge:     "/icons/icon-192.png",
      vibrate:   [100, 50, 100],
      tag:       data.tag || "powermate",   // replaces existing notification with same tag
      renotify:  !!data.tag,               // vibrate again even if replacing
      data:      { url: data.url || "/" },
      actions:   [{ action: "open", title: "Open PowerMate" }],
    })
  );
});

// ── Notification click ────────────────────────────────────────────────────────
self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const url = e.notification.data?.url || "/";
  e.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(clients => {
      // Focus existing window if available
      for (const client of clients) {
        if (client.url.includes(self.location.origin) && "focus" in client) {
          client.focus();
          client.navigate(url);
          return;
        }
      }
      // Otherwise open new window
      return self.clients.openWindow(url);
    })
  );
});

// ── Scheduled notifications (from the app via postMessage) ────────────────────
self.addEventListener("message", (e) => {
  if (e.data?.type === "SCHEDULE_NOTIFICATIONS") {
    const items = e.data.items || [];
    items.forEach(item => {
      const delay = new Date(item.fireAt).getTime() - Date.now();
      if (delay <= 0) return; // already past
      if (delay > 24 * 60 * 60 * 1000) return; // more than 24h away — skip

      setTimeout(() => {
        self.registration.showNotification(item.title || "PowerMate Reminder", {
          body: item.body || "",
          icon: "/logo.png",
          badge: "/logo.png",
          vibrate: [100, 50, 100],
          data: { url: item.url || "/" },
        });
      }, delay);
    });
  }
});
