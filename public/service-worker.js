const CACHE = 'faa-det-gjort-v12';
const BASE = new URL('./', self.registration.scope).pathname;
const asset = (path) => `${BASE}${path}`;
const CORE = [
  BASE,
  asset('index.html'),
  asset('assets/app-v12.js'),
  asset('assets/index-v12.css'),
  asset('assets/Workspace-v12.js'),
  asset('assets/vendor-icons-v12.js'),
  asset('assets/vendor-react-v12.js'),
  asset('assets/vendor-storage-v12.js'),
  asset('manifest.webmanifest'),
  asset('favicon.svg'),
  asset('pwa-icon.svg'),
  asset('jm-microapps-logo.png'),
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      const page = await fetch(asset('index.html'));
      const html = await page.clone().text();
      const assets = [...html.matchAll(/(?:src|href)="([^"#]+)"/g)]
        .map((match) => match[1])
        .map((path) => new URL(path, self.registration.scope).pathname)
        .filter((path) => path.startsWith(BASE));
      await cache.put(asset('index.html'), page);
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
        .catch(async () => (await caches.match(asset('index.html'))) || Response.error()),
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
      return existing ? existing.focus() : self.clients.openWindow(BASE);
    }),
  );
});
