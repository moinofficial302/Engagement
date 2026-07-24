/* ═══════════════════════════════════════════════════
   WEDDING INVITATION — sw.js (Service Worker)
   
   Strategy:
   - Static assets  → Cache First
   - Images         → Cache First  
   - Fonts/CDN      → Stale While Revalidate
   - API calls      → Network First
   - Offline page   → Fallback
═══════════════════════════════════════════════════ */

'use strict';

const CACHE_NAME    = 'wedding-v1.0.0';
const OFFLINE_PAGE  = '/offline.html';

/* ── Files to pre-cache on install ── */
const PRECACHE_ASSETS = [
  '/',
  '/index.html',
  '/css/style.css',
  '/js/app.js',
  '/manifest.json',
  '/offline.html',
  '/lottie/hearts.json',
  '/lottie/rings.json',
  '/lottie/confetti-burst.json'
];

/* ── CDN assets to cache on first use ── */
const CDN_PATTERNS = [
  'fonts.googleapis.com',
  'fonts.gstatic.com',
  'unpkg.com'
];

/* ═══════════════════════════════
   INSTALL — pre-cache core assets
═══════════════════════════════ */
self.addEventListener('install', event => {
  console.log('[SW] Installing...');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('[SW] Pre-caching assets');
        return cache.addAll(PRECACHE_ASSETS);
      })
      .then(() => {
        console.log('[SW] Install complete');
        return self.skipWaiting(); // Activate immediately
      })
      .catch(err => console.warn('[SW] Pre-cache failed:', err))
  );
});

/* ═══════════════════════════════
   ACTIVATE — clean old caches
═══════════════════════════════ */
self.addEventListener('activate', event => {
  console.log('[SW] Activating...');
  event.waitUntil(
    caches.keys().then(keys => {
      return Promise.all(
        keys
          .filter(key => key !== CACHE_NAME)
          .map(key => {
            console.log('[SW] Deleting old cache:', key);
            return caches.delete(key);
          })
      );
    }).then(() => {
      console.log('[SW] Activated — claiming clients');
      return self.clients.claim();
    })
  );
});

/* ═══════════════════════════════
   FETCH — smart caching strategy
═══════════════════════════════ */
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET and chrome-extension requests
  if (request.method !== 'GET') return;
  if (url.protocol === 'chrome-extension:') return;

  // ── CDN / Fonts → Stale While Revalidate ──
  if (CDN_PATTERNS.some(p => url.hostname.includes(p))) {
    event.respondWith(staleWhileRevalidate(request));
    return;
  }

  // ── Images → Cache First ──
  if (request.destination === 'image') {
    event.respondWith(cacheFirst(request));
    return;
  }

  // ── Lottie JSON → Cache First ──
  if (url.pathname.includes('/lottie/')) {
    event.respondWith(cacheFirst(request));
    return;
  }

  // ── HTML pages → Network First with offline fallback ──
  if (request.destination === 'document' || request.headers.get('accept')?.includes('text/html')) {
    event.respondWith(networkFirstWithFallback(request));
    return;
  }

  // ── CSS / JS → Stale While Revalidate ──
  if (request.destination === 'style' || request.destination === 'script') {
    event.respondWith(staleWhileRevalidate(request));
    return;
  }

  // ── Default → Cache First ──
  event.respondWith(cacheFirst(request));
});

/* ═══════════════════════════════
   STRATEGIES
═══════════════════════════════ */

/** Cache First: serve from cache, fetch & cache if miss */
async function cacheFirst(request) {
  try {
    const cached = await caches.match(request);
    if (cached) return cached;

    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    // Return offline page for navigation, empty for assets
    if (request.destination === 'document') {
      return caches.match(OFFLINE_PAGE);
    }
    return new Response('', { status: 503 });
  }
}

/** Stale While Revalidate: serve cache instantly, update in background */
async function staleWhileRevalidate(request) {
  const cache  = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);

  const fetchPromise = fetch(request)
    .then(response => {
      if (response.ok) cache.put(request, response.clone());
      return response;
    })
    .catch(() => cached);

  return cached || fetchPromise;
}

/** Network First: try network, fall back to cache, then offline page */
async function networkFirstWithFallback(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await caches.match(request);
    if (cached) return cached;
    return caches.match(OFFLINE_PAGE);
  }
}

/* ═══════════════════════════════
   BACKGROUND SYNC (future use)
═══════════════════════════════ */
self.addEventListener('sync', event => {
  if (event.tag === 'sync-messages') {
    event.waitUntil(syncMessages());
  }
});

async function syncMessages() {
  // When admin panel is ready — sync offline-queued RSVP messages here
  console.log('[SW] Background sync: messages');
}

/* ═══════════════════════════════
   MESSAGE from main thread
═══════════════════════════════ */
self.addEventListener('message', event => {
  if (event.data?.action === 'skipWaiting') {
    self.skipWaiting();
  }
  if (event.data?.action === 'clearCache') {
    caches.delete(CACHE_NAME).then(() => {
      event.ports[0]?.postMessage({ cleared: true });
    });
  }
});
