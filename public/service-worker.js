const CACHE = 'faa-det-gjort-v10';
const CORE = [
  '/',
  '/index.html',
  '/assets/app.js',
  '/assets/index.css',
  '/assets/Workspace.js',
  '/assets/vendor-icons.js',
  '/assets/vendor-react.js',
  '/assets/vendor-storage.js',
  '/assets/vendor-supabase.js',
  '/manifest.webmanifest',
  '/favicon.svg',
  '/pwa-icon.svg',
  '/jm-microapps-logo.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      const page = await fetch('/index.html');
      const html = await page.clone().text();
      const assets = [...html.matchAll(/(?:src|href)="([^"#]+)"/g)]
        .map((match) => match[1])
        .filter((path) => path.startsWith('/'));
      await cache.put('/index.html', page);
      await cache.addAll([...new Set([...CORE, ...assets])]);
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok)
            caches.open(CACHE).then((cache) => cache.put('/index.html', response.clone()));
          return response;
        })
        .catch(async () => (await caches.match('/index.html')) || Response.error()),
    );
    return;
  }
  event.respondWith(
    caches.match(url.pathname).then((cached) => {
      if (cached) return cached;
      return fetch(request).then((response) => {
        if (response.ok) caches.open(CACHE).then((cache) => cache.put(request, response.clone()));
        return response;
      });
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      const existing = clients.find(
        (client) => new URL(client.url).origin === self.location.origin,
      );
      return existing ? existing.focus() : self.clients.openWindow('/');
    }),
  );
});
