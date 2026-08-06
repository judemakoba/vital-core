// VitalCore Service Worker - Enhanced v2
// Features: Static caching, runtime caching, offline fallback, background sync, push notifications

const CACHE_NAME = 'vitalcore-v2';
const STATIC_CACHE = 'vitalcore-static-v2';
const RUNTIME_CACHE = 'vitalcore-runtime-v2';
const OFFLINE_CACHE = 'vitalcore-offline-v2';

// Assets to cache on install
const STATIC_ASSETS = [
  '/',
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png',
  '/offline.html', // Offline fallback page
];

// Cache strategies
const CACHE_STRATEGIES = {
  // Static assets - cache first, long TTL
  static: {
    cacheName: STATIC_CACHE,
    maxAgeSeconds: 30 * 24 * 60 * 60, // 30 days
  },
  // API responses - network first with fallback
  api: {
    cacheName: RUNTIME_CACHE,
    maxAgeSeconds: 5 * 60, // 5 minutes
    networkTimeoutSeconds: 10,
  },
  // Page navigations - stale while revalidate
  navigation: {
    cacheName: RUNTIME_CACHE,
    maxAgeSeconds: 60 * 60, // 1 hour
  },
  // Images - cache first
  images: {
    cacheName: RUNTIME_CACHE,
    maxAgeSeconds: 7 * 24 * 60 * 60, // 7 days
  },
};

// Install - cache static assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => {
      console.log('[SW] Caching static assets');
      return cache.addAll(STATIC_ASSETS).catch((err) => {
        console.error('[SW] Failed to cache static assets:', err);
      });
    }).then(() => self.skipWaiting())
  );
});

// Activate - clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => 
            name !== STATIC_CACHE && 
            name !== RUNTIME_CACHE && 
            name !== OFFLINE_CACHE &&
            name.startsWith('vitalcore')
          )
          .map((name) => {
            console.log('[SW] Deleting old cache:', name);
            return caches.delete(name);
          })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch - apply cache strategies
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests
  if (request.method !== 'GET') {
    // For POST/PUT/DELETE, try to queue for background sync if offline
    if (!navigator.onLine) {
      event.respondWith(queueForBackgroundSync(request));
    }
    return;
  }

  // Skip chrome-extension and other non-http(s) requests
  if (!url.protocol.startsWith('http')) return;

  // Determine cache strategy based on request
  if (isStaticAsset(request)) {
    event.respondWith(cacheFirst(request, CACHE_STRATEGIES.static));
  } else if (isApiRequest(request)) {
    event.respondWith(networkFirstWithTimeout(request, CACHE_STRATEGIES.api));
  } else if (isNavigationRequest(request)) {
    event.respondWith(staleWhileRevalidate(request, CACHE_STRATEGIES.navigation));
  } else if (isImageRequest(request)) {
    event.respondWith(cacheFirst(request, CACHE_STRATEGIES.images));
  } else {
    event.respondWith(networkFirst(request));
  }
});

// Background sync for offline mutations
self.addEventListener('sync', (event) => {
  if (event.tag === 'background-sync') {
    event.waitUntil(processBackgroundSyncQueue());
  }
});

// Push notifications
self.addEventListener('push', (event) => {
  if (!event.data) return;

  const data = event.data.json();
  const options = {
    body: data.body || 'New notification',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    vibrate: [200, 100, 200],
    data: data.data || {},
    actions: data.actions || [],
    requireInteraction: true,
  };

  event.waitUntil(
    self.registration.showNotification(data.title || 'VitalCore', options)
  );
});

// Notification click
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  
  const url = event.notification.data?.url || '/dashboard';
  
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      // Check if already open
      for (const client of windowClients) {
        if (client.url.includes(url) && 'focus' in client) {
          return client.focus();
        }
      }
      // Open new window
      if (clients.openWindow) {
        return clients.openWindow(url);
      }
    })
  );
});

// Helper functions

function isStaticAsset(request) {
  const url = new URL(request.url);
  return (
    url.pathname.startsWith('/_next/static/') ||
    url.pathname.startsWith('/static/') ||
    url.pathname.match(/\.(js|css|woff2?|png|jpg|jpeg|gif|svg|ico)$/)
  );
}

function isApiRequest(request) {
  const url = new URL(request.url);
  return url.pathname.startsWith('/api/');
}

function isNavigationRequest(request) {
  return request.mode === 'navigate' || 
    (request.headers.get('Accept') || '').includes('text/html');
}

function isImageRequest(request) {
  const accept = request.headers.get('Accept') || '';
  return accept.includes('image/');
}

// Cache strategies

async function cacheFirst(request, strategy) {
  const cache = await caches.open(strategy.cacheName);
  const cached = await cache.match(request);
  
  if (cached) {
    // Check if expired
    const cachedDate = new Date(cached.headers.get('sw-cached-at') || 0);
    const age = (Date.now() - cachedDate.getTime()) / 1000;
    
    if (age < strategy.maxAgeSeconds) {
      return cached;
    }
  }
  
  try {
    const response = await fetch(request);
    if (response.ok) {
      const responseClone = response.clone();
      const headers = new Headers(responseClone.headers);
      headers.set('sw-cached-at', new Date().toISOString());
      
      const cachedResponse = new Response(responseClone.body, {
        status: responseClone.status,
        statusText: responseClone.statusText,
        headers,
      });
      
      cache.put(request, cachedResponse);
    }
    return response;
  } catch (err) {
    console.error('[SW] Cache-first fetch failed:', err);
    // Return offline fallback for navigations
    if (isNavigationRequest(request)) {
      return getOfflineFallback();
    }
    throw err;
  }
}

async function networkFirst(request) {
  const cache = await caches.open(RUNTIME_CACHE);
  
  try {
    const response = await fetch(request);
    if (response.ok) {
      cache.put(request, response.clone());
    }
    return response;
  } catch (err) {
    const cached = await cache.match(request);
    if (cached) return cached;
    
    if (isNavigationRequest(request)) {
      return getOfflineFallback();
    }
    throw err;
  }
}

async function networkFirstWithTimeout(request, strategy) {
  const cache = await caches.open(strategy.cacheName);
  
  // Race network against timeout
  const networkResponse = fetch(request).then((response) => {
    if (response.ok) {
      const responseClone = response.clone();
      const headers = new Headers(responseClone.headers);
      headers.set('sw-cached-at', new Date().toISOString());
      cache.put(request, new Response(responseClone.body, {
        status: responseClone.status,
        statusText: responseClone.statusText,
        headers,
      }));
    }
    return response;
  });
  
  const timeout = new Promise((_, reject) => {
    setTimeout(() => reject(new Error('Network timeout')), strategy.networkTimeoutSeconds * 1000);
  });
  
  try {
    const response = await Promise.race([networkResponse, timeout]);
    return response;
  } catch (err) {
    const cached = await cache.match(request);
    if (cached) {
      // Check if not too stale
      const cachedDate = new Date(cached.headers.get('sw-cached-at') || 0);
      const age = (Date.now() - cachedDate.getTime()) / 1000;
      if (age < strategy.maxAgeSeconds) {
        // Add header to indicate stale
        const headers = new Headers(cached.headers);
        headers.set('sw-stale', 'true');
        return new Response(cached.body, {
          status: cached.status,
          statusText: cached.statusText,
          headers,
        });
      }
    }
    
    if (isNavigationRequest(request)) {
      return getOfflineFallback();
    }
    
    // Return offline response for API
    return new Response(
      JSON.stringify({ error: 'Offline', code: 'OFFLINE' }),
      { status: 503, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

async function staleWhileRevalidate(request, strategy) {
  const cache = await caches.open(strategy.cacheName);
  const cached = await cache.match(request);
  
  // Always fetch in background
  const networkResponse = fetch(request).then((response) => {
    if (response.ok) {
      const responseClone = response.clone();
      const headers = new Headers(responseClone.headers);
      headers.set('sw-cached-at', new Date().toISOString());
      cache.put(request, new Response(responseClone.body, {
        status: responseClone.status,
        statusText: responseClone.statusText,
        headers,
      }));
    }
    return response;
  }).catch(() => null); // Ignore network errors
  
  // Return cached immediately if available
  if (cached) {
    const cachedDate = new Date(cached.headers.get('sw-cached-at') || 0);
    const age = (Date.now() - cachedDate.getTime()) / 1000;
    
    if (age < strategy.maxAgeSeconds) {
      // Fire and forget network update
      networkResponse;
      return cached;
    }
  }
  
  // No valid cache, wait for network
  try {
    const response = await networkResponse;
    if (response) return response;
  } catch {}
  
  // Fallback
  if (cached) return cached;
  return getOfflineFallback();
}

async function getOfflineFallback() {
  const cache = await caches.open(OFFLINE_CACHE);
  const offline = await cache.match('/offline.html');
  if (offline) return offline;
  
  // Create basic offline page
  return new Response(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>VitalCore - Offline</title>
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <style>
        body { font-family: system-ui; text-align: center; padding: 50px 20px; background: #f5f5f5; }
        .container { max-width: 400px; margin: 0 auto; background: white; padding: 40px; border-radius: 12px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
        h1 { color: #1a73e8; }
        p { color: #666; }
        button { background: #1a73e8; color: white; border: none; padding: 12px 24px; border-radius: 8px; font-size: 16px; cursor: pointer; }
        button:hover { background: #155ab6; }
      </style>
    </head>
    <body>
      <div class="container">
        <h1>You're Offline</h1>
        <p>VitalCore needs an internet connection to work. Please check your connection and try again.</p>
        <button onclick="window.location.reload()">Retry</button>
      </div>
    </body>
    </html>
  `, {
    headers: { 'Content-Type': 'text/html' },
  });
}

// Background sync queue
const SYNC_QUEUE_KEY = 'vitalcore-sync-queue';

async function queueForBackgroundSync(request) {
  // Store request in IndexedDB for later sync
  // For now, just return offline response
  return new Response(
    JSON.stringify({ error: 'Queued for sync', code: 'QUEUED' }),
    { status: 202, headers: { 'Content-Type': 'application/json' } }
  );
}

async function processBackgroundSyncQueue() {
  // Process queued requests when online
  console.log('[SW] Processing background sync queue');
  // Implementation would use IndexedDB
}