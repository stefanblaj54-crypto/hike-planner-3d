'use strict';
/* Hike Planner 3D service worker: keeps the app itself on the phone so saved hikes open without a connection.
   Route, terrain, map, place and weather requests always go to the network.
   It opens instantly from that copy. Each time it opens or comes back to the screen it checks the app's own files
   and swaps in all changed ones at once, so a change on the website reaches the phone with no new VERSION. */
const VERSION='hp3d-2026-11-22b';
const SHELL=[
  "./",
  "index.html",
  "app.css",
  "fonts/barlow-latin-400-normal.woff2",
  "fonts/barlow-latin-500-normal.woff2",
  "fonts/barlow-latin-600-normal.woff2",
  "fonts/barlow-latin-ext-400-normal.woff2",
  "fonts/barlow-latin-ext-500-normal.woff2",
  "fonts/barlow-latin-ext-600-normal.woff2",
  "fonts/barlow-semi-condensed-latin-600-normal.woff2",
  "fonts/barlow-semi-condensed-latin-700-normal.woff2",
  "fonts/barlow-semi-condensed-latin-ext-600-normal.woff2",
  "fonts/barlow-semi-condensed-latin-ext-700-normal.woff2",
  "icons/apple-touch-icon.png",
  "icons/favicon-32.png",
  "icons/icon-192.png",
  "icons/icon-512.png",
  "icons/icon-maskable-512.png",
  "img/contours.svg",
  "img/sample-tall.jpg",
  "img/sample-wide.jpg",
  "js/app.js",
  "js/build.js",
  "js/core.js",
  "js/guide.js",
  "js/motion.js",
  "js/theme.js",
  "js/trail.js",
  "js/viewer.js",
  "lib/leaflet/images/layers-2x.png",
  "lib/leaflet/images/layers.png",
  "lib/leaflet/images/marker-icon-2x.png",
  "lib/leaflet/images/marker-icon.png",
  "lib/leaflet/images/marker-shadow.png",
  "lib/leaflet/leaflet.css",
  "lib/leaflet/leaflet.js",
  "lib/three/OrbitControls.js",
  "lib/three/lines/Line2.js",
  "lib/three/lines/LineGeometry.js",
  "lib/three/lines/LineMaterial.js",
  "lib/three/lines/LineSegments2.js",
  "lib/three/lines/LineSegmentsGeometry.js",
  "lib/three/three.min.js",
  "manifest.webmanifest"
];
// a response that came through a redirect cannot answer a page load, so keep a clean copy
const clean=r=>r.redirected?r.blob().then(b=>new Response(b,{status:r.status,statusText:r.statusText,headers:r.headers})):r;
self.addEventListener('install',e=>{e.waitUntil(caches.open(VERSION).then(c=>Promise.all(SHELL.map(u=>
  fetch(new Request(u,{cache:'reload'})).then(r=>{if(!r.ok)throw Error(u+' '+r.status);return clean(r)}).then(r=>c.put(u,r))))).then(()=>self.skipWaiting()))});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k.startsWith('hp3d-')&&k!==VERSION).map(k=>caches.delete(k)))).then(()=>self.clients.claim()))});
// Libraries, fonts and icons never change under the same name; they are refreshed only when VERSION changes.
const FIXED=/\/(lib|fonts|icons)\//;
// Every request is answered from the copy kept on the phone, so the app opens instantly, also with no signal.
// Anything not kept yet comes from the network and is kept for next time.
self.addEventListener('fetch',e=>{
  const r=e.request;if(r.method!=='GET')return;
  const u=new URL(r.url);if(u.origin!==self.location.origin)return;
  const nav=r.mode==='navigate';
  e.respondWith(caches.open(VERSION).then(c=>c.match(nav?'./':r,{ignoreSearch:true}).then(m=>m||(nav?c.match('index.html'):null)).then(m=>m||
    fetch(r).then(res=>{if(res.ok&&!nav)clean(res.clone()).then(x=>c.put(r,x));return res}))).catch(()=>fetch(r)))});
// Update check, asked for by the app each time it opens or comes back to the screen:
// download the app's own files again; if any changed, swap them all in at once and tell the app.
const same=(a,b)=>{if(a.byteLength!==b.byteLength)return false;const x=new Uint8Array(a),y=new Uint8Array(b);for(let i=0;i<x.length;i++)if(x[i]!==y[i])return false;return true};
let checking=null;
const check=()=>checking||(checking=caches.open(VERSION).then(c=>c.keys().then(ks=>{
  const own=ks.filter(q=>!FIXED.test(new URL(q.url).pathname));
  return Promise.all(own.map(q=>fetch(new Request(q.url,{cache:'no-cache',credentials:'same-origin'})).then(clean).then(res=>{if(!res.ok)throw Error(q.url+' '+res.status);
    return Promise.all([res.clone().arrayBuffer(),c.match(q).then(m=>m?m.arrayBuffer():new ArrayBuffer(0))]).then(([a,b])=>({q,res,changed:!same(a,b)}))})))
  .then(list=>list.some(x=>x.changed)&&Promise.all(list.map(x=>c.put(x.q,x.res))).then(()=>true))}))
  .then(changed=>changed&&self.clients.matchAll({type:'window'}).then(ws=>ws.forEach(w=>w.postMessage({type:'updated'}))))
  .catch(()=>{}).then(()=>{checking=null}));
self.addEventListener('message',e=>{if(e.data&&e.data.type==='check')e.waitUntil(check())});
