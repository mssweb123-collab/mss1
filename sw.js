const CACHE_NAME = 'mss-app-ui-v5';

const UI_ASSETS = [
  './',
  './index.html',
  './css/style.css',
  './js/app.js',
  './js/config.js',
  './js/supabase.js',
  './js/admin-ai.js',
  './pages/admin-login.html',
  './pages/admin-dashboard.html',
  './pages/student-portal.html',
  './pages/teacher-portal.html',
  './pages/bus-attendance.html',
  './assets/logo.png',
  './assets/favicon-96x96.png',
  './assets/favicon.svg',
  './assets/favicon.ico',
  './assets/apple-touch-icon.png',
  './assets/web-app-manifest-192x192.png',
  './assets/web-app-manifest-512x512.png',
  './manifest.json',
  'https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.3/font/bootstrap-icons.min.css',
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2'
];

// Install Service Worker and pre-cache UI shell assets for instant load
self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      console.log('[SW] Pre-caching app UI shell for instant offline/app launch');
      return cache.addAll(UI_ASSETS).catch(err => {
        console.warn('[SW] Pre-cache non-fatal warning:', err);
      });
    })
  );
});

// Activate SW and clean up older UI cache versions
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => {
      return Promise.all(
        keys.map(key => {
          if (key !== CACHE_NAME) {
            console.log('[SW] Deleting old cache:', key);
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch event handling:
// - UI Shell Assets (HTML/CSS/JS/Fonts): Cache-First / Stale-While-Revalidate (0ms Instant Load)
// - API & Dynamic Database Requests (Supabase): Network-First (Only fetch real-time data)
self.addEventListener('fetch', event => {
  const req = event.request;
  const url = new URL(req.url);

  // Skip non-GET or chrome-extension / non-http requests
  if (req.method !== 'GET' || !req.url.startsWith('http')) return;

  // Bypassing cache for live API database calls (Supabase API)
  if (url.hostname.includes('supabase.co') || url.pathname.includes('/rest/v1/')) {
    event.respondWith(
      fetch(req).catch(() => caches.match(req))
    );
    return;
  }

  // Stale-While-Revalidate Strategy for UI shell & static assets (Instant 0ms App Launch)
  event.respondWith(
    caches.match(req).then(cachedResponse => {
      const fetchPromise = fetch(req).then(networkResponse => {
        if (networkResponse && networkResponse.status === 200) {
          const cacheCopy = networkResponse.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(req, cacheCopy));
        }
        return networkResponse;
      }).catch(err => {
        console.log('[SW] Network fetch failed, relying on cache:', req.url);
      });

      // Return cached UI asset instantly if available, else wait for network
      return cachedResponse || fetchPromise;
    })
  );
});
