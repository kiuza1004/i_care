// 정적 리소스 사전 캐시 - 두 번째 사용부터 데이터 0KB
const CACHE = 'icare-v4';
const ASSETS = [
  './',
  './index.html',
  './parent.html',
  './child.html',
  './manifest.json',
  './icon.svg',
  './css/style.css',
  './js/config.js',
  './js/api.js',
  './js/parent.js',
  './js/child.js'
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
  );
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // Firebase 호출은 절대 캐시하지 않음 (항상 네트워크)
  if (url.hostname.endsWith('firebaseio.com') || url.hostname.endsWith('firebasedatabase.app')) {
    return;
  }
  // 정적 리소스는 캐시 우선
  if (url.origin === self.location.origin) {
    e.respondWith(
      caches.match(req).then(cached => cached || fetch(req).then(res => {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(req, copy));
        return res;
      }).catch(() => cached))
    );
  }
});
