const CACHE_NAME = 'ml-reembolsos-v17';

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((k) => k !== CACHE_NAME).map((k) => {
          console.log('[SW] Removendo cache legado:', k);
          return caches.delete(k);
        })
      ))
      .then(() => self.clients.claim())
  );
});

// ── Web Push Notifications ──────────────────────────────────────────────────
self.addEventListener('push', (event) => {
  let data = {};
  if (event.data) {
    try {
      data = event.data.json();
    } catch (e) {
      data = { title: 'Moura Leite — Reembolsos', body: event.data.text() };
    }
  }

  const title = data.title || 'Moura Leite — Reembolsos';
  const options = {
    body: data.body || '',
    icon: data.icon || '/static/icons/icon-192.png',
    badge: data.badge || '/static/icons/logo-icon.png',
    data: data.data || { url: '/' },
    vibrate: [100, 50, 100],
    tag: data.tag || 'ml-notification',
    renotify: true
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url) || '/';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      for (let client of windowClients) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          if ('navigate' in client && targetUrl !== '/') {
            client.navigate(targetUrl);
          }
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    })
  );
});

// ── Fetch Handler ────────────────────────────────────────────────────────────
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // 1. NetworkOnly estrito para autenticação, APIs, uploads, exports e redirecionamentos OAuth
  if (
    url.pathname.startsWith('/api/') ||
    url.pathname.startsWith('/auth/') ||
    url.pathname.includes('/azure/') ||
    url.searchParams.has('code') ||
    url.searchParams.has('state') ||
    url.searchParams.has('error') ||
    url.searchParams.has('token') ||
    url.hash.includes('token=') ||
    url.hash.includes('access_token=') ||
    url.pathname.startsWith('/uploads/') ||
    url.pathname.startsWith('/exports/')
  ) {
    return; // Passa direto para a rede sem interferência do Service Worker
  }

  // 2. NetworkFirst para navegação HTML (/ e /login)
  const isHtmlNavigation =
    req.mode === 'navigate' ||
    req.headers.get('accept')?.includes('text/html') ||
    url.pathname === '/' ||
    url.pathname === '/login';

  if (isHtmlNavigation) {
    event.respondWith(
      fetch(req)
        .then((networkRes) => {
          if (networkRes && networkRes.status === 200) {
            const clone = networkRes.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(req, clone)).catch(() => {});
          }
          return networkRes;
        })
        .catch(() => {
          return caches.match(req).then((cached) => {
            if (cached) return cached;
            return caches.match('/') || caches.match('/index.html');
          });
        })
    );
    return;
  }

  // 3. Stale-While-Revalidate para recursos estáticos locais (CSS, JS, imagens, ícones)
  event.respondWith(
    caches.match(req).then((cached) => {
      const fetchPromise = fetch(req)
        .then((networkRes) => {
          if (networkRes && networkRes.status === 200 && networkRes.type === 'basic') {
            const clone = networkRes.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(req, clone)).catch(() => {});
          }
          return networkRes;
        })
        .catch(() => cached);

      return cached || fetchPromise;
    })
  );
});
