// PowerMate Service Worker v2.1
const CACHE_NAME = "powermate-v2";
const STATIC_ASSETS = ["/", "/index.html", "/index.css"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((c) => c.addAll(STATIC_ASSETS)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))));
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  event.respondWith(
    fetch(event.request).then((res) => {
      const clone = res.clone();
      caches.open(CACHE_NAME).then((c) => c.put(event.request, clone));
      return res;
    }).catch(() => caches.match(event.request))
  );
});

self.addEventListener("push", (event) => {
  let p = { title: "PowerMate", body: "You have a reminder.", tag: "general" };
  try { p = event.data.json(); } catch (_) {}
  event.waitUntil(
    self.registration.showNotification(p.title, {
      body: p.body, tag: p.tag || "powermate",
      icon: "/icon-192.png", badge: "/icon-192.png",
      vibrate: [200, 100, 200],
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((ws) => {
      const ex = ws.find((c) => c.url.includes(self.location.origin));
      if (ex) return ex.focus();
      return clients.openWindow("/");
    })
  );
});

const scheduledTimers = new Map();

self.addEventListener("message", (event) => {
  if (event.data?.type === "SCHEDULE_NOTIFICATIONS") {
    scheduleLocalNotifications(event.data.items || []);
  }
});

function scheduleLocalNotifications(items) {
  scheduledTimers.forEach((t) => clearTimeout(t));
  scheduledTimers.clear();
  const now = Date.now();
  items.forEach((item) => {
    const delay = new Date(item.fireAt).getTime() - now;
    if (delay <= 0 || delay > 86400000) return;
    const timer = setTimeout(() => {
      self.registration.showNotification(item.title, {
        body: item.body, tag: item.tag || item.id,
        icon: "/icon-192.png", badge: "/icon-192.png",
        vibrate: [200, 100, 200],
      });
      scheduledTimers.delete(item.id);
    }, delay);
    scheduledTimers.set(item.id, timer);
  });
  console.log("[PowerMate SW] Scheduled", scheduledTimers.size, "notification(s)");
}
