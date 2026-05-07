// Power Works - Service Worker
// Handles push notifications AND full offline caching

const CACHE_NAME = 'powerworks-v2';
const DB_NAME = 'powerworks-offline';
const DB_VERSION = 1;

// App shell files to cache for offline use
const APP_SHELL = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/icon-192.png',
  '/icon-512.png',
  '/service-worker.js',
];

// ─── Install: cache app shell ─────────────────────────────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(APP_SHELL).catch(err => {
        console.log('Cache addAll error (non-fatal):', err);
      });
    }).then(() => self.skipWaiting())
  );
});

// ─── Activate: clean old caches ───────────────────────────────────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => clients.claim())
  );
});

// ─── Fetch: serve from cache, fallback to network ─────────────────────────────
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Don't cache Supabase API calls or external services
  if (
    url.hostname.includes('supabase.co') ||
    url.hostname.includes('supabase.in') ||
    url.pathname.includes('/rest/v1/') ||
    url.pathname.includes('/auth/v1/') ||
    url.pathname.includes('/storage/v1/') ||
    url.pathname.includes('/functions/v1/') ||
    event.request.method !== 'GET'
  ) {
    return; // Let these go to network normally
  }

  // For navigation requests (opening the app) - serve index.html from cache
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).catch(() =>
        caches.match('/index.html').then(r => r || caches.match('/'))
      )
    );
    return;
  }

  // For JS/CSS/assets - cache first, fallback to network
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;
      return fetch(event.request).then(response => {
        // Cache successful responses for app assets
        if (response.ok && (
          url.pathname.endsWith('.js') ||
          url.pathname.endsWith('.css') ||
          url.pathname.endsWith('.png') ||
          url.pathname.endsWith('.jpg') ||
          url.pathname.endsWith('.svg') ||
          url.pathname.endsWith('.woff2')
        )) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        }
        return response;
      }).catch(() => cached || new Response('Offline', { status: 503 }));
    })
  );
});

// ─── Push notifications ───────────────────────────────────────────────────────
self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (e) {
    data = { title: 'Power Works', body: event.data ? event.data.text() : 'New reminder' };
  }

  const title = data.title || 'Power Works';
  const options = {
    body: data.body || '',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    tag: data.tag || 'powerworks-notification',
    data: { url: data.url || '/' },
    requireInteraction: true,
    actions: [
      { action: 'open', title: 'Open App' },
      { action: 'dismiss', title: 'Dismiss' }
    ]
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

// ─── Notification click ───────────────────────────────────────────────────────
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  if (event.action === 'dismiss') return;
  const urlToOpen = event.notification.data?.url || '/';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      for (const client of windowClients) {
        if (client.url.includes(self.location.origin) && 'focus' in client) return client.focus();
      }
      if (clients.openWindow) return clients.openWindow(urlToOpen);
    })
  );
});

// ─── Background sync ──────────────────────────────────────────────────────────
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-offline-data') {
    event.waitUntil(
      self.clients.matchAll().then(clients => {
        clients.forEach(client => client.postMessage({ type: 'SYNC_REQUESTED' }));
      })
    );
  }
});
