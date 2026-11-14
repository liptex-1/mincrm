// MiniCRM service worker: офлайн-оболочка + push-уведомления.
const CACHE = 'minicrm-shell-v3';
const SHELL = ['/', '/manifest.webmanifest', '/icon-192.png'];

self.addEventListener('install', (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())); });

// Данные (Supabase) никогда не кэшируем — только оболочку приложения, сначала сеть.
self.addEventListener('fetch', (e) => {
  const r = e.request, u = new URL(r.url);
  if (r.method !== 'GET' || u.origin !== location.origin) return;
  e.respondWith(fetch(r).then((res) => { if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(r, copy)); } return res; }).catch(() => caches.match(r).then((m) => m || caches.match('/'))));
});

self.addEventListener('push', (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch { d = { title: 'MiniCRM', body: e.data ? e.data.text() : '' }; }
  e.waitUntil(self.registration.showNotification(d.title || 'MiniCRM', {
    body: d.body || '', icon: '/icon-192.png', badge: '/icon-192.png', tag: d.kind ? d.kind + ':' + (d.title || '') : undefined, data: { url: d.url || '#/' },
  }));
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || '#/';
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
    for (const c of list) { if ('focus' in c) { c.postMessage({ type: 'navigate', url }); return c.focus(); } }
    return self.clients.openWindow('/' + url);
  }));
});
