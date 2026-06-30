const CACHE_NAME = 'rwoodlog-cache-v2';
const ASSETS = [
  './index.html',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/logo-header.png',
  './icons/shortcut-newsite.png',
  './icons/shortcut-calc.png',
  './icons/shortcut-agenda.png'
];

/* ─── INSTALL : mise en cache des assets ─────────────────────────────────── */
self.addEventListener('install', (event) => {
  // Activation immédiate du nouveau SW sans attendre la fermeture des onglets
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      Promise.all(
        ASSETS.map((url) =>
          cache.add(url).catch((err) =>
            console.warn('[SW] Asset ignoré :', url, err)
          )
        )
      )
    )
  );
});

self.addEventListener('message', (event) => {
  if(event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

/* ─── FETCH : stratégie hybride ──────────────────────────────────────────────
   • index.html + assets RWOOD → Cache-First avec mise à jour en arrière-plan
     (stale-while-revalidate) : l'app s'ouvre IMMÉDIATEMENT depuis le cache,
     puis le réseau met à jour le cache pour la prochaine ouverture.

   • API externes (Supabase, Nominatim, OSRM, jsPDF CDN…) → Network-First :
     on veut toujours les données fraîches, le cache sert de fallback.
*/
const CACHE_FIRST_PATTERNS = [
  // index.html EXCLU → toujours network-first pour avoir la dernière version
  /\.(png|jpg|jpeg|svg|ico|webp|woff2?)(\?.*)?$/,
];
const NETWORK_ONLY_PATTERNS = [
  /supabase\.co/,
  /api-adresse\.data\.gouv\.fr/,
  /router\.project-osrm\.org/,
  /nominatim\.openstreetmap\.org/,
];

self.addEventListener('fetch', (event) => {
  if(event.request.method !== 'GET') return;

  const url = event.request.url;

  // Toujours réseau pour les APIs
  if(NETWORK_ONLY_PATTERNS.some(p => p.test(url))) return;

  const isCacheFirst = CACHE_FIRST_PATTERNS.some(p => p.test(url));

  if(isCacheFirst){
    // Cache-first avec revalidation en arrière-plan
    event.respondWith(
      caches.open(CACHE_NAME).then(async (cache) => {
        const cached = await cache.match(event.request);
        // Lancer la mise à jour réseau en arrière-plan (ne bloque pas)
        const networkPromise = fetch(event.request)
          .then((response) => {
            if(response && response.status === 200){
              cache.put(event.request, response.clone());
            }
            return response;
          })
          .catch(() => null);

        // Retourner immédiatement le cache si disponible
        return cached || networkPromise;
      })
    );
  } else {
    // Network-first pour tout le reste
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
          return response;
        })
        .catch(() => caches.match(event.request))
    );
  }
});

/* ─── PUSH NOTIFICATIONS ──────────────────────────────────────────────────── */
self.addEventListener('push', (event) => {
  if(!event.data) return;
  let payload;
  try { payload = event.data.json(); }
  catch(e) { payload = { title: 'RWOOD', body: event.data.text() }; }
  event.waitUntil(
    self.registration.showNotification(payload.title || 'RWOOD', {
      body:    payload.body  || '',
      icon:    './icons/icon-192.png',
      badge:   './icons/icon-192.png',
      tag:     payload.tag   || 'rwood-notif',
      data:    payload.data  || {},
      vibrate: [200, 100, 200, 100, 200],
      requireInteraction: payload.requireInteraction || false,
      actions: payload.actions || [],
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const data = event.notification.data || {};
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for(const client of list){
        if(client.url.includes('index.html') && 'focus' in client){
          client.focus();
          if(data.view) client.postMessage({ type: 'navigate', view: data.view });
          return;
        }
      }
      if(clients.openWindow) return clients.openWindow(data.url || './index.html');
    })
  );
});
