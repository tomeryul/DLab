// FlyLab Pro — Service Worker
// Strategy: cache the app shell for instant load + offline UI.
// NEVER cache Firebase / Google APIs — those must always hit the network for live data.

const CACHE = 'flylab-shell-v5';
const SHELL = [
  './index.html',
  './styles.css',
  './app.js',
  './shell.js',
  './sw-register.js',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './icon-maskable.png',
  './apple-touch-icon.png'
];

// Install: pre-cache the app shell
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())
  );
});

// Activate: clean up old caches
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// Hosts that must ALWAYS go to the network (live data, auth, etc.)
const NETWORK_ONLY = [
  'firestore.googleapis.com',
  'firebase',
  'googleapis.com',
  'gstatic.com/firebasejs',
  'identitytoolkit',
  'firebaseio.com'
];

self.addEventListener('fetch', (e) => {
  const url = e.request.url;

  // Only handle GET; let everything else (POST to Firebase, etc.) pass through untouched
  if (e.request.method !== 'GET') return;

  // Never intercept Firebase/Google API traffic
  if (NETWORK_ONLY.some((h) => url.includes(h))) return;

  // App shell + static assets: cache-first, fall back to network, update cache in background
  e.respondWith(
    caches.match(e.request).then((cached) => {
      const fetchPromise = fetch(e.request).then((res) => {
        // Cache successful same-origin and font/cdn responses
        if (res && res.status === 200 && (e.request.url.startsWith(self.location.origin) || url.includes('fonts.') || url.includes('cdnjs'))) {
          const clone = res.clone();
          caches.open(CACHE).then((c) => c.put(e.request, clone));
        }
        return res;
      }).catch(() => cached);
      return cached || fetchPromise;
    })
  );
});
