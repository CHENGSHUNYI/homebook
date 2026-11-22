// 離線快取：有網路時一律先抓最新版（避免看到舊版），沒網路才用快取
const CACHE = 'homebook-v3';
const SHELL = ['./', 'index.html', 'css/app.css', 'js/app.js', 'js/logic.js', 'js/store.js', 'js/templates.js', 'js/ics.js', 'js/firebase-config.js',
  'manifest.webmanifest', 'icons/icon-180.png', 'icons/icon-192.png', 'icons/icon-512.png'];

self.addEventListener('install', (e) => {
  // cache: 'reload' 繞過瀏覽器 HTTP 快取，確保存進來的是伺服器上的最新檔案
  e.waitUntil(caches.open(CACHE)
    .then((c) => c.addAll(SHELL.map((u) => new Request(u, { cache: 'reload' }))))
    .then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

function timeout(ms) { return new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms)); }

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET') return;

  // Firebase SDK（網址含版本號，不會變）：快取優先
  if (url.hostname === 'www.gstatic.com') {
    e.respondWith(caches.open(CACHE).then(async (c) => {
      const hit = await c.match(e.request);
      if (hit) return hit;
      const res = await fetch(e.request);
      if (res.ok) c.put(e.request, res.clone());
      return res;
    }));
    return;
  }
  if (url.origin !== location.origin) return; // Firestore／登入請求直接走網路

  // 自己的檔案：網路優先（4 秒內沒回應或離線就用快取）
  e.respondWith(caches.open(CACHE).then(async (c) => {
    try {
      const res = await Promise.race([fetch(e.request, { cache: 'no-cache' }), timeout(4000)]);
      if (res.ok) c.put(e.request, res.clone());
      return res;
    } catch {
      return (await c.match(e.request, { ignoreSearch: true })) || Response.error();
    }
  }));
});
