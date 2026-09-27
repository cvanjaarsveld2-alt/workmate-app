// ─── PowerMate Service Worker ────────────────────────────────────────────────
// Offline shell, push notifications and durable reminder scheduling.
const CACHE_NAME = "powermate-v17";
const PRECACHE = ["/", "/index.html", "/icon.svg", "/manifest.webmanifest", "/icons/icon-192.png", "/icons/icon-512.png"];
// Filled in at build time (vite.config.js) with every built JS/CSS/image file,
// so every screen opens offline, not just the ones visited while online.
const BUILD_ASSETS = [];
const REMINDER_DB = "powermate_sw";
const REMINDER_STORE = "reminders";

function openReminderDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(REMINDER_DB, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(REMINDER_STORE))
        db.createObjectStore(REMINDER_STORE, { keyPath: "id" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
// replace+source rebuilds only that source's reminders (e.g. the follow-up digest),
// so calendar and note reminders scheduled elsewhere survive the refresh.
async function putReminders(items, replace = false, source = null) {
  const db = await openReminderDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(REMINDER_STORE, "readwrite"),
      store = tx.objectStore(REMINDER_STORE);
    const write = () => {
      for (const item of items) {
        if (!item?.id || !item?.fireAt) continue;
        const t = new Date(item.fireAt).getTime();
        if (Number.isFinite(t))
          store.put({ ...item, ...(source ? { source } : {}), fireAt: new Date(t).toISOString() });
      }
    };
    if (replace && source) {
      const req = store.getAll();
      req.onsuccess = () => {
        for (const r of req.result || []) if (r.source === source) store.delete(r.id);
        write();
      };
    } else {
      if (replace) store.clear();
      write();
    }
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}
async function deleteReminder(id) {
  const db = await openReminderDB();
  return new Promise(resolve => {
    const tx = db.transaction(REMINDER_STORE, "readwrite");
    tx.objectStore(REMINDER_STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => resolve();
  });
}
async function dueReminders() {
  const db = await openReminderDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(REMINDER_STORE, "readonly"),
      req = tx.objectStore(REMINDER_STORE).getAll();
    req.onsuccess = () => resolve((req.result || []).filter(r => new Date(r.fireAt).getTime() <= Date.now()));
    req.onerror = () => reject(req.error);
  });
}
async function fireDueReminders() {
  const due = await dueReminders();
  for (const item of due) {
    await self.registration.showNotification(item.title || "PowerMate Reminder", {
      body: item.body || "",
      icon: "/icon.svg",
      badge: "/icon.svg",
      vibrate: [100, 50, 100],
      tag: item.tag || item.id,
      data: { url: item.url || "/" },
    });
    await deleteReminder(item.id);
  }
}
self.addEventListener("install", e =>
  e.waitUntil(
    caches
      .open(CACHE_NAME)
      .then(async cache => {
        for (const url of PRECACHE) {
          try {
            await cache.add(url);
          } catch {}
        }
        // A few at a time; one failed file must not abort the install.
        const queue = BUILD_ASSETS.slice();
        const worker = async () => {
          while (queue.length) {
            const url = queue.shift();
            try {
              if (!(await cache.match(url, { ignoreVary: true }))) await cache.add(url);
            } catch {}
          }
        };
        await Promise.all([worker(), worker(), worker(), worker()]);
      })
      .then(() => self.skipWaiting()),
  ),
);
self.addEventListener("activate", e =>
  e.waitUntil(
    Promise.all([
      caches.keys().then(async keys => {
        const old = keys.filter(k => k.startsWith("powermate-") && k !== CACHE_NAME).sort();
        while (old.length > 1) {
          const k = old.shift();
          await caches.delete(k);
        }
      }),
      fireDueReminders().catch(() => {}),
    ]).then(() => self.clients.claim()),
  ),
);

// Built files under /assets/ have content hashes in their names and never
// change, so they are served from cache first: no network wait on a weak
// signal, and they keep working offline.
// ignoreVary: module scripts are requested with an Origin header, and a server
// that answers with "Vary: Origin" would otherwise never match the copy cached
// at install (no Origin), leaving every lazy screen unavailable offline.
async function immutableAsset(request) {
  const cached = await caches.match(request, { ignoreVary: true });
  if (cached) return cached;
  const res = await fetch(request);
  if (res.ok) {
    const clone = res.clone();
    caches
      .open(CACHE_NAME)
      .then(c => c.put(request, clone))
      .catch(() => {});
  }
  return res;
}
// Network-first for other static files (icons etc.), with the cache as the
// offline fallback. A successful network response refreshes the cache.
async function cachedAsset(request) {
  const cached = await caches.match(request, { ignoreVary: true });
  try {
    const res = await fetch(request);
    if (res.ok) {
      const clone = res.clone();
      caches
        .open(CACHE_NAME)
        .then(c => c.put(request, clone))
        .catch(() => {});
    }
    return res;
  } catch {
    return cached || Response.error();
  }
}
self.addEventListener("fetch", e => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.hostname.includes("supabase")) return;
  if (e.request.mode === "navigate") {
    e.respondWith(
      fetch(e.request)
        .then(res => {
          if (res.ok) {
            const clone = res.clone();
            caches
              .open(CACHE_NAME)
              .then(c => c.put(e.request, clone))
              .catch(() => {});
          }
          return res;
        })
        .catch(() =>
          caches
            .match(e.request)
            .then(r => r || caches.match("/"))
            .catch(() => Response.error()),
        ),
    );
    return;
  }
  if (url.origin === self.location.origin && url.pathname.startsWith("/assets/"))
    e.respondWith(immutableAsset(e.request));
  else if (/\.(js|css)$/i.test(url.pathname) || /\.(png|jpg|jpeg|svg|ico|woff2?)$/i.test(url.pathname))
    e.respondWith(cachedAsset(e.request));
});
self.addEventListener("sync", e => {
  if (e.tag === "powermate-sync")
    e.waitUntil(
      self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(clients => {
        clients.forEach(client => client.postMessage({ type: "POWERMATE_RETRY_SYNC" }));
        return fireDueReminders().catch(() => {});
      }),
    );
});
self.addEventListener("periodicsync", e => {
  if (e.tag === "powermate-reminders") e.waitUntil(fireDueReminders().catch(() => {}));
});
self.addEventListener("push", e => {
  let data = { title: "PowerMate", body: "You have a notification", url: "/" };
  try {
    if (e.data) data = { ...data, ...e.data.json() };
  } catch {}
  e.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: "/icon.svg",
      badge: "/icon.svg",
      vibrate: [100, 50, 100],
      tag: data.tag || "powermate",
      renotify: !!data.tag,
      data: { url: data.url || "/" },
      actions: [{ action: "open", title: "Open PowerMate" }],
    }),
  );
});
// Only ever open pages inside PowerMate: a push payload's url comes from another
// user, so an off-site link could be used to send a teammate to a phishing page.
function safeNotificationUrl(raw) {
  try {
    const u = new URL(raw || "/", self.location.origin);
    return u.origin === self.location.origin ? u.href : "/";
  } catch {
    return "/";
  }
}
self.addEventListener("notificationclick", e => {
  e.notification.close();
  const url = safeNotificationUrl(e.notification.data?.url);
  e.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(clients => {
      for (const client of clients)
        if (client.url.includes(self.location.origin) && "focus" in client)
          return client.focus().then(() => client.navigate(url));
      return self.clients.openWindow(url);
    }),
  );
});
self.addEventListener("message", e => {
  if (e.data?.type === "SKIP_WAITING") {
    e.waitUntil(Promise.resolve(self.skipWaiting()));
    return;
  }
  if (e.data?.type === "SCHEDULE_NOTIFICATIONS")
    e.waitUntil?.(
      putReminders(e.data.items || [], e.data.replace === true, e.data.source || null)
        .then(() => fireDueReminders())
        .catch(() => {}),
    );
  if (e.data?.type === "CANCEL_NOTIFICATION") e.waitUntil?.(deleteReminder(e.data.id));
  if (e.data?.type === "FIRE_DUE_REMINDERS") e.waitUntil?.(fireDueReminders().catch(() => {}));
});
