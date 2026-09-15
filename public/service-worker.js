// ─── PowerMate Service Worker ─────────────────────────────────────────────────
// Handles: offline page caching, push notifications, background sync.
// ─────────────────────────────────────────────────────────────────────────────
const CACHE_NAME = "powermate-v4";
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

// ─── Durable scheduled reminders ──────────────────────────────────────────────
// setTimeout in a service worker is unreliable: the SW is killed after ~30s of
// inactivity, wiping any pending timers, so a reminder scheduled for hours later
// never fires. Instead we PERSIST reminders in IndexedDB and CHECK for due ones
// every time the SW wakes (message, sync, push, or periodic sync). The app also
// pokes the SW on open/focus. This makes reminders survive SW restarts.

const REMINDER_DB = "pm-reminders";
const REMINDER_STORE = "scheduled";

function reminderDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(REMINDER_DB, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(REMINDER_STORE)) {
        db.createObjectStore(REMINDER_STORE, { keyPath: "id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function putReminders(items) {
  const db = await reminderDB();
  return new Promise((resolve) => {
    const tx = db.transaction(REMINDER_STORE, "readwrite");
    const store = tx.objectStore(REMINDER_STORE);
    items.forEach(it => { if (it && it.id) store.put(it); });
    tx.oncomplete = () => resolve();
    tx.onerror = () => resolve();
  });
}

async function getAllReminders() {
  const db = await reminderDB();
  return new Promise((resolve) => {
    const tx = db.transaction(REMINDER_STORE, "readonly");
    const req = tx.objectStore(REMINDER_STORE).getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => resolve([]);
  });
}

async function deleteReminder(id) {
  const db = await reminderDB();
  return new Promise((resolve) => {
    const tx = db.transaction(REMINDER_STORE, "readwrite");
    tx.objectStore(REMINDER_STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => resolve();
  });
}

// Fire any reminders whose time has arrived; drop stale ones. Called on wake.
async function checkDueReminders() {
  const now = Date.now();
  const items = await getAllReminders();
  for (const item of items) {
    const fireAt = new Date(item.fireAt).getTime();
    if (isNaN(fireAt)) { await deleteReminder(item.id); continue; }
    // Fire if due; also fire if we missed it by up to 6h (SW was asleep). Drop if older.
    if (fireAt <= now && (now - fireAt) < 6 * 60 * 60 * 1000) {
      await self.registration.showNotification(item.title || "PowerMate Reminder", {
        body: item.body || "",
        icon: "/icons/icon-192.png",
        badge: "/icons/icon-192.png",
        vibrate: [100, 50, 100],
        tag: item.id,
        data: { url: item.url || "/" },
      });
      await deleteReminder(item.id);
    } else if (fireAt <= now) {
      // Missed by more than 6h — too stale to be useful; discard.
      await deleteReminder(item.id);
    }
  }
}

// ── Message handler: receive the schedule from the app + poke to check ────────
self.addEventListener("message", (e) => {
  if (e.data?.type === "SCHEDULE_NOTIFICATIONS") {
    const items = (e.data.items || []).filter(it => it && it.id && it.fireAt);
    // Replace the stored schedule with the app's current one, then check now.
    e.waitUntil((async () => {
      // Clear existing then store the fresh set (keeps SW in sync with the app).
      const existing = await getAllReminders();
      const db = await reminderDB();
      await new Promise(res => {
        const tx = db.transaction(REMINDER_STORE, "readwrite");
        tx.objectStore(REMINDER_STORE).clear();
        tx.oncomplete = res; tx.onerror = res;
      });
      await putReminders(items);
      await checkDueReminders();
    })());
  }
  if (e.data?.type === "CHECK_REMINDERS") {
    e.waitUntil(checkDueReminders());
  }
  if (e.data?.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

// Check due reminders whenever the SW wakes for a sync or periodic sync.
self.addEventListener("sync", (e) => {
  if (e.tag === "pm-reminder-check" || e.tag === "pm-sync") {
    e.waitUntil(checkDueReminders());
  }
});
self.addEventListener("periodicsync", (e) => {
  if (e.tag === "pm-reminder-check") {
    e.waitUntil(checkDueReminders());
  }
});
