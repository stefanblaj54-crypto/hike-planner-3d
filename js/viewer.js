'use strict';
/* Hike Planner 3D: the 3D viewer, weather simulation, forecast, briefing, profile and day table for one hike */
(function(){
const {$,$$,nf,fmtH,fmtClock,esc,sst,parseDay,isoDay,fmtDate}=HP.u;
const DAYC=['#f76707','#7048e8','#1c7ed6','#0ca678','#e64980','#f59f00','#4263eb','#ae3ec9','#2b8a3e','#c92a2a'];
const SACC={0:'#868e96',1:'#37b24d',2:'#f2b705',3:'#fd7e14',4:'#e03131',5:'#862e9c'};
const SACN={0:'No grade (road, track or unmarked path)',1:'T1 hiking',2:'T2 mountain hiking',3:'T3 demanding, hands at times',4:'T4 alpine, exposed, chains',5:'T5 demanding alpine'};
const SACS={0:'No grade',1:'T1 hiking',2:'T2 mountain',3:'T3 demanding',4:'T4 alpine',5:'T5 hard alpine'};   // short names for legends
// steepness of the path in degrees, measured over about 200 m of the route
const STC={1:'#37b24d',2:'#f2b705',3:'#fd7e14',4:'#e03131',5:'#862e9c'},STN={1:'Gentle, under 5°',2:'Moderate, 5–10°',3:'Steep, 10–15°',4:'Very steep, 15–20°',5:'Extreme, over 20°'};
const MONN=['','January','February','March','April','May','June','July','August','September','October','November','December'];
const reduce=matchMedia('(prefers-reduced-motion: reduce)').matches;
// ArcGIS World Imagery (Esri) for sharp close-ups outside Switzerland: the owner's ArcGIS Location Platform key, basemaps only,
// free tier with pay-as-you-go off. When it expires or this month's free use runs out, the view goes back to the other pictures.
const ESRI_KEY=HP.ESRI_KEY,ESRI_URL='https://ibasemaps-api.arcgis.com/arcgis/rest/services/World_Imagery/MapServer';
let esriMeta=false;
let HGT=null;
let D,S,R,N,DAYS,PTS,overnight={},PX=null,TER=null,MPP=6.5,WALK,BASEW,CLK,SHADE,EXPO,STEEP,SLOPE,FCP=null,TAGT='',OFFICIAL={},AC=null,V3=null,onChange=null,GW={},CELLS=[],ROs=[],BLOBS={};
const walk=i=>WALK[i],clock=i=>CLK[i],dayOf=i=>DAYS[R.day[i]-1];
const ptLabel=p=>p.kind==='start'?'Start · '+p.name:p.kind==='end'?'Finish · '+p.name:overnight[p.i]?`Night ${overnight[p.i]} · ${DAYS[overnight[p.i]-1].to}`:p.name+(OFFICIAL[p.name]?' '+nf.format(OFFICIAL[p.name])+' m':'');
const startH=()=>{const[a,b]=(S.start||'07:00').split(':').map(Number);return(a||0)+(b||0)/60};
function nearestByDist(v,a,b){let lo=a,hi=b;while(lo<hi){const m=(lo+hi)>>1;if(R.d[m]<v)lo=m+1;else hi=m}return lo>a&&Math.abs(R.d[lo-1]-v)<Math.abs(R.d[lo]-v)?lo-1:lo}
const save=()=>{D.set={start:S.start,pace:S.pace,breaks:S.breaks,wx:S.wx,mon:S.mon,ex:S.ex,map:S.map,color:S.color};if(onChange)onChange(D)};

/* ---------- weather model ---------- */
const lerp=(a,b,t)=>a+(b-a)*t;
const qT=(k,z)=>{const c=D.clim.m[S.mon]||D.clim.m[7],v=c[k]||c.tx,[z0,z1]=D.clim.z;return v[0]+(v[1]-v[0])*(z-z0)/Math.max(1,z1-z0)};
const dsh=t=>{t=((t%24)+24)%24;const a=5.75,b=15;if(t>=a&&t<=b)return .5-.5*Math.cos(Math.PI*(t-a)/(b-a));const u=t>b?t-b:t+24-b;return .5+.5*Math.cos(Math.PI*u/(24-(b-a)))};
const diu=(z,t,kx,kn)=>{const lo=qT(kn,z);return lo+(qT(kx,z)-lo)*dsh(t)};
const hash2=(x,y)=>{const s=Math.sin(x*12.9898+y*78.233)*43758.5453;return s-Math.floor(s)};
const vnoise=(x,y)=>{const i=Math.floor(x),j=Math.floor(y),fx=x-i,fy=y-j,u=fx*fx*(3-2*fx),v=fy*fy*(3-2*fy);return lerp(lerp(hash2(i,j),hash2(i+1,j),u),lerp(hash2(i,j+1),hash2(i+1,j+1),u),v)};
const rng=s=>()=>{s|=0;s=s+0x6D2B79F5|0;let t=Math.imul(s^s>>>15,1|s);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296};
const tzCache=new Map();
const dayDate=n=>{if(S.wx==='fc'){const d=parseDay(D.date);d.setDate(d.getDate()+(n||1)-1);return d}return new Date(new Date().getFullYear(),S.mon-1,15)};
function sunAt(h,dayN){const date=dayDate(dayN),key=isoDay(date);let off=tzCache.get(key);if(off==null){off=HP.tzOffset(D.tz,date,D.center.lon);tzCache.set(key,off)}
  const n=Math.round((date-new Date(date.getFullYear(),0,0))/864e5),LAT=D.center.lat*Math.PI/180,B=2*Math.PI*(n-81)/364,eot=9.87*Math.sin(2*B)-7.53*Math.cos(B)-1.5*Math.sin(B),dec=23.44*Math.PI/180*Math.sin(2*Math.PI*(284+n)/365),H=(h-off+D.center.lon/15+eot/60-12)*15*Math.PI/180;
  const el=Math.asin(Math.sin(LAT)*Math.sin(dec)+Math.cos(LAT)*Math.cos(dec)*Math.cos(H)),az=Math.atan2(Math.sin(H),Math.cos(H)*Math.sin(LAT)-Math.tan(dec)*Math.cos(LAT))+Math.PI;
  return{el,az,x:Math.cos(el)*Math.sin(az),y:Math.sin(el),z:-Math.cos(el)*Math.cos(az)}}
const cellAt=(c,t)=>{const a=t-c.t0;return{x:c.x+c.vx*a,y:c.y+c.vy*a,R:c.R,age:a,seed:c.seed,I:a<0?0:sst(0,.8,a)*(1-sst(2,3,a)),Ir:sst(.5,.9,a)*(1-sst(1.9,2.7,a)),Iw:sst(.5,1,a)*(1-sst(2.5,4.5,a)),lit:a>.75&&a<2.3}};
function setupGeo(){let rmin=1e9,rmax=-1e9;for(let i=0;i<N;i++){rmin=Math.min(rmin,R.e[i]);rmax=Math.max(rmax,R.e[i])}const hmin=D.terr.min,hmax=D.terr.max;
  GW={hmin,hmax,rmin,rmax,cuBase:()=>Math.max(hmin+(S.mon>=5&&S.mon<=9?1800:1300),rmax+250),deck:{base:Math.max(hmin+300,rmin+.4*(rmax-rmin)),top:rmax+450},
    fogTop:hmin+Math.min(900,Math.max(320,.25*(rmax-hmin))),snowLine:Math.round(Math.min(rmax-100,Math.max(rmin+150,rmax-.35*(rmax-rmin)))/50)*50,high:rmax-.3*(rmax-rmin)};
  // storm cells over the highest ground near the route
  const{GC,GR,GS,ht}=TER,r=Math.max(2,Math.round(2500/(GS*MPP))),cand=[];
  for(let y=r;y<GR-r;y+=2)for(let x=r;x<GC-r;x+=2){const h=ht[y*GC+x];let top=true;for(let dy=-r;dy<=r&&top;dy+=2)for(let dx=-r;dx<=r;dx+=2)if(ht[(y+dy)*GC+x+dx]>h){top=false;break}if(top)cand.push({x:x*GS+.5,y:y*GS+.5,h})}
  for(const c of cand){let dm=1e9;for(let i=0;i<N;i+=8)dm=Math.min(dm,Math.hypot(R.x[i]-c.x,R.y[i]-c.y)*MPP);c.s=c.h-dm*.08}
  cand.sort((a,b)=>b.s-a.s);const out=[];for(const c of cand){if(out.some(o=>Math.hypot(o.x-c.x,o.y-c.y)*MPP<6000))continue;out.push(c);if(out.length>=6)break}
  if(!out.length)out.push({x:R.x[N>>1],y:R.y[N>>1]});
  const T0=[12.9,13.3,13.7,14.1,14.6,15.4],v=5000/MPP*Math.SQRT1_2;CELLS=out.map((c,k)=>({x:c.x,y:c.y,t0:T0[k],R:3000,vx:v,vy:-v,seed:1000+k*7919}))}
const seaFog=t=>{const m=S.mon,sum=m>=5&&m<=8,top=GW.fogTop+(sum?0:80)-(sum?80:200)*sst(7,11.5,t),amt=sum?1-sst(9,11,t):m===9||m===4?1-sst(11.5,13.5,t):1-.45*sst(13,16,t);return{top,amt}};
const SCN={
 fc:{name:'Forecast',icon:'fc'},
 plain:{name:'Plain map',icon:'map',T:(z,t)=>diu(z,t,'tx','tn'),wind:(z,t)=>{const v=5+10*sst(GW.hmin+400,GW.hmax,z);return{v,g:v*1.7,dir:270}},st:()=>({sunAmt:1,clar:.8})},
 fair:{name:'Fair',icon:'sun',T:(z,t)=>diu(z,t,'tx75','tn25'),wind:(z,t)=>{const v=5+11*sst(GW.hmin+400,GW.hmax,z)+3*dsh(t);return{v,g:v*1.7,dir:45}},
   st:t=>({cu:{cover:.27*sst(10.5,14.5,t)*(1-sst(17.5,20.5,t)),base:GW.cuBase(),depth:500+800*sst(11,15,t)},sunAmt:1,clar:.8,haze:.3})},
 storm:{name:'Afternoon storms',icon:'storm',T:(z,t)=>diu(z,t,'tx90','tn75'),wind:(z,t)=>{const v=6+9*sst(GW.hmin+400,GW.hmax,z);return{v,g:v*1.8,dir:225}},
   st:t=>{const cells=CELLS.map(c=>cellAt(c,t)).filter(c=>c.age>-.6&&c.age<4.6);let dk=0;cells.forEach(c=>{dk=Math.max(dk,c.I)});
     return{cu:{cover:.06+.12*sst(9.5,12.5,t)*(1-sst(18.5,21,t)),base:GW.cuBase()-400,depth:600+1600*sst(10,13.5,t)},cells,sunAmt:1-.45*dk,clar:.72-.12*dk,haze:.3,dark:.45*dk}}},
 front:{name:'Rain front',icon:'rain',T:(z,t)=>qT('tx10',z)-2.6*(1-dsh(t))-1.4*sst(9,15,t),wind:(z,t)=>{const v=14+26*sst(GW.hmin+400,GW.hmax,z);return{v,g:v*1.65,dir:255}},
   st:t=>({deck:{base:Math.max(GW.hmin+200,GW.rmin+.3*(GW.rmax-GW.rmin))-200*sst(8,12,t)+180*sst(15,19,t),top:GW.hmax+3000},rain:1.2+3.6*sst(8,11,t)*(1-sst(14,17.5,t)),wetAll:1,over:1,sunAmt:.05,clar:.3,haze:.7,dark:.25,vis:60,windVis:.7})},
 cloud:{name:'In the clouds',icon:'fog',T:(z,t)=>qT('tx25',z)-1.2-2.4*(1-dsh(t)),wind:(z,t)=>{const v=7+14*sst(GW.hmin+400,GW.hmax,z);return{v,g:v*1.6,dir:300}},
   st:t=>({deck:{base:GW.deck.base+120*sst(11,15,t),top:GW.deck.top},drizzle:.3,deckShade:1,sunAmt:1,clar:.75,haze:.35,vis:60})},
 sea:{name:'Valley fog',icon:'sea',T:(z,t)=>{const f=seaFog(t),hi=f.top+350,tf=qT('tn',f.top)+1+1.5*dsh(t),above=diu(z,t,'tx75','tn75');if(z>=hi)return above;const inv=z<=f.top?tf:lerp(tf,diu(hi,t,'tx75','tn75'),(z-f.top)/350);return lerp(above,inv,f.amt)},
   wind:(z,t)=>{const v=4+8*sst(GW.hmin+700,GW.hmax,z);return{v,g:v*1.5,dir:60}},st:t=>({fog:seaFog(t),sunAmt:1,clar:.95,haze:.12})},
 wind:{name:'Strong wind',icon:'wind',T:(z,t)=>diu(z,t,'tx25','tn25')-1,wind:(z,t)=>{const v=22+34*sst(GW.hmin+300,GW.hmax,z);return{v,g:v*1.6,dir:290}},
   st:t=>({cu:{cover:.16,base:GW.cuBase()-300,depth:450},sunAmt:1,clar:.95,haze:.08,windVis:1})},
 snow:{name:'Early snow',icon:'snow',T:(z,t)=>{const lo=qT('tn10',z)-1.5,hi=qT('tx03',z)+1;return lo+(hi-lo)*dsh(t)},wind:(z,t)=>{const v=9+24*sst(GW.hmin+400,GW.hmax,z);return{v,g:v*1.6,dir:20}},
   st:t=>({snow:GW.snowLine,cu:{cover:.1*sst(12,15,t)*(1-sst(17,19,t)),base:GW.cuBase()-500,depth:400},sunAmt:1,clar:1,haze:.05,windVis:.5})}};
const ICON={map:'<path d="M3 6.5l6-2.5 6 2.5 6-2.5v13.5l-6 2.5-6-2.5-6 2.5z"/><path d="M9 4v13.5M15 6.5V20"/>',
 fc:'<rect x="3.5" y="5" width="17" height="15" rx="2"/><path d="M3.5 9.5h17M8 3v4M16 3v4"/><path d="M8.5 15.5a2.6 2.6 0 0 1 1.4-4.9 3.2 3.2 0 0 1 6 .9 2 2 0 0 1-.3 4z"/>',
 sun:'<circle cx="12" cy="12" r="4.2"/><path d="M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M5.3 5.3l1.5 1.5M17.2 17.2l1.5 1.5M5.3 18.7l1.5-1.5M17.2 6.8l1.5-1.5"/>',
 storm:'<path d="M7 16.5a4.5 4.5 0 1 1 1.2-8.8A5.8 5.8 0 0 1 19 9.6a3.6 3.6 0 0 1-.6 7"/><path d="M13 12.5l-2.6 4.5h3.4l-2.4 4.5"/>',
 rain:'<path d="M7 15a4.5 4.5 0 1 1 1.2-8.8A5.8 5.8 0 0 1 19 8.1a3.6 3.6 0 0 1-.6 6.9H7"/><path d="M8.5 18l-1 2.8M12.5 18l-1 2.8M16.5 18l-1 2.8"/>',
 fog:'<path d="M6.5 11a4 4 0 0 1 7.6-1.6A3.5 3.5 0 0 1 19 11"/><path d="M3 14.5h18M5 18h14M8 21.5h8"/>',
 sea:'<path d="M4.5 13.5l5-7.5 3.2 4.3 2-2.3 4.8 5.5"/><path d="M2.5 17.5c1.6-1.3 3.2-1.3 4.8 0s3.2 1.3 4.8 0 3.2-1.3 4.8 0 3.2 1.3 4.8 0"/>',
 wind:'<path d="M3 8.5h10.5a3 3 0 1 0-3-3M3 12.5h15a3 3 0 1 1-3 3M3 16.5h6"/>',
 snow:'<path d="M12 2.5v19M3.8 7.3l16.4 9.4M3.8 16.7l16.4-9.4M9.3 3.8L12 5.6l2.7-1.8M9.3 20.2l2.7-1.8 2.7 1.8"/>'};
const wet=()=>{const w=(D.clim.m[S.mon]||{}).wet;return w?`Rain is common here: ${w[0]}% of ${MONN[S.mon]} days get at least 1 mm and ${w[1]}% get 10 mm or more (${D.clim.rough?'rough estimate':'ERA5 reanalysis'}).`:''};
const DESC={
 fc:()=>{const f=D.fc,iss=new Date(f.issued);return`The real forecast for your dates (Open-Meteo, issued ${iss.toLocaleDateString('en-GB',{day:'numeric',month:'short'})} at ${iss.toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'})}), taken at ${f.pts.length} points along the route at their own heights. The first two or three days are fairly reliable; after that, use it as a rough guide.`},
 plain:m=>`The map without weather effects. Temperatures in the readout are an average ${m} day for this place.`,
 fair:m=>`High pressure: a clear morning, small cumulus clouds over the high ground in the afternoon and light winds. A warmer-than-average ${m} day (warmer than three days in four).`,
 storm:m=>`Hot and humid. Cumulus clouds tower over the highest ground from late morning and turn into thunderstorm cells in the afternoon, with heavy rain, hail, gusts and lightning, then clear by evening. This is how summer heat storms usually behave in mountains: isolated cells over high ground, later in the day.${[11,12,1,2,3].includes(S.mon)?` In ${m} they are rare.`:''}`,
 front:m=>`A cold front: cloud down on the slopes, rain most of the day and colder than usual (colder than nine days in ten), with sleet or wet snow possible high up. ${wet()}`,
 cloud:m=>`A grey day with the cloud sitting on the slopes from about ${nf.format(Math.round(GW.deck.base/50)*50)} m to ${nf.format(Math.round(GW.deck.top/50)*50)} m: drizzle and 50–100 m visibility up high, while the highest ground can stick out into the sun.`,
 sea:m=>`High pressure with cold air trapped in the valleys: fog up to about ${nf.format(Math.round(GW.fogTop/50)*50)} m, with sun and clear air above it. Starting low, you climb out of the grey into the blue. Most common from September to February; in summer it is usually gone by mid-morning.`,
 wind:m=>`A cold, windy day after a front: sunshine and fast clouds, with strong gusts on ridges and passes and a much lower "feels like" temperature up high.`,
 snow:m=>`The day after a cold snap: clear and cold, with fresh snow above about ${nf.format(GW.snowLine)} m. In the mountains this can happen in any month. Steep or rocky sections ice up.`};
const WXC=new Map();
function flAt(t){const T=SCN[S.wx].T;let lo=0,hi=7000;if(T(hi,t)>0)return hi;if(T(lo,t)<0)return 0;for(let k=0;k<22;k++){const m=(lo+hi)/2;if(T(m,t)>0)lo=m;else hi=m}return lo}
function wst(t){const k=Math.round(t*60);let s=WXC.get(k);if(s)return s;s=SCN[S.wx].st(t);s.fl=flAt(t);s.sl=s.fl-300;if(WXC.size>5000)WXC.clear();WXC.set(k,s);return s}
// forecast at a route point and time
const fcH=(i,t)=>(R.day[i]-1)*24+t;
function fcAt(i,t){const F=D.fc;if(!F)return null;const fp=F.pts[FCP[i]],H=fcH(i,t);if(H<0||H>F.n-1)return null;const a=Math.floor(H),b=Math.min(F.n-1,a+1),w=H-a,o={z:fp.z};
  for(const[k,arr]of Object.entries(fp.h)){const va=arr[a],vb=arr[b];o[k]=k==='code'?(w<.5?va:vb):k==='wd'?va:(va===va&&vb===vb?va+(vb-va)*w:(va===va?va:vb))}return o}
// Old snow from the winter left on the path (since 2.3). Typical for the date: in the Alps most passes clear between mid-June and
// early July, and the snow lies longest on slopes facing north. Near the date, the forecast models' snow on the ground (its own snow
// line, fcSnowLine) takes over, softened where it shows none, as the models' ground is lower than a pass.
const SNOWD=[[91,1350],[121,1700],[135,1900],[152,2100],[166,2400],[182,2650],[196,2950],[213,3200],[244,3500]]; // day of the year → height of the old snow
function oldSnowLine(doy,lat){if(lat<0)doy=(doy+183)%366;let z;if(doy<=SNOWD[0][0])z=doy<60?1000:SNOWD[0][1];else if(doy>=SNOWD[SNOWD.length-1][0])z=doy>320?1200:9000;
  else for(let k=1;k<SNOWD.length;k++)if(doy<=SNOWD[k][0]){const[a,za]=SNOWD[k-1],[b,zb]=SNOWD[k];z=za+(zb-za)*(doy-a)/(b-a);break}
  return z-(Math.abs(lat)-46.5)*60}
// which way the ground faces at a route point (from the heights around it): 'n', 's' or ''
function facing(i){if(!HGT)return'';const x=R.x[i],y=R.y[i],d=1.5,gx=HGT(x+d,y)-HGT(x-d,y),gy=HGT(x,y+d)-HGT(x,y-d);if(Math.hypot(gx,gy)<2*d*MPP*.18)return'';
  const az=(Math.atan2(-gx,gy)*180/Math.PI+360)%360;   // the way the slope goes down (x runs east, y south)
  return az<55||az>305?'n':az>125&&az<235?'s':''}
// per point: 0 no snow, 1 patches possible, 2 snow likely; with the reason (season or forecast)
const doyOf=d=>Math.round((d-new Date(d.getFullYear(),0,1))/864e5)+1;
function snowAt(){const lv=new Uint8Array(N),why=new Uint8Array(N),lat=D.center.lat;let lastDay=-1,line=0;
  for(let i=0;i<N;i+=1){const dn=R.day[i];if(dn!==lastDay){lastDay=dn;line=oldSnowLine(doyOf(hikeDate(dn)),lat)}
    const f=facing(i),z=line+(f==='n'?-200:f==='s'?150:0),e=R.e[i];let l=e>=z?2:e>=z-300?1:0,w=1;
    if(D.fc){const H=fcH(i,CLK[i]);if(H>=0&&H<=D.fc.n-1){const s=fcSnowLine(i,CLK[i]);if(s!==null){l=e>=s?2:e>=s-200?Math.max(1,l?1:0):0;w=2}else l=Math.max(0,l-1)}}
    lv[i]=l;why[i]=w}
  return{lv,why,line}}
function fcSnowLine(i,t){const F=D.fc,H=fcH(i,t);if(H<0||H>F.n-1)return null;let z=null;for(const fp of F.pts){const v=fp.h.sd[Math.round(H)];if(v>.03&&(z===null||fp.z<z))z=fp.z}return z===null?null:z-150}
function fcState(i,t){const key=FCP[i]+'|'+R.day[i]+'|'+Math.round(t*60);let s=WXC.get(key);if(s)return s;const f=fcAt(i,t);
  if(!f){s={sunAmt:1,clar:.8,nofc:1,fl:flPlain(t),sl:flPlain(t)-300};WXC.set(key,s);return s}
  const lcl=f.z+Math.max(0,125*(f.T-f.Td)),low=(f.cl||0)/100,mid=(f.cm||0)/100,high=(f.ch||0)/100,thunder=f.code>=95;
  s={sunAmt:Math.max(.05,1-Math.max(low*.9,mid*.75,high*.35)),clar:f.vis>=40000?.95:f.vis>=15000?.75:f.vis>=5000?.5:.3,haze:f.vis<20000?.5:.2,fl:isFinite(f.fl)?f.fl:flPlain(t)};s.sl=s.fl-300;
  if(f.code===45||f.code===48){s.deck={base:f.z-260,top:f.z+450};s.deckShade=1;s.vis=Math.max(60,Math.min(400,f.vis||100))}
  else if(low>.72){const base=Math.max(GW.hmin+150,lcl-120);s.deck={base,top:f.pr>.3?GW.hmax+3000:Math.max(base+700,f.z+300)};if(f.pr>.3)s.over=1;else s.deckShade=1;s.vis=60}
  else if(low>.06||(mid>.3&&f.cape>150))s.cu={cover:Math.min(.45,low*.55+mid*.12),base:Math.max(lcl,GW.hmin+500),depth:400+Math.min(2600,(f.cape||0)*1.3)};
  if(mid>.85&&!s.deck)s.over=1;
  if(f.pr>.05&&!thunder)s.rain=f.pr;
  if(thunder||(f.cape>900&&f.pr>1.5)){const fx=R.x[D.fc.pts[FCP[i]].i],fy=R.y[D.fc.pts[FCP[i]].i];s.cells=CELLS.filter(c=>Math.hypot(c.x-fx,c.y-fy)*MPP<16000).map(c=>({x:c.x,y:c.y,R:c.R,age:1.3,seed:c.seed,I:.9,Ir:Math.min(1,.4+f.pr/8),Iw:.6,lit:thunder}));if(!s.cells.length)s.cells=[{x:fx,y:fy,R:3000,age:1.3,seed:5,I:.9,Ir:.8,Iw:.6,lit:thunder}];s.dark=.4}
  else if(s.over)s.dark=.2;
  if(f.wg>40)s.windVis=Math.min(1,(f.wg-25)/40);
  const snl=fcSnowLine(i,t);if(snl!==null)s.snow=snl;
  s.f=f;if(WXC.size>8000)WXC.clear();WXC.set(key,s);return s}
function flPlain(t){const save=S.wx;S.wx='plain';const v=flAt(t);S.wx=save;return v}
const stAt=(i,t)=>S.wx==='fc'?fcState(i,t):wst(t);
/* ---------- wind: the forecast's own winds, or the records for a weather type, shaped by the terrain ---------- */
// A layer of air between the ground and a lid flows around high ground, through gaps and over saddles: the smallest change to an
// even wind that keeps the layer's mass (a mass-consistent model, as WindNinja uses). Its answers for an east and a north wind are
// worked out once, under a low lid (calm, stable air goes round the hills) and a high one (mixed air goes over); any wind is a blend.
// Near the ground the wind is weaker in hollows than on crests, and on calm days the slopes make their own breeze: up by day, down at night.
let WF=null;const WFC=new Map();
function windSetup(){
  const{GC,GR,GS,ht}=TER,f=Math.max(1,Math.ceil(Math.max(GC,GR)/96)),nx=Math.ceil(GC/f),ny=Math.ceil(GR/f),cs=GS*f*MPP,n=nx*ny,z=new Float32Array(n);
  for(let j=0;j<ny;j++)for(let i=0;i<nx;i++){let s=0,c=0;for(let b=0;b<f;b++)for(let a=0;a<f;a++){const x=i*f+a,y=j*f+b;if(x<GC&&y<GR){s+=ht[y*GC+x];c++}}z[j*nx+i]=s/c}
  const blur=(src,r)=>{const t=new Float32Array(n),o=new Float32Array(n),cl=(v,m)=>Math.min(m-1,Math.max(0,v));
    for(let j=0;j<ny;j++){let a=0;for(let i=-r;i<=r;i++)a+=src[j*nx+cl(i,nx)];for(let i=0;i<nx;i++){t[j*nx+i]=a/(2*r+1);a+=src[j*nx+cl(i+r+1,nx)]-src[j*nx+cl(i-r,nx)]}}
    for(let i=0;i<nx;i++){let a=0;for(let j=-r;j<=r;j++)a+=t[cl(j,ny)*nx+i];for(let j=0;j<ny;j++){o[j*nx+i]=a/(2*r+1);a+=t[cl(j+r+1,ny)*nx+i]-t[cl(j-r,ny)*nx+i]}}return o};
  const rc=m=>Math.max(1,Math.round(m/cs)),zm=blur(z,rc(900)),zv=blur(blur(z,rc(600)),rc(600));let zmax=-1e9;for(let k=0;k<n;k++)zmax=Math.max(zmax,z[k]);
  // exposure: how far a place stands above the ground around it, 0 deep in a hollow, 1 on a crest
  const E=new Float32Array(n);for(let k=0;k<n;k++)E[k]=Math.min(1,Math.max(0,.5+(z[k]-zm[k])/360));
  // the slope breeze's way: up the valley-sized slope (east and north parts), as strong as the slope is steep
  const SE=new Float32Array(n),SN=new Float32Array(n);
  for(let j=0;j<ny;j++)for(let i=0;i<nx;i++){const k=j*nx+i,gx=(zv[j*nx+Math.min(nx-1,i+1)]-zv[j*nx+Math.max(0,i-1)])/(2*cs),gs=(zv[Math.min(ny-1,j+1)*nx+i]-zv[Math.max(0,j-1)*nx+i])/(2*cs),g=Math.hypot(gx,gs),m=Math.min(1,Math.atan(g)*57.3/14);
    if(g>1e-4){SE[k]=gx/g*m;SN[k]=-gs/g*m}}
  // both answers at once for one lid, with the layer's depth on each cell's four sides worked out first
  // valleys: their axis (the way the ground curves least, east and north parts) and how much a valley holds the wind in it;
  // slopes: which way is uphill and how steeply (for the speed-up on the windward side and the shelter in the lee)
  const AE=new Float32Array(n),AN=new Float32Array(n),CH=new Float32Array(n),GE=new Float32Array(n),GN=new Float32Array(n),zs=blur(z,rc(250));
  for(let j=0;j<ny;j++)for(let i=0;i<nx;i++){const k=j*nx+i,iE=Math.min(nx-1,i+1),iW=Math.max(0,i-1),jS=Math.min(ny-1,j+1),jN=Math.max(0,j-1),q=(jj,ii)=>zv[jj*nx+ii];
    const zxx=(q(j,iE)-2*q(j,i)+q(j,iW))/(cs*cs),zyy=(q(jS,i)-2*q(j,i)+q(jN,i))/(cs*cs),zxy=(q(jS,iE)-q(jS,iW)-q(jN,iE)+q(jN,iW))/(4*cs*cs),
      tr=(zxx+zyy)/2,dt=Math.sqrt(Math.max(0,((zxx-zyy)/2)**2+zxy*zxy)),l1=tr+dt,l2=tr-dt;
    // the axis is the direction of the smaller curvature; across a valley the ground curves up strongly
    let ex=l1-zyy,ey=zxy;if(Math.abs(ex)+Math.abs(ey)<1e-12){ex=1;ey=0}const L=Math.hypot(ex,ey),ax=-ey/L,ay=ex/L;AE[k]=ax;AN[k]=-ay;
    CH[k]=Math.min(1,Math.max(0,(l1-1.5e-4)/6e-4))*Math.min(1,Math.max(0,(l1-Math.max(0,l2))/(Math.abs(l1)+1e-9)))*Math.min(1,Math.max(0,(.62-E[k])/.35));
    GE[k]=(zs[j*nx+iE]-zs[j*nx+iW])/((iE-iW)*cs);GN[k]=-(zs[jS*nx+i]-zs[jN*nx+i])/((jS-jN)*cs)}
  const solve=lid=>{const h=new Float32Array(n);for(let k=0;k<n;k++)h[k]=Math.max(60,lid-z[k]);
    const cE=new Float32Array(n),cW=new Float32Array(n),cS=new Float32Array(n),cN=new Float32Array(n),iv=new Float32Array(n),Le=new Float32Array(n),Ln=new Float32Array(n),re=new Float32Array(n),rn=new Float32Array(n);
    for(let j=1;j<ny-1;j++)for(let i=1;i<nx-1;i++){const k=j*nx+i;cE[k]=(h[k]+h[k+1])/2;cW[k]=(h[k]+h[k-1])/2;cS[k]=(h[k]+h[k+nx])/2;cN[k]=(h[k]+h[k-nx])/2;iv[k]=1/(cE[k]+cW[k]+cS[k]+cN[k]);re[k]=cs*(cE[k]-cW[k]);rn[k]=-cs*(cS[k]-cN[k])}
    for(let it=0;it<260;it++)for(let j=1;j<ny-1;j++)for(let i=1;i<nx-1;i++){const k=j*nx+i,a=cE[k],b=cW[k],c=cS[k],d=cN[k];
      Le[k]+=1.9*((a*Le[k+1]+b*Le[k-1]+c*Le[k+nx]+d*Le[k-nx]+re[k])*iv[k]-Le[k]);Ln[k]+=1.9*((a*Ln[k+1]+b*Ln[k-1]+c*Ln[k+nx]+d*Ln[k-nx]+rn[k])*iv[k]-Ln[k])}
    const out=[[new Float32Array(n),new Float32Array(n)],[new Float32Array(n),new Float32Array(n)]];
    for(let j=0;j<ny;j++)for(let i=0;i<nx;i++){const k=j*nx+i,kE=j*nx+Math.min(nx-1,i+1),kW=j*nx+Math.max(0,i-1),kS=Math.min(ny-1,j+1)*nx+i,kN=Math.max(0,j-1)*nx+i;
      out[0][0][k]=1+(Le[kE]-Le[kW])/(2*cs);out[0][1][k]=-(Le[kS]-Le[kN])/(2*cs);out[1][0][k]=(Ln[kE]-Ln[kW])/(2*cs);out[1][1][k]=1-(Ln[kS]-Ln[kN])/(2*cs)}
    return out};
  const lo=zmax+900,hi=zmax+2500;
  WF={nx,ny,f,E,SE,SN,AE,AN,CH,GE,GN,ridge:Math.max(GW.rmax,zmax*.6+GW.hmin*.4)+200,lo:solve(lo),hi:solve(hi)};WFC.clear()}
// a value of one of the wind grids at a point of the map (px, py in the hike's pixels), smoothly
function wfAt(a,px,py){const gx=Math.min(Math.max((px-.5)/(TER.GS*WF.f),0),WF.nx-1.001),gy=Math.min(Math.max((py-.5)/(TER.GS*WF.f),0),WF.ny-1.001),c=gx|0,r=gy|0,fx=gx-c,fy=gy-r,k=r*WF.nx+c;
  return a[k]*(1-fx)*(1-fy)+a[k+1]*fx*(1-fy)+a[k+WF.nx]*(1-fx)*fy+a[k+WF.nx+1]*fx*fy}
const vec=(spd,from)=>{const a=from*Math.PI/180;return[-spd*Math.sin(a),-spd*Math.cos(a)]};  // east and north parts of a wind coming from `from`
// the wind for a day and time: above the hills (east, north, km/h), gustiness, how stable the air is, and the forecast's own winds near the ground
function windBase(day,t){const key=S.wx+S.mon+'|'+day+'|'+Math.round(t*6)+'|'+(D.fc?D.fc.issued:0);let b=WFC.get(key);if(b)return b;const sn=sunAt(t,day),sunUp=sn.y>.05;
  if(S.wx==='fc'&&D.fc){const F=D.fc,pts=[];let su=0,sv=0,sw=0,gf=0;
    for(const fp of F.pts){const i=Math.min(Math.max(fp.i,DAYS[day-1].i0),DAYS[day-1].i1),H=fcH(i,t);if(H<0||H>F.n-1)continue;const a=Math.floor(H),w=H-a,q=Math.min(F.n-1,a+1),
        g=k=>{const x=fp.h[k];if(!x||!x.length)return NaN;const va=x[a],vb=x[q];return va===va&&vb===vb?va+(vb-va)*w:va===va?va:vb},ang=k=>{const x=fp.h[k];return x&&x.length?(x[w<.5?a:q]):NaN};
      const ws=g('ws'),wd=ang('wd');if(!(ws===ws&&wd===wd))continue;const v10=vec(ws,wd);pts.push({px:R.x[fp.i],py:R.y[fp.i],u:v10[0],v:v10[1],gf:Math.min(60,Math.max(ws*.25,(g('wg')||ws*1.5)-ws))});
      // above the hills: between the 850 and 700 hPa winds at the height of the ridges; without them, the wind near the ground a little stronger
      let up;const s8=g('w8s'),d8=ang('w8d'),s7=g('w7s'),d7=ang('w7d'),z8=g('z8')||1500,z7=g('z7')||3050;
      if(s8===s8&&d8===d8){const a8=vec(s8,d8),a7=s7===s7&&d7===d7?vec(s7,d7):a8,k=Math.min(1,Math.max(0,(WF.ridge-z8)/Math.max(300,z7-z8)));up=[a8[0]+(a7[0]-a8[0])*k,a8[1]+(a7[1]-a8[1])*k]}
      else up=[v10[0]*1.35,v10[1]*1.35];su+=up[0];sv+=up[1];sw++;gf+=pts[pts.length-1].gf}
    if(sw){const st=fcState(DAYS[day-1].i0,t),stab=sunUp&&!st.fog?Math.min(1,Math.hypot(su,sv)/sw/30+.35*(st.sunAmt||0)):.15;
      b={u:su/sw,v:sv/sw,gf:gf/sw,stab,pts,sunUp,sun:sunUp?Math.min(1,sn.y*2.5)*(fcState(DAYS[day-1].i0,t).sunAmt||0):0,src:'fc'}}}
  if(!b){const sc=SCN[S.wx==='fc'?'fair':S.wx]||SCN.fair,w=sc.wind(WF.ridge,t),cw=HP.climWind(D.clim,`2001-${String(S.mon).padStart(2,'0')}-15`,S.wx==='fc'?'fair':S.wx),st=wst(t),
      up=vec(w.v,cw?cw.dir:w.dir);b={u:up[0],v:up[1],gf:Math.max(0,w.g-w.v)*.85,stab:S.wx==='sea'||!sunUp?.15:S.wx==='fair'?.6:.9,pts:null,sunUp,sun:sunUp?Math.min(1,sn.y*2.5)*(st.sunAmt||0):0,src:cw?'clim':'type',clim:cw}}
  // match the forecast near the ground: at each forecast point, how much stronger and turned the forecast is than this model nearby
  if(b.pts){for(const p of b.pts){let mu=0,mv=0;for(let a=-1;a<=1;a++)for(let c=-1;c<=1;c++){const w=windRaw(b,p.px+a*1200/MPP,p.py+c*1200/MPP,10);mu+=w[0];mv+=w[1]}
      const ms=Math.hypot(mu,mv)/9,ts=Math.hypot(p.u,p.v);p.r=Math.log(Math.min(3,Math.max(.3,(ts+1)/(ms+1))));let da=Math.atan2(p.u,p.v)-Math.atan2(mu,mv);da=Math.atan2(Math.sin(da),Math.cos(da));p.da=Math.max(-1.3,Math.min(1.3,da))}}
  if(WFC.size>600)WFC.clear();WFC.set(key,b);return b}
// the model's wind (east, north, km/h) before matching the forecast; agl: metres above the ground
function windRaw(b,px,py,agl){const s=b.stab,lo=WF.lo,hi=WF.hi,f=(F,k)=>wfAt(F[0][k],px,py)*(1-s)+wfAt(F[1][k],px,py)*s;
  let e=b.u*(wfAt(lo[0][0],px,py)*(1-s)+wfAt(hi[0][0],px,py)*s)+b.v*(wfAt(lo[1][0],px,py)*(1-s)+wfAt(hi[1][0],px,py)*s),
      nn=b.u*(wfAt(lo[0][1],px,py)*(1-s)+wfAt(hi[0][1],px,py)*s)+b.v*(wfAt(lo[1][1],px,py)*(1-s)+wfAt(hi[1][1],px,py)*s);
  const ex=wfAt(WF.E,px,py),k=1-Math.exp(-Math.max(0,agl-10)/280),near=(.48+.52*ex)*(1-k)+k;e*=near;nn*=near;
  const sp=Math.hypot(e,nn);if(sp>.1&&k<.99){const up=(wfAt(WF.GE,px,py)*e+wfAt(WF.GN,px,py)*nn)/sp,ww=Math.min(1.3,Math.max(.65,1+.9*up));e*=1+(ww-1)*(1-k);nn*=1+(ww-1)*(1-k);
    const c=wfAt(WF.CH,px,py)*(1-k);if(c>.02){let ax=wfAt(WF.AE,px,py),an=wfAt(WF.AN,px,py);const al=Math.hypot(ax,an)||1;ax/=al;an/=al;let d=(e*ax+nn*an)/Math.hypot(e,nn);if(d<0){ax=-ax;an=-an;d=-d}
      const s2=Math.hypot(e,nn)*(.35+.65*d);e+=(ax*s2-e)*c;nn+=(an*s2-nn)*c}}
  // the slope breeze, strongest when the wind above is light
  const calm=Math.max(0,1-Math.hypot(b.u,b.v)/24)*(1-k);if(calm>0){const se=wfAt(WF.SE,px,py),sn=wfAt(WF.SN,px,py),A=b.sunUp?9*b.sun:-6;e+=se*A*calm;nn+=sn*A*calm}
  return[e,nn,ex]}
// the wind at a point of the map on a day and time: speed and gusts in km/h, the direction it comes from in degrees, and its east and north parts
function windAt(px,py,day,t,agl=10){const b=windBase(day,t),w=windRaw(b,px,py,agl);let[e,nn]=w,gf=b.gf;
  if(b.pts&&b.pts.length){let sw=0,r=0,da=0,g=0;for(const p of b.pts){const d2=((p.px-px)**2+(p.py-py)**2)*MPP*MPP,q=1/(d2+2.25e6);sw+=q;r+=p.r*q;da+=p.da*q;g+=p.gf*q}
    r=Math.exp(r/sw);da/=sw;gf=g/sw;const c=Math.cos(da),s=Math.sin(da),e2=(e*c+nn*s)*r,n2=(-e*s+nn*c)*r;e=e2;nn=n2}
  const v=Math.hypot(e,nn);return{v,g:v+gf*(.85+.3*w[2])*Math.min(1,.4+v/Math.max(8,Math.hypot(b.u,b.v))),dir:(Math.atan2(-e,-nn)*180/Math.PI+360)%360,e,n:nn}}
function cond(i,t){
  const z=R.e[i],px=R.x[i],py=R.y[i],ex=EXPO?EXPO[i]:1,st=stAt(i,t),nz=(vnoise(px*.004,py*.004)-.5)*200;
  let T,v,g,dir,inC=false,fog=false,pr=0,thd=null,wet=!!st.wetAll,hail=false;
  if(S.wx==='fc'&&st.f){const f=st.f;T=f.T+(f.z-z)*.0065;v=(f.ws||0)*ex;g=Math.max(f.wg||0,v*1.3)*ex;dir=f.wd||0;pr=f.pr>.05?f.pr:0;
    if(f.code>=95)thd=1500;if(f.code===96||f.code===99)hail=true}
  else{const sc=SCN[S.wx==='fc'?'plain':S.wx],w=sc.wind(z,t);T=sc.T(z,t);v=w.v*ex;g=w.g*ex;dir=w.dir}
  if(WF&&S.wx!=='plain'&&!(S.wx==='fc'&&!st.f)){const w=windAt(px,py,R.day[i],t);v=w.v;g=Math.max(w.g,v*1.15);dir=w.dir}
  if(S.wx!=='fc'&&st.cells)for(const c of st.cells){const d=Math.hypot(px-c.x,py-c.y)*MPP;
    T-=7*Math.exp(-((d/(c.R*1.7))**2))*c.Iw;const core=Math.exp(-((d/c.R)**2))*c.Ir;if(core>.03){pr=Math.max(pr,35*core);if(core>.5&&c.I>.6)hail=true}
    if(c.lit&&(thd===null||d<thd))thd=d;if(z>GW.cuBase()-400&&d<c.R*1.1&&c.I>.35)inC=true;g=Math.max(g,(20+60*c.I)*Math.exp(-((d/(c.R*2.6))**2)));if(c.age>.7&&d<c.R*2)wet=true}
  if(st.deck&&z>st.deck.base+nz&&z<st.deck.top)inC=true;
  if(st.fog&&st.fog.amt>.25&&z<st.fog.top+nz*.4){inC=true;fog=true}
  if(S.wx!=='fc'){if(st.rain)pr=Math.max(pr,st.rain*(.8+.4*vnoise(px*.01,py*.01)));if(st.drizzle&&inC)pr=Math.max(pr,st.drizzle)}
  let pt='';if(pr>.05){pt=hail?'hail':z>st.sl+150?'snow':z>st.sl-150?'sleet':(st.drizzle&&pr<.6)?'drizzle':'rain';wet=true}
  if(st.drizzle&&inC)wet=true;
  let trail=wet?'wet':'dry';if(st.snow&&z>st.snow+nz)trail=(T<.5||t<10.5)?'icy':'snow';else if(pt==='snow')trail='snow';
  const vis=inC?(fog?120:st.vis||60):pr>15?1500:pr>.05?6000:(st.clar||.8)>.9?120000:(st.clar||.8)>.6?60000:25000;
  const feels=T<=10&&v>4.8?13.12+.6215*T-11.37*Math.pow(v,.16)+.3965*T*Math.pow(v,.16):T;
  return{T,feels,v,g,dir,inC,fog,pr,pt,thd,trail,vis,st}}
function shadeAt(px,py,z,sn){if(sn.y<=.01)return true;const hl=Math.hypot(sn.x,sn.z),ux=sn.x/hl,uy=sn.z/hl,te=sn.y/hl;let d=40;
  while(d<14000){const qx=px+ux*d/MPP,qy=py+uy*d/MPP;if(qx<0||qy<0||qx>TER.W||qy>TER.H)break;if(TER.at(qx,qy)>z+3+d*te)return true;d=d*1.13+10}return false}
// slowdown on wet, snowy or icy path: same steepness steps as always (about 6°, 11° and 17°), so walking times do not change
function slowF(i,c){const g=SLOPE[i],s=D.sacKnown?R.sac[i]:g<5.71?1:g<11.31?2:g<16.7?3:4;let f=1;
  if(c.trail==='wet')f*=s>=3?1.2:s===2?1.1:1.04;else if(c.trail==='snow')f*=s>=3?1.7:s===2?1.45:1.25;else if(c.trail==='icy')f*=s>=3?2:s===2?1.6:1.3;
  if(c.inC&&c.vis<200)f*=1.1;if(c.g>65&&EXPO[i]>1.05)f*=1.12;if(c.T>26&&i+1<N&&R.e[i+1]>R.e[i])f*=1.1;return f}
function computeTimes(){const st=startH(),br=S.breaks?7/6:1,on=S.wx!=='plain';
  for(const d of DAYS){WALK[d.i0]=0;BASEW[d.i0]=0;CLK[d.i0]=st;
    for(let i=d.i0+1;i<=d.i1;i++){const dt=(R.t[i]-R.t[i-1])*S.pace;BASEW[i]=BASEW[i-1]+dt;const f=on?slowF(i-1,cond(i-1,CLK[i-1])):1;WALK[i]=WALK[i-1]+dt*f;CLK[i]=st+WALK[i]*br}}
  for(let i=0;i<N;i++)SHADE[i]=shadeAt(R.x[i],R.y[i],R.e[i],sunAt(CLK[i],R.day[i]))?1:0}
const DIRS=['N','NE','E','SE','S','SW','W','NW'];
const tt=x=>`${Math.round(x)} °C`.replace('-','−');
const highNear=i=>R.e[i]>GW.high;
function skyWord(c,i,t){const st=c.st,sn=sunAt(t,R.day[i]);let w;
  if(st.nofc)return'<span class="mute">No forecast for this hour yet</span>';
  if(c.thd!=null&&c.thd<3000)w=`<span class="bad">Thunderstorm overhead</span>: lightning, ${c.pt==='hail'?'hail and ':''}${c.pr>15?'torrential rain':'heavy rain'}`;
  else if(c.pt)w=c.pt==='snow'?'<span class="warn">Snow falling</span>':c.pt==='sleet'?'<span class="warn">Sleet</span>':c.pt==='drizzle'?'Drizzle':c.pt==='hail'?'<span class="bad">Hail and heavy rain</span>':c.pr>8?'<span class="warn">Heavy rain</span>':`Rain, about ${Math.max(1,Math.round(c.pr))} mm an hour`;
  else if(c.inC)w=c.fog?`<span class="warn">In the fog</span>, about 100 m visibility`:`<span class="warn">In cloud</span>, 50–100 m visibility`;
  else if(sn.y<=0)w='Dark';else if(st.over)w='Overcast';else if(st.deckShade&&st.deck&&R.e[i]<st.deck.top)w='Under the cloud, grey';
  else if(SHADE[i])w='In the shade of the mountains';
  else w=(st.cu&&st.cu.cover>.2)||(st.cells&&st.cells.some(q=>q.I>.2))?'Sun, clouds building':st.windVis>.8?'Sunny, very clear air':'Sunny';
  if(c.inC&&c.pt&&!(c.thd!=null&&c.thd<3000))w+=c.fog?'':', in cloud';
  if(c.thd!=null&&c.thd>=3000&&c.thd<15000)w+=` · <span class="warn">thunder ${Math.round(c.thd/1000)} km away</span>`;return w}
function trailWord(c){return c.trail==='wet'?'Wet path, slippery':c.trail==='snow'?'<span class="warn">Snow on the path</span>':c.trail==='icy'?'<span class="bad">Icy snow on the path</span>':''}

/* ---------- open and close ---------- */
function close(){if(AC){AC.abort();AC=null}ROs.forEach(r=>r.disconnect());ROs=[];if(V3&&V3.dispose)V3.dispose();V3=null;window.V3=null;WXC.clear();tzCache.clear();HGT=null;SAFE=null;SAFEK='';TRAILRUN=null}
function open(plan,blobs,cb){
  close();D=plan;BLOBS=blobs||{};onChange=cb;AC=new AbortController();const sig={signal:AC.signal};
  S=Object.assign({day:0,i:-1,start:'07:00',pace:1,breaks:true,wx:'fair',mon:7,ex:1.5,map:'topo',color:'day'},D.set||{});
  if(!BLOBS.topo&&S.map==='topo')S.map='relief';
  R=D.route;N=R.x.length;DAYS=D.days;PTS=D.points;OFFICIAL=D.official||{};MPP=D.mpp;
  const g=D.grid,GC=g.cols,GR=g.rows,GS=g.step,ht=g.h;
  TER={ht,GC,GR,GS,W:D.w,H:D.h,at(px,py){const gx=Math.min(Math.max((px-.5)/GS,0),GC-1.001),gy=Math.min(Math.max((py-.5)/GS,0),GR-1.001),c=Math.floor(gx),r=Math.floor(gy),fx=gx-c,fy=gy-r,k=r*GC+c;return ht[k]*(1-fx)*(1-fy)+ht[k+1]*fx*(1-fy)+ht[k+GC]*(1-fx)*fy+ht[k+GC+1]*fx*fy}};
  WALK=new Float64Array(N);BASEW=new Float64Array(N);CLK=new Float64Array(N);SHADE=new Uint8Array(N);EXPO=new Float32Array(N);STEEP=new Uint8Array(N);SLOPE=new Float32Array(N);
  for(let i=0;i<N;i++){let s=0,n=0;for(let k=0;k<12;k++){const a=k/12*Math.PI*2;for(const rr of[350,700]){s+=TER.at(R.x[i]+Math.cos(a)*rr/MPP,R.y[i]+Math.sin(a)*rr/MPP);n++}}EXPO[i]=1+Math.max(-.35,Math.min(.3,(R.e[i]-s/n)/350));
    const a=Math.max(0,i-5),b=Math.min(N-1,i+5),deg=Math.atan(Math.abs(R.e[b]-R.e[a])/Math.max(1,(R.d[b]-R.d[a])*1000))*180/Math.PI,dr=Math.round(deg);SLOPE[i]=deg;STEEP[i]=dr<5?1:dr<10?2:dr<15?3:dr<20?4:5}
  if(D.fc){FCP=new Uint8Array(N);const fx=D.fc.pts.map(p=>p.i);for(let i=0;i<N;i++){let b=0,bd=1e9;fx.forEach((j,k)=>{const dd=Math.abs(R.d[j]-R.d[i]);if(dd<bd){bd=dd;b=k}});FCP[i]=b}}else FCP=null;
  if(S.wx==='fc'&&!fcUsable())S.wx='fair';if(!SCN[S.wx])S.wx='fair';
  setupGeo();windSetup();resetDays();
  // controls
  $('#vname').textContent=D.name;$('#vdate').value=D.date;$('#start').value=S.start;$('#pace').value=String(S.pace);$('#breaks').checked=S.breaks;
  $('#mon').innerHTML=MONN.slice(1).map((m,k)=>`<option value="${k+1}">${m}</option>`).join('');$('#mon').value=String(S.mon);
  $('#ndays').innerHTML=Array.from({length:Math.min(10,Math.max(1,Math.floor(N/40)))},(_,k)=>`<option value="${k+1}">${k+1} day${k?'s':''}</option>`).join('');$('#ndays').value=String(DAYS.length);
  renderWxChips();
  $('#wchips').addEventListener('click',e=>{const b=e.target.closest('.wchip');if(!b||b.getAttribute('aria-disabled')==='true'){if(b)HP.toast(b.title);return}S.wx=b.dataset.wx;WXC.clear();renderWxChips();refreshTimes();save()},sig);
  $('#mon').addEventListener('change',e=>{S.mon=+e.target.value;WXC.clear();refreshTimes();save()},sig);
  $('#start').addEventListener('change',e=>{S.start=e.target.value||'07:00';refreshTimes();save()},sig);
  $('#pace').addEventListener('change',e=>{S.pace=+e.target.value;refreshTimes();save()},sig);
  $('#breaks').addEventListener('change',e=>{S.breaks=e.target.checked;refreshTimes();save()},sig);
  $('#ndays').addEventListener('change',e=>{HP.splitDays(D,+e.target.value);resetDays();LKC.clear();renderWxChips();refreshTimes();if(V3)V3.dayChanged(true);save();if(D.fc&&DAYS.length*24>D.fc.n&&navigator.onLine)updateForecast(false)},sig);
  $('#vdate').addEventListener('change',e=>{if(!e.target.value)return;D.date=e.target.value;S.mon=parseDay(D.date).getMonth()+1;$('#mon').value=String(S.mon);D.fc=null;D.ens=null;LKC.clear();FCP=null;if(S.wx==='fc')S.wx='fair';WXC.clear();tzCache.clear();renderWxChips();refreshTimes();save();updateForecast(true)},sig);
  $('#chips').addEventListener('click',e=>{const b=e.target.closest('.chip');if(b)selectDay(+b.dataset.day,true)},sig);
  $('#readout').addEventListener('click',e=>{const b=e.target.closest('[data-night]');if(b)moveNight(S.i)},sig);
  $('#fcbtn').addEventListener('click',()=>updateForecast(true),sig);
  $('#play').textContent='▶ Walk';$('#profsub').textContent='All days';$('#hint').style.opacity='';
  refreshTimes();
  const ro=new ResizeObserver(()=>drawProfile());ro.observe($('#prof'));ROs.push(ro);
  setupProfile(sig);
  $('#msg').hidden=false;$('#msg').textContent='Building the 3D view…';
  try{init3D(sig)}catch(err){$('#msg').hidden=false;$('#msg').textContent='The 3D view needs WebGL, which this browser could not start. The briefing, profile and table below still work.';console.error(err)}
  const fw=HP.forecastWindow(D.date);if(fw.ok&&navigator.onLine&&(!D.fc||!D.ens||Date.now()-D.fc.issued>3*3600e3||!D.fc.pts.some(p=>p.h.w8s&&p.h.w8s.length)))updateForecast(false);
  if(D.clim&&!D.clim.rough&&!D.clim.wd&&navigator.onLine&&HP.fetchClimWind)HP.fetchClimWind(D.clim,D.center.lat,D.center.lon,AC.signal).then(w=>{if(!w||!R||!D.clim)return;Object.assign(D.clim,w);WFC.clear();WXC.clear();LKC.clear();refreshTimes();save()}).catch(()=>{});
  if(navigator.onLine&&D.clim&&!D.clim.cls)refreshClimate();
  runTrail(false);fetchHuts();fetchBack(false);addEventListener('online',()=>{runTrail(false);fetchHuts();fetchBack(false)},sig);
}
async function refreshClimate(){const plan=D,z=plan.clim.z||[plan.terr.min,plan.terr.max];
  try{const c=await HP.fetchClimate(plan.center.lat,plan.center.lon,z[0],z[1]);if(plan!==D)return;D.clim=c;D.tz=D.tz||c.tz;LKC.clear();WXC.clear();renderWxChips();refreshTimes();save()}catch(e){console.warn('climate',e)}}
const fcUsable=()=>!!(D.fc&&D.fc.pts&&D.fc.pts.length&&D.fc.start&&D.fc.start.slice(0,10)===D.date);
// how likely each weather type is, for the chosen day or the whole hike (cached; the record or the forecast runs)
let LKC=new Map();
function likely(){const key=[D.date,S.day,DAYS.length,D.ens?D.ens.issued:0,D.clim&&D.clim.cls?D.clim.cls.length:0].join('|');let v=LKC.get(key);
  if(v===undefined){v=S.day?HP.wxDay(D,S.day-1):HP.wxTrip(D);if(LKC.size>40)LKC.clear();LKC.set(key,v)}return v}
function renderWxChips(){const fw=HP.forecastWindow(D.date),ok=fcUsable(),L=likely(),pc=L&&L.pct;
  let keys=Object.keys(SCN);if(pc){const sc=keys.filter(k=>k in pc).sort((a,b)=>pc[b]-pc[a]);keys=['fc','plain',...sc,...keys.filter(k=>!(k in pc)&&k!=='fc'&&k!=='plain')]}
  $('#wchips').innerHTML=keys.map(k=>{const s=SCN[k],dis=k==='fc'&&!ok,ttl=dis?(fw.ok?'The forecast is loading or could not be downloaded':fw.days>15?`The forecast appears 16 days before your start (in ${fw.days-15} days)`:'This date has passed'):'';
    const p=pc&&k in pc?`<span class="pc">${pc[k]}%</span>`:'';
    let tip=ttl;if(!dis)try{tip=DESC[k](MONN[S.mon]).replace(/<[^>]+>/g,'')}catch(e){}
    return`<button class="wchip${k==='fc'?' fc':''}" data-wx="${k}" aria-pressed="${k===S.wx}" aria-disabled="${dis}" title="${esc(tip)}"><svg viewBox="0 0 24 24" aria-hidden="true">${ICON[s.icon]}</svg>${s.name}${p}</button>`}).join('');
  $('#monlab').hidden=S.wx==='fc';$('#fcbtn').hidden=!fw.ok}
let fcBusy=false;
async function updateForecast(manual){const fw=HP.forecastWindow(D.date);if(!fw.ok){if(manual)HP.toast(fw.days>15?'The forecast appears 16 days before your start date.':'This date has passed.');return}
  if(fcBusy)return;fcBusy=true;
  const b=$('#fcbtn');b.disabled=true;b.textContent='Updating…';
  try{const plan=D,[fr,er]=await Promise.allSettled([HP.fetchForecast(plan),HP.fetchEnsemble(plan)]);if(plan!==D)return;if(er.status==='fulfilled'&&er.value){D.ens=er.value;LKC.clear()}if(fr.status!=='fulfilled')throw fr.reason;const fc=fr.value;D.fc=fc;D.tz=D.tz||fc.tz;const fx=fc.pts.map(p=>p.i);FCP=new Uint8Array(N);for(let i=0;i<N;i++){let bi=0,bd=1e9;fx.forEach((j,k)=>{const dd=Math.abs(R.d[j]-R.d[i]);if(dd<bd){bd=dd;bi=k}});FCP[i]=bi}
    if(manual||S.wx==='fair')S.wx='fc';WXC.clear();renderWxChips();refreshTimes();save();if(manual)HP.toast('Forecast updated')}
  catch(e){if(manual)HP.toast('Could not update the forecast: '+e.message)}finally{fcBusy=false;b.disabled=false;b.textContent='Update forecast'}}
function resetDays(){DAYS=D.days;overnight={};const DC=HP.look?HP.look.routeColors():DAYC;DAYS.forEach((d,k)=>{d.color=DC[k%DC.length];if(k<DAYS.length-1)overnight[d.i1]=d.n});if(S.day>DAYS.length)S.day=0;
  $('#chips').innerHTML=`<button class="chip" data-day="0" aria-pressed="${!S.day}">All</button>`+DAYS.map(d=>`<button class="chip" data-day="${d.n}" style="--c:${d.color}" aria-pressed="${S.day===d.n}" title="${esc(d.from)} → ${esc(d.to)}"><i></i>Day ${d.n}</button>`).join('');
  $('#ndays').value=String(DAYS.length);if(V3&&V3.relabel)V3.relabel()}
function moveNight(i){if(DAYS.length<2||i<0)return;const ends=DAYS.slice(0,-1).map(d=>d.i1);let k=0,bd=1e9;ends.forEach((e,j)=>{const dd=Math.abs(e-i);if(dd<bd){bd=dd;k=j}});
  const lo=k?ends[k-1]+30:30,hi=k<ends.length-1?ends[k+1]-30:N-31;ends[k]=Math.max(lo,Math.min(hi,i));HP.splitDays(D,DAYS.length,ends);resetDays();refreshTimes();if(V3)V3.dayChanged(false);save();HP.toast(`Night ${k+1} moved`)}

const topWx=d=>{const L=HP.wxDay(D,d.n-1);if(!L||!L.pct)return'';const k=HP.WXK.reduce((a,b)=>L.pct[b]>L.pct[a]?b:a);return`<span class="tw"><i style="--c:${HP.WXT[k].c}"></i>${HP.WXT[k].name} ${L.pct[k]}%</span>`};
function refreshTimes(){
  computeTimes();
  const km=R.d[N-1],up=DAYS.reduce((s,d)=>s+d.up,0),hrs=DAYS.reduce((s,d)=>s+WALK[d.i1],0);
  $('#figs').innerHTML=[[DAYS.length,DAYS.length>1?'days':'day'],[km.toFixed(km<20?1:0),'km'],[nf.format(Math.round(up/10)*10),'m up'],[fmtH(hrs).replace(' 00',''),'walking']].map(([v,l])=>`<li><b>${v}</b><span>${l}</span></li>`).join('');
  const hi=d=>{let m=d.max;PTS.forEach(p=>{if(R.day[p.i]===d.n&&OFFICIAL[p.name])m=Math.max(m,OFFICIAL[p.name])});return m};
  // the table: each day's numbers, and its effort (km-effort) as a number and a bar
  let tk=0,tu=0,td=0,th=0;const emax=Math.max(40,...DAYS.map(d=>HP.effort(d.km,d.up)));
  $('#tbl tbody').innerHTML=DAYS.map(d=>{const w=WALK[d.i1],x=w-BASEW[d.i1],e=HP.effort(d.km,d.up);tk+=d.km;tu+=d.up;td+=d.down;th+=w;
    return `<tr><td><span class="dot" style="--c:${d.color}"></span>Day ${d.n}<small>${esc(d.from)} → ${esc(d.to)}</small></td><td class="n">${d.km.toFixed(1)}</td><td class="n">${nf.format(d.up)}</td><td class="n">${nf.format(d.down)}</td><td class="n">${nf.format(hi(d))}</td><td class="n"${w>8?` style="color:var(--${w>10?'bad':'fair'})" title="A long day: over ${w>10?10:8} hours of walking"`:''}>${fmtH(w)}${x>4/60?`<small title="Extra time for the weather">+${fmtH(x)}</small>`:''}</td><td class="n eff"><b>${Math.round(e)}</b><i style="width:${(e/emax*100).toFixed(0)}%"></i></td></tr>`}).join('')+
    (DAYS.length>1?`<tr class="tot"><td>Total</td><td class="n">${tk.toFixed(1)}</td><td class="n">${nf.format(tu)}</td><td class="n">${nf.format(td)}</td><td class="n"></td><td class="n">${fmtH(th)}</td><td class="n"><b>${Math.round(HP.effort(tk,tu))}</b></td></tr>`:'');
  $('#vsrc').textContent=`Temperatures: ${D.clim.src}.${D.fc?` Forecast: Open-Meteo, ${new Date(D.fc.issued).toLocaleString('en-GB',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'})}.`:''}`;
  updateReadout();drawProfile();renderBrief();renderCards();if(V3)V3.times();
}
function selectDay(n,fly){
  S.day=n;$$('.chip').forEach(b=>b.setAttribute('aria-pressed',String(+b.dataset.day===n)));
  $('#profsub').textContent=n?`Day ${n}`:'All days';
  drawProfile();renderBrief();renderCards();renderWxChips();if(V3)V3.dayChanged(fly);
  if(n&&(S.i<0||R.day[S.i]!==n))setIndex(DAYS[n-1].i0)}
function setIndex(i){S.i=i;updateReadout();updateCursor();if(V3)V3.mark()}
function updateReadout(){
  const el=$('#readout');el.classList.toggle('empty',S.i<0||!R);if(S.i<0||!R){el.innerHTML=`<p class="rempty micro">${matchMedia('(hover: none)').matches?'Tap the line or the profile':'Point at the line or the profile'}</p>`;return}
  const i=S.i,d=dayOf(i),km=R.d[i]-R.d[d.i0],at=PTS.find(p=>Math.abs(p.i-i)<=3),nx=PTS.find(p=>p.i>i+3&&R.day[p.i]===d.n&&p.kind!=='high'),ele=Math.round(R.e[i]),c=cond(i,CLK[i]),plain=S.wx==='plain';
  TAGT=plain?'':` · ${tt(c.T)}`;const gust=c.g>c.v*1.25?`, gusts ${Math.round(c.g/5)*5}`:'',tw=plain?'':trailWord(c);
  const sd=Math.round(SLOPE[i]),up=R.e[Math.min(N-1,i+5)]>=R.e[Math.max(0,i-5)],gc=D.sacKnown?SACC[R.sac[i]]:STC[STEEP[i]];
  const night=DAYS.length>1&&!overnight[i]?`<button class="mini" data-night>Move the night here</button>`:'';
  el.innerHTML=`<p class="rh micro" style="--c:${d.color}"><i></i>Day ${d.n}${at?` · ${esc(at.name)}`:''}${S.wx==='fc'?` · ${fmtDate(isoDay(dayDate(d.n)))}`:''}</p>`+
   `<div class="rbig"><b>${nf.format(ele)}</b><span>m</span></div>`+
   `<ul class="rstats"><li><b>${km.toFixed(1)}</b><span>km</span></li><li><b>${fmtClock(clock(i))}</b><span>time</span></li><li><b>${fmtH(walk(i)).replace(/ (min|h)/,'<small> $1</small>')}</b><span>walked</span></li>`+
   `<li><b style="color:${gc}">${sd<1?'0°':`${sd}° ${up?'↑':'↓'}`}</b><span>${D.sacKnown&&R.sac[i]?SACN[R.sac[i]].split(' ')[0]:'slope'}</span></li><li><b>${deg(c.T)}</b><span>${plain?'average':c.feels<c.T-1.5?`feels ${deg(c.feels)}`:'air'}</span></li></ul>`+
   `<p class="rn">${nx?`Next: ${esc(nx.name)} · ${fmtH(walk(nx.i)-walk(i))}`:'End of the day'}</p>`+
   (plain?'':`<p class="rw">${skyWord(c,i,CLK[i])} · wind ${Math.round(c.v)} km/h from ${HP.compass(c.dir)}<i class="warr" data-to="${Math.round((c.dir+180)%360)}" aria-hidden="true"></i>${gust}${tw?` · ${tw}`:''}</p>`)+night}

/* ---------- briefing ---------- */
function placeName(i){const d=dayOf(i);let best=null,bd=1.2;for(const p of PTS){if(p.kind==='high')continue;if(R.day[p.i]!==d.n&&p.i!==d.i0-1)continue;const dd=Math.abs(R.d[p.i]-R.d[i]);if(dd<bd){bd=dd;best=p}}return best?best.name:`km ${(R.d[i]-R.d[d.i0]).toFixed(1)}`}
function stormOnset(d){if(S.wx==='fc'){for(let i=d.i0;i<=d.i1;i+=4){const c=cond(i,CLK[i]);if(c.thd!=null&&c.thd<8000)return CLK[i]}return 99}
  let on=99;for(const c of CELLS){const t=c.t0+.75,q=cellAt(c,t);for(let i=d.i0;i<=d.i1;i+=15){if(Math.hypot(R.x[i]-q.x,R.y[i]-q.y)*MPP<12000){on=Math.min(on,t);break}}}return on}
/* ---------- huts and refuges (since 2.3): phone, website, season and booking, from OpenStreetMap ---------- */
const MON3=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
// the season in an opening_hours tag: month ranges that are open, and those marked off or closed
function seasonOf(oh){if(!oh)return null;if(/24\/7/.test(oh))return{all:true,open:[],shut:[]};const open=[],shut=[];
  const re=/(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)(?:\s*(\d{1,2})(?!\d|:\d))?(?:\s*-\s*(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)(?:\s*(\d{1,2})(?!\d|:\d))?)?/g;
  for(const rule of oh.split(/;|\|\|/)){const off=/\b(off|closed)\b/i.test(rule);let m;re.lastIndex=0;
    // "Jun 20-Oct 10", "May-Oct", or one day ("Dec 25 off")
    while((m=re.exec(rule))){const a=MON3.indexOf(m[1]),s0=a*100+(m[2]?+m[2]:1),e0=m[3]?MON3.indexOf(m[3])*100+(m[4]?+m[4]:31):m[2]?s0:a*100+31;(off?shut:open).push([s0,e0])}}
  return open.length||shut.length?{open,shut}:null}
function openOn(s,date){if(!s)return null;if(s.all)return true;const k=date.getMonth()*100+date.getDate(),inR=([a,b])=>a<=b?k>=a&&k<=b:k>=a||k<=b;
  if(s.shut.some(inR))return false;return s.open.length?s.open.some(inR):true}
const seasonText=s=>s&&s.open.length?s.open.map(([a,b])=>`${MON3[a/100|0]}${a%100>1?' '+a%100:''}–${MON3[b/100|0]}${b%100<28?' '+b%100:''}`).join(', '):'';
const telOf=p=>String(p).replace(/[^\d+]/g,'');
function hutLine(name){const h=(D.huts||{})[name];if(!h)return'';const s=seasonOf(h.open),bits=[];
  if(h.phone)bits.push(`<a href="tel:${telOf(h.phone)}">${esc(h.phone)}</a>`);if(h.web)bits.push(`<a href="${esc(h.web)}" target="_blank" rel="noopener">website</a>`);
  if(h.beds)bits.push(`${h.beds} beds`);if(seasonText(s))bits.push(`open ${seasonText(s)}`);if(/yes|required|recommended/.test(h.book||''))bits.push('book ahead');
  return bits.join(' · ')}
// the details of an older hike's huts, once, with a connection
async function fetchHuts(){if(D.hutsAt||!navigator.onLine||!HP.hutInfo||!D.points.some(p=>/hut|camp|shelter/.test(p.kind)))return;const plan=D;
  try{const h=await HP.hutInfo(plan,AC&&AC.signal);if(plan!==D)return;D.huts=h;D.hutsAt=Date.now();save();renderBrief()}catch(e){if(e&&e.name!=='AbortError')console.warn('huts',e)}}

/* ---------- getting back (since 2.4): by train and bus, by road, or on foot the same way ---------- */
let BACKRUN=false,BACKT=0;
const isLoop=()=>HP.geo.hav(R.lat[0],R.lon[0],R.lat[N-1],R.lon[N-1])<400;
// what the transport back depends on: the dates, both ends, and roughly when you arrive (the list covers some hours around it)
const backKey=()=>[D.date,DAYS.length,Math.round(CLK[N-1]/2),R.lat[N-1].toFixed(4),R.lon[N-1].toFixed(4),R.lat[0].toFixed(4),R.lon[0].toFixed(4)].join('|');
async function fetchBack(force){if(BACKRUN||!R||!CLK||isLoop()||!navigator.onLine||!HP.backTrip)return;const B=D.back,k=backKey(),last=hikeDate(DAYS.length),t0=new Date();t0.setHours(0,0,0,0);
  if(last<t0)return;   // the hike is over
  if(!force&&B&&B.key===k&&Date.now()-B.at<7*864e5)return;
  if(!force&&D.backErr&&Date.now()-D.backErr<10*60e3)return;   // after a failure, try again ten minutes later
  const plan=D;BACKRUN=true;renderBackCard();
  try{const r=await HP.backTrip(plan,{date:isoDay(last),arr:CLK[N-1],key:k},AC&&AC.signal);if(plan!==D)return;D.back=r;delete D.backErr;save()}
  catch(e){if(plan===D&&!(e&&e.name==='AbortError')){D.backErr=Date.now();console.warn('getting back',e)}}
  finally{BACKRUN=false;if(plan===D&&R){renderBackCard();HP.viewer.onBack&&HP.viewer.onBack()}}}
// the same way back on foot: the route turned round and timed with the same model (the climbs become descents and the other way
// round), sleeping at the same places in reverse, from the day after the last day
const revSeg=i=>{const hz=(R.d[i]-R.d[i-1])/4,de=R.e[i-1]-R.e[i],vt=de>0?de/300:-de/500;return(Math.max(hz,vt)+Math.min(hz,vt)/2)*S.pace};   // from point i back to i−1
const revT=(a,b)=>{let h=0;for(let i=a;i>b;i--)h+=revSeg(i);return h};
function backWalk(){const st=startH(),br=S.breaks?7/6:1,n=DAYS.length,out=[];
  for(let k=n-1;k>=0;k--){const d=DAYS[k],nb=n-k;let h=0,up=0,dn=0,top=R.e[d.i1];
    for(let i=d.i1;i>d.i0;i--){h+=revSeg(i);const de=R.e[i-1]-R.e[i];if(de>0)up+=de;else dn-=de;if(R.e[i-1]>top)top=R.e[i-1]}
    const date=hikeDate(n+nb),sun=HP.sunTimes(D.center.lat,D.center.lon,date,D.tz);
    out.push({n:nb,from:d.to,to:d.from,a:d.i1,b:d.i0,km:R.d[d.i1]-R.d[d.i0],up,dn,top,h,start:st,arr:st+h*br,date,set:sun.set,wx:HP.wxDay(D,n+nb-1),color:d.color})}
  return out}
// rises of 150 m or more on the way back, allowing dips of up to 40 m (as on the profile page, the other way round)
function backClimbs(W){const cl=[];for(const w of W){let mn=w.a,mx=w.a;
    for(let i=w.a-1;i>=w.b;i--){if(R.e[i]<R.e[mn]&&R.e[mx]-R.e[mn]<150){mn=i;mx=i;continue}if(R.e[i]>R.e[mx])mx=i;
      if(R.e[mx]-R.e[i]>40||i===w.b){if(R.e[mx]-R.e[mn]>=150)cl.push({a:mn,b:mx,g:R.e[mx]-R.e[mn],t:revT(mn,mx),w});mn=i;mx=i}}}
  return cl}
// where a place on the way out lies on the way back: the day back and the km into it
const backWhere=i=>{const n=DAYS.length,d=DAYS[R.day[i]-1];return{n:n-d.n+1,km:R.d[d.i1]-R.d[i]}};
// the kinds of transport, in words (Swiss timetable categories)
const PTK={IC:'train',ICN:'train',IR:'train',ICE:'train',EC:'train',EN:'night train',TGV:'train',RJX:'train',RE:'regional train',R:'regional train',S:'S-Bahn',SN:'night S-Bahn',
  PE:'panorama train',EXT:'special train',B:'bus',BUS:'bus',NFB:'bus',KB:'minibus',EV:'replacement bus',TX:'taxi',CC:'rack railway',FUN:'funicular',PB:'cable car',
  GB:'gondola',SL:'chairlift',BAT:'boat',BAV:'boat',FAE:'ferry',T:'tram',NFT:'tram',M:'metro'};
const legName=l=>{const w=PTK[l.k]||l.k||'transport',bus=/^(B|BUS|NFB|KB|EV|T|NFT)$/.test(l.k),id=l.n?(bus?l.n:`${l.k} ${l.n}`):'';return(w[0].toUpperCase()+w.slice(1))+(id?` ${id}`:'')};
const connLegs=c=>`<ul class="legs">${c.legs.map(l=>l.walk?`<li class="lw"><span>walk ${l.walk} min</span></li>`
  :`<li><b>${l.ad}</b><span>${esc(legName(l))}${l.to?` <i>to ${esc(l.to)}</i>`:''}<small>${esc(l.a)}${l.ap?`, platform ${esc(l.ap)}`:''} → ${esc(l.b)} ${l.bd}</small></span></li>`).join('')}</ul>`;
const connLine=c=>`${c.dep} → ${c.arr} · ${fmtH(c.min/60)} · ${c.ch?`${c.ch} ${c.ch>1?'changes':'change'}`:'direct'}`;
const gmaps=(a,b)=>`https://www.google.com/maps/dir/?api=1&origin=${a.lat.toFixed(5)},${a.lon.toFixed(5)}&destination=${b.lat.toFixed(5)},${b.lon.toFixed(5)}&travelmode=transit`;
function renderBackCard(){const el=$('#backcard');if(!el)return;if(!R||!CLK||isLoop()){el.hidden=true;return}el.hidden=false;
  const B=D.back,P=B&&B.pt,W=backWalk(),wt=W.reduce((s,w)=>s+w.h,0),pk=HP.backPick(B,CLK[N-1]),kp=a=>`<ul class="kpis">${a.map(([v,l])=>`<li><b>${v}</b><span>${l}</span></li>`).join('')}</ul>`;
  let h=`<div class="ch"><h2 class="micro">Getting back</h2><span class="micro">to ${esc(DAYS[0].from)}</span></div>`;
  if(pk&&(pk.next||pk.last)){const c=pk.next||pk.last;h+=kp([[pk.next?pk.next.dep:'–','next'],[fmtH(c.min/60),'travel'],[String(c.ch),c.ch===1?'change':'changes'],[pk.last?pk.last.dep:'–','last']]);
    if(pk.missed)h+=`<p class="al bad bkal">You arrive at ${fmtClock(CLK[N-1])}, after the last connection back (${pk.last.dep}).</p>`;
    else if(pk.margin!=null&&pk.margin<.75)h+=`<p class="al warn bkal">The last connection back leaves ${fmtH(pk.margin)} after you can be at the stop.</p>`}
  else if(B&&B.kind==='osm'&&P&&!P.err){const st=P.f.train||P.f.bus,car=B.car&&!B.car.none?B.car:null;
    h+=kp([[car?fmtH(car.min/60):'–','by road'],[car?`${Math.round(car.km)}`:'–','km'],[st?(st.d<1000?`${st.d} m`:`${(st.d/1000).toFixed(1)} km`):'–',st&&P.f.train===st?'to a station':st?'to a bus stop':'no stop near']])}
  else if(B&&B.car&&!B.car.none)h+=kp([[fmtH(B.car.min/60),'by road'],[`${Math.round(B.car.km)}`,'km']])+`<p class="small mute bkal">No train or bus connection found back to ${esc(DAYS[0].from)}.</p>`;
  else if(B)h+=`<p class="small mute">No train or bus connection found back to ${esc(DAYS[0].from)}.</p>`;
  else if(BACKRUN)h+=`<div class="skel sk1"></div><div class="skel sk2"></div>`;
  else h+=`<p class="small mute">${navigator.onLine?'The way back by train and bus shows here.':'The trains and buses back show once the hike opens with a connection.'}</p>`;
  h+=`<p class="small mute bwalk">On foot the same way: ${W.length} ${W.length>1?'days':'day'} · ${fmtH(wt)} walking</p>`;
  el.innerHTML=h}
function backDetail(){if(!R||!CLK)return null;const n=DAYS.length,to=DAYS[0].from,fr=DAYS[n-1].to,arr=CLK[N-1],B=D.back,P=B&&B.pt,pk=HP.backPick(B,arr),W=backWalk(),wt=W.reduce((s,w)=>s+w.h,0),M=[];
  if(isLoop())return{title:'Getting back',html:dHero('0','km','this hike ends where it starts','var(--good)')+`<p class="small mute">Nothing to plan for the way back.</p>`};
  const ld=fmtDate(isoDay(hikeDate(n))),a={lat:R.lat[N-1],lon:R.lon[N-1]},b={lat:R.lat[0],lon:R.lon[0]},car=B&&B.car&&!B.car.none?B.car:null;
  let hero='',pt='';
  // by train and bus (Switzerland)
  if(B&&B.kind==='ch'&&P&&!P.err&&!P.none&&!P.same){const qd=P.typ?fmtDate(P.typ,{weekday:'short',day:'numeric',month:'short',year:'numeric'}):ld;
    const later=pk?P.next.filter(c=>!c.nd&&!c.day&&c!==pk.next&&pk.h(c.dep)>pk.h(pk.next?pk.next.dep:'00:00')&&!(pk.last&&c.dep===pk.last.dep)).slice(0,2):[];
    if(pk&&pk.next)hero=dHero(fmtH(pk.next.min/60),'',`by train and bus to ${esc(to)} · the ${pk.next.dep} from ${esc(P.f.name)}`,pk.missed?'var(--bad)':pk.margin<.75?'var(--fair)':'var(--good)');
    else if(pk&&pk.last)hero=dHero(pk.last.dep,'',`the last connection back, before you can be at the stop (${fmtClock(pk.ready)})`,'var(--bad)');
    const kp=pk&&(pk.next||pk.last)?dKpis([[pk.next?pk.next.dep:'–','leaves'],[pk.next?pk.next.arr:'–','arrives'],[pk.next?String(pk.next.ch):'–','changes'],[pk.last?pk.last.dep:'–','last']]):'';
    pt=kp+dSec('By train and bus',`<p class="small">From <b>${esc(P.f.name)}</b>${P.f.d>150?`, ${P.f.d<1000?P.f.d+' m':(P.f.d/1000).toFixed(1)+' km'} from where the walk ends (about ${P.f.walk} min on foot, counted in)`:', where the walk ends'}, to <b>${esc(P.t.name)}</b>${P.t.d>150?`, ${P.t.d<1000?P.t.d+' m':(P.t.d/1000).toFixed(1)+' km'} from where it began`:''}.</p>`+
      (pk&&pk.next?`<p class="micro csub">The first you can catch · ${pk.next.dep} → ${pk.next.arr}</p>${connLegs(pk.next)}`:'')+
      (later.length?`<p class="micro csub">Later</p><ul class="dlist">${later.map(c=>`<li><b>${connLine(c)}</b><span>${esc(c.legs.filter(l=>!l.walk).map(legName).join(' · '))}</span></li>`).join('')}</ul>`:'')+
      (pk&&pk.last?`<p class="micro csub">The last of the day</p><ul class="dlist"><li><b>${connLine(pk.last)}</b><span>${esc(pk.last.legs.filter(l=>!l.walk).map(legName).join(' · '))}</span></li></ul>`:'')+
      (P.nodata?`<p class="small mute">No connection found in the timetable for this date.</p>`:'')+
      `<p class="small mute dmeta">${P.typ?`The timetable for ${ld} isn’t published yet: these are the times on ${qd}, the same weekday. Lines that run only in summer can differ. The app checks again by itself each week.`:`Timetable for ${ld}.`} Checked ${new Date(B.at).toLocaleDateString('en-GB',{day:'numeric',month:'short'})} · <button type="button" class="lnk" data-dact="backcheck">Check again</button></p>`+
      `<p class="small"><a href="${gmaps(a,b)}" target="_blank" rel="noopener">Open in Google Maps</a> · <a href="https://www.sbb.ch/en" target="_blank" rel="noopener">SBB timetable and tickets</a></p>`,'Swiss timetable');
    if(pk&&pk.missed)M.push(['bad',`You reach ${esc(fr)} at ${fmtClock(arr)}, after the last connection back (${pk.last.dep}). Start earlier or walk faster on day ${n}, or plan a night in ${esc(fr)}.`]);
    else if(pk&&pk.next){M.push([pk.margin<.75?'warn':'ok',`After you arrive at ${fmtClock(arr)}, the ${pk.next.dep} gets you to ${esc(to)} by ${pk.next.arr}.${pk.last?` The last one leaves at ${pk.last.dep}: ${pk.margin<.75?`only ${fmtH(pk.margin)} to spare, so if the day runs late, sleep in ${esc(fr)}.`:`${fmtH(pk.margin)} to spare if the day runs late.`}`:''}`])}
    M.push(['info','Buy the ticket before you board: in the SBB app or at the machine at the station.'])}
  else if(B&&B.kind==='osm'&&P&&!P.err){const st=(o,w)=>o?`<li><b>${esc(o.name)}</b><span>${w} · ${o.d<1000?o.d+' m':(o.d/1000).toFixed(1)+' km'} away, about ${o.walk} min on foot</span></li>`:'';
    const lf=st(P.f.train,'train station')+st(P.f.bus,'bus stop'),lt=st(P.t.train,'train station')+st(P.t.bus,'bus stop');
    pt=dSec('Trains and buses',(lf?`<p class="micro csub">Near ${esc(fr)}, where the walk ends</p><ul class="dlist">${lf}</ul>`:`<p class="small">No train station within 5 km or bus stop within 2.5 km of ${esc(fr)} on the map.</p>`)+
      (lt?`<p class="micro csub">Near ${esc(to)}, where it began</p><ul class="dlist">${lt}</ul>`:'')+
      `<p class="small"><a href="${gmaps(a,b)}" target="_blank" rel="noopener">Find the trains and buses in Google Maps</a></p><p class="small mute dmeta">The app has timetables for Switzerland only, so check the times there, and on the operators’ sites. Stops from OpenStreetMap.</p>`,'from the map');
    if(!lf)M.push(['warn',`There is no public transport close to ${esc(fr)} on the map: arrange a lift or a taxi before you go${car?` (about ${fmtH(car.min/60)} by road)`:''}.`]);
    else if((P.f.train||P.f.bus).d>1500)M.push(['info',`The nearest stop is ${((P.f.train||P.f.bus).d/1000).toFixed(1)} km from where the walk ends: count about ${(P.f.train||P.f.bus).walk} more minutes on foot on day ${n}.`]);
    M.push(['info','Rural buses can run only a few times a day, and less at weekends: check the last one before you set off on the last day.'])}
  else if(B&&P&&(P.none||P.same))pt=dSec('By train and bus',`<p class="small">${P.same?`${esc(P.f.name)} is the nearest stop to both ends: walk there and back.`:`No stop found near ${esc(P.f?to:fr)} in the Swiss timetable.`}</p>`);
  else pt=dSec('By train and bus',`<p class="small mute">${BACKRUN?'Looking up the way back…':navigator.onLine?(D.backErr?'The timetable could not be reached just now. <button type="button" class="lnk" data-dact="backcheck">Try again</button>':'Not looked up yet. <button type="button" class="lnk" data-dact="backcheck">Look it up</button>'):'The trains and buses back show once the hike opens with a connection.'}</p>`);
  // by road
  const road=dSec('By road',car?`${dKpis([[fmtH(car.min/60),'driving'],[String(Math.round(car.km)),'km']])}<p class="small mute">From ${esc(fr)} to ${esc(to)}, for a lift or a taxi.</p>`
    :B&&B.car&&B.car.none?`<p class="small">No road for cars reaches ${esc(B.car.at==='from'?fr:to)}${B.car.at==='from'?'':`, so a lift can only take you part of the way`}.</p>`:`<p class="small mute">${B?'No road route found.':'Not looked up yet.'}</p>`);
  if(!hero)hero=car?dHero(fmtH(car.min/60),'',`by road to ${esc(to)}, ${Math.round(car.km)} km`):dHero(fmtH(wt),'',`on foot the same way, over ${W.length} ${W.length>1?'days':'day'}`);
  // on foot, the same way back
  const F=safety(),cl=backClimbs(W),big=cl.reduce((x,c)=>!x||c.g>x.g?c:x,null),up=W.reduce((s,w)=>s+w.up,0),X=R.d[N-1];
  W.forEach(w=>{if(w.n<W.length){const h=(D.huts||{})[w.to];w.shut=!!h&&openOn(seasonOf(h.open),w.date)===false}});
  let lo=1e9,hi=-1e9;for(let i=0;i<N;i++){if(R.e[i]<lo)lo=R.e[i];if(R.e[i]>hi)hi=R.e[i]}const Y0=Math.floor(lo/200)*200,Y1=Math.ceil(hi/200)*200,stp=Math.max(1,Math.floor(N/300));
  const prof=chart(X,Y1-Y0,(x,y)=>{let p='';for(let i=N-1;i>=0;i-=stp)p+=`${x(X-R.d[i]).toFixed(1)},${y(R.e[i]-Y0).toFixed(1)} `;p+=`${x(X).toFixed(1)},${y(R.e[0]-Y0).toFixed(1)}`;
    return`<polygon points="${x(0)},${y(0)} ${p} ${x(X)},${y(0)}" class="ga"/><polyline points="${p}" class="vl"/>`+W.slice(0,-1).map(w=>`<line x1="${x(X-R.d[w.b])}" x2="${x(X-R.d[w.b])}" y1="${y(0)}" y2="${y(Y1-Y0)}" class="lim"/>`).join('')},{h:160,yl:'m',ys:[0,(Y1-Y0)/2,Y1-Y0].map(Math.round)})
    .replace(/(<text x="[\d.]+" y="[\d.]+" text-anchor="end">)(\d+)(<\/text>)/g,(m,p1,v,p3)=>p1+nf.format(+v+Y0)+p3);
  const fs=(F.top||[]).slice(0,3).map(x=>{const p=backWhere(x.i1);return`<li class="al ${x.lvl}">${x.what}<small>${n>1?`Day ${p.n} back · `:''}km ${p.km.toFixed(1)}${(()=>{const nm=nearName(x.nm??x.i0);return nm?` · ${esc(nm)}`:''})()}</small></li>`}).join('');
  const days=W.map(w=>`<div class="bkday"><p class="micro csub"><span class="dn" style="--c:${w.color}"><i></i>${w.n}</span> ${esc(w.from)} → ${esc(w.to)}</p>`+
    dKpis([[w.km.toFixed(1),'km'],[nf.format(Math.round(w.up)),'m up'],[fmtH(w.h),'walking'],[fmtClock(w.arr),'arrive']])+
    (w.wx&&w.wx.pct?`<div class="bwx">${pbar(w.wx.pct,'Day '+w.n+' back')}<p class="small mute">${w.wx.src==='ens'?'Forecast':'Usually'}: ${HP.WXK.filter(k=>w.wx.pct[k]>0).sort((p,q)=>w.wx.pct[q]-w.wx.pct[p]).slice(0,3).map(k=>`${esc(HP.WXT[k].short.toLowerCase())} ${w.wx.pct[k]}%`).join(', ')}</p></div>`:'')+
    (w.n<W.length&&hutLine(w.to)?`<p class="small dhut">Night: <b>${esc(w.to)}</b> · ${hutLine(w.to)}${w.shut?' · <b class="badt">usually closed then</b>':''}</p>`:'')+
    `<p class="small mute dmeta">${fmtDate(isoDay(w.date))} · ${fmtClock(w.start)} → ${fmtClock(w.arr)}${S.breaks?' with rests':''} · ${nf.format(Math.round(w.dn))} m down · top ${nf.format(Math.round(w.top))} m · sunset ${fmtClock(w.set)}</p></div>`).join('');
  const foot=dSec('On foot, the same way back',dKpis([[X.toFixed(1),'km'],[nf.format(Math.round(up)),'m up'],[fmtH(wt),'walking'],[String(W.length),W.length>1?'days':'day']])+`<div class="dfig">${prof}</div>`+days+
    `<p class="micro csub">Safety: the same paths</p><p class="small"><b style="color:${VERD[F.lvl]?VERD[F.lvl][1]:'inherit'}">${VERD[F.lvl]?VERD[F.lvl][0]:''}</b>${F.T?'':' (from the terrain only: the paths are checked when the hike opens with a connection)'}</p>${fs?`<ul class="alerts sfa">${fs}</ul>`:''}`+
    `<div class="abtns"><button type="button" class="btn" data-dact="walkback">Plan the walk back as its own hike</button></div><p class="small mute">It is saved as a new hike from ${fmtDate(isoDay(W[0].date))}, with its own 3D view, forecast, safety check and live guide. This hike stays as it is.</p>`,
    `from ${fmtDate(isoDay(W[0].date))}`);
  // where a place on the way back is, in words: its name, or the km into that day back
  const bp=i=>{const nm=nearName(i);if(nm)return nm;const p=backWhere(i);return`km ${p.km.toFixed(1)} of day ${p.n} back`};
  if(big)M.push(['info',`On foot, the biggest climb going back is ${nf.format(Math.round(big.g))} m, from ${esc(bp(big.a))} up to ${esc(bp(big.b))}, about ${fmtH(big.t)}: on the way out you came down it.`]);
  const dark=W.find(w=>w.arr>w.set);if(dark)M.push(['warn',`On foot, day ${dark.n} back ends after sunset (${fmtClock(dark.set)}): start earlier, or split the day.`]);
  W.filter(w=>w.h>10).forEach(w=>{const st=PTS.filter(p=>p.i<w.a-3&&p.i>w.b+3&&(p.kind==='hut'||p.kind==='village')).map(p=>p.name);
    M.push(['warn',`On foot, day ${w.n} back is ${fmtH(w.h)} of walking: this way round it climbs ${nf.format(Math.round(w.up))} m. ${st.length?`A night at ${esc(st[Math.floor(st.length/2)])} would split it.`:'Consider splitting it.'}`])});
  const shut=W.filter(w=>w.shut).map(w=>w.to);if(shut.length)M.push(['bad',`On foot, ${shut.map(esc).join(' and ')} ${shut.length>1?'are':'is'} usually closed on the nights back: call before you count on ${shut.length>1?'them':'it'}.`]);
  return{title:'Getting back',html:hero+pt+road+foot+dMeans(M)+`<p class="dsrc">Trains and buses in Switzerland: transport.opendata.ch, from the search.ch timetable. Road: BRouter. On foot: the DIN 33466 hiking formula at your pace, the other way round.</p>`}}
function dayBrief(d){
  const plain=S.wx==='plain';let cold=null,hot=null,gust=null,cloudKm=0,wetKm=0,snowKm=0,th=null,nofc=0;
  for(let i=d.i0;i<=d.i1;i++){const c=cond(i,CLK[i]),seg=i<d.i1?R.d[i+1]-R.d[i]:0;if(c.st.nofc)nofc++;
    if(!cold||c.feels<cold.f)cold={f:c.feels,T:c.T,i};if(!hot||c.T>hot.T)hot={T:c.T,i};if(!gust||c.g>gust.g)gust={g:c.g,i};
    if(c.inC)cloudKm+=seg;if(c.trail==='wet')wetKm+=seg;if(c.trail==='snow'||c.trail==='icy')snowKm+=seg;if(c.thd!=null&&c.thd<8000&&(!th||c.thd<th.d-2000))th={i,d:c.thd}}
  const passes=PTS.filter(p=>R.day[p.i]===d.n&&p.kind==='pass').map(p=>p.name),pl=passes.join(', ')||'';
  const L=[],hz=(k,t)=>L.push(`<li class="al ${k}">${t}</li>`);
  // the hardest places on this day, and what today's weather does to them
  {const F=safety();for(const x of F.top.filter(x=>x.i0<=d.i1&&x.i1>=d.i0).slice(0,2)){let wet=0,snow=0,th=0;
    if(!plain)for(let i=Math.max(x.i0,d.i0);i<=Math.min(x.i1,d.i1);i++){const c=cond(i,CLK[i]);if(c.trail==='wet')wet=1;if(c.trail==='snow'||c.trail==='icy')snow=1;if(c.thd!=null&&c.thd<8000)th=1}
    const i0=x.nm!=null&&x.nm>=d.i0&&x.nm<=d.i1?x.nm:Math.max(x.i0,d.i0),n=nearName(i0),at=`${x.what} at km ${kmIn(i0).toFixed(1)}${n?`, ${esc(n)}`:''}`,steep=/sac|drop|edge|aid|vf|glacier/.test(x.k);
    if(steep&&snow)hz('bad',`${at}: snow or ice there today. Wait, or take another way.`);
    else if(steep&&th&&/sac|edge|aid|vf/.test(x.k))hz('bad',`${at}: storms nearby. Don't be there when they come.`);
    else if(steep&&wet)hz('bad',`${at}: wet and slippery today. Wait for it to dry, or take another way.`);
    else hz(x.lvl,`${at}${x.tip?`: ${x.tip}`:''}.`)}}
  // tonight's hut: closed on that date by its season, or worth booking (since 2.3)
  if(d.n<DAYS.length){const h=(D.huts||{})[d.to],s=h&&seasonOf(h.open),o=openOn(s,hikeDate(d.n)),tel=h&&h.phone?` <a href="tel:${telOf(h.phone)}">${esc(h.phone)}</a>`:'';
    if(o===false)hz('bad',`${esc(d.to)} is usually closed on ${fmtDate(isoDay(hikeDate(d.n)))} (open ${seasonText(s)||'in season only'}). Call to check${tel?':'+tel:''}, or plan another night.`);
    else if(h&&(h.phone||h.web))hz('info',`Book ${esc(d.to)} ahead${tel?':'+tel:''}${h.web&&!tel?` (<a href="${esc(h.web)}" target="_blank" rel="noopener">website</a>)`:''}.`)}
  const n0=L.length;
  if(S.wx==='fc'&&nofc>(d.i1-d.i0)/2)hz('info',`No forecast for ${fmtDate(isoDay(dayDate(d.n)))} yet: an average day.`);
  if(!plain){
    const on=S.wx==='storm'||S.wx==='fc'?stormOnset(d):99;
    if(on<30){let iex=-1;for(let i=d.i0;i<=d.i1;i++)if(highNear(i))iex=i;const arr=CLK[d.i1];
      if(iex>=0){const tEx=CLK[iex];if(tEx>on-.5){const rec=Math.floor((startH()-(tEx-(on-.75)))*4)/4;hz('bad',`Storms from about ${fmtClock(on)}, you're on high ground at ${esc(placeName(iex))} until ${fmtClock(tEx)}. ${rec>=4.5?`Start by <b>${fmtClock(rec)}</b>.`:'Shorten the day or wait for a stable forecast.'}`)}else hz('ok',`Over the high ground by ${fmtClock(tEx)}, before the storms (about ${fmtClock(on)}).`)}
      if(arr>on-.25&&!(iex>=0&&CLK[iex]>on-.5)){const rec=Math.floor((startH()-(arr-(on-.5)))*4)/4;hz('warn',`You arrive at ${fmtClock(arr)} as storms start. ${rec>=4.5?`Start by <b>${fmtClock(rec)}</b>.`:'Shorten the day or wait for a stable forecast.'}`)}
      if(th)hz(th.d<3000?'bad':'warn',`Lightning ${th.d<1500?'overhead':`${Math.round(th.d/1000)} km away`} at ${esc(placeName(th.i))} around ${fmtClock(CLK[th.i])}: off ridges and cables.`)}
    if(snowKm>.2)hz('bad',`Snow or ice on ${snowKm.toFixed(1)} km${pl?`, ${esc(pl)}`:''}. Not beginner terrain like this.`);
    else if(wetKm>.5)hz('warn',`Wet, slippery path for ${wetKm.toFixed(1)} km${pl?`, ${esc(pl)}`:''}. Poles help.`);
    if(cloudKm>.3)hz('warn',`In cloud for ${cloudKm.toFixed(1)} km: follow the waymarks.`);
    if(gust.g>60)hz(gust.g>85?'bad':'warn',`Gusts ${Math.round(gust.g/5)*5} km/h at ${esc(placeName(gust.i))}.`);
    if(cold.f<2)hz('warn',`Feels ${tt(cold.f)} at ${esc(placeName(cold.i))}: hat and gloves.`);
    if(hot.T>26)hz('warn',`${tt(hot.T)} at ${esc(placeName(hot.i))}: 2 litres of water, start early.`);
    if(S.wx==='sea'){const c0=cond(d.i0,CLK[d.i0]);if(c0.fog)hz('ok',`Fog at the start, sunshine above ${nf.format(Math.round(c0.st.fog.top/50)*50)} m.`)}
    if(L.length===n0)hz('ok','No weather problems on this day.')}
  const wq=(D.water||[]).filter(i=>i>=d.i0&&i<=d.i1).map(i=>R.d[i]-R.d[d.i0]).filter((v,k,a)=>!k||v-a[k-1]>.5);
  hz('water',wq.length?`Water at km ${wq.slice(0,8).map(v=>v.toFixed(1)).join(' · ')}${wq.length>8?' …':''}`:'No water on the way: carry it all.');
  const K=kitOf(dayFacts(d));
  return `<div class="bday" style="--c:${d.color}"><h3 class="micro"><i></i>Day ${d.n} · ${esc(d.from)} → ${esc(d.to)}</h3><ul class="alerts">${L.join('')}</ul><dl class="kit"><dt class="micro">Wear</dt><dd>${K.wear}</dd>${K.carry.length?`<dt class="micro">Carry</dt><dd>${K.carry.join(', ')}</dd>`:''}</dl></div>`}
const pbar=(pc,lbl)=>{const ks=HP.WXK.filter(k=>pc[k]>0).sort((a,b)=>pc[b]-pc[a]);return`<div class="pbar" role="img" aria-label="${esc(lbl+': '+ks.map(k=>HP.WXT[k].name+' '+pc[k]+'%').join(', '))}">${ks.map(k=>`<i style="--c:${HP.WXT[k].c};flex:${pc[k]} 1 0"></i>`).join('')}</div>`};
const hikeDate=n=>{const d=parseDay(D.date);d.setDate(d.getDate()+n-1);return d};
// three weeks before the hike, a reminder to save the map for no signal (since 2.3)
function stripNudge(){if(D.strip||!D.id)return'';const t0=new Date(),d0=HP.u.parseDay(D.date),dd=(d0-new Date(t0.getFullYear(),t0.getMonth(),t0.getDate()))/864e5;
  if(dd>21||dd<-(DAYS.length))return'';const run=HP.stripRun&&HP.stripRun.id===D.id;
  return`<p class="al info nudge">${run?`Saving the map for no signal… ${Math.round((HP.stripRun.f||0)*100)}%`:'Before you go: save the map for when there is no signal on the trail.'}${run?'':' <button type="button" class="lnk" data-act="strip">Save it now</button>'}</p>`}
function renderBrief(){if(!R)return;const sc=SCN[S.wx];
  $('#brief').innerHTML=stripNudge()+`<div class="ch"><h2 class="micro">${S.wx==='plain'?'Plain map':S.wx==='fc'?'Forecast':esc(sc.name)}</h2><span class="micro">${S.wx==='fc'||S.wx==='plain'?'':MONN[S.mon]}</span></div>${(S.day?[DAYS[S.day-1]]:DAYS).map(dayBrief).join('')}`}
/* ---------- the cards: weather by day, daylight, steepness ---------- */
const deg=v=>`${Math.round(v)}°`.replace('-','−');
function tempRange(d){let lo=1e9,hi=-1e9;for(let i=d.i0;i<=d.i1;i+=3){const T=cond(i,CLK[i]).T;lo=Math.min(lo,T);hi=Math.max(hi,T)}return`${deg(hi)} / ${deg(lo)}`}
function renderCards(){if(!R)return;renderWxCard();renderDaylight();renderZones();renderWindCard();renderViewsCard();renderSafety();renderBackCard();clearTimeout(BACKT);BACKT=setTimeout(()=>fetchBack(false),1500)}
function renderWxCard(){const el=$('#wxcard'),L=likely(),pc=L&&L.pct,days=S.day?[DAYS[S.day-1]]:DAYS;
  const src=!L?'':L.src==='ens'?`${D.ens.members} forecast runs`:L.src==='mix'?'forecast runs and records':`records ${D.clim&&D.clim.years?D.clim.years.join('–'):''}`;
  let h=`<div class="ch"><h2 class="micro">Weather chance</h2><span class="micro">${esc(src)}</span></div>`;
  if(!pc){el.innerHTML=h+`<p class="mute small">Not known yet: open the hike with a connection.</p>`;return}
  h+=`<div class="wxdays">${days.map(d=>{const Ld=HP.wxDay(D,d.n-1);return`<div class="wxd"><span class="dn" style="--c:${d.color}"><i></i>${d.n}</span>${Ld&&Ld.pct?pbar(Ld.pct,'Day '+d.n):'<span class="pbar"></span>'}<span class="tr">${tempRange(d)}</span></div>`}).join('')}</div>`;
  const ks=HP.WXK.filter(k=>pc[k]>0).sort((a,b)=>pc[b]-pc[a]);
  el.innerHTML=h+`<ul class="plist">${ks.map(k=>`<li title="${esc(HP.WXT[k].name)}"><i style="--c:${HP.WXT[k].c}"></i><span>${HP.WXT[k].short}</span><b>${pc[k]}%</b></li>`).join('')}</ul>`}
// each day from 04:00 to 22:00: daylight, the hours you walk, and the time left before sunset
function renderDaylight(){const el=$('#dlcard'),days=S.day?[DAYS[S.day-1]]:DAYS,H0=4,H1=22,X=h=>((Math.min(H1,Math.max(H0,h))-H0)/(H1-H0)*100).toFixed(2);
  const rows=days.map(d=>{const st=HP.sunTimes(D.center.lat,D.center.lon,hikeDate(d.n),D.tz),a=CLK[d.i0],b=CLK[d.i1],m=st.set-b,c=m>=1?'var(--good)':m>=0?'var(--fair)':'var(--bad)';
    return`<div class="dlr"><span class="dn" style="--c:${d.color}"><i></i>${d.n}</span><div class="dlt"><i class="sky" style="left:${X(st.rise)}%;width:${X(st.set)-X(st.rise)}%"></i><i class="walk" style="left:${X(a)}%;width:${Math.max(1,Math.min(X(b),X(st.set))-X(a))}%;--c:${d.color}"></i>${b>st.set?`<i class="walk dark" style="left:${X(Math.max(a,st.set))}%;width:${Math.max(1,X(b)-X(Math.max(a,st.set)))}%"></i>`:''}<i class="set" style="left:${X(st.set)}%"></i></div><span class="mg" style="color:${c}">${m<0?'−':'+'}${fmtH(Math.abs(m))}</span>
      <span class="dlx"><span style="left:${X(st.rise)}%">☀ ${fmtClock(st.rise)}</span><span style="left:${X(st.set)}%">${fmtClock(st.set)}</span></span><span class="arr micro">in ${fmtClock(b)}</span></div>`}).join('');
  el.innerHTML=`<div class="ch"><h2 class="micro">Daylight</h2><span class="micro">left at arrival</span></div><div class="dlrows">${rows}</div>`}
function renderZones(){const el=$('#zcard'),[a,b]=profRange(),km=[0,0,0,0,0,0],g=[0,0,0,0,0,0];let tot=0;
  for(let i=a;i<b;i++){const s=R.d[i+1]-R.d[i];km[STEEP[i]]+=s;g[R.sac[i]]+=s;tot+=s}
  let h=`<div class="ch"><h2 class="micro">Steepness</h2><span class="micro">${S.day?`day ${S.day}`:'all days'}</span></div><div class="zones">`+[1,2,3,4,5].map(z=>`<div class="zr" style="--c:${STC[z]}"><span class="zn">${STN[z].split(', ')[1]}</span><span class="zb"><i style="width:${(tot?km[z]/tot*100:0).toFixed(1)}%"></i></span><span class="zv">${km[z].toFixed(1)} km</span></div>`).join('')+'</div>';
  if(D.sacKnown){const ks=[1,2,3,4,5,0].filter(k=>g[k]>.05);h+=`<div class="ch sub"><h3 class="micro">Path grade</h3></div><div class="pbar">${ks.map(k=>`<i style="--c:${SACC[k]};flex:${g[k]} 1 0"></i>`).join('')}</div><ul class="plist">${ks.map(k=>`<li title="${esc(SACN[k])}"><i style="--c:${SACC[k]}"></i><span>${SACS[k]}</span><b>${g[k].toFixed(1)} km</b></li>`).join('')}</ul>`}
  el.innerHTML=h}

/* ---------- what to wear and carry: the person's own gear from the inventory, or general words ---------- */
// The facts of a day that decide the kit: the coldest it feels, wet or snowy path, heat, storms, ice, arriving near dark, steep ground.
function dayFacts(d){let f=99,hot=0,wetKm=0,snowKm=0,icy=false,th=false,steepKm=0;
  for(let i=d.i0;i<=d.i1;i++){const c=cond(i,CLK[i]),seg=i<d.i1?R.d[i+1]-R.d[i]:0;f=Math.min(f,c.feels);hot=Math.max(hot,c.T);if(c.trail==='wet')wetKm+=seg;if(c.trail==='snow'||c.trail==='icy')snowKm+=seg;if(c.trail==='icy')icy=true;
    if(c.thd!=null&&c.thd<8000)th=true;if(STEEP[i]>=4)steepKm+=seg}
  const st=HP.sunTimes(D.center.lat,D.center.lon,hikeDate(d.n),D.tz),late=CLK[d.i1]>st.set-.5||CLK[d.i0]<st.rise;
  return{f,hot,wetD:S.wx!=='storm'&&wetKm>.5,snowD:snowKm>.2&&S.wx==='snow',icy,th,late,steep:steepKm>.5,wetKm,snowKm}}
function kitOf(x){const W=(k,w)=>HP.inv.word(k,w),f=x.f,wear=x.snowD?`${W('base','merino')}, ${W('fleece','fleece')}, ${W('shell','waterproofs')}, ${W('gaiters','gaiters')}`:
    x.wetD?`${W('base','merino')} under ${W('shell','the waterproof')}, ${W('rainpants','rain trousers')}`:f>=12?W('shirt','T-shirt'):f>=5?`${W('shirt','T-shirt')} or ${W('base','merino')}, ${W('fleece','fleece')} at the top`:
    f>=0?`${W('base','merino')}, ${W('fleece','fleece')} and ${W('shell','waterproof')} on top`:`${W('base','merino')} and ${W('fleece','fleece')}, ${W('shell','waterproof')} over them`,carry=[];
  if(!x.wetD&&!x.snowD&&f>=5){if(f>=12)carry.push(W('fleece','fleece'));carry.push(W('shell','waterproof'))}
  if(S.wx==='storm'||(S.wx==='fc'&&x.th))carry.push(W('rainpants','rain trousers'));if(f<5)carry.push(W('hat','hat'),W('gloves','gloves'));if(f<0)carry.push(W('puffy','warm jacket'));
  if(x.wetD)carry.push(W('liner','pack liner'),'dry layers');if(x.hot>24)carry.push('2 l water',W('sunhat','sun hat'));if(x.icy)carry.push(W('spikes','microspikes'));
  if(x.steep||x.wetD||x.snowD)carry.push(W('poles','poles'));if(x.late)carry.push(W('headlamp','headlamp'));return{wear,carry}}
// the whole hike's packing list: the kinds of gear the days call for, plus what every hike needs and what the nights need
function packList(){const days=DAYS.map(dayFacts),any=k=>days.some(x=>x[k]),minF=Math.min(...days.map(x=>x.f)),maxT=Math.max(...days.map(x=>x.hot)),plain=S.wx==='plain';
  const L=[],add=(k,why)=>{if(!L.some(q=>q.k===k))L.push({k,why})};
  add('boots','');add('socks','');add('trousers','');add('pack','');add('water','');add('shell','wind and rain, on every hike');
  if(maxT>=12||plain)add('shirt','');if(minF<12||plain)add('base','');add('fleece','for stops and the top');
  if(minF<5)add('hat',`feels ${tt(minF)} at the coldest`),add('gloves','');if(minF<0)add('puffy','for the cold and for stops');
  if(any('wetD')||S.wx==='storm'||any('th'))add('rainpants','rain on the way');if(any('wetD'))add('liner','keeps spare clothes dry');if(any('snowD'))add('gaiters','snow on the path');if(any('icy'))add('spikes','ice on the path');
  // old snow left from the winter (the safety check): gaiters and poles, and microspikes for steep snow
  {const os=safety().items.filter(x=>x.k==='snow'&&x.lvl!=='info');if(os.length){add('gaiters','old snow on the path');add('poles','old snow on the path');if(os.some(x=>x.lvl==='bad'))add('spikes','steep old snow')}}
  if(any('steep')||any('wetD')||any('snowD'))add('poles','steep or slippery ground');if(maxT>22||plain)add('sunhat',''),add('sunglasses','');else add('sunglasses','');
  add('firstaid','');add('nav','');add('power','');if(any('late')||DAYS.length>1)add('headlamp',any('late')?'you walk near dark':'');
  if(DAYS.length>1){const ks=DAYS.slice(0,-1).map(d=>{const p=PTS.find(q=>Math.abs(q.i-d.i1)<=3&&q.kind!=='high');return p?p.kind:'wild'});
    if(ks.some(k=>k==='hut'||k==='village'||k==='shelter'))add('sleep','a liner for the hut');if(ks.some(k=>k==='camp'||k==='wild'))add('tent','a night out'),add('mat',''),add('sleep',''),add('stove','')}
  return L}

/* ---------- detail pages: tap a card for the whole story and what it means for the walk ---------- */
const dHero=(v,u,l,c)=>`<div class="dhero"><b${c?` style="color:${c}"`:''}>${v}</b>${u?`<span>${u}</span>`:''}<p class="micro">${l}</p></div>`;
const dKpis=a=>`<ul class="kpis dk">${a.map(([v,l])=>`<li><b>${v}</b><span>${l}</span></li>`).join('')}</ul>`;
const dSec=(t,h,sub='')=>`<section class="dsec"><div class="ch"><h3 class="micro">${t}</h3>${sub?`<span class="micro">${sub}</span>`:''}</div>${h}</section>`;
const dTips=a=>`<ul class="alerts">${a.map(([k,t])=>`<li class="al ${k}">${t}</li>`).join('')}</ul>`;
const dMeans=a=>a.length?dSec('What it means for you',dTips(a)):'';
const bearing=i=>{const a=Math.max(0,i-3),b=Math.min(N-1,i+3);return(Math.atan2(R.x[b]-R.x[a],-(R.y[b]-R.y[a]))*180/Math.PI+360)%360};
const daysOf=()=>S.day?[DAYS[S.day-1]]:DAYS;
// a small chart frame: x from 0 to X (km), y from 0 to Y; returns the SVG with grid lines and axis labels
function chart(X,Y,body,{h=150,yl='',ys=[],xs=null}={}){const W=Math.round(Math.min(696,Math.max(280,(innerWidth||400)-66))),P={l:36,r:8,t:yl?30:16,b:22},x=v=>P.l+v/X*(W-P.l-P.r),y=v=>h-P.b-v/Y*(h-P.t-P.b);
  const xt=xs||Array.from({length:Math.floor(X/(X>30?10:X>12?5:2))+1},(_,k)=>k*(X>30?10:X>12?5:2));
  return`<svg class="dchart" viewBox="0 0 ${W} ${h}" width="${W}" height="${h}" role="img">${ys.map(v=>`<line x1="${P.l}" x2="${W-P.r}" y1="${y(v)}" y2="${y(v)}" class="gl"/><text x="${P.l-6}" y="${y(v)+3.5}" text-anchor="end">${v}</text>`).join('')}
    ${xt.filter(v=>x(v)<W-P.r-24).map(v=>`<text x="${x(v)}" y="${h-6}" text-anchor="middle">${v}</text>`).join('')}<text x="${W-P.r}" y="${h-6}" text-anchor="end" class="u">km</text>${yl?`<text x="${P.l-6}" y="${P.t-17}" text-anchor="end" class="u">${yl}</text>`:''}${body(x,y)}</svg>`}

// the wind along the walk, at your walking time: speed, gusts, where it comes from, and how much of it is in your face
function windStats(d){const o={pts:[],max:{g:0},sumV:0,n:0,head:0,strong:0,tt:0,feel:{f:99},rose:new Float32Array(16),roseV:new Float32Array(16)};
  for(let i=d.i0;i<=d.i1;i+=2){const c=cond(i,CLK[i]),dt=Math.max(0,CLK[Math.min(d.i1,i+2)]-CLK[i]),b=bearing(i)*Math.PI/180,w=vec(c.v,c.dir),hw=-(w[0]*Math.sin(b)+w[1]*Math.cos(b));
    o.pts.push({km:R.d[i]-R.d[d.i0],v:c.v,g:c.g,dir:c.dir,i});if(c.g>o.max.g)o.max={g:c.g,i};o.sumV+=c.v*dt;o.tt+=dt;if(hw>8)o.head+=dt;if(c.g>=50)o.strong+=dt;if(c.feels<o.feel.f)o.feel={f:c.feels,T:c.T,i};
    const s=Math.round(c.dir/22.5)%16;o.rose[s]+=dt;o.roseV[s]+=c.v*dt}
  o.mean=o.tt?o.sumV/o.tt:0;let su=0,sv=0;o.pts.forEach(p=>{const w=vec(p.v,p.dir);su-=w[0];sv-=w[1]});o.from=(Math.atan2(su,sv)*180/Math.PI+360)%360;return o}
const arrowPath=(cx,cy,to,s=7)=>{const a=to*Math.PI/180,dx=Math.sin(a),dy=-Math.cos(a),px=-dy,py=dx;
  return`<path d="M${(cx-dx*s).toFixed(1)} ${(cy-dy*s).toFixed(1)}L${(cx+dx*s).toFixed(1)} ${(cy+dy*s).toFixed(1)}M${(cx+dx*s-dx*4+px*3).toFixed(1)} ${(cy+dy*s-dy*4+py*3).toFixed(1)}L${(cx+dx*s).toFixed(1)} ${(cy+dy*s).toFixed(1)}L${(cx+dx*s-dx*4-px*3).toFixed(1)} ${(cy+dy*s-dy*4-py*3).toFixed(1)}" class="wa"/>`};
function windChart(d,o){const X=Math.max(1,R.d[d.i1]-R.d[d.i0]),Y=Math.max(40,Math.ceil(Math.max(...o.pts.map(p=>p.g))/10)*10+10),ys=[0,Y/2,Y].map(Math.round);
  return chart(X,Y,(x,y)=>{const g=o.pts.map(p=>`${x(p.km).toFixed(1)},${y(p.g).toFixed(1)}`).join(' '),v=o.pts.map(p=>`${x(p.km).toFixed(1)},${y(p.v).toFixed(1)}`).join(' ');
    let ar='';const step=Math.max(1,Math.round(o.pts.length/14));for(let k=0;k<o.pts.length;k+=step){const p=o.pts[k];ar+=arrowPath(x(p.km),y(Y)+9,(p.dir+180)%360)}
    return`${Y>50?`<line x1="${x(0)}" x2="${x(X)}" y1="${y(50)}" y2="${y(50)}" class="lim"/>`:''}<polygon points="${x(0)},${y(0)} ${g} ${x(o.pts[o.pts.length-1].km)},${y(0)}" class="ga"/><polyline points="${v}" class="vl"/>${ar}`},{h:170,yl:'km/h',ys})}
function windRose(o){const tot=o.rose.reduce((s,v)=>s+v,0)||1,mx=Math.max(...o.rose)/tot||1,C=90,R0=12,R1=78;let p='';
  for(let s=0;s<16;s++){const f=o.rose[s]/tot;if(f<=0)continue;const r=R0+(R1-R0)*f/mx,a0=(s*22.5-10)*Math.PI/180,a1=(s*22.5+10)*Math.PI/180,mv=o.roseV[s]/o.rose[s];
    p+=`<path d="M${C+R0*Math.sin(a0)} ${C-R0*Math.cos(a0)}L${C+r*Math.sin(a0)} ${C-r*Math.cos(a0)}A${r} ${r} 0 0 1 ${C+r*Math.sin(a1)} ${C-r*Math.cos(a1)}L${C+R0*Math.sin(a1)} ${C-R0*Math.cos(a1)}A${R0} ${R0} 0 0 0 ${C+R0*Math.sin(a0)} ${C-R0*Math.cos(a0)}Z" style="fill:var(${mv>=40?'--bad':mv>=20?'--fair':'--eff'})"/>`}
  return`<svg class="rose" viewBox="0 0 180 180" role="img" aria-label="Where the wind comes from"><circle cx="${C}" cy="${C}" r="${R1}" class="rg"/><circle cx="${C}" cy="${C}" r="${(R0+R1)/2}" class="rg"/>${p}${['N','E','S','W'].map((t,k)=>`<text x="${C+86*Math.sin(k*Math.PI/2)}" y="${C-86*Math.cos(k*Math.PI/2)+4}" text-anchor="middle">${t}</text>`).join('')}</svg>`}
const windSrc=()=>{const b=WF&&windBase(1,12);if(S.wx==='fc'&&D.fc){const up=D.fc.pts.some(p=>p.h.w8s&&p.h.w8s.some(v=>v===v));return`Open-Meteo forecast: the wind near the ground at ${D.fc.pts.length} points on the route${up?' and higher up, at about 1,500 and 3,000 m,':''} shaped by the terrain on your phone.`}
  if(b&&b.clim)return`Where the wind comes from: ${b.clim.n} days like this in the ERA5 weather records, ${D.clim.years.join('–')}. Shaped by the terrain on your phone.`;return'Typical wind for this weather type, shaped by the terrain on your phone.'};
function renderWindCard(){const el=$('#windcard');if(!el)return;if(S.wx==='plain'||!WF){el.hidden=true;return}el.hidden=false;
  const ds=daysOf(),os=ds.map(windStats),mx=os.reduce((a,o,k)=>o.max.g>a.g?{g:o.max.g,i:o.max.i}:a,{g:0}),ttot=os.reduce((s,o)=>s+o.tt,0)||1,head=os.reduce((s,o)=>s+o.head,0)/ttot,
    mean=os.reduce((s,o)=>s+o.mean*o.tt,0)/ttot,from=os[0].from,gc=mx.g>=70?'var(--bad)':mx.g>=50?'var(--fair)':'var(--good)';
  el.innerHTML=`<div class="ch"><h2 class="micro">Wind</h2><span class="micro">on the walk</span></div>`+
    `<ul class="kpis"><li><b style="color:${gc}">${Math.round(mx.g/5)*5}</b><span>gust km/h</span></li><li><b>${Math.round(mean)}</b><span>average</span></li><li><b>${HP.compass(from)}<i class="warr st" style="transform:rotate(${(from+180)%360}deg)"></i></b><span>wind from</span></li><li><b>${Math.round(head*100)}%</b><span>headwind</span></li></ul>`+
    (ds.length===1?`<div class="dfig">${windChart(ds[0],os[0])}</div>`:`<div class="dfig">${windChart(ds[0],os[0])}</div><p class="micro wsub">Day 1 · the other days in the detail</p>`)}

function detail(kind){if(!R)return null;const ds=daysOf(),sub=S.day?`Day ${S.day}`:DAYS.length>1?'All days':'';
  if(kind==='views')return viewsDetail();
  if(kind==='safety')return safetyDetail();
  if(kind==='back')return backDetail();
  if(kind==='wind'){if(!WF||S.wx==='plain')return null;const os=ds.map(windStats),all=os.reduce((a,o,k)=>o.max.g>a.g?{g:o.max.g,i:o.max.i}:a,{g:0}),ttot=os.reduce((s,o)=>s+o.tt,0)||1;
    const head=os.reduce((s,o)=>s+o.head,0)/ttot,strong=os.reduce((s,o)=>s+o.strong,0),feel=os.reduce((a,o)=>o.feel.f<a.f?o.feel:a,{f:99}),mean=os.reduce((s,o)=>s+o.mean*o.tt,0)/ttot,rose={rose:new Float32Array(16),roseV:new Float32Array(16)};
    os.forEach(o=>{for(let s=0;s<16;s++){rose.rose[s]+=o.rose[s];rose.roseV[s]+=o.roseV[s]}});let su=0,sv=0;os.forEach(o=>{const w=vec(1,o.from);su-=w[0]*o.tt;sv-=w[1]*o.tt});const from=(Math.atan2(su,sv)*180/Math.PI+360)%360;
    const gc=all.g>=70?'var(--bad)':all.g>=50?'var(--fair)':'var(--good)',M=[];
    // stretches with strong gusts
    const ex=[];ds.forEach((d,k)=>{let cur=null;for(const p of os[k].pts){if(p.g>=50){if(!cur)cur={d,a:p,b:p,g:p.g};else{cur.b=p;cur.g=Math.max(cur.g,p.g)}}else if(cur){ex.push(cur);cur=null}}if(cur)ex.push(cur)});
    if(all.g<35)M.push(['ok','Light wind all the way: nothing to plan for.']);
    else if(all.g<50)M.push(['ok',`Breezy, gusts to ${Math.round(all.g/5)*5} km/h at ${esc(placeName(all.i))}: a windproof layer for the stops is enough.`]);
    else if(all.g<70)M.push(['warn',`Gusts to ${Math.round(all.g/5)*5} km/h at ${esc(placeName(all.i))} around ${fmtClock(CLK[all.i])}: on the crest keep a low, wide stance and pack loose things away.`]);
    else M.push(['bad',`Gusts over 70 km/h at ${esc(placeName(all.i))} can push you off balance: keep off exposed crests, chains and ladders while it blows, or take a lower path.`]);
    if(feel.f<feel.T-4)M.push(['warn',`The wind makes ${tt(feel.T)} feel like ${tt(feel.f)} at ${esc(placeName(feel.i))}: put the shell on before you get cold, not after.`]);
    if(head>.35)M.push(['info',`Headwind on ${Math.round(head*100)}% of the walk: it tires you more, so take the climbs slower and eat a little more.`]);
    M.push(['info','In deep valleys the wind follows the valley; on passes and crests it is strongest. The trails on the 3D map show how it flows over the ground.']);
    return{title:'Wind',html:dHero(Math.round(all.g/5)*5,'km/h',`Strongest gust · ${esc(placeName(all.i))} · ${fmtClock(CLK[all.i])}`,gc)+
      dKpis([[Math.round(mean),'average km/h'],[HP.compass(from),'mostly from'],[`${Math.round(head*100)}%`,'headwind'],[fmtH(strong),'gusts over 50']])+
      ds.map((d,k)=>dSec(`Day ${d.n} · ${esc(d.from)} → ${esc(d.to)}`,`<div class="dfig">${windChart(d,os[k])}</div><p class="dleg"><span><i class="lsw ga"></i>gusts</span><span><i class="lsw vl"></i>wind</span><span><i class="lsw lim"></i>50 km/h</span><span>arrows: where it blows</span></p>`)).join('')+
      dSec('Where it comes from',`<div class="rosewrap">${windRose(rose)}<p class="small mute">Share of your walking time with wind from each direction. Blue under 20 km/h, amber to 40, red above.</p></div>`)+
      (ex.length?dSec('Strong gusts',`<ul class="dlist">${ex.slice(0,8).map(q=>`<li><b>Day ${q.d.n} · km ${q.a.km.toFixed(1)}${q.b.km.toFixed(1)!==q.a.km.toFixed(1)?`–${q.b.km.toFixed(1)}`:''}</b><span>${esc(placeName(q.a.i))} · ${fmtClock(CLK[q.a.i])} · to ${Math.round(q.g/5)*5} km/h</span></li>`).join('')}</ul>`):'')+
      dMeans(M)+`<p class="dsrc">${windSrc()}</p>`}}
  if(kind==='brief'){const all=DAYS.map(d=>dayBrief(d)).join(''),nAl=(all.match(/class="al (warn|bad)"/g)||[]).length,L=packList(),P=D.packed||{},items=HP.inv,nInv=items.count();
    let wsum=0,wn=0;const rows=L.map(q=>{const it=items.first(q.k),K=HP.INVK[q.k];if(it&&it.g){wsum+=+it.g;wn++}return`<li><label><input type="checkbox" data-pack="${q.k}"${P[q.k]?' checked':''}><span class="pk"><b>${K.label}</b>${it||q.why?`<span>${[it?`<span class="own">${esc(it.name)}</span>`:'',q.why?esc(q.why):''].filter(Boolean).join(' · ')}</span>`:''}</span>${it&&it.g?`<span class="pw">${nf.format(+it.g)} g</span>`:''}</label></li>`});
    const others=items.items('other').map(it=>{if(it.g){wsum+=+it.g;wn++}return`<li><label><input type="checkbox" data-pack="o:${esc(it.name)}"${P['o:'+it.name]?' checked':''}><span class="pk"><b>${esc(it.name)}</b><span>always with you</span></span>${it.g?`<span class="pw">${nf.format(+it.g)} g</span>`:''}</label></li>`});
    const done=L.filter(q=>P[q.k]).length;
    return{title:'Alerts and kit',html:dHero(nAl||'0',nAl===1?'alert':'alerts',nAl?'to plan for on this hike':'nothing to plan for on this hike',nAl?'var(--fair)':'var(--good)')+
      dSec('Day by day',`<div class="dbrief">${all}</div>`)+
      dSec('Packing list',`<ul class="pack">${rows.join('')}${others.join('')}<li class="gen"><span>Also: food for the day and a snack for later, sunscreen, phone, ID and some cash for huts.</span></li></ul>`,`${done}/${L.length} packed${wn?` · ${(wsum/1000).toFixed(1)} kg known`:''}`)+
      dMeans([...(nInv?[]:[['info','Add your own gear in <button class="lnk" data-dact="inv">Inventory</button> and this list and the advice above will name it.']]),['info','The list follows the weather you chose above the map: switch to the forecast or a weather type and it changes. Tick things off as you pack.']])}}
  if(kind==='wx'){const L=likely(),pc=L&&L.pct;if(!pc)return{title:'Weather chance',html:`<p class="mute">Not known yet: open the hike with a connection.</p>`};
    const ks=HP.WXK.filter(k=>pc[k]>0).sort((a,b)=>pc[b]-pc[a]),top=ks[0],M=[];
    const MEAN={fair:'Settled: sun, small clouds on the summits later, light wind.',storm:'Hot and humid, thunderstorms from early afternoon: be over passes and crests by about 13:00.',front:'Rain most of the day, cloud on the slopes and colder: waterproofs on, paths slippery.',
      cloud:'Grey, cloud sitting on the slopes: little view, damp, follow the waymarks closely.',wind:'Clear and cold after a front, strong gusts on ridges: windproof layer, keep off exposed crests in the strongest gusts.',snow:'Fresh snow up high after a cold snap: icy and slippery above the snow line; not beginner terrain.'};
    if((pc.storm||0)>=20)M.push(['warn',`Storms in ${pc.storm}% of cases: start early and plan to be off high ground by early afternoon.`]);
    if((pc.front||0)>=25)M.push(['warn',`Rain in ${pc.front}% of cases: keep a shorter or lower plan B ready.`]);
    if((pc.snow||0)>=8)M.push(['bad',`Snow in ${pc.snow}% of cases: check the conditions up high before you go.`]);
    if((pc.fair||0)>=55)M.push(['ok',`Fair in ${pc.fair}% of cases: a good chance of a dry day. Sun protection.`]);
    const src=L.src==='ens'?`${D.ens.members} runs of the ECMWF forecast model`:L.src==='mix'?'forecast runs for the near days, weather records for the others':`days like this in the ERA5 weather records, ${D.clim&&D.clim.years?D.clim.years.join('–'):''}`;
    let hourly='';if(S.wx==='fc'&&D.fc){const d=ds[0],hs=[];for(let h=Math.ceil(CLK[d.i0]);h<=Math.floor(CLK[d.i1])&&hs.length<14;h++){let i=d.i0;while(i<d.i1&&CLK[i]<h)i++;const c=cond(i,h);hs.push({h,c,i})}
      if(hs.length)hourly=dSec(`Hour by hour · day ${d.n}`,`<div class="scroll"><table class="tbl hrs"><thead><tr><th>Time</th><th>Where</th><th class="n">Air</th><th class="n">Rain mm</th><th class="n">Wind km/h</th></tr></thead><tbody>${hs.map(q=>`<tr><td>${fmtClock(q.h)}</td><td>${esc(placeName(q.i))}</td><td class="n">${deg(q.c.T)}</td><td class="n">${q.c.pr>.05?q.c.pr.toFixed(1):'–'}</td><td class="n">${Math.round(q.c.v)} ${HP.compass(q.c.dir)}</td></tr>`).join('')}</tbody></table></div>`,'at your walking time')}
    return{title:'Weather chance',html:dHero(pc[top],'%',`${esc(HP.WXT[top].name)} · the most likely`,HP.WXT[top].c)+
      ds.map(d=>{const Ld=HP.wxDay(D,d.n-1),p=Ld&&Ld.pct;return dSec(`Day ${d.n} · ${fmtDate(isoDay(hikeDate(d.n)))}`,p?`${pbar(p,'Day '+d.n)}<ul class="plist wide">${HP.WXK.filter(k=>p[k]>0).sort((a,b)=>p[b]-p[a]).map(k=>`<li><i style="--c:${HP.WXT[k].c}"></i><span>${HP.WXT[k].name}</span><b>${p[k]}%</b></li>`).join('')}</ul><p class="small mute">Temperature on the walk ${tempRange(d)}</p>`:'<p class="mute small">Not known.</p>')}).join('')+
      hourly+dSec('What each type means',`<ul class="dlist">${ks.map(k=>`<li><b><i class="dot" style="--c:${HP.WXT[k].c}"></i>${HP.WXT[k].name} · ${pc[k]}%</b><span>${MEAN[k]}</span></li>`).join('')}</ul>`)+dMeans(M)+`<p class="dsrc">From ${src}.</p>`}}
  if(kind==='daylight'){const rows=ds.map(d=>{const dt=hikeDate(d.n),st=HP.sunTimes(D.center.lat,D.center.lon,dt,D.tz),cv=HP.sunTimes(D.center.lat,D.center.lon,dt,D.tz,-6),a=CLK[d.i0],b=CLK[d.i1],m=st.set-b;
      return{d,st,cv,a,b,m,latest:st.set-1-(b-a)}});const tight=rows.reduce((x,r)=>r.m<x.m?r:x,rows[0]),c=tight.m>=1?'var(--good)':tight.m>=0?'var(--fair)':'var(--bad)',M=[];
    rows.forEach(r=>{if(r.m<0)M.push(['bad',`Day ${r.d.n}: you arrive ${fmtH(-r.m)} after sunset. Start by <b>${fmtClock(Math.max(4,r.latest))}</b>${r.latest<5?', or shorten the day: it is longer than the daylight':''}.`]);else if(r.m<1)M.push(['warn',`Day ${r.d.n}: only ${fmtH(r.m)} of daylight to spare. Starting by ${fmtClock(r.latest)} leaves an hour.`])});
    if(rows.some(r=>r.m<1))M.push(['info',`After sunset there is about ${fmtH(rows[0].cv.set-rows[0].st.set)} of twilight, then you need a headlamp: keep it at the top of the pack.`]);
    if(!M.length)M.push(['ok','Plenty of daylight every day: time for long breaks and the views.']);
    const H0=Math.max(3,Math.floor(Math.min(...rows.map(r=>Math.min(r.cv.rise,r.a)))-1)),H1=Math.min(23,Math.ceil(Math.max(...rows.map(r=>Math.max(r.cv.set,r.b)))+1)),X=h=>((Math.min(H1,Math.max(H0,h))-H0)/(H1-H0)*100).toFixed(2);
    const bars=rows.map(r=>`<div class="dlr big"><span class="dn" style="--c:${r.d.color}"><i></i>${r.d.n}</span><div class="dlt"><i class="tw" style="left:${X(r.cv.rise)}%;width:${X(r.cv.set)-X(r.cv.rise)}%"></i><i class="sky" style="left:${X(r.st.rise)}%;width:${X(r.st.set)-X(r.st.rise)}%"></i><i class="walk" style="left:${X(r.a)}%;width:${Math.max(1,Math.min(X(r.b),X(r.st.set))-X(r.a))}%;--c:${r.d.color}"></i>${r.b>r.st.set?`<i class="walk dark" style="left:${X(Math.max(r.a,r.st.set))}%;width:${Math.max(1,X(r.b)-X(Math.max(r.a,r.st.set)))}%"></i>`:''}<i class="set" style="left:${X(r.st.set)}%"></i></div><span class="mg" style="color:${r.m>=1?'var(--good)':r.m>=0?'var(--fair)':'var(--bad)'}">${r.m<0?'−':'+'}${fmtH(Math.abs(r.m))}</span></div>`).join('');
    return{title:'Daylight',html:dHero((tight.m<0?'−':'+')+fmtH(Math.abs(tight.m)),'',tight.m<0?`after dark on day ${tight.d.n}`:`to spare on the tightest day, day ${tight.d.n}`,c)+
      dSec('The days',`<div class="dlrows">${bars}</div><p class="dleg"><span><i class="lsw tw"></i>twilight</span><span><i class="lsw sky"></i>daylight</span><span><i class="lsw walk" style="background:${rows.length>1?`linear-gradient(90deg,${rows.map(r=>r.d.color).join(',')})`:rows[0].d.color}"></i>walking</span><span><i class="lsw dark"></i>after dark</span></p>`,`${String(H0).padStart(2,'0')}:00 – ${String(H1).padStart(2,'0')}:00`)+
      dSec('Times',`<table class="tbl dlt2"><thead><tr><th></th><th class="n">Dawn</th><th class="n">Sunrise</th><th class="n">Arrive</th><th class="n">Sunset</th><th class="n">Dusk</th></tr></thead><tbody>${rows.map(r=>`<tr><td><span class="dn" style="--c:${r.d.color}"><i></i>${r.d.n}</span></td><td class="n">${fmtClock(r.cv.rise)}</td><td class="n">${fmtClock(r.st.rise)}</td><td class="n"${r.m<0?' style="color:var(--bad)"':''}>${fmtClock(r.b)}</td><td class="n">${fmtClock(r.st.set)}</td><td class="n">${fmtClock(r.cv.set)}</td></tr>`).join('')}</tbody></table>`,`start ${fmtClock(rows[0].a)}`)+
      dMeans(M)+`<p class="dsrc">Sunrise and sunset at the hike's centre; first and last light when the sun is 6° below the horizon. Your times include the walking pace and rests you chose.</p>`}}
  if(kind==='steep'){const[a,b]=profRange(),km=[0,0,0,0,0,0],tm=[0,0,0,0,0,0],g=[0,0,0,0,0,0];let tot=0,mx={s:0,i:a};
    for(let i=a;i<b;i++){const s=R.d[i+1]-R.d[i];km[STEEP[i]]+=s;tm[STEEP[i]]+=Math.max(0,WALK[i+1]-WALK[i]);g[R.sac[i]]+=s;tot+=s;if(SLOPE[i]>mx.s)mx={s:SLOPE[i],i}}
    const secs=[],used=new Uint8Array(N);for(let it=0;it<5;it++){let bi=-1,bs=0;for(let i=a;i<b;i++)if(!used[i]&&SLOPE[i]>bs){bs=SLOPE[i];bi=i}if(bi<0||bs<8)break;let lo=bi,hi=bi;while(lo>a&&SLOPE[lo-1]>bs-4)lo--;while(hi<b-1&&SLOPE[hi+1]>bs-4)hi++;for(let i=Math.max(a,lo-20);i<=Math.min(b,hi+20);i++)used[i]=1;secs.push({lo,hi,s:bs,up:R.e[hi]>R.e[lo]})}
    const M=[];if(km[5]>.1)M.push(['bad',`${km[5].toFixed(1)} km steeper than 20°: hands may help, and it is slow and tiring downhill. Not for wet or icy days without experience.`]);
    if(km[4]+km[5]>.5)M.push(['warn',`${(km[4]+km[5]).toFixed(1)} km over 15°: poles save your knees on the way down; short steps, weight over your feet.`]);
    M.push(['info','Steepness is measured over about 200 m of path, so a short step can be steeper than shown.']);
    return{title:'Steepness',html:dHero(Math.round(mx.s)+'°','',`Steepest stretch · ${esc(placeName(mx.i))}`,STC[STEEP[mx.i]])+
      dSec('Bands',`<div class="zones">${[1,2,3,4,5].map(z=>`<div class="zr" style="--c:${STC[z]}"><span class="zn">${STN[z].split(', ')[1]}</span><span class="zb"><i style="width:${(tot?km[z]/tot*100:0).toFixed(1)}%"></i></span><span class="zv">${km[z].toFixed(1)} km</span><span class="zt">${fmtH(tm[z])}</span></div>`).join('')}</div>`,sub)+
      (secs.length?dSec('The steepest stretches',`<ul class="dlist">${secs.map(q=>`<li><b>${Math.round(q.s)}° ${q.up?'up':'down'} · km ${(R.d[q.lo]-R.d[dayOf(q.lo).i0]).toFixed(1)}</b><span>Day ${R.day[q.lo]} · ${esc(placeName(q.lo))} · about ${fmtClock(CLK[q.lo])}</span></li>`).join('')}</ul>`):'')+
      (D.sacKnown?dSec('Path grades',`<ul class="dlist">${[1,2,3,4,5,0].filter(k=>g[k]>.05).map(k=>`<li><b><i class="dot" style="--c:${SACC[k]}"></i>${SACS[k]} · ${g[k].toFixed(1)} km</b><span>${esc(SACN[k])}</span></li>`).join('')}</ul>`,'Swiss Alpine Club scale'):'')+dMeans(M)}}
  if(kind==='profile'){const[a,b]=profRange();let up=0,dn=0,hi={e:-1e9},lo={e:1e9};for(let i=a;i<b;i++){const dz=R.e[i+1]-R.e[i];if(dz>0)up+=dz;else dn-=dz}for(let i=a;i<=b;i++){if(R.e[i]>hi.e)hi={e:R.e[i],i};if(R.e[i]<lo.e)lo={e:R.e[i],i}}
    // climbs: rises of 150 m or more, allowing dips of up to 40 m on the way
    const cl=[];for(const d of DAYS){const a0=Math.max(a,d.i0),b0=Math.min(b,d.i1);if(b0<=a0)continue;let mn=a0,mxI=a0;
      for(let i=a0+1;i<=b0;i++){if(R.e[i]<R.e[mn]&&R.e[mxI]-R.e[mn]<150){mn=i;mxI=i;continue}if(R.e[i]>R.e[mxI])mxI=i;if(R.e[mxI]-R.e[i]>40||i===b0){if(R.e[mxI]-R.e[mn]>=150)cl.push({a:mn,b:mxI});mn=i;mxI=i}}}
    const X=R.d[b]-R.d[a],Y0=Math.floor(lo.e/200)*200,Y1=Math.ceil(hi.e/200)*200,step=Math.max(1,Math.floor((b-a)/300));let pts='';
    const svg=chart(X,Y1-Y0,(x,y)=>{let p='';for(let i=a;i<b;i+=step){const j=Math.min(b,i+step);p+=`<polygon points="${x(R.d[i]-R.d[a])},${y(0)} ${x(R.d[i]-R.d[a])},${y(R.e[i]-Y0)} ${x(R.d[j]-R.d[a])},${y(R.e[j]-Y0)} ${x(R.d[j]-R.d[a])},${y(0)}" style="fill:${STC[STEEP[i]]}"/>`}return p+`<text x="${x(R.d[hi.i]-R.d[a])}" y="${y(hi.e-Y0)-6}" text-anchor="middle" class="u">${nf.format(Math.round(hi.e))} m</text>`},{h:190,yl:'m',ys:[0,(Y1-Y0)/2,Y1-Y0].map(Math.round)}).replace(/(<text x="[\d.]+" y="[\d.]+" text-anchor="end">)(\d+)(<\/text>)/g,(m,p1,v,p3)=>p1+nf.format(+v+Y0)+p3);
    const M=[];if(cl.length){const h=cl.reduce((x,c)=>R.e[c.b]-R.e[c.a]>R.e[x.b]-R.e[x.a]?c:x,cl[0]),g=R.e[h.b]-R.e[h.a],t=WALK[h.b]-WALK[h.a];
      M.push(['info',`The biggest climb is ${nf.format(Math.round(g))} m to ${esc(placeName(h.b))}, about ${fmtH(t)}: start it at a pace where you can still talk, and ${t>1?'drink a little every half hour on the way up':'drink before you start'}.`])}
    if(dn>up*1.2)M.push(['warn',`More down than up (${nf.format(Math.round(dn))} m): descents tire the knees and thighs; poles and short steps help.`]);
    return{title:'Profile',html:dHero(nf.format(Math.round(up)),'m up',sub||'the whole hike')+dKpis([[nf.format(Math.round(dn)),'m down'],[nf.format(Math.round(hi.e)),'m top'],[nf.format(Math.round(lo.e)),'m lowest'],[X.toFixed(1),'km']])+
      dSec('Height and steepness',`<div class="dfig">${svg}</div><p class="dleg">${[1,2,3,4,5].map(z=>`<span><i class="lsw" style="background:${STC[z]}"></i>${STN[z].split(', ')[1]}</span>`).join('')}</p>`)+
      (cl.length?dSec('The climbs',`<ul class="dlist">${cl.map(c=>{const g=R.e[c.b]-R.e[c.a],L=R.d[c.b]-R.d[c.a],av=Math.atan(g/Math.max(1,L*1000))*180/Math.PI;let mx=0;for(let i=c.a;i<c.b;i++)mx=Math.max(mx,SLOPE[i]);
        return`<li><b>+${nf.format(Math.round(g))} m · ${L.toFixed(1)} km · ${Math.round(av)}°, up to ${Math.round(mx)}°</b><span>Day ${R.day[c.a]} · to ${esc(placeName(c.b))} · ${fmtClock(CLK[c.a])}–${fmtClock(CLK[c.b])}</span></li>`}).join('')}</ul>`):'')+dMeans(M)}}
  if(kind==='days'||kind==='effort'){const rows=DAYS.map(d=>{let up=0,dn=0,top=-1e9;for(let i=d.i0;i<d.i1;i++){const dz=R.e[i+1]-R.e[i];if(dz>0)up+=dz;else dn-=dz;top=Math.max(top,R.e[i])}const km=R.d[d.i1]-R.d[d.i0],e=HP.effort(km,up),h=WALK[d.i1],
      x=dayFacts(d),water=Math.max(1,Math.round((h*.45+Math.max(0,x.hot-18)*.06*h+up/1000*.3)*2)/2),wq=(D.water||[]).filter(i=>i>=d.i0&&i<=d.i1).length,stops=PTS.filter(p=>p.i>d.i0+3&&p.i<d.i1-3&&(p.kind==='hut'||p.kind==='village')).map(p=>p.name);
      return{d,km,up,dn,top,e,h,water,wq,stops}});
    const hard=rows.reduce((a,r)=>r.e>a.e?r:a,rows[0]),M=[];const word=HP.effortWord(hard.e);
    if(hard.e>=35)M.push(['bad',`Day ${hard.d.n} is very hard (${Math.round(hard.e)}): only with training for long mountain days. Splitting it would help.`]);else if(hard.e>=25)M.push(['warn',`Day ${hard.d.n} is hard (${Math.round(hard.e)}): eat something every hour and keep the pace steady from the start.`]);
    else M.push(['ok',`The hardest day is ${word} (${Math.round(hard.e)}): fine for a fit beginner with breaks.`]);
    rows.forEach(r=>{if(r.h>10)M.push(['warn',`Day ${r.d.n}: ${fmtH(r.h)} of walking. ${r.stops.length?`A night at ${esc(r.stops[Math.floor(r.stops.length/2)])} would split it.`:'Consider splitting it.'}`])});
    M.push(['info','Water is a rough guide: about half a litre an hour, more in heat and on long climbs. Refill where the water points are.']);
    const scale=`<div class="escale"><i style="--c:var(--good);flex:15"></i><i style="--c:var(--eff);flex:10"></i><i style="--c:var(--fair);flex:10"></i><i style="--c:var(--bad);flex:10"></i></div><p class="dleg">0 · easy 15 · moderate 25 · hard 35 · very hard</p>`;
    return{title:kind==='effort'?'Effort':'Days',html:dHero(Math.round(hard.e),word,`Effort of the hardest day, day ${hard.d.n}`,'var(--eff)')+
      dSec('Effort by day',`${rows.map(r=>`<div class="ebar"><span class="dn" style="--c:${r.d.color}"><i></i>${r.d.n}</span><span class="eb"><i style="width:${Math.min(100,r.e/45*100).toFixed(1)}%;--c:${r.e>=35?'var(--bad)':r.e>=25?'var(--fair)':r.e>=15?'var(--eff)':'var(--good)'}"></i></span><b>${Math.round(r.e)}</b></div>`).join('')}${scale}`,'km-effort')+
      rows.map(r=>dSec(`Day ${r.d.n} · ${esc(r.d.from)} → ${esc(r.d.to)}`,dKpis([[r.km.toFixed(1),'km'],[nf.format(Math.round(r.up)),'m up'],[fmtH(r.h),'walking'],[`${r.water} l`,'water']])+
        (r.d.n<DAYS.length&&hutLine(r.d.to)?`<p class="small dhut">Night: <b>${esc(r.d.to)}</b> · ${hutLine(r.d.to)}</p>`:'')+
        `<p class="small mute dmeta">${fmtDate(isoDay(hikeDate(r.d.n)))} · ${fmtClock(CLK[r.d.i0])} → ${fmtClock(CLK[r.d.i1])}${S.breaks?' with rests':''} · ${nf.format(Math.round(r.dn))} m down · top ${nf.format(Math.round(r.top))} m · ${r.wq?`${r.wq} water point${r.wq>1?'s':''}`:'no water on the way'}${r.stops.length?` · passes ${r.stops.slice(0,4).map(esc).join(', ')}`:''}</p>`)).join('')+
      dMeans(M)+`<p class="dsrc">Effort is km-effort: each kilometre and each 100 m of climbing count 1. Times use the DIN 33466 hiking formula at your pace.</p>`}}
  return null}

/* ---------- the best views along the hike ---------- */
// From points every 200 m of the route, look all round over the heights: how far you can see, how high the mountains stand
// around you, how deep the ground drops below you, whether you stand on a crest, and which named summits are in sight.
// The best few, spread out along the route, are the hike's best views; each looks the way with the most to see.
const VIEWS_V=4;let VDBG=null;
function losClear(px,py,eye,tx,ty,tz){const n=60;for(let k=1;k<n;k++){const f=k/n,z=TER.at(px+(tx-px)*f,py+(ty-py)*f);if(z>eye+(tz-eye)*f+15)return false}return true}
function bestViews(){const nm=(D.landmarks||[]).length;if(D.views&&D.views.v===VIEWS_V&&D.views.n===N&&D.views.m===nm)return D.views.list;
  const AZ=48,maxD=Math.min(30000,Math.hypot(D.w,D.h)*MPP*.7),inside=(x,y)=>x>=0&&y>=0&&x<=D.w&&y<=D.h,cand=[];let last=-1;
  for(let i=0;i<N;i++)if(R.d[i]-last>=.2||i===N-1){cand.push(i);last=R.d[i]}
  const LMK=(D.landmarks||[]).filter(m=>isFinite(m.e));
  const sc=cand.map(i=>{const px=R.x[i],py=R.y[i],eye=TER.at(px,py)+2,dir=new Float32Array(AZ);let fmax=0,far=0,drop=0,sky=[],around=0,na=0;
    for(let a=0;a<AZ;a++){const an=a/AZ*2*Math.PI,ux=Math.sin(an),uy=-Math.cos(an);let mt=-9,fv=0,sk=-9;
      for(let d=60;d<maxD;d=d*1.06+15){const qx=px+ux*d/MPP,qy=py+uy*d/MPP;if(!inside(qx,qy))break;const z=TER.at(qx,qy),t=(z-eye)/d;if(d<900){around+=z;na++}
        if(t>mt){mt=t;fv=d;if(d>2500)sk=Math.max(sk,Math.atan(t)*57.3);if(d<6000)drop=Math.max(drop,eye-z)}}
      far+=Math.min(fv,25000);fmax=Math.max(fmax,fv);sky.push(Math.max(-2,sk));dir[a]=Math.max(0,sk)/10+Math.min(fv,25000)/25000}
    const pano=far/AZ/25000,hiS=sky.slice().sort((x,y)=>y-x),peaks=Math.min(1,hiS.slice(0,AZ>>2).reduce((s,v)=>s+v,0)/(AZ>>2)/16),crest=Math.min(1,Math.max(0,(eye-around/Math.max(1,na))/250));
    // named summits in sight, and the way with the most to see (a little wider than straight ahead)
    const seen=LMK.map(m=>{const d=Math.hypot(m.x-px,m.y-py)*MPP;if(d<400||d>30000||!losClear(px,py,eye,m.x,m.y,m.e))return null;return{name:m.name,e:m.e,d,az:(Math.atan2(m.x-px,-(m.y-py))*180/Math.PI+360)%360}}).filter(Boolean);
    seen.forEach(m=>{const a=Math.round(m.az/360*AZ)%AZ;dir[a]+=.6;dir[(a+1)%AZ]+=.3;dir[(a+AZ-1)%AZ]+=.3});
    let ba=0,bv=-1;for(let a=0;a<AZ;a++){let v=0;for(let k=-3;k<=3;k++)v+=dir[(a+k+AZ)%AZ]*(1-Math.abs(k)/4);if(v>bv){bv=v;ba=a}}let el=-2;for(let k=-3;k<=3;k++)el=Math.max(el,sky[(ba+k+AZ)%AZ]);
    return{i,parts:[+pano.toFixed(2),+peaks.toFixed(2),Math.round(drop),+crest.toFixed(2),seen.length],score:.9*pano+.8*peaks+.5*Math.min(1,drop/1200)+.5*crest+Math.min(.45,seen.length*.09),az:ba/AZ*360,el,far:far/AZ,max:fmax,peaks:seen.sort((a,b)=>b.e-a.e)}});
  const km=R.d[N-1],K=Math.max(2,Math.min(6,Math.round(km/10)+1)),pick=[],ord=sc.slice().sort((a,b)=>b.score-a.score),top=ord.length?ord[0].score:0,far=c=>!pick.some(p=>Math.abs(R.d[p.i]-R.d[c.i])<2.5);
  for(const d of DAYS){const c=ord.find(c=>R.day[c.i]===d.n&&far(c));if(c&&c.score>=.6*top&&pick.length<K)pick.push(c)}
  for(const c of ord){if(pick.length>=K)break;if(far(c))pick.push(c)}VDBG=ord.slice(0,14).map(c=>[c.i,+R.d[c.i].toFixed(1),+c.score.toFixed(2),...c.parts]);
  pick.sort((a,b)=>a.i-b.i);const best=Math.max(...pick.map(p=>p.score),1e-6);
  const list=pick.map(p=>{const inDir=p.peaks.filter(m=>{let d=Math.abs(m.az-p.az)%360;d=Math.min(d,360-d);return d<70});
    return{i:p.i,az:Math.round(p.az),el:Math.round(p.el*10)/10,far:Math.round(p.far),max:Math.round(p.max),q:Math.round(p.score/best*100)/100,peaks:(inDir.length?inDir:p.peaks).slice(0,4).map(m=>({name:m.name,e:Math.round(m.e),d:Math.round(m.d)}))}});
  D.views={v:VIEWS_V,n:N,m:nm,list};save();return list}
const VIEWICON='<svg viewBox="0 0 24 24"><path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6z"/><circle cx="12" cy="12" r="2.6"/></svg>';
// a view is named after the place it is at, or else the nearest named place along the trail that day
const viewName=v=>{const n=placeName(v.i);if(!/^km /.test(n))return n;const dn=R.day[v.i];let a=null,ad=5,b=null,bd=5;
  for(const p of PTS){if(p.kind==='high'||R.day[p.i]!==dn)continue;const dd=R.d[p.i]-R.d[v.i];if(dd>0&&dd<ad){ad=dd;a=p}else if(dd<0&&-dd<bd){bd=-dd;b=p}}
  return a&&(!b||ad<=bd)?`Before ${a.name}`:b?`After ${b.name}`:v.peaks.length?`${v.peaks[0].name} view`:`Day ${dn}, km ${(R.d[v.i]-R.d[dayOf(v.i).i0]).toFixed(1)}`};
const viewWhat=v=>{const t=viewName(v),p=v.peaks.filter(m=>`${m.name} view`!==t).slice(0,3).map(m=>esc(m.name));return p.length?p.join(', '):`up to ${Math.round((v.max||v.far)/1000)} km away`};
function renderViewsCard(){const el=$('#viewscard');if(!el)return;let V=[];try{V=bestViews()}catch(e){console.warn('views',e)}if(!V.length){el.hidden=true;return}el.hidden=false;
  el.innerHTML=`<div class="ch"><h2 class="micro">Best views</h2><span class="micro">${V.length} on this hike</span></div><ul class="vlist">${V.map((v,k)=>`<li><button class="vlook" data-look="${k}" aria-label="Look from ${esc(viewName(v))}">${VIEWICON}</button><div><b>${esc(viewName(v))}${v.q===1?' <span class="vbest">Best</span>':''}</b><span>${viewWhat(v)} · looking ${HP.compass(v.az)}</span><span class="micro">Day ${R.day[v.i]} · km ${(R.d[v.i]-R.d[dayOf(v.i).i0]).toFixed(1)} · ${fmtClock(CLK[v.i])}</span></div></li>`).join('')}</ul>`+
    `<button class="btn small fpgo" data-fp="1">${VIEWICON}Walk it in first person</button>`}
function viewsDetail(){const V=bestViews();if(!V.length)return null;const M=[],sunny=[];
  // a low sun in front of you makes the view hazy and the summits dark against the light
  V.forEach(v=>{const sn=sunAt(CLK[v.i],R.day[v.i]),saz=(Math.atan2(sn.x,-sn.z)*180/Math.PI+360)%360;let d=Math.abs(saz-v.az)%360;d=Math.min(d,360-d);if(sn.y>.05&&sn.y<.57&&d<45)sunny.push(viewName(v))});
  if(sunny.length)M.push(['info',`Low sun ahead at ${sunny.length===1?'one view':`${sunny.length} views`} (${esc(sunny.join(', '))}): the view looks hazier and photos come out dark. Sunglasses and a cap help.`]);
  M.push(['ok','Plan a longer break at these points. Clear, dry air after a front gives the longest views; afternoon haze and clouds on the summits shorten them.']);
  return{title:'Best views',html:dHero(V.length,V.length===1?'view':'views','the best on this hike, found from the terrain','var(--sun)')+
    dSec('Along the route',`<ul class="dlist vdl">${V.map((v,k)=>`<li><b>${esc(viewName(v))} · ${nf.format(Math.round(R.e[v.i]))} m${v.q===1?' <span class="vbest">Best</span>':''}</b><span>Day ${R.day[v.i]} · km ${(R.d[v.i]-R.d[dayOf(v.i).i0]).toFixed(1)} · about ${fmtClock(CLK[v.i])} · looking ${HP.compass(v.az)}, up to ${Math.round((v.max||v.far)/1000)} km</span>`+
      `${v.peaks.length?`<span>${v.peaks.map(p=>`<span class="nw">${esc(p.name)} ${nf.format(p.e)} m, ${(p.d/1000).toFixed(p.d<10000?1:0)} km</span>`).join(' · ')}</span>`:''}<button class="btn small" data-dact="look:${k}">${VIEWICON}Look from here</button></li>`).join('')}</ul>`)+
    `<button class="btn primary wide" data-dact="walk">${VIEWICON}Walk the hike in first person</button>`+dMeans(M)+
    `<p class="dsrc">From the terrain heights: from points every 200 m, how far you can see all round, how high the mountains stand, how deep the valleys drop and which named summits are in clear sight. Clouds, trees and buildings are not counted.</p>`}}

/* ---------- safety: the trail check, the ground beside the path, help on the way ---------- */
// What the route is like for a beginner, from the paths mapped in OpenStreetMap (D.trail, see js/trail.js), the terrain
// heights beside the path, and the huts, villages and roads along it. Each finding says what, where, why it matters and what to do.
let SAFE=null,SAFEK='',TRAILRUN=null;
// an older check still serves (offline above all); a newer version of the check runs again with a connection
const trailOK=()=>{const T=D&&D.trail;return!!(T&&T.v>=1&&T.v<=HP.TRAIL_V&&T.n===N&&T.paths)};
const pathAt=i=>{const T=D.trail;if(!trailOK())return null;const k=T.pw[i];return k>=0?T.paths[k]:null};
const TURN={S:'Straight on',SL:'Bear left',SR:'Bear right',L:'Turn left',R:'Turn right',HL:'Turn sharp left',HR:'Turn sharp right',KL:'Keep left',KR:'Keep right'};
// emergency numbers, checked November 2026: 112 works across Europe on any network that reaches your phone
const SOS={ro:[['112','emergency'],['+40 725 826 668','Salvamont, mountain rescue']],ch:[['1414','Rega, air rescue'],['112','emergency'],['+41 333 333 333','Rega from a phone that is not Swiss'],['144','ambulance; in Valais also mountain rescue']],
  li:[['112','emergency'],['1414','Rega, air rescue'],['+41 333 333 333','Rega from a phone that is not Swiss']],at:[['140','mountain rescue'],['112','emergency']],it:[['112','emergency, mountain rescue too'],['118','medical emergency']],
  fr:[['112','emergency, mountain rescue too']],de:[['112','emergency, mountain rescue too']],si:[['112','emergency, mountain rescue too']]};
const sosList=cc=>{const out=[],seen=new Set();for(const c of(cc&&cc.length?cc:['']))for(const[n,w]of(SOS[c]||[['112','emergency']]))if(!seen.has(n)){seen.add(n);out.push([n,w])}if(!seen.has('112'))out.push(['112','emergency']);return out};
const ROADY=/^(motorway|trunk|primary|secondary|tertiary|unclassified|residential|living_street|service|track|footway|cycleway|bridleway|pedestrian)/;
// how far the ground keeps falling beside the path: the gentlest of three 15 m steps from 10 to 55 m out, on the lower side, in degrees.
// A slope that stays steep that far means a slip would not stop quickly; a short bank, or a cliff further away, does not count.
function exposure(){if(!HGT)return null;const out=new Float32Array(N);
  for(let i=0;i<N;i++){const a=Math.max(0,i-2),b=Math.min(N-1,i+2);let tx=R.x[b]-R.x[a],ty=R.y[b]-R.y[a];const l=Math.hypot(tx,ty)||1;tx/=l;ty/=l;let mx=0;
    for(const s of[-1,1]){let mn=1e9,hp=null;for(let r=10;r<=55;r+=15){const q=r/MPP*s,h=HGT(R.x[i]-ty*q,R.y[i]+tx*q);if(hp!=null)mn=Math.min(mn,(hp-h)/15);hp=h}mx=Math.max(mx,mn)}
    out[i]=Math.atan(Math.max(0,mx))*180/Math.PI}
  return out}
// the nearest named place within about 1 km on the same day, or nothing
function nearName(i){const d=dayOf(i);let best=null,bd=1.2;for(const p of PTS){if(p.kind==='high'||(R.day[p.i]!==d.n&&p.i!==d.i0-1))continue;const dd=Math.abs(R.d[p.i]-R.d[i]);if(dd<bd){bd=dd;best=p}}return best?best.name:''}
const kmIn=i=>R.d[i]-R.d[dayOf(i).i0];
const mlen=(a,b)=>{const v=(R.d[b]-R.d[a])*1000;return v>=1000?`${(v/1000).toFixed(1)} km`:`${Math.max(20,Math.round(v/10)*10)} m`};
const aboutH=t=>t<1?`${Math.max(10,Math.round(t*6)*10)} min`:fmtH(Math.round(t*6)/6).replace(' 00','');
// where a finding is: day, km (from the start of that day) and the nearest place
function whereOf(x,day=DAYS.length>1){const a=x.i0,b=x.i1,one=b-a<3||R.day[b]!==R.day[a],n=nearName(x.nm??a);
  return`${day?`Day ${R.day[a]} · `:''}km ${kmIn(a).toFixed(1)}${one?'':`–${kmIn(b).toFixed(1)}`}${n?` · ${esc(n)}`:''}`}
function safety(){const key=[N,DAYS.length,DAYS.map(d=>d.i1).join(','),!!HGT,D.trail&&D.trail.at,S.pace,S.breaks,S.start,TRAILRUN?1:0,D.date,D.fc?D.fc.issued:0].join('|');if(SAFE&&SAFEK===key)return SAFE;
  const T=trailOK()?D.trail:null,cc=T?T.cc||[]:[],ch=cc.length>0&&cc.every(c=>c==='ch'||c==='li'),it=[],len=(a,b)=>R.d[b]-R.d[a];
  const add=(lvl,k,i0,i1,what,why,todo,tip,o={})=>{const x={lvl,k,i0,i1,what,why,todo,tip,...o};it.push(x);return x};
  const runs=(f,minKm=0,gapKm=.06)=>{const out=[];let s=-1;for(let i=0;i<=N;i++){const on=i<N&&f(i);if(on&&s<0)s=i;if(!on&&s>=0){const l=out[out.length-1];if(l&&R.d[s]-R.d[l.i1]<gapKm)l.i1=i-1;else out.push({i0:s,i1:i-1});s=-1}}return out.filter(r=>len(r.i0,r.i1)>=minKm)};
  // the grade of the way at each point: the mapped SAC grade, or in Switzerland what its waymarks mean (yellow T1, white-red-white T2–T3, white-blue-white T4 and up)
  const G=new Int8Array(N).fill(-1),wbw=new Uint8Array(N);let marked=0,mapped=0,hard=0;
  if(T)for(let i=0;i<N;i++){const p=pathAt(i);if(!p)continue;mapped++;if(p.mk||p.sym>=0)marked++;let g=p.sac;
    if(ch&&p.sym>=0){const s=T.syms[p.sym];if(/^yellow:/.test(s)&&/diamond/.test(s))g=g||1;else if(/^red:white:red_bar/.test(s))g=Math.max(g,2);else if(/^blue:white:blue_bar/.test(s)){if(g<4)wbw[i]=1;g=Math.max(g,4)}}
    if(!g&&ROADY.test(p.hw))g=1;G[i]=g;if(g>hard)hard=g}
  // the official Swiss hiking trails (swisstopo, since 2.3): an official alpine trail is white-blue-white whatever the map's tags say,
  // when the route keeps to it for at least 150 m
  // (only the part in Switzerland counts: a route that crosses the border has other countries' signs there)
  const OF=T&&T.ofc&&T.ofc.length===N?T.ofc:null,inS=OF?Uint8Array.from({length:N},(_,i)=>HP.maps.inCH(R.lat[i],R.lon[i])?1:0):null;let official=null;
  if(OF){let on=0,nS=0;for(let i=0;i<N;i++)if(inS[i]){nS++;if(OF[i])on++}official=nS>N*.2?on/nS:null;
    for(const r of runs(i=>OF[i]===2,.15,.05))for(let i=r.i0;i<=r.i1;i++){if(G[i]<4)wbw[i]=1;G[i]=Math.max(G[i],4);if(G[i]>hard)hard=G[i]}}
  // steep ground below the path, where the map does not already say the path is easy (T1, yellow signs, tracks and roads)
  const EX=exposure(),exp=i=>EX&&EX[i]>=42&&G[i]!==1;
  if(T){for(const r of runs(i=>G[i]>=4,0,.15)){let g=0,wb=0;for(let i=r.i0;i<=r.i1;i++){g=Math.max(g,G[i]);wb|=wbw[i]}
      add('bad','sac',r.i0,r.i1,wb?'Alpine route, white-blue-white marks':`Alpine route (T${g})`,`${mlen(r.i0,r.i1)} of exposed ground where you need your hands; a slip can be serious.`,'Not for beginners: take an easier way, or go with someone experienced.','not for beginners')}
    for(const r of runs(i=>G[i]===3,.05,.15))add('warn','sac',r.i0,r.i1,'Demanding mountain trail (T3)',`${mlen(r.i0,r.i1)} of steep, rocky ground; you may need your hands for balance.`,'Boots with grip and poles, dry weather; turn back if it feels too much.','poles, dry weather')}
  for(const h of T?T.hz:[]){const a=h.i0,b=h.i1;
    if(h.k==='vf')add('bad','vf',a,b,'Via ferrata','Steel cables and ladders on rock: a climbing route, not a hiking trail.','Needs a harness, via ferrata set and helmet, and experience.','climbing kit needed');
    else if(h.k==='glacier')add('bad','glacier',a,b,`Glacier${h.name?`: ${esc(h.name)}`:''}`,`${mlen(a,b)} on ice, with hidden crevasses.`,'Only roped up, with crampons and someone who knows glaciers.','rope and crampons');
    else if(h.k==='closed')add(h.type==='detour'?'warn':'bad','closed',a,b,h.type==='detour'?'Diversion':'Path closed',`${esc(h.title||'Official notice')}: ${esc(h.reason||'closed')}${h.until?`, ${esc(h.until)}`:''}.`,h.type==='detour'?'Follow the signed diversion on the spot.':'Plan another way.',h.type==='detour'?'follow the diversion':'plan another way');
    else if(h.k==='aid')add('warn','aid',a,b,'Ladders or chains','Steep rock with fixed aids to hold on to.','Keep three points of contact; avoid when wet, icy or stormy.','hands on the chains');
    else if(h.k==='hazard')add('warn','hazard',a,b,`Danger on the map: ${esc(h.what)}`,'Mappers noted this danger here.','Don’t stop here; ask locally about conditions.','don’t stop here');
    else if(h.k==='acc')add('warn','acc',a,b,'Private or closed path',`${mlen(a,b)} where the map says walkers may not go.`,'Check on the spot, or plan another way.','check on the spot');
    else if(h.k==='cliff'){if(h.top)add(G[a]===1?'info':'warn','edge',a,b,'Cliff edge beside the path','A rock face drops away right next to the path.','Keep to the path, above all in fog, wind or when tired.','keep to the path');
      else add('info','foot',a,b,'Rock face above the path','Stones can fall, most after rain, frost or thaw.','Don’t take breaks below it.','')}}
  if(T){const by=k=>T.hz.filter(h=>h.k===k).sort((a,b)=>a.i0-b.i0),off=by('off'),vis=by('vis'),fo=by('ford'),inf=by('inf');
    const grp=(L,gap)=>{const out=[];for(const h of L.slice().sort((x,y)=>x.i0-y.i0)){const l=out[out.length-1];if(l&&R.d[h.i0]-R.d[l.i1]<gap){l.i1=Math.max(l.i1,h.i1);l.v=Math.max(l.v||0,h.v||0)}else out.push({i0:h.i0,i1:h.i1,v:h.v||0})}return out};
    for(const g of grp(off,.1)){const l=len(g.i0,g.i1);add(l>=.5?'bad':'warn','off',g.i0,g.i1,'No path on the map',l>=.5?`${mlen(g.i0,g.i1)} away from any mapped path: easy to lose your way.`:`${mlen(g.i0,g.i1)} away from the mapped paths: a gap in the map, or a shortcut.`,'Follow the guide on your phone and check your position often.','follow the guide')}
    for(const g of grp(vis,.15))add(g.v>=4?'bad':'warn','vis',g.i0,g.i1,`Path ${HP.VISN[g.v]}`,`${mlen(g.i0,g.i1)} where the path is hard to make out on the ground.`,'Follow the marks closely; not in fog or snow.','follow the marks');
    if(fo.length)add('info','ford',fo[0].i0,fo[fo.length-1].i1,`${fo.length} stream crossing${fo.length>1?'s':''} without a bridge`,'Usually a step across stones, but rain and snowmelt can make them deep and fast.','After heavy rain cross only where it is calm and shallow, or wait.','',{at:fo.map(h=>h.i0)});
    if(inf.length){const g=grp(inf,.2);add('info','inf',g[0].i0,g[g.length-1].i1,`Unofficial path${g.length>1?'s':''}`,'Paths made by walkers, not kept up.','Fine when dry and easy to see; turn back if it fades.','',{at:g.map(x=>x.i0)})}
    for(const r of runs(i=>{const p=pathAt(i);return!!p&&!p.mk&&p.sym<0&&G[i]!==1},1.5,.2))add('info','unmk',r.i0,r.i1,'No waymarks',`${mlen(r.i0,r.i1)} with no marked route on the map.`,'Navigate with the guide on your phone.','')}
  for(const r of runs(exp,.05,.1)){let mx=0;for(let i=r.i0;i<=r.i1;i++)mx=Math.max(mx,EX[i]);
    add('warn','drop',r.i0,r.i1,mx>=55?'Very steep drop beside the path':'Steep drop beside the path',`${mlen(r.i0,r.i1)} where the ground falls away steeply below the path: a slip would not stop quickly.`,'Watch every step; not in rain, snow or fog.','watch your step',{mx})}
  // paths that are not part of the signed Swiss hiking network: no yellow signposts or marks to expect there (roads aside)
  if(OF&&official>.3)for(const r of runs(i=>inS[i]&&!OF[i]&&!(pathAt(i)&&ROADY.test(pathAt(i).hw)&&G[i]===1),.4,.1))
    add('info','unoff',r.i0,r.i1,'Not on the official hiking trails',`${mlen(r.i0,r.i1)} that is not part of Switzerland’s signed hiking network (swisstopo).`,'Expect no yellow signposts or marks here: follow the live guide on your phone, and turn back if the path fades.','');
  // the path itself very steep (over 20° along about 200 m): a note, as slips happen most on the way down
  for(const r of runs(i=>SLOPE[i]>=22,.15,.06))add('info','steep',r.i0,r.i1,'Very steep path',`${mlen(r.i0,r.i1)} at over 20°, going ${R.e[r.i1]>R.e[r.i0]?'up':'down'}.`,'Poles and short steps, above all on the way down; slippery when wet.','');
  // old snow on the path (since 2.3): take care where it is likely; not for beginners only where the forecast models show snow lying
  // on steep or demanding ground (the typical snow for a date varies too much from year to year to say more)
  const SN=snowAt(),steepAt=i=>SLOPE[i]>=22||G[i]>=3||(EX&&EX[i]>=35);
  // one finding a day, so each says where it is; in winter (from late November to February) it is the season's snow, not the last one's
  for(const r0 of runs(i=>SN.lv[i]>0,.1,.3))for(const dy of DAYS){const r={i0:Math.max(r0.i0,dy.i0),i1:Math.min(r0.i1,dy.i1)};if(r.i1<=r.i0||R.d[r.i1]-R.d[r.i0]<.1)continue;
    let mx=0,hi=r.i0,st=false,fc=false,north=false;for(let i=r.i0;i<=r.i1;i++){if(SN.lv[i]>mx)mx=SN.lv[i];if(R.e[i]>R.e[hi])hi=i;if(SN.lv[i]===2&&steepAt(i))st=true;if(SN.why[i]===2)fc=true;if(facing(i)==='n')north=true}
    const d=hikeDate(dy.n),doy=doyOf(d),sd=D.center.lat<0?(doy+183)%366:doy,win=sd>320||sd<60,when=d.getDate()<11?'early':d.getDate()<21?'mid':'late',mon=MONN[d.getMonth()+1];
    const top=nf.format(Math.round(R.e[hi])),line=nf.format(Math.round(oldSnowLine(doy,D.center.lat)/50)*50);
    const why=fc?`The weather models show snow lying on the ground ${mx===2?'at this height':'just above this height'} near your date; this stretch reaches ${top} m.`
      :win?`In ${when} ${mon} snow usually lies above about ${line} m${north?', longest on slopes facing north like this one':''}; this stretch reaches ${top} m.`
      :`In ${when} ${mon} the winter’s snow usually still lies above about ${line} m${north?', and longer on slopes facing north like this one':''}; this stretch reaches ${top} m.`;
    if(mx===2)add(st&&fc?'bad':'warn','snow',r.i0,r.i1,`${win?'Snow':'Old snow'} likely ${st?'on steep ground':'on the path'}`,why+(st?' Hard snow on a slope is where beginners slip most.':''),
      win?(st?'Winter conditions: on steep snow you need crampons and to know how to use them. Ask the tourist office, go with someone experienced, or choose a walk lower down.'
          :'Winter conditions: the path and its marks may be under snow. Ask the tourist office about it, take poles, and turn back if the way gets hard to find.')
        :st?'Ask the hut or the local tourist office about the snow a few days before. On steep snow you need microspikes and to know how to use them; otherwise wait for later in the season, or choose a lower route.'
        :'Ask the hut about conditions a few days before. Take poles; cross snow patches carefully, and go round them where you can.','ask about the snow',{fc,nm:hi});
    else add('info','snow',r.i0,r.i1,win?'Snow possible':'Snow patches possible',why,win?'Early winter snow can cover the path at this height: ask about the conditions before you go, and take poles.'
      :'Snow left in gullies and on north-facing slopes is hard and slippery in the morning: go round it, or cross it slowly with poles.','',{fc,nm:hi})}
  // one finding per place: edges and drops inside a demanding or alpine stretch become part of it, edges inside a drop too
  const inside=(x,y)=>x.i0>=y.i0-3&&x.i1<=y.i1+3;
  for(const y of it.filter(y=>y.k==='sac'||y.k==='drop'))for(const x of it)if(x!==y&&!x.gone&&(x.k==='edge'||x.k==='foot'||x.k==='steep'||(x.k==='drop'&&y.k==='sac'))&&inside(x,y)){x.gone=true;if(x.k==='edge'||x.k==='drop')y.edge=1}
  for(let k=it.length-1;k>=0;k--)if(it[k].gone)it.splice(k,1);
  for(const y of it)if(y.edge)y.why+=y.k==='sac'?' Cliffs and steep drops beside the path in places.':' A cliff edge too.';
  // help on the way: huts, villages and roads, and the stretch furthest from them
  const helpI=[...new Set([...PTS.filter(p=>/hut|village|town|lift/.test(p.kind)).map(p=>p.i),0,N-1,...(T?T.road.flatMap(([a,b])=>[a,b]):[])])].sort((a,b)=>a-b);
  let far={t:0,i:0,a:0,b:0};for(let k=0;k<helpI.length-1;k++){const a=helpI[k],b=helpI[k+1],t=(WALK[b]-WALK[a])/2;if(t<=far.t)continue;let mi=a;const mid=WALK[a]+t;for(let i=a;i<=b;i++)if(Math.abs(WALK[i]-mid)<Math.abs(WALK[mi]-mid))mi=i;far={t,i:mi,a,b}}
  if(far.t>=1.5){const na=nearName(far.a),nb=nearName(far.b);add(far.t>=3?'warn':'info','remote',far.i,far.i,'Most remote point',`About ${aboutH(far.t)} on foot from the nearest hut, village or road${na&&nb&&na!==nb?`, between ${esc(na)} and ${esc(nb)}`:''}.`,'Tell someone your plan; carry first aid, a warm layer and a charged phone.','')}
  const rank={bad:0,warn:1,info:2},kr={sac:0,vf:0,glacier:0,closed:0,off:1,vis:2,drop:3,edge:4,aid:4,hazard:5,acc:5,remote:6};
  it.sort((a,b)=>rank[a.lvl]-rank[b.lvl]||a.i0-b.i0);
  const lvl=!T&&!EX?'wait':it.some(x=>x.lvl==='bad')?'bad':it.some(x=>x.lvl==='warn')?'warn':'ok';
  const top=it.filter(x=>x.lvl!=='info').slice().sort((a,b)=>rank[a.lvl]-rank[b.lvl]||(kr[a.k]??7)-(kr[b.k]??7)||a.i0-b.i0);
  // the waymarks to follow, in order: runs of one mark, short changes ignored
  const mk=[];if(T){for(const[a,b,s]of T.marks){if(len(a,b)<.15)continue;const sym=T.syms[s],l=mk[mk.length-1];if(l&&l.sym===sym&&R.d[a]-R.d[l.i1]<1)l.i1=b;else mk.push({i0:a,i1:b,sym})}}
  const marks=[];for(const m of mk){let a=m.i0;while(a<=m.i1){const b=Math.min(m.i1,dayOf(a).i1);if(len(a,b)>=.1)marks.push({i0:a,i1:b,sym:m.sym});a=b+1}}   // one line per day
  const junc=T?T.junc.filter(j=>j.key&&!j.town):[];
  // a level for each point, for the line colours and the strip
  const lv=new Uint8Array(N);for(const x of it)if(x.lvl!=='info')for(let i=x.i0;i<=x.i1;i++)lv[i]=Math.max(lv[i],x.lvl==='bad'?2:1);
  SAFE={T,lvl,lv,items:it,top,marks,junc,hard,mapped:N?mapped/N:0,marked:mapped?marked/mapped:0,official,EX,cc,ch,far};SAFEK=key;return SAFE}
const EASYK=/^(sac|vf|glacier|closed|aid|drop|edge|off|vis|hazard)$/,canEase=F=>F.items.some(x=>x.lvl!=='info'&&EASYK.test(x.k));
const VERD={ok:['Suits a beginner','var(--good)'],warn:['Take care in places','var(--fair)'],bad:['Not for beginners','var(--bad)'],wait:['Not checked yet','var(--mute)']};
const LVC=['color-mix(in srgb,var(--good) 55%,transparent)','var(--fair)','var(--bad)'];
const wmChip=(s,cc)=>`<span class="wmc">${HP.osmcSVG(s,18)}${esc(HP.osmcWords(s,cc&&cc[0]))}</span>`;
// a strip along the whole route: green where it is easy, amber where to take care, red where it is hard, a tick at each night
function safeStrip(F){const tot=R.d[N-1]||1;let h='',s=0;for(let i=1;i<=N;i++)if(i===N||F.lv[i]!==F.lv[s]){h+=`<i style="width:${((R.d[i-1]-R.d[s])/tot*100).toFixed(2)}%;background:${LVC[F.lv[s]]}"></i>`;s=i}
  return`<div class="sstrip" aria-hidden="true">${h}${DAYS.slice(0,-1).map(d=>`<b style="left:${(R.d[d.i1]/tot*100).toFixed(2)}%"></b>`).join('')}</div>`}
function renderSafety(){const el=$('#safecard');if(!el||!R)return;const F=safety(),T=F.T,cc=F.cc;
  const head=`<div class="ch"><h2 class="micro">Safety</h2><span class="micro">${T?'trail check':'terrain only'}</span></div>`;
  if(!T&&!F.EX){el.innerHTML=head+(TRAILRUN?'<div class="skel sk1"></div><div class="sstrip skel"></div><div class="skel sk2"></div><div class="skel sk3"></div>':'')+`<p class="small mute">${TRAILRUN?'Checking the paths on the map…':D.trailErr&&navigator.onLine?'The trail data could not be loaded just now. <button type="button" class="lnk" data-act="trailretry">Try again</button>':'Connect to the internet once to check the trail; the result stays with the hike for offline use.'}</p>`;return}
  const[vt,vc]=VERD[F.lvl],top=F.top.slice(0,3),syms=[...new Set(F.marks.map(m=>m.sym))].slice(0,3);
  el.innerHTML=head+`<div class="verd" style="--c:${vc}"><i></i><b>${vt}</b>${TRAILRUN?'<span class="small mute">checking…</span>':''}</div>`+safeStrip(F)+
    (T?`<ul class="kpis sk"><li><b>${F.hard?'T'+F.hard:'–'}</b><span>hardest</span></li><li><b>${Math.round(F.marked*100)}%</b><span>marked</span></li><li><b>${F.junc.length}</b><span>junctions</span></li></ul>`:'')+
    (top.length?`<ul class="alerts sfa">${top.map(x=>`<li class="al ${x.lvl}">${x.what}<small>${whereOf(x)}</small></li>`).join('')}</ul>`:T?'<p class="small mute">No hard or exposed places found on the map.</p>':'')+
    // terrain findings without the trail check: say why, and offer to try again
    (!T&&!TRAILRUN?`<p class="small mute">${D.trailErr&&navigator.onLine?'The paths could not be checked just now. <button type="button" class="lnk" data-act="trailretry">Try again</button>':'The paths are not checked yet: that happens the next time this hike opens with a connection.'}</p>`:'')+
    (syms.length?`<div class="wmrow"><span class="micro">Follow</span><div>${syms.map(s=>wmChip(s,cc)).join('')}</div></div>`:'')+
    (F.lvl==='bad'&&canEase(F)?`<button class="btn small easybtn" data-act="easier">Find an easier way</button>`:'')+
    `<div class="wmrow sos"><span class="micro">Emergency</span><div>${sosList(cc).slice(0,2).map(([n,w])=>`<a class="sosn" href="tel:${n.replace(/\s/g,'')}">${n}</a><span class="small mute">${esc(w.split(',')[0])}</span>`).join('')}</div></div>`}
function safetyDetail(){const F=safety(),T=F.T,cc=F.cc,[vt,vc]=VERD[F.lvl],multi=DAYS.length>1;
  // the profile of the whole route, coloured by how hard each part is
  let e0=1e9,e1=-1e9;for(let i=0;i<N;i++){e0=Math.min(e0,R.e[i]);e1=Math.max(e1,R.e[i])}const X=R.d[N-1],Y0=Math.floor(e0/200)*200,Y1=Math.ceil(e1/200)*200,step=Math.max(1,Math.round(N/320));
  const prof=chart(X,Y1-Y0,(x,y)=>{let p='';for(let i=0;i<N-1;i+=step){const j=Math.min(N-1,i+step);let l=0;for(let k=i;k<j;k++)l=Math.max(l,F.lv[k]);
      p+=`<polygon points="${x(R.d[i]).toFixed(1)},${y(0)} ${x(R.d[i]).toFixed(1)},${y(R.e[i]-Y0).toFixed(1)} ${x(R.d[j]).toFixed(1)},${y(R.e[j]-Y0).toFixed(1)} ${x(R.d[j]).toFixed(1)},${y(0)}" style="fill:${LVC[l]}"/>`}
    for(const d of DAYS.slice(0,-1))p+=`<line x1="${x(R.d[d.i1])}" x2="${x(R.d[d.i1])}" y1="${y(0)}" y2="${y(Y1-Y0)}" class="dsep"/>`;
    return p},{h:170,yl:'m',ys:[0,(Y1-Y0)/2,Y1-Y0].map(Math.round)}).replace(/(<text x="[\d.]+" y="[\d.]+" text-anchor="end">)(\d+)(<\/text>)/g,(m,p1,v,p3)=>p1+nf.format(+v+Y0)+p3);
  const leg=`<p class="dleg">${[['Fine',0],['Take care',1],['Hard',2]].map(([t,k])=>`<span><i class="lsw" style="background:${LVC[k]}"></i>${t}</span>`).join('')}${DAYS.length>1?'<span><i class="lsw dash"></i>night</span>':''}</p>`;
  // the findings, day by day
  const row=x=>`<li class="sf ${x.lvl}"><div class="sfh"><b>${x.what}</b><button class="lnk" data-dact="show:${x.i0}">Show</button></div><span class="wh">${x.at?x.at.slice(0,8).map(i=>`${multi?`D${R.day[i]} `:''}km ${kmIn(i).toFixed(1)}`).join(', ')+(x.at.length>8?' …':''):whereOf(x,false)}</span><span>${x.why}</span><span class="todo">${x.todo}</span></li>`;
  const byDay=DAYS.map(d=>{const L=F.items.filter(x=>R.day[x.i0]===d.n&&!x.at);return L.length?`${multi?`<h4 class="micro dsub">Day ${d.n} · ${esc(d.from)} → ${esc(d.to)}</h4>`:''}<ul class="dlist sfl">${L.map(row).join('')}</ul>`:''}).join('');
  const along=F.items.filter(x=>x.at),alongH=along.length?`${multi?'<h4 class="micro dsub">Along the way</h4>':''}<ul class="dlist sfl">${along.map(row).join('')}</ul>`:'';
  // the waymarks to follow, in order
  const marks=F.marks.map(m=>`<li>${HP.osmcSVG(m.sym,26)}<div><b>${esc(HP.osmcWords(m.sym,cc[0]))}</b><span>${multi?`Day ${R.day[m.i0]} · `:''}km ${kmIn(m.i0).toFixed(1)}–${kmIn(m.i1).toFixed(1)}${nearName(m.i1)?` · to ${esc(nearName(m.i1))}`:''}</span></div></li>`).join('');
  // the junctions, as a turn sheet for each day
  const J=DAYS.map(d=>{const L=F.junc.filter(j=>R.day[j.i]===d.n);if(!L.length)return'';
    const li=L.map(j=>`<li><span class="jk">km ${kmIn(j.i).toFixed(1)}</span><div><b>${TURN[j.c]||'Go on'}</b><span>${j.sym>=0?`on ${esc(HP.osmcWords(T.syms[j.sym],cc[0]))}`:'on the unmarked path'}${j.gp?` · signpost ${esc(j.gp)}${j.ele?`, ${esc(j.ele)} m`:''}`:''}</span></div>${j.sym>=0?HP.osmcSVG(T.syms[j.sym],22):''}</li>`).join('');
    return`<details class="jday"${DAYS.length===1||d.n===S.day?' open':''}><summary><b>${multi?`Day ${d.n}`:'The route'}</b><span>${L.length} junction${L.length>1?'s':''}</span></summary><ul class="dlist jl">${li}</ul></details>`}).join('');
  const M=[];
  if(F.lvl==='bad')M.push(['bad','Parts of this route are beyond a beginner. Look for an easier way round them, or go with an experienced friend or a guide.']);
  else if(F.lvl==='warn')M.push(['warn','A good route for a careful beginner in good weather. Read the places to take care, and be ready to turn back.']);
  else if(T)M.push(['ok','Nothing on the map makes this route hard. Still check the weather and the daylight.']);
  if(F.junc.length)M.push(['info',`${F.junc.length} junctions where you must choose a way. The live guide tells you at each one, and warns you when you leave the route.`]);
  M.push(['info','Maps can be wrong or out of date, and paths change with the weather and the season. Follow the signs on the ground, ask at huts, and turn back when unsure.']);
  return{title:'Safety',html:dHero(vt,'',T?`trail check · ${new Date(T.at).toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'})}`:'terrain only: the paths are not checked yet',vc).replace('class="dhero"','class="dhero txt"')+
    (T?dKpis([[F.hard?'T'+F.hard:'–','hardest'],F.official!=null?[`${Math.round(F.official*100)}%`,'official']:[`${Math.round(F.mapped*100)}%`,'mapped'],[`${Math.round(F.marked*100)}%`,'marked'],[String(F.junc.length),'junctions']]):'')+
    (F.official!=null?`<p class="small mute dmeta">${Math.round(F.official*100)}% of the route is on Switzerland’s official hiking trails (swisstopo), the signed network with yellow signposts.</p>`:'')+
    dSec('Along the route',`<div class="dfig">${prof}</div>`+leg)+
    dSec('Places to take care',byDay||alongH?byDay+alongH:'<p class="small mute">None found on the map or in the terrain.</p>',F.items.length?String(F.items.length):'')+
    (marks?dSec('Waymarks to follow',`<ul class="dlist wml">${marks}</ul>`):'')+
    (J?dSec('Turn by turn',J):'')+
    dSec('Help',`<ul class="dlist sosl">${sosList(cc).map(([n,w])=>`<li><a class="sosn" href="tel:${n.replace(/\s/g,'')}">${n}</a><span>${esc(w)}</span></li>`).join('')}</ul><p class="small mute">112 works on any phone network that reaches you. The live guide shows your position to read out to rescuers.</p>`)+
    dMeans(M)+
    `<div class="dbtns"><button class="btn wide primary" data-dact="guide">Open the live guide</button>${canEase(F)?'<button class="btn wide" data-dact="easier">Find an easier way</button>':''}<button class="btn wide ghost" data-dact="recheck">Check the trail again</button></div>`+
    `<p class="dsrc">Paths, grades (SAC scale T1–T6), waymarks, junctions, cliffs, glaciers and stream crossings from OpenStreetMap${T?`, checked ${new Date(T.at).toLocaleDateString('en-GB')}`:''}. Steep drops from the terrain heights (about 25 m detail, so a narrow ledge may not show).${F.ch?' Closures from the Swiss hiking trails (Federal Roads Office, swisstopo).':''}</p>`}}
// fetch the trail check when there is none yet (or it is out of date), then keep it with the hike
async function runTrail(force){if(TRAILRUN||!R||!navigator.onLine||!HP.trailCheck)return;if(!force&&trailOK()&&D.trail.v===HP.TRAIL_V&&Date.now()-D.trail.at<60*864e5)return;const plan=D;
  TRAILRUN=true;SAFEK='';renderSafety();
  try{const T=await HP.trailCheck(plan,AC&&AC.signal);if(plan!==D)return;D.trail=T;delete D.trailErr;
    // the path grades fill in the difficulty for routes that came as a file
    if(!D.sacKnown){let n=0;for(let i=0;i<N;i++)if(T.pw[i]>=0)n++;if(n/N>.6){for(let i=0;i<N;i++){const p=T.pw[i]>=0?T.paths[T.pw[i]]:null;R.sac[i]=p?p.sac:0}D.sacKnown=true;if(V3&&V3.modes)V3.modes()}}
    save();if(force)HP.toast('Trail checked')}
  catch(e){if(e&&e.name==='AbortError')return;console.warn('trail',e);if(plan===D){D.trailErr=Date.now();save();if(force)HP.toast('The trail data could not be loaded. Try again later.')}}
  finally{if(plan===D){TRAILRUN=null;SAFEK='';refreshTimes();if(V3&&V3.recolor&&S.color==='safe')V3.recolor()}}}

/* ---------- ArcGIS World Imagery ---------- */
// Esri asks for its data sources to be named exactly as the service gives them; ask once a visit, keep the last answer.
function esriCredit(){esriMeta=true;try{const c=localStorage.getItem('hp-esri-src');if(c)$('#attrib-esri-src').textContent=c}catch(e){}
  HP.fetchT(`${ESRI_URL}?f=json&token=${ESRI_KEY}`,{},10000,'json').then(x=>x.body).then(j=>{const c=j&&typeof j.copyrightText==='string'&&j.copyrightText.replace(/^Source:\s*/i,'').trim();if(c&&c.length<400){$('#attrib-esri-src').textContent=c;try{localStorage.setItem('hp-esri-src',c)}catch(e){}}}).catch(()=>{})}
function esriFailed(){if(HP.maps.esriOff)return;if(HP.maps.esriFail())HP.toast('The ArcGIS maps are not available right now, so the 3D view uses the usual ones.')}

/* ---------- profile ---------- */
const SKYC={sun:['#f2c641','Sun'],cu:['#ead58b','Sun and cloud'],shade:['#b8ae8e','Mountain shade'],grey:['#a9b2b8','Grey, overcast'],cloud:['#d9dee2','In cloud or fog'],rain:['#4d8fd4','Rain'],snow:['#b7d3f0','Snow or sleet'],storm:['#7b4fc9','Thunderstorm'],night:['#28344d','Dark'],none:['#e6e8e4','No forecast']};
const TSTOP=[[-10,'#2c3e94'],[-5,'#3b6fc7'],[0,'#6aa6e0'],[5,'#9fd0e8'],[10,'#b9e3c4'],[15,'#e8e59a'],[20,'#f6c75f'],[25,'#f39a4a'],[30,'#e2563a']];
const tcol=T=>{if(T<=TSTOP[0][0])return TSTOP[0][1];for(let k=1;k<TSTOP.length;k++)if(T<=TSTOP[k][0])return TSTOP[k-1][1];return TSTOP[TSTOP.length-1][1]};
function skyClass(c,i,t){if(c.st.nofc)return'none';if(c.thd!=null&&c.thd<3000)return'storm';if(c.pt)return c.pt==='snow'||c.pt==='sleet'?'snow':'rain';if(c.inC)return'cloud';if(sunAt(t,R.day[i]).y<=0)return'night';const st=c.st;if(st.over||(st.deckShade&&st.deck&&R.e[i]<st.deck.top))return'grey';if(SHADE[i])return'shade';return(st.cu&&st.cu.cover>.2)||(st.cells&&st.cells.some(q=>q.I>.2))?'cu':'sun'}
const profRange=()=>S.day?[DAYS[S.day-1].i0,DAYS[S.day-1].i1]:[0,N-1];
function drawProfile(){const prof=$('#prof');
  if(!R||!prof)return;const W=prof.clientWidth,H=prof.clientHeight;if(!W||!H)return;
  const on=S.wx!=='plain',[a,b]=profRange(),m={l:50,r:14,t:24,b:on?56:26},narrow=W<520;
  let lo=1e9,hi=-1e9;for(let i=a;i<=b;i++){lo=Math.min(lo,R.e[i]);hi=Math.max(hi,R.e[i])}
  lo=Math.floor((lo-80)/100)*100;hi=Math.ceil((hi+120)/100)*100;
  const x0=R.d[a],x1=R.d[b],X=v=>m.l+(v-x0)/(x1-x0)*(W-m.l-m.r),Y=v=>m.t+(hi-v)/(hi-lo)*(H-m.t-m.b);
  PX={X,Y,a,b,x0,x1,m,W,H};const step=Math.max(1,Math.floor((b-a)/(W-m.l-m.r)));
  let s='',leg='';const span=hi-lo,tick=span>1500?500:span>600?200:100;
  for(let v=Math.ceil(lo/tick)*tick;v<=hi;v+=tick)s+=`<line class="g" x1="${m.l}" x2="${W-m.r}" y1="${Y(v)}" y2="${Y(v)}"/><text class="ax" x="${m.l-6}" y="${Y(v)+4}" text-anchor="end">${nf.format(v)}</text>`;
  let cs=[];
  if(on){for(let x=m.l;x<=W-m.r;x+=3){const v=x0+(x-m.l)/(W-m.l-m.r)*(x1-x0),i=nearestByDist(v,a,b);cs.push({x,i,c:cond(i,CLK[i])})}
    const cY=v=>Y(Math.min(hi,Math.max(lo,v))).toFixed(1),items=[];
    const bandPath=(f0,f1)=>{let p='';cs.forEach((q,k)=>p+=(k?'L':'M')+q.x+','+cY(f0(q)));for(let k=cs.length-1;k>=0;k--)p+='L'+cs[k].x+','+cY(f1(cs[k]));return p+'Z'};
    if(cs.some(q=>q.c.st.deck)){s+=`<path d="${bandPath(q=>q.c.st.deck?q.c.st.deck.base:hi,q=>q.c.st.deck?Math.min(q.c.st.deck.top,hi):hi)}" fill="#8f9ba5" fill-opacity=".2"/>`;const q=cs.find(q=>q.c.st.deck&&q.c.st.deck.base<hi-60);if(q)s+=`<text class="wl" x="${q.x+4}" y="${Math.max(m.t+12,+cY(q.c.st.deck.base)-6)}">cloud from ${nf.format(Math.round(q.c.st.deck.base/50)*50)} m</text>`;items.push(['#8f9ba5','Cloud'])}
    if(cs.some(q=>q.c.st.fog&&q.c.st.fog.amt>.05)){s+=`<path d="${bandPath(()=>lo,q=>q.c.st.fog&&q.c.st.fog.amt>.05?q.c.st.fog.top:lo)}" fill="#b9c3ca" fill-opacity=".38"/>`;items.push(['#b9c3ca','Fog'])}
    if(cs.some(q=>q.c.st.snow)){s+=`<path d="${bandPath(q=>q.c.st.snow||hi,()=>hi)}" fill="#a9cdf0" fill-opacity=".3"/>`;items.push(['#a9cdf0','Snow on the ground'])}
    let fp='',fl=null;cs.forEach(q=>{const f=q.c.st.fl;if(f>lo&&f<hi){fp+=(fl?'L':'M')+q.x+','+Y(f).toFixed(1);fl=q}else fl=null});
    if(fp){s+=`<path d="${fp}" fill="none" stroke="#1c7ed6" stroke-width="1.6" stroke-dasharray="5 4"/>`;leg+=`<span><i class="ln" style="--c:#1c7ed6"></i>0 °C level</span>`}
    let r0=null;cs.forEach((q,k)=>{const st=q.c.thd!=null&&q.c.thd<8000;if(st&&r0===null)r0=q.x;if((!st||k===cs.length-1)&&r0!==null){const r1=st?q.x+3:q.x;s+=`<rect x="${r0}" y="${m.t}" width="${Math.max(3,r1-r0)}" height="${H-m.t-m.b}" fill="#7b4fc9" fill-opacity=".13"/>`;if(r1-r0>40)s+=`<text class="wl" x="${r0+4}" y="${m.t+12}">storms</text>`;r0=null}});
    if(cs.some(q=>q.c.thd!=null&&q.c.thd<8000))items.push(['#7b4fc9','Storm within 8 km']);
    items.forEach(([c,t])=>leg+=`<span><i style="--c:${c}"></i>${t}</span>`)}
  // each day's area fades from its colour at the line to nothing at the bottom
  s+='<defs>'+DAYS.map(d=>`<linearGradient id="pg${d.n}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${d.color}" stop-opacity=".45"/><stop offset="1" stop-color="${d.color}" stop-opacity=".03"/></linearGradient>`).join('')+'</defs>';
  DAYS.forEach(d=>{const i0=Math.max(a,d.i0),i1=Math.min(b,d.i1);if(i0>=i1)return;
    let q='';for(let i=i0;i<i1;i+=step)q+=(q?'L':'M')+X(R.d[i]).toFixed(1)+','+Y(R.e[i]).toFixed(1);q+='L'+X(R.d[i1]).toFixed(1)+','+Y(R.e[i1]).toFixed(1);
    s+=`<path d="${q}L${X(R.d[i1]).toFixed(1)},${Y(lo)}L${X(R.d[i0]).toFixed(1)},${Y(lo)}Z" fill="url(#pg${d.n})" style="cursor:${S.day?'crosshair':'pointer'}"/><path d="${q}" fill="none" stroke="${d.color}" stroke-width="2.4" stroke-linejoin="round" pointer-events="none"/>`;
    if(!S.day&&DAYS.length>1)s+=`<text class="dl" x="${(X(R.d[d.i0])+X(R.d[d.i1]))/2}" y="${m.t-8}" text-anchor="middle">${narrow?'D':'Day '}${d.n}</text>`});
  const rel=S.day?x0:0,kspan=x1-x0,kt=kspan>80?(narrow?40:20):kspan>40?(narrow?20:10):kspan>12?(narrow?5:2):kspan>4?1:.5;
  for(let v=Math.ceil((x0-rel)/kt)*kt;v<=x1-rel+1e-9;v+=kt)s+=`<text class="ax" x="${X(v+rel)}" y="${H-7}" text-anchor="middle">${+v.toFixed(1)}${v===0||narrow?'':' km'}</text>`;
  const used=[];
  PTS.forEach(p=>{if(p.i<a||p.i>b||p.kind==='high')return;const big=OFFICIAL[p.name]||overnight[p.i];if(!S.day&&!big)return;
    const x=X(R.d[p.i]),y=Y(R.e[p.i]);s+=`<circle cx="${x}" cy="${y}" r="3.5" fill="var(--ink)"/>`;
    if(narrow&&!big)return;const t=p.name,w=t.length*7,tx=Math.min(Math.max(x,m.l+w/2),W-m.r-w/2);let ty=y-9;
    while(used.some(u=>Math.abs(u.x-tx)<(u.w+w)/2+6&&Math.abs(u.y-ty)<15))ty-=15;used.push({x:tx,y:ty,w});
    s+=`<text class="pl" x="${tx}" y="${ty}" text-anchor="middle">${esc(t)}</text>`});
  if(on){const y1=H-m.b+8,y2=y1+12,seen=new Set();
    cs.forEach(q=>{const k=skyClass(q.c,q.i,CLK[q.i]);seen.add(k);s+=`<rect x="${q.x}" y="${y1}" width="3.4" height="8" fill="${SKYC[k][0]}"/><rect x="${q.x}" y="${y2}" width="3.4" height="8" fill="${tcol(q.c.feels)}"/>`});
    s+=`<text class="ax" x="${m.l-6}" y="${y1+8}" text-anchor="end">sky</text><text class="ax" x="${m.l-6}" y="${y2+8}" text-anchor="end">feels</text>`;
    leg+=Object.entries(SKYC).filter(([k])=>seen.has(k)).map(([k,v])=>`<span><i style="--c:${v[0]}"></i>${v[1]}</span>`).join('')+`<span><i class="grad"></i>feels like −10 → 30 °C</span>`}
  s+=`<g id="cur" style="display:none" pointer-events="none"><line id="curl" y1="${m.t}" y2="${H-m.b}"/><circle id="curc" r="5.5"/></g>`;
  prof.innerHTML=s;$('#plegend').innerHTML=leg;updateCursor()}
function updateCursor(){const prof=$('#prof'),g=prof&&prof.querySelector('#cur');if(!g||!PX)return;const i=S.i;
  if(i<PX.a||i>PX.b||i<0){g.style.display='none';return}
  const x=PX.X(R.d[i]),y=PX.Y(R.e[i]);g.style.display='';g.querySelector('#curl').setAttribute('x1',x);g.querySelector('#curl').setAttribute('x2',x);g.querySelector('#curc').setAttribute('cx',x);g.querySelector('#curc').setAttribute('cy',y)}
function setupProfile(sig){const prof=$('#prof');
  const at=e=>{const r=prof.getBoundingClientRect(),x=e.clientX-r.left;const v=PX.x0+(x-PX.m.l)/(PX.W-PX.m.l-PX.m.r)*(PX.x1-PX.x0);return nearestByDist(Math.min(Math.max(v,PX.x0),PX.x1),PX.a,PX.b)};
  prof.addEventListener('pointermove',e=>{if(PX&&!(V3&&(V3.playing()||V3.fp()&&e.pointerType==='mouse'&&!e.buttons)))setIndex(at(e))},sig);
  prof.addEventListener('click',e=>{if(!PX)return;const i=at(e);if(!S.day&&DAYS.length>1)selectDay(R.day[i],true);setIndex(i)},sig)}

/* ---------- 3D ---------- */
function init3D(sig){
  if(!window.THREE||!THREE.OrbitControls||!THREE.Line2)throw Error('3D library did not load');
  const stage=$('#stage'),old=$('#cv'),cv=document.createElement('canvas');cv.id='cv';old.replaceWith(cv);$('#labels').innerHTML='';
  const W=D.w,H=D.h,M=D.mpp,{GC,GR,GS,ht}=TER;
  const renderer=new THREE.WebGLRenderer({canvas:cv,antialias:true,alpha:true});
  renderer.setPixelRatio(Math.min(devicePixelRatio,2));
  const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(40,1,20,600000);
  const group=new THREE.Group();scene.add(group);group.scale.y=S.ex;
  const hemi=new THREE.HemisphereLight(0xffffff,0x5a665e,0.82);scene.add(hemi);
  const sun=new THREE.DirectionalLight(0xffffff,0.45);sun.position.set(-0.7,1,-0.5);scene.add(sun);scene.add(sun.target);
  const wx=px=>(px-W/2)*M,wz=py=>(py-H/2)*M;
  let minH=1e9,maxH=-1e9;for(let k=0;k<ht.length;k++){if(ht[k]<minH)minH=ht[k];if(ht[k]>maxH)maxH=ht[k]}
  let alive=true;
  // the map picture is draped over the terrain; the relief style is drawn by the shader over a plain white picture
  const coarse=matchMedia('(pointer: coarse)').matches,white=new THREE.DataTexture(new Uint8Array([255,255,255,255]),1,1);white.needsUpdate=true;
  // shading detail baked on the GPU from the heights: the slope for the light (red, green) and how much open sky each point sees (blue)
  const ND=coarse?10:14,NS=coarse?12:15;
  const bakeM=new THREE.ShaderMaterial({uniforms:{uH:{value:null},uTx:{value:new THREE.Vector2()},uM:{value:new THREE.Vector2()},uG:{value:1.4},uEx:{value:S.ex}},depthTest:false,depthWrite:false,
    vertexShader:'varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}',
    fragmentShader:`uniform sampler2D uH;uniform vec2 uTx,uM;uniform float uG,uEx;varying vec2 vUv;
float H(vec2 p){vec4 c=texture2D(uH,p);return(c.r*65280.+c.g*255.)*.2;}
float enc(float s){return s/(1.+abs(s))*.5+.5;}
void main(){float h0=H(vUv);
float sx=(H(vUv+vec2(uTx.x,0.))-H(vUv-vec2(uTx.x,0.)))/(2.*uM.x),sz=(H(vUv-vec2(0.,uTx.y))-H(vUv+vec2(0.,uTx.y)))/(2.*uM.y);
float occ=0.;for(int d=0;d<${ND};d++){float a=(float(d)+.5)*6.2831853/${ND}.;vec2 dr=vec2(cos(a),sin(a));float mx=0.,r=1.;
for(int k=0;k<${NS};k++){vec2 o=dr*r;mx=max(mx,(H(vUv+o*uTx)-h0)*uEx/length(o*uM));r*=uG;}occ+=mx/sqrt(1.+mx*mx);}
gl_FragColor=vec4(enc(sx),enc(sz),1.-occ/${ND}.,1.);}`});
  const bakeS=new THREE.Scene(),bakeC=new THREE.Camera(),bq=new THREE.Mesh(new THREE.PlaneGeometry(2,2),bakeM);bq.frustumCulled=false;bakeS.add(bq);
  let bakeRT=null,bakeHT=null;
  const doBake=()=>{const rt=bakeRT,prev=renderer.getRenderTarget(),st=256;bakeM.uniforms.uEx.value=S.ex;
    for(let y=0;y<rt.height;y+=st){rt.scissor.set(0,y,rt.width,Math.min(st,rt.height-y));rt.scissorTest=true;renderer.setRenderTarget(rt);renderer.render(bakeS,bakeC)}
    rt.scissorTest=false;renderer.setRenderTarget(prev)};
  // src: heights in 0.2 m steps, rows from north to south, and the metres per texel
  const runBake=src=>{const{w,h,q}=src,px=new Uint8Array(w*h*4);
    for(let y=0;y<h;y++){const o=(h-1-y)*w;for(let x=0;x<w;x++){const v=q[o+x],k=(y*w+x)*4;px[k]=v>>8;px[k+1]=v&255;px[k+3]=255}}
    if(bakeHT)bakeHT.dispose();bakeHT=new THREE.DataTexture(px,w,h);bakeHT.magFilter=bakeHT.minFilter=THREE.NearestFilter;bakeHT.needsUpdate=true;
    if(!bakeRT||bakeRT.width!==w||bakeRT.height!==h){if(bakeRT)bakeRT.dispose();bakeRT=new THREE.WebGLRenderTarget(w,h,{minFilter:THREE.LinearMipmapLinearFilter,magFilter:THREE.LinearFilter,depthBuffer:false,stencilBuffer:false});
      bakeRT.texture.generateMipmaps=true;bakeRT.texture.anisotropy=Math.min(4,renderer.capabilities.getMaxAnisotropy())}
    const u=bakeM.uniforms;u.uH.value=bakeHT;u.uTx.value.set(1/w,1/h);u.uM.value.set(src.mx,src.mz);u.uG.value=Math.pow(Math.max(4,2600/Math.min(src.mx,src.mz)),1/(NS-1));
    doBake();return bakeRT.texture};
  const gridSrc=()=>{const w=Math.max(2,Math.round(W/GS)),h=Math.max(2,Math.round(H/GS)),a=new Float32Array(w*h),q=new Uint16Array(w*h);let lo=1e9;
    for(let y=0;y<h;y++)for(let x=0;x<w;x++){const v=TER.at((x+.5)*W/w,(y+.5)*H/h);a[y*w+x]=v;if(v<lo)lo=v}
    for(let k=0;k<w*h;k++)q[k]=Math.max(0,Math.min(65535,Math.round((a[k]-lo)*5)));return{w,h,q,mx:W*M/w,mz:H*M/h}};
  const det0=runBake(gridSrc());
  // the detailed heights saved with the hike replace the coarse grid as soon as they are read
  const useDEM=()=>{const i=D.dem;if(!BLOBS.dem||!i)return;BLOBS.dem.arrayBuffer().then(buf=>{if(!alive||buf.byteLength!==i.w*i.h*2)return;const q=new Uint16Array(buf);WXV.U.uDet.value=runBake({w:i.w,h:i.h,q,mx:W*M/i.w,mz:H*M/i.h});HS={w:i.w,h:i.h,q,min:i.min};HGT=hgt;SAFEK='';renderSafety();if(S.color==='safe')recolor();TILES.heights();maybeCover()}).catch(e=>console.warn('heights',e))};
  const tex={},loadTex=name=>tex[name]||(tex[name]=(BLOBS[name]?Promise.resolve(BLOBS[name]):Promise.reject(Error('no '+name))).then(b=>new Promise((ok,no)=>{const im=new Image(),url=URL.createObjectURL(b);im.onload=()=>{URL.revokeObjectURL(url);ok(im)};im.onerror=e=>{URL.revokeObjectURL(url);no(e)};im.src=url})).then(im=>{const t=new THREE.Texture(im);t.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());t.needsUpdate=true;return t}));
  let mapPicked=false;
  const dropTex=keep=>{for(const k of Object.keys(tex))if(k!==keep){tex[k].then(t=>t.dispose()).catch(()=>{});delete tex[k]}};
  let GTEX=null,HS=null;
  const credit=()=>{$('#attrib').hidden=S.map!=='sat';$('#attrib-ch').hidden=!(S.map==='sat'&&TILES.swiss());$('#attrib-esri').hidden=!(S.map==='sat'&&TILES.esri());
    const tp=$('#attrib-topo'),tk=S.map==='topo'?TILES.topo()||(D.topoSrc==='swisstopo'?'swiss':'otm'):'';tp.hidden=!tk;if(tk)tp.textContent=tk.split(',').map(k=>HP.maps.CREDIT[k]).join(' · ')};
  const applyMap=()=>{const m=S.map;WXV.U.uStyle.value=m==='sat'?0:m==='topo'?1:2;
    if(m==='relief'){GTEX=null;dropTex(null);TILES.restyle();credit();return}
    TILES.restyle();credit();
    loadTex(m).then(t=>{if(!alive||S.map!==m)return;GTEX=t;dropTex(m);TILES.restyle();maybeCover()}).catch(()=>{if(alive&&S.map===m){S.map=BLOBS.topo&&m!=='topo'?'topo':'relief';syncTools();applyMap()}})};
  const rp=new Float32Array(N*3);for(let i=0;i<N;i++){rp[i*3]=wx(R.x[i]);rp[i*3+1]=Math.max(R.e[i],TER.at(R.x[i],R.y[i]))+14;rp[i*3+2]=wz(R.y[i])}
  const lg=new THREE.LineGeometry();lg.setPositions(rp);
  const lineMat=new THREE.LineMaterial({vertexColors:true,linewidth:4.5,transparent:true}),caseMat=new THREE.LineMaterial({color:0xffffff,linewidth:8,transparent:true,depthWrite:false}),ghostMat=new THREE.LineMaterial({vertexColors:true,linewidth:2.5,transparent:true,opacity:.4,depthTest:false});
  const LM=[lineMat,caseMat,ghostMat];
  const edgeMat=new THREE.LineMaterial({color:0x26362e,linewidth:9.6,transparent:true,depthWrite:false});LM.push(edgeMat);
  // the route sits a little in front of the ground it lies on, so slopes beside the path never cut through its edges (1.5% of the distance)
  [edgeMat,caseMat,lineMat].forEach(m=>{m.onBeforeCompile=sh=>{sh.vertexShader=sh.vertexShader.replace('vec4 end = modelViewMatrix * vec4( instanceEnd, 1.0 );','vec4 end = modelViewMatrix * vec4( instanceEnd, 1.0 );start.xyz*=.985;end.xyz*=.985;')};m.customProgramCacheKey=()=>'pull'});
  const lines=[new THREE.Line2(lg,edgeMat),new THREE.Line2(lg,caseMat),new THREE.Line2(lg,lineMat),new THREE.Line2(lg,ghostMat)];lines.forEach((l,k)=>{l.renderOrder=20+k;group.add(l)});
  const colorBtns=()=>{const modes=['day',...(D.sacKnown?['sac']:[]),'steep','safe'];if(!modes.includes(S.color))S.color='day';
    $('#colorseg').innerHTML='<span>Line</span>'+modes.map(m=>`<button data-color="${m}">${m==='day'?'Days':m==='sac'?'Grade':m==='safe'?'Safety':'Steepness'}</button>`).join('')};colorBtns();
  const mapBtns=()=>{$('#mapseg').innerHTML='<span>Map</span>'+(BLOBS.sat?'<button data-map="sat">Satellite</button>':'')+(BLOBS.topo?'<button data-map="topo">Topo</button>':'')+'<button data-map="relief">Relief</button>'};mapBtns();
  const recolor=()=>{const c=new Float32Array(N*3),cl=new THREE.Color(),gray=new THREE.Color(0xa7aea9);
    const SL=S.color==='safe'?safety().lv:null,SLC=['#37b24d','#f2b705','#e03131'];
    for(let i=0;i<N;i++){cl.set(S.color==='day'?DAYS[R.day[i]-1].color:S.color==='sac'?SACC[R.sac[i]]:SL?SLC[SL[i]]:STC[STEEP[i]]);if(S.day&&R.day[i]!==S.day)cl.lerp(gray,.78);c[i*3]=cl.r;c[i*3+1]=cl.g;c[i*3+2]=cl.b}
    lg.setColors(c);
    $('#legend').innerHTML=S.color==='day'?(DAYS.length>1?DAYS.map(d=>`<span><i style="--c:${d.color}"></i>Day ${d.n}</span>`).join(''):''):S.color==='sac'?[1,2,3,4,0].map(k=>{const t=SACN[k].split(' (')[0].split(',')[0];return`<span><i style="--c:${SACC[k]}"></i><span>${k?`${t.slice(0,2)}<em>${t.slice(2)}</em>`:t}</span></span>`}).join(''):S.color==='safe'?[['#37b24d','Fine'],['#f2b705','Take care'],['#e03131','Hard or exposed']].map(([c,t])=>`<span><i style="--c:${c}"></i><span>${t}</span></span>`).join(''):[1,2,3,4,5].map(k=>{const[a,b]=STN[k].split(', ');return`<span><i style="--c:${STC[k]}"></i><span><em>${a}, </em>${b}</span></span>`}).join('');$('#legend').hidden=!$('#legend').innerHTML;$('#legend').dataset.mode=S.color};
  const marker=new THREE.Mesh(new THREE.SphereGeometry(1,24,16),new THREE.MeshBasicMaterial({color:new THREE.Color(HP.look?HP.look.pal().acc:'#d6262e'),depthTest:false,transparent:true,fog:false}));
  const halo=new THREE.Mesh(new THREE.SphereGeometry(1.5,24,16),new THREE.MeshBasicMaterial({color:0xffffff,depthTest:false,transparent:true,fog:false}));
  halo.renderOrder=40;marker.renderOrder=41;scene.add(halo,marker);marker.visible=halo.visible=false;
  const P=i=>new THREE.Vector3(rp[i*3],rp[i*3+1]*S.ex,rp[i*3+2]);
  const rank=p=>p.lm?3:p.kind==='start'||p.kind==='end'||overnight[p.i]?0:OFFICIAL[p.name]?1:2;
  let labels=[];
  const makeLabels=()=>{$('#labels').innerHTML='';const pts=[{name:DAYS[0].from,kind:'start',i:0},...PTS.filter(p=>p.kind!=='high'&&p.i>2&&p.i<N-3),...(PTS.some(p=>p.kind==='high')?[PTS.find(p=>p.kind==='high')]:[]),{name:DAYS[DAYS.length-1].to,kind:'end',i:N-1}];
    DAYS.slice(0,-1).forEach(d=>{for(let k=pts.length-1;k>=0;k--)if(pts[k].i===d.i1)pts.splice(k,1);pts.push({name:d.to,kind:'night',i:d.i1})});
    labels=pts.map(p=>{const el=document.createElement('div');el.className='lbl';el.textContent=p.kind==='high'?`High point ${nf.format(Math.round(R.e[p.i]))} m`:ptLabel(p);if(rank(p)===0)el.style.setProperty('--c',DAYS[R.day[p.i]-1].color);$('#labels').appendChild(el);return{p,el,w:0,h:0}})
      .concat((D.landmarks||[]).map(m=>{const el=document.createElement('div');el.className='lbl lm';el.textContent=m.name;$('#labels').appendChild(el);return{p:{lm:true,name:m.name},v:new THREE.Vector3(wx(m.x),m.e+40,wz(m.y)),el,w:0,h:0}})).sort((x,y)=>rank(x.p)-rank(y.p))};
  makeLabels();
  const showLbl=p=>p.lm?true:S.day?(R.day[p.i]===S.day||p.i===DAYS[S.day-1].i0-1):(p.kind==='start'||p.kind==='end'||overnight[p.i]||OFFICIAL[p.name]||p.kind==='high');
  const controls=new THREE.OrbitControls(camera,cv);
  Object.assign(controls,{enableDamping:true,dampingFactor:.08,screenSpacePanning:false,maxPolarAngle:1.45,minDistance:220,maxDistance:250000,touches:{ONE:-1,TWO:-1}});
  const LMV=(D.landmarks||[]).slice(0,4).map(m=>({x:wx(m.x),z:wz(m.y),y:m.e}));
  // overview direction: from the side of the route's main axis, looking roughly north
  let mx=0,mz=0;for(let i=0;i<N;i+=4){mx+=rp[i*3];mz+=rp[i*3+2]}const cnt=Math.ceil(N/4);mx/=cnt;mz/=cnt;let sxx=0,szz=0,sxz=0;for(let i=0;i<N;i+=4){const dx=rp[i*3]-mx,dz=rp[i*3+2]-mz;sxx+=dx*dx;szz+=dz*dz;sxz+=dx*dz}
  const ang=.5*Math.atan2(2*sxz,sxx-szz);let pvx=-Math.sin(ang),pvz=Math.cos(ang);if(pvz<0){pvx=-pvx;pvz=-pvz}const VIEW=[pvx,.75,pvz],SPAN=Math.sqrt((sxx+szz)/cnt)*3;
  const frame=(i0,i1,extra=[],cov=0)=>{
    // wide screens look across the route; tall phone screens look along it, from behind the start, so it runs up the screen
    const port=camera.aspect<1;let gx,gz,up;
    if(port){let ax=rp[i1*3]-rp[i0*3],az=rp[i1*3+2]-rp[i0*3+2];const L=Math.hypot(ax,az);
      if(L<SPAN*.35){ax=Math.cos(ang);az=Math.sin(ang);if(az<0){ax=-ax;az=-az}gx=ax;gz=az}else{gx=-ax/L;gz=-az/L}up=cov||1.07/.62}
    else{let vw=VIEW;if(i0!==0||i1!==N-1){let px=-(rp[i1*3+2]-rp[i0*3+2]),pz=rp[i1*3]-rp[i0*3];if(pz<0){px=-px;pz=-pz}const L=Math.hypot(px,pz)||1;vw=[px/L,.65,pz/L]}const hz=Math.hypot(vw[0],vw[2])||1;gx=vw[0]/hz;gz=vw[2]/hz;up=cov||vw[1]/hz}
    const ux=gz,uz=-gx;let u0=1e9,u1=-1e9,w0=1e9,w1=-1e9,y0=1e9,y1=-1e9,ys=0,cnt=0;
    const add=(x,z)=>{const u=x*ux+z*uz,w=x*gx+z*gz;u0=Math.min(u0,u);u1=Math.max(u1,u);w0=Math.min(w0,w);w1=Math.max(w1,w)};
    for(let i=i0;i<=i1;i+=2){add(rp[i*3],rp[i*3+2]);const y=rp[i*3+1];ys+=y;cnt++;y0=Math.min(y0,y);y1=Math.max(y1,y)}
    extra.forEach(q=>add(q.x,q.z));
    const cu=(u0+u1)/2,cw=(w0+w1)/2,target=new THREE.Vector3(cu*ux+cw*gx,ys/cnt*.85*S.ex,cu*uz+cw*gz);
    const dir=new THREE.Vector3(gx,up,gz).normalize(),el=Math.asin(dir.y),tv=Math.tan(THREE.MathUtils.degToRad(camera.fov/2)),th=tv*camera.aspect;
    const wide=Math.max(u1-u0,2000)*(port?1.3:1.14),deep=Math.max(w1-w0,1200)*Math.sin(el)+(y1-y0)*S.ex*Math.cos(el);
    const dist=Math.max(wide/2/th,deep*1.15/2/tv)+1500;
    return{target,pos:target.clone().add(dir.multiplyScalar(dist))}};
  let fly=null,FP=null,lastLoop=0;
  const flyTo=f=>{if(reduce){camera.position.copy(f.pos);controls.target.copy(f.target);return}fly={t0:performance.now(),p0:camera.position.clone(),q0:controls.target.clone(),f}};
  const frameDay=()=>S.day?frame(DAYS[S.day-1].i0,DAYS[S.day-1].i1):frame(0,N-1);
  let touched=false,framedPort=null;
  const resize=()=>{const w=stage.clientWidth,h=stage.clientHeight;if(!w||!h)return;renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();LM.forEach(m=>m.resolution.set(w,h));
    if(framedPort!==null&&(w<h)!==framedPort&&!fly&&!FP){framedPort=w<h;const f=frameDay();if(touched)flyTo(f);else{camera.position.copy(f.pos);controls.target.copy(f.target)}}};
  resize();const ro=new ResizeObserver(resize);ro.observe(stage);ROs.push(ro);
  const f0=frameDay();camera.position.copy(f0.pos);controls.target.copy(f0.target);controls.update();framedPort=camera.aspect<1;
  const WXV=initWX3D({fogD:()=>FP?6500:camera.position.distanceTo(controls.target),scene,renderer,camera,controls,sun,hemi,W,H,M,minH,maxH,LM,stage,det:det0,view:f0.pos.clone().sub(f0.target)});resize();
  // ---------- the ground: a quadtree of map tiles that get finer and sharper where the camera is close, like a web map ----------
  // Far away the model shows the satellite picture saved with the hike. Close up, each tile loads its own picture (Swiss aerial
  // pictures inside Switzerland, ArcGIS elsewhere); for Topo every tile loads its own map while there is a connection.
  // Its ground follows the detailed heights.
  const hgt=(px,py)=>{if(!HS)return TER.at(px,py);const w=HS.w,X=Math.min(Math.max(px/W*w-.5,0),w-1.001),Y=Math.min(Math.max(py/H*HS.h-.5,0),HS.h-1.001),c=X|0,r=Y|0,fx=X-c,fy=Y-r,k=r*w+c,q=HS.q;
    return HS.min+.2*(q[k]*(1-fx)*(1-fy)+q[k+1]*fx*(1-fy)+q[k+w]*(1-fx)*fy+q[k+w+1]*fx*fy)};
  const TILES=(()=>{
    const TS=256,span=z=>TS*2**(14-z),NMAX=coarse?48:64,tg=new THREE.Group();group.add(tg);
    const dpx=()=>HS?W/HS.w:GS,NSEG=z=>Math.max(16,Math.min(NMAX,Math.round(span(z)/dpx())));
    const ZB=Math.max(8,Math.min(15,Math.floor(14-Math.log2(Math.max(W,H)/1024))));
    const ZG=()=>Math.max(ZB,Math.ceil(14-Math.log2(NMAX*dpx()/TS)));
    const SWISS=(z,x,y)=>`https://wmts.geo.admin.ch/1.0.0/ch.swisstopo.swissimage/default/current/3857/${z}/${x}/${y}.jpeg`;
    const ESRI=(z,x,y)=>`${ESRI_URL}/tile/${z}/${y}/${x}?token=${ESRI_KEY}`,PS={k:'PS',zmax:18,url:SWISS,swiss:true},PE={k:'PE',zmax:18,url:ESRI,esri:true};
    // the topographic map (since 2.2): the Swiss national map for tiles wholly in Switzerland (each from its four tiles one zoom closer,
    // which is the detail its own site shows), Esri's Outdoor map elsewhere (512-pixel tiles), OpenTopoMap if Esri can't answer.
    // With a connection they are used at every distance, so near and far look the same; without one, the picture saved with the hike shows.
    // 512-pixel pictures (big) let a tile grow half as large again on screen before it splits: as sharp as the satellite pictures, with fewer tiles
    // A Swiss tile that fails is tried once more, then shows its larger tile's Swiss picture rather than another map's style.
    const PT={k:'PT',zmax:17,url:HP.maps.swiss,sub:true,big:true,live:true,cr:'swiss',tries:2},PEO={k:'PEO',zmax:18,url:HP.maps.outdoor,big:true,esri:true,live:true,cr:'outdoor',tries:2},PO={k:'PO',zmax:17,url:HP.maps.otm,live:true,cr:'otm'};
    const inCH=t=>t.lat>45.78&&t.lat<47.86&&t.lon>5.92&&t.lon<10.53;
    // the pictures to try for a tile, best first; t.pf counts each one's failures (a 404 just means no picture at that zoom)
    const prov=t=>{const L=S.map==='topo'?(t.ch?[PT]:[PEO,PO]):S.map==='sat'?(inCH(t)?[PS,PE]:[PE]):[];
      for(const p of L)if(!(p.esri&&HP.maps.esriOff)&&(t.pf&&t.pf[p.k]||0)<(p.tries||1))return p;return null};
    let gEff=99; // the zoom the saved picture already matches: tiles only fetch pictures sharper than that (unless the map is live)
    const own=t=>{const p=prov(t);return p&&t.z<=p.zmax&&(t.z>gEff+.3||p.live&&navigator.onLine)?p:null};
    const all=new Map(),idxC=new Map(),build=[],loads=[];let active=0,sel=0,drawnKey='',lastSel=-1e9,dirty=true,shadowAt=0,shadowDue=false,swissOn=false,esriOn=false,topoOn='',coverPass=false,drawn=[];
    const mk=(z,x,y)=>{const k=z+'/'+x+'/'+y;let t=all.get(k);if(t)return t;const s=span(z),ax=x*s-D.x0,ay=y*s-D.y0;
      t={k,z,x,y,s,ax,ay,r:{x0:Math.max(0,ax),y0:Math.max(0,ay),x1:Math.min(W,ax+s),y1:Math.min(H,ay+s)},mesh:null,mr:{value:new THREE.Vector4(0,0,1,1)},tex:null,ts:0,src:'',split:false,used:0,
        lat:HP.geo.lat(D.y0+ay+s/2,14),lon:HP.geo.lon(D.x0+ax+s/2,14),h0:minH,h1:maxH,stale:false,queued:false,swiss:false,esri:false,ek:false,cr:'',pf:null};
      // Swiss when the part of the tile that is drawn lies wholly in Switzerland (the Swiss map is blank further out)
      const r=t.r;t.ch=HP.maps.boxCH(HP.geo.lat(D.y0+r.y1,14),HP.geo.lon(D.x0+r.x0,14),HP.geo.lat(D.y0+r.y0,14),HP.geo.lon(D.x0+r.x1,14));all.set(k,t);return t};
    const kids=t=>{const out=[];for(let j=0;j<2;j++)for(let i=0;i<2;i++){const c=mk(t.z+1,t.x*2+i,t.y*2+j);if(!c.mesh){c.h0=t.h0;c.h1=t.h1}if(c.r.x1>c.r.x0&&c.r.y1>c.r.y0)out.push(c)}return out};
    const s0=span(ZB),roots=[];for(let y=Math.floor(D.y0/s0);y<=Math.floor((D.y0+H-1)/s0);y++)for(let x=Math.floor(D.x0/s0);x<=Math.floor((D.x0+W-1)/s0);x++)roots.push(mk(ZB,x,y));
    // triangles of an n×n patch plus a skirt hanging down from its border, which hides the cracks between patches of different detail
    const index=n=>{let ix=idxC.get(n);if(ix)return ix;const n1=n+1,S0=n1*n1,ring=[];
      for(let i=0;i<n;i++)ring.push(i);for(let j=0;j<n;j++)ring.push(j*n1+n);for(let i=n;i>0;i--)ring.push(n*n1+i);for(let j=n;j>0;j--)ring.push(j*n1);
      const a=new Uint16Array(6*n*n+24*n);let m=0;
      for(let r=0;r<n;r++)for(let c=0;c<n;c++){const p=r*n1+c,b=p+1,d=p+n1,e=d+1;a[m++]=p;a[m++]=d;a[m++]=b;a[m++]=b;a[m++]=d;a[m++]=e}
      for(let k=0;k<4*n;k++){const p=ring[k],b=ring[(k+1)%(4*n)],p2=S0+k,b2=S0+(k+1)%(4*n);a[m++]=p;a[m++]=p2;a[m++]=b;a[m++]=b;a[m++]=p2;a[m++]=b2}
      ix={a,ring};idxC.set(n,ix);return ix};
    const geoOf=t=>{const n=NSEG(t.z),n1=n+1,{x0,y0,x1,y1}=t.r,nv=n1*n1+4*n,P=new Float32Array(nv*3),N=new Float32Array(nv*3),UV=new Float32Array(nv*2),SK=new Float32Array(nv),h=new Float32Array(n1*n1);let lo=1e9,hi=-1e9;
      for(let j=0;j<n1;j++){const py=y0+(y1-y0)*j/n;for(let i=0;i<n1;i++){const px=x0+(x1-x0)*i/n,v=hgt(px,py),k=j*n1+i;h[k]=v;if(v<lo)lo=v;if(v>hi)hi=v;P[k*3]=wx(px);P[k*3+1]=v;P[k*3+2]=wz(py);UV[k*2]=i/n;UV[k*2+1]=1-j/n}}
      const dx=Math.max(.001,(x1-x0)*M/n),dz=Math.max(.001,(y1-y0)*M/n);
      for(let j=0;j<n1;j++)for(let i=0;i<n1;i++){const k=j*n1+i,gx=(h[j*n1+Math.min(n,i+1)]-h[j*n1+Math.max(0,i-1)])/(dx*(i>0&&i<n?2:1)),gz=(h[Math.min(n,j+1)*n1+i]-h[Math.max(0,j-1)*n1+i])/(dz*(j>0&&j<n?2:1)),l=Math.hypot(gx,1,gz);N[k*3]=-gx/l;N[k*3+1]=1/l;N[k*3+2]=-gz/l}
      const ix=index(n),drop=Math.max(15,dx*1.5),S0=n1*n1;
      ix.ring.forEach((g,k)=>{const o=(S0+k)*3;P[o]=P[g*3];P[o+1]=P[g*3+1]-drop;P[o+2]=P[g*3+2];N[o]=N[g*3];N[o+1]=N[g*3+1];N[o+2]=N[g*3+2];UV[(S0+k)*2]=UV[g*2];UV[(S0+k)*2+1]=UV[g*2+1];SK[S0+k]=drop});
      const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(P,3));g.setAttribute('normal',new THREE.BufferAttribute(N,3));g.setAttribute('uv',new THREE.BufferAttribute(UV,2));g.setAttribute('sk',new THREE.BufferAttribute(SK,1));g.setIndex(new THREE.BufferAttribute(ix.a,1));g.computeBoundingSphere();
      t.h0=lo;t.h1=hi;return g};
    const make=t=>{const g=geoOf(t);if(t.mesh){t.mesh.geometry.dispose();t.mesh.geometry=g}
      else{const m=WXV.prep(new THREE.MeshLambertMaterial({color:0xffffff,map:white,side:THREE.DoubleSide}),{uMapRect:t.mr});m.fog=false;m.extensions={derivatives:true};
        t.mesh=new THREE.Mesh(g,m);t.mesh.castShadow=t.mesh.receiveShadow=true;t.mesh.visible=false;t.src='';tg.add(t.mesh)}t.stale=false;dirty=true};
    const fr=new THREE.Frustum(),pm=new THREE.Matrix4(),inv=new THREE.Matrix4(),bx=new THREE.Box3(),cc=new THREE.Vector3(),lastM=new THREE.Matrix4();let Kpx=1000,lastH=0;
    const SPLIT=coarse?440:400,MERGE=coarse?330:300,GSPL=coarse?8:7,GMRG=coarse?5.5:5;
    let backAt=-1;addEventListener('online',()=>{backAt=performance.now();dirty=true},sig);
    const want=t=>{t.vis=true;if(t.z>=18)return t.split=false;const geo=t.z<ZG(),pc=own({z:t.z+1,lat:t.lat,lon:t.lon,ch:t.ch}),img=!!pc,kk=pc&&pc.big?1.5:1;if(!geo&&!img)return t.split=false;
      bx.min.set(wx(t.r.x0),t.h0*S.ex,wz(t.r.y0));bx.max.set(wx(t.r.x1),t.h1*S.ex,wz(t.r.y1));t.vis=fr.intersectsBox(bx);if(!t.vis)return t.split=false;
      bx.getCenter(cc);const rad=bx.min.distanceTo(bx.max)/2,d=Math.max(camera.position.distanceTo(cc)-rad,rad*.25,1),edge=(t.r.x1-t.r.x0)*M/d*Kpx;
      return t.split=(geo&&edge/NSEG(t.z)>(t.split?GMRG:GSPL))||(img&&edge>(t.split?MERGE:SPLIT)*kk)};
    const visit=(t,out)=>{t.used=sel;if(want(t)){const ks=kids(t);ks.forEach(k=>{k.used=sel;if((!k.mesh||k.stale)&&!k.queued){k.queued=true;build.push(k)}});
        if(ks.length&&ks.every(k=>k.mesh)){ks.forEach(k=>visit(k,out));return}}
      if(t.stale&&!t.queued){t.queued=true;build.push(t)}out.push(t)};
    // the sharpest picture available for a tile: its own, else the nearest larger tile's, else the saved picture
    const setSrc=t=>{let a=t,src=null;while(a){if(a.tex&&!(coverPass&&a.ek)){src=a;break}a=a.z>ZB?all.get((a.z-1)+'/'+(a.x>>1)+'/'+(a.y>>1)):null}
      const key=(src?src.k:GTEX?'g':'w')+(coverPass?'c':'');if(key===t.src)return src;t.src=key;const v=t.mr.value,m=t.mesh.material;
      if(src){v.set((t.r.x0-src.ax)/src.s,1-(t.r.y1-src.ay)/src.s,(t.r.x1-t.r.x0)/src.s,(t.r.y1-t.r.y0)/src.s);m.map=src.tex}
      else{v.set(t.r.x0/W,1-t.r.y1/H,(t.r.x1-t.r.x0)/W,(t.r.y1-t.r.y0)/H);m.map=GTEX||white}return src};
    const pump=()=>{while(active<6&&loads.length){let{t,p}=loads.shift();if(t.used<sel-2||!t.mesh||!all.has(t.k)){t.ts=0;continue}
      // ArcGIS switched off while this tile waited: it goes to the next map at once, rather than asking Esri again
      if(p.esri&&HP.maps.esriOff){p=own(t);if(!p){t.ts=0;dirty=true;continue}}
      active++;const style=S.map;
      if(p.esri&&!p.cr&&!esriMeta)esriCredit();
      const one=u=>HP.fetchT(u,{mode:'cors'},15000,'blob').then(x=>{if(p.esri&&x.status!==404&&(!x.ok||!/^image\//.test(x.type))){esriFailed();throw Error('ArcGIS '+x.status)}if(!x.ok)throw Error('HTTP '+x.status);if(p.esri)HP.maps.esriOk();return x.body})
        .then(b=>new Promise((ok,no)=>{const im=new Image(),u=URL.createObjectURL(b);im.onload=()=>{URL.revokeObjectURL(u);ok(im)};im.onerror=()=>{URL.revokeObjectURL(u);no(Error('picture'))};im.src=u}));
      (p.sub?Promise.all([0,1,2,3].map(k=>one(p.url(t.z+1,t.x*2+(k&1),t.y*2+(k>>1))))).then(ims=>{const c=document.createElement('canvas');c.width=c.height=512;const g=c.getContext('2d');ims.forEach((im,k)=>g.drawImage(im,(k&1)*256,(k>>1)*256,256,256));return c}):one(p.url(t.z,t.x,t.y)))
        .then(im=>{if(!alive||S.map!==style||!all.has(t.k)){t.ts=0;return}const tx=new THREE.Texture(im);tx.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());tx.needsUpdate=true;t.tex=tx;t.ts=2;t.swiss=!!p.swiss;t.esri=!!p.esri&&!p.cr;t.ek=!!p.esri;t.cr=p.cr||'';dirty=true})
        .catch(e=>{if(!alive||S.map!==style){t.ts=0;return}const pf=t.pf||(t.pf={});pf[p.k]=(pf[p.k]||0)+1;t.pfAt=performance.now();if(/HTTP 404/.test(e&&e.message))t.gone=true;
          // the next map to try at once; the same map once more after a short pause, so a moment without signal doesn't use up its tries
          const np=own(t);if(np===p){t.ts=4;setTimeout(()=>{if(t.ts===4){t.ts=0;dirty=true}},2500)}else t.ts=np?0:3;dirty=true}).finally(()=>{active--;pump()})}};
    const drop=t=>{if(t.mesh){tg.remove(t.mesh);t.mesh.geometry.dispose();t.mesh.material.dispose();t.mesh=null}if(t.tex){t.tex.dispose();t.tex=null}all.delete(t.k)};
    const wt=t=>t.tex.image&&t.tex.image.width>256?2:1; // 512-pixel pictures (the topographic maps) count twice
    const evict=()=>{const cap=coarse?240:440;let nt=0;for(const t of all.values())if(t.tex)nt+=wt(t);
      if(all.size<=cap&&nt<=(coarse?56:120))return;const old=[...all.values()].filter(t=>t.used<sel&&t.z>ZB).sort((a,b)=>a.used-b.used);
      for(const t of old){if(all.size<=cap*.8&&nt<=(coarse?44:96))break;if(t.tex)nt-=wt(t);drop(t)}
      // still too many pictures: let tiles that are off screen fall back to their larger tile's picture
      if(nt>(coarse?56:120))for(const t of drawn)if(t.tex&&t.vis===false&&nt>(coarse?44:96)){nt-=wt(t);t.tex.dispose();t.tex=null;t.ts=0;t.src=''}};
    function update(now){
      if(build.length){const t0=performance.now();while(build.length&&performance.now()-t0<(coarse?6:9)){const t=build.shift();t.queued=false;if(all.has(t.k)&&t.used>=sel-2)make(t)}}
      if(shadowDue&&now-shadowAt>350){renderer.shadowMap.needsUpdate=true;shadowAt=now;shadowDue=false}
      const moved=!lastM.equals(camera.matrixWorld)||renderer.domElement.height!==lastH;
      if(!moved&&!dirty&&now-lastSel<600)return;
      lastM.copy(camera.matrixWorld);lastH=renderer.domElement.height;dirty=false;lastSel=now;sel++;
      inv.copy(camera.matrixWorld).invert();pm.multiplyMatrices(camera.projectionMatrix,inv);fr.setFromProjectionMatrix(pm);
      Kpx=renderer.domElement.height/(2*Math.tan(THREE.MathUtils.degToRad(camera.fov/2)));
      gEff=GTEX&&GTEX.image&&GTEX.image.width?14+Math.log2(GTEX.image.width/W):99;
      const out=[];roots.forEach(r=>visit(r,out));drawn=out;
      const key=out.map(t=>t.k).join(',');
      if(key!==drawnKey){drawnKey=key;const on=new Set(out);for(const t of all.values())if(t.mesh)t.mesh.visible=on.has(t);shadowDue=true}
      let sw=false,es=false;const tc=new Set();for(const t of out){if(t.ts===3&&!t.gone&&(now-t.pfAt>30000||backAt>t.pfAt)){t.ts=0;t.pf=null}const src=setSrc(t);if(src&&t.vis!==false){if(src.swiss)sw=true;if(src.esri)es=true;if(src.cr)tc.add(src.cr)}else if(t.vis!==false)tc.add(D.topoSrc==='swisstopo'?'swiss':'otm');const p=!coverPass&&t.vis!==false&&own(t);if(p&&!t.ts){t.ts=1;loads.push({t,p})}}
      const tk=[...tc].sort().join(',');if(sw!==swissOn||es!==esriOn||tk!==topoOn){swissOn=sw;esriOn=es;topoOn=tk;credit()}
      pump();evict()}
    roots.forEach(make);
    return{update,swiss:()=>swissOn,esri:()=>esriOn,topo:()=>topoOn,cover(on){coverPass=on;dirty=true},
      restyle(){for(const t of all.values()){if(t.tex){t.tex.dispose();t.tex=null}t.ts=0;t.src='';t.swiss=t.esri=t.ek=t.gone=false;t.cr='';t.pf=null}loads.length=0;swissOn=esriOn=false;topoOn='';dirty=true},
      refresh(){for(const t of all.values())t.src='';dirty=true},
      heights(){for(const t of all.values())if(t.mesh)t.stale=true;roots.forEach(t=>{t.queued=true;build.push(t)});dirty=true},
      stats:()=>({ts:drawn.filter(t=>t.vis!==false).reduce((o,t)=>(o[t.ts]=(o[t.ts]||0)+1,o),{}),esri:esriOn,esriOff:HP.maps.esriOff,esriTiles:drawn.filter(t=>t.vis!==false&&t.tex&&t.esri).length,dpx:+dpx().toFixed(2),onScreen:drawn.filter(t=>t.vis!==false).length,zs:drawn.filter(t=>t.vis!==false).reduce((o,t)=>(o[t.z]=(o[t.z]||0)+1,o),{}),drawn:drawn.length,maxZ:Math.max(0,...drawn.map(t=>t.z)),own:drawn.filter(t=>t.tex).length,swiss:swissOn,tiles:all.size,ZB,ZG:ZG()}),
      dispose(){for(const t of [...all.values()])drop(t);group.remove(tg)}}})();
  const v=new THREE.Vector3();let down=null,playing=null,raf=0;
  const pick=(e,tol)=>{const r=cv.getBoundingClientRect(),mx=e.clientX-r.left,my=e.clientY-r.top,[a,b]=S.day?[DAYS[S.day-1].i0,DAYS[S.day-1].i1]:[0,N-1];let best=-1,bd=tol*tol;
    for(let i=a;i<=b;i++){v.set(rp[i*3],rp[i*3+1]*S.ex,rp[i*3+2]).project(camera);if(v.z>1)continue;const dx=(v.x+1)/2*r.width-mx,dy=(1-v.y)/2*r.height-my,dd=dx*dx+dy*dy;if(dd<bd){bd=dd;best=i}}
    if(best>=0)setIndex(best)};
  const hideHint=()=>{$('#hint').style.opacity=0};
  cv.addEventListener('pointermove',e=>{if(e.pointerType==='mouse'&&!playing&&!e.buttons)pick(e,16)});
  cv.addEventListener('pointerdown',e=>{down={x:e.clientX,y:e.clientY};hideHint();touched=true});
  cv.addEventListener('pointerup',e=>{if(down&&!multi&&Math.hypot(e.clientX-down.x,e.clientY-down.y)<6)pick(e,30);down=null});
  // ---------- touch: one finger moves the map, two fingers turn and tilt it, and pinch to zoom ----------
  // The ground under the finger stays under it, as on a paper map, and a flick glides on. A pinch keeps the spot between
  // the fingers in place; moving both fingers sideways turns the view, up and down tilts it, and a twist turns it too.
  const TP=new Map(),rc=new THREE.Raycaster(),nd=new THREE.Vector2(),gpl=new THREE.Plane(new THREE.Vector3(0,1,0),0),tv1=new THREE.Vector3(),tv2=new THREE.Vector3(),sph=new THREE.Spherical();
  let tg=null,glide=null,multi=false;const TWIST=1;
  const rayAt=(x,y)=>{const r=cv.getBoundingClientRect();nd.set((x-r.left)/r.width*2-1,1-(y-r.top)/r.height*2);camera.updateMatrixWorld();rc.setFromCamera(nd,camera);return rc.ray};
  // the ground under a point of the screen: walk along the ray until it goes below the ground, then narrow it down
  const groundAt=(x,y,out)=>{const ry=rayAt(x,y),o=ry.origin,d=ry.direction,far=camera.position.distanceTo(controls.target)*4+3000,st=far/120,below=t=>o.y+d.y*t<=gAt(o.x+d.x*t,o.z+d.z*t);
    for(let t=st;t<=far;t+=st)if(below(t)){let a=t-st,b=t;for(let k=0;k<12;k++){const m=(a+b)/2;if(below(m))b=m;else a=m}return out.copy(d).multiplyScalar(b).add(o)}
    gpl.constant=-controls.target.y;return ry.intersectPlane(gpl,out)};
  const levelAt=(x,y,h,out)=>{gpl.constant=-h;return rayAt(x,y).intersectPlane(gpl,out)};
  // move the view sideways, keeping the point it turns around within reach of the model
  const moveBy=(dx,dz)=>{const R4=WXV.U.uRect.value,t=controls.target,nx=Math.min(Math.max(t.x+dx,R4.x-R4.z*.15),R4.x+R4.z*1.15),nz=Math.min(Math.max(t.z+dz,R4.y-R4.w*.15),R4.y+R4.w*1.15);
    dx=nx-t.x;dz=nz-t.z;camera.position.x+=dx;camera.position.z+=dz;t.x=nx;t.z=nz;return Math.hypot(dx,dz)};
  const pair=()=>{const[a,b]=[...TP.values()];return{x:(a.x+b.x)/2,y:(a.y+b.y)/2,d:Math.hypot(a.x-b.x,a.y-b.y),a:Math.atan2(b.y-a.y,b.x-a.x)}};
  let tdirty=false;
  // A gesture starts with one finger or two. Two fingers pinch, turn or twist only once they have clearly begun to,
  // so a pinch doesn't also turn the view and a turn doesn't also zoom.
  const startTouch=()=>{glide=null;tdirty=false;if(TP.size===1){const p=[...TP.values()][0],g=groundAt(p.x,p.y,new THREE.Vector3());tg=g?{k:1,g}:null;p.h=[]}
    else if(TP.size===2){multi=true;const m=pair();tg={k:2,...m,x0:m.x,y0:m.y,d0:m.d,a0:m.a,zoom:false,turn:false,twist:false}}else tg=null};
  const wrapA=a=>a>Math.PI?a-2*Math.PI:a<-Math.PI?a+2*Math.PI:a;
  // the fingers' latest positions are applied once per frame, both fingers together
  const touchStep=now=>{if(!tg||!tdirty)return;tdirty=false;fly=null;
    if(tg.k===1){const p=[...TP.values()][0],q=p&&levelAt(p.x,p.y,tg.g.y,tv1);if(!q)return;let dx=tg.g.x-q.x,dz=tg.g.z-q.z;const lim=camera.position.distanceTo(controls.target)*.5,l=Math.hypot(dx,dz);if(l>lim){dx*=lim/l;dz*=lim/l}
      moveBy(dx,dz)}
    else if(tg.k===2&&TP.size===2){const m=pair(),el=cv.clientHeight||1,dist=camera.position.distanceTo(controls.target);
      if(!tg.zoom&&Math.abs(m.d-tg.d0)>16)tg.zoom=true;if(!tg.turn&&Math.hypot(m.x-tg.x0,m.y-tg.y0)>12)tg.turn=true;if(!tg.twist&&Math.abs(wrapA(m.a-tg.a0))>.1)tg.twist=true;
      if(tg.zoom){const s=Math.min(Math.max(tg.d/Math.max(m.d,1),controls.minDistance/dist),controls.maxDistance/dist);
        if(Math.abs(s-1)>1e-5){let G=groundAt(m.x,m.y,tv2);if(!G||G.distanceTo(camera.position)>dist*3)G=tv2.copy(controls.target);camera.position.sub(G).multiplyScalar(s).add(G);controls.target.sub(G).multiplyScalar(s).add(G)}}
      if(tg.turn||tg.twist){tv1.copy(camera.position).sub(controls.target);sph.setFromVector3(tv1);
        if(tg.turn){sph.theta-=2*Math.PI*(m.x-tg.x)/el;sph.phi=Math.min(Math.max(sph.phi-2*Math.PI*(m.y-tg.y)/el,.05),controls.maxPolarAngle)}
        if(tg.twist)sph.theta+=TWIST*wrapA(m.a-tg.a);
        tv1.setFromSpherical(sph);camera.position.copy(controls.target).add(tv1)}
      Object.assign(tg,{x:m.x,y:m.y,d:m.d,a:m.a})}
    camera.lookAt(controls.target)};
  cv.addEventListener('pointerdown',e=>{if(e.pointerType!=='touch')return;try{cv.setPointerCapture(e.pointerId)}catch(x){}touchStep(performance.now());TP.set(e.pointerId,{x:e.clientX,y:e.clientY});startTouch()});
  cv.addEventListener('pointermove',e=>{if(e.pointerType!=='touch'||!TP.has(e.pointerId))return;const p=TP.get(e.pointerId);p.x=e.clientX;p.y=e.clientY;tdirty=true;
    if(p.h){const cs=e.getCoalescedEvents&&e.getCoalescedEvents();for(const c of cs&&cs.length?cs:[e])p.h.push([c.timeStamp,c.clientX,c.clientY]);while(p.h.length>2&&e.timeStamp-p.h[0][0]>100)p.h.shift()}});
  const endTouch=e=>{if(!TP.has(e.pointerId))return;const now=performance.now(),p=TP.get(e.pointerId);if(p.x!==e.clientX||p.y!==e.clientY){p.x=e.clientX;p.y=e.clientY;tdirty=true}touchStep(now);TP.delete(e.pointerId);
    // a flick: the finger was still moving when it left the screen, so the map carries on at the finger's speed
    if(tg&&tg.k===1&&!TP.size&&e.type==='pointerup'&&p.h&&p.h.length>1){const h=p.h.filter(q=>e.timeStamp-q[0]<100),a=h[0],b=h[h.length-1];
      if(h.length>1&&e.timeStamp-b[0]<80&&b[0]-a[0]>8){const vx=(b[1]-a[1])/(b[0]-a[0]),vy=(b[2]-a[2])/(b[0]-a[0]);
        if(Math.hypot(vx,vy)>.25){const q0=levelAt(p.x,p.y,tg.g.y,new THREE.Vector3()),q1=levelAt(p.x+vx*16,p.y+vy*16,tg.g.y,tv1);if(q0&&q1){let gx=(q0.x-q1.x)/16,gz=(q0.z-q1.z)/16;const vm=camera.position.distanceTo(controls.target)*.004,vl=Math.hypot(gx,gz);if(vl>vm){gx*=vm/vl;gz*=vm/vl}glide={vx:gx,vz:gz,t:now}}}}}
    if(TP.size)startTouch();else{tg=null;setTimeout(()=>{multi=false},0)}};
  cv.addEventListener('pointerup',endTouch);cv.addEventListener('pointercancel',endTouch);
  // after a flick the map slows to a stop within about a second
  const glideOn=now=>{const dt=Math.min(50,now-glide.t);glide.t=now;const moved=moveBy(glide.vx*dt,glide.vz*dt),k=Math.exp(-dt/280);glide.vx*=k;glide.vz*=k;
    if(moved<1e-3*dt||Math.hypot(glide.vx,glide.vz)*16<camera.position.distanceTo(controls.target)*2e-4)glide=null};
  cv.addEventListener('wheel',hideHint,{passive:true});
  const syncTools=()=>{$$('[data-map]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.map===S.map)));$$('[data-color]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.color===S.color)));$$('[data-ex]').forEach(b=>b.setAttribute('aria-pressed',String(+b.dataset.ex===S.ex)))};
  $('.tools').addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;
    if(b.dataset.map){S.map=b.dataset.map;mapPicked=true;applyMap()}
    if(b.dataset.color){S.color=b.dataset.color;recolor();updateReadout()}
    if(b.dataset.ex){const k=+b.dataset.ex/S.ex,oldY=controls.target.y;S.ex=+b.dataset.ex;group.scale.y=S.ex;controls.target.y*=k;camera.position.y+=controls.target.y-oldY;WXV.ex();doBake();if(FP){FP.sv.ex=S.ex;FP.y=null}}
    syncTools();save()},sig);
  $('#reset').addEventListener('click',()=>{if(FP)fpExit();else flyTo(frameDay())},sig);
  const stopPlay=()=>{playing=null;$('#play').textContent='▶ Walk'};
  $('#play').addEventListener('click',()=>{if(playing){stopPlay();return}if(FP)fpExit();if(!S.day)selectDay(1,true);const d=DAYS[S.day-1];playing={d,t0:performance.now()+(reduce?0:900),dur:Math.max(8,R.t[d.i1]*2.4)*1000};$('#play').textContent='❚❚ Pause';hideHint()},sig);
  const tag=$('#tag'),north=$('#north');
  const place=()=>{const r={w:stage.clientWidth,h:stage.clientHeight};
    if(S.i>=0&&!FP){const p=P(S.i),dist=camera.position.distanceTo(p),s=dist*.0055;marker.position.copy(p);halo.position.copy(p);marker.scale.setScalar(s);halo.scale.setScalar(s);marker.visible=halo.visible=true;
      v.copy(p).project(camera);if(v.z<1){const d=dayOf(S.i);tag.hidden=false;tag.textContent=`${DAYS.length>1?`Day ${d.n} · `:''}${fmtClock(clock(S.i))} · ${nf.format(Math.round(R.e[S.i]))} m${TAGT}`;const tx=(v.x+1)/2*r.w,ty=(1-v.y)/2*r.h;tag._x=Math.min(Math.max(tx+14,4),r.w-tag.offsetWidth-4);tag._y=Math.max(ty-42,4);tag.style.transform=`translate(${tag._x}px,${tag._y}px)`}else tag.hidden=true}
    else{tag.hidden=true;marker.visible=halo.visible=false}
    const placed=[];if(!tag.hidden&&tag._x!=null)placed.push({x:tag._x,y:tag._y,w:tag.offsetWidth,h:tag.offsetHeight});
    labels.forEach(L=>{const{p,el}=L;if(!showLbl(p)){el.style.display='none';return}if(p.lm)v.set(L.v.x,L.v.y*S.ex,L.v.z).project(camera);else v.copy(P(p.i)).project(camera);if(v.z>1||Math.abs(v.x)>1.05||Math.abs(v.y)>1.05){el.style.display='none';return}
      if(!L.w){el.style.display='';L.w=el.offsetWidth;L.h=el.offsetHeight}
      const sx=(v.x+1)/2*r.w,sy=(1-v.y)/2*r.h,box={x:Math.min(Math.max(sx-L.w/2,4),r.w-L.w-4),y:sy-L.h*1.35,w:L.w,h:L.h};
      if(placed.some(q=>box.x<q.x+q.w+4&&q.x<box.x+box.w+4&&box.y<q.y+q.h+2&&q.y<box.y+box.h+2)){el.style.display='none';return}
      placed.push(box);el.style.display='';el.style.transform=`translate(${box.x}px,${box.y}px)`})};
  const ease=t=>t<.5?4*t*t*t:1-Math.pow(-2*t+2,3)/2;
  // ---------- the cover: a picture of the whole hike for the home screen, rendered once from this model ----------
  // Plain light, no clouds, no labels. Two pictures: a tall one for a phone's home screen (<id>:cover) and a wide one
  // for wide screens and the list (<id>:coverw). D.cover holds the version, so a new version can draw them again.
  const COVER_V='v1';let COVER_UP=[.8,.75];  // how steeply the camera looks down: tall pictures, wide pictures
  const snap=(cw,ch)=>{const sv={p:camera.position.clone(),t:controls.target.clone(),a:camera.aspect,wx:S.wx},mv=marker.visible,now=performance.now();
    camera.aspect=cw/ch;camera.updateProjectionMatrix();fitCover(cw<ch);
    if(S.wx!=='plain'){S.wx='plain';WXV.time(true)}marker.visible=halo.visible=false;LM.forEach(m=>m.resolution.set(cw,ch));
    TILES.cover(true);WXV.frame(now);TILES.update(now);renderer.shadowMap.needsUpdate=true;
    const rt=new THREE.WebGLRenderTarget(cw,ch,{samples:renderer.capabilities.isWebGL2?4:0});renderer.setRenderTarget(rt);renderer.render(scene,camera);
    const px=new Uint8Array(cw*ch*4);renderer.readRenderTargetPixels(rt,0,0,cw,ch,px);renderer.setRenderTarget(null);rt.dispose();TILES.cover(false);
    S.wx=sv.wx;camera.aspect=sv.a;camera.updateProjectionMatrix();camera.position.copy(sv.p);controls.target.copy(sv.t);controls.update();
    LM.forEach(m=>m.resolution.set(stage.clientWidth,stage.clientHeight));marker.visible=halo.visible=mv;WXV.time(true);renderer.shadowMap.needsUpdate=true;
    const c2=document.createElement('canvas');c2.width=cw;c2.height=ch;const x2=c2.getContext('2d'),im=x2.createImageData(cw,ch);
    for(let y=0;y<ch;y++)im.data.set(px.subarray((ch-1-y)*cw*4,(ch-y)*cw*4),y*cw*4);x2.putImageData(im,0,0);
    return new Promise(ok=>c2.toBlob(b=>{c2.width=c2.height=0;ok(b)},'image/jpeg',.86))};
  // Fit the whole route into a box on the picture, clear of the header at the top and of the bottom, where the home
  // screen fades the picture out.
  const fitCover=port=>{const f=frame(0,N-1,[],COVER_UP[port?0:1]),dir=f.pos.clone().sub(f.target),tgt=f.target.clone(),v=new THREE.Vector3(),rx=new THREE.Vector3(),ry=new THREE.Vector3(),
      bx=port?[-.84,.84,-.46,.7]:[-.86,.86,-.3,.5],tv=Math.tan(THREE.MathUtils.degToRad(camera.fov/2));let dist=dir.length();dir.normalize();
    const put=()=>{camera.position.copy(tgt).addScaledVector(dir,dist);camera.lookAt(tgt);camera.updateMatrixWorld();camera.matrixWorldInverse.copy(camera.matrixWorld).invert()};
    for(let it=0;it<10;it++){put();let x0=1e9,x1=-1e9,y0=1e9,y1=-1e9;
      for(let i=0;i<N;i+=2){v.set(rp[i*3],rp[i*3+1]*S.ex,rp[i*3+2]).project(camera);x0=Math.min(x0,v.x);x1=Math.max(x1,v.x);y0=Math.min(y0,v.y);y1=Math.max(y1,v.y)}
      const sc=Math.min(1.6,Math.max(.6,Math.max((x1-x0)/(bx[1]-bx[0]),(y1-y0)/(bx[3]-bx[2])))),hh=dist*tv,ww=hh*camera.aspect;
      rx.setFromMatrixColumn(camera.matrixWorld,0);ry.setFromMatrixColumn(camera.matrixWorld,1);
      tgt.addScaledVector(rx,((x0+x1)-(bx[0]+bx[1]))/2*ww).addScaledVector(ry,((y0+y1)-(bx[2]+bx[3]))/2*hh);dist*=sc}
    put();controls.target.copy(tgt)};
  let coverAsked=false;
  function maybeCover(){if(coverAsked||!alive||!D.id||S.map!=='sat'||!GTEX||(BLOBS.dem&&!HS)||D.cover===COVER_V)return;coverAsked=true;
    setTimeout(async()=>{try{if(!alive)return;const t=await snap(900,1125);if(!alive||!t)return;const w=await snap(1600,900);if(!alive||!w)return;
      await HP.db.putBlob(D.id+':cover',t);await HP.db.putBlob(D.id+':coverw',w);D.cover=COVER_V;save()}catch(e){console.warn('cover',e)}},1200)}
  const gAt=(x,z)=>hgt(Math.min(Math.max(x/M+W/2,0),W),Math.min(Math.max(z/M+H/2,0),H))*S.ex;
  const follow=()=>{const c=camera.position,t=controls.target,w=1-Math.min(1,Math.max(0,(c.distanceTo(t)-3000)/5000));
    if(w>0){const dy=(gAt(t.x,t.z)+20*S.ex-t.y)*.12*w;if(Math.abs(dy)>.05){t.y+=dy;c.y+=dy}}
    const cg=gAt(c.x,c.z)+60*S.ex;if(c.y<cg)c.y=cg};
  // ---------- first person: walk the route at eye height, looking ahead, with the light of the hour you are there ----------
  // Drag to look around, pinch or scroll to zoom. The walk stops for a look at each of the best views.
  const FPS=[30,120],fpEl=$('#fpbar'),fpCap=$('#fpcap'),fpV=new THREE.Vector3(),fpA=new THREE.Vector3(),FPT=new Map();
  const setEx=v=>{if(v===S.ex)return;const k=v/S.ex,oldY=controls.target.y;S.ex=v;group.scale.y=S.ex;controls.target.y*=k;camera.position.y+=controls.target.y-oldY;WXV.ex();doBake();syncTools()};
  const fpAt=(km,out)=>{let lo=0,hi=N-1;while(lo<hi){const m=(lo+hi)>>1;if(R.d[m]<km)lo=m+1;else hi=m}const i=Math.max(1,lo),a=R.d[i-1],b=R.d[i],f=b>a?Math.min(1,Math.max(0,(km-a)/(b-a))):0;
    out.set(rp[(i-1)*3]+(rp[i*3]-rp[(i-1)*3])*f,0,rp[(i-1)*3+2]+(rp[i*3+2]-rp[(i-1)*3+2])*f);return f<.5?i-1:i};
  const yawOf=b=>Math.atan2(Math.sin(b*Math.PI/180),-Math.cos(b*Math.PI/180)),wrapY=a=>Math.atan2(Math.sin(a),Math.cos(a));
  // stops on the way: a look at each of the best views, the end of each day and the finish; they follow changes to the plan
  let FPL=null;const fpStops=()=>{const V=bestViews(),key=DAYS.map(d=>d.i1).join();if(FPL&&FPL.V===V&&FPL.key===key)return FPL.L;
    const L=V.map(v=>({km:R.d[v.i],az:v.az,el:v.el||0,ms:5000,v}));DAYS.slice(0,-1).forEach(d=>L.push({km:R.d[d.i1],ms:3200,day:d.n,i:d.i1}));L.push({km:R.d[N-1],end:1,i:N-1});
    L.sort((x,y)=>x.km-y.km);FPL={V,key,L};return L};
  // bring the 3D view into sight when a walk starts from further down the page
  const reveal=jump=>{const r=stage.getBoundingClientRect(),hh=$('#top').offsetHeight||0;if(r.top<hh-2||r.bottom>innerHeight+2)window.scrollTo({top:Math.max(0,scrollY+r.top-hh),behavior:jump||matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'})};
  function fpEnter(km,{play=true,face=null}={}){if(playing)stopPlay();glide=null;fly=null;
    if(!FP){FP={sv:{fov:camera.fov,ex:S.ex,lw:LM.map(m=>m.linewidth)},speed:0};LM.forEach(m=>m.linewidth*=.6);if(S.ex!==1)setEx(1);controls.enabled=false;camera.fov=camera.aspect<1?68:58;camera.near=4;camera.updateProjectionMatrix();lines.forEach(l=>l.position.y=-13);fpEl.hidden=false;stage.classList.add('fp');$('#fpbtn').setAttribute('aria-pressed','true');hideHint()}
    km=Math.max(0,Math.min(R.d[N-1],km));
    Object.assign(FP,{km,play,yaw:null,ly:0,lp:0,pt:0,y:null,touch:0,pause:face!=null&&!play?Infinity:0,face,fel:0});
    const t=face!=null?fpStops().find(t=>t.v&&Math.abs(t.km-km)<.03):null;if(t)FP.fel=t.el;fpCaption(t);const i=fpAt(km,fpV);FP.myI=i;if(S.i!==i)setIndex(i);fpSync()}
  function fpExit(){if(!FP)return;const sv=FP.sv;FP=null;LM.forEach((m,k)=>m.linewidth=sv.lw[k]);FPT.clear();fpEl.hidden=true;fpCap.hidden=true;stage.classList.remove('fp');$('#fpbtn').setAttribute('aria-pressed','false');camera.fov=sv.fov;camera.near=20;camera.updateProjectionMatrix();controls.enabled=true;lines.forEach(l=>l.position.y=0);
    if(sv.ex!==S.ex)setEx(sv.ex);flyTo(frameDay())}
  function fpCaption(t){if(!t){fpCap.hidden=true;return}fpCap.innerHTML=t.v?`<b>${VIEWICON}${esc(viewName(t.v))}</b><span>${viewWhat(t.v)}</span>`:`<b>${t.end?'Finish':`End of day ${t.day}`}</b><span>${esc(placeName(t.i))} · ${fmtClock(CLK[t.i])}</span>`;fpCap.hidden=false}
  function fpSync(){if(!FP)return;const on=FP.play&&FP.pause!==Infinity;$('#fpplay').innerHTML=on?'❚❚':'▶';$('#fpplay').setAttribute('aria-label',on?'Pause':'Walk on');$('#fpspeed').textContent=FP.speed?'4×':'1×'}
  function fpStep(now,dt){const F=FP,end=R.d[N-1];
    // a point picked elsewhere (the profile, a day chip) moves the walker there
    if(S.i>=0&&S.i!==F.myI&&Math.abs(R.d[S.i]-F.km)>.05){F.km=R.d[S.i];F.yaw=null;F.y=null;F.face=null;F.pause=0;fpCap.hidden=true}
    if(F.play&&now>F.pause){if(F.pause){F.pause=0;F.face=null;fpCap.hidden=true}const k0=F.km;F.km=Math.min(end,F.km+FPS[F.speed]*dt/1e6);
      const t=fpStops().find(t=>t.km>k0+1e-6&&t.km<=F.km+1e-9);if(t){F.km=t.km;fpCaption(t);if(t.end){F.play=false;fpSync()}else{F.pause=now+t.ms/(F.speed?1.6:1);F.face=t.az;F.fel=t.el||0}}}
    const i=fpAt(F.km,fpV),ahead=Math.min(end,F.km+.16),j=fpAt(ahead,fpA);if(F.km>end-.16){fpAt(Math.max(0,F.km-.16),fpA);fpA.set(2*fpV.x-fpA.x,0,2*fpV.z-fpA.z)}
    const h=F.face!=null?yawOf(F.face):Math.atan2(fpA.x-fpV.x,fpA.z-fpV.z);if(F.yaw===null)F.yaw=h;else F.yaw+=wrapY(h-F.yaw)*Math.min(1,dt/(F.face!=null?900:650));
    // look a little down the path going down and up it going up; ease the look back after a drag
    const sl=F.face!=null?Math.min(.3,Math.max(-.05,(F.fel*.55-1)*Math.PI/180+.07)):Math.atan((R.e[j]-R.e[i])/Math.max(40,(R.d[j]-R.d[i])*1000))*.55;F.pt+=(sl-F.pt)*Math.min(1,dt/700);
    if(F.play&&now-F.touch>2500){const k=Math.exp(-dt/800);F.ly*=k;F.lp*=k}
    let g=-1e9;for(const[ox,oz]of[[0,0],[12,0],[-12,0],[0,12],[0,-12]])g=Math.max(g,gAt(fpV.x+ox,fpV.z+oz));const gy=Math.max(g,R.e[i]*S.ex)+12;
    F.y=F.y===null||gy>F.y?(F.y===null?gy:F.y+(gy-F.y)*Math.min(1,dt/90)):F.y+(gy-F.y)*Math.min(1,dt/350);const y=Math.max(F.y,g+3);
    const yw=F.yaw+F.ly,pt=-.07+F.pt+F.lp,dx=Math.sin(yw)*Math.cos(pt),dz=Math.cos(yw)*Math.cos(pt),dy=Math.sin(pt);
    camera.position.set(fpV.x,y,fpV.z);controls.target.set(fpV.x+dx*400,y+dy*400,fpV.z+dz*400);camera.lookAt(controls.target);
    if(i!==S.i)setIndex(i);F.myI=S.i;
    if(S.day&&R.day[i]!==S.day)selectDay(R.day[i],false);
    $('#fpinfo').textContent=`Day ${R.day[i]} · km ${(R.d[i]-R.d[dayOf(i).i0]).toFixed(1)} · ${fmtClock(CLK[i])}`}
  $('#fpplay').addEventListener('click',()=>{if(!FP)return;if(FP.km>=R.d[N-1]-.01){fpEnter(S.day?R.d[DAYS[S.day-1].i0]:0);return}if(FP.pause===Infinity){FP.pause=0;FP.play=true}else FP.play=!FP.play;fpSync()},sig);
  $('#fpspeed').addEventListener('click',()=>{if(!FP)return;FP.speed=FP.speed?0:1;fpSync()},sig);
  $('#fpexit').addEventListener('click',fpExit,sig);
  document.addEventListener('keydown',e=>{if(!FP||e.target.closest('input,select,textarea')||document.querySelector('#drawer:not([hidden]),#sheet:not([hidden]),#dialog:not([hidden]),#ied:not([hidden])'))return;if(e.key==='Escape'){e.preventDefault();fpExit()}else if(e.key===' '&&!e.target.closest('button,a')){e.preventDefault();$('#fpplay').click()}},sig);
  $('#fpbtn').addEventListener('click',()=>{if(FP){fpExit();return}reveal();fpEnter(S.i>=0?R.d[S.i]:S.day?R.d[DAYS[S.day-1].i0]:0)},sig);
  $('#viewscard').addEventListener('click',e=>{const b=e.target.closest('[data-look],[data-fp]');if(!b)return;if(b.dataset.look!=null)V3.look(+b.dataset.look);else{reveal();fpEnter(S.day?R.d[DAYS[S.day-1].i0]:0)}},sig);
  // in first person the fingers and the mouse look around and zoom; nothing else on the map reacts
  cv.addEventListener('pointerdown',e=>{if(!FP)return;e.stopImmediatePropagation();try{cv.setPointerCapture(e.pointerId)}catch(x){}FPT.set(e.pointerId,{x:e.clientX,y:e.clientY});FP.touch=performance.now()},{capture:true});
  cv.addEventListener('pointermove',e=>{if(!FP)return;e.stopImmediatePropagation();const p=FPT.get(e.pointerId);if(!p)return;
    if(FPT.size===1){FP.ly-=(e.clientX-p.x)*.005;FP.lp=Math.max(-.9,Math.min(.8,FP.lp+(e.clientY-p.y)*.004))}
    else if(FPT.size===2){const[a,b]=[...FPT.values()],d0=Math.hypot(a.x-b.x,a.y-b.y),q={x:e.clientX,y:e.clientY},o=a===p?b:a,d1=Math.hypot(q.x-o.x,q.y-o.y);if(d0>10&&d1>10){camera.fov=Math.min(80,Math.max(25,camera.fov*d0/d1));camera.updateProjectionMatrix()}}
    p.x=e.clientX;p.y=e.clientY;FP.touch=performance.now()},{capture:true});
  const fpUp=e=>{if(!FP)return;e.stopImmediatePropagation();FPT.delete(e.pointerId);FP.touch=performance.now()};cv.addEventListener('pointerup',fpUp,{capture:true});cv.addEventListener('pointercancel',fpUp,{capture:true});
  cv.addEventListener('wheel',e=>{if(!FP)return;e.preventDefault();e.stopImmediatePropagation();camera.fov=Math.min(80,Math.max(25,camera.fov*(1+e.deltaY*.001)));camera.updateProjectionMatrix()},{capture:true,passive:false});
  const loop=now=>{raf=requestAnimationFrame(loop);if(document.hidden||!stage.getClientRects().length)return;const dt=Math.min(100,now-(lastLoop||now));lastLoop=now;
    if(FP)fpStep(now,dt);else{
    if(fly){const t=Math.min(1,(now-fly.t0)/1100),k=ease(t);camera.position.lerpVectors(fly.p0,fly.f.pos,k);controls.target.lerpVectors(fly.q0,fly.f.target,k);if(t>=1)fly=null}
    if(tg)touchStep(now);if(glide&&!fly)glideOn(now);
    if(playing&&now>=playing.t0){const d=playing.d,f=Math.min(1,(now-playing.t0)/playing.dur),T=f*WALK[d.i1];let lo=d.i0,hi=d.i1;while(lo<hi){const m=(lo+hi)>>1;if(WALK[m]<T)lo=m+1;else hi=m}if(lo!==S.i)setIndex(lo);if(f>=1)stopPlay()}
    controls.update();if(!fly)follow()}
    WXV.frame(now);TILES.update(now);place();const az=FP?Math.atan2(camera.position.x-controls.target.x,camera.position.z-controls.target.z):controls.getAzimuthalAngle();north.style.transform=`rotate(${az}rad)`;for(const a of $$('#readout .warr'))a.style.transform=`rotate(${az+a.dataset.to*Math.PI/180}rad)`;renderer.render(scene,camera)};
  V3=window.V3={cam:camera,stage,ctl:controls,det:()=>bakeRT?[bakeRT.width,bakeRT.height]:null,cover:(w,h,up)=>{if(up)COVER_UP=up;return snap(w,h)},groundAt:(x,y)=>{const g=groundAt(x,y,new THREE.Vector3());return g&&g.toArray()},toScreen:a=>{const r=cv.getBoundingClientRect(),q=new THREE.Vector3(...a).project(camera);return[r.left+(q.x+1)/2*r.width,r.top+(1-q.y)/2*r.height]},gliding:()=>!!glide,tiles:()=>TILES.stats(),mark(){WXV.time()},times(){WXV.time(true)},strike:hold=>WXV.testStrike(hold),playing:()=>!!playing,windGrid:(nx,day,t)=>{const ny=Math.round(nx*D.h/D.w),o=[];for(let j=0;j<ny;j++)for(let i=0;i<nx;i++){const px=(i+.5)/nx*D.w,py=(j+.5)/ny*D.h,w=windAt(px,py,day,t);o.push([px,py,+w.e.toFixed(2),+w.n.toFixed(2),Math.round(TER.at(px,py))])}return{nx,ny,w:D.w,h:D.h,o}},wind:i=>{const c=cond(i,CLK[i]);return{v:+c.v.toFixed(1),g:+c.g.toFixed(1),dir:Math.round(c.dir),from:HP.compass(c.dir)}},
    dayChanged(doFly){recolor();if(playing&&R.day[playing.d.i0]!==S.day)stopPlay();if(FP){const d=S.day&&DAYS[S.day-1];if(d&&(FP.km<R.d[d.i0]-.01||FP.km>R.d[d.i1]+.01))fpEnter(R.d[d.i0],{play:FP.play});return}if(doFly)flyTo(frameDay())},
    dayEndKm:n=>R.d[DAYS[n-1].i1],viewsDebug:()=>VDBG,modes(){colorBtns();syncTools();recolor()},recolor(){recolor()},focus(i){if(FP)fpExit();reveal(true);flyTo(frame(Math.max(0,i-12),Math.min(N-1,i+12)))},exposure:()=>{const E=exposure();return E?Array.from(E,v=>Math.round(v)):null},heightAt:(x,y)=>HGT?HGT(x,y):null,orbitAt(i,dist,az=0,pol=1.05){if(FP)fpExit();fly=null;glide=null;const t=P(Math.max(0,Math.min(N-1,i)));controls.target.copy(t);camera.position.set(t.x+dist*Math.sin(pol)*Math.sin(az),t.y+dist*Math.cos(pol),t.z+dist*Math.sin(pol)*Math.cos(az));controls.update()},look(k,jump){const V=bestViews(),v=V[k];reveal(jump);if(!(k>=0)||!v){fpEnter(S.day?R.d[DAYS[S.day-1].i0]:0);return}fpEnter(R.d[v.i],{play:false,face:v.az})},firstPerson(km){fpEnter(km||0)},fpExit,
    fp:()=>FP?{km:+FP.km.toFixed(3),play:FP.play,pause:FP.pause===Infinity?'hold':FP.pause?'stop':'',ex:S.ex,fov:camera.fov,day:S.day,i:S.i,cap:fpCap.hidden?'':fpCap.textContent,next:(fpStops().find(t=>t.km>FP.km+1e-6)||{}).km,left:FP.pause&&FP.pause!==Infinity?Math.round(FP.pause-performance.now()):0}:null,
    relabel(){makeLabels();recolor()},
    dispose(){alive=false;cancelAnimationFrame(raf);FP=null;stage.classList.remove('fp');fpEl.hidden=true;fpCap.hidden=true;$('#fpbtn').setAttribute('aria-pressed','false');TILES.dispose();[bakeRT,bakeHT,white,bakeM,bq.geometry].forEach(x=>x&&x.dispose());controls.dispose();scene.traverse(o=>{if(o.geometry)o.geometry.dispose();const ms=o.material?(Array.isArray(o.material)?o.material:[o.material]):[];ms.forEach(m=>{for(const k in m){const t=m[k];if(t&&t.isTexture)t.dispose()}if(m.uniforms)for(const k in m.uniforms){const t=m.uniforms[k].value;if(t&&t.isTexture)t.dispose()}m.dispose()})});Object.values(tex).forEach(p=>p.then(t=>t.dispose()).catch(()=>{}));renderer.dispose();try{renderer.forceContextLoss()}catch(e){}}};
  recolor();syncTools();applyMap();WXV.time(true);$('#msg').hidden=true;raf=requestAnimationFrame(loop);useDEM();
  // hikes saved before version 1.4 get the satellite picture and the detailed heights once, with a connection
  // a hike restored from a backup gets its map picture again, and hikes in Switzerland saved before 2.2 get the Swiss national map
  // as their offline map (three tries at most)
  const need={sat:!BLOBS.sat,dem:!BLOBS.dem||!D.dem,topo:(D.topoTry||0)<3&&(!BLOBS.topo||D.topoSrc!=='swisstopo'&&HP.maps.boxCH(HP.geo.lat(D.y0+D.h,14),HP.geo.lon(D.x0,14),HP.geo.lat(D.y0,14),HP.geo.lon(D.x0+D.w,14)))};
  if((need.sat||need.dem||need.topo)&&navigator.onLine&&HP.fetchExtras&&D.id){const xp=$('#xpill'),what=need.sat?'Getting satellite pictures':need.dem?'Getting detailed heights':'Getting the Swiss map';xp.textContent=what+'…';xp.hidden=!(need.sat||need.dem);
    HP.fetchExtras(D,need,f=>{xp.textContent=`${what} ${Math.round(f*100)}%`},sig.signal).then(async x=>{if(!alive)return;
      if(x.dem&&x.demInfo){D.dem=x.demInfo;BLOBS.dem=x.dem;await HP.db.putBlob(D.id+':dem',x.dem);save();useDEM()}
      if(x.topo){BLOBS.topo=x.topo;D.topoSrc=x.topoSrc;await HP.db.putBlob(D.id+':topo',x.topo);const old=tex.topo;delete tex.topo;mapBtns();
        // the new picture goes under the tiles without reloading the live map tiles on top of it
        const drop=keep=>{if(old)old.then(o=>{if(o!==keep)o.dispose()}).catch(()=>{})};
        if(S.map==='topo')loadTex('topo').then(t=>{if(!alive||S.map!=='topo')return drop();GTEX=t;TILES.refresh();credit();drop(t)}).catch(()=>drop());else drop()}if(need.topo){if(!x.topo)D.topoTry=(D.topoTry||0)+1;save()}
      if(x.sat){BLOBS.sat=x.sat;await HP.db.putBlob(D.id+':sat',x.sat);mapBtns();if(!mapPicked){S.map='sat';applyMap();save()}syncTools();
        HP.thumb(D,x.sat).then(t=>t&&HP.setThumb&&HP.setThumb(D.id,t)).catch(()=>{})}
      xp.hidden=true}).catch(e=>{xp.hidden=true;if(alive)console.warn('extras',e)})}
}

/* ---------- 3D weather ---------- */
function initWX3D(o){
  const{scene,renderer,camera,controls,sun,hemi,W,H,M,minH,maxH,LM,stage}=o,GC=TER.GC,GR=TER.GR,GS=TER.GS;
  const coarse=matchMedia('(pointer: coarse)').matches;
  const X0=-W*M/2,Z0=-H*M/2,SX=W*M,SZ=H*M,tAt=(x,z)=>TER.at(x/M+W/2,z/M+H/2),wx=px=>(px-W/2)*M,wz=py=>(py-H/2)*M,GREF=(minH+maxH)/2,DIAG=Math.hypot(SX,SZ);
  const C=c=>new THREE.Color(c),Z4=new THREE.Vector4(0,0,0,0);
  const NOISE=`float wh(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float wn(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(wh(i),wh(i+vec2(1.,0.)),f.x),mix(wh(i+vec2(0.,1.)),wh(i+vec2(1.,1.)),f.x),f.y);}
float wf(vec2 p){return .5*wn(p)+.25*wn(p*2.03+7.1)+.125*wn(p*4.07+3.3)+.0625*wn(p*8.1+1.7);}`;
  renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;renderer.shadowMap.autoUpdate=false;
  const smz=Math.min(renderer.capabilities.maxTextureSize,coarse?2048:4096);sun.shadow.mapSize.set(smz,smz);
  const shc=sun.shadow.camera,half=DIAG/2*1.05;shc.left=-half;shc.right=half;shc.top=half;shc.bottom=-half;shc.near=500;shc.far=DIAG*2+60000;shc.updateProjectionMatrix();
  sun.shadow.bias=-.0002;sun.shadow.normalBias=16;
  // the shadow map covers just the terrain as the sun sees it, for the sharpest shadows
  const lvm=new THREE.Matrix4(),tv=new THREE.Vector3(),UP=new THREE.Vector3(0,1,0);
  const fitShadow=()=>{lvm.lookAt(sun.position,sun.target.position,UP).setPosition(sun.position).invert();let x0=1e9,x1=-1e9,y0=1e9,y1=-1e9,z0=1e9,z1=-1e9;
    for(const x of[X0,X0+SX])for(const z of[Z0,Z0+SZ])for(const y of[minH*S.ex,maxH*S.ex]){tv.set(x,y,z).applyMatrix4(lvm);x0=Math.min(x0,tv.x);x1=Math.max(x1,tv.x);y0=Math.min(y0,tv.y);y1=Math.max(y1,tv.y);z0=Math.min(z0,tv.z);z1=Math.max(z1,tv.z)}
    shc.left=x0-200;shc.right=x1+200;shc.bottom=y0-200;shc.top=y1+200;shc.near=Math.max(1,-z1-500);shc.far=-z0+500;shc.updateProjectionMatrix();renderer.shadowMap.needsUpdate=true};
  // the light of the plain map comes from the front left of the first view, which shows the relief best
  const PLAIN=(()=>{const v=o.view||new THREE.Vector3(0,1,1),c=new THREE.Vector3(v.x,0,v.z).normalize(),l=new THREE.Vector3().crossVectors(UP,c.clone().negate()).normalize(),a=1.05,e=.7;
    const h=c.multiplyScalar(Math.cos(a)).addScaledVector(l,Math.sin(a)).normalize();return new THREE.Vector3(h.x*Math.cos(e),Math.sin(e),h.z*Math.cos(e))})();
  const SKYU={uZen:{value:C('#3b77c3')},uHor:{value:C('#b8d2e6')},uGnd:{value:C('#8fa0ad')},uSun:{value:new THREE.Vector3(0,1,0)},uSunCol:{value:C('#fff4e0')},uSunAmt:{value:1}};
  // one sky colour function for the sky itself, the haze over distant ground and the soft edges of the model, so they always match
  const SKYF=`uniform vec3 uZen,uHor,uGnd,uSun,uSunCol;uniform float uSunAmt;
vec3 skyCol(vec3 d){float h=d.y;vec3 c=mix(uHor,uZen,pow(clamp(h,0.,1.),.55));vec3 g=mix(uGnd,uGnd*.86,smoothstep(-.05,-.95,h));c=mix(c,g,smoothstep(0.,-.12,h));float s=max(dot(d,normalize(uSun)),0.);return c+uSunCol*(pow(s,28.)*.2+pow(s,4.)*.07)*uSunAmt;}`;
  // thin contour lines on the relief style, every 50 or 100 m, fading out where they would crowd (needs WebGL 2)
  const CONT=renderer.capabilities.isWebGL2?`
  float fw=max(fwidth(wAlt),.001),cl=abs(fract(wAlt/uCI+.5)-.5)*uCI/fw,il=abs(fract(wAlt/(uCI*5.)+.5)-.5)*uCI*5./fw,lf=1.-smoothstep(uCI*.1,uCI*.28,fw);
  diffuseColor.rgb*=1.-lf*(.1*(1.-smoothstep(.5,1.3,cl))+.1*(1.-smoothstep(.6,1.5,il)));`:'';
  // treeline and lasting snow for the relief colours, from the latitude (about 1,900 m and 2,900 m in the Alps)
  const TREE=Math.max(400,Math.min(4000,3400-32*Math.abs(D.center.lat)));
  const U={...SKYU,uDet:{value:o.det},uStyle:{value:2},uAO:{value:1},uRect:{value:new THREE.Vector4(X0,Z0,SX,SZ)},uEdge:{value:Math.min(SX,SZ)*.07},uHazeK:{value:0},uHazeMax:{value:.75},uTree:{value:TREE},uSnowP:{value:TREE+1000},uCI:{value:maxH-minH>1200?100:50},uCamP:{value:new THREE.Vector3()},
    uEx:{value:S.ex},uTime:{value:0},uWind:{value:new THREE.Vector2()},uSnowLine:{value:9e3},uSnowAmt:{value:0},uWet:{value:0},uFogTop:{value:-1e3},uFogAmt:{value:0},uFogCol:{value:C('#f4f6f8')},
    uDeckBase:{value:9e3},uDeckTop:{value:9e3},uDeckAmt:{value:0},uDeckShade:{value:0},uCloudCol:{value:C('#dfe3e6')},uCS:{value:null},uCSAmt:{value:0},uCSRect:{value:new THREE.Vector4(X0,Z0,SX,SZ)},
    uBoltG:{value:new THREE.Vector4()},uPrK:{value:0},uPrTop:{value:0},uPrSL:{value:9e3},uPrCol:{value:C('#9aa3ab')}};
  const csC=document.createElement('canvas');csC.width=512;csC.height=Math.max(64,Math.round(512*H/W));const csX=csC.getContext('2d');
  const csT=new THREE.CanvasTexture(csC);csT.flipY=false;U.uCS.value=csT;
  // every ground tile gets the same shader; own: the tile's uniforms (where its picture comes from)
  const prep=(mat,own)=>{mat.onBeforeCompile=sh=>{Object.assign(sh.uniforms,U,own);
    sh.vertexShader=sh.vertexShader.replace('#include <common>','#include <common>\nattribute float sk;uniform vec4 uRect;varying vec3 vWP;varying vec2 vTU,vTL;').replace('#include <worldpos_vertex>','#include <worldpos_vertex>\nvWP=(modelMatrix*vec4(transformed,1.0)).xyz;vTL=uv;vTU=vec2((vWP.x-uRect.x)/uRect.z,1.-(vWP.z-uRect.y)/uRect.w);\n#ifdef USE_SHADOWMAP\nworldPosition.y+=sk*modelMatrix[1][1];\n#endif');
    sh.fragmentShader=sh.fragmentShader.replace('#include <common>',`#include <common>
varying vec3 vWP;varying vec2 vTU,vTL;uniform vec4 uMapRect;uniform float uEx,uTime,uSnowLine,uSnowAmt,uWet,uFogTop,uFogAmt,uDeckBase,uDeckTop,uDeckAmt,uDeckShade,uCSAmt,uStyle,uAO,uEdge,uHazeK,uHazeMax,uTree,uSnowP,uCI;
uniform vec3 uFogCol,uCloudCol,uCamP,uPrCol;uniform sampler2D uCS,uDet;uniform vec4 uCSRect,uRect,uBoltG;uniform vec2 uWind;uniform float uPrK,uPrTop,uPrSL;
${SKYF}
${NOISE}
vec3 reliefCol(float a,float sd,float n){float t=uTree;
vec3 c=mix(vec3(.58,.67,.48),vec3(.41,.52,.37),smoothstep(t-1300.,t-600.,a));
c=mix(c,vec3(.64,.67,.50),smoothstep(t-150.,t+150.,a+n*140.));
c=mix(c,vec3(.70,.67,.61),smoothstep(t+450.,t+950.,a+n*180.));
c=mix(c,vec3(.55,.52,.50),smoothstep(33.,47.,sd+n*9.));
c=mix(c,vec3(.95,.97,1.),smoothstep(uSnowP-120.,uSnowP+220.,a+n*220.)*(1.-smoothstep(38.,54.,sd)));
return c*(.93+.14*n);}`).replace('#include <map_fragment>',`#ifdef USE_MAP
vec4 sampledDiffuseColor=texture2D(map,uMapRect.xy+vTL*uMapRect.zw);diffuseColor*=sampledDiffuseColor;
#endif
vec4 dT=texture2D(uDet,vTU);vec2 sl=dT.rg*2.-1.;sl=sl/max(1.-abs(sl),.004);float wAlt=vWP.y/uEx;vec3 wN=normalize(vec3(-sl.x,1.,-sl.y));float sd=degrees(acos(clamp(wN.y,0.,1.)));
if(uStyle>1.5){diffuseColor.rgb=reliefCol(wAlt,sd,wf(vWP.xz*.0016));${CONT}}
else if(uStyle<.5){vec3 c=pow(diffuseColor.rgb,vec3(.9));float l=dot(c,vec3(.299,.587,.114));diffuseColor.rgb=clamp(mix(vec3(l),c,1.1)*1.03+.008,0.,1.);}
float sn=0.;
if(uSnowAmt>0.){float n1=wf(vWP.xz*.0045),n2=wn(vWP.xz*.03),lum=dot(diffuseColor.rgb,vec3(.299,.587,.114));float snl=uSnowLine+(n1-.45)*260.;
sn=smoothstep(snl-40.,snl+160.,wAlt)*smoothstep(.4,.8,wN.y+(n2-.5)*.2)*uSnowAmt*mix(.6,1.,smoothstep(.05,.2,lum))*(1.-.6*smoothstep(.56,.72,wn(vWP.xz*.07+3.1))*smoothstep(.88,.66,wN.y));
diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.93,.95,.99)*(.76+.28*smoothstep(.04,.5,lum))*(.93+.07*n2),sn);}
diffuseColor.rgb*=1.-.3*uWet*(1.-sn);`).replace('#include <normal_fragment_maps>',`#include <normal_fragment_maps>
normal=normalize((viewMatrix*vec4(normalize(vec3(-sl.x*uEx,1.,-sl.y*uEx)),0.)).xyz);`).replace('#include <aomap_fragment>',`#include <aomap_fragment>
float aoV=mix(1.,pow(clamp(dT.b,0.,1.),1.25),uAO);reflectedLight.indirectDiffuse*=aoV;reflectedLight.directDiffuse*=mix(1.,aoV,.2);
if(uCSAmt>0.){vec2 cu=(vWP.xz-uCSRect.xy)/uCSRect.zw;reflectedLight.directDiffuse*=1.-uCSAmt*texture2D(uCS,cu).r;}
if(uDeckShade>0.){reflectedLight.directDiffuse*=1.-uDeckShade*(1.-smoothstep(uDeckTop-150.,uDeckTop+100.,wAlt));}`).replace('#include <fog_fragment>',`if(uFogAmt>0.){float nf=wf(vWP.xz*.0011+uWind*uTime*.6);float ft=uFogTop+(nf-.45)*140.;float f=(1.-smoothstep(ft-280.,ft+30.,wAlt))*uFogAmt*.9;gl_FragColor.rgb=mix(gl_FragColor.rgb,uFogCol,f);}
if(uDeckAmt>0.){float nd=wf(vWP.xz*.0016+uWind*uTime),n3=wn(vWP.xz*.011-uWind*uTime*2.);float bb=uDeckBase+(nd-.45)*320.+(n3-.5)*120.;float dk=smoothstep(bb-140.,bb+200.,wAlt)*(1.-smoothstep(uDeckTop-60.,uDeckTop+140.,wAlt+(nd-.45)*200.))*uDeckAmt*(.68+.32*nd);
gl_FragColor.rgb=mix(gl_FragColor.rgb,uCloudCol*(.86+.1*nd+.1*n3+.06*smoothstep(bb,bb+900.,wAlt)),dk);}
if(uPrK>0.){float tp=uPrTop*uEx;if(vWP.y<tp){float f=uCamP.y<=tp?1.:clamp((tp-vWP.y)/max(uCamP.y-vWP.y,1.),0.,1.);float pk=1.-exp(-length(uCamP-vWP)*f*uPrK);gl_FragColor.rgb=mix(gl_FragColor.rgb,mix(uPrCol,vec3(.93,.95,.98)*uPrCol.g*1.3,smoothstep(uPrSL-150.,uPrSL+150.,wAlt)),pk*.8);}}
if(uBoltG.w>0.){float bd=length(vWP-uBoltG.xyz);gl_FragColor.rgb+=(diffuseColor.rgb*.8+.12)*vec3(.72,.78,1.)*uBoltG.w*(exp(-bd/1800.)*1.3+exp(-bd/8000.)*.22);}
vec3 vd=vWP-uCamP;float dist=length(vd);vec3 skc=skyCol(vd/dist);
gl_FragColor.rgb=mix(gl_FragColor.rgb,skc,uHazeMax*(1.-exp(-dist*uHazeK)));
vec2 eq=min(vWP.xz-uRect.xy,uRect.xy+uRect.zw-vWP.xz);float ef=smoothstep(0.,uEdge,min(eq.x,eq.y));
gl_FragColor.rgb=mix(skc,gl_FragColor.rgb,ef);`)};
  mat.customProgramCacheKey=()=>'wx3';mat.needsUpdate=true;return mat};
  const skyM=new THREE.ShaderMaterial({side:THREE.BackSide,depthWrite:false,depthTest:false,uniforms:{...SKYU,uFlash:{value:0}},
    vertexShader:`varying vec3 vD;void main(){vD=position;gl_Position=(projectionMatrix*modelViewMatrix*vec4(position,1.)).xyww;}`,
    fragmentShader:`${SKYF}uniform float uFlash;varying vec3 vD;void main(){vec3 d=normalize(vD);vec3 c=skyCol(d);float s=max(dot(d,normalize(uSun)),0.);c+=uSunCol*pow(s,1400.)*2.2*uSunAmt+vec3(.5,.55,.7)*uFlash;gl_FragColor=vec4(c,1.);}`});
  const sky=new THREE.Mesh(new THREE.SphereGeometry(1,40,20),skyM);sky.scale.setScalar(450000);sky.renderOrder=-10;sky.frustumCulled=false;scene.add(sky);
  const fogO=new THREE.Fog(0xb8d2e6,1e5,2e5);
  const hm=new Uint8Array(GC*GR);for(let k=0;k<GC*GR;k++)hm[k]=Math.max(0,Math.min(255,Math.round((TER.ht[k]-minH)/Math.max(1,maxH-minH)*255)));
  const hmT=new THREE.DataTexture(hm,GC,GR,renderer.capabilities.isWebGL2?THREE.RedFormat:THREE.LuminanceFormat,THREE.UnsignedByteType);hmT.unpackAlignment=1;hmT.magFilter=hmT.minFilter=THREE.LinearFilter;hmT.needsUpdate=true;
  // one-off pictures drawn on the GPU when the view opens
  const bakeTex=(w,h,frag,rep)=>{const wr=rep?THREE.RepeatWrapping:THREE.ClampToEdgeWrapping,rt=new THREE.WebGLRenderTarget(w,h,{minFilter:THREE.LinearMipmapLinearFilter,magFilter:THREE.LinearFilter,generateMipmaps:true,wrapS:wr,wrapT:wr,depthBuffer:false}),
    m=new THREE.ShaderMaterial({vertexShader:'varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}',fragmentShader:frag,depthTest:false,depthWrite:false}),q=new THREE.Mesh(new THREE.PlaneGeometry(2,2),m),sc=new THREE.Scene();sc.add(q);
    const prev=renderer.getRenderTarget(),sm=renderer.shadowMap,se=sm.enabled;sm.enabled=false;renderer.setRenderTarget(rt);renderer.render(sc,new THREE.Camera());renderer.setRenderTarget(prev);sm.enabled=se;q.geometry.dispose();m.dispose();return rt.texture};
  const HASH=`float h1(float n){return fract(sin(n*12.9898)*43758.5453);}
float h12(vec2 p){vec3 q=fract(vec3(p.xyx)*.1031);q+=dot(q,q.yzx+33.33);return fract((q.x+q.y)*q.z);}`;
  // cloud sprites: three cauliflower clusters (lobes in a dome, smaller billows on them) and a fibrous sheet for anvils.
  // red, green: the surface normal; blue: how open the surface is (crevices are dark); alpha: density
  const atT=bakeTex(1024,1024,`varying vec2 vUv;${HASH}
float vn(vec2 p){vec2 i=floor(p),f=fract(p),u=f*f*(3.-2.*f);return mix(mix(h12(i),h12(i+vec2(1.,0.)),u.x),mix(h12(i+vec2(0.,1.)),h12(i+vec2(1.,1.)),u.x),u.y);}
float fbm(vec2 p){float s=0.,a=.5;for(int k=0;k<5;k++){s+=a*vn(p);p=p*2.03+vec2(13.7,7.3);a*=.5;}return s;}
float billow(vec2 p){float s=0.,a=.5;for(int k=0;k<4;k++){s+=a*abs(vn(p)*2.-1.);p=p*2.1+vec2(5.2,1.3);a*=.5;}return s;}
float V;
float surf(vec2 p,out float th){float tall=V<.5?1.:V<1.5?1.18:.78,wide=V<.5?1.:V<1.5?.9:.72,rs=V<1.5?1.:.95;float h=-1.;th=0.;
  for(int i=0;i<30;i++){float fi=float(i)*7.13+V*101.,l=(float(i)+.5)/30.;float y=mix(-.42,.66*tall-.1,pow(l,.8))+(h1(fi+1.)-.5)*.12,w=mix(.62,.16,l)*wide,x=(h1(fi+2.)*2.-1.)*w*(.5+.5*h1(fi+5.)),r=mix(.36,.13,l)*(.55+.7*h1(fi+3.))*rs,z=(h1(fi+4.)-.5)*.3+(1.-l)*.12;
    vec2 d=(p-vec2(x,y))*vec2(1.,y<-.2?1.25:1.);float q=r*r-dot(d,d);if(q>0.){float t=sqrt(q);th+=2.*t;float zz=z+t,k=.09,s=clamp(.5+.5*(zz-h)/k,0.,1.);h=mix(h,mix(h,zz,s)+k*s*(1.-s),smoothstep(0.,.35*r,t));}}
  float up=smoothstep(-.7,.5,p.y);return h+(.03+.05*up)*billow(p*4.5+V*3.)+.04*fbm(p*3.+V);}
void main(){vec2 c=floor(vUv*2.);V=c.x+c.y*2.;vec2 p=(fract(vUv*2.)*2.-1.)*1.12,o=vec2(V*31.7,V*17.3);
  if(V<2.5){float th,t2,h=surf(p,th),e=.008;float hx=surf(p+vec2(e,0.),t2)-surf(p-vec2(e,0.),t2),hy=surf(p+vec2(0.,e),t2)-surf(p-vec2(0.,e),t2);vec3 n=normalize(vec3(-hx/(2.*e),-hy/(2.*e),1.));
    float occ=0.;for(int k=0;k<6;k++){float a=float(k)*1.0472+.5;occ+=max(0.,surf(p+vec2(cos(a),sin(a))*.1,t2)-h)/.1;}
    gl_FragColor=vec4(n.xy*.5+.5,1.-clamp(occ/6.*.6,0.,1.),smoothstep(0.,.3,th*.6-.26*(1.-fbm(p*3.4+o*1.7))-.03)*smoothstep(1.12,.96,max(abs(p.x),abs(p.y))));}
  else{float env=1.-smoothstep(.25,1.,length(p*vec2(.9,1.8)));vec2 q=vec2(p.x*.9,p.y*8.);float s0=fbm(q+o)*.6+fbm(p*vec2(1.8,16.)+o*2.)*.4,e=.01,gx=fbm(q+o+vec2(e*.9,0.))-fbm(q+o),gy=fbm(q+o+vec2(0.,e*8.))-fbm(q+o);
    vec3 n=normalize(vec3(-gx/e*.05,-gy/e*.05+.3,1.));gl_FragColor=vec4(n.xy*.5+.5,.7+.3*s0,smoothstep(.5,.85,s0*env*1.4+env*.18)*(.6+.4*env));}}`);
  // a tileable noise for the cloud and fog layers: four fractal noises of different grain
  const NZT=bakeTex(256,256,`varying vec2 vUv;${HASH}
float vnp(vec2 p,float P,float s){vec2 i=floor(p),f=fract(p),u=f*f*(3.-2.*f),a=mod(i,P),b=mod(i+1.,P);return mix(mix(h12(a+s),h12(vec2(b.x,a.y)+s),u.x),mix(h12(vec2(a.x,b.y)+s),h12(b+s),u.x),u.y);}
float fbp(vec2 uv,float P,float s){float t=0.,a=.5;for(int k=0;k<5;k++){t+=a*vnp(uv*P,P,s+float(k)*19.1);P*=2.;a*=.5;}return t/.97;}
void main(){gl_FragColor=vec4(fbp(vUv,4.,1.),fbp(vUv,6.,7.3),fbp(vUv,8.,13.7),fbp(vUv,12.,29.9));}`,true);
  // cloud puffs: camera-facing sprites lit per pixel from their normals: sunlit tops, blue-grey shade, dark flat bases, a silver edge against the sun
  const MAXP=coarse?1500:2600,PS=11,PB=new Float32Array(MAXP*PS),aPos=new Float32Array(MAXP*3),aP=new Float32Array(MAXP*4),aQ=new Float32Array(MAXP*4),key=new Float32Array(MAXP);let PN=0,dirty=true;
  const quad=new THREE.PlaneGeometry(1,1),pg=new THREE.InstancedBufferGeometry();pg.index=quad.index;pg.setAttribute('position',quad.getAttribute('position'));pg.setAttribute('uv',quad.getAttribute('uv'));
  pg.setAttribute('iPos',new THREE.InstancedBufferAttribute(aPos,3).setUsage(THREE.DynamicDrawUsage));pg.setAttribute('iP',new THREE.InstancedBufferAttribute(aP,4).setUsage(THREE.DynamicDrawUsage));pg.setAttribute('iQ',new THREE.InstancedBufferAttribute(aQ,4).setUsage(THREE.DynamicDrawUsage));pg.instanceCount=0;
  const puM=new THREE.ShaderMaterial({transparent:true,depthWrite:false,
    uniforms:{uTex:{value:atT},uSunV:{value:new THREE.Vector3(0,1,0)},uUpV:{value:new THREE.Vector3(0,1,0)},uSunC:{value:C('#ffffff')},uAmbS:{value:C('#9fb0c6')},uAmbG:{value:C('#5d625f')},uFlash:{value:0},uFlashC:{value:C('#c4cdff')},uBolt:{value:new THREE.Vector4()},
      uFogCol:{value:C('#b8d2e6')},uFogNear:{value:1e5},uFogFar:{value:2e5},uHMap:{value:hmT},uHRect:{value:new THREE.Vector4(X0,Z0,GS*GC*M,GS*GR*M)},uHMin:{value:minH},uHRng:{value:Math.max(1,maxH-minH)},uEx:U.uEx,uCamR:{value:new THREE.Vector3(1,0,0)},uCamU:{value:new THREE.Vector3(0,1,0)}},
    vertexShader:`attribute vec3 iPos;attribute vec4 iP,iQ;uniform vec3 uCamR,uCamU;uniform float uEx;varying vec2 vUv;varying float vA,vS,vV,vF,vB,vX,vN;varying vec3 vW;
float ey(float y){return min(y,4500.)*uEx+max(y-4500.,0.);}
void main(){vec3 c=vec3(iPos.x,ey(iPos.y),iPos.z),w;if(iP.w>2.5){vec3 A=vec3(cos(iQ.y),0.,sin(iQ.y)),B=vec3(-sin(iQ.y),0.,cos(iQ.y));w=c+(A*position.x*iQ.x+B*position.y)*iP.x;}else w=c+(uCamR*position.x*iQ.x+uCamU*position.y)*iP.x;vW=w;vUv=uv;float dc=distance(c,cameraPosition);vA=iP.y*smoothstep(iP.x*.55,iP.x*1.5,dc);vN=1.-smoothstep(iP.x*.8,iP.x*2.2,dc);vS=iP.z;vV=iP.w;vF=iP.w>2.5?1.:iQ.y;vB=ey(iQ.z);vX=iQ.w;gl_Position=projectionMatrix*viewMatrix*vec4(w,1.);}`,
    fragmentShader:`uniform sampler2D uTex,uHMap;uniform vec3 uSunV,uUpV,uSunC,uAmbS,uAmbG,uFogCol,uFlashC;uniform vec4 uBolt,uHRect;uniform float uFlash,uFogNear,uFogFar,uHMin,uHRng,uEx;varying vec2 vUv;varying float vA,vS,vV,vF,vB,vX,vN;varying vec3 vW;
void main(){vec2 uv=vec2(vF<0.?1.-vUv.x:vUv.x,vUv.y);vec4 t=texture2D(uTex,vec2(mod(vV,2.),floor(vV/2.))*.5+uv*.5);float a=t.a*vA;
vec2 hu=(vW.xz-uHRect.xy)/uHRect.zw;float th=(texture2D(uHMap,hu).r*uHRng+uHMin)*uEx;a*=smoothstep(th,th+220.*uEx,vW.y)*smoothstep(vB-25.*uEx,vB+70.*uEx,vW.y);
vec2 ed=min(vW.xz-uHRect.xy,uHRect.xy+uHRect.zw-vW.xz);a*=smoothstep(-300.,1800.,min(ed.x,ed.y));if(a<.01)discard;
vec3 n=vec3(t.rg*2.-1.,0.);n.x*=sign(vF);n.z=sqrt(max(0.,1.-dot(n.xy,n.xy)));if(vV>2.5)n=normalize(uUpV+vec3(t.rg*2.-1.,0.)*.35);
float low=smoothstep(.05,.8,uv.y),self=mix(mix(.62,.2,vX),1.,clamp(vS*.75+low*.25,0.,1.)),ao=mix(.62,1.,t.b);
float wrap=clamp((dot(n,uSunV)+.28)/1.28,0.,1.),back=clamp(-uSunV.z,0.,1.),thin=1.-smoothstep(.12,.75,t.a);
vec3 amb=mix(uAmbG,uAmbS,clamp(dot(n,uUpV)*.5+.5,0.,1.))*ao*mix(1.-.35*vX,1.,vS);
vec3 col=amb+uSunC*(wrap*self*mix(.6,1.,ao)+pow(back,5.)*thin*1.5*self);
if(uBolt.w>0.)col+=uFlashC*uBolt.w*exp(-length(vW-uBolt.xyz)/2600.)*(.55+.45*thin);
col=mix(col,(uAmbS+uSunC)*.92,vN*.65);col+=uFlash*vec3(.3,.33,.42);col=mix(col,uFogCol,smoothstep(uFogNear,uFogFar,length(vW-cameraPosition))*.75);gl_FragColor=vec4(col,a);}`});
  const puffs=new THREE.Mesh(pg,puM);puffs.frustumCulled=false;puffs.renderOrder=5;scene.add(puffs);
  // cloud and fog layers: a lit sea of billows; peaks rise through it with soft shores
  const layerMat=k=>new THREE.ShaderMaterial({transparent:true,depthWrite:false,uniforms:{uT:U.uTime,uA:{value:0},uK:{value:k},uWind:U.uWind,uTopC:{value:C('#ffffff')},uLowC:{value:C('#d5dce2')},uFlat:{value:0},uRect:U.uRect,uEdge:U.uEdge,
      uN:{value:NZT},uHMap:{value:hmT},uHRect:puM.uniforms.uHRect,uHMin:{value:minH},uHRng:{value:Math.max(1,maxH-minH)},uEx:U.uEx,uSunW:{value:new THREE.Vector3(0,1,0)},uBolt:puM.uniforms.uBolt,uFlashC:puM.uniforms.uFlashC},
    vertexShader:`varying vec3 vW;void main(){vec4 w=modelMatrix*vec4(position,1.);vW=w.xyz;gl_Position=projectionMatrix*viewMatrix*w;}`,
    fragmentShader:`varying vec3 vW;uniform sampler2D uN,uHMap;uniform float uT,uA,uK,uFlat,uEdge,uHMin,uHRng,uEx;uniform vec2 uWind;uniform vec3 uTopC,uLowC,uSunW,uFlashC;uniform vec4 uRect,uHRect,uBolt;
void main(){vec2 eq=min(vW.xz-uRect.xy,uRect.xy+uRect.zw-vW.xz);float ee=smoothstep(0.,uEdge*1.2,min(eq.x,eq.y));
vec2 q=vW.xz*.00009+uWind*uT*.11+uK*.37;vec4 n1=texture2D(uN,q);vec2 q2=q*3.3+n1.gb*.12-uWind*uT*.05;vec4 n2=texture2D(uN,q2);float d=n1.r*.6+n2.a*.4,e=1./256.;
float dx=(texture2D(uN,q+vec2(e,0.)).r-n1.r)*.6+(texture2D(uN,q2+vec2(e,0.)).a-n2.a)*1.32,dz=(texture2D(uN,q+vec2(0.,e)).r-n1.r)*.6+(texture2D(uN,q2+vec2(0.,e)).a-n2.a)*1.32;
vec3 nn=normalize(vec3(-dx*9.,1.,-dz*9.));float lit=clamp(dot(nn,uSunW)*.6+.45,0.,1.);
vec2 hu=(vW.xz-uHRect.xy)/uHRect.zw;float th=(texture2D(uHMap,hu).r*uHRng+uHMin)*uEx;
float a=mix(smoothstep(.36+uK*.07,.62+uK*.07,d),1.,uFlat)*uA*ee*smoothstep(-40.*uEx,170.*uEx,vW.y-th+(d-.5)*220.*uEx);if(a<.01)discard;
vec3 c=mix(uLowC,uTopC,clamp(lit*.62+d*.38+(1.-uFlat)*.08,0.,1.));if(uBolt.w>0.)c+=uFlashC*uBolt.w*exp(-length(vW-uBolt.xyz)/3500.)*.5;gl_FragColor=vec4(c,a);}`});
  const layers=[0,1,2].map(k=>{const m=new THREE.Mesh(new THREE.PlaneGeometry(SX,SZ),layerMat(k));m.rotation.x=-Math.PI/2;m.renderOrder=4+k*.01;m.visible=false;m.userData.alt=0;scene.add(m);return m});
  // rain: thin streaks, brightest at the falling end; snow: flakes of many sizes that flutter as they fall
  const rainV=`attribute vec4 seed;attribute float endp;uniform vec2 uC,uSz,uDrift;uniform float uBot,uTop,uT,uFall,uLen,uEx,uRate,uSnowL,uEdge;uniform vec4 uCells[6],uRect;varying float vA,vE;
void main(){float h=fract(seed.y-uT*uFall*(.85+.3*seed.x)/(uTop-uBot));vec2 xz=uC+(fract(seed.xz+uDrift*uT/uSz)-.5)*uSz;float y=mix(uBot,uTop,h);vec2 ed=min(xz-uRect.xy,uRect.xy+uRect.zw-xz);float a=uRate*smoothstep(0.,uEdge,min(ed.x,ed.y));
for(int k=0;k<6;k++){vec4 c=uCells[k];if(c.w>0.){float d=length(xz-c.xy);a=max(a,c.w*(1.-smoothstep(c.z*.55,c.z,d))*smoothstep(0.,uEdge,min(ed.x,ed.y)));}}
a*=1.-smoothstep(uSnowL-120.,uSnowL+120.,y);vA=step(seed.w,a)*(.5+.5*seed.w)*smoothstep(0.,.06,h);vE=endp;
vec3 p=vec3(xz.x,y*uEx,xz.y);p.y+=endp*uLen;p.xz-=endp*uLen*uDrift/max(uFall*uEx,1.);gl_Position=projectionMatrix*viewMatrix*vec4(p,1.);}`;
  const snowV=`attribute vec4 seed;uniform vec2 uC,uSz,uDrift;uniform float uBot,uTop,uT,uFall,uEx,uRate,uSnowL,uSize,uPx,uEdge;uniform vec4 uCells[6],uRect;varying float vA,vB;
void main(){float h=fract(seed.y-uT*uFall*(.6+.8*seed.x)/(uTop-uBot));vec2 xz=uC+(fract(seed.xz+uDrift*uT/uSz)-.5)*uSz;float ph=seed.w*37.;xz+=vec2(sin(uT*(.5+seed.z*.9)+ph),cos(uT*(.45+seed.x*.8)+ph*1.7))*uSz*.0045;
float y=mix(uBot,uTop,h);vec2 ed=min(xz-uRect.xy,uRect.xy+uRect.zw-xz);float a=uRate*smoothstep(0.,uEdge,min(ed.x,ed.y));
for(int k=0;k<6;k++){vec4 c=uCells[k];if(c.w>0.){float d=length(xz-c.xy);a=max(a,c.w*(1.-smoothstep(c.z*.55,c.z,d))*smoothstep(0.,uEdge,min(ed.x,ed.y)));}}
a*=smoothstep(uSnowL-120.,uSnowL+120.,y);vec4 mv=viewMatrix*vec4(xz.x,y*uEx,xz.y,1.);float sz=uSize*(.45+1.1*seed.z*seed.z*seed.z)/(-mv.z);gl_PointSize=clamp(sz,1.,6.*uPx);
vA=step(seed.w,a)*(.5+.45*seed.x)*smoothstep(0.,.05,h)*clamp(sz/(2.*uPx),.35,1.);vB=clamp(sz/(7.*uPx),0.,.6);gl_Position=projectionMatrix*mv;}`;
  const precipU=()=>({uC:{value:new THREE.Vector2()},uSz:{value:new THREE.Vector2(1,1)},uDrift:{value:new THREE.Vector2()},uBot:{value:0},uTop:{value:3000},uT:{value:0},uFall:{value:1000},uLen:{value:100},uEx:U.uEx,uRate:{value:0},uSnowL:{value:9e3},uSize:{value:100},uPx:{value:1},uDim:{value:1},uRect:{value:new THREE.Vector4(X0,Z0,SX,SZ)},uEdge:U.uEdge,uCells:{value:[0,0,0,0,0,0].map(()=>new THREE.Vector4())}});
  const NR=coarse?8000:16000,rs=new Float32Array(NR*8),re=new Float32Array(NR*2);for(let k=0;k<NR;k++){const q=[Math.random(),Math.random(),Math.random(),Math.random()];rs.set(q,k*8);rs.set(q,k*8+4);re[k*2+1]=1}
  const rg=new THREE.BufferGeometry();rg.setAttribute('position',new THREE.BufferAttribute(new Float32Array(NR*6),3));rg.setAttribute('seed',new THREE.BufferAttribute(rs,4));rg.setAttribute('endp',new THREE.BufferAttribute(re,1));
  const rainM=new THREE.ShaderMaterial({transparent:true,depthWrite:false,uniforms:{...precipU(),uRC:{value:C('#c8d1dc')}},vertexShader:rainV,fragmentShader:`uniform float uDim;uniform vec3 uRC;varying float vA,vE;void main(){if(vA<.01)discard;gl_FragColor=vec4(uRC*uDim,vA*.4*(1.-vE));}`});
  const rain=new THREE.LineSegments(rg,rainM);rain.frustumCulled=false;rain.renderOrder=4.5;rain.visible=false;scene.add(rain);
  const NS=coarse?6000:12000,ss=new Float32Array(NS*4);for(let k=0;k<NS*4;k++)ss[k]=Math.random();
  const sg=new THREE.BufferGeometry();sg.setAttribute('position',new THREE.BufferAttribute(new Float32Array(NS*3),3));sg.setAttribute('seed',new THREE.BufferAttribute(ss,4));
  const snowM=new THREE.ShaderMaterial({transparent:true,depthWrite:false,uniforms:precipU(),vertexShader:snowV,fragmentShader:`uniform float uDim;varying float vA,vB;void main(){float r=length(gl_PointCoord-.5)*2.;if(r>1.||vA<.01)discard;gl_FragColor=vec4(vec3(.92,.94,.97)*uDim,vA*.85*(1.-smoothstep(mix(.35,0.,vB),1.,r)));}`});
  const snow=new THREE.Points(sg,snowM);snow.frustumCulled=false;snow.renderOrder=4.5;snow.visible=false;scene.add(snow);
  // rain shafts under storm cells: streaky grey curtains, blown downwind at the bottom
  const shafts=[0,1,2,3,4,5].map(()=>{const m=new THREE.Mesh(new THREE.CylinderGeometry(1,1.3,1,32,1,true),new THREE.ShaderMaterial({transparent:true,depthWrite:false,side:THREE.DoubleSide,uniforms:{uT:U.uTime,uA:{value:0},uSh:{value:new THREE.Vector2()},uC:{value:C('#6b7480')}},
    vertexShader:`uniform vec2 uSh;varying vec2 vU;varying vec3 vN;varying vec3 vV;varying float vNear;void main(){vU=uv;vec4 w=modelMatrix*vec4(position,1.);w.xz+=uSh*(1.-uv.y);vN=normalize(mat3(modelMatrix)*normal);vV=normalize(cameraPosition-w.xyz);float r=length(modelMatrix[0].xyz);vNear=smoothstep(r*1.1,r*2.6,length(cameraPosition.xz-modelMatrix[3].xz));gl_Position=projectionMatrix*viewMatrix*w;}`,
    fragmentShader:`${NOISE}varying vec2 vU;varying vec3 vN;varying vec3 vV;varying float vNear;uniform float uT,uA;uniform vec3 uC;void main(){float e=abs(dot(normalize(vN.xz),normalize(vV.xz)));float s=wn(vec2(vU.x*38.,vU.y*2.5+uT*1.6))*.65+wn(vec2(vU.x*9.,vU.y*.8-uT*.3))*.35;float a=uA*smoothstep(.15,.85,e)*(.2+.8*s)*smoothstep(0.,.45,vU.y)*smoothstep(1.,.8,vU.y);gl_FragColor=vec4(uC,a*vNear);}`}));m.renderOrder=4.6;m.visible=false;scene.add(m);return m});
  // lightning: a thin bright channel with branches, a soft glow along it, and the light it throws on the cloud and the ground
  const boltG=new THREE.LineSegmentsGeometry(),boltM=new THREE.LineMaterial({vertexColors:true,linewidth:2,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending});LM.push(boltM);
  const bolt=new THREE.LineSegments2(boltG,boltM);bolt.visible=false;bolt.renderOrder=8;bolt.frustumCulled=false;scene.add(bolt);
  const GLN=700,glP=new Float32Array(GLN*3),glW=new Float32Array(GLN),glG=new THREE.BufferGeometry();glG.setAttribute('position',new THREE.BufferAttribute(glP,3).setUsage(THREE.DynamicDrawUsage));glG.setAttribute('w',new THREE.BufferAttribute(glW,1).setUsage(THREE.DynamicDrawUsage));glG.setDrawRange(0,0);
  const glM=new THREE.ShaderMaterial({transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,uniforms:{uI:{value:0},uPx:{value:1}},
    vertexShader:`attribute float w;uniform float uPx;varying float vW;void main(){vW=w;gl_PointSize=(5.+11.*w)*uPx;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
    fragmentShader:`uniform float uI;varying float vW;void main(){float r=length(gl_PointCoord-.5)*2.;gl_FragColor=vec4(vec3(.55,.62,1.)*exp(-r*r*6.)*uI*vW*.07,1.);}`});
  const glow=new THREE.Points(glG,glM);glow.visible=false;glow.renderOrder=7.9;glow.frustumCulled=false;scene.add(glow);
  const flashEl=$('#flash');let nextStrike=0,nextIC=0,flash=0,baseHemi=.82,BS=null,IC=null,flashK=1;const WSUN=new THREE.Vector3(0,1,0);
  const NW=coarse?380:800,TL=8,wP=[],wpos=new Float32Array(NW*(TL-1)*6),wcol=new Float32Array(NW*(TL-1)*8);
  const wgeo=new THREE.BufferGeometry();wgeo.setAttribute('position',new THREE.BufferAttribute(wpos,3).setUsage(THREE.DynamicDrawUsage));wgeo.setAttribute('color',new THREE.BufferAttribute(wcol,4).setUsage(THREE.DynamicDrawUsage));
  const wl=new THREE.LineSegments(wgeo,new THREE.LineBasicMaterial({vertexColors:true,transparent:true,depthWrite:false}));wl.frustumCulled=false;wl.renderOrder=7;wl.visible=false;scene.add(wl);
  for(let k=0;k<NW;k++)wP.push({x:0,z:0,h:0,age:1e9,life:1,acc:0,tr:new Float32Array(TL*3)});
  // cumulus sites over the higher ground
  const SITES=[];{const r=rng(7),thr=minH+(maxH-minH)*.45;let n=0;while(SITES.length<85&&n++<40000){const px=r()*W,py=r()*H,h=TER.at(px,py);if(h<thr)continue;SITES.push({x:wx(px),z:wz(py),s:.6+.8*r(),k:r(),seed:(r()*1e9)|0})}}
  // a puff: position, size, opacity, light from above (0 base to 1 top), sprite, width/height, mirrored, cloud base, thickness (0 fair-weather cumulus to 1 storm cloud)
  const puff=(x,y,z,s,a,sh,v,asp,fl,base,ext)=>{if(PN>=MAXP)return;const q=PN*PS;PB[q]=x;PB[q+1]=y;PB[q+2]=z;PB[q+3]=s;PB[q+4]=a;PB[q+5]=sh;PB[q+6]=v;PB[q+7]=asp;PB[q+8]=fl;PB[q+9]=base;PB[q+10]=ext;PN++};
  const blob=(x,z,r,a)=>{const cx=(x-X0)/SX*csC.width,cy=(z-Z0)/SZ*csC.height,cr=r/SX*csC.width;if(cr<.5||a<=0)return;const g=csX.createRadialGradient(cx,cy,0,cx,cy,cr);g.addColorStop(0,`rgba(255,255,255,${Math.min(1,a)})`);g.addColorStop(1,'rgba(255,255,255,0)');csX.fillStyle=g;csX.beginPath();csX.arc(cx,cy,cr,0,7);csX.fill()};
  const cellTop=c=>{const zb=Math.max(minH+900,GW.cuBase()-500);return{zb,top:zb+1100+(9600-zb-1100)*sst(.1,1,c.age)}};
  function buildClouds(st,sn){
    PN=0;const so=sn.y>.06,sx=so?-sn.x/sn.y:0,sz=so?-sn.z/sn.y:0,fl=r=>r()<.5?-1:1;csX.fillStyle='#000';csX.fillRect(0,0,csC.width,csC.height);
    if(st.cu&&st.cu.cover>.005){const cov=st.cu.cover;
      for(const s of SITES){const g=Math.min(1,Math.max(0,(cov*2-s.k)/.25));if(g<=0)continue;
        const r=rng(s.seed),Rk=(650+950*s.s)*(.45+.55*g),dep=Math.max(250,st.cu.depth*(.4+.6*g)*(.7+.3*s.s)),base=st.cu.base+(r()-.5)*240,ext=Math.min(1,dep/2600)*.6,al=.92*(.45+.55*g);
        // a few wide puffs standing on the flat base, then narrower billows piled up to the top
        const nb=1+(g*s.s>.75?1:0),nt=Math.min(3,Math.round(dep/Rk*.9*g));
        const sf=(u,q)=>q/Rk*(Math.cos(u)*sn.x+Math.sin(u)*.8*sn.z)/Math.max(.2,Math.hypot(sn.x,sn.z));
        for(let k=0;k<nb;k++){const u=r()*6.283,q=Math.sqrt(r())*Rk*.35*k,ps=Rk*(1.55+.35*r())*(1-.2*k);puff(s.x+Math.cos(u)*q,base+ps*.36,s.z+Math.sin(u)*q*.8,ps,al,Math.max(0,.3+.15*r()+.35*sf(u,q)),k&1,1,fl(r),base,ext)}
        for(let k=0;k<nt;k++){const hf=(k+1)/nt,u=r()*6.283,q=Math.sqrt(r())*Rk*.3*(1-.5*hf),ps=Rk*(1.15+.25*r())*(1-.4*hf);puff(s.x+Math.cos(u)*q,base+ps*.4+hf*Math.max(0,dep-ps*.55),s.z+Math.sin(u)*q*.8,ps,al,Math.min(1,Math.max(0,.42+.55*hf+.35*sf(u,q))),hf>.6?2:k&1,1,fl(r),base,ext)}
        if(so)blob(s.x+sx*(base-GREF),s.z+sz*(base-GREF),Rk*.95,.7*g)}}
    let si=0;
    if(st.cells)for(const c of st.cells){const vis=sst(-.25,.25,c.age)*(1-sst(3.2,4.4,c.age));if(vis<=0)continue;const r=rng(c.seed),cx=wx(c.x),cz=wz(c.y),Rc=c.R*1.1,{zb,top}=cellTop(c),sa=Math.atan2(sn.z,sn.x);
      // a dark, flat base; the tower, narrower and brighter higher up; the dome that overshoots the top
      for(let k=0;k<8;k++){const u=r()*6.283,q=Math.sqrt(r())*Rc*.8,ps=Rc*(.7+.3*r());puff(cx+Math.cos(u)*q,zb+ps*.34,cz+Math.sin(u)*q,ps,.95*vis,.04+.06*r(),k&1,1,fl(r),zb,1)}
      const nC=Math.round(18+28*Math.max(c.I,.3));
      for(let k=0;k<nC;k++){const hf=Math.pow((k+.5)/nC,.85),u=r()*6.283,rad=Rc*(.05+.36*Math.sqrt(r()))*(1-.3*hf),ps=Rc*(.66+.3*r())*(1-.3*hf);
        puff(cx+Math.cos(u)*rad,zb+ps*.35+(top-zb-ps*.55)*hf,cz+Math.sin(u)*rad,ps,.96*vis,Math.min(1,Math.max(.04,.2+.45*hf+.5*Math.cos(u-sa)*Math.min(1,rad/(Rc*.35)))),hf>.7?2:k&1,1,fl(r),zb,1)}
      for(let k=0;k<3;k++){const u=r()*6.283,ps=Rc*(.35+.15*r());puff(cx+Math.cos(u)*Rc*.12,top-ps*.1,cz+Math.sin(u)*Rc*.12,ps,.95*vis,.97,2,1,fl(r),zb,.8)}
      // the anvil: a flat, fibrous sheet spreading downwind at the top
      if(c.age>.85){const sp=sst(.85,2.6,c.age),Ra=Rc*(1+1.7*sp),nA=Math.round(6+20*sp);
        for(let k=0;k<nA;k++){const u=r()*6.283,q=Math.sqrt(r()),a=Math.cos(u)*q*Ra*1.5+Ra*.5,b=Math.sin(u)*q*Ra,dx=(a-b)*Math.SQRT1_2,dz=-(a+b)*Math.SQRT1_2;
          puff(cx+dx,top-250+r()*350-q*250,cz+dz,Rc*(.8+.45*r()),.8*vis*(1-sst(2.8,4,c.age)),.85+.12*r(),3,2+1.2*r(),-.785+(r()-.5)*.9,zb,.5)}
        if(so)blob(cx+Ra*.4*Math.SQRT1_2+sx*(top-GREF),cz-Ra*.4*Math.SQRT1_2+sz*(top-GREF),Ra*1.1,.35*sp*vis)}
      if(so)blob(cx+sx*(zb-GREF),cz+sz*(zb-GREF),Rc*1.3,.95*vis*Math.max(.3,c.I));
      if(si<shafts.length){const m=shafts[si++];m.visible=c.Ir>.04&&cx>X0+1500&&cx<X0+SX-1500&&cz>Z0+1500&&cz<Z0+SZ-1500;m.material.uniforms.uA.value=.85*c.Ir;m.userData={x:cx,z:cz,r:Rc*.6,bot:minH-50,top:zb+80}}}
    for(;si<shafts.length;si++)shafts[si].visible=false;
    csT.needsUpdate=true;dirty=true}
  const placeY=()=>{layers.forEach(l=>l.position.y=l.userData.alt*S.ex);shafts.forEach(m=>{const d=m.userData;if(!d.r)return;m.position.set(d.x,(d.bot+d.top)/2*S.ex,d.z);m.scale.set(d.r,(d.top-d.bot)*S.ex,d.r)})};
  const SK={zen:C('#3b77c3'),hor:C('#b8d2e6'),gzen:C('#8e979e'),ghor:C('#c1c8cd'),szen:C('#3d4650'),shor:C('#7d8891'),nzen:C('#081120'),nhor:C('#1a2740'),fzen:C('#1d56ab'),fhor:C('#a2c5e9'),gold:C('#f0a35f')},WHITE=C('#ffffff');
  const zen=C(0),hor=C(0),gnd=C(0);let curT=-99,curKey='',curSt={},curI=0,plainOn=null,lastSun=new THREE.Vector3(),PRC=[],PRrate=0,PRtop=3000,PRsl=9e3,PRdir=new THREE.Vector2(),PRon=false,lastNow=0,dimF=1,trailW=null;
  const camF=new THREE.Vector3(),lastCam=new THREE.Matrix4();
  function apply(force){
    const i=S.i>=0?S.i:0,t=S.i>=0?CLK[S.i]:(S.wx==='storm'?15:S.wx==='sea'?8.5:12),k=S.wx+S.mon+(S.wx==='fc'?'|'+FCP[i]+'|'+R.day[i]:'');if(!force&&k===curKey&&Math.abs(t-curT)<1/120)return;curT=t;curKey=k;curI=i;
    const pill=$('#wpill');
    if(S.wx==='plain'){if(plainOn!==true){plainOn=true;sky.visible=true;sun.castShadow=true;
        [puffs,rain,snow,wl,bolt,glow,...layers,...shafts].forEach(m=>m.visible=false);BS=IC=null;U.uSnowAmt.value=U.uWet.value=U.uFogAmt.value=U.uDeckAmt.value=U.uDeckShade.value=U.uCSAmt.value=U.uPrK.value=U.uBoltG.value.w=0;puM.uniforms.uBolt.value.w=0;flashEl.style.opacity=0;PRon=false;
        const su=skyM.uniforms;su.uZen.value.copy(SK.zen);su.uHor.value.copy(SK.hor);su.uGnd.value.copy(SK.hor).lerp(WHITE,.12);su.uSun.value.copy(PLAIN);su.uSunCol.value.setRGB(1,.95,.86);su.uSunAmt.value=.55;
        const tg=new THREE.Vector3(0,GREF*S.ex,0);sun.target.position.copy(tg);sun.position.copy(tg).addScaledVector(PLAIN,DIAG+60000);sun.intensity=.92;sun.color.setRGB(1,.97,.92);
        hemi.intensity=baseHemi=.52;hemi.color.copy(SK.zen).lerp(WHITE,.7);hemi.groundColor.set(0x5a665e);lastSun.set(0,0,0);fitShadow()}
      pill.hidden=true;curSt={};return}
    if(plainOn!==false){plainOn=false;sky.visible=true;sun.castShadow=true;puffs.visible=true;lastSun.set(0,0,0)}
    const st=stAt(i,t),sn=sunAt(t,R.day[i]);curSt=st;
    pill.hidden=false;pill.textContent=S.wx==='fc'?`Forecast · ${fmtDate(isoDay(dayDate(R.day[i])))} · ${fmtClock(t)}`:`${SCN[S.wx].name} · ${MONN[S.mon]} · ${fmtClock(t)}`;
    const day=sst(-.1,.1,sn.y),gold=sst(-.1,.02,sn.y)*(1-sst(.05,.35,sn.y)),direct=st.sunAmt*sst(-.02,.14,sn.y);dimF=.35+.65*day;
    const sv=new THREE.Vector3(sn.x,Math.max(sn.y,.02),sn.z).normalize(),tg=new THREE.Vector3(0,GREF*S.ex,0);
    sun.target.position.copy(tg);sun.position.copy(tg).addScaledVector(sv,DIAG+60000);sun.intensity=.95*direct;sun.color.setRGB(1,1-.22*gold,1-.45*gold);
    if(!lastSun.lengthSq()||sv.angleTo(lastSun)>.004){lastSun.copy(sv);fitShadow()}
    if(st.over){zen.copy(SK.gzen);hor.copy(SK.ghor)}else if(st.windVis>.9){zen.copy(SK.fzen);hor.copy(SK.fhor)}else{zen.copy(SK.zen);hor.copy(SK.hor)}
    hor.lerp(SK.ghor,(st.haze||0)*.3);if(st.dark){zen.lerp(SK.szen,st.dark);hor.lerp(SK.shor,st.dark)}
    gnd.copy(hor).lerp(SK.nhor,1-day).lerp(WHITE,.1*day);hor.lerp(SK.gold,gold*.28*Math.min(1,st.sunAmt*1.5));zen.lerp(SK.nzen,1-day);hor.lerp(SK.nhor,1-day);
    const su=skyM.uniforms;su.uZen.value.copy(zen);su.uHor.value.copy(hor);su.uGnd.value.copy(gnd);su.uSun.value.copy(sv);su.uSunCol.value.setRGB(1,.92-.25*gold,.78-.35*gold);su.uSunAmt.value=st.over?0:direct;
    fogO.color.copy(hor);
    baseHemi=(.24+.28*day+.4*day*(1-Math.min(1,st.sunAmt)))*(1-.3*(st.dark||0));hemi.intensity=baseHemi;hemi.color.copy(zen).lerp(WHITE,.7);hemi.groundColor.set(0x5a665e).multiplyScalar(.5+.5*day);
    U.uSnowAmt.value=st.snow?1:0;U.uSnowLine.value=st.snow||9e3;
    U.uWet.value=st.wetAll||(S.wx==='fc'&&st.rain>.3)?1:st.drizzle?.6:0;
    U.uFogAmt.value=st.fog?Math.min(1,st.fog.amt*1.2):0;U.uFogTop.value=st.fog?st.fog.top:-1e3;U.uFogCol.value.setRGB(.97,.98,.99).multiplyScalar(dimF);
    U.uDeckAmt.value=st.deck?(st.over?.74:.88):0;U.uDeckBase.value=st.deck?st.deck.base:9e3;U.uDeckTop.value=st.deck?st.deck.top:9e3;U.uDeckShade.value=st.deckShade?.85:0;
    U.uCloudCol.value.set(st.over?'#c2c8cd':'#e2e6e9').multiplyScalar(dimF);
    // clouds, rain and snow drift with the wind above the hills; the wind's trails follow the terrain-aware wind
    let wdir,wspd;const b0=WF?windBase(R.day[i]||1,t):null;if(b0){wspd=Math.hypot(b0.u,b0.v);wdir=(Math.atan2(-b0.u,-b0.v)*180/Math.PI+360)%360}else if(S.wx==='fc'&&st.f){wdir=st.f.wd||0;wspd=st.f.ws||0}else{const wv=SCN[S.wx==='fc'?'plain':S.wx].wind(GW.hmax*.8,t);wdir=wv.dir;wspd=wv.v}
    trailW=WF?(x,z,agl)=>windAt(x/M+W/2,z/M+H/2,R.day[curI]||1,curT,agl):null;
    const wb=(wdir+180)*Math.PI/180;U.uWind.value.set(Math.sin(wb),-Math.cos(wb)).multiplyScalar(.004*(.3+wspd/40));
    flashK=Math.min(1.25,.35+.8*(1-day)+.35*(st.dark||0));const pu=puM.uniforms,dk=st.dark||0,cdir=sst(-.02,.14,sn.y)*(1-.3*dk)*(st.over?.25:1);WSUN.copy(sv);pu.uSunC.value.setRGB(1,.97-.14*gold,.92-.3*gold).multiplyScalar(.95*cdir);
    pu.uAmbS.value.copy(zen).lerp(WHITE,.5).multiplyScalar((.26+.36*day)*(1-.25*dk)*(st.over?1.2:1));pu.uAmbG.value.setRGB(.4,.42,.41).multiplyScalar((.24+.36*day)*(1-.25*dk)*(st.over?1.2:1));
    buildClouds(st,sn);U.uCSAmt.value=(st.cu||st.cells)?(st.cells?.9:.8)*direct:0;
    layers.forEach(l=>{l.visible=false;l.material.uniforms.uSunW.value.copy(sv)});
    if(st.fog&&st.fog.amt>.02){layers.forEach((l,k)=>{l.visible=true;l.userData.alt=st.fog.top-110+k*55;const u=l.material.uniforms;u.uA.value=(k===0?.96:k===1?.8:.55)*Math.min(1,st.fog.amt*1.3);u.uFlat.value=k===0?1:0;u.uTopC.value.setRGB(1,1,1).multiplyScalar(dimF);u.uLowC.value.setRGB(.64,.7,.76).multiplyScalar(dimF)})}
    else if(st.deck&&st.deckShade){layers.forEach((l,k)=>{l.visible=true;l.userData.alt=st.deck.top-90+k*60;const u=l.material.uniforms;u.uA.value=[.42,.34,.27][k];u.uFlat.value=0;u.uTopC.value.setRGB(1,1,1).multiplyScalar(dimF);u.uLowC.value.setRGB(.8,.84,.88).multiplyScalar(dimF)})}
    placeY();
    PRrate=st.rain?Math.min(1,.2+st.rain/6):st.drizzle?.14:0;PRC=(st.cells||[]).filter(c=>c.Ir>.03).map(c=>new THREE.Vector4(wx(c.x),wz(c.y),c.R*1.05,Math.min(1,c.Ir*1.1)));
    PRtop=st.deck?Math.min(st.deck.base+1300,GW.hmax+1500):st.cells?Math.max(minH+900,GW.cuBase()-400):GW.hmax+300;PRsl=st.sl;PRon=PRrate>0||PRC.length>0;
    PRdir.set(Math.sin(wb),-Math.cos(wb)).multiplyScalar(Math.min(1,wspd/45));
    rain.visible=PRon&&PRsl>minH+200;snow.visible=PRon&&PRsl<PRtop;
    U.uPrK.value=PRrate>0?2.2e-5+4e-5*PRrate:0;U.uPrTop.value=PRtop;U.uPrSL.value=PRsl;U.uPrCol.value.setRGB(.6,.64,.69).multiplyScalar(dimF);rainM.uniforms.uRC.value.setRGB(.72,.76,.82);
    shafts.forEach(m=>{m.material.uniforms.uSh.value.copy(PRdir).multiplyScalar(1800);m.material.uniforms.uC.value.setRGB(.44,.48,.55).multiplyScalar(dimF)});
    wl.visible=!!st.windVis}
  const ey=y=>Math.min(y,4500)*S.ex+Math.max(y-4500,0);
  function sortPuffs(){const cp=camera.position;for(let k=0;k<PN;k++){const q=k*PS;key[k]=(PB[q]-cp.x)*camF.x+(ey(PB[q+1])-cp.y)*camF.y+(PB[q+2]-cp.z)*camF.z}
    const ord=Array.from({length:PN},(_,k)=>k).sort((a,b)=>key[b]-key[a]);
    for(let j=0;j<PN;j++){const q=ord[j]*PS;aPos.set(PB.subarray(q,q+3),j*3);aP.set(PB.subarray(q+3,q+7),j*4);aQ.set(PB.subarray(q+7,q+11),j*4)}
    pg.attributes.iPos.needsUpdate=true;pg.attributes.iP.needsUpdate=true;pg.attributes.iQ.needsUpdate=true;pg.instanceCount=PN;dirty=false}
  // a strike: a jagged channel from the cloud base to the ground with a few forks; it flickers in one to four return strokes, only the first one lighting the forks
  const jag=(A,B,lev,rough)=>{let s=[A,B];for(let l=0;l<lev;l++){const nx=[];for(let k=0;k<s.length-1;k++){const P=s[k],Q=s[k+1],L=Math.hypot(Q[0]-P[0],Q[1]-P[1],Q[2]-P[2]),o=L*rough;
    nx.push(P,[(P[0]+Q[0])/2+(Math.random()-.5)*o,(P[1]+Q[1])/2+(Math.random()-.5)*o*.3,(P[2]+Q[2])/2+(Math.random()-.5)*o])}nx.push(s[s.length-1]);s=nx}return s};
  function strike(now){const lit=(curSt.cells||[]).filter(c=>c.lit);if(!lit.length)return;const c=lit[Math.floor(Math.random()*lit.length)];
    const cx=wx(c.x),cz=wz(c.y),a=Math.random()*6.283,q=Math.sqrt(Math.random())*c.R*.75,gx=cx+Math.cos(a)*q,gz=cz+Math.sin(a)*q,{zb}=cellTop(c),gy=tAt(gx,gz);
    const main=jag([cx+(Math.random()-.5)*c.R*.4,zb+80,cz+(Math.random()-.5)*c.R*.4],[gx,gy,gz],7,.24),pos=[],col=[];
    const seg=(pts,b)=>{for(let k=0;k<pts.length-1;k++){const P=pts[k],Q=pts[k+1];pos.push(P[0],P[1]*S.ex,P[2],Q[0],Q[1]*S.ex,Q[2]);col.push(b,b,b,b,b,b)}};
    seg(main,1);const nMain=main.length-1,nb=2+Math.floor(Math.random()*4);
    for(let k=0;k<nb;k++){const P=main[Math.floor(main.length*(.06+.6*Math.random()))],L=(P[1]-gy)*(.2+.4*Math.random()),u=Math.random()*6.283,br=jag(P,[P[0]+Math.cos(u)*L*.7,P[1]-L,P[2]+Math.sin(u)*L*.7],5,.32);seg(br,.35+.25*Math.random());
      if(Math.random()<.5){const P2=br[Math.floor(br.length*(.3+.4*Math.random()))],u2=u+(Math.random()-.5)*1.6,L2=L*.4;seg(jag(P2,[P2[0]+Math.cos(u2)*L2*.7,P2[1]-L2,P2[2]+Math.sin(u2)*L2*.7],4,.32),.22)}}
    boltG.setPositions(pos);boltG.setColors(col);
    let n=0;for(let k=0;k<pos.length&&n<GLN;k+=6){if((col[k]<.5||k%18)&&k%36)continue;glP[n*3]=pos[k];glP[n*3+1]=pos[k+1];glP[n*3+2]=pos[k+2];glW[n]=col[k];n++}
    glG.setDrawRange(0,n);glG.attributes.position.needsUpdate=true;glG.attributes.w.needsUpdate=true;
    const ns=1+Math.floor(Math.random()*3.3),strokes=[];let t=now;for(let k=0;k<ns;k++){strokes.push({t,d:35+Math.random()*45,a:k?.55+.45*Math.random():1});t+=55+Math.random()*95}
    BS={strokes,end:t+260,nMain,nAll:pos.length/6,g:[gx,gy*S.ex,gz],c:[cx,(zb+500)*S.ex,cz]};bolt.visible=glow.visible=true}
  // a flash inside the cloud, with no channel to see: it lights the cloud from within
  function icFlash(now){const cs=(curSt.cells||[]).filter(c=>c.I>.45);if(!cs.length)return;const c=cs[Math.floor(Math.random()*cs.length)],{zb,top}=cellTop(c),u=Math.random()*6.283,q=Math.random()*c.R*.7,y=zb+(top-zb)*(.12+.45*Math.random());
    IC={t:now,d:90+Math.random()*260,a:.45+.55*Math.random(),ph:Math.random()*6,p:[wx(c.x)+Math.cos(u)*q,ey(y),wz(c.y)+Math.sin(u)*q]}}
  function windFrame(dt){if(!wl.visible||!trailW)return;const Dc=camera.position.distanceTo(controls.target),sz=Math.min(Math.max(Dc*1.2,3000),60000),cx=controls.target.x,cz=controls.target.z,k0=curSt.windVis||0;
    let o=0,c=0;const bx0=Math.max(X0,cx-sz/2),bx1=Math.min(X0+SX,cx+sz/2),bz0=Math.max(Z0,cz-sz/2),bz1=Math.min(Z0+SZ,cz+sz/2);
    for(const p of wP){if(p.age>p.life||p.x<bx0||p.x>bx1||p.z<bz0||p.z>bz1){p.x=bx0+Math.random()*Math.max(1,bx1-bx0);p.z=bz0+Math.random()*Math.max(1,bz1-bz0);p.h=60+Math.random()*700;p.age=0;p.life=1.5+Math.random()*2.5;p.acc=0;const y=(tAt(p.x,p.z)+p.h)*S.ex;for(let j=0;j<TL;j++){p.tr[j*3]=p.x;p.tr[j*3+1]=y;p.tr[j*3+2]=p.z}}
      p.age+=dt;const w=trailW(p.x,p.z,p.h),sp=Dc*.0012*k0;p.x+=w.e*sp*dt;p.z-=w.n*sp*dt;const y=(tAt(p.x,p.z)+p.h)*S.ex;
      p.acc+=dt;if(p.acc>.08){p.acc=0;p.tr.copyWithin(3,0,(TL-1)*3)}p.tr[0]=p.x;p.tr[1]=y;p.tr[2]=p.z;
      const fade=Math.min(1,p.age*3,(p.life-p.age)*3)*Math.min(1,w.v/35)*.85*(PRon?.35:1)*dimF;
      for(let j=0;j<TL-1;j++){wpos[o]=p.tr[j*3];wpos[o+1]=p.tr[j*3+1];wpos[o+2]=p.tr[j*3+2];wpos[o+3]=p.tr[j*3+3];wpos[o+4]=p.tr[j*3+4];wpos[o+5]=p.tr[j*3+5];o+=6;
        const a1=fade*(1-j/(TL-1)),a2=fade*(1-(j+1)/(TL-1));wcol[c]=wcol[c+1]=wcol[c+2]=1;wcol[c+3]=a1;wcol[c+4]=wcol[c+5]=wcol[c+6]=1;wcol[c+7]=a2;c+=8}}
    wgeo.attributes.position.needsUpdate=true;wgeo.attributes.color.needsUpdate=true}
  function frame(now){const dt=Math.min(.05,(now-(lastNow||now))/1000);lastNow=now;U.uTime.value=now/1000;U.uEx.value=S.ex;
    camera.updateMatrixWorld();sky.position.copy(camera.position);U.uCamP.value.copy(camera.position);
    const Dc=camera.position.distanceTo(controls.target),Df=o.fogD?o.fogD():Dc,cl=plainOn?.92:(curSt.clar??.8);U.uHazeK.value=(.12+.5*(1-cl))/Math.max(Df,7000);
    if(plainOn)return;
    fogO.near=Df*.9;fogO.far=Df*(1.6+6*cl);
    const e=camera.matrixWorld.elements;puM.uniforms.uCamR.value.set(e[0],e[1],e[2]);puM.uniforms.uCamU.value.set(e[4],e[5],e[6]);camF.set(-e[8],-e[9],-e[10]);
    puM.uniforms.uSunV.value.copy(WSUN).transformDirection(camera.matrixWorldInverse);puM.uniforms.uUpV.value.set(0,1,0).transformDirection(camera.matrixWorldInverse);glM.uniforms.uPx.value=renderer.getPixelRatio();
    puM.uniforms.uFogNear.value=fogO.near*1.25;puM.uniforms.uFogFar.value=fogO.far;puM.uniforms.uFogCol.value.copy(fogO.color);
    if(PN&&(dirty||!lastCam.equals(camera.matrixWorld))){sortPuffs();lastCam.copy(camera.matrixWorld)}else if(!PN)pg.instanceCount=0;
    if(PRon){const sz=Math.min(Math.max(Dc*1.15,2500),70000),k=renderer.domElement.height/(2*Math.tan(THREE.MathUtils.degToRad(camera.fov/2)));
      for(const m of[rainM,snowM]){const u=m.uniforms;u.uC.value.set(controls.target.x,controls.target.z);u.uSz.value.set(sz,sz);u.uBot.value=minH-100;u.uTop.value=PRtop;u.uT.value=now/1000;u.uRate.value=PRrate;u.uSnowL.value=PRsl;u.uDim.value=dimF;for(let j=0;j<6;j++)u.uCells.value[j].copy(PRC[j]||Z4)}
      rainM.uniforms.uFall.value=(PRtop-minH)*.85;rainM.uniforms.uLen.value=Dc*.009;rainM.uniforms.uDrift.value.copy(PRdir).multiplyScalar(Dc*.03);
      snowM.uniforms.uFall.value=(PRtop-minH)*.1;snowM.uniforms.uDrift.value.copy(PRdir).multiplyScalar(Dc*.012);snowM.uniforms.uSize.value=Dc*.003*k;snowM.uniforms.uPx.value=renderer.getPixelRatio()}
    const lit=curSt.cells&&curSt.cells.some(c=>c.lit);
    if(lit&&now>nextStrike){strike(now);nextStrike=now+1200+Math.random()*4800}
    if(curSt.cells&&curSt.cells.some(c=>c.lit||c.I>.6)&&now>nextIC){icFlash(now);nextIC=now+600+Math.random()*2400}
    let bI=0,cI=0,cP=null;
    if(BS){if(now>BS.end){BS=null;bolt.visible=glow.visible=false}else{for(const s of BS.strokes){const e=now-s.t;if(e>=0)bI=Math.max(bI,e<s.d?s.a*(1-.3*e/s.d):s.a*.28*Math.exp(-(e-s.d)/45))}
      const f0=BS.strokes[0];boltG.instanceCount=now<f0.t+f0.d+60?BS.nAll:BS.nMain;boltM.opacity=Math.min(1,bI*1.4);glM.uniforms.uI.value=bI;cI=bI;cP=BS.c}}
    if(IC){const e=now-IC.t;if(e>IC.d)IC=null;else{const f=IC.a*(.5+.5*Math.sin(e*.08+IC.ph))*Math.min(1,e/25);if(f>cI){cI=f;cP=IC.p}}}
    const pu=puM.uniforms;if(cI>.01)pu.uBolt.value.set(cP[0],cP[1],cP[2],cI*1.5*flashK);else pu.uBolt.value.w=0;
    if(BS&&bI>.01)U.uBoltG.value.set(BS.g[0],BS.g[1],BS.g[2],bI*flashK);else U.uBoltG.value.w=0;
    flash=Math.max(flash*Math.exp(-dt*9),bI*.75*flashK,cI*.3*flashK);hemi.intensity=baseHemi+flash*.16;skyM.uniforms.uFlash.value=flash*.12;pu.uFlash.value=flash*.3;flashEl.style.opacity=(flash*.035).toFixed(3);
    windFrame(dt)}
  // for tests: a strike now, held at full brightness when asked
  const testStrike=hold=>{const now=performance.now();strike(now);nextStrike=now+(hold?1e9:5000);if(BS&&hold){BS.strokes=[{t:now,d:1e9,a:1}];BS.end=now+1e9}return!!BS};
  return{time(force){apply(force)},frame,ex(){U.uEx.value=S.ex;placeY();dirty=true;fitShadow()},U,prep,testStrike}}

HP.viewer={open,close,current:()=>D,refresh:()=>{if(R)renderBrief()},backCheck:()=>fetchBack(true),
  back:()=>R&&CLK?{loop:isLoop(),pick:HP.backPick(D.back,CLK[N-1]),walk:backWalk().map(({n,from,to,km,up,dn,h,arr,top})=>({n,from,to,km,up,dn,h,arr,top})),key:backKey(),run:BACKRUN}:null,
  // what the live guide needs: the route, the days, the places, the planned times, the map pictures and the trail check
  state:()=>R&&WALK?{D,R,N,DAYS,PTS,WALK,CLK,BLOBS,S,F:safety(),T:trailOK()?D.trail:null,cc:trailOK()?D.trail.cc||[]:[],sos:sosList(trailOK()?D.trail.cc:[]),TURN}:null,
  show:i=>{if(!R)return;i=Math.max(0,Math.min(N-1,i|0));if(S.day&&R.day[i]!==S.day)selectDay(R.day[i],false);setIndex(i);if(V3&&V3.focus)V3.focus(i)},recheck:()=>runTrail(true),safety:()=>{if(!R)return null;const F=safety();return{lvl:F.lvl,items:F.items.map(x=>({lvl:x.lvl,k:x.k,i0:x.i0,i1:x.i1,what:x.what.replace(/<[^>]+>/g,''),where:whereOf(x).replace(/<[^>]+>/g,''),why:String(x.why||'').replace(/<[^>]+>/g,''),near:nearName(x.i0),day:R.day[x.i0],km:+kmIn(x.i0).toFixed(1)})),top:F.top.map(x=>x.k),marks:F.marks.length,junc:F.junc.length,hard:F.hard,mapped:+F.mapped.toFixed(3),marked:+F.marked.toFixed(3),official:F.official==null?null:+F.official.toFixed(3),checked:!!F.T}},updateForecast:()=>updateForecast(true),detail:k=>{try{return detail(k)}catch(e){console.error(e);return null}},
  look:(k,jump)=>{if(V3)V3.look(k,jump)},
  pack:(k,on)=>{if(!D)return;D.packed=D.packed||{};if(on)D.packed[k]=1;else delete D.packed[k];save()}};
})();
