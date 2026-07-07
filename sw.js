const CACHE_NAME = 'rwoodlog-cache-v18';
const ASSETS = [
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/logo-header.png',
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      Promise.all(ASSETS.map((url) => cache.add(url).catch(() => {})))
    )
  );
});

self.addEventListener('message', (event) => {
  if(event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

const CACHE_FIRST = /\.(png|jpg|jpeg|svg|ico|webp|woff2?)(\?.*)?$/;
const NET_ONLY    = /supabase\.co|api-adresse|osrm|nominatim|unpkg\.com|cdnjs/;

self.addEventListener('fetch', (event) => {
  if(event.request.method !== 'GET') return;
  const url = event.request.url;
  if(NET_ONLY.test(url)) return;

  // index.html — TOUJOURS réseau, jamais de cache
  if(/index\.html|\/([^.]*)?$/.test(url)){
    event.respondWith(
      fetch(event.request, { cache: 'no-cache' })
        .then((r) => { if(r.ok) caches.open(CACHE_NAME).then(c => c.put(event.request, r.clone())); return r; })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  if(CACHE_FIRST.test(url)){
    event.respondWith(caches.open(CACHE_NAME).then(async (cache) => {
      const cached = await cache.match(event.request);
      fetch(event.request).then(r => { if(r.ok) cache.put(event.request, r.clone()); }).catch(()=>{});
      return cached || fetch(event.request);
    }));
  } else {
    event.respondWith(
      fetch(event.request)
        .then((r) => { caches.open(CACHE_NAME).then(c => c.put(event.request, r.clone())); return r; })
        .catch(() => caches.match(event.request))
    );
  }
});

self.addEventListener('push', (event) => {
  if(!event.data) return;
  let p; try { p = event.data.json(); } catch(e) { p = {title:'RWOOD', body:event.data.text()}; }
  event.waitUntil(self.registration.showNotification(p.title||'RWOOD', {
    body:p.body||'', icon:'./icons/icon-192.png', badge:'./icons/icon-192.png',
    tag:p.tag||'rwood-notif', data:p.data||{}, vibrate:[200,100,200],
  }));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(clients.matchAll({type:'window',includeUncontrolled:true}).then(list=>{
    for(const c of list){ if('focus' in c){ c.focus(); return; } }
    if(clients.openWindow) return clients.openWindow('./index.html');
  }));
});
