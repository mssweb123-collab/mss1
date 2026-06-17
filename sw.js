const CACHE_NAME = 'mss-pwa-cache-v1';
const urlsToCache = [
  './',
  './index.html',
  './css/style.css',
  './js/app.js',
  './assets/logo.png',
  './assets/favicon-96x96.png',
  './assets/favicon.svg',
  './assets/favicon.ico',
  './assets/apple-touch-icon.png',
  './assets/web-app-manifest-192x192.png',
  './assets/web-app-manifest-512x512.png',
  './manifest.json'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(urlsToCache))
  );
});

self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        return response || fetch(event.request).catch(() => {
          // Fallback logic if needed
        });
      })
  );
});
