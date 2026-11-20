'use strict';
/* Hike Planner 3D: the 3D viewer, weather simulation, forecast, briefing, profile and day table for one hike */
(function(){
const {$,$$,nf,fmtH,fmtClock,esc,sst,parseDay,isoDay,fmtDate}=HP.u;
const DAYC=['#f76707','#7048e8','#1c7ed6','#0ca678','#e64980','#f59f00','#4263eb','#ae3ec9','#2b8a3e','#c92a2a'];
const SACC={0:'#868e96',1:'#37b24d',2:'#f2b705',3:'#fd7e14',4:'#e03131',5:'#862e9c'};
const SACN={0:'No grade (road, track or unmarked path)',1:'T1 hiking',2:'T2 mountain hiking',3:'T3 demanding, hands at times',4:'T4 alpine, exposed, chains',5:'T5 demanding alpine'};
// steepness of the path in degrees, measured over about 200 m of the route
const STC={1:'#37b24d',2:'#f2b705',3:'#fd7e14',4:'#e03131',5:'#862e9c'},STN={1:'Gentle, under 5°',2:'Moderate, 5–10°',3:'Steep, 10–15°',4:'Very steep, 15–20°',5:'Extreme, over 20°'};
const MONN=['','January','February','March','April','May','June','July','August','September','October','November','December'];
const reduce=matchMedia('(prefers-reduced-motion: reduce)').matches;
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
function cond(i,t){
  const z=R.e[i],px=R.x[i],py=R.y[i],ex=EXPO?EXPO[i]:1,st=stAt(i,t),nz=(vnoise(px*.004,py*.004)-.5)*200;
  let T,v,g,dir,inC=false,fog=false,pr=0,thd=null,wet=!!st.wetAll,hail=false;
  if(S.wx==='fc'&&st.f){const f=st.f;T=f.T+(f.z-z)*.0065;v=(f.ws||0)*ex;g=Math.max(f.wg||0,v*1.3)*ex;dir=f.wd||0;pr=f.pr>.05?f.pr:0;
    if(f.code>=95)thd=1500;if(f.code===96||f.code===99)hail=true}
  else{const sc=SCN[S.wx==='fc'?'plain':S.wx],w=sc.wind(z,t);T=sc.T(z,t);v=w.v*ex;g=w.g*ex;dir=w.dir}
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
function trailWord(c){return c.trail==='wet'?'Path wet: rock, roots and wooden steps get slippery':c.trail==='snow'?'<span class="warn">Snow on the path</span>':c.trail==='icy'?'<span class="bad">Icy snow on the path</span>':''}

/* ---------- open and close ---------- */
function close(){if(AC){AC.abort();AC=null}ROs.forEach(r=>r.disconnect());ROs=[];if(V3&&V3.dispose)V3.dispose();V3=null;window.V3=null;WXC.clear();tzCache.clear()}
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
  setupGeo();resetDays();
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
  $('#play').textContent='Walk day 1 ▶';$('#profsub').textContent='Whole trip. Tap a day to zoom in; move along the profile to move the marker on the map.';$('#hint').style.opacity='';
  refreshTimes();
  const ro=new ResizeObserver(()=>drawProfile());ro.observe($('#prof'));ROs.push(ro);
  setupProfile(sig);
  $('#msg').hidden=false;$('#msg').textContent='Building the 3D view…';
  try{init3D(sig)}catch(err){$('#msg').hidden=false;$('#msg').textContent='The 3D view needs WebGL, which this browser could not start. The briefing, profile and table below still work.';console.error(err)}
  const fw=HP.forecastWindow(D.date);if(fw.ok&&navigator.onLine&&(!D.fc||!D.ens||Date.now()-D.fc.issued>3*3600e3))updateForecast(false);
  if(navigator.onLine&&D.clim&&!D.clim.cls)refreshClimate();
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
    return`<button class="wchip${k==='fc'?' fc':''}" data-wx="${k}" aria-pressed="${k===S.wx}" aria-disabled="${dis}" title="${esc(ttl)}"><svg viewBox="0 0 24 24" aria-hidden="true">${ICON[s.icon]}</svg>${s.name}${p}</button>`}).join('');
  $('#monlab').hidden=S.wx==='fc';$('#fcbtn').hidden=!fw.ok}
let fcBusy=false;
async function updateForecast(manual){const fw=HP.forecastWindow(D.date);if(!fw.ok){if(manual)HP.toast(fw.days>15?'The forecast appears 16 days before your start date.':'This date has passed.');return}
  if(fcBusy)return;fcBusy=true;
  const b=$('#fcbtn');b.disabled=true;b.textContent='Updating…';
  try{const plan=D,[fr,er]=await Promise.allSettled([HP.fetchForecast(plan),HP.fetchEnsemble(plan)]);if(plan!==D)return;if(er.status==='fulfilled'&&er.value){D.ens=er.value;LKC.clear()}if(fr.status!=='fulfilled')throw fr.reason;const fc=fr.value;D.fc=fc;D.tz=D.tz||fc.tz;const fx=fc.pts.map(p=>p.i);FCP=new Uint8Array(N);for(let i=0;i<N;i++){let bi=0,bd=1e9;fx.forEach((j,k)=>{const dd=Math.abs(R.d[j]-R.d[i]);if(dd<bd){bd=dd;bi=k}});FCP[i]=bi}
    if(manual||S.wx==='fair')S.wx='fc';WXC.clear();renderWxChips();refreshTimes();save();if(manual)HP.toast('Forecast updated')}
  catch(e){if(manual)HP.toast('Could not update the forecast: '+e.message)}finally{fcBusy=false;b.disabled=false;b.textContent='Update forecast'}}
function resetDays(){DAYS=D.days;overnight={};const DC=HP.look?HP.look.routeColors():DAYC;DAYS.forEach((d,k)=>{d.color=DC[k%DC.length];if(k<DAYS.length-1)overnight[d.i1]=d.n});if(S.day>DAYS.length)S.day=0;
  $('#chips').innerHTML=`<button class="chip" data-day="0" aria-pressed="${!S.day}">All days</button>`+DAYS.map(d=>`<button class="chip" data-day="${d.n}" style="--c:${d.color}" aria-pressed="${S.day===d.n}"><i></i>Day ${d.n} <small>${esc(d.from)} → ${esc(d.to)}</small></button>`).join('');
  $('#ndays').value=String(DAYS.length);if(V3&&V3.relabel)V3.relabel()}
function moveNight(i){if(DAYS.length<2||i<0)return;const ends=DAYS.slice(0,-1).map(d=>d.i1);let k=0,bd=1e9;ends.forEach((e,j)=>{const dd=Math.abs(e-i);if(dd<bd){bd=dd;k=j}});
  const lo=k?ends[k-1]+30:30,hi=k<ends.length-1?ends[k+1]-30:N-31;ends[k]=Math.max(lo,Math.min(hi,i));HP.splitDays(D,DAYS.length,ends);resetDays();refreshTimes();if(V3)V3.dayChanged(false);save();HP.toast(`Night ${k+1} moved`)}

const topWx=d=>{const L=HP.wxDay(D,d.n-1);if(!L||!L.pct)return'';const k=HP.WXK.reduce((a,b)=>L.pct[b]>L.pct[a]?b:a);return`<span class="tw"><i style="--c:${HP.WXT[k].c}"></i>${HP.WXT[k].name} ${L.pct[k]}%</span>`};
function refreshTimes(){
  computeTimes();
  const km=R.d[N-1],up=DAYS.reduce((s,d)=>s+d.up,0),hrs=DAYS.reduce((s,d)=>s+WALK[d.i1],0);
  $('#figs').innerHTML=`<li><b>${DAYS.length}</b>day${DAYS.length>1?'s':''}</li><li><b>${km.toFixed(km<20?1:0)}</b>km</li><li><b>${nf.format(Math.round(up/10)*10)}</b>m of climbing</li><li><b>${fmtH(hrs).replace(' 00','')}</b>walking</li>`;
  const hi=d=>{let m=d.max;PTS.forEach(p=>{if(R.day[p.i]===d.n&&OFFICIAL[p.name])m=Math.max(m,OFFICIAL[p.name])});return m};
  let tk=0,tu=0,td=0,th=0;
  $('#tbl tbody').innerHTML=DAYS.map(d=>{const w=WALK[d.i1],x=w-BASEW[d.i1];tk+=d.km;tu+=d.up;td+=d.down;th+=w;
    return `<tr><td data-l="Day"><span class="dot" style="--c:${d.color}"></span>Day ${d.n}${S.wx==='fc'?` <small class="mute">${fmtDate(isoDay(dayDate(d.n)))}</small>`:''}</td><td data-l="Route">${esc(d.from)} → ${esc(d.to)}</td><td class="n" data-l="Distance">${d.km.toFixed(1)} km</td><td class="n" data-l="Climb">${nf.format(d.up)} m</td><td class="n" data-l="Descent">${nf.format(d.down)} m</td><td class="n" data-l="Highest">${nf.format(hi(d))} m</td><td class="n" data-l="Walking">${fmtH(w)}${w>8?'<span class="long">long</span>':''}${x>4/60?`<br><small class="mute">+${fmtH(x)} for the weather</small>`:''}</td><td class="n" data-l="Arrive">${fmtClock(CLK[d.i1])}</td><td data-l="Likely weather">${topWx(d)}</td></tr>`}).join('')+
    (DAYS.length>1?`<tr class="tot"><td data-l="">Total</td><td></td><td class="n" data-l="Distance">${tk.toFixed(1)} km</td><td class="n" data-l="Climb">${nf.format(tu)} m</td><td class="n" data-l="Descent">${nf.format(td)} m</td><td class="n"></td><td class="n" data-l="Walking">${fmtH(th)}</td><td class="n"></td><td></td></tr>`:'');
  $('#vsrc').textContent=`Temperatures: ${D.clim.src}${D.clim.z?`, worked out for ${nf.format(D.clim.z[0])}–${nf.format(D.clim.z[1])} m`:''}.${D.fc?` Forecast: Open-Meteo, issued ${new Date(D.fc.issued).toLocaleString('en-GB',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'})}.`:''}`;
  updateReadout();drawProfile();renderBrief();if(V3)V3.times();
}
function selectDay(n,fly){
  S.day=n;$$('.chip').forEach(b=>b.setAttribute('aria-pressed',String(+b.dataset.day===n)));
  $('#profsub').textContent=n?`Day ${n}: ${DAYS[n-1].from} → ${DAYS[n-1].to}. Distances count from the day's start.`:'Whole trip. Tap a day to zoom in; move along the profile to move the marker on the map.';
  $('#play').textContent=`Walk day ${n||1} ▶`;
  drawProfile();renderBrief();renderWxChips();if(V3)V3.dayChanged(fly);
  if(n&&(S.i<0||R.day[S.i]!==n))setIndex(DAYS[n-1].i0)}
function setIndex(i){S.i=i;updateReadout();updateCursor();if(V3)V3.mark()}
function updateReadout(){
  const el=$('#readout');if(S.i<0||!R){el.innerHTML=`<strong>${matchMedia('(hover: none)').matches?'Tap the route line or drag along the profile':'Hover the route line or the profile'}</strong><span class="mute">You'll see the day, the height, your walking time so far, roughly what time you get there and the weather at that moment.</span>`;return}
  const i=S.i,d=dayOf(i),km=R.d[i]-R.d[d.i0],at=PTS.find(p=>Math.abs(p.i-i)<=3),nx=PTS.find(p=>p.i>i+3&&R.day[p.i]===d.n&&p.kind!=='high'),ele=Math.round(R.e[i]),c=cond(i,CLK[i]),plain=S.wx==='plain';
  TAGT=plain?'':` · ${tt(c.T)}`;const gust=c.g>c.v*1.25?`, gusts ${Math.round(c.g/5)*5}`:'',tw=plain?'':trailWord(c);
  const sd=Math.round(SLOPE[i]),slope=sd<1?'flat here':`${sd}° ${R.e[Math.min(N-1,i+5)]>=R.e[Math.max(0,i-5)]?'uphill':'downhill'} here`;
  const grade=D.sacKnown?`<i style="--c:${SACC[R.sac[i]]}"></i>${SACN[R.sac[i]]}, ${slope}`:`<i style="--c:${STC[STEEP[i]]}"></i>${STN[STEEP[i]].split(',')[0]}: ${slope}`;
  const night=DAYS.length>1&&!overnight[i]?`<button class="mini" data-night>Move the nearest night here</button>`:'';
  el.innerHTML=`<strong>Day ${d.n} · ${esc(d.from)} → ${esc(d.to)}</strong>`+(at?`<div>${at.kind==='start'?'Start':at.kind==='end'?'Finish':'At'} <b>${esc(at.name)}</b>${OFFICIAL[at.name]?` (${nf.format(OFFICIAL[at.name])} m on the map)`:''}</div>`:'')+
   `<div class="big">${nf.format(ele)} m · ${km.toFixed(1)} km into the day</div><div>${fmtH(walk(i))} walking → about <b>${fmtClock(clock(i))}</b>${S.wx==='fc'?` <span class="mute">${fmtDate(isoDay(dayDate(d.n)))}</span>`:''}</div>`+
   (nx?`<div class="mute">Next: ${esc(nx.name)} in ${fmtH(walk(nx.i)-walk(i))}</div>`:`<div class="mute">End of the day</div>`)+`<div class="mute grade">${grade}</div>`+
   (plain?`<div class="wxr"><span class="t">${tt(c.T)}</span> <span class="mute">on an average ${MONN[S.mon]} day</span></div>`:
   `<div class="wxr"><span class="t">${tt(c.T)}</span>${c.feels<c.T-1.5?` <span class="mute">feels like ${tt(c.feels)}</span>`:''} · wind ${Math.round(c.v)} km/h${gust} from the ${DIRS[Math.round(c.dir/45)%8]}<div>${skyWord(c,i,CLK[i])}</div>${tw?`<div>${tw}</div>`:''}</div>`)+night}

/* ---------- briefing ---------- */
function placeName(i){const d=dayOf(i);let best=null,bd=1.2;for(const p of PTS){if(p.kind==='high')continue;if(R.day[p.i]!==d.n&&p.i!==d.i0-1)continue;const dd=Math.abs(R.d[p.i]-R.d[i]);if(dd<bd){bd=dd;best=p}}return best?best.name:`km ${(R.d[i]-R.d[d.i0]).toFixed(1)}`}
function stormOnset(d){if(S.wx==='fc'){for(let i=d.i0;i<=d.i1;i+=4){const c=cond(i,CLK[i]);if(c.thd!=null&&c.thd<8000)return CLK[i]}return 99}
  let on=99;for(const c of CELLS){const t=c.t0+.75,q=cellAt(c,t);for(let i=d.i0;i<=d.i1;i+=15){if(Math.hypot(R.x[i]-q.x,R.y[i]-q.y)*MPP<12000){on=Math.min(on,t);break}}}return on}
function dayBrief(d){
  const plain=S.wx==='plain';let cold=null,hot=null,gust=null,cloudKm=0,wetKm=0,snowKm=0,th=null,nofc=0;
  for(let i=d.i0;i<=d.i1;i++){const c=cond(i,CLK[i]),seg=i<d.i1?R.d[i+1]-R.d[i]:0;if(c.st.nofc)nofc++;
    if(!cold||c.feels<cold.f)cold={f:c.feels,T:c.T,i};if(!hot||c.T>hot.T)hot={T:c.T,i};if(!gust||c.g>gust.g)gust={g:c.g,i};
    if(c.inC)cloudKm+=seg;if(c.trail==='wet')wetKm+=seg;if(c.trail==='snow'||c.trail==='icy')snowKm+=seg;if(c.thd!=null&&c.thd<8000&&(!th||c.thd<th.d-2000))th={i,d:c.thd}}
  const passes=PTS.filter(p=>R.day[p.i]===d.n&&p.kind==='pass').map(p=>p.name),pl=passes.join(' and ')||'';
  const L=[],hz=(k,t)=>L.push(`<div class="hz ${k}"><span>${t}</span></div>`),x=WALK[d.i1]-BASEW[d.i1];
  if(S.wx==='fc'&&nofc>(d.i1-d.i0)/2)hz('info',`No forecast for ${fmtDate(isoDay(dayDate(d.n)))} yet; the numbers below use an average day.`);
  hz('info',`Start ${fmtClock(CLK[d.i0])}, arrive about <b>${fmtClock(CLK[d.i1])}</b> · ${fmtH(WALK[d.i1])} walking${x>4/60?` (${fmtH(x)} more than in dry weather)`:''}.`);
  hz('info',`Warmest ${tt(hot.T)} at ${esc(placeName(hot.i))} (${fmtClock(CLK[hot.i])}); coldest ${tt(cold.T)}${cold.f<cold.T-1.5?`, feels like ${tt(cold.f)} in the wind,`:''} at ${esc(placeName(cold.i))} (${fmtClock(CLK[cold.i])}).`);
  if(!plain){
    const on=S.wx==='storm'||S.wx==='fc'?stormOnset(d):99;
    if(on<30){let iex=-1;for(let i=d.i0;i<=d.i1;i++)if(highNear(i))iex=i;const arr=CLK[d.i1];
      if(iex>=0){const tEx=CLK[iex];if(tEx>on-.5){const rec=Math.floor((startH()-(tEx-(on-.75)))*4)/4;hz('bad',`You'd still be on high ground at ${esc(placeName(iex))} around ${fmtClock(tEx)}, when storms ${S.wx==='fc'?'are forecast':'usually start'} (from about ${fmtClock(on)}). ${rec>=4.5?`Start by <b>${fmtClock(rec)}</b> to be over it in time.`:'Even a very early start does not get you over it in time: shorten the day or wait for a stable forecast.'}`)}else hz('ok',`Over the high ground by ${fmtClock(tEx)}, ahead of the storms (from about ${fmtClock(on)}).`)}
      if(arr>on-.25&&!(iex>=0&&CLK[iex]>on-.5)){const rec=Math.floor((startH()-(arr-(on-.5)))*4)/4;hz('warn',`You'd arrive at ${esc(d.to)} around ${fmtClock(arr)}, just as storms start nearby. ${rec>=4.5?`Start by <b>${fmtClock(rec)}</b> to be in before them.`:'Shorten the day or wait for a stable forecast.'}`)}
      if(th)hz(th.d<3000?'bad':'warn',`Lightning ${th.d<1500?'overhead':`about ${Math.round(th.d/1000)} km away`} near ${esc(placeName(th.i))} around ${fmtClock(CLK[th.i])}. Get off ridges, summits and fixed cables.`)}
    if(snowKm>.2)hz('bad',`Snow or ice on about ${snowKm.toFixed(1)} km of path${pl?`, including ${esc(pl)}`:''}. Steep or exposed sections are not beginner terrain like this: wait for it to melt, or choose a lower route.`);
    else if(wetKm>.5)hz('warn',`Wet path for about ${wetKm.toFixed(1)} km${pl?`; rock and steps on ${esc(pl)} get slippery`:''}. Poles help.`);
    if(cloudKm>.3)hz('warn',`In cloud for about ${cloudKm.toFixed(1)} km: 50–100 m visibility. Follow the waymarks from one to the next and keep the route on your phone.`);
    if(gust.g>60)hz(gust.g>85?'bad':'warn',`Gusts around ${Math.round(gust.g/5)*5} km/h at ${esc(placeName(gust.i))}: hard to keep your balance on exposed sections.`);
    if(cold.f<2)hz('warn',`Feels like ${tt(cold.f)} at ${esc(placeName(cold.i))}: hat and gloves.`);
    if(hot.T>26)hz('warn',`${tt(hot.T)} at ${esc(placeName(hot.i))} around ${fmtClock(CLK[hot.i])}: carry at least 2 litres and start early.`);
    if(S.wx==='sea'){const c0=cond(d.i0,CLK[d.i0]);if(c0.fog)hz('ok',`You start in the fog at ${esc(placeName(d.i0))} (${tt(c0.T)}) and climb out into sunshine above about ${nf.format(Math.round(c0.st.fog.top/50)*50)} m.`)}
    if(L.length<=2)hz('ok',S.wx==='fair'?'Good conditions. Afternoon cumulus over the high ground is normal; pack the waterproof anyway.':'No particular weather problems on this day.')}
  const wq=(D.water||[]).filter(i=>i>=d.i0&&i<=d.i1).map(i=>R.d[i]-R.d[d.i0]).filter((v,k,a)=>!k||v-a[k-1]>.5);
  hz('info',wq.length?`Water marked on OpenStreetMap near the path at ${wq.slice(0,8).map(v=>'km '+v.toFixed(1)).join(', ')}${wq.length>8?'…':''}. Check that springs run before relying on them.`:'No springs or taps are marked on OpenStreetMap along this day: carry all your water.');
  const f=cold.f,wetD=S.wx!=='storm'&&wetKm>.5,snowD=snowKm>.2&&S.wx==='snow',ex=[];
  const wear=snowD?'merino long sleeve and fleece, waterproof over them in the wind, waterproof trousers or gaiters for the snow':wetD?'merino long sleeve under the waterproof jacket, rain trousers':f>=12?'T-shirt':f>=5?'T-shirt or merino long sleeve; fleece on at the high points and on breaks':f>=0?'merino long sleeve; fleece and waterproof on the high ground':'merino long sleeve and fleece, waterproof over them in the wind';
  if(!wetD&&!snowD)ex.push(f>=12?'a fleece for breaks, waterproof jacket':'waterproof jacket');if(S.wx==='storm'||(S.wx==='fc'&&th))ex.push('rain trousers at the top of the pack');if(f<5)ex.push('hat and gloves');if(f<0)ex.push('a warm jacket for stops');if(wetD)ex.push('a pack liner and dry spare layers');if(hot.T>24)ex.push('2 litres or more of water and a sun hat');
  return `<div class="bday" style="--c:${d.color}"><h3>Day ${d.n} · ${esc(d.from)} → ${esc(d.to)}${S.wx==='fc'?` <span class="mute">${fmtDate(isoDay(dayDate(d.n)))}</span>`:''}</h3>${dayLikely(d)}${L.join('')}<div class="kit"><b>Walk in:</b> ${wear}. <b>Carry:</b> ${ex.join(', ')}.</div></div>`}
const pbar=(pc,lbl)=>{const ks=HP.WXK.filter(k=>pc[k]>0).sort((a,b)=>pc[b]-pc[a]);return`<div class="pbar" role="img" aria-label="${esc(lbl+': '+ks.map(k=>HP.WXT[k].name+' '+pc[k]+'%').join(', '))}">${ks.map(k=>`<i style="--c:${HP.WXT[k].c};flex:${pc[k]} 1 0"></i>`).join('')}</div>`};
const hikeDay=n=>{const d=parseDay(D.date);d.setDate(d.getDate()+n-1);return isoDay(d)};
function likelyHTML(){const L=likely(),one=!!S.day||DAYS.length===1,when=S.day?fmtDate(hikeDay(S.day),{weekday:'long',day:'numeric',month:'long'}):DAYS.length>1?`average of your ${DAYS.length} days`:fmtDate(D.date,{weekday:'long',day:'numeric',month:'long'});
  if(!L||!L.pct)return`<div class="likely"><h3>Likely weather</h3><p class="src">Not known yet: the weather records for this place could not be downloaded. Open the hike with a connection to try again.</p></div>`;
  const pc=L.pct,ks=HP.WXK.filter(k=>pc[k]>0).sort((a,b)=>pc[b]-pc[a]),src=L.src,yrs=D.clim&&D.clim.years?`${D.clim.years[0]} to ${D.clim.years[1]}`:'recent years';
  const iss=D.ens?new Date(D.ens.issued).toLocaleString('en-GB',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}):'';
  const t=src==='ens'?`From the ${D.ens.members} runs of the ECMWF forecast model, issued ${iss}: each type's share of the runs is its chance.`:
    src==='mix'?`The first days come from the ${D.ens.members} runs of the ECMWF forecast model (issued ${iss}); the later days from how often each type happened here, ${yrs}.`:
    `How often each type happened here from ${yrs} (ERA5 weather records), 15 days either side of ${one?'this date':'these dates'}. Not a forecast: the real forecast appears 16 days before the start.`;
  return`<div class="likely"><h3>Likely weather <small>${esc(when)}</small></h3>${pbar(pc,'Likely weather')}<ul class="plist">${ks.map(k=>`<li><i style="--c:${HP.WXT[k].c}"></i><span>${HP.WXT[k].name}</span><b>${pc[k]}%</b></li>`).join('')}</ul><p class="src">${t} Valley fog has no percentage: these data are too coarse to tell a foggy valley from the sunny ridge above it.</p></div>`}
const dayLikely=d=>{const L=HP.wxDay(D,d.n-1);if(!L||!L.pct)return'';const ks=HP.WXK.filter(k=>L.pct[k]>0).sort((a,b)=>L.pct[b]-L.pct[a]);
  return`<div class="dlikely">${pbar(L.pct,'Likely weather on day '+d.n)}<p>${L.src==='ens'?'Forecast runs':'Usually at this time of year'}: ${ks.map(k=>`${HP.WXT[k].name} ${L.pct[k]}%`).join(', ')}</p></div>`};
function renderBrief(){if(!R)return;const sc=SCN[S.wx],m=MONN[S.mon];
  $('#brief').innerHTML=`<div>${likelyHTML()}<h2>${S.wx==='plain'?`An average ${m} day`:S.wx==='fc'?'Forecast':sc.name} <small>${S.wx==='fc'?esc(fmtDate(D.date,{day:'numeric',month:'long'})):m}</small></h2><p>${DESC[S.wx](m)}</p><p class="mute">${S.wx==='fc'?'Switch to a weather type to see how the same days would go in other conditions.':`These are typical patterns for ${m}, not a forecast. Change the start time to see how it moves the day against the weather.`}</p></div><div>${(S.day?[DAYS[S.day-1]]:DAYS).map(dayBrief).join('')}</div>`}

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
  DAYS.forEach(d=>{const i0=Math.max(a,d.i0),i1=Math.min(b,d.i1);if(i0>=i1)return;
    let q='';for(let i=i0;i<i1;i+=step)q+=(q?'L':'M')+X(R.d[i]).toFixed(1)+','+Y(R.e[i]).toFixed(1);q+='L'+X(R.d[i1]).toFixed(1)+','+Y(R.e[i1]).toFixed(1);
    s+=`<path d="${q}L${X(R.d[i1]).toFixed(1)},${Y(lo)}L${X(R.d[i0]).toFixed(1)},${Y(lo)}Z" fill="${d.color}" fill-opacity=".2" style="cursor:${S.day?'crosshair':'pointer'}"/><path d="${q}" fill="none" stroke="${d.color}" stroke-width="2.2" pointer-events="none"/>`;
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
  prof.addEventListener('pointermove',e=>{if(PX&&!(V3&&V3.playing()))setIndex(at(e))},sig);
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
  const pos=new Float32Array(GC*GR*3),uv=new Float32Array(GC*GR*2);let minH=1e9,maxH=-1e9;
  for(let r=0;r<GR;r++)for(let c=0;c<GC;c++){const k=r*GC+c,px=c*GS+.5,py=r*GS+.5;pos[k*3]=wx(px);pos[k*3+1]=ht[k];pos[k*3+2]=wz(py);uv[k*2]=px/W;uv[k*2+1]=1-py/H;if(ht[k]<minH)minH=ht[k];if(ht[k]>maxH)maxH=ht[k]}
  const idx=new Uint32Array((GC-1)*(GR-1)*6);let n=0;
  for(let r=0;r<GR-1;r++)for(let c=0;c<GC-1;c++){const a=r*GC+c,b=a+1,d=a+GC,e=d+1;idx[n++]=a;idx[n++]=d;idx[n++]=b;idx[n++]=b;idx[n++]=d;idx[n++]=e}
  const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.BufferAttribute(pos,3));geo.setAttribute('uv',new THREE.BufferAttribute(uv,2));geo.setIndex(new THREE.BufferAttribute(idx,1));geo.computeVertexNormals();
  const mat=new THREE.MeshLambertMaterial({color:0xd9ddd6});const terr=new THREE.Mesh(geo,mat);group.add(terr);
  const base=minH-Math.max(250,(maxH-minH)*.12),wall=[],edge=ks=>{for(let k=0;k<ks.length-1;k++){const A=ks[k]*3,B=ks[k+1]*3;wall.push(pos[A],pos[A+1],pos[A+2],pos[A],base,pos[A+2],pos[B],pos[B+1],pos[B+2],pos[B],pos[B+1],pos[B+2],pos[A],base,pos[A+2],pos[B],base,pos[B+2])}};
  const row=r=>Array.from({length:GC},(_,c)=>r*GC+c),col=c=>Array.from({length:GR},(_,r)=>r*GC+c);
  edge(row(0));edge(row(GR-1));edge(col(0));edge(col(GC-1));
  const wg=new THREE.BufferGeometry();wg.setAttribute('position',new THREE.Float32BufferAttribute(wall,3));wg.computeVertexNormals();
  group.add(new THREE.Mesh(wg,new THREE.MeshLambertMaterial({color:0x2c4a3f,side:THREE.DoubleSide})));
  const tex={},loadTex=name=>tex[name]||(tex[name]=(BLOBS[name]?Promise.resolve(BLOBS[name]):Promise.reject(Error('no '+name))).then(b=>new Promise((ok,no)=>{const im=new Image(),url=URL.createObjectURL(b);im.onload=()=>{URL.revokeObjectURL(url);ok(im)};im.onerror=e=>{URL.revokeObjectURL(url);no(e)};im.src=url})).then(im=>{const t=new THREE.Texture(im);t.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());t.needsUpdate=true;return t}));
  const applyMap=()=>loadTex(S.map).then(t=>{mat.map=t;mat.color.set(0xffffff);mat.needsUpdate=true}).catch(()=>{if(S.map!=='relief'){S.map='relief';syncTools();applyMap()}});
  const rp=new Float32Array(N*3);for(let i=0;i<N;i++){rp[i*3]=wx(R.x[i]);rp[i*3+1]=Math.max(R.e[i],TER.at(R.x[i],R.y[i]))+14;rp[i*3+2]=wz(R.y[i])}
  const lg=new THREE.LineGeometry();lg.setPositions(rp);
  const lineMat=new THREE.LineMaterial({vertexColors:true,linewidth:4.5,transparent:true}),caseMat=new THREE.LineMaterial({color:0xffffff,linewidth:8,transparent:true}),ghostMat=new THREE.LineMaterial({vertexColors:true,linewidth:2.5,transparent:true,opacity:.4,depthTest:false});
  const LM=[lineMat,caseMat,ghostMat];
  const lines=[new THREE.Line2(lg,caseMat),new THREE.Line2(lg,lineMat),new THREE.Line2(lg,ghostMat)];lines.forEach((l,k)=>{l.renderOrder=20+k;group.add(l)});
  const modes=D.sacKnown?['day','sac','steep']:['day','steep'];if(!modes.includes(S.color))S.color='day';
  $('#colorseg').innerHTML='<span>Line</span>'+modes.map(m=>`<button data-color="${m}">${m==='day'?'Days':m==='sac'?'Difficulty':'Steepness'}</button>`).join('');
  $('#mapseg').innerHTML='<span>Map</span>'+(BLOBS.topo?'<button data-map="topo">Topo</button>':'')+'<button data-map="relief">Relief</button>';
  const recolor=()=>{const c=new Float32Array(N*3),cl=new THREE.Color(),gray=new THREE.Color(0xa7aea9);
    for(let i=0;i<N;i++){cl.set(S.color==='day'?DAYS[R.day[i]-1].color:S.color==='sac'?SACC[R.sac[i]]:STC[STEEP[i]]);if(S.day&&R.day[i]!==S.day)cl.lerp(gray,.78);c[i*3]=cl.r;c[i*3+1]=cl.g;c[i*3+2]=cl.b}
    lg.setColors(c);
    $('#legend').innerHTML=S.color==='day'?(DAYS.length>1?DAYS.map(d=>`<span><i style="--c:${d.color}"></i>Day ${d.n}</span>`).join(''):''):S.color==='sac'?[1,2,3,4,0].map(k=>{const t=SACN[k].split(' (')[0].split(',')[0];return`<span><i style="--c:${SACC[k]}"></i><span>${k?`${t.slice(0,2)}<em>${t.slice(2)}</em>`:t}</span></span>`}).join(''):[1,2,3,4,5].map(k=>{const[a,b]=STN[k].split(', ');return`<span><i style="--c:${STC[k]}"></i><span><em>${a}, </em>${b}</span></span>`}).join('');$('#legend').hidden=!$('#legend').innerHTML;$('#legend').dataset.mode=S.color};
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
  Object.assign(controls,{enableDamping:true,dampingFactor:.08,screenSpacePanning:false,maxPolarAngle:1.45,minDistance:400,maxDistance:250000});
  const LMV=(D.landmarks||[]).slice(0,4).map(m=>({x:wx(m.x),z:wz(m.y),y:m.e}));
  // overview direction: from the side of the route's main axis, looking roughly north
  let mx=0,mz=0;for(let i=0;i<N;i+=4){mx+=rp[i*3];mz+=rp[i*3+2]}const cnt=Math.ceil(N/4);mx/=cnt;mz/=cnt;let sxx=0,szz=0,sxz=0;for(let i=0;i<N;i+=4){const dx=rp[i*3]-mx,dz=rp[i*3+2]-mz;sxx+=dx*dx;szz+=dz*dz;sxz+=dx*dz}
  const ang=.5*Math.atan2(2*sxz,sxx-szz);let pvx=-Math.sin(ang),pvz=Math.cos(ang);if(pvz<0){pvx=-pvx;pvz=-pvz}const VIEW=[pvx,.75,pvz],SPAN=Math.sqrt((sxx+szz)/cnt)*3;
  const frame=(i0,i1,extra=[])=>{
    // wide screens look across the route; tall phone screens look along it, from behind the start, so it runs up the screen
    const port=camera.aspect<1;let gx,gz,up;
    if(port){let ax=rp[i1*3]-rp[i0*3],az=rp[i1*3+2]-rp[i0*3+2];const L=Math.hypot(ax,az);
      if(L<SPAN*.35){ax=Math.cos(ang);az=Math.sin(ang);if(az<0){ax=-ax;az=-az}gx=ax;gz=az}else{gx=-ax/L;gz=-az/L}up=1.07/.62}
    else{let vw=VIEW;if(i0!==0||i1!==N-1){let px=-(rp[i1*3+2]-rp[i0*3+2]),pz=rp[i1*3]-rp[i0*3];if(pz<0){px=-px;pz=-pz}const L=Math.hypot(px,pz)||1;vw=[px/L,.65,pz/L]}const hz=Math.hypot(vw[0],vw[2])||1;gx=vw[0]/hz;gz=vw[2]/hz;up=vw[1]/hz}
    const ux=gz,uz=-gx;let u0=1e9,u1=-1e9,w0=1e9,w1=-1e9,y0=1e9,y1=-1e9,ys=0,cnt=0;
    const add=(x,z)=>{const u=x*ux+z*uz,w=x*gx+z*gz;u0=Math.min(u0,u);u1=Math.max(u1,u);w0=Math.min(w0,w);w1=Math.max(w1,w)};
    for(let i=i0;i<=i1;i+=2){add(rp[i*3],rp[i*3+2]);const y=rp[i*3+1];ys+=y;cnt++;y0=Math.min(y0,y);y1=Math.max(y1,y)}
    extra.forEach(q=>add(q.x,q.z));
    const cu=(u0+u1)/2,cw=(w0+w1)/2,target=new THREE.Vector3(cu*ux+cw*gx,ys/cnt*.85*S.ex,cu*uz+cw*gz);
    const dir=new THREE.Vector3(gx,up,gz).normalize(),el=Math.asin(dir.y),tv=Math.tan(THREE.MathUtils.degToRad(camera.fov/2)),th=tv*camera.aspect;
    const wide=Math.max(u1-u0,2000)*(port?1.3:1.14),deep=Math.max(w1-w0,1200)*Math.sin(el)+(y1-y0)*S.ex*Math.cos(el);
    const dist=Math.max(wide/2/th,deep*1.15/2/tv)+1500;
    return{target,pos:target.clone().add(dir.multiplyScalar(dist))}};
  let fly=null;
  const flyTo=f=>{if(reduce){camera.position.copy(f.pos);controls.target.copy(f.target);return}fly={t0:performance.now(),p0:camera.position.clone(),q0:controls.target.clone(),f}};
  const frameDay=()=>S.day?frame(DAYS[S.day-1].i0,DAYS[S.day-1].i1):frame(0,N-1);
  let touched=false,framedPort=null;
  const resize=()=>{const w=stage.clientWidth,h=stage.clientHeight;if(!w||!h)return;renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();LM.forEach(m=>m.resolution.set(w,h));
    if(framedPort!==null&&(w<h)!==framedPort&&!fly){framedPort=w<h;const f=frameDay();if(touched)flyTo(f);else{camera.position.copy(f.pos);controls.target.copy(f.target)}}};
  resize();const ro=new ResizeObserver(resize);ro.observe(stage);ROs.push(ro);
  const f0=frameDay();camera.position.copy(f0.pos);controls.target.copy(f0.target);controls.update();framedPort=camera.aspect<1;
  const WXV=initWX3D({scene,renderer,camera,controls,mat,terr,sun,hemi,W,H,M,minH,maxH,LM,stage});resize();
  const v=new THREE.Vector3();let down=null,playing=null,raf=0;
  const pick=(e,tol)=>{const r=cv.getBoundingClientRect(),mx=e.clientX-r.left,my=e.clientY-r.top,[a,b]=S.day?[DAYS[S.day-1].i0,DAYS[S.day-1].i1]:[0,N-1];let best=-1,bd=tol*tol;
    for(let i=a;i<=b;i++){v.set(rp[i*3],rp[i*3+1]*S.ex,rp[i*3+2]).project(camera);if(v.z>1)continue;const dx=(v.x+1)/2*r.width-mx,dy=(1-v.y)/2*r.height-my,dd=dx*dx+dy*dy;if(dd<bd){bd=dd;best=i}}
    if(best>=0)setIndex(best)};
  const hideHint=()=>{$('#hint').style.opacity=0};
  cv.addEventListener('pointermove',e=>{if(e.pointerType==='mouse'&&!playing&&!e.buttons)pick(e,16)});
  cv.addEventListener('pointerdown',e=>{down={x:e.clientX,y:e.clientY};hideHint();touched=true});
  cv.addEventListener('pointerup',e=>{if(down&&Math.hypot(e.clientX-down.x,e.clientY-down.y)<6)pick(e,30);down=null});
  cv.addEventListener('wheel',hideHint,{passive:true});
  const syncTools=()=>{$$('[data-map]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.map===S.map)));$$('[data-color]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.color===S.color)));$$('[data-ex]').forEach(b=>b.setAttribute('aria-pressed',String(+b.dataset.ex===S.ex)))};
  $('.tools').addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;
    if(b.dataset.map){S.map=b.dataset.map;applyMap()}
    if(b.dataset.color){S.color=b.dataset.color;recolor();updateReadout()}
    if(b.dataset.ex){const k=+b.dataset.ex/S.ex,oldY=controls.target.y;S.ex=+b.dataset.ex;group.scale.y=S.ex;controls.target.y*=k;camera.position.y+=controls.target.y-oldY;WXV.ex()}
    syncTools();save()},sig);
  $('#reset').addEventListener('click',()=>flyTo(frameDay()),sig);
  const stopPlay=()=>{playing=null;$('#play').textContent=`Walk day ${S.day||1} ▶`};
  $('#play').addEventListener('click',()=>{if(playing){stopPlay();return}if(!S.day)selectDay(1,true);const d=DAYS[S.day-1];playing={d,t0:performance.now()+(reduce?0:900),dur:Math.max(8,R.t[d.i1]*2.4)*1000};$('#play').textContent='Pause ❚❚';hideHint()},sig);
  const tag=$('#tag'),north=$('#north');
  const place=()=>{const r={w:stage.clientWidth,h:stage.clientHeight};
    if(S.i>=0){const p=P(S.i),dist=camera.position.distanceTo(p),s=dist*.0055;marker.position.copy(p);halo.position.copy(p);marker.scale.setScalar(s);halo.scale.setScalar(s);marker.visible=halo.visible=true;
      v.copy(p).project(camera);if(v.z<1){const d=dayOf(S.i);tag.hidden=false;tag.textContent=`${DAYS.length>1?`Day ${d.n} · `:''}${fmtClock(clock(S.i))} · ${nf.format(Math.round(R.e[S.i]))} m${TAGT}`;const tx=(v.x+1)/2*r.w,ty=(1-v.y)/2*r.h;tag._x=Math.min(Math.max(tx+14,4),r.w-tag.offsetWidth-4);tag._y=Math.max(ty-42,4);tag.style.transform=`translate(${tag._x}px,${tag._y}px)`}else tag.hidden=true}
    else{tag.hidden=true;marker.visible=halo.visible=false}
    const placed=[];if(!tag.hidden&&tag._x!=null)placed.push({x:tag._x,y:tag._y,w:tag.offsetWidth,h:tag.offsetHeight});
    labels.forEach(L=>{const{p,el}=L;if(!showLbl(p)){el.style.display='none';return}if(p.lm)v.set(L.v.x,L.v.y*S.ex,L.v.z).project(camera);else v.copy(P(p.i)).project(camera);if(v.z>1||Math.abs(v.x)>1.05||Math.abs(v.y)>1.05){el.style.display='none';return}
      if(!L.w){el.style.display='';L.w=el.offsetWidth;L.h=el.offsetHeight}
      const sx=(v.x+1)/2*r.w,sy=(1-v.y)/2*r.h,box={x:Math.min(Math.max(sx-L.w/2,4),r.w-L.w-4),y:sy-L.h*1.35,w:L.w,h:L.h};
      if(placed.some(q=>box.x<q.x+q.w+4&&q.x<box.x+box.w+4&&box.y<q.y+q.h+2&&q.y<box.y+box.h+2)){el.style.display='none';return}
      placed.push(box);el.style.display='';el.style.transform=`translate(${box.x}px,${box.y}px)`})};
  const ease=t=>t<.5?4*t*t*t:1-Math.pow(-2*t+2,3)/2;
  const loop=now=>{raf=requestAnimationFrame(loop);if(document.hidden)return;
    if(fly){const t=Math.min(1,(now-fly.t0)/1100),k=ease(t);camera.position.lerpVectors(fly.p0,fly.f.pos,k);controls.target.lerpVectors(fly.q0,fly.f.target,k);if(t>=1)fly=null}
    if(playing&&now>=playing.t0){const d=playing.d,f=Math.min(1,(now-playing.t0)/playing.dur),T=f*WALK[d.i1];let lo=d.i0,hi=d.i1;while(lo<hi){const m=(lo+hi)>>1;if(WALK[m]<T)lo=m+1;else hi=m}if(lo!==S.i)setIndex(lo);if(f>=1)stopPlay()}
    controls.update();WXV.frame(now);place();north.style.transform=`rotate(${controls.getAzimuthalAngle()}rad)`;renderer.render(scene,camera)};
  V3=window.V3={cam:camera,stage,ctl:controls,mark(){WXV.time()},times(){WXV.time(true)},playing:()=>!!playing,
    dayChanged(doFly){recolor();if(playing&&R.day[playing.d.i0]!==S.day)stopPlay();if(doFly)flyTo(frameDay())},
    relabel(){makeLabels();recolor()},
    dispose(){cancelAnimationFrame(raf);controls.dispose();scene.traverse(o=>{if(o.geometry)o.geometry.dispose();const ms=o.material?(Array.isArray(o.material)?o.material:[o.material]):[];ms.forEach(m=>{for(const k in m){const t=m[k];if(t&&t.isTexture)t.dispose()}if(m.uniforms)for(const k in m.uniforms){const t=m.uniforms[k].value;if(t&&t.isTexture)t.dispose()}m.dispose()})});Object.values(tex).forEach(p=>p.then(t=>t.dispose()).catch(()=>{}));renderer.dispose();try{renderer.forceContextLoss()}catch(e){}}};
  recolor();syncTools();applyMap();WXV.time(true);$('#msg').hidden=true;raf=requestAnimationFrame(loop);
}

/* ---------- 3D weather ---------- */
function initWX3D(o){
  const{scene,renderer,camera,controls,mat,terr,sun,hemi,W,H,M,minH,maxH,LM,stage}=o,GC=TER.GC,GR=TER.GR,GS=TER.GS;
  const coarse=matchMedia('(pointer: coarse)').matches;
  const X0=-W*M/2,Z0=-H*M/2,SX=W*M,SZ=H*M,tAt=(x,z)=>TER.at(x/M+W/2,z/M+H/2),wx=px=>(px-W/2)*M,wz=py=>(py-H/2)*M,GREF=(minH+maxH)/2,DIAG=Math.hypot(SX,SZ);
  const C=c=>new THREE.Color(c),Z4=new THREE.Vector4(0,0,0,0);
  const NOISE=`float wh(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float wn(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(wh(i),wh(i+vec2(1.,0.)),f.x),mix(wh(i+vec2(0.,1.)),wh(i+vec2(1.,1.)),f.x),f.y);}
float wf(vec2 p){return .5*wn(p)+.25*wn(p*2.03+7.1)+.125*wn(p*4.07+3.3)+.0625*wn(p*8.1+1.7);}`;
  renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;renderer.shadowMap.autoUpdate=false;
  terr.castShadow=terr.receiveShadow=true;
  const smz=coarse?1024:2048;sun.shadow.mapSize.set(smz,smz);
  const shc=sun.shadow.camera,half=DIAG/2*1.05;shc.left=-half;shc.right=half;shc.top=half;shc.bottom=-half;shc.near=500;shc.far=DIAG*2+60000;shc.updateProjectionMatrix();
  sun.shadow.bias=-.0004;sun.shadow.normalBias=30;
  const U={uEx:{value:S.ex},uTime:{value:0},uWind:{value:new THREE.Vector2()},uSnowLine:{value:9e3},uSnowAmt:{value:0},uWet:{value:0},uFogTop:{value:-1e3},uFogAmt:{value:0},uFogCol:{value:C('#f4f6f8')},
    uDeckBase:{value:9e3},uDeckTop:{value:9e3},uDeckAmt:{value:0},uDeckShade:{value:0},uCloudCol:{value:C('#dfe3e6')},uCS:{value:null},uCSAmt:{value:0},uCSRect:{value:new THREE.Vector4(X0,Z0,SX,SZ)}};
  const csC=document.createElement('canvas');csC.width=512;csC.height=Math.max(64,Math.round(512*H/W));const csX=csC.getContext('2d');
  const csT=new THREE.CanvasTexture(csC);csT.flipY=false;U.uCS.value=csT;
  mat.onBeforeCompile=sh=>{Object.assign(sh.uniforms,U);
    sh.vertexShader=sh.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 vWP;varying vec3 vON;').replace('#include <worldpos_vertex>','#include <worldpos_vertex>\nvWP=(modelMatrix*vec4(transformed,1.0)).xyz;vON=objectNormal;');
    sh.fragmentShader=sh.fragmentShader.replace('#include <common>',`#include <common>
varying vec3 vWP;varying vec3 vON;uniform float uEx,uTime,uSnowLine,uSnowAmt,uWet,uFogTop,uFogAmt,uDeckBase,uDeckTop,uDeckAmt,uDeckShade,uCSAmt;uniform vec3 uFogCol,uCloudCol;uniform sampler2D uCS;uniform vec4 uCSRect;uniform vec2 uWind;
${NOISE}`).replace('#include <map_fragment>',`#include <map_fragment>
float wAlt=vWP.y/uEx;vec3 wN=normalize(vON);float sn=0.;
if(uSnowAmt>0.){float n1=wf(vWP.xz*.0045);float sl=uSnowLine+(n1-.45)*260.;sn=smoothstep(sl-40.,sl+160.,wAlt)*smoothstep(.42,.78,wN.y)*uSnowAmt;diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.95,.97,1.),sn);}
diffuseColor.rgb*=1.-.3*uWet*(1.-sn);`).replace('#include <aomap_fragment>',`#include <aomap_fragment>
if(uCSAmt>0.){vec2 cu=(vWP.xz-uCSRect.xy)/uCSRect.zw;reflectedLight.directDiffuse*=1.-uCSAmt*texture2D(uCS,cu).r;}
if(uDeckShade>0.){reflectedLight.directDiffuse*=1.-uDeckShade*(1.-smoothstep(uDeckTop-150.,uDeckTop+100.,wAlt));}`).replace('#include <fog_fragment>',`if(uFogAmt>0.){float nf=wf(vWP.xz*.0011+uWind*uTime*.6);float ft=uFogTop+(nf-.45)*140.;float f=(1.-smoothstep(ft-90.,ft+30.,wAlt))*uFogAmt;gl_FragColor.rgb=mix(gl_FragColor.rgb,uFogCol,f);}
if(uDeckAmt>0.){float nd=wf(vWP.xz*.0016+uWind*uTime);float bb=uDeckBase+(nd-.45)*320.;float dk=smoothstep(bb-140.,bb+160.,wAlt)*(1.-smoothstep(uDeckTop-60.,uDeckTop+140.,wAlt+(nd-.45)*200.))*uDeckAmt*(.72+.28*nd);gl_FragColor.rgb=mix(gl_FragColor.rgb,uCloudCol,dk);}
#include <fog_fragment>`)};
  mat.customProgramCacheKey=()=>'wx1';mat.needsUpdate=true;
  const skyM=new THREE.ShaderMaterial({side:THREE.BackSide,depthWrite:false,depthTest:false,
    uniforms:{uZen:{value:C('#3b77c3')},uHor:{value:C('#b8d2e6')},uGnd:{value:C('#8fa0ad')},uSun:{value:new THREE.Vector3(0,1,0)},uSunCol:{value:C('#fff4e0')},uSunAmt:{value:1},uFlash:{value:0}},
    vertexShader:`varying vec3 vD;void main(){vD=position;gl_Position=(projectionMatrix*modelViewMatrix*vec4(position,1.)).xyww;}`,
    fragmentShader:`uniform vec3 uZen,uHor,uGnd,uSun,uSunCol;uniform float uSunAmt,uFlash;varying vec3 vD;void main(){vec3 d=normalize(vD);float h=d.y;vec3 c=mix(uHor,uZen,pow(clamp(h,0.,1.),.55));vec3 g=mix(uGnd,uGnd*.84,smoothstep(-.05,-.95,h));c=mix(c,g,smoothstep(0.,-.12,h));float s=max(dot(d,normalize(uSun)),0.);c+=uSunCol*(pow(s,1400.)*2.2+pow(s,28.)*.2+pow(s,4.)*.07)*uSunAmt;c+=vec3(.5,.55,.7)*uFlash;gl_FragColor=vec4(c,1.);}`});
  const sky=new THREE.Mesh(new THREE.SphereGeometry(1,40,20),skyM);sky.scale.setScalar(450000);sky.renderOrder=-10;sky.frustumCulled=false;scene.add(sky);
  const fogO=new THREE.Fog(0xb8d2e6,1e5,2e5);
  const hm=new Uint8Array(GC*GR);for(let k=0;k<GC*GR;k++)hm[k]=Math.max(0,Math.min(255,Math.round((TER.ht[k]-minH)/Math.max(1,maxH-minH)*255)));
  const hmT=new THREE.DataTexture(hm,GC,GR,renderer.capabilities.isWebGL2?THREE.RedFormat:THREE.LuminanceFormat,THREE.UnsignedByteType);hmT.unpackAlignment=1;hmT.magFilter=hmT.minFilter=THREE.LinearFilter;hmT.needsUpdate=true;
  const atl=document.createElement('canvas');atl.width=atl.height=256;const ac=atl.getContext('2d'),ar=rng(11);
  for(let q=0;q<4;q++){const ox=(q%2)*128,oy=(q>>1)*128;for(let k=0;k<30;k++){const a=ar()*6.283,d=Math.pow(ar(),.7)*28,x=ox+64+Math.cos(a)*d,y=oy+64+Math.sin(a)*d*.85,r=12+ar()*20;const g=ac.createRadialGradient(x,y,0,x,y,r);g.addColorStop(0,'rgba(255,255,255,.5)');g.addColorStop(.55,'rgba(255,255,255,.22)');g.addColorStop(1,'rgba(255,255,255,0)');ac.fillStyle=g;ac.beginPath();ac.arc(x,y,r,0,7);ac.fill()}}
  const atT=new THREE.CanvasTexture(atl);
  const MAXP=coarse?1700:3000,PB=new Float32Array(MAXP*7),aPos=new Float32Array(MAXP*3),aP=new Float32Array(MAXP*4),key=new Float32Array(MAXP);let PN=0,dirty=true;
  const quad=new THREE.PlaneGeometry(1,1),pg=new THREE.InstancedBufferGeometry();pg.index=quad.index;pg.setAttribute('position',quad.getAttribute('position'));pg.setAttribute('uv',quad.getAttribute('uv'));
  pg.setAttribute('iPos',new THREE.InstancedBufferAttribute(aPos,3).setUsage(THREE.DynamicDrawUsage));pg.setAttribute('iP',new THREE.InstancedBufferAttribute(aP,4).setUsage(THREE.DynamicDrawUsage));pg.instanceCount=0;
  const puM=new THREE.ShaderMaterial({transparent:true,depthWrite:false,
    uniforms:{uTex:{value:atT},uLit:{value:C('#ffffff')},uDark:{value:C('#8d96a3')},uFlash:{value:0},uFogCol:{value:C('#b8d2e6')},uFogNear:{value:1e5},uFogFar:{value:2e5},uHMap:{value:hmT},uHRect:{value:new THREE.Vector4(X0,Z0,GS*GC*M,GS*GR*M)},uHMin:{value:minH},uHRng:{value:Math.max(1,maxH-minH)},uEx:U.uEx,uCamR:{value:new THREE.Vector3(1,0,0)},uCamU:{value:new THREE.Vector3(0,1,0)}},
    vertexShader:`attribute vec3 iPos;attribute vec4 iP;uniform vec3 uCamR,uCamU;uniform float uEx;varying vec2 vUv;varying float vA,vS,vV;varying vec3 vW;void main(){vec3 c=vec3(iPos.x,min(iPos.y,4500.)*uEx+max(iPos.y-4500.,0.),iPos.z);vec3 w=c+(uCamR*position.x+uCamU*position.y)*iP.x;vW=w;vUv=uv;vA=iP.y;vS=iP.z;vV=iP.w;gl_Position=projectionMatrix*viewMatrix*vec4(w,1.);}`,
    fragmentShader:`uniform sampler2D uTex,uHMap;uniform vec3 uLit,uDark,uFogCol;uniform float uFlash,uFogNear,uFogFar,uHMin,uHRng,uEx;uniform vec4 uHRect;varying vec2 vUv;varying float vA,vS,vV;varying vec3 vW;void main(){vec2 cell=vec2(mod(vV,2.),floor(vV/2.))*.5;vec4 t=texture2D(uTex,cell+vUv*.5);float a=min(1.,t.a*1.5)*vA;vec2 hu=(vW.xz-uHRect.xy)/uHRect.zw;float th=(texture2D(uHMap,hu).r*uHRng+uHMin)*uEx;a*=smoothstep(th,th+260.*uEx,vW.y);vec2 ed=min(vW.xz-uHRect.xy,uHRect.xy+uHRect.zw-vW.xz);a*=smoothstep(-300.,1800.,min(ed.x,ed.y));if(a<.01)discard;float vb=clamp(vUv.y*1.2-.05,0.,1.);vec3 col=mix(uDark,uLit,clamp(vS*(.6+.4*vb)+(t.a-.4)*.2,0.,1.))+uFlash*vec3(.45,.5,.65);float d=length(vW-cameraPosition);col=mix(col,uFogCol,smoothstep(uFogNear,uFogFar,d)*.75);gl_FragColor=vec4(col,a);}`});
  const puffs=new THREE.Mesh(pg,puM);puffs.frustumCulled=false;puffs.renderOrder=5;scene.add(puffs);
  const layerMat=k=>new THREE.ShaderMaterial({transparent:true,depthWrite:false,uniforms:{uT:U.uTime,uA:{value:0},uK:{value:k},uWind:U.uWind,uTopC:{value:C('#ffffff')},uLowC:{value:C('#d5dce2')},uFlat:{value:0}},
    vertexShader:`varying vec3 vW;void main(){vec4 w=modelMatrix*vec4(position,1.);vW=w.xyz;gl_Position=projectionMatrix*viewMatrix*w;}`,
    fragmentShader:`${NOISE}varying vec3 vW;uniform float uT,uA,uK,uFlat;uniform vec2 uWind;uniform vec3 uTopC,uLowC;void main(){float n=wf(vW.xz*.00042+uWind*uT*.5+uK*3.1);float n2=wf(vW.xz*.0017-uWind*uT+uK);float d=n*.75+n2*.25;float a=mix(smoothstep(.3+uK*.08,.52+uK*.08,d),1.,uFlat)*uA;if(a<.01)discard;vec3 c=mix(uLowC,uTopC,clamp(d*1.5-.25+uK*.25,0.,1.));gl_FragColor=vec4(c,a);}`});
  const layers=[0,1,2].map(k=>{const m=new THREE.Mesh(new THREE.PlaneGeometry(SX,SZ),layerMat(k));m.rotation.x=-Math.PI/2;m.renderOrder=4+k*.01;m.visible=false;m.userData.alt=0;scene.add(m);return m});
  const rainV=`attribute vec4 seed;attribute float endp;uniform vec2 uC,uSz,uDrift;uniform float uBot,uTop,uT,uFall,uLen,uEx,uRate,uSnowL;uniform vec4 uCells[6],uRect;varying float vA;
void main(){float h=fract(seed.y-uT*uFall/(uTop-uBot));vec2 xz=uC+(fract(seed.xz+uDrift*uT/uSz)-.5)*uSz;float y=mix(uBot,uTop,h);vec2 ed=min(xz-uRect.xy,uRect.xy+uRect.zw-xz);float a=uRate*step(0.,min(ed.x,ed.y));
for(int k=0;k<6;k++){vec4 c=uCells[k];if(c.w>0.){float d=length(xz-c.xy);a=max(a,c.w*(1.-smoothstep(c.z*.55,c.z,d))*step(0.,min(ed.x,ed.y)));}}
a*=1.-smoothstep(uSnowL-120.,uSnowL+120.,y);vA=step(seed.w,a)*(.45+.4*seed.w)*smoothstep(0.,.06,h);
vec3 p=vec3(xz.x,y*uEx,xz.y);p.y+=endp*uLen;p.xz-=endp*uLen*uDrift/max(uFall*uEx,1.);gl_Position=projectionMatrix*viewMatrix*vec4(p,1.);}`;
  const snowV=`attribute vec4 seed;uniform vec2 uC,uSz,uDrift;uniform float uBot,uTop,uT,uFall,uEx,uRate,uSnowL,uSize,uPx;uniform vec4 uCells[6],uRect;varying float vA;
void main(){float h=fract(seed.y-uT*uFall/(uTop-uBot));vec2 xz=uC+(fract(seed.xz+uDrift*uT/uSz)-.5)*uSz;xz+=vec2(sin(uT*1.3+seed.w*30.),cos(uT*1.1+seed.x*20.))*uSz*.004;float y=mix(uBot,uTop,h);vec2 ed=min(xz-uRect.xy,uRect.xy+uRect.zw-xz);float a=uRate*step(0.,min(ed.x,ed.y));
for(int k=0;k<6;k++){vec4 c=uCells[k];if(c.w>0.){float d=length(xz-c.xy);a=max(a,c.w*(1.-smoothstep(c.z*.55,c.z,d))*step(0.,min(ed.x,ed.y)));}}
a*=smoothstep(uSnowL-120.,uSnowL+120.,y);vA=step(seed.w,a)*.9*smoothstep(0.,.05,h);vec4 mv=viewMatrix*vec4(xz.x,y*uEx,xz.y,1.);gl_PointSize=clamp(uSize/(-mv.z),1.,7.*uPx);gl_Position=projectionMatrix*mv;}`;
  const precipU=()=>({uC:{value:new THREE.Vector2()},uSz:{value:new THREE.Vector2(1,1)},uDrift:{value:new THREE.Vector2()},uBot:{value:0},uTop:{value:3000},uT:{value:0},uFall:{value:1000},uLen:{value:100},uEx:U.uEx,uRate:{value:0},uSnowL:{value:9e3},uSize:{value:100},uPx:{value:1},uDim:{value:1},uRect:{value:new THREE.Vector4(X0,Z0,SX,SZ)},uCells:{value:[0,0,0,0,0,0].map(()=>new THREE.Vector4())}});
  const NR=coarse?7000:15000,rs=new Float32Array(NR*8),re=new Float32Array(NR*2);for(let k=0;k<NR;k++){const q=[Math.random(),Math.random(),Math.random(),Math.random()];rs.set(q,k*8);rs.set(q,k*8+4);re[k*2+1]=1}
  const rg=new THREE.BufferGeometry();rg.setAttribute('position',new THREE.BufferAttribute(new Float32Array(NR*6),3));rg.setAttribute('seed',new THREE.BufferAttribute(rs,4));rg.setAttribute('endp',new THREE.BufferAttribute(re,1));
  const rainM=new THREE.ShaderMaterial({transparent:true,depthWrite:false,uniforms:precipU(),vertexShader:rainV,fragmentShader:`uniform float uDim;varying float vA;void main(){if(vA<.01)discard;gl_FragColor=vec4(vec3(.8,.86,.94)*uDim,vA*.6);}`});
  const rain=new THREE.LineSegments(rg,rainM);rain.frustumCulled=false;rain.renderOrder=4.5;rain.visible=false;scene.add(rain);
  const NS=coarse?3500:7000,ss=new Float32Array(NS*4);for(let k=0;k<NS*4;k++)ss[k]=Math.random();
  const sg=new THREE.BufferGeometry();sg.setAttribute('position',new THREE.BufferAttribute(new Float32Array(NS*3),3));sg.setAttribute('seed',new THREE.BufferAttribute(ss,4));
  const snowM=new THREE.ShaderMaterial({transparent:true,depthWrite:false,uniforms:precipU(),vertexShader:snowV,fragmentShader:`uniform float uDim;varying float vA;void main(){vec2 q=gl_PointCoord-.5;float r=length(q);if(r>.5||vA<.01)discard;gl_FragColor=vec4(vec3(1.)*uDim,vA*smoothstep(.5,.15,r));}`});
  const snow=new THREE.Points(sg,snowM);snow.frustumCulled=false;snow.renderOrder=4.5;snow.visible=false;scene.add(snow);
  const shafts=[0,1,2,3,4,5].map(()=>{const m=new THREE.Mesh(new THREE.CylinderGeometry(1,1.25,1,28,1,true),new THREE.ShaderMaterial({transparent:true,depthWrite:false,side:THREE.DoubleSide,uniforms:{uT:U.uTime,uA:{value:0}},
    vertexShader:`varying vec2 vU;varying vec3 vN;varying vec3 vV;void main(){vU=uv;vec4 w=modelMatrix*vec4(position,1.);vN=normalize(mat3(modelMatrix)*normal);vV=normalize(cameraPosition-w.xyz);gl_Position=projectionMatrix*viewMatrix*w;}`,
    fragmentShader:`${NOISE}varying vec2 vU;varying vec3 vN;varying vec3 vV;uniform float uT,uA;void main(){float e=abs(dot(normalize(vN),normalize(vV)));float s=wn(vec2(vU.x*46.,vU.y*3.+uT*2.2));float a=uA*pow(e,1.5)*(.5+.5*s)*smoothstep(0.,.3,vU.y)*smoothstep(1.,.8,vU.y);gl_FragColor=vec4(.4,.45,.52,a);}`}));m.renderOrder=4.6;m.visible=false;scene.add(m);return m});
  const boltG=new THREE.LineGeometry();boltG.setPositions([0,0,0,0,1,0]);
  const boltM=new THREE.LineMaterial({color:0xf4f7ff,linewidth:2.6,transparent:true,depthWrite:false});LM.push(boltM);
  const bolt=new THREE.Line2(boltG,boltM);bolt.visible=false;bolt.renderOrder=8;bolt.frustumCulled=false;scene.add(bolt);
  const flashEl=$('#flash');let nextStrike=0,boltT=0,flash=0,baseHemi=.82;
  const NW=coarse?380:800,TL=8,wP=[],wpos=new Float32Array(NW*(TL-1)*6),wcol=new Float32Array(NW*(TL-1)*8);
  const wgeo=new THREE.BufferGeometry();wgeo.setAttribute('position',new THREE.BufferAttribute(wpos,3).setUsage(THREE.DynamicDrawUsage));wgeo.setAttribute('color',new THREE.BufferAttribute(wcol,4).setUsage(THREE.DynamicDrawUsage));
  const wl=new THREE.LineSegments(wgeo,new THREE.LineBasicMaterial({vertexColors:true,transparent:true,depthWrite:false}));wl.frustumCulled=false;wl.renderOrder=7;wl.visible=false;scene.add(wl);
  for(let k=0;k<NW;k++)wP.push({x:0,z:0,h:0,age:1e9,life:1,acc:0,tr:new Float32Array(TL*3)});
  // cumulus sites over the higher ground
  const SITES=[];{const r=rng(7),thr=minH+(maxH-minH)*.45;let n=0;while(SITES.length<85&&n++<40000){const px=r()*W,py=r()*H,h=TER.at(px,py);if(h<thr)continue;SITES.push({x:wx(px),z:wz(py),s:.6+.8*r(),k:r(),seed:(r()*1e9)|0})}}
  const puff=(x,y,z,s,a,sh,v)=>{if(PN>=MAXP)return;const q=PN*7;PB[q]=x;PB[q+1]=y;PB[q+2]=z;PB[q+3]=s;PB[q+4]=a;PB[q+5]=sh;PB[q+6]=v;PN++};
  const blob=(x,z,r,a)=>{const cx=(x-X0)/SX*csC.width,cy=(z-Z0)/SZ*csC.height,cr=r/SX*csC.width;if(cr<.5||a<=0)return;const g=csX.createRadialGradient(cx,cy,0,cx,cy,cr);g.addColorStop(0,`rgba(255,255,255,${Math.min(1,a)})`);g.addColorStop(1,'rgba(255,255,255,0)');csX.fillStyle=g;csX.beginPath();csX.arc(cx,cy,cr,0,7);csX.fill()};
  function buildClouds(st,sn){
    PN=0;const so=sn.y>.06,sx=so?-sn.x/sn.y:0,sz=so?-sn.z/sn.y:0;csX.fillStyle='#000';csX.fillRect(0,0,csC.width,csC.height);
    if(st.cu&&st.cu.cover>.005){const cov=st.cu.cover;
      for(const s of SITES){const g=Math.min(1,Math.max(0,(cov*2-s.k)/.25));if(g<=0)continue;const r=rng(s.seed),Rk=(700+1000*s.s)*(.45+.55*g),dep=st.cu.depth*(.45+.55*g)*(.7+.3*s.s),base=st.cu.base+(r()-.5)*300,n=6+Math.round(12*g*s.s);
        for(let k=0;k<n;k++){const u=r()*6.283,hf=Math.pow(r(),1.2),rad=Rk*.95*Math.sqrt(r())*(1-.55*hf),ps=Rk*(.62+.3*r())*(1-.25*hf),ox=Math.cos(u)*rad,oz=Math.sin(u)*rad*.8,face=(ox*sn.x+oz*sn.z)/(rad+1);
          puff(s.x+ox,base+ps*.42+hf*Math.max(0,dep-ps*.5),s.z+oz,ps,.78*(.75+.25*r())*(.4+.6*g),Math.min(1,.38+.55*hf+.12*face),k&3)}
        if(so)blob(s.x+sx*(base-GREF),s.z+sz*(base-GREF),Rk*.95,.7*g)}}
    let si=0;
    if(st.cells)for(const c of st.cells){const vis=sst(-.25,.25,c.age)*(1-sst(3.2,4.4,c.age));if(vis<=0)continue;const r=rng(c.seed),cx=wx(c.x),cz=wz(c.y),Rc=c.R*1.1,zb=Math.max(minH+900,GW.cuBase()-500),top=zb+1100+(9600-zb-1100)*sst(.1,1,c.age),sa=Math.atan2(sn.z,sn.x);
      const nC=Math.round(18+34*Math.max(c.I,.3));
      for(let k=0;k<nC;k++){const hf=Math.pow(r(),.8),u=r()*6.283,rad=Rc*(.15+.55*Math.sqrt(r()))*(.8+.3*Math.sin(hf*8+c.seed)),ps=Rc*(.5+.35*r())*(1-.3*hf);puff(cx+Math.cos(u)*rad,zb+ps*.3+(top-zb-ps*.6)*hf,cz+Math.sin(u)*rad,ps,.94*vis,Math.min(1,.16+.78*hf+.1*Math.cos(u-sa)),k&3)}
      if(c.age>.85){const sp=sst(.85,2.6,c.age),Ra=Rc*(1+1.7*sp),nA=Math.round(8+26*sp);
        for(let k=0;k<nA;k++){const u=r()*6.283,q=Math.sqrt(r()),a=Math.cos(u)*q*Ra*1.5+Ra*.5,b=Math.sin(u)*q*Ra,dx=(a-b)*Math.SQRT1_2,dz=-(a+b)*Math.SQRT1_2;puff(cx+dx,top-350+r()*500-q*300,cz+dz,Rc*(.55+.35*r()),.82*vis*(1-sst(2.8,4,c.age)),.8+.15*r(),k&3)}
        if(so)blob(cx+Ra*.4*Math.SQRT1_2+sx*(top-GREF),cz-Ra*.4*Math.SQRT1_2+sz*(top-GREF),Ra*1.1,.35*sp*vis)}
      for(let k=0;k<7;k++){const u=r()*6.283,q=Math.sqrt(r())*Rc*.85;puff(cx+Math.cos(u)*q,zb+260,cz+Math.sin(u)*q,Rc*.6,.85*vis*Math.max(c.I,.2),.08,k&3)}
      if(so)blob(cx+sx*(zb-GREF),cz+sz*(zb-GREF),Rc*1.3,.95*vis*Math.max(.3,c.I));
      if(si<shafts.length){const m=shafts[si++];m.visible=c.Ir>.04&&cx>X0+1500&&cx<X0+SX-1500&&cz>Z0+1500&&cz<Z0+SZ-1500;m.material.uniforms.uA.value=.55*c.Ir;m.userData={x:cx,z:cz,r:Rc*.62,bot:minH-50,top:zb+80}}}
    for(;si<shafts.length;si++)shafts[si].visible=false;
    csT.needsUpdate=true;dirty=true}
  const placeY=()=>{layers.forEach(l=>l.position.y=l.userData.alt*S.ex);shafts.forEach(m=>{const d=m.userData;if(!d.r)return;m.position.set(d.x,(d.bot+d.top)/2*S.ex,d.z);m.scale.set(d.r,(d.top-d.bot)*S.ex,d.r)})};
  const SK={zen:C('#3b77c3'),hor:C('#b8d2e6'),gzen:C('#8e979e'),ghor:C('#c1c8cd'),szen:C('#3d4650'),shor:C('#7d8891'),nzen:C('#081120'),nhor:C('#1a2740'),fzen:C('#1d56ab'),fhor:C('#a2c5e9'),gold:C('#f0a35f')},WHITE=C('#ffffff');
  const zen=C(0),hor=C(0),gnd=C(0);let curT=-99,curKey='',curSt={},curI=0,plainOn=null,lastSun=new THREE.Vector3(),PRC=[],PRrate=0,PRtop=3000,PRsl=9e3,PRdir=new THREE.Vector2(),PRon=false,lastNow=0,dimF=1,windAt=null;
  const camF=new THREE.Vector3(),lastCam=new THREE.Matrix4();
  function apply(force){
    const i=S.i>=0?S.i:0,t=S.i>=0?CLK[S.i]:(S.wx==='storm'?15:S.wx==='sea'?8.5:12),k=S.wx+S.mon+(S.wx==='fc'?'|'+FCP[i]+'|'+R.day[i]:'');if(!force&&k===curKey&&Math.abs(t-curT)<1/120)return;curT=t;curKey=k;curI=i;
    const pill=$('#wpill');
    if(S.wx==='plain'){if(plainOn!==true){plainOn=true;sky.visible=false;scene.fog=null;sun.castShadow=false;hemi.intensity=baseHemi=.82;hemi.color.set(0xffffff);hemi.groundColor.set(0x5a665e);sun.intensity=.45;sun.color.set(0xffffff);sun.position.set(-.7,1,-.5);sun.target.position.set(0,0,0);
        [puffs,rain,snow,wl,bolt,...layers,...shafts].forEach(m=>m.visible=false);U.uSnowAmt.value=U.uWet.value=U.uFogAmt.value=U.uDeckAmt.value=U.uDeckShade.value=U.uCSAmt.value=0;flashEl.style.opacity=0;PRon=false}
      pill.hidden=true;curSt={};return}
    if(plainOn!==false){plainOn=false;sky.visible=true;scene.fog=fogO;sun.castShadow=true;puffs.visible=true;renderer.shadowMap.needsUpdate=true}
    const st=stAt(i,t),sn=sunAt(t,R.day[i]);curSt=st;
    pill.hidden=false;pill.textContent=S.wx==='fc'?`Forecast · ${fmtDate(isoDay(dayDate(R.day[i])))} · ${fmtClock(t)}`:`${SCN[S.wx].name} · ${MONN[S.mon]} · ${fmtClock(t)}`;
    const day=sst(-.1,.1,sn.y),gold=sst(-.1,.02,sn.y)*(1-sst(.05,.35,sn.y)),direct=st.sunAmt*sst(-.02,.14,sn.y);dimF=.35+.65*day;
    const sv=new THREE.Vector3(sn.x,Math.max(sn.y,.02),sn.z).normalize(),tg=new THREE.Vector3(0,GREF*S.ex,0);
    sun.target.position.copy(tg);sun.position.copy(tg).addScaledVector(sv,DIAG+60000);sun.intensity=.62*direct;sun.color.setRGB(1,1-.22*gold,1-.45*gold);
    if(sv.angleTo(lastSun)>.004){renderer.shadowMap.needsUpdate=true;lastSun.copy(sv)}
    if(st.over){zen.copy(SK.gzen);hor.copy(SK.ghor)}else if(st.windVis>.9){zen.copy(SK.fzen);hor.copy(SK.fhor)}else{zen.copy(SK.zen);hor.copy(SK.hor)}
    hor.lerp(SK.ghor,(st.haze||0)*.3);if(st.dark){zen.lerp(SK.szen,st.dark);hor.lerp(SK.shor,st.dark)}
    gnd.copy(hor).lerp(SK.nhor,1-day).lerp(WHITE,.1*day);hor.lerp(SK.gold,gold*.28*Math.min(1,st.sunAmt*1.5));zen.lerp(SK.nzen,1-day);hor.lerp(SK.nhor,1-day);
    const su=skyM.uniforms;su.uZen.value.copy(zen);su.uHor.value.copy(hor);su.uGnd.value.copy(gnd);su.uSun.value.copy(sv);su.uSunCol.value.setRGB(1,.92-.25*gold,.78-.35*gold);su.uSunAmt.value=st.over?0:direct;
    fogO.color.copy(hor);
    baseHemi=(.26+.32*day+.38*day*(1-Math.min(1,st.sunAmt)))*(1-.3*(st.dark||0));hemi.intensity=baseHemi;hemi.color.copy(zen).lerp(WHITE,.7);hemi.groundColor.set(0x5a665e).multiplyScalar(.5+.5*day);
    U.uSnowAmt.value=st.snow?1:0;U.uSnowLine.value=st.snow||9e3;
    U.uWet.value=st.wetAll||(S.wx==='fc'&&st.rain>.3)?1:st.drizzle?.6:0;
    U.uFogAmt.value=st.fog?Math.min(1,st.fog.amt*1.2):0;U.uFogTop.value=st.fog?st.fog.top:-1e3;U.uFogCol.value.setRGB(.97,.98,.99).multiplyScalar(dimF);
    U.uDeckAmt.value=st.deck?(st.over?.74:.88):0;U.uDeckBase.value=st.deck?st.deck.base:9e3;U.uDeckTop.value=st.deck?st.deck.top:9e3;U.uDeckShade.value=st.deckShade?.85:0;
    U.uCloudCol.value.set(st.over?'#c2c8cd':'#e2e6e9').multiplyScalar(dimF);
    let wdir,wspd;if(S.wx==='fc'&&st.f){wdir=st.f.wd||0;wspd=st.f.ws||0;windAt=(z)=>({v:wspd*(1+.6*sst(GW.hmin,GW.hmax,z)),dir:wdir})}else{const sc=SCN[S.wx==='fc'?'plain':S.wx],wv=sc.wind(GW.hmax*.8,t);wdir=wv.dir;wspd=wv.v;windAt=z=>sc.wind(z,curT)}
    const wb=(wdir+180)*Math.PI/180;U.uWind.value.set(Math.sin(wb),-Math.cos(wb)).multiplyScalar(.004*(.3+wspd/40));
    puM.uniforms.uLit.value.setRGB(1,.98-.12*gold,.95-.25*gold).multiplyScalar(.5+.5*day);
    puM.uniforms.uDark.value.set('#8d97a4').lerp(C('#3c434c'),st.dark||0).multiplyScalar(.45+.55*day);
    buildClouds(st,sn);U.uCSAmt.value=(st.cu||st.cells)?(st.cells?.9:.8)*direct:0;
    layers.forEach(l=>l.visible=false);
    if(st.fog&&st.fog.amt>.02){layers.forEach((l,k)=>{l.visible=true;l.userData.alt=st.fog.top-110+k*55;const u=l.material.uniforms;u.uA.value=(k===0?.96:k===1?.8:.55)*Math.min(1,st.fog.amt*1.3);u.uFlat.value=k===0?1:0;u.uTopC.value.setRGB(1,1,1).multiplyScalar(dimF);u.uLowC.value.setRGB(.86,.89,.92).multiplyScalar(dimF)})}
    else if(st.deck&&st.deckShade){layers.forEach((l,k)=>{l.visible=true;l.userData.alt=st.deck.top-90+k*60;const u=l.material.uniforms;u.uA.value=[.42,.34,.27][k];u.uFlat.value=0;u.uTopC.value.setRGB(1,1,1).multiplyScalar(dimF);u.uLowC.value.setRGB(.8,.84,.88).multiplyScalar(dimF)})}
    placeY();
    PRrate=st.rain?Math.min(1,.2+st.rain/6):st.drizzle?.14:0;PRC=(st.cells||[]).filter(c=>c.Ir>.03).map(c=>new THREE.Vector4(wx(c.x),wz(c.y),c.R*1.05,Math.min(1,c.Ir*1.1)));
    PRtop=st.deck?Math.min(st.deck.base+1300,GW.hmax+1500):st.cells?Math.max(minH+900,GW.cuBase()-400):GW.hmax+300;PRsl=st.sl;PRon=PRrate>0||PRC.length>0;
    PRdir.set(Math.sin(wb),-Math.cos(wb)).multiplyScalar(Math.min(1,wspd/45));
    rain.visible=PRon&&PRsl>minH+200;snow.visible=PRon&&PRsl<PRtop;
    wl.visible=!!st.windVis}
  function sortPuffs(){const cp=camera.position;for(let k=0;k<PN;k++){const q=k*7;key[k]=(PB[q]-cp.x)*camF.x+(Math.min(PB[q+1],4500)*S.ex+Math.max(PB[q+1]-4500,0)-cp.y)*camF.y+(PB[q+2]-cp.z)*camF.z}
    const ord=Array.from({length:PN},(_,k)=>k).sort((a,b)=>key[b]-key[a]);
    for(let j=0;j<PN;j++){const q=ord[j]*7;aPos[j*3]=PB[q];aPos[j*3+1]=PB[q+1];aPos[j*3+2]=PB[q+2];aP[j*4]=PB[q+3];aP[j*4+1]=PB[q+4];aP[j*4+2]=PB[q+5];aP[j*4+3]=PB[q+6]}
    pg.attributes.iPos.needsUpdate=true;pg.attributes.iP.needsUpdate=true;pg.instanceCount=PN;dirty=false}
  function strike(now){const lit=(curSt.cells||[]).filter(c=>c.lit);if(!lit.length)return;const c=lit[Math.floor(Math.random()*lit.length)];
    const cx=wx(c.x),cz=wz(c.y),a=Math.random()*6.283,q=Math.sqrt(Math.random())*c.R*.75,gx=cx+Math.cos(a)*q,gz=cz+Math.sin(a)*q,zb=Math.max(minH+900,GW.cuBase()-500);
    let seg=[[cx+(Math.random()-.5)*c.R*.4,zb+50,cz+(Math.random()-.5)*c.R*.4],[gx,tAt(gx,gz),gz]];
    for(let lev=0;lev<6;lev++){const nx=[];for(let k=0;k<seg.length-1;k++){const A=seg[k],B=seg[k+1],L=Math.hypot(B[0]-A[0],B[1]-A[1],B[2]-A[2]),off=L*.2;nx.push(A,[(A[0]+B[0])/2+(Math.random()-.5)*off,(A[1]+B[1])/2+(Math.random()-.5)*off*.25,(A[2]+B[2])/2+(Math.random()-.5)*off])}nx.push(seg[seg.length-1]);seg=nx}
    const arr=[];seg.forEach(p=>arr.push(p[0],p[1]*S.ex,p[2]));boltG.setPositions(arr);bolt.visible=true;boltT=now;flash=1}
  function windFrame(dt){if(!wl.visible||!windAt)return;const Dc=camera.position.distanceTo(controls.target),sz=Math.min(Math.max(Dc*1.2,3000),60000),cx=controls.target.x,cz=controls.target.z,k0=curSt.windVis||0;
    let o=0,c=0;const bx0=Math.max(X0,cx-sz/2),bx1=Math.min(X0+SX,cx+sz/2),bz0=Math.max(Z0,cz-sz/2),bz1=Math.min(Z0+SZ,cz+sz/2);
    for(const p of wP){if(p.age>p.life||p.x<bx0||p.x>bx1||p.z<bz0||p.z>bz1){p.x=bx0+Math.random()*Math.max(1,bx1-bx0);p.z=bz0+Math.random()*Math.max(1,bz1-bz0);p.h=60+Math.random()*700;p.age=0;p.life=1.5+Math.random()*2.5;p.acc=0;const y=(tAt(p.x,p.z)+p.h)*S.ex;for(let j=0;j<TL;j++){p.tr[j*3]=p.x;p.tr[j*3+1]=y;p.tr[j*3+2]=p.z}}
      p.age+=dt;const w=windAt(tAt(p.x,p.z)+p.h),b=(w.dir+180)*Math.PI/180,sp=w.v*Dc*.0012*k0;p.x+=Math.sin(b)*sp*dt;p.z-=Math.cos(b)*sp*dt;const y=(tAt(p.x,p.z)+p.h)*S.ex;
      p.acc+=dt;if(p.acc>.08){p.acc=0;p.tr.copyWithin(3,0,(TL-1)*3)}p.tr[0]=p.x;p.tr[1]=y;p.tr[2]=p.z;
      const fade=Math.min(1,p.age*3,(p.life-p.age)*3)*Math.min(1,w.v/35)*.85*dimF;
      for(let j=0;j<TL-1;j++){wpos[o]=p.tr[j*3];wpos[o+1]=p.tr[j*3+1];wpos[o+2]=p.tr[j*3+2];wpos[o+3]=p.tr[j*3+3];wpos[o+4]=p.tr[j*3+4];wpos[o+5]=p.tr[j*3+5];o+=6;
        const a1=fade*(1-j/(TL-1)),a2=fade*(1-(j+1)/(TL-1));wcol[c]=wcol[c+1]=wcol[c+2]=1;wcol[c+3]=a1;wcol[c+4]=wcol[c+5]=wcol[c+6]=1;wcol[c+7]=a2;c+=8}}
    wgeo.attributes.position.needsUpdate=true;wgeo.attributes.color.needsUpdate=true}
  function frame(now){const dt=Math.min(.05,(now-(lastNow||now))/1000);lastNow=now;U.uTime.value=now/1000;U.uEx.value=S.ex;
    if(plainOn)return;
    camera.updateMatrixWorld();sky.position.copy(camera.position);
    const Dc=camera.position.distanceTo(controls.target),cl=curSt.clar??.8;fogO.near=Dc*.9;fogO.far=Dc*(1.6+6*cl);
    const e=camera.matrixWorld.elements;puM.uniforms.uCamR.value.set(e[0],e[1],e[2]);puM.uniforms.uCamU.value.set(e[4],e[5],e[6]);camF.set(-e[8],-e[9],-e[10]);
    puM.uniforms.uFogNear.value=fogO.near;puM.uniforms.uFogFar.value=fogO.far;puM.uniforms.uFogCol.value.copy(fogO.color);
    if(PN&&(dirty||!lastCam.equals(camera.matrixWorld))){sortPuffs();lastCam.copy(camera.matrixWorld)}else if(!PN)pg.instanceCount=0;
    if(PRon){const sz=Math.min(Math.max(Dc*1.15,2500),70000),k=renderer.domElement.height/(2*Math.tan(THREE.MathUtils.degToRad(camera.fov/2)));
      for(const m of[rainM,snowM]){const u=m.uniforms;u.uC.value.set(controls.target.x,controls.target.z);u.uSz.value.set(sz,sz);u.uBot.value=minH-100;u.uTop.value=PRtop;u.uT.value=now/1000;u.uRate.value=PRrate;u.uSnowL.value=PRsl;u.uDim.value=dimF;for(let j=0;j<6;j++)u.uCells.value[j].copy(PRC[j]||Z4)}
      rainM.uniforms.uFall.value=(PRtop-minH)*.85;rainM.uniforms.uLen.value=Dc*.014;rainM.uniforms.uDrift.value.copy(PRdir).multiplyScalar(Dc*.03);
      snowM.uniforms.uFall.value=(PRtop-minH)*.1;snowM.uniforms.uDrift.value.copy(PRdir).multiplyScalar(Dc*.012);snowM.uniforms.uSize.value=Dc*.0035*k;snowM.uniforms.uPx.value=renderer.getPixelRatio()}
    if(curSt.cells&&curSt.cells.some(c=>c.lit)&&now>nextStrike){strike(now);nextStrike=now+900+Math.random()*3600}
    if(bolt.visible){const el=now-boltT;boltM.opacity=el<60?1:el<110?.2:el<170?.95:Math.max(0,1-(el-170)/140);if(el>110&&el<170)flash=Math.max(flash,.8);if(el>320)bolt.visible=false}
    flash=Math.max(0,flash-dt*5);hemi.intensity=baseHemi+flash*.22;skyM.uniforms.uFlash.value=flash*.18;puM.uniforms.uFlash.value=flash*.5;flashEl.style.opacity=(flash*.05).toFixed(3);
    windFrame(dt)}
  return{time(force){apply(force)},frame,ex(){U.uEx.value=S.ex;placeY();dirty=true;renderer.shadowMap.needsUpdate=true}}}

HP.viewer={open,close,current:()=>D,updateForecast:()=>updateForecast(true)};
})();
