const CACHE='olomouc-quest-v4-1';
const SHELL=['./','./index.html','./styles.css','./data.js','./app.js','./manifest.webmanifest','./icons/icon-192.png','./icons/icon-512.png','./vendor/leaflet.css','./vendor/leaflet.js','./vendor/MarkerCluster.css','./vendor/MarkerCluster.Default.css','./vendor/leaflet.markercluster.js','./vendor/firebase-app.js','./vendor/firebase-firestore.js'];
self.addEventListener('install',event=>{event.waitUntil(caches.open(CACHE).then(c=>c.addAll(SHELL)).then(()=>self.skipWaiting()))});
self.addEventListener('activate',event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()))});
self.addEventListener('fetch',event=>{
  const req=event.request,url=new URL(req.url);
  if(req.method!=='GET')return;
  if(url.hostname.includes('tile.openstreetmap.org')||url.hostname.includes('cdnjs.cloudflare.com')){
    event.respondWith(caches.open(CACHE).then(async cache=>{const hit=await cache.match(req);const network=fetch(req).then(r=>{if(r&&r.status<400)cache.put(req,r.clone());return r}).catch(()=>hit);return hit||network}));return;
  }
  if(url.origin===location.origin){event.respondWith(caches.match(req).then(hit=>hit||fetch(req).then(r=>{const copy=r.clone();caches.open(CACHE).then(c=>c.put(req,copy));return r}).catch(()=>caches.match('./index.html'))))}
});
