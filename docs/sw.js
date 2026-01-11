const CACHE_VERSION = '0.2.0-36';
const CACHE_NAME = `synthigme-cache-v${CACHE_VERSION}`;
const CORE_ASSETS = [
  './',
  './index.html',
  './assets/css/main.css',
  './assets/js/app.js',
  './assets/icons/ui-sprite.svg',
  './assets/panels/panel1_bg.svg',
  './assets/panels/panel2_bg.svg',
  './assets/panels/panel3_bg.svg',
  './assets/panels/panel4_bg.svg',
  './assets/panels/panel5_bg.svg',
  './assets/panels/panel6_bg.svg',
  './manifest.webmanifest',
  './assets/pwa/icons/app-icon-192.png',
  './assets/pwa/icons/app-icon-512.png'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        // Caching individual resiliente: si falla un archivo, los demás se cachean igual
        return Promise.allSettled(
          CORE_ASSETS.map(async url => {
            try {
              const request = new Request(url, { cache: 'reload' });
              const response = await fetch(request);
              if (response.ok) {
                await cache.put(request, response);
              }
            } catch (e) {
              console.warn(`[SW] Failed to cache: ${url}`, e);
            }
          })
        );
      })
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.map(key => {
        if (key === CACHE_NAME) return null;
        return caches.delete(key);
      }))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const { request } = event;
  if (request.method !== 'GET') {
    return;
  }

  event.respondWith(
    caches.match(request, { ignoreVary: true }).then(response => {
      if (response) {
        return response;
      }
      return fetch(request)
        .then(networkResponse => {
          if (request.url.startsWith(self.location.origin)) {
            const clone = networkResponse.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(request, clone)).catch(() => {});
          }
          return networkResponse;
        })
        .catch(() => caches.match('./index.html'));
    })
  );
});

self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
