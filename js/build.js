'use strict';
/* Hike Planner 3D: turns a route into a 3D plan on the phone (terrain, map, places, days, times, climate, forecast) */
(function(){
const {geo,u}=HP;
const Z=14;                                   // pixel grid of the 3D model (zoom 14)
const SAC={hiking:1,mountain_hiking:2,demanding_mountain_hiking:3,alpine_hiking:4,demanding_alpine_hiking:5,difficult_alpine_hiking:5};
const coarse=()=>matchMedia('(pointer: coarse)').matches;

/* ---------- routing along trails (BRouter, OpenStreetMap paths) ---------- */
HP.route=async function(points,signal){
  const ll=points.map(p=>p.lon.toFixed(6)+','+p.lat.toFixed(6)).join('|');
  const url=`https://brouter.de/brouter?lonlats=${ll}&profile=hiking-mountain&alternativeidx=0&format=geojson&profile:SAC_scale_limit=4&profile:SAC_scale_preferred=2&profile:hiking_routes_preference=1.0`;
  let txt;try{const r=await fetch(url,{signal});txt=await r.text()}catch(e){if(signal&&signal.aborted)throw e;throw Error('The trail router could not be reached. Check the connection.')}
  if(txt.trim()[0]!=='{')throw Error(/island|not mapped|no route/i.test(txt)?'No path found to one of the points. Move it closer to a trail.':'Routing failed: '+txt.slice(0,120));
  const f=JSON.parse(txt).features[0],co=f.geometry.coordinates,msgs=f.properties.messages||[],hdr=msgs[0]||[];
  const iLo=hdr.indexOf('Longitude'),iLa=hdr.indexOf('Latitude'),iT=hdr.indexOf('WayTags');
  const sac=new Uint8Array(co.length),km=new Map();co.forEach((c,k)=>{const s=Math.round(c[0]*1e6)+','+Math.round(c[1]*1e6);if(!km.has(s))km.set(s,[]);km.get(s).push(k)});
  let last=0;
  for(const m of msgs.slice(1)){const mm=/sac_scale=([a-z_]+)/.exec(String(m[iT]||'')),code=mm?SAC[mm[1]]||0:0;
    const ks=(km.get(Math.round(+m[iLo])+','+Math.round(+m[iLa]))||[]).filter(k=>k>=last),end=ks.length?ks[0]:last;
    for(let k=last;k<=end;k++)sac[k]=code;last=end}
  return{pts:co.map(c=>({lat:c[1],lon:c[0],e:c[2]})),sac,km:(+f.properties['track-length']||0)/1000,up:+f.properties['filtered ascend']||0}};

/* ---------- tiles ---------- */
async function getImage(url,signal){const r=await fetch(url,{signal,mode:'cors'});if(!r.ok)throw Error('HTTP '+r.status);const b=await r.blob();
  if(self.createImageBitmap){try{return await createImageBitmap(b,{colorSpaceConversion:'none',premultiplyAlpha:'none'})}catch(e){}}
  return await new Promise((ok,no)=>{const im=new Image();im.onload=()=>ok(im);im.onerror=()=>no(Error('bad image'));im.src=URL.createObjectURL(b)})}
async function loadTiles(list,conc,onEach,signal){let i=0,done=0;
  const work=async()=>{while(i<list.length){if(signal&&signal.aborted)throw Error('Cancelled');const t=list[i++];let im=null;
    for(let a=0;a<3&&!im;a++){try{im=await getImage(t.url,signal)}catch(e){if(signal&&signal.aborted)throw Error('Cancelled');await u.sleep(500*(a+1))}}
    onEach(t,im,++done)}};
  await Promise.all(Array.from({length:conc},work))}
const tileRange=(x0,y0,x1,y1)=>({tx0:Math.floor(x0/256),ty0:Math.floor(y0/256),tx1:Math.floor((x1-1)/256),ty1:Math.floor((y1-1)/256)});
const tileCount=r=>(r.tx1-r.tx0+1)*(r.ty1-r.ty0+1);

async function loadDEM(bb,zd,prog,signal){
  const k=2**(zd-Z),r=tileRange(bb.x0*k,bb.y0*k,(bb.x0+bb.w)*k,(bb.y0+bb.h)*k),W=(r.tx1-r.tx0+1)*256,H=(r.ty1-r.ty0+1)*256;
  const cv=document.createElement('canvas');cv.width=W;cv.height=H;const cx=cv.getContext('2d',{willReadFrequently:true});
  const list=[];for(let x=r.tx0;x<=r.tx1;x++)for(let y=r.ty0;y<=r.ty1;y++)list.push({x,y,url:`https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${zd}/${x}/${y}.png`});
  let miss=0;await loadTiles(list,6,(t,im,done)=>{if(im){cx.drawImage(im,(t.x-r.tx0)*256,(t.y-r.ty0)*256);if(im.close)im.close()}else miss++;prog(done/list.length)},signal);
  if(miss>list.length*.2)throw Error('Terrain data could not be downloaded. Check the connection and try again.');
  const d=cx.getImageData(0,0,W,H).data,h=new Float32Array(W*H);cv.width=cv.height=0;
  for(let q=0;q<W*H;q++){const a=d[q*4+3];h[q]=a<128?NaN:d[q*4]*256+d[q*4+1]+d[q*4+2]/256-32768}
  let s=0,n=0;for(let q=0;q<h.length;q+=97)if(h[q]===h[q]){s+=h[q];n++}const fill=n?s/n:0;for(let q=0;q<h.length;q++)if(h[q]!==h[q]||h[q]<-500)h[q]=fill;
  return{h,W,H,ox:r.tx0*256,oy:r.ty0*256,k,at(px,py){ // px,py in zoom-14 pixels relative to the box
    const X=Math.min(Math.max((bb.x0+px)*k-this.ox-.5,0),W-1.001),Y=Math.min(Math.max((bb.y0+py)*k-this.oy-.5,0),H-1.001),c=Math.floor(X),rr=Math.floor(Y),fx=X-c,fy=Y-rr,q=rr*W+c;
    return h[q]*(1-fx)*(1-fy)+h[q+1]*fx*(1-fy)+h[q+W]*(1-fx)*fy+h[q+W+1]*fx*fy}}}

// satellite pictures: Sentinel-2 cloudless by EOX, free for personal use with this credit shown next to the picture
const SAT={year:2025,zmax:13,url:(z,x,y)=>`https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2025_3857/default/g/${z}/${y}/${x}.jpg`};
HP.SAT_CREDIT={text:'Sentinel-2 cloudless 2025 by EOX',href:'https://s2maps.eu',full:'Sentinel-2 cloudless - https://s2maps.eu by EOX IT Services GmbH (Contains modified Copernicus Sentinel data 2025)'};
const topoURL=(z,x,y)=>`https://${'abc'[(x+y)%3]}.tile.opentopomap.org/${z}/${x}/${y}.png`;
// the most detailed zoom whose tiles fit the limits
const pickZoom=(bb,zmax,maxTiles,maxW)=>{let z=zmax;while(z>9){const k=2**(z-Z),r=tileRange(bb.x0*k,bb.y0*k,(bb.x0+bb.w)*k,(bb.y0+bb.h)*k);if(tileCount(r)<=maxTiles&&bb.w*k<=maxW)break;z--}return z};
async function loadTopo(bb,zt,maxW,prog,signal,url=topoURL,bg='#eef0ea',q=.84){
  const k=2**(zt-Z),X0=bb.x0*k,Y0=bb.y0*k,W=bb.w*k,H=bb.h*k,f=Math.min(1,maxW/Math.max(W,H)),cw=Math.round(W*f),ch=Math.round(H*f);
  const cv=document.createElement('canvas');cv.width=cw;cv.height=ch;const cx=cv.getContext('2d');cx.fillStyle=bg;cx.fillRect(0,0,cw,ch);cx.imageSmoothingQuality='high';
  const r=tileRange(X0,Y0,X0+W,Y0+H),list=[];for(let x=r.tx0;x<=r.tx1;x++)for(let y=r.ty0;y<=r.ty1;y++)list.push({x,y,url:url(zt,x,y)});
  let miss=0;await loadTiles(list,6,(t,im,done)=>{if(im){const dx=Math.floor((t.x*256-X0)*f),dy=Math.floor((t.y*256-Y0)*f),dw=Math.ceil((t.x*256+256-X0)*f)-dx,dh=Math.ceil((t.y*256+256-Y0)*f)-dy;cx.drawImage(im,dx,dy,dw,dh);if(im.close)im.close()}else miss++;prog(done/list.length)},signal);
  if(miss>list.length*.35){cv.width=cv.height=0;return null}
  const b=await new Promise(ok=>cv.toBlob(ok,'image/jpeg',q));cv.width=cv.height=0;return b}
const loadSat=(bb,prog,signal)=>loadTopo(bb,pickZoom(bb,SAT.zmax,220,5200),coarse()?3072:4096,prog,signal,SAT.url,'#3d4a3c',.86);
// the heights at the full detail of the elevation tiles, kept with the hike for the shading of the 3D model
// (0.2 m steps above the lowest point, at the same zoom as the elevation tiles)
function demBlob(bb,dem){const k=dem.k,w=Math.max(2,Math.round(bb.w*k)),h=Math.max(2,Math.round(bb.h*k)),a=new Float32Array(w*h);let lo=1e9;
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){const v=dem.at((x+.5)/k,(y+.5)/k);a[y*w+x]=v;if(v<lo)lo=v}
  const q=new Uint16Array(w*h);for(let i=0;i<w*h;i++)q[i]=Math.max(0,Math.min(65535,Math.round((a[i]-lo)*5)));
  return{info:{w,h,min:Math.floor(lo),q:.2},blob:new Blob([q.buffer],{type:'application/octet-stream'})}}
const demZoom=bb=>{let zd=13;while(zd>9){const k=2**(zd-Z),r=tileRange(bb.x0*k,bb.y0*k,(bb.x0+bb.w)*k,(bb.y0+bb.h)*k);if(tileCount(r)<=36&&bb.w*k<=2800)break;zd--}return zd};
// saved hikes from before version 1.4 get the satellite picture and the detailed heights the first time they open with a connection
HP.fetchExtras=async function(D,need,prog,signal){const bb={x0:D.x0,y0:D.y0,w:D.w,h:D.h},out={},parts=[];let fs=0,fd=0;const tell=()=>prog&&prog((need.sat?fs:0)*.75+(need.dem?fd:0)*.25,need);
  if(need.dem)parts.push(loadDEM(bb,demZoom(bb),f=>{fd=f;tell()},signal).then(dem=>{const r=demBlob(bb,dem);out.dem=r.blob;out.demInfo=r.info}));
  if(need.sat)parts.push(loadSat(bb,f=>{fs=f;tell()},signal).then(b=>{out.sat=b}));
  await Promise.all(parts);return out};

function reliefBlob(grid,mpp){
  const{cols,rows,step,h}=grid,S=Math.min(4,Math.floor(2400/(Math.max(cols,rows)-1))||1),w=(cols-1)*S+1,hh=(rows-1)*S+1;
  const cv=document.createElement('canvas');cv.width=w;cv.height=hh;const cx=cv.getContext('2d'),img=cx.createImageData(w,hh),d=img.data;
  let lo=1e9,hi=-1e9;for(let q=0;q<h.length;q++){if(h[q]<lo)lo=h[q];if(h[q]>hi)hi=h[q]}
  const H=(x,y)=>{const gx=Math.min(Math.max(x/S,0),cols-1.001),gy=Math.min(Math.max(y/S,0),rows-1.001),c=Math.floor(gx),r=Math.floor(gy),fx=gx-c,fy=gy-r,q=r*cols+c;return h[q]*(1-fx)*(1-fy)+h[q+1]*fx*(1-fy)+h[q+cols]*(1-fx)*fy+h[q+cols+1]*fx*fy};
  const stops=[[0,[160,196,140]],[600,[168,198,142]],[1200,[186,208,150]],[1700,[214,214,166]],[2100,[222,204,166]],[2500,[200,190,180]],[2900,[214,212,210]],[3300,[236,238,240]],[4500,[250,251,253]]];
  const tint=e=>{for(let k=1;k<stops.length;k++)if(e<=stops[k][0]){const a=stops[k-1],b=stops[k],t=(e-a[0])/(b[0]-a[0]);return a[1].map((v,c)=>v+(b[1][c]-v)*t)}return stops[stops.length-1][1]};
  const px=step*mpp/S,ci=hi-lo>1200?100:50,az=315*Math.PI/180,al=40*Math.PI/180;
  for(let y=0;y<hh;y++)for(let x=0;x<w;x++){const e=H(x,y),gx=(H(x+1,y)-H(x-1,y))/(2*px),gy=(H(x,y+1)-H(x,y-1))/(2*px),sl=Math.atan(Math.hypot(gx,gy)),asp=Math.atan2(gx,-gy);
    let s=Math.sin(al)*Math.cos(sl)+Math.cos(al)*Math.sin(sl)*Math.cos(az-asp);s=Math.max(0,Math.min(1,s));const c=tint(e),k=.4+.7*s,ct=Math.abs(((e+ci/2)%ci)-ci/2)<ci*.02?.84:1,q=(y*w+x)*4;
    d[q]=Math.min(255,c[0]*k*ct);d[q+1]=Math.min(255,c[1]*k*ct);d[q+2]=Math.min(255,c[2]*k*ct);d[q+3]=255}
  cx.putImageData(img,0,0);return new Promise(ok=>cv.toBlob(b=>{cv.width=cv.height=0;ok(b)},'image/jpeg',.84))}

/* ---------- route geometry ---------- */
function resample(pts,stepM){const n=pts.length,cum=new Float64Array(n);for(let i=1;i<n;i++)cum[i]=cum[i-1]+geo.hav(pts[i-1].lat,pts[i-1].lon,pts[i].lat,pts[i].lon);
  const L=cum[n-1],m=Math.max(2,Math.round(L/stepM)+1),lat=new Float64Array(m),lon=new Float64Array(m),src=new Int32Array(m);let j=0;
  for(let k=0;k<m;k++){const d=L*k/(m-1);while(j<n-2&&cum[j+1]<d)j++;const sg=cum[j+1]-cum[j],f=sg>0?Math.min(1,Math.max(0,(d-cum[j])/sg)):0;lat[k]=pts[j].lat+(pts[j+1].lat-pts[j].lat)*f;lon[k]=pts[j].lon+(pts[j+1].lon-pts[j].lon)*f;src[k]=j+1}
  return{lat,lon,src,L,m}}
const smooth=(a,sig=2.5,R=8)=>{const k=[];let s=0;for(let i=-R;i<=R;i++){const v=Math.exp(-.5*(i/sig)**2);k.push(v);s+=v}const n=a.length,o=new Float32Array(n);for(let i=0;i<n;i++){let t=0;for(let j=-R;j<=R;j++)t+=a[Math.min(n-1,Math.max(0,i+j))]*k[j+R];o[i]=t/s}return o};
const climb=(e,a,b)=>{let up=0,dn=0,ref=e[a];for(let i=a+1;i<=b;i++){const v=e[i];if(v-ref>=5){up+=v-ref;ref=v}else if(ref-v>=5){dn+=ref-v;ref=v}}return{up,dn}};

/* ---------- places from OpenStreetMap ---------- */
async function fetchPOIs(b,signal){
  const bb=`${b.s.toFixed(4)},${b.w.toFixed(4)},${b.n.toFixed(4)},${b.e.toFixed(4)}`;
  const q=`[out:json][timeout:25];(node["natural"="peak"]["name"](${bb});node["mountain_pass"="yes"]["name"](${bb});node["natural"="saddle"]["name"](${bb});nwr["tourism"~"^(alpine_hut|wilderness_hut|camp_site)$"]["name"](${bb});nwr["amenity"="shelter"]["name"](${bb});node["place"~"^(town|village|hamlet)$"]["name"](${bb});nwr["natural"="water"]["name"](${bb});node["natural"="spring"](${bb});node["amenity"="drinking_water"](${bb}););out center tags 2000;`;
  let err;for(const[host,ms]of[['https://overpass-api.de/api/interpreter',30000],['https://overpass.kumi.systems/api/interpreter',20000]]){
    try{return(await HP.fetchJSON(host,{method:'POST',body:'data='+encodeURIComponent(q),headers:{'Content-Type':'application/x-www-form-urlencoded'},signal},ms)).elements||[]}catch(e){if(signal&&signal.aborted)throw e;err=e}}
  throw err||Error('Places unavailable')}
const kindOf=t=>t.natural==='peak'?'peak':(t.mountain_pass==='yes'||t.natural==='saddle')?'pass':/alpine_hut|wilderness_hut/.test(t.tourism||'')?'hut':t.tourism==='camp_site'?'camp':t.amenity==='shelter'?'shelter':t.place?'village':t.natural==='water'?'lake':(t.natural==='spring'||t.amenity==='drinking_water')?'water':null;
const NEAR={peak:110,pass:220,hut:280,camp:280,shelter:220,village:500,lake:700,water:160};
async function placeName(lat,lon,signal){try{const j=await HP.fetchJSON(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat.toFixed(5)}&lon=${lon.toFixed(5)}&zoom=14&accept-language=en`,{signal},12000);const a=j.address||{};return a.village||a.hamlet||a.town||a.suburb||a.city||a.municipality||j.name||''}catch(e){if(signal&&signal.aborted)throw e;return''}}

/* ---------- climate statistics and forecast (Open-Meteo) ---------- */
const pct=(a,p)=>{if(!a.length)return NaN;const s=[...a].sort((x,y)=>x-y);return s[Math.min(s.length-1,Math.max(0,Math.round(p*(s.length-1))))]};
/* ---------- weather types and how likely each one is ---------- */
// The same types as the weather buttons in the 3D view. Valley fog has no percentage: the weather records and the
// forecast runs are too coarse (25 km squares) to tell a fog-filled valley from the sunny ridge above it.
HP.WXT={fair:{name:'Fair',short:'Fair',c:'#f2c641',ic:'sun',l:'f'},storm:{name:'Afternoon storms',short:'Storms',c:'#7b4fc9',ic:'storm',l:'s'},front:{name:'Rain front',short:'Rain',c:'#4d8fd4',ic:'rain',l:'r'},
  cloud:{name:'In the clouds',short:'Cloud',c:'#a3adb4',ic:'cloud',l:'c'},wind:{name:'Strong wind',short:'Wind',c:'#2aa198',ic:'wind',l:'w'},snow:{name:'Early snow',short:'Snow',c:'#9cc3ea',ic:'snow',l:'n'}};
HP.WXK=Object.keys(HP.WXT);const WXL={};for(const k of HP.WXK)WXL[HP.WXT[k].l]=k;
// one day at the high point of the route -> one type. p mm, ph hours of rain, sfPrev cm of snow in the 2 days before,
// g km/h gusts, sunF share of daylight with sun (or cc mean cloud %), cape J/kg, wc weather code, warm: warm air low down
HP.wxClass=o=>{const cloudy=o.sunF!=null?o.sunF<.3:o.cc>=78;
  if(o.wc>=95||(o.cape!=null&&o.cape>=600&&o.p>=1.5&&o.ph<=9)||(o.cape==null&&o.p>=2&&o.ph<=6&&!cloudy&&o.warm))return'storm';
  if(o.p>=8||(o.p>=3&&o.ph>=6)||(o.p>=1.5&&cloudy&&o.ph>=4))return'front';
  if(o.sfPrev>=2&&o.p<3)return'snow';
  if(o.g>=60)return'wind';
  if(cloudy)return'cloud';
  return'fair'};
// whole percentages that add up to 100
HP.wxPct=cnt=>{const n=HP.WXK.reduce((s,k)=>s+(cnt[k]||0),0);if(!n)return null;const raw=HP.WXK.map(k=>({k,v:(cnt[k]||0)/n*100}));
  raw.forEach(r=>{r.f=Math.floor(r.v);r.r=r.v-r.f});let left=100-raw.reduce((s,r)=>s+r.f,0);raw.slice().sort((a,b)=>b.r-a.r).forEach(r=>{if(left>0){r.f++;left--}});
  const o={};raw.forEach(r=>o[r.k]=r.f);return o};
HP.fetchClimate=async function(lat,lon,zlo,zhi,signal){
  const y1=new Date().getFullYear()-1,y0=y1-9,L=lat.toFixed(4),O=lon.toFixed(4);
  const url=`https://archive-api.open-meteo.com/v1/archive?latitude=${L},${L}&longitude=${O},${O}&elevation=${Math.round(zlo)},${Math.round(zhi)}&start_date=${y0}-01-01&end_date=${y1}-12-31&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_hours,snowfall_sum,sunshine_duration,daylight_duration,wind_gusts_10m_max,weather_code&timezone=auto`;
  const j=await HP.fetchJSON(url,{signal},90000),arr=Array.isArray(j)?j:[j];if(arr.length<2||!arr[0].daily)throw Error('No climate data');
  const m={};for(let k=1;k<=12;k++)m[k]={};
  arr.forEach((r,e)=>{const dd=r.daily,by={};dd.time.forEach((t,q)=>{const mo=+t.slice(5,7);(by[mo]||(by[mo]={x:[],n:[],p:[]}));if(dd.temperature_2m_max[q]!=null)by[mo].x.push(dd.temperature_2m_max[q]);if(dd.temperature_2m_min[q]!=null)by[mo].n.push(dd.temperature_2m_min[q]);if(dd.precipitation_sum[q]!=null)by[mo].p.push(dd.precipitation_sum[q])});
    for(let k=1;k<=12;k++){const b=by[k]||{x:[],n:[],p:[]},o=m[k],put=(key,v)=>{(o[key]||(o[key]=[0,0]))[e]=Math.round(v*10)/10};
      put('tx',b.x.reduce((s,v)=>s+v,0)/Math.max(1,b.x.length));put('tn',b.n.reduce((s,v)=>s+v,0)/Math.max(1,b.n.length));
      for(const[p,key]of[[.03,'tx03'],[.1,'tx10'],[.25,'tx25'],[.75,'tx75'],[.9,'tx90']])put(key,pct(b.x,p));for(const[p,key]of[[.1,'tn10'],[.25,'tn25'],[.75,'tn75']])put(key,pct(b.n,p));
      if(e===0&&b.p.length)o.wet=[Math.round(100*b.p.filter(v=>v>=1).length/b.p.length),Math.round(100*b.p.filter(v=>v>=10).length/b.p.length)]}});
  // the type of every day in the record, at the high point (one letter per day)
  const H=arr[1].daily,Lo=arr[0].daily,v=(a,q)=>a&&a[q]!=null?a[q]:NaN;let cls='';
  for(let q=0;q<H.time.length;q++){const p=v(H.precipitation_sum,q);if(p!==p){cls+='-';continue}
    const sf=k=>q-k>=0?(v(H.snowfall_sum,q-k)||0):0,dl=v(H.daylight_duration,q),sn=v(H.sunshine_duration,q);
    cls+=HP.WXT[HP.wxClass({p,ph:v(H.precipitation_hours,q)||0,sfPrev:sf(1)+sf(2),g:v(H.wind_gusts_10m_max,q)||0,sunF:dl>0&&sn===sn?sn/dl:null,cc:50,wc:v(H.weather_code,q)||0,warm:v(Lo.temperature_2m_max,q)>=17})].l}
  return{src:`ERA5 reanalysis via Open-Meteo, ${y0}–${y1}`,z:[Math.round(zlo),Math.round(zhi)],tz:arr[0].timezone||null,m,cls,cls0:H.time[0],years:[y0,y1]}};
// typical share of each type for a date: all days in the record within `half` days of that date in any year
HP.climProbs=(clim,date,half=15)=>{if(!clim||!clim.cls)return null;const doy=d=>{const x=u.parseDay(d);return Math.round((x-new Date(x.getFullYear(),0,1))/864e5)};
  const t=doy(date),c0=u.parseDay(clim.cls0),cnt={};let n=0;
  for(let q=0;q<clim.cls.length;q++){const k=WXL[clim.cls[q]];if(!k)continue;const x=new Date(c0.getFullYear(),c0.getMonth(),c0.getDate()+q),dy=Math.round((x-new Date(x.getFullYear(),0,1))/864e5);let dd=Math.abs(dy-t);dd=Math.min(dd,365-dd);if(dd>half)continue;cnt[k]=(cnt[k]||0)+1;n++}
  return n?{cnt,n}:null};
// the forecast as 51 slightly different runs of the ECMWF model: the share of runs that give each type is its chance
const EV='temperature_2m_max,precipitation_sum,precipitation_hours,snowfall_sum,wind_gusts_10m_max,cloud_cover_mean,cape_max';
HP.fetchEnsemble=async function(D,signal){
  const today=new Date();today.setHours(0,0,0,0);const last=new Date(today.getTime()+14*864e5),s0=u.parseDay(D.date);if(s0>last)return null;
  const R=D.route,locs=[],dayLoc=[];
  D.days.forEach((d,k)=>{let hi=d.i0;for(let i=d.i0;i<=d.i1;i++)if(R.e[i]>R.e[hi])hi=i;let j=locs.findIndex(q=>HP.geo.hav(R.lat[q],R.lon[q],R.lat[hi],R.lon[hi])<6000&&Math.abs(R.e[q]-R.e[hi])<250);if(j<0&&locs.length<5){locs.push(hi);j=locs.length-1}dayLoc[k]=j<0?locs.length-1:j});
  const st=new Date(s0.getTime()-2*864e5),en=new Date(Math.min(s0.getTime()+(D.days.length-1)*864e5,last.getTime()));
  const url=`https://ensemble-api.open-meteo.com/v1/ensemble?latitude=${locs.map(i=>R.lat[i].toFixed(4)).join(',')}&longitude=${locs.map(i=>R.lon[i].toFixed(4)).join(',')}&elevation=${locs.map(i=>Math.round(R.e[i])).join(',')}&models=ecmwf_ifs025&daily=${EV}&timezone=auto&start_date=${u.isoDay(st)}&end_date=${u.isoDay(en)}`;
  const j=await HP.fetchJSON(url,{signal},40000),arr=Array.isArray(j)?j:[j],days=[];let members=0;
  for(let k=0;k<D.days.length;k++){const d=u.isoDay(new Date(s0.getTime()+k*864e5)),r=arr[dayLoc[k]]||arr[0],dd=r&&r.daily;if(!dd)break;const t=dd.time.indexOf(d);if(t<0)break;
    const series=key=>Object.keys(dd).filter(x=>x===key||x.startsWith(key+'_member')).sort().map(x=>dd[x]);
    const P=series('precipitation_sum'),PH=series('precipitation_hours'),SF=series('snowfall_sum'),G=series('wind_gusts_10m_max'),CC=series('cloud_cover_mean'),CA=series('cape_max'),TX=series('temperature_2m_max');
    const cnt={};let n=0;
    for(let mI=0;mI<P.length;mI++){const p=P[mI][t];if(p==null)continue;const sf=k2=>t-k2>=0&&SF[mI]?(SF[mI][t-k2]||0):0;
      const k=HP.wxClass({p,ph:(PH[mI]||[])[t]||0,sfPrev:sf(1)+sf(2),g:(G[mI]||[])[t]||0,sunF:null,cc:(CC[mI]||[])[t]??50,cape:(CA[mI]||[])[t]??0,wc:0,warm:true});cnt[k]=(cnt[k]||0)+1;n++}
    if(!n)break;members=Math.max(members,n);days.push({d,cnt,n})}
  return days.length?{issued:Date.now(),model:'ECMWF',members,days}:null};
// the chance of each type on day k of a hike (k from 0): the forecast runs when the day is close enough, otherwise the record
HP.wxDay=(D,k)=>{const d=u.isoDay(new Date(u.parseDay(D.date).getTime()+k*864e5)),e=D.ens&&D.ens.days.find(x=>x.d===d);
  if(e)return{src:'ens',d,cnt:e.cnt,n:e.n,pct:HP.wxPct(e.cnt)};const c=HP.climProbs(D.clim,d);return c?{src:'clim',d,cnt:c.cnt,n:c.n,pct:HP.wxPct(c.cnt)}:null};
HP.wxTrip=D=>{const ds=D.days.map((_,k)=>HP.wxDay(D,k)).filter(Boolean);if(!ds.length)return null;const cnt={};
  ds.forEach(x=>HP.WXK.forEach(k=>cnt[k]=(cnt[k]||0)+(x.cnt[k]||0)/x.n));return{src:ds.every(x=>x.src==='ens')?'ens':ds.some(x=>x.src==='ens')?'mix':'clim',days:ds,pct:HP.wxPct(cnt)}};
HP.roughClimate=function(lat,zlo,zhi){const m={};
  for(let k=1;k<=12;k++){const T0=10.5+10.5*Math.sin(2*Math.PI*(k-4.2)/12)-.55*(lat-45),at=z=>{const mean=T0-.006*z,r=9-2*Math.min(1,z/3000);return[mean+r/2,mean-r/2]},a=at(zlo),b=at(zhi),s=3.6,o={};
    o.tx=[a[0],b[0]];o.tn=[a[1],b[1]];for(const[key,f]of[['tx03',-1.9],['tx10',-1.28],['tx25',-.67],['tx75',.67],['tx90',1.28]])o[key]=[a[0]+f*s,b[0]+f*s];for(const[key,f]of[['tn10',-1.28],['tn25',-.67],['tn75',.67]])o[key]=[a[1]+f*s*.8,b[1]+f*s*.8];o.wet=[40,12];m[k]=o}
  return{src:'a rough estimate, because climate data could not be downloaded',z:[Math.round(zlo),Math.round(zhi)],tz:null,m,rough:true}};
const FCV='temperature_2m,dew_point_2m,precipitation,snowfall,weather_code,cloud_cover_low,cloud_cover_mid,cloud_cover_high,wind_speed_10m,wind_gusts_10m,wind_direction_10m,freezing_level_height,cape,visibility,snow_depth';
const FCK={temperature_2m:'T',dew_point_2m:'Td',precipitation:'pr',snowfall:'sf',weather_code:'code',cloud_cover_low:'cl',cloud_cover_mid:'cm',cloud_cover_high:'ch',wind_speed_10m:'ws',wind_gusts_10m:'wg',wind_direction_10m:'wd',freezing_level_height:'fl',cape:'cape',visibility:'vis',snow_depth:'sd'};
HP.forecastWindow=date=>{const t=new Date();t.setHours(0,0,0,0);const d=u.parseDay(date),days=Math.round((d-t)/864e5);return{days,ok:days>=-1&&days<=15}};
HP.fetchForecast=async function(D,signal){
  const set=new Set();for(const d of D.days){set.add(d.i0);let hi=d.i0;for(let i=d.i0;i<=d.i1;i++)if(D.route.e[i]>D.route.e[hi])hi=i;set.add(hi);set.add(d.i1)}
  const idx=[...set].sort((a,b)=>a-b).slice(0,14),R=D.route;
  const today=new Date();today.setHours(0,0,0,0);const last=new Date(today.getTime()+15*864e5),end=new Date(Math.min(u.parseDay(D.date).getTime()+(D.days.length-1)*864e5,last.getTime()));
  const url=`https://api.open-meteo.com/v1/forecast?latitude=${idx.map(i=>R.lat[i].toFixed(4)).join(',')}&longitude=${idx.map(i=>R.lon[i].toFixed(4)).join(',')}&elevation=${idx.map(i=>Math.round(R.e[i])).join(',')}&hourly=${FCV}&timezone=auto&start_date=${D.date}&end_date=${u.isoDay(end)}`;
  const j=await HP.fetchJSON(url,{signal},30000),arr=Array.isArray(j)?j:[j];
  return{issued:Date.now(),tz:arr[0].timezone,start:arr[0].hourly.time[0],n:arr[0].hourly.time.length,pts:arr.map((r,k)=>{const h={};for(const[a,b]of Object.entries(FCK))h[b]=(r.hourly[a]||[]).map(v=>v==null?NaN:v);return{i:idx[k],z:Math.round(R.e[idx[k]]),h}})}};

/* ---------- days ---------- */
HP.splitDays=function(D,nDays,keep){ // keep: optional array of night indices to use as they are
  const R=D.route,m=R.x.length,seg=D.seg,cum=new Float64Array(m);for(let k=1;k<m;k++)cum[k]=cum[k-1]+seg[k-1];const T=cum[m-1];
  nDays=Math.max(1,Math.min(nDays,Math.floor(m/40)||1));let ends=[];
  if(keep&&keep.length===nDays-1)ends=keep.slice().sort((a,b)=>a-b);
  else if(nDays>1){
    const set=D.set||{},f=(set.pace||1)*(set.breaks===false?1:7/6),per=T*f/nDays,WILD=2.5,PEN={hut:0,camp:0,village:.4,wpt:.6,shelter:.8};
    const cand=[];for(const p of D.points)if(p.kind in PEN&&p.i>20&&p.i<m-21)cand.push({i:p.i,pen:PEN[p.kind]});
    for(let i=25;i<m-25;i+=25)cand.push({i,pen:WILD});cand.sort((a,b)=>a.i-b.i);
    const K=cand.length,cost=(a,b)=>{const h=(cum[b]-cum[a])*f;return 36*((h-per)/per)**2},from=[];
    let F=new Float64Array(K);for(let j=0;j<K;j++)F[j]=cost(0,cand[j].i)+cand[j].pen;from.push(null);
    for(let d=2;d<nDays;d++){const G=new Float64Array(K).fill(Infinity),fr=new Int32Array(K).fill(-1);
      for(let j=0;j<K;j++)for(let q=0;q<j;q++){if(cand[j].i-cand[q].i<30||F[q]===Infinity)continue;const v=F[q]+cost(cand[q].i,cand[j].i)+cand[j].pen;if(v<G[j]){G[j]=v;fr[j]=q}}
      F=G;from.push(fr)}
    let best=-1,bv=Infinity;for(let j=0;j<K;j++){if(m-1-cand[j].i<30||F[j]===Infinity)continue;const v=F[j]+cost(cand[j].i,m-1);if(v<bv){bv=v;best=j}}
    if(best<0){for(let d=1;d<nDays;d++)ends.push(Math.round((m-1)*d/nDays))}
    else{let j=best;for(let d=nDays-1;d>=1;d--){ends.unshift(cand[j].i);j=d>1?from[d-1][j]:-1}}}
  ends.push(m-1);const days=[];let i0=0;
  ends.forEach((i1,k)=>{const {up,dn}=climb(R.e,i0,i1);let mx=-1e9,mn=1e9;for(let i=i0;i<=i1;i++){mx=Math.max(mx,R.e[i]);mn=Math.min(mn,R.e[i])}
    for(let i=i0;i<=i1;i++){R.day[i]=k+1;R.t[i]=i===i0?0:R.t[i-1]+seg[i-1]}
    days.push({n:k+1,i0,i1,km:+(R.d[i1]-R.d[i0]).toFixed(1),up:Math.round(up/10)*10,down:Math.round(dn/10)*10,max:Math.round(mx),min:Math.round(mn),hours:+R.t[i1].toFixed(2)});i0=i1+1});
  D.days=days;HP.nameDays(D);return D};
HP.nameDays=function(D){const R=D.route,stop=/hut|camp|shelter|village|wpt|lake/;
  const campName=(i,n)=>{let best=null,bd=2.5;for(const p of D.points){if(p.kind==='water'||p.kind==='high')continue;const dd=Math.abs(R.d[p.i]-R.d[i]);if(dd<bd){bd=dd;best=p}}return best?`Camp near ${best.name}`:`Camp ${n}`};
  const name=i=>{let best=null,bs=1e9;for(const p of D.points){if(p.kind==='water'||p.kind==='high')continue;const st=stop.test(p.kind),dd=Math.abs(R.d[p.i]-R.d[i]);if(dd>(st?.9:.35))continue;const sc=dd+(st?0:.4);if(sc<bs){bs=sc;best=p}}return best?best.name:null};
  D.days.forEach((d,k)=>{d.from=k?D.days[k-1].to:(D.names.start||name(d.i0)||'Start');d.to=k===D.days.length-1?(D.names.end||name(d.i1)||'Finish'):(name(d.i1)||campName(d.i1,k+1))})};

/* ---------- the whole pipeline ---------- */
HP.buildPlan=async function(input,opts,progress,signal){
  const step=(k,f,note)=>progress&&progress(k,f,note);
  // 1. route
  step('route',.1);
  const rs=resample(input.pts,20),m=rs.m;
  if(rs.L<300)throw Error('The route is too short.');
  let la0=90,la1=-90,lo0=180,lo1=-180;for(let i=0;i<m;i++){la0=Math.min(la0,rs.lat[i]);la1=Math.max(la1,rs.lat[i]);lo0=Math.min(lo0,rs.lon[i]);lo1=Math.max(lo1,rs.lon[i])}
  const cLat=(la0+la1)/2,cLon=(lo0+lo1)/2,mpp=geo.mpp(cLat,Z);
  const ext=Math.max(geo.hav(la0,lo0,la0,lo1),geo.hav(la0,lo0,la1,lo0)),marg=Math.min(6000,Math.max(2500,ext*.18))/mpp;
  const x0=Math.floor(geo.x(lo0,Z)-marg),x1=Math.ceil(geo.x(lo1,Z)+marg),y0=Math.floor(geo.y(la1,Z)-marg),y1=Math.ceil(geo.y(la0,Z)+marg);
  // a squarer model shows more of the mountains around a long, thin route
  let bx0=x0,bx1=x1,by0=y0,by1=y1;{const w=bx1-bx0,h=by1-by0,lim=16000/mpp;if(w<h*.6){const a=Math.ceil(Math.min(h*.6-w,lim)/2);bx0-=a;bx1+=a}else if(h<w*.6){const a=Math.ceil(Math.min(w*.6-h,lim)/2);by0-=a;by1+=a}}
  const bb={x0:bx0,y0:by0,w:bx1-bx0,h:by1-by0};
  if(bb.w*mpp>140000||bb.h*mpp>140000)throw Error('This route covers more than about 120 km. Split it into shorter parts and plan each one.');
  step('route',1,`${(rs.L/1000).toFixed(1)} km`);
  // 2. terrain
  const dem=await loadDEM(bb,demZoom(bb),f=>step('terrain',f),signal),demR=demBlob(bb,dem);
  const GS=Math.max(4,Math.ceil(Math.max(bb.w,bb.h)/(coarse()?420:540))),cols=Math.floor((bb.w-1)/GS)+1,rows=Math.floor((bb.h-1)/GS)+1,gh=new Int16Array(cols*rows);
  let hmin=1e9,hmax=-1e9;for(let r=0;r<rows;r++)for(let c=0;c<cols;c++){const v=Math.round(dem.at(c*GS+.5,r*GS+.5));gh[r*cols+c]=v;if(v<hmin)hmin=v;if(v>hmax)hmax=v}
  const R={lat:rs.lat,lon:rs.lon,x:new Float32Array(m),y:new Float32Array(m),e:null,d:new Float32Array(m),t:new Float32Array(m),day:new Uint8Array(m),sac:new Uint8Array(m)};
  const raw=new Float32Array(m);for(let i=0;i<m;i++){R.x[i]=geo.x(rs.lon[i],Z)-bb.x0;R.y[i]=geo.y(rs.lat[i],Z)-bb.y0;raw[i]=dem.at(R.x[i],R.y[i]);R.d[i]=rs.L/1000*i/(m-1)}
  R.e=smooth(raw);
  const sacKnown=!!input.sac;if(sacKnown)for(let i=0;i<m;i++)R.sac[i]=input.sac[Math.min(input.sac.length-1,rs.src[i])]||0;
  const seg=new Float32Array(m-1),sl=rs.L/(m-1);for(let i=0;i<m-1;i++){const hz=sl/4000,de=R.e[i+1]-R.e[i],vt=de>0?de/300:-de/500;seg[i]=Math.max(hz,vt)+Math.min(hz,vt)/2}
  step('terrain',1,`${cols}×${rows} points`);
  // 3. map picture, in parallel with places
  let zt=15;while(zt>10){const k=2**(zt-Z),r=tileRange(bb.x0*k,bb.y0*k,(bb.x0+bb.w)*k,(bb.y0+bb.h)*k);if(tileCount(r)<=(coarse()?110:160)&&bb.w*k<=7000)break;zt--}
  let ft=0,fs=0;const mp=()=>step('map',(ft+fs)/2);
  const topoP=loadTopo(bb,zt,coarse()?3072:4096,f=>{ft=f;mp()},signal).catch(e=>{if(signal&&signal.aborted)throw e;return null});
  const satP=loadSat(bb,f=>{fs=f;mp()},signal).catch(e=>{if(signal&&signal.aborted)throw e;console.warn('satellite',e);return null});
  // 4. places
  step('places',.1);
  const box={s:geo.lat(bb.y0+bb.h,Z),n:geo.lat(bb.y0,Z),w:geo.lon(bb.x0,Z),e:geo.lon(bb.x0+bb.w,Z)};
  let els=[];try{els=await fetchPOIs(box,signal)}catch(e){if(signal&&signal.aborted)throw e;console.warn('places',e)}
  const kx=Math.cos(cLat*Math.PI/180)*111320,ky=110540;
  const near=(lat,lon)=>{let bi=0,bd=1e18;for(let i=0;i<m;i+=1){const dx=(R.lon[i]-lon)*kx,dy=(R.lat[i]-lat)*ky,dd=dx*dx+dy*dy;if(dd<bd){bd=dd;bi=i}}return{i:bi,d:Math.sqrt(bd)}};
  const points=[],official={},water=[],peaks=[],seen=new Set();
  for(const el of els){const t=el.tags||{},kind=kindOf(t);if(!kind)continue;const lat=el.lat??el.center?.lat,lon=el.lon??el.center?.lon;if(lat==null)continue;
    const nr=near(lat,lon),ele=parseFloat(String(t.ele||'').replace(',','.'));
    if(kind==='water'){if(nr.d<NEAR.water)water.push(nr.i);continue}
    const name=t['name:en']||t.name;if(!name)continue;
    if(kind==='peak'&&nr.d>NEAR.peak){peaks.push({name,lat,lon,ele:isFinite(ele)?ele:null});continue}
    if(nr.d>NEAR[kind]||seen.has(name))continue;seen.add(name);
    points.push({name,kind,i:nr.i,dist:nr.d});if((kind==='pass'||kind==='peak')&&isFinite(ele))official[name]=Math.round(ele)}
  for(const w of input.wpts||[]){const nr=near(w.lat,w.lon);if(nr.d<300&&!seen.has(w.name)){seen.add(w.name);points.push({name:w.name,kind:'wpt',i:nr.i,dist:nr.d})}}
  // a pass or summit on the route sits at the highest point near it
  for(const p of points)if(p.kind==='pass'||p.kind==='peak'){let b=p.i;for(let i=Math.max(0,p.i-12);i<=Math.min(m-1,p.i+12);i++)if(R.e[i]>R.e[b])b=i;p.i=b}
  let imax=0;for(let i=0;i<m;i++)if(R.e[i]>R.e[imax])imax=i;
  if(!points.some(p=>Math.abs(R.d[p.i]-R.d[imax])<.35&&(p.kind==='pass'||p.kind==='peak')))points.push({name:'High point',kind:'high',i:imax});
  // landmarks: the highest named summits off the route
  const landmarks=[];peaks.sort((a,b)=>(b.ele||0)-(a.ele||0));
  for(const p of peaks){const x=geo.x(p.lon,Z)-bb.x0,y=geo.y(p.lat,Z)-bb.y0;if(x<0||y<0||x>bb.w||y>bb.h)continue;if(landmarks.some(q=>Math.hypot(q.x-x,q.y-y)*mpp<3000))continue;
    const rr=Math.ceil(150/mpp);let bx=x,by=y,be=-1e9;for(let yy=y-rr;yy<=y+rr;yy+=rr/3)for(let xx=x-rr;xx<=x+rr;xx+=rr/3){const e=dem.at(xx,yy);if(e>be){be=e;bx=xx;by=yy}}
    landmarks.push({name:p.name,x:+bx.toFixed(1),y:+by.toFixed(1),e:Math.round(p.ele||be)});if(landmarks.length>=8)break}
  // start and finish names
  const names={start:input.names&&input.names.start||'',end:input.names&&input.names.end||''};
  const endNear=i=>{const sc=p=>Math.abs(R.d[p.i]-R.d[i])+(/village|hut|camp|lake|wpt/.test(p.kind)?0:.3);const c=points.filter(p=>p.kind!=='high'&&Math.abs(R.d[p.i]-R.d[i])<(/peak|pass/.test(p.kind)?.4:1.2)).sort((a,b)=>sc(a)-sc(b));return c.length?c[0].name:''};
  if(!names.start)names.start=endNear(0)||await placeName(R.lat[0],R.lon[0],signal);
  if(!names.end){const loop=geo.hav(R.lat[0],R.lon[0],R.lat[m-1],R.lon[m-1])<400;names.end=loop?names.start:(endNear(m-1)||await placeName(R.lat[m-1],R.lon[m-1],signal))}
  step('places',1,points.length?`${points.length} places on the way`:'no place names found');
  const topo=await topoP,sat=await satP;step('map',1,sat&&topo?'':sat?'satellite only':topo?'map only, no satellite picture':'map pictures unavailable; relief only');
  // 5. assemble, days and times
  const grid={step:GS,cols,rows,h:gh};
  const D={v:2,name:opts.name||`${names.start||'Hike'} to ${names.end||'finish'}`,date:opts.date,created:Date.now(),z:Z,w:bb.w,h:bb.h,mpp,x0:bb.x0,y0:bb.y0,center:{lat:cLat,lon:cLon},
    grid,dem:demR.info,route:R,seg,sacKnown,points:points.sort((a,b)=>a.i-b.i).map(({name,kind,i})=>({name,kind,i})),landmarks,official,water:[...new Set(water)].sort((a,b)=>a-b),names,terr:{min:hmin,max:hmax},
    set:{start:opts.start||'07:00',pace:+opts.pace||1,breaks:opts.breaks!==false,wx:'fair',mon:u.parseDay(opts.date).getMonth()+1,ex:1.5,map:sat?'sat':topo?'topo':'relief',color:'day'}};
  const total=seg.reduce((s,v)=>s+v,0)*D.set.pace;
  const nd=opts.days==='auto'||!opts.days?Math.max(1,Math.round(total/6.5)):+opts.days;
  HP.splitDays(D,nd);
  // 6. relief picture
  const relief=await reliefBlob(grid,mpp);
  // 7. climate and forecast
  step('weather',.15);
  let zlo=Math.max(0,Math.min(hmin,Math.min(...D.days.map(d=>d.min)))),zhi=Math.max(zlo+800,Math.max(...D.days.map(d=>d.max))+300);
  try{D.clim=await HP.fetchClimate(cLat,cLon,zlo,zhi,signal)}catch(e){if(signal&&signal.aborted)throw e;console.warn('climate',e);D.clim=HP.roughClimate(cLat,zlo,zhi)}
  step('weather',.6);
  D.tz=D.clim.tz;D.fc=null;
  if(HP.forecastWindow(D.date).ok){try{D.fc=await HP.fetchForecast(D,signal);D.tz=D.tz||D.fc.tz;D.set.wx='fc'}catch(e){if(signal&&signal.aborted)throw e;console.warn('forecast',e)}
    try{D.ens=await HP.fetchEnsemble(D,signal)}catch(e){if(signal&&signal.aborted)throw e;console.warn('forecast runs',e)}}
  step('weather',1,D.fc?'forecast and climate':D.clim.rough?'rough climate estimate':'climate statistics');
  return{D,blobs:{topo,relief,sat,dem:demR.blob}}};

/* ---------- a small picture for the list of hikes ---------- */
HP.thumb=async function(D,blob){try{const bm=await createImageBitmap(blob),W=360,H=Math.round(W*Math.min(.75,D.h/D.w)),cv=document.createElement('canvas');cv.width=W;cv.height=H;const cx=cv.getContext('2d');
  const s=Math.max(W/D.w,H/D.h),ox=(W-D.w*s)/2,oy=(H-D.h*s)/2;cx.drawImage(bm,ox,oy,D.w*s,D.h*s);if(bm.close)bm.close();
  cx.lineWidth=5;cx.strokeStyle='#fff';cx.lineJoin='round';const path=()=>{cx.beginPath();const R=D.route;for(let i=0;i<R.x.length;i+=3)i?cx.lineTo(ox+R.x[i]*s,oy+R.y[i]*s):cx.moveTo(ox+R.x[i]*s,oy+R.y[i]*s);cx.stroke()};path();cx.lineWidth=2.6;cx.strokeStyle='#d6262e';path();
  return cv.toDataURL('image/jpeg',.72)}catch(e){return''}};
})();
