const CACHE="academicvocab-stage6-shell-v2";
self.addEventListener("install",()=>self.skipWaiting());
self.addEventListener("activate",event=>event.waitUntil(
  caches.keys()
    .then(keys=>Promise.all(keys.filter(key=>key.startsWith("academicvocab-")&&key!==CACHE).map(key=>caches.delete(key))))
    .then(()=>self.clients.claim())
));
self.addEventListener("fetch",event=>{
  if(event.request.method!=="GET"||event.request.url.startsWith("file:"))return;
  event.respondWith(caches.match(event.request).then(cached=>{
    const request=fetch(event.request).then(response=>{
      if(response.ok&&new URL(event.request.url).origin===self.location.origin){
        caches.open(CACHE).then(cache=>cache.put(event.request,response.clone()));
      }
      return response;
    });
    return cached||request;
  }));
});
