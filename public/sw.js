const CACHE="love-letter-official-1.3.0";
const CORE=[
  "/",
  "/app.css?v=130",
  "/app.js?v=130",
  "/data.js",
  "/telegram-bridge.js",
  "/brand/logo-icon.svg",
  "/brand/logo-main.svg"
];

self.addEventListener("install",event=>{
  event.waitUntil(caches.open(CACHE).then(c=>c.addAll(CORE)).then(()=>self.skipWaiting()));
});

self.addEventListener("activate",event=>{
  event.waitUntil(
    caches.keys()
      .then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k))))
      .then(()=>self.clients.claim())
  );
});

self.addEventListener("fetch",event=>{
  const url=new URL(event.request.url);
  if(event.request.method!=="GET" || url.pathname.startsWith("/api/")) return;

  event.respondWith(
    fetch(event.request).then(res=>{
      if(res.ok && url.origin===self.location.origin){
        const copy=res.clone();
        caches.open(CACHE).then(c=>c.put(event.request,copy));
      }
      return res;
    }).catch(()=>caches.match(event.request).then(r=>r||caches.match("/")))
  );
});
