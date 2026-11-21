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

// network with a timeout
HP.fetchJSON=async(url,opt={},ms=30000)=>{const c=new AbortController(),t=setTimeout(()=>c.abort(),ms);
  try{const r=await fetch(url,{...opt,signal:c.signal});const txt=await r.text();if(!r.ok)throw Error((txt||r.statusText).slice(0,160));return JSON.parse(txt)}
  catch(e){if(e.name==='AbortError')throw Error('The server took too long to answer');throw e}finally{clearTimeout(t)}};

// storage: hikes (list data), plans (full data), blobs (map pictures)
HP.db=(()=>{let dbp=null;
  const open=()=>dbp||(dbp=new Promise((ok,no)=>{let r;try{r=indexedDB.open('hike-planner-3d',1)}catch(e){no(e);return}
    r.onupgradeneeded=()=>{const d=r.result;for(const s of['hikes','plans','blobs'])if(!d.objectStoreNames.contains(s))s==='hikes'?d.createObjectStore(s,{keyPath:'id'}):d.createObjectStore(s)};
    r.onsuccess=()=>ok(r.result);r.onerror=()=>no(r.error)}));
  const run=async(stores,mode,fn)=>{const d=await open();return new Promise((ok,no)=>{const t=d.transaction(stores,mode);let out;const q=fn(t);t.oncomplete=()=>ok(q&&'result'in q?q.result:out);t.onerror=()=>no(t.error);t.onabort=()=>no(t.error||Error('Storage was refused'))})};
  return{
    list:()=>run('hikes','readonly',t=>t.objectStore('hikes').getAll()),
    meta:id=>run('hikes','readonly',t=>t.objectStore('hikes').get(id)),
    plan:id=>run('plans','readonly',t=>t.objectStore('plans').get(id)),
    blob:k=>run('blobs','readonly',t=>t.objectStore('blobs').get(k)),
    save:(meta,plan,blobs)=>run(['hikes','plans','blobs'],'readwrite',t=>{t.objectStore('hikes').put(meta);if(plan)t.objectStore('plans').put(plan,meta.id);for(const[k,b]of Object.entries(blobs||{}))if(b)t.objectStore('blobs').put(b,meta.id+':'+k)}),
    putMeta:meta=>run('hikes','readwrite',t=>t.objectStore('hikes').put(meta)),
    putPlan:(id,plan)=>run('plans','readwrite',t=>t.objectStore('plans').put(plan,id)),
    remove:id=>run(['hikes','plans','blobs'],'readwrite',t=>{t.objectStore('hikes').delete(id);t.objectStore('plans').delete(id);for(const k of['topo','relief','sat','dem','cover','coverw'])t.objectStore('blobs').delete(id+':'+k)}),
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

HP.toast=(msg,ms=3200)=>{const t=$('#toast');if(!t)return;t.textContent=msg;t.hidden=false;clearTimeout(t._h);t._h=setTimeout(()=>{t.hidden=true},ms)};
})();
