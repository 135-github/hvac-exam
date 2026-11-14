/* Versioned, complete offline bundle. A waiting update activates only on user request. */
'use strict';
const CACHE='study-pocket-20261114-r2';
const BASE=new URL('./',self.location.href);
const FILES=["index.html", "app.js", "style.css", "courses.css", "questions.js", "favicon.svg", "study-extras.js", "study-extras.css", "manifest.webmanifest", "electric/index.html", "electric/app.js", "electric/electric.css", "electric/questions.js", "construction/index.html", "construction/app.js", "construction/construction.css", "construction/questions.js", "construction/review.txt", "review/hvac.html", "review/electric.html", "review/construction.html", "review/review.css", "review/review.js"];
FILES.push('migration/index.html','migration/app.js','migration/store.js','migration/engine.js','migration/style.css','migration/manifests/hvac.json');
const urls=FILES.map(file=>new URL(file,BASE).href);
const paths=new Set(urls.map(url=>new URL(url).pathname));
self.addEventListener('install',event=>event.waitUntil((async()=>{
 const cache=await caches.open(CACHE);
 try{await cache.addAll(urls.map(url=>new Request(url,{cache:'reload'})));}
 catch(error){await caches.delete(CACHE);throw error;}
})()));
self.addEventListener('activate',event=>event.waitUntil((async()=>{
 // Only remove this app's previous offline bundles, never other apps or study records.
 for(const key of await caches.keys())if(key.startsWith('study-pocket-')&&key!==CACHE)await caches.delete(key);
 await self.clients.claim();
})()));
self.addEventListener('message',event=>{
 if(event.data?.type==='ACTIVATE_UPDATE')event.waitUntil(self.skipWaiting());
 if(event.data?.type==='CHECK_OFFLINE')event.waitUntil((async()=>{
  const cache=await caches.open(CACHE);const present=await Promise.all(urls.map(url=>cache.match(url)));
  event.ports[0]?.postMessage({ready:present.every(Boolean),version:CACHE});
 })());
});
self.addEventListener('fetch',event=>{
 if(event.request.method!=='GET')return;
 const url=new URL(event.request.url);
 if(url.origin!==BASE.origin||!url.pathname.startsWith(BASE.pathname))return;
 if(url.pathname.endsWith('/'))url.pathname+='index.html';
 if(!paths.has(url.pathname))return;
 // Ignore only query strings on known static app files, including version tags and question links.
 url.search='';url.hash='';
 event.respondWith((async()=>{
  const cached=await (await caches.open(CACHE)).match(url.href);
  return cached||fetch(event.request);
 })());
});
