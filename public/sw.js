// Minimal service worker that caches the app shell (safe, simple)
const CACHE = 'bus-buddy-v1';
const ASSETS = [
  '/',
  '/index.html'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(clients.claim());
});

self.addEventListener('fetch', (event) => {
  // network-first for API calls, cache-first for navigation/assets
  const url = new URL(event.request.url);
  if (url.pathname.startsWith('/auth') || url.pathname.startsWith('/routes')) {
    return event.respondWith(fetch(event.request).catch(() => caches.match(event.request)));
  }

  event.respondWith(
    caches.match(event.request).then((r) => r || fetch(event.request))
  );
});
