const CACHE = "nightops-v1";
const ASSETS = [
  "./","./index.html","./styles.css","./app.js","./db.js","./crypto.js","./manifest.webmanifest",
  "./icons/icon-192.png","./icons/icon-512.png"
];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener("activate", e => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)));
    self.clients.claim();
  })());
});

self.addEventListener("fetch", e => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET") return;
  e.respondWith((async ()=>{
    const cached = await caches.match(e.request);
    if (cached) return cached;
    try {
      const net = await fetch(e.request);
      const c = await caches.open(CACHE);
      if (url.origin === location.origin) c.put(e.request, net.clone());
      return net;
    } catch {
      return cached || new Response("Offline", { status: 503 });
    }
  })());
});
