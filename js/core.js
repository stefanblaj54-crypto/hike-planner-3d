'use strict';
/* Hike Planner 3D: shared helpers, storage on the phone, file import and export */
(function(){
const HP=window.HP=window.HP||{};
const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];
const nf=new Intl.NumberFormat('en-GB');
const fmtH=h=>{const m=Math.round(h*60);return m<60?m+' min':Math.floor(m/60)+' h '+String(m%60).padStart(2,'0')};
const fmtClock=h=>{const m=((Math.round(h*60)%1440)+1440)%1440;return String(Math.floor(m/60)).padStart(2,'0')+':'+String(m%60).padStart(2,'0')};
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const sst=(a,b,x)=>{const t=Math.min(1,Math.max(0,(x-a)/(b-a)));return t*t*(3-2*t)};
const isoDay=d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
const parseDay=s=>{const [y,m,d]=String(s).split('-').map(Number);return new Date(y,(m||1)-1,d||1)};
const fmtDate=(s,opt={weekday:'short',day:'numeric',month:'short'})=>parseDay(s).toLocaleDateString('en-GB',opt);
HP.u={$,$$,nf,fmtH,fmtClock,esc,sleep,sst,isoDay,parseDay,fmtDate};

// Web Mercator, 256 px tiles
const TS=256;
HP.geo={
  x:(lon,z)=>(lon+180)/360*TS*2**z,
  y:(lat,z)=>{const r=lat*Math.PI/180;return(1-Math.log(Math.tan(r)+1/Math.cos(r))/Math.PI)/2*TS*2**z},
  lon:(x,z)=>x/(TS*2**z)*360-180,
  lat:(y,z)=>{const n=Math.PI-2*Math.PI*y/(TS*2**z);return 180/Math.PI*Math.atan(Math.sinh(n))},
  mpp:(lat,z)=>156543.03392*Math.cos(lat*Math.PI/180)/2**z,
  hav:(la1,lo1,la2,lo2)=>{const R=6371008.8,p1=la1*Math.PI/180,p2=la2*Math.PI/180,dp=p2-p1,dl=(lo2-lo1)*Math.PI/180;return 2*R*Math.asin(Math.min(1,Math.sqrt(Math.sin(dp/2)**2+Math.cos(p1)*Math.cos(p2)*Math.sin(dl/2)**2)))}
};

// A short record of what went wrong on this phone (since 2.3), for "Copy problem details" in About. Nothing leaves the phone
// unless the person copies it; keys and exact positions are cut out.
HP.log=(()=>{const K='hp-log',MAX=40;let L=[],t=0;try{L=JSON.parse(localStorage.getItem(K)||'[]');if(!Array.isArray(L))L=[]}catch(e){L=[]}
  const clean=x=>String(x==null?'':x).replace(/(token|key|apikey|api_key)=[^&\s"')]+/gi,'$1=…').replace(/(-?\d{1,3}\.\d{2})\d{2,}/g,'$1').slice(0,400);
  const save=()=>{clearTimeout(t);t=setTimeout(()=>{try{localStorage.setItem(K,JSON.stringify(L.slice(-MAX)))}catch(e){}},400)};
  const add=(k,m,where)=>{m=clean(m);if(!m)return;const l=L[L.length-1],h=location.hash.split('/').slice(0,2).join('/')||'#/';
    if(l&&l.k===k&&l.m===m){l.n=(l.n||1)+1;l.t=Date.now()}else{L.push({t:Date.now(),k,m,w:clean(where||''),h,v:HP.update?HP.update.version:''});if(L.length>MAX)L.splice(0,L.length-MAX)}save()};
  const noise=m=>/ResizeObserver loop|^Script error\.?$|AbortError|The user aborted|cancelled|Load failed$/i.test(m||'');
  addEventListener('error',e=>{if(e.target&&e.target!==window)return;const m=e.message||(e.error&&e.error.message)||'';if(noise(m))return;
    add('error',m,(e.filename||'').split('/').pop()+':'+(e.lineno||0)+':'+(e.colno||0))},true);
  addEventListener('unhandledrejection',e=>{const r=e.reason,m=r&&(r.message||r)||'';if(noise(String(m))||r&&r.name==='AbortError')return;
    add('promise',m,r&&r.stack?(String(r.stack).split('\n')[1]||'').trim():'')});
  // the app's own warnings that carry an error ("satellite", "places", "trail"…) are noted too
  const cw=console.warn.bind(console);console.warn=(...a)=>{cw(...a);try{const e=a.find(x=>x&&typeof x==='object'&&x.message);
    if(e&&!noise(e.message)&&e.name!=='AbortError')add('warn',(typeof a[0]==='string'?a[0]+': ':'')+e.message)}catch(x){}};
  const host=u=>{try{return new URL(u,location.href).host}catch(e){return''}};
  return{add,note:(m,w)=>add('note',m,w),net:(u,m)=>add('net',m,host(u)),list:()=>L.slice(),clear(){L=[];try{localStorage.removeItem(K)}catch(e){}}}})();

// network with a timeout, so a request that hangs on a weak signal can't hold anything up for ever; the caller's own signal
// (a Cancel button) stops it too. HP.fetchT gives the response, with its body read inside the time allowed.
const TMUL=(()=>{try{return +localStorage.getItem('hp-tmul')||1}catch(e){return 1}})(); // tests shorten the waits
HP.fetchT=async(url,opt={},ms=20000,as='blob')=>{const c=new AbortController(),up=opt.signal,on=()=>c.abort(),t=setTimeout(on,ms*TMUL);
  if(up){if(up.aborted)c.abort();else up.addEventListener('abort',on,{once:true})}
  try{const r=await fetch(url,{...opt,signal:c.signal}),body=as?await r[as]():null;return{r,ok:r.ok,status:r.status,type:r.headers.get('content-type')||'',body}}
  catch(e){if(up&&up.aborted){const a=Error('Cancelled');a.name='AbortError';throw a}
    if(e.name==='AbortError'){const x=Error('The server took too long to answer');x.timeout=true;throw x}throw e}
  finally{clearTimeout(t);if(up)up.removeEventListener('abort',on)}};
HP.fetchJSON=async(url,opt={},ms=30000)=>{let x;
  try{x=await HP.fetchT(url,opt,ms,'text')}catch(e){if(e.name!=='AbortError')HP.log.net(url,e.message);throw e}
  if(!x.ok){const e=Error((x.body||x.r.statusText||'HTTP '+x.status).slice(0,160));HP.log.net(url,e.message);throw e}
  try{return JSON.parse(x.body)}catch(e){HP.log.net(url,'not JSON: '+String(x.body).slice(0,60));throw Error('The server sent an answer the app could not read')}};

// storage: hikes (list data), plans (full data), blobs (map pictures)
HP.db=(()=>{let dbp=null;
  const open=()=>dbp||(dbp=new Promise((ok,no)=>{let r;try{r=indexedDB.open('hike-planner-3d',1)}catch(e){no(e);return}
    r.onupgradeneeded=()=>{const d=r.result;for(const s of['hikes','plans','blobs'])if(!d.objectStoreNames.contains(s))s==='hikes'?d.createObjectStore(s,{keyPath:'id'}):d.createObjectStore(s)};
    r.onsuccess=()=>ok(r.result);r.onerror=()=>no(r.error)}));
  // a full phone is said plainly, with what to do about it
  const why=e=>{if(e&&(e.name==='QuotaExceededError'||/quota/i.test(e.message||''))){const x=Error('The phone has no more room for this app. Delete hikes you no longer need, or free some space, then try again.');x.name='QuotaExceededError';HP.log.add('storage',e.message||e.name);return x}return e||Error('Storage was refused')};
  const run=async(stores,mode,fn)=>{const d=await open();return new Promise((ok,no)=>{const t=d.transaction(stores,mode);let out;const q=fn(t);t.oncomplete=()=>ok(q&&'result'in q?q.result:out);t.onerror=()=>no(why(t.error));t.onabort=()=>no(why(t.error))})};
  return{
    list:()=>run('hikes','readonly',t=>t.objectStore('hikes').getAll()),
    meta:id=>run('hikes','readonly',t=>t.objectStore('hikes').get(id)),
    plan:id=>run('plans','readonly',t=>t.objectStore('plans').get(id)),
    blob:k=>run('blobs','readonly',t=>t.objectStore('blobs').get(k)),
    save:(meta,plan,blobs)=>run(['hikes','plans','blobs'],'readwrite',t=>{t.objectStore('hikes').put(meta);if(plan)t.objectStore('plans').put(plan,meta.id);for(const[k,b]of Object.entries(blobs||{}))if(b)t.objectStore('blobs').put(b,meta.id+':'+k)}),
    putMeta:meta=>run('hikes','readwrite',t=>t.objectStore('hikes').put(meta)),
    putPlan:(id,plan)=>run('plans','readwrite',t=>t.objectStore('plans').put(plan,id)),
    remove:id=>run(['hikes','plans','blobs'],'readwrite',t=>{t.objectStore('hikes').delete(id);t.objectStore('plans').delete(id);for(const k of['topo','relief','sat','dem','cover','coverw','vec'])t.objectStore('blobs').delete(id+':'+k);
      t.objectStore('blobs').delete(IDBKeyRange.bound(id+':m:',id+':m:\uffff'))}),
    // many pictures in one go, the keys under a prefix, and all of them at once (the saved map strips, since 2.3)
    putMany:pairs=>run('blobs','readwrite',t=>{const st=t.objectStore('blobs');for(const[k,b]of pairs)st.put(b,k)}),
    keys:pre=>run('blobs','readonly',t=>t.objectStore('blobs').getAllKeys(IDBKeyRange.bound(pre,pre+'\uffff'))),
    delPrefix:pre=>run('blobs','readwrite',t=>t.objectStore('blobs').delete(IDBKeyRange.bound(pre,pre+'\uffff'))),
    putBlob:(k,b)=>run('blobs','readwrite',t=>t.objectStore('blobs').put(b,k)),
    delBlob:k=>run('blobs','readwrite',t=>t.objectStore('blobs').delete(k))
  }})();

// GPX, KML and GeoJSON import
HP.parseRouteFile=(text,fname)=>{
  let pts=[],wpts=[],title='';const low=(fname||'').toLowerCase(),tt=text.trim();
  if(low.endsWith('.json')||low.endsWith('.geojson')||tt[0]==='{'){
    const g=JSON.parse(tt),feats=g.type==='FeatureCollection'?g.features:g.type==='Feature'?[g]:[{geometry:g,properties:{}}];
    for(const f of feats){const gm=f.geometry,pr=f.properties||{};if(!gm)continue;
      const line=cs=>cs.forEach(c=>pts.push({lat:+c[1],lon:+c[0],e:c[2]}));
      if(gm.type==='LineString')line(gm.coordinates);else if(gm.type==='MultiLineString')gm.coordinates.forEach(line);
      else if(gm.type==='Point'&&pr.name)wpts.push({lat:+gm.coordinates[1],lon:+gm.coordinates[0],name:String(pr.name)});
      if(!title&&pr.name&&gm.type!=='Point')title=String(pr.name)}
  }else{
    const xml=new DOMParser().parseFromString(tt,'application/xml');
    if(xml.getElementsByTagName('parsererror').length)throw Error('This file could not be read. Use a GPX, KML or GeoJSON file.');
    const kids=(el,tag)=>[...el.getElementsByTagName(tag)];
    if(kids(xml,'kml').length){
      for(const ls of kids(xml,'LineString')){const c=kids(ls,'coordinates')[0];if(c)c.textContent.trim().split(/\s+/).forEach(s=>{const[lo,la,el]=s.split(',').map(Number);if(isFinite(la)&&isFinite(lo))pts.push({lat:la,lon:lo,e:el})})}
      for(const pm of kids(xml,'Placemark')){const p=kids(pm,'Point')[0],n=kids(pm,'name')[0];if(p&&n){const c=kids(p,'coordinates')[0];if(!c)continue;const[lo,la]=c.textContent.trim().split(',').map(Number);if(isFinite(la))wpts.push({lat:la,lon:lo,name:n.textContent.trim()})}}
      const n=kids(xml,'name')[0];title=n?n.textContent.trim():'';
    }else{
      let tp=kids(xml,'trkpt');if(!tp.length)tp=kids(xml,'rtept');
      for(const p of tp){const e=kids(p,'ele')[0];pts.push({lat:+p.getAttribute('lat'),lon:+p.getAttribute('lon'),e:e?+e.textContent:NaN})}
      for(const w of kids(xml,'wpt')){const n=kids(w,'name')[0];if(n)wpts.push({lat:+w.getAttribute('lat'),lon:+w.getAttribute('lon'),name:n.textContent.trim()})}
      for(const tag of['trk','rte','metadata']){const el=kids(xml,tag)[0];if(el){const n=[...el.children].find(c=>c.localName==='name');if(n&&n.textContent.trim()){title=n.textContent.trim();break}}}
    }
  }
  pts=pts.filter(p=>isFinite(p.lat)&&isFinite(p.lon)&&Math.abs(p.lat)<85);
  // drop repeated points
  pts=pts.filter((p,k)=>k===0||p.lat!==pts[k-1].lat||p.lon!==pts[k-1].lon);
  if(pts.length<2)throw Error('No track or route found in this file.');
  return{pts,wpts,title:title||(fname||'Imported hike').replace(/\.[^.]+$/,'').replace(/[_-]+/g,' ')}};

HP.toGPX=(name,lat,lon,ele,wpts=[])=>{const e=HP.u.esc;let s=`<?xml version="1.0" encoding="UTF-8"?>\n<gpx version="1.1" creator="Hike Planner 3D" xmlns="http://www.topografix.com/GPX/1/1">\n<metadata><name>${e(name)}</name></metadata>\n`;
  for(const w of wpts)s+=`<wpt lat="${w.lat.toFixed(6)}" lon="${w.lon.toFixed(6)}"><name>${e(w.name)}</name></wpt>\n`;
  s+=`<trk><name>${e(name)}</name><trkseg>\n`;for(let i=0;i<lat.length;i++)s+=`<trkpt lat="${lat[i].toFixed(6)}" lon="${lon[i].toFixed(6)}"><ele>${Math.round(ele[i])}</ele></trkpt>\n`;
  return s+'</trkseg></trk>\n</gpx>\n'};

HP.download=(name,blob)=>{const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;document.body.appendChild(a);a.click();setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove()},2000)};

// time-zone offset in hours for a place's zone on a given day (falls back to longitude)
HP.tzOffset=(tz,date,lon)=>{try{if(tz){const p=new Intl.DateTimeFormat('en-US',{timeZone:tz,timeZoneName:'shortOffset'}).formatToParts(date).find(x=>x.type==='timeZoneName');const m=/GMT([+-]\d{1,2})(?::(\d\d))?/.exec(p?p.value:'');if(m)return +m[1]+(m[2]?Math.sign(+m[1]||1)*(+m[2])/60:0);if(p&&p.value==='GMT')return 0}}catch(e){}
  const base=Math.round((lon||0)/15),mo=date.getMonth();return base+(mo>=3&&mo<=9?1:0)};
// sunrise and sunset in local clock hours for a date (the same sun model as the 3D view; 0.83° below the horizon for refraction)
HP.sunTimes=(lat,lon,date,tz,alt=-.833)=>{const d=typeof date==='string'?HP.u.parseDay(date):date,off=HP.tzOffset(tz,d,lon),n=Math.round((d-new Date(d.getFullYear(),0,0))/864e5),
  B=2*Math.PI*(n-81)/364,eot=9.87*Math.sin(2*B)-7.53*Math.cos(B)-1.5*Math.sin(B),dec=23.44*Math.PI/180*Math.sin(2*Math.PI*(284+n)/365),L=lat*Math.PI/180,
  noon=12+off-lon/15-eot/60,c=(Math.sin(alt*Math.PI/180)-Math.sin(L)*Math.sin(dec))/(Math.cos(L)*Math.cos(dec));
  if(c>=1)return{rise:noon,set:noon,noon,dark:true};if(c<=-1)return{rise:0,set:24,noon,light:true};const h=Math.acos(c)*180/Math.PI/15;return{rise:noon-h,set:noon+h,noon}};
// effort of a day as km-effort (ITRA): 1 km of distance or 100 m of climbing each count 1
HP.effort=(km,up)=>km+up/100;
HP.effortWord=e=>e<15?'easy':e<25?'moderate':e<35?'hard':'very hard';
// the 16 compass points, for the direction a wind comes from
HP.compass=d=>['N','NNE','NE','ENE','E','ESE','SE','SSE','S','SSW','SW','WSW','W','WNW','NW','NNW'][Math.round(((d%360+360)%360)/22.5)%16];
// the person's own gear, in kinds; the first item of a kind is the one the packing advice names. [key, label, the general word]
HP.INVCAT=[
  {g:'Clothing',k:[['shirt','T-shirt','T-shirt'],['base','Base layer','merino'],['fleece','Fleece or mid layer','fleece'],['shell','Shell jacket','waterproof'],['puffy','Warm jacket','warm jacket'],
    ['trousers','Hiking trousers','hiking trousers'],['rainpants','Rain trousers','rain trousers'],['hat','Warm hat','hat'],['sunhat','Sun hat or cap','sun hat'],['gloves','Gloves','gloves'],['socks','Socks','hiking socks'],['gaiters','Gaiters','gaiters']]},
  {g:'Footwear',k:[['boots','Boots or trail shoes','boots'],['spikes','Microspikes','microspikes']]},
  {g:'Gear',k:[['pack','Backpack','backpack'],['liner','Pack liner','pack liner'],['poles','Poles','poles'],['headlamp','Headlamp','headlamp'],['water','Bottles or bladder','water bottles'],
    ['firstaid','First-aid kit','first-aid kit'],['sunglasses','Sunglasses','sunglasses'],['nav','Map or GPS','map'],['power','Power bank','power bank']]},
  {g:'For the nights',k:[['sleep','Sleeping bag or liner','sleeping-bag liner'],['tent','Tent','tent'],['mat','Sleeping mat','sleeping mat'],['stove','Stove','stove']]},
  {g:'Always with me',k:[['other','Other things','']]}];
HP.INVK=Object.fromEntries(HP.INVCAT.flatMap(g=>g.k.map(k=>[k[0],{label:k[1],word:k[2],g:g.g}])));
HP.inv={
  load(){try{const o=JSON.parse(localStorage.getItem('hp-inv')||'{}');return o&&o.items?o:{v:1,items:{}}}catch(e){return{v:1,items:{}}}},
  save(o){try{localStorage.setItem('hp-inv',JSON.stringify(o))}catch(e){}},
  items(k){const a=this.load().items[k];return Array.isArray(a)?a.filter(x=>x&&x.name):[]},
  first(k){return this.items(k)[0]||null},
  count(){const it=this.load().items;return Object.values(it).reduce((s,a)=>s+(Array.isArray(a)?a.length:0),0)},
  // the person's item for a kind, marked as theirs, or the general word
  word(k,fallback){const x=this.first(k),f=fallback!=null?fallback:(HP.INVK[k]||{}).word||k;return x?`<span class="own">${HP.u.esc(x.name)}</span>`:HP.u.esc(f)}};

// Backup (since 2.3): every hike's plan, its list entry, the inventory and the look, in one small file. Pictures, heights and
// saved map strips are left out: the phone makes them again the first time each hike opens with a connection.
HP.backup=(()=>{const TA={Float32Array,Float64Array,Int8Array,Uint8Array,Uint8ClampedArray,Int16Array,Uint16Array,Int32Array,Uint32Array};
  const b64=u=>{let s='';for(let i=0;i<u.length;i+=32768)s+=String.fromCharCode.apply(null,u.subarray(i,i+32768));return btoa(s)};
  const unb64=s=>{const b=atob(s),u=new Uint8Array(b.length);for(let i=0;i<b.length;i++)u[i]=b.charCodeAt(i);return u};
  const enc=v=>{if(v==null||typeof v!=='object')return v;if(ArrayBuffer.isView(v)&&TA[v.constructor.name])return{$t:v.constructor.name,d:b64(new Uint8Array(v.buffer,v.byteOffset,v.byteLength))};
    if(v instanceof Blob)return null;if(v instanceof Map)return{$m:[...v].map(([k,x])=>[k,enc(x)])};if(v instanceof Set)return{$s:[...v].map(enc)};if(v instanceof Date)return{$d:+v};
    if(Array.isArray(v))return v.map(enc);const o={};for(const k of Object.keys(v))o[k]=enc(v[k]);return o};
  const dec=v=>{if(v==null||typeof v!=='object')return v;if(Array.isArray(v))return v.map(dec);
    if(typeof v.$t==='string'&&TA[v.$t]&&typeof v.d==='string'){const u=unb64(v.d),T=TA[v.$t];return new T(u.buffer,0,u.byteLength/T.BYTES_PER_ELEMENT)}
    if(Array.isArray(v.$m))return new Map(v.$m.map(([k,x])=>[k,dec(x)]));if(Array.isArray(v.$s))return new Set(v.$s.map(dec));if(typeof v.$d==='number'&&Object.keys(v).length===1)return new Date(v.$d);
    const o={};for(const k of Object.keys(v))o[k]=dec(v[k]);return o};
  const LS=['hp-inv','hp-look'];
  async function make(){const metas=await HP.db.list(),hikes=[];for(const m of metas){const D=await HP.db.plan(m.id);if(D)hikes.push({meta:enc(m),plan:enc(D)})}
    const ls={};for(const k of LS){try{const v=localStorage.getItem(k);if(v)ls[k]=v}catch(e){}}
    return JSON.stringify({app:'Hike Planner 3D',kind:'backup',v:1,version:HP.update?HP.update.version:'',made:Date.now(),hikes,ls})}
  // add the hikes this phone doesn't have, and replace those the backup has a newer copy of; settings only where this phone has none
  async function restore(text){let j=null;try{j=JSON.parse(text)}catch(e){}
    if(!j||j.kind!=='backup'||!Array.isArray(j.hikes))throw Error('This file is not a Hike Planner backup.');
    const have=new Map((await HP.db.list()).map(m=>[m.id,m]));let added=0,updated=0,same=0;
    for(const h of j.hikes){const m=dec(h.meta),D=dec(h.plan);if(!m||!m.id||!D||!D.route)continue;const cur=have.get(m.id);
      if(cur&&(cur.updated||0)>=(m.updated||0)){same++;continue}
      // the map for no signal isn't in the file: a hike new to this phone has none; one already here keeps its own
      if(!cur){D.cover=0;D.topoTry=0;D.restored=Date.now();delete D.strip}else{const old=await HP.db.plan(m.id);if(old&&old.strip)D.strip=old.strip;else delete D.strip}D.id=m.id;
      await HP.db.putPlan(m.id,D);await HP.db.putMeta(m);if(cur)updated++;else added++}
    for(const[k,v]of Object.entries(j.ls||{})){if(!LS.includes(k)||typeof v!=='string')continue;try{
      if(k==='hp-inv'){const a=JSON.parse(localStorage.getItem(k)||'null'),b=JSON.parse(v);if(!a||!a.items){localStorage.setItem(k,v);continue}
        for(const[kind,items]of Object.entries(b.items||{})){const mine=a.items[kind]||(a.items[kind]=[]);for(const it of items||[])if(it&&it.name&&!mine.some(x=>x.name===it.name))mine.push(it)}
        localStorage.setItem(k,JSON.stringify(a))}
      else if(!localStorage.getItem(k))localStorage.setItem(k,v)}catch(e){}}
    return{added,updated,same,total:j.hikes.length}}
  return{make,restore,enc,dec}})();

HP.toast=(msg,ms=3200)=>{const t=$('#toast');if(!t)return;const M=HP.motion;t.textContent=msg;if(M)M.open(t);else t.hidden=false;clearTimeout(t._h);t._h=setTimeout(()=>{if(M)M.close(t);else t.hidden=true},ms)};
})();

/* ---------- topographic maps: the Swiss national map inside Switzerland, Esri's Outdoor map elsewhere, OpenTopoMap when Esri can't answer ---------- */
// The owner's ArcGIS Location Platform key (free tier, pay-as-you-go off: past the allowance the service answers with an error, never a bill).
// It allows basemaps only: World Imagery close-ups in the 3D view, and the Outdoor map from the Static Basemap Tiles service.
HP.ESRI_KEY='AAPTaeWnjK3eBR4wrcT5-LAgFWg..DondMwmab5TQtawxEoLPSVJARXpeBr7jV05xOwmRQFh9BdRE0beQz6gPqNhHBy_QTIu0NU31-40eG8xm_exWbu9MT3VHPuHW67DvPqdW_1sN76hm5XdWjTNlnMTKJKco-IqTstbsx9dmoOztq5hWkmd05ip9_IT01T3D6mWeflgz2tKMVVt9kFzb1NklXOTMGIL6Z-dCO27fhpqBtGcTFAKBkTnjpNoZg3iXW63iCOem4CcX6DPwBN1tU6mJnwtlTgQzAT1_OQqgxG7f';
(function(){
// Switzerland's border, simplified (OpenStreetMap through Nominatim, about 500 m), as lon,lat pairs; Liechtenstein is a box
const CH=[5.956,46.132,5.994,46.145,6.035,46.134,6.052,46.151,6.136,46.142,6.222,46.201,6.295,46.225,6.310,46.256,6.260,46.252,6.238,46.278,6.249,46.302,6.220,46.312,6.253,46.360,6.335,46.404,6.426,46.416,6.519,46.456,6.682,46.454,6.821,46.427,6.806,46.379,6.771,46.354,6.865,46.280,6.804,46.205,6.813,46.182,6.792,46.163,6.797,46.139,6.900,46.124,6.882,46.095,6.892,46.074,6.872,46.051,6.891,46.043,6.937,46.064,6.985,46.005,7.011,45.997,7.024,45.979,7.008,45.969,7.037,45.955,7.044,45.923,7.101,45.859,7.154,45.879,7.196,45.860,7.216,45.889,7.257,45.888,7.294,45.922,7.386,45.897,7.475,45.936,7.471,45.947,7.499,45.962,7.543,45.957,7.550,45.987,7.579,45.986,7.589,45.971,7.664,45.976,7.710,45.948,7.720,45.924,7.748,45.941,7.800,45.917,7.864,45.917,7.877,45.927,7.877,45.974,7.909,45.997,7.989,45.996,8.012,46.012,8.012,46.031,8.035,46.044,8.022,46.069,8.035,46.101,8.108,46.112,8.115,46.130,8.155,46.148,8.166,46.182,8.139,46.226,8.083,46.257,8.086,46.267,8.138,46.302,8.199,46.302,8.224,46.334,8.263,46.346,8.264,46.364,8.313,46.377,8.316,46.399,8.289,46.408,8.307,46.426,8.446,46.464,8.466,46.444,8.457,46.423,8.471,46.396,8.465,46.334,8.428,46.298,8.456,46.264,8.445,46.249,8.532,46.218,8.574,46.164,8.603,46.155,8.593,46.143,8.612,46.122,8.648,46.123,8.714,46.097,8.742,46.122,8.760,46.102,8.806,46.101,8.852,46.076,8.855,46.062,8.786,45.989,8.831,45.988,8.894,45.959,8.893,45.931,8.945,45.867,8.912,45.830,8.956,45.843,9.017,45.818,9.089,45.901,9.019,45.928,9.014,45.961,8.989,45.970,9.028,45.994,9.010,46.037,9.078,46.065,9.090,46.087,9.073,46.118,9.183,46.170,9.221,46.229,9.248,46.234,9.250,46.267,9.299,46.328,9.296,46.356,9.276,46.368,9.280,46.414,9.248,46.433,9.247,46.447,9.278,46.462,9.282,46.496,9.364,46.509,9.376,46.485,9.412,46.467,9.464,46.509,9.461,46.485,9.449,46.484,9.466,46.470,9.461,46.376,9.496,46.364,9.550,46.302,9.635,46.286,9.677,46.303,9.710,46.292,9.737,46.351,9.777,46.335,9.907,46.381,9.925,46.366,9.958,46.379,9.996,46.351,9.980,46.323,10.000,46.313,9.996,46.285,10.056,46.266,10.061,46.248,10.044,46.230,10.070,46.217,10.132,46.225,10.177,46.258,10.106,46.342,10.129,46.361,10.128,46.378,10.162,46.388,10.167,46.408,10.143,46.428,10.080,46.421,10.042,46.443,10.054,46.465,10.044,46.540,10.101,46.583,10.102,46.611,10.193,46.626,10.215,46.617,10.239,46.635,10.259,46.610,10.246,46.575,10.287,46.570,10.296,46.550,10.418,46.551,10.453,46.531,10.471,46.543,10.492,46.615,10.446,46.641,10.402,46.637,10.382,46.684,10.416,46.709,10.401,46.734,10.443,46.754,10.423,46.788,10.458,46.816,10.472,46.849,10.465,46.884,10.489,46.938,10.426,46.957,10.427,46.976,10.385,47.000,10.347,46.990,10.328,46.954,10.309,46.950,10.316,46.925,10.241,46.931,10.226,46.896,10.233,46.866,10.105,46.841,10.087,46.861,10.051,46.864,10.018,46.902,9.876,46.935,9.871,46.963,9.892,46.990,9.871,47.010,9.876,47.021,9.836,47.013,9.682,47.062,9.559,47.048,9.540,47.065,9.476,47.052,9.472,47.065,9.519,47.097,9.486,47.181,9.531,47.271,9.588,47.317,9.606,47.352,9.674,47.384,9.644,47.434,9.659,47.452,9.595,47.463,9.562,47.496,9.559,47.542,9.496,47.551,9.395,47.620,9.257,47.659,9.176,47.654,9.024,47.687,8.894,47.648,8.851,47.681,8.852,47.698,8.873,47.704,8.819,47.713,8.807,47.738,8.770,47.718,8.769,47.707,8.810,47.693,8.788,47.676,8.728,47.693,8.736,47.716,8.711,47.730,8.741,47.748,8.727,47.762,8.689,47.758,8.681,47.787,8.657,47.800,8.653,47.773,8.632,47.758,8.619,47.798,8.568,47.808,8.562,47.793,8.577,47.782,8.484,47.771,8.451,47.740,8.455,47.722,8.405,47.698,8.421,47.684,8.406,47.674,8.466,47.657,8.474,47.638,8.476,47.650,8.532,47.646,8.527,47.660,8.561,47.670,8.607,47.672,8.629,47.649,8.596,47.643,8.605,47.614,8.583,47.596,8.562,47.600,8.575,47.612,8.558,47.624,8.516,47.634,8.508,47.618,8.457,47.602,8.467,47.584,8.495,47.581,8.464,47.572,8.330,47.571,8.292,47.609,8.227,47.605,8.206,47.621,8.110,47.583,8.089,47.558,7.960,47.558,7.944,47.544,7.912,47.551,7.892,47.587,7.823,47.588,7.796,47.557,7.693,47.532,7.634,47.561,7.686,47.566,7.672,47.587,7.694,47.601,7.646,47.597,7.619,47.577,7.589,47.590,7.585,47.576,7.499,47.540,7.531,47.528,7.522,47.514,7.498,47.521,7.510,47.506,7.502,47.491,7.472,47.480,7.433,47.497,7.421,47.480,7.456,47.471,7.403,47.435,7.330,47.442,7.247,47.420,7.233,47.439,7.170,47.443,7.201,47.494,6.983,47.495,7.002,47.454,6.940,47.433,6.938,47.406,6.913,47.405,6.879,47.353,7.016,47.373,7.050,47.361,7.057,47.334,7.010,47.325,7.016,47.313,6.996,47.296,6.941,47.287,6.956,47.243,6.841,47.171,6.858,47.165,6.850,47.156,6.703,47.082,6.692,47.067,6.719,47.051,6.618,46.992,6.496,46.974,6.433,46.929,6.465,46.890,6.460,46.851,6.431,46.812,6.458,46.789,6.452,46.774,6.282,46.691,6.110,46.576,6.157,46.545,6.073,46.465,6.086,46.444,6.064,46.416,6.170,46.366,6.102,46.285,6.124,46.251,5.975,46.215,5.964,46.197,5.995,46.182];
const inPoly=(lon,lat)=>{let c=false;for(let i=0,n=CH.length/2,j=n-1;i<n;j=i++){const x1=CH[2*i],y1=CH[2*i+1],x2=CH[2*j],y2=CH[2*j+1];if((y1>lat)!==(y2>lat)&&lon<(x2-x1)*(lat-y1)/(y2-y1)+x1)c=!c}return c};
const inCH=(lat,lon)=>lat>47.04&&lat<47.28&&lon>9.47&&lon<9.64||lat>45.8&&lat<47.81&&lon>5.95&&lon<10.5&&inPoly(lon,lat);
const OUTDOOR='https://static-map-tiles-api.arcgis.com/arcgis/rest/services/static-basemap-tiles-service/v1/arcgis/outdoor/static/tile';
const T1='data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
HP.maps={inCH,
  // a box wholly inside Switzerland or Liechtenstein (its corners, the middles of its sides and its centre): there the Swiss map
  // has its full detail (outside it is blank at close range)
  boxCH:(s,w,n,e)=>{const a=(s+n)/2,o=(w+e)/2;return inCH(s,w)&&inCH(s,e)&&inCH(n,w)&&inCH(n,e)&&inCH(a,o)&&inCH(s,o)&&inCH(n,o)&&inCH(a,w)&&inCH(a,e)},
  swiss:(z,x,y)=>`https://wmts.geo.admin.ch/1.0.0/ch.swisstopo.pixelkarte-farbe/default/current/3857/${z}/${x}/${y}.jpeg`,
  // 512-pixel tiles: level z covers the area of a 256-pixel tile at z, with the detail of z+1
  outdoor:(z,x,y)=>`${OUTDOOR}/${z}/${y}/${x}?token=${HP.ESRI_KEY}`,
  otm:(z,x,y)=>`https://${'abc'[(x+y)%3]}.tile.opentopomap.org/${z}/${x}/${y}.png`,
  CREDIT:{swiss:'Map © swisstopo',outdoor:'Powered by Esri · Esri, TomTom, Garmin, FAO, NOAA, USGS, © OpenStreetMap contributors, and the GIS User Community',otm:'Map © OpenStreetMap contributors, SRTM · style © OpenTopoMap (CC-BY-SA)'},
  // Esri's refusals are counted across the app (the 3D view, the planning map, the live guide): three in a row (an expired key,
  // the month's free allowance used up) turn Esri off for the visit, and the other maps show instead
  esriOff:false,esriBad:0,
  esriFail(){if(!this.esriOff&&++this.esriBad>=3)this.esriOff=true;return this.esriOff},
  esriOk(){this.esriBad=0},
  // the marked hiking routes of OpenStreetMap (Waymarked Trails), over the map while planning (since 2.3)
  routes(map){return L.tileLayer('https://tile.waymarkedtrails.org/hiking/{z}/{x}/{y}.png',{maxZoom:19,maxNativeZoom:17,minZoom:8,opacity:.9,zIndex:6,
    attribution:'Routes © waymarkedtrails.org (CC-BY-SA)'}).addTo(map)},
  // the Swiss map saved along a hike (HP.strip): read from the phone's storage only, never the network, in its own pane under the
  // live map, so it shows wherever the live tiles don't come (no signal); from zoom 14, as 128-pixel tiles one zoom closer
  stripLayer(map,id,pane){const SL=L.GridLayer.extend({createTile(c,done){const img=document.createElement('img');img.alt='';img.setAttribute('role','presentation');
      const fin=()=>done(null,img);HP.db.blob(`${id}:m:${c.z+1}/${c.x}/${c.y}`).then(b=>{if(!b){img.onload=img.onerror=fin;img.src=T1;return}
        const u=URL.createObjectURL(b);img.onload=img.onerror=()=>{URL.revokeObjectURL(u);fin()};img.src=u}).catch(()=>{img.onload=img.onerror=fin;img.src=T1});return img}});
    return new SL({pane,tileSize:128,minZoom:14,maxZoom:19,minNativeZoom:14,maxNativeZoom:16,updateWhenIdle:true}).addTo(map)},
  // the same maps on a Leaflet map (planning a hike, the live guide): from zoom 11 the Swiss map inside Switzerland, drawn at twice
  // its detail as on its own site, and Esri's Outdoor map around it; each tile comes from the one source that has it
  leaflet(map){const M=HP.maps,ZS=11,box=(l,c)=>{const b=l._tileCoordsToBounds(c);return[b.getSouth(),b.getWest(),b.getNorth(),b.getEast()]};
    const chAt=(l,c)=>c.z>=ZS&&M.boxCH(...box(l,c));
    const Sw=L.TileLayer.extend({getTileUrl(c){return chAt(this,c)?M.swiss(this._getZoomForUrl(),c.x,c.y):T1}});
    const Es=L.TileLayer.extend({getTileUrl(c){return chAt(this,c)?T1:M.outdoor(this._getZoomForUrl(),c.x,c.y)}});
    let es=null,otm=null,probing=0;
    // the credits of the maps in view only
    const ac=map.attributionControl,shown=new Set(),credit=()=>{if(!map._loaded)return;const b=map.getBounds(),s=b.getSouth(),w=b.getWest(),n=b.getNorth(),e=b.getEast(),c=map.getCenter(),z=map.getZoom()>=ZS;
      const anyCH=z&&[[s,w],[s,e],[n,w],[n,e],[c.lat,c.lng]].some(p=>inCH(p[0],p[1])),allCH=z&&M.boxCH(s,w,n,e);
      const want=new Set([...(anyCH?[M.CREDIT.swiss]:[]),...(!allCH?[otm?M.CREDIT.otm:M.CREDIT.outdoor]:[])]);
      if(ac){for(const t of shown)if(!want.has(t)){ac.removeAttribution(t);shown.delete(t)}for(const t of want)if(!shown.has(t)){ac.addAttribution(t);shown.add(t)}}};
    const toOTM=()=>{if(otm)return;if(es)map.removeLayer(es);otm=L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',{subdomains:'abc',maxZoom:19,maxNativeZoom:17}).addTo(map);otm.bringToBack();credit()};
    if(M.esriOff)toOTM();
    else{es=new Es('',{tileSize:512,zoomOffset:-1,maxZoom:19,maxNativeZoom:19}).addTo(map);es.on('tileload',()=>M.esriOk());
      // a picture that didn't come: ask once more to see why, and count it only when Esri itself said no (not when the phone is offline)
      es.on('tileerror',e=>{if(otm)return;if(M.esriOff)return toOTM();const u=e.tile&&e.tile.src;if(!navigator.onLine||probing>2||!u||u.startsWith('data:'))return;probing++;
        HP.fetchT(u,{mode:'cors',cache:'no-store'},10000,null).then(x=>{if(x.status!==404&&(!x.ok||!/^image\//.test(x.type))&&M.esriFail())toOTM()}).catch(()=>{}).finally(()=>probing--)})}
    const sw=new Sw('',{tileSize:128,zoomOffset:1,maxZoom:19,maxNativeZoom:17}).addTo(map);
    map.on('moveend zoomend',credit);map.whenReady(credit);return{sw,get es(){return es},get otm(){return otm}}}};
})();

