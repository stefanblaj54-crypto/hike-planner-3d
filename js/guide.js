'use strict';
/* Hike Planner 3D: the live guide on the trail.
   A map that works offline (the hike's own map picture, sharper tiles when there is a connection), your position on the route,
   the next junction with the waymark to follow, an alarm and the way back when you leave the route, the time to the next place
   and to tonight's stop at your own pace, the daylight left, and the screen kept on. Nothing leaves the phone unless you share it. */
(function(){
const {$,esc,nf,fmtH,fmtClock}=HP.u;
let G=null;
const DIR8=['north','north-east','east','south-east','south','south-west','west','north-west'];
const dir8=b=>DIR8[Math.round((((b%360)+360)%360)/45)%8];
const fmtM=m=>m<950?`${Math.max(10,Math.round(m/10)*10)} m`:`${(m/1000).toFixed(m<9950?1:0)} km`;
const fmtT=h=>h<1/60?'now':h<1?`${Math.max(1,Math.round(h*60))} min`:fmtH(h).replace(' 00','');
const ARROW='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.5l6.5 17-6.5-4-6.5 4z"/></svg>';
const sndOn=()=>{try{return localStorage.getItem('hp-guide-snd')!=='0'}catch(e){return true}};

function open(){if(G)return true;const V=HP.viewer.state&&HP.viewer.state();if(!V)return false;
  const R=V.R,N=V.N,lat0=V.D.center.lat,lon0=V.D.center.lon,kx=Math.cos(lat0*Math.PI/180)*111320,ky=110540;
  const X=new Float64Array(N),Y=new Float64Array(N);for(let i=0;i<N;i++){X[i]=(R.lon[i]-lon0)*kx;Y[i]=(R.lat[i]-lat0)*ky}
  // walking hours from the start of the route, across the days, for your own pace
  const WA=new Float64Array(N);let base=0;for(const d of V.DAYS){for(let i=d.i0;i<=d.i1;i++)WA[i]=base+V.WALK[i];base+=V.WALK[d.i1]}
  const J=(V.T?V.T.junc:[]).filter(j=>j.key).sort((a,b)=>a.i-b.i);
  G={V,R,N,X,Y,WA,J,kx,ky,lat0,lon0,k:-1,along:0,im:0,d:0,off:false,offN:0,backN:0,maxAlong:-1,follow:true,track:[],hist:[],fix:null,said:new Set(),err:null,heading:null,snd:sndOn(),sos:false};
  const el=$('#guide');el.hidden=false;document.body.classList.add('guiding');
  try{localStorage.setItem('hp-guide',JSON.stringify({id:V.D.id,t:Date.now()}))}catch(e){}
  initMap();audioInit();keepAwake();startGPS();render();
  // the map's credits sit just above the panel
  G.ro=new ResizeObserver(()=>{$('#guide').style.setProperty('--gph',$('#gpanel').offsetHeight+'px')});G.ro.observe($('#gpanel'));
  document.addEventListener('visibilitychange',onVis);G.tick=setInterval(()=>render(),15000);
  return true}
function close(){if(!G)return;const g=G;G=null;
  if(g.watch!=null)navigator.geolocation.clearWatch(g.watch);clearInterval(g.tick);document.removeEventListener('visibilitychange',onVis);
  if(g.lock)g.lock.release().catch(()=>{});if(g.ac)g.ac.close().catch(()=>{});if(g.compass)removeEventListener(g.compass,onOrient,true);
  if(g.ro)g.ro.disconnect();if(g.map)g.map.remove();if(g.picURL)URL.revokeObjectURL(g.picURL);
  $('#guide').hidden=true;$('#gmap').innerHTML='';document.body.classList.remove('guiding');
  try{localStorage.removeItem('hp-guide')}catch(e){}}

/* ---------- the map ---------- */
function initMap(){const V=G.V,D=V.D,R=G.R,geo=HP.geo;
  const map=L.map('gmap',{zoomControl:false,maxZoom:19,minZoom:9,tapTolerance:18,zoomSnap:.5,attributionControl:true});map.attributionControl.setPrefix(false);G.map=map;
  // the hike's own map picture, kept with it: the map works with no connection
  const pic=V.BLOBS.topo||V.BLOBS.sat;
  if(pic){G.picURL=URL.createObjectURL(pic);const n=geo.lat(D.y0,D.z),s=geo.lat(D.y0+D.h,D.z),w=geo.lon(D.x0,D.z),e=geo.lon(D.x0+D.w,D.z);
    // under the live map tiles, so it shows wherever they don't (without a connection)
    map.createPane('pic').style.zIndex=150;
    const ov=L.imageOverlay(G.picURL,[[s,w],[n,e]],{pane:'pic',interactive:false,attribution:V.BLOBS.topo?(V.D.topoSrc==='swisstopo'?'Offline map © swisstopo':'Offline map © OpenStreetMap contributors, SRTM · style © OpenTopoMap (CC-BY-SA)'):'Sentinel-2 cloudless by EOX (Copernicus Sentinel data 2025)'}).addTo(map);
    ov.on('load',()=>{const im=ov.getElement();if(G&&im&&im.naturalWidth)G.picZ=D.z+Math.log2(im.naturalWidth/D.w)})}
  addTiles();
  for(const d of V.DAYS){const ll=[];for(let i=d.i0;i<=d.i1;i++)ll.push([R.lat[i],R.lon[i]]);
    L.polyline(ll,{color:'#0b0d0c',weight:10,opacity:.45,interactive:false}).addTo(map);L.polyline(ll,{color:d.color,weight:5.5,opacity:.95,interactive:false}).addTo(map)}
  for(const j of G.J)L.circleMarker([R.lat[j.i],R.lon[j.i]],{radius:4.5,color:'#0b0d0c',weight:2,fillColor:'#fff',fillOpacity:1,interactive:false}).addTo(map);
  V.DAYS.forEach((d,k)=>{const i=d.i1;L.circleMarker([R.lat[i],R.lon[i]],{radius:7,color:'#0b0d0c',weight:2,fillColor:d.color,fillOpacity:1,interactive:false}).addTo(map)
    .bindTooltip(k<V.DAYS.length-1?`Night ${d.n}: ${esc(d.to)}`:`Finish: ${esc(d.to)}`,{permanent:true,direction:'right',offset:[8,0],className:'gtip'})});
  G.trackL=L.polyline([],{color:'#4dabf7',weight:3,opacity:.9,dashArray:'2 7',lineCap:'round',interactive:false}).addTo(map);
  G.offL=L.polyline([],{color:'#ff5a5f',weight:3,dashArray:'6 6',interactive:false}).addTo(map);
  G.accC=L.circle([R.lat[0],R.lon[0]],{radius:1,color:'#4dabf7',weight:1,opacity:.5,fillColor:'#4dabf7',fillOpacity:.12,interactive:false});
  G.me=L.marker([R.lat[0],R.lon[0]],{icon:L.divIcon({className:'gme',html:'<i class="cone"></i><b></b>',iconSize:[22,22],iconAnchor:[11,11]}),interactive:false,keyboard:false,zIndexOffset:1000});
  // start on today's part of the route; the map follows you once your position comes in
  const day=todayDay(),d=V.DAYS[(day||1)-1],b=L.latLngBounds([]);for(let i=d.i0;i<=d.i1;i+=3)b.extend([R.lat[i],R.lon[i]]);map.fitBounds(b,{padding:[30,30]});
  map.on('dragstart',()=>{if(G&&G.follow){G.follow=false;render()}});
  addEventListener('online',addTiles)}
// sharper map tiles when there is a connection: the Swiss national map in Switzerland, Esri's Outdoor map elsewhere
function addTiles(){if(!G||G.tiles||!navigator.onLine)return;G.tiles=HP.maps.leaflet(G.map)}

/* ---------- position ---------- */
function startGPS(){if(!('geolocation'in navigator)){G.err='none';return}
  G.watch=navigator.geolocation.watchPosition(p=>{const c=p.coords;onFix({lat:c.latitude,lon:c.longitude,acc:c.accuracy||999,alt:c.altitude,hd:c.heading,sp:c.speed,t:p.timestamp||Date.now()})},
    e=>{if(!G)return;G.err=e.code===1?'denied':e.code===3?'slow':'nofix';render()},{enableHighAccuracy:true,maximumAge:2000,timeout:30000})}
// the nearest point of the route between points a and b: segment, how far along it, distance in metres
function nearest(x,y,a,b){let best={d:1e12,i:a,t:0};for(let i=a;i<b;i++){const ax=G.X[i],ay=G.Y[i],dx=G.X[i+1]-ax,dy=G.Y[i+1]-ay,L2=dx*dx+dy*dy,t=L2?Math.max(0,Math.min(1,((x-ax)*dx+(y-ay)*dy)/L2)):0,d=Math.hypot(ax+t*dx-x,ay+t*dy-y);if(d<best.d)best={d,i,t}}return best}
// with no earlier position: of the near parts of the route, today's part, else the earliest
function firstMatch(x,y){const all=nearest(x,y,0,G.N-1),day=todayDay();let pick=null;
  for(let i=0;i<G.N-1;i++){const m=nearest(x,y,i,i+1);if(m.d>all.d+25)continue;if(!pick)pick=m;if(day&&G.R.day[i]===day&&G.R.day[pick.i]!==day)pick=m;
    while(i<G.N-2&&nearest(x,y,i+1,i+2).d<=all.d+25)i++}
  return pick||all}
function onFix(f){if(!G)return;G.err=null;const first=!G.fix;G.fix=f;const R=G.R,N=G.N,x=(f.lon-G.lon0)*G.kx,y=(f.lat-G.lat0)*G.ky;
  let m=G.k>=0?nearest(x,y,Math.max(0,G.k-40),Math.min(N-1,G.k+160)):firstMatch(x,y);
  if(G.k>=0&&m.d>Math.max(120,2*f.acc)){const g=nearest(x,y,0,N-1);if(g.d<m.d-30)m=g}
  const i=m.i,j=Math.min(N-1,i+1);G.k=i;G.d=m.d;G.along=R.d[i]+(R.d[j]-R.d[i])*m.t;G.im=m.t<.5?i:j;
  G.nlat=R.lat[i]+(R.lat[j]-R.lat[i])*m.t;G.nlon=R.lon[i]+(R.lon[j]-R.lon[i])*m.t;
  G.toRoute=Math.atan2((G.nlon-f.lon)*G.kx,(G.nlat-f.lat)*G.ky)*180/Math.PI;G.fwd=Math.atan2(G.X[j]-G.X[i],G.Y[j]-G.Y[i])*180/Math.PI;
  // off the route: three positions in a row further than the signal allows; a weak signal never raises the alarm
  const weak=f.acc>50,tol=Math.max(40,2*f.acc);
  if(!weak&&m.d>tol){if(++G.offN>=3&&!G.off){G.off=true;alarm('off')}}
  else if(m.d<Math.max(25,f.acc*1.2)){if(G.off){G.off=false;alarm('back')}G.offN=0}
  // walking back the way you came
  const dA=first?0:G.along-G.prevAlong;G.prevAlong=G.along;
  if(!G.off&&!first&&G.maxAlong-G.along>.1&&dA<-.004)G.backN++;else if(dA>.004||G.off)G.backN=0;if(first||G.along>G.maxAlong)G.maxAlong=G.along;
  // your own pace: actual time against the plan's walking time over the last half hour or more
  G.hist.push([f.t,G.along,G.WA[G.im]]);while(G.hist.length>2&&f.t-G.hist[0][0]>75*6e4)G.hist.shift();
  const h0=G.hist[0];G.pace=null;if(!G.off&&f.t-h0[0]>25*6e4&&G.along-h0[1]>.4&&G.WA[G.im]-h0[2]>.1)G.pace=Math.max(.6,Math.min(2.2,(f.t-h0[0])/36e5/(G.WA[G.im]-h0[2])));
  const tl=G.track[G.track.length-1];if(!tl||Math.hypot((f.lat-tl[0])*G.ky,(f.lon-tl[1])*G.kx)>6){G.track.push([f.lat,f.lon]);if(G.track.length>20000)G.track.splice(0,5000)}
  if(f.hd!=null&&!isNaN(f.hd)&&(f.sp||0)>.6)G.gpsHd=f.hd;
  // a chime as you come to a junction
  const nj=nextJ();if(nj&&!G.off&&(R.d[nj.i]-G.along)*1000<45&&!G.said.has(nj.i)){G.said.add(nj.i);alarm('turn')}
  render(first)}
function nextJ(){const a=G.along+.004;for(const j of G.J)if(G.R.d[j.i]>a)return j;return null}
function todayDay(){const V=G.V,d0=HP.u.parseDay(V.D.date),t=HP.u.parseDay(HP.u.isoDay(new Date())),n=Math.round((t-d0)/864e5)+1;return n>=1&&n<=V.DAYS.length?n:null}
function nowH(){const lon=G.R.lon[G.im];return((Date.now()/36e5+HP.tzOffset(G.V.D.tz,new Date(),lon))%24+24)%24}

/* ---------- sound, the screen, the compass ---------- */
function audioInit(){try{const A=window.AudioContext||window.webkitAudioContext;if(A){G.ac=new A();if(G.ac.state==='suspended')G.ac.resume().catch(()=>{})}}catch(e){}}
function tone(seq){const ac=G&&G.ac;if(!ac||!G.snd)return;if(ac.state==='suspended')ac.resume().catch(()=>{});let t=ac.currentTime+.03;
  for(const[f,d]of seq){const o=ac.createOscillator(),g=ac.createGain();o.type='triangle';o.frequency.value=f;g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(.5,t+.02);g.gain.exponentialRampToValueAtTime(.001,t+d);o.connect(g);g.connect(ac.destination);o.start(t);o.stop(t+d+.05);t+=d+.07}}
function alarm(k){if(!G)return;G.lastAlarm=k;const vib=p=>{try{if(G.snd&&navigator.vibrate)navigator.vibrate(p)}catch(e){}};
  if(k==='off'){tone([[880,.22],[622,.3],[880,.22],[622,.4]]);vib([300,120,300,120,300])}
  else if(k==='back')tone([[660,.14],[990,.24]]);
  else if(k==='turn'){tone([[784,.16],[1047,.22]]);vib(120)}}
async function keepAwake(){if(!G||!('wakeLock'in navigator)||document.visibilityState!=='visible'){if(G)G.lockOn=false;return}
  try{const l=await navigator.wakeLock.request('screen');if(!G){l.release();return}G.lock=l;G.lockOn=true;l.addEventListener('release',()=>{if(G&&G.lock===l){G.lockOn=false;G.lock=null;render()}})}catch(e){if(G)G.lockOn=false}render()}
function onVis(){if(!G)return;if(document.visibilityState==='visible'){if(!G.lockOn)keepAwake();if(G.ac&&G.ac.state==='suspended')G.ac.resume().catch(()=>{})}}
async function compassOn(){if(!G)return;if(G.compass){removeEventListener(G.compass,onOrient,true);G.compass=null;G.heading=null;render();return}
  try{if(window.DeviceOrientationEvent&&typeof DeviceOrientationEvent.requestPermission==='function'){const r=await DeviceOrientationEvent.requestPermission();if(r!=='granted'){HP.toast('The compass needs motion access. Allow it in your phone’s settings.');return}}}catch(e){HP.toast('The compass is not available on this phone.');return}
  G.compass='ondeviceorientationabsolute'in window?'deviceorientationabsolute':'deviceorientation';addEventListener(G.compass,onOrient,true);render()}
function onOrient(e){if(!G)return;let h=null;if(e.webkitCompassHeading!=null)h=e.webkitCompassHeading;else if(e.absolute&&e.alpha!=null)h=(360-e.alpha)%360;if(h==null)return;
  // the screen may be turned sideways
  const so=(screen.orientation&&screen.orientation.angle)||window.orientation||0;G.heading=(h+so+360)%360;const now=performance.now();if(!G.hT||now-G.hT>200){G.hT=now;renderArrows()}}

/* ---------- what to show ---------- */
function ahead(){const V=G.V,R=G.R,i=G.im,d=V.DAYS[R.day[i]-1],k=G.pace||1,now=nowH();
  const tt=j=>Math.max(0,(V.CLK[j]-V.CLK[i])*k);  // planned time with rests, at your pace
  let up=0;for(let q=i;q<d.i1;q++)if(R.e[q+1]>R.e[q])up+=R.e[q+1]-R.e[q];
  const place=V.PTS.filter(p=>p.i>i+2&&p.i<=d.i1&&p.kind!=='high').sort((a,b)=>a.i-b.i)[0]||null;
  const st=HP.sunTimes(R.lat[i],R.lon[i],new Date(),V.D.tz),arr=now+tt(d.i1),onHike=todayDay()!=null&&now>st.rise-3&&now<st.set+1;
  const hz=(V.F.top||[]).filter(x=>x.i1>=i&&x.i0<=d.i1&&R.d[x.i0]-G.along<1.5).sort((a,b)=>a.i0-b.i0)[0]||null;
  return{d,km:G.along-R.d[d.i0],len:R.d[d.i1]-R.d[d.i0],toEnd:R.d[d.i1]-G.along,tEnd:tt(d.i1),arr,up,place,tPlace:place?tt(place.i):0,set:st.set,dark:onHike&&arr>st.set-.25&&R.d[d.i1]-G.along>.2,hz,now}}
function wmOf(i){const T=G.V.T;if(!T)return null;const k=T.pw[i];if(k<0)return null;const p=T.paths[k];return p&&p.sym>=0?T.syms[p.sym]:null}
function render(first){if(!G)return;const V=G.V,R=G.R,f=G.fix,cc=V.cc&&V.cc[0];
  // the map
  if(f){const ll=[f.lat,f.lon];G.me.setLatLng(ll);G.accC.setLatLng(ll).setRadius(Math.min(f.acc,500));if(!G.map.hasLayer(G.me)){G.accC.addTo(G.map);G.me.addTo(G.map)}
    G.trackL.setLatLngs(G.track);G.offL.setLatLngs(G.off||G.d>Math.max(40,2*f.acc)?[ll,[G.nlat,G.nlon]]:[]);
    if(first&&G.d>2000)G.follow=false;   // far from the route (at home, say): the map stays on the route
    if(G.follow)first?G.map.setView(ll,Math.max(G.map.getZoom(),G.tiles?16:Math.min(16,Math.round((G.picZ||14)+1.5))),{animate:false}):G.map.panTo(ll,{animate:true,duration:.4})}
  $('#gfollow').hidden=!f||G.follow;$('#gcomp').classList.toggle('on',!!G.compass);$('#gsnd').classList.toggle('off',!G.snd);$('#gsnd').setAttribute('aria-pressed',String(G.snd));
  // the instruction at the top
  const top=$('#gtop');let cls='',h='';
  if(!f){cls='wait';h=G.err==='denied'?'<div><b>Location is off for this app</b><span>Allow location in your phone’s settings, then open the guide again.</span></div>':G.err==='none'?'<div><b>No position on this device</b><span>This browser cannot share its position.</span></div>':`<div><b>Finding your position…</b><span>${G.err==='slow'?'Still looking. Out in the open the signal comes faster.':'Stand still for a moment with a clear view of the sky.'}</span></div>`}
  else if(G.d>2000){cls='off';h=`<i class="garr">${ARROW}</i><div><b>${fmtM(G.d)} from the route</b><span>The route is to the ${dir8(G.toRoute)}.</span></div>`}
  else if(G.off){cls='off';h=`<i class="garr">${ARROW}</i><div><b>Off the route · ${fmtM(G.d)}</b><span>Go back ${dir8(G.toRoute)} to the route, along the red dashed line.</span></div>`}
  else if(G.backN>=2){cls='back';const p=V.PTS.filter(p=>p.i<G.im&&p.kind!=='high').pop();h=`<i class="garr back">${ARROW}</i><div><b>Wrong way?</b><span>You are going back along the route${p?`, towards ${esc(p.name)}`:''}. Turn round if you didn’t mean to.</span></div>`}
  else if(G.along>=R.d[G.N-1]-.05){cls='done';h='<div><b>You have arrived</b><span>Well done. Close the guide to save battery.</span></div>'}
  else{const j=nextJ(),dist=j?(R.d[j.i]-G.along)*1000:1e9,sym=j&&j.sym>=0&&V.T?V.T.syms[j.sym]:wmOf(G.im),now=dist<45;
    if(j&&dist<1500){cls=now?'now':'';h=`${sym?`<i class="gwm">${HP.osmcSVG(sym,40)}</i>`:''}<div><b>${now?V.TURN[j.c]||'Go on':`${V.TURN[j.c]||'Go on'} in ${fmtM(dist)}`}</b><span>${sym?`then ${esc(HP.osmcWords(sym,cc))}`:'then the unmarked path'}${j.gp?` · signpost ${esc(j.gp)}`:''}</span></div>`}
    else{const s=wmOf(G.im);h=`${s?`<i class="gwm">${HP.osmcSVG(s,40)}</i>`:''}<div><b>${s?`Follow ${esc(HP.osmcWords(s,cc))}`:'Follow the route'}</b><span>${j?`Next junction in ${fmtM(dist)}`:V.T?'No more junctions':'Turns show once the trail is checked online'}</span></div>`}}
  top.className='gtop '+cls;top.innerHTML=h;renderArrows();
  // the figures at the bottom
  const P=$('#gpanel');if(!f){P.querySelector('.gnow').innerHTML='';P.querySelector('.glines').innerHTML='<li>Keep this screen open: with the phone locked, a web app cannot follow you or warn you.</li>';P.querySelector('.gbar i').style.width='0'}
  else{const A=ahead(),last=A.d.n===V.DAYS.length,to=last?'the finish':esc(A.d.to);
    P.querySelector('.gnow').innerHTML=`<li><b>${fmtM(A.toEnd*1000).replace(' ','<i> </i>')}</b><span>to ${last?'the finish':'tonight'}</span></li><li><b>${fmtT(A.tEnd)}</b><span>${G.pace?'at your pace':'time left'}</span></li><li><b>${fmtClock(A.arr)}</b><span>arrive</span></li><li><b>${nf.format(Math.round(A.up/10)*10)}<i> m</i></b><span>still up</span></li>`;
    const L=[];
    if(A.hz)L.push(`<li class="${A.hz.lvl}">${A.hz.i0<=G.im?'Here':`In ${fmtM((R.d[A.hz.i0]-G.along)*1000)}`}: ${A.hz.what}${A.hz.tip?`, ${A.hz.tip}`:''}</li>`);
    if(A.dark)L.push(`<li class="bad">Sunset ${fmtClock(A.set)}: you would arrive ${fmtT(A.arr-A.set)} after it. Speed up, or stop earlier.</li>`);
    if(A.place)L.push(`<li>Next: ${esc(A.place.name)} · ${fmtM((R.d[A.place.i]-G.along)*1000)} · ${fmtT(A.tPlace)}</li>`);
    L.push(`<li class="mute">Day ${A.d.n}${V.DAYS.length>1?` of ${V.DAYS.length}`:''} · km ${A.km.toFixed(1)} of ${A.len.toFixed(1)} · to ${to}</li>`);
    P.querySelector('.glines').innerHTML=L.join('');P.querySelector('.gbar i').style.width=`${Math.max(0,Math.min(100,A.km/A.len*100)).toFixed(1)}%`}
  $('#gstat').innerHTML=[f?`<span class="${f.acc>50?'bad':''}">${f.acc>50?'Weak GPS':'GPS'} ±${Math.round(f.acc)} m</span>`:'<span>GPS: waiting</span>',G.lockOn?'<span>screen stays on</span>':'wakeLock'in navigator?'<span class="bad">screen may turn off</span>':'<span>keep the screen on in your phone’s settings</span>',navigator.onLine?'':'<span>offline map</span>'].filter(Boolean).join(' · ');
  if(G.sos)renderSOS()}
// the arrows turn with the phone when the compass is on; without it they point on the map, north up
function renderArrows(){if(!G)return;const hd=G.heading!=null?G.heading:null,a=$('#gtop .garr');
  if(a)a.style.transform=`rotate(${((a.classList.contains('back')?G.fwd:G.toRoute)-(hd||0)).toFixed(0)}deg)`;
  const cone=document.querySelector('#gmap .gme .cone'),h=hd!=null?hd:G.gpsHd!=null?G.gpsHd:null;if(cone){cone.style.display=h==null?'none':'';if(h!=null)cone.style.transform=`rotate(${h.toFixed(0)}deg)`}}
function renderSOS(){const V=G.V,f=G.fix,R=G.R,el=$('#gsosbox');const alt=f&&G.d<60?Math.round(R.e[G.im]):f&&f.alt!=null?Math.round(f.alt):null;
  el.innerHTML=`<h3>Emergency</h3><div class="gcall">${V.sos.map(([n,w],k)=>`<a class="${k?'':'big'}" href="tel:${n.replace(/\s/g,'')}"><b>${n}</b><span>${esc(w)}</span></a>`).join('')}</div>`+
    `<p class="micro">Your position</p><p class="gpos">${f?`${f.lat.toFixed(5)}, ${f.lon.toFixed(5)}`:'not known yet'}</p><p class="small mute">${f?`±${Math.round(f.acc)} m${alt!=null?` · about ${nf.format(alt)} m high`:''}${G.d<60?` · ${esc(V.D.name)}, day ${R.day[G.im]}, km ${(G.along-R.d[V.DAYS[R.day[G.im]-1].i0]).toFixed(1)}`:''}`:''}</p>`+
    `<p class="small mute">Read these numbers out to the rescuers. 112 works on any network that reaches your phone.</p><div class="gbtns"><button class="btn" id="gshare2">Share position</button><button class="btn ghost" id="gsosx">Close</button></div>`}
function share(){if(!G||!G.fix){HP.toast('Your position is not known yet.');return}const f=G.fix,V=G.V,R=G.R,la=f.lat.toFixed(5),lo=f.lon.toFixed(5);
  const t=`My position: ${la}, ${lo} (±${Math.round(f.acc)} m)${G.d<60?`, on ${V.D.name}, day ${R.day[G.im]}`:''}. https://www.openstreetmap.org/?mlat=${la}&mlon=${lo}#map=16/${la}/${lo}`;
  if(navigator.share)navigator.share({title:'My position',text:t}).catch(()=>{});
  else if(navigator.clipboard)navigator.clipboard.writeText(t).then(()=>HP.toast('Position copied: paste it into a message.'),()=>HP.toast(t));else HP.toast(t)}
// the buttons
$('#guide').addEventListener('click',e=>{if(!G)return;const b=e.target.closest('button');if(!b)return;
  if(b.id==='gfollow'){G.follow=true;if(G.fix)G.map.setView([G.fix.lat,G.fix.lon],Math.max(G.map.getZoom(),15));render()}
  else if(b.id==='gcomp')compassOn();
  else if(b.id==='gsnd'){G.snd=!G.snd;try{localStorage.setItem('hp-guide-snd',G.snd?'1':'0')}catch(e){}if(G.snd)tone([[784,.12]]);render()}
  else if(b.id==='gsos'){G.sos=true;HP.motion.open($('#gsosbox'));renderSOS()}
  else if(b.id==='gsosx'){G.sos=false;HP.motion.close($('#gsosbox'))}
  else if(b.id==='gshare'||b.id==='gshare2')share()
  else if(b.id==='gexit')history.back()});
HP.guide={open,close,active:()=>!!G,
  // for tests: a position as if from the GPS, and what the guide shows
  fix:(lat,lon,acc=8,t)=>onFix({lat,lon,acc,alt:null,hd:null,sp:null,t:t||Date.now()}),
  state:()=>G&&{along:+G.along.toFixed(3),d:Math.round(G.d),off:G.off,back:G.backN>=2,im:G.im,pace:G.pace,lock:!!G.lockOn,follow:G.follow,alarm:G.lastAlarm||null,top:$('#gtop').innerText,lines:$('#gpanel .glines').innerText,next:(nextJ()||{}).i??null}};
})();
