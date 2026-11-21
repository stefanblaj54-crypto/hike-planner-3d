'use strict';
/* Hike Planner 3D: appearance. Themes, light and dark, accent colour, text size, corners and the home-screen skyline.
   Loaded in <head> so the saved look is in place before the first paint. */
(function(){
const HP=window.HP=window.HP||{};
/* ---------- colour helpers ---------- */
const hx=h=>{h=String(h).replace('#','');if(h.length===3)h=h.split('').map(c=>c+c).join('');const n=parseInt(h,16);return[(n>>16)&255,(n>>8)&255,n&255]};
const toHex=a=>'#'+a.map(v=>Math.max(0,Math.min(255,Math.round(v))).toString(16).padStart(2,'0')).join('');
const mix=(a,b,t)=>{const A=hx(a),B=hx(b);return toHex(A.map((v,i)=>v+(B[i]-v)*t))};
const lum=h=>{const c=hx(h).map(v=>{v/=255;return v<=.03928?v/12.92:Math.pow((v+.055)/1.055,2.4)});return .2126*c[0]+.7152*c[1]+.0722*c[2]};
const contrast=(a,b)=>{const x=lum(a),y=lum(b);return(Math.max(x,y)+.05)/(Math.min(x,y)+.05)};
const rgba=(h,a)=>{const c=hx(h);return`rgba(${c[0]},${c[1]},${c[2]},${a})`};

/* ---------- themes: the band (header, hero, ridge) and one accent ---------- */
const THEMES=[
  {id:'spruce',name:'Spruce',band:'#0f2a22',acc:'#d6262e',note:'Forest green, trail red'},
  {id:'titanium',name:'Titanium',band:'#23282d',acc:'#46bfe0',metal:true,note:'Brushed metal, glass'},
  {id:'signpost',name:'Signpost',band:'#1d1d1b',acc:'#f2c200',note:'Black, signpost yellow'},
  {id:'glacier',name:'Glacier',band:'#0d2a45',acc:'#3aa0db',note:'Deep blue, glacier ice'},
  {id:'larch',name:'Larch',band:'#2c2217',acc:'#e3a21f',note:'Dark wood, autumn larch'},
  {id:'alpenglow',name:'Alpenglow',band:'#291b33',acc:'#ee5c80',note:'Violet, evening light'},
  {id:'fjord',name:'Fjord',band:'#0c3537',acc:'#f28a22',note:'Sea green, orange'},
  {id:'limestone',name:'Limestone',band:'#e3e6df',acc:'#1d6b46',note:'Pale stone, pine'}];
const ACCENTS=['#d6262e','#f28a22','#f2c200','#3aa655','#3aa0db','#5b5bd6','#ee5c80','#8d949a'];
const ROUTE={
  vivid:{name:'Vivid',c:['#f76707','#7048e8','#1c7ed6','#0ca678','#e64980','#f59f00','#4263eb','#ae3ec9','#2b8a3e','#c92a2a']},
  earth:{name:'Earth',c:['#c2410c','#4d7c0f','#0e7490','#a16207','#7e22ce','#be123c','#15803d','#1d4ed8','#b45309','#475569']},
  bold:{name:'Bold',c:['#ff3b30','#007aff','#ffcc00','#34c759','#af52de','#ff9500','#00c7be','#ff2d55','#5856d6','#a2845e']}};
const DEF={theme:'spruce',mode:'auto',acc:'',bg:'3d',tod:true,dim:30,text:'m',corners:'soft',list:'cards',totals:true,name:'',route:'vivid',texture:false,lv:2};
const KEY='hp-look';
let P=load(),PAL=null;
function load(){try{const o=JSON.parse(localStorage.getItem(KEY)||'{}');
  // looks saved before version 1.5 move once to the new home screen: the 3D picture and cards (the old defaults were the skyline and rows)
  if(o&&typeof o==='object'&&!o.lv){if(!o.bg||o.bg==='skyline')o.bg='3d';if(!o.list||o.list==='rows')o.list='cards';o.lv=2}
  return Object.assign({},DEF,o&&typeof o==='object'?o:{})}catch(e){return Object.assign({},DEF)}}
function save(){try{localStorage.setItem(KEY,JSON.stringify(P))}catch(e){}}
const mq=matchMedia('(prefers-color-scheme: dark)');

function palette(){
  const t=THEMES.find(x=>x.id===P.theme)||THEMES[0],dark=P.mode==='dark'||(P.mode==='auto'&&mq.matches),paleBand=lum(t.band)>.4;
  const acc=/^#[0-9a-f]{6}$/i.test(P.acc)?P.acc:t.acc,o={dark,theme:t};
  if(!dark){o.bg=paleBand?mix('#ffffff',t.band,.3):mix('#ffffff',t.band,.05);o.panel='#ffffff';o.ink=mix('#111412',t.band,paleBand?.1:.32);o.line=mix(o.bg,paleBand?'#5b6058':t.band,.13);o.band=t.band}
  else{const base=paleBand?'#1c1f1b':t.band;o.bg=mix(base,'#000000',.6);o.panel=mix(o.bg,'#ffffff',.055);o.ink=mix('#eef1ef',base,.05);o.line=mix(o.bg,'#ffffff',.12);o.band=paleBand?'#262a24':mix(t.band,'#000000',.2)}
  o.mute=mix(o.ink,o.bg,.4);
  o.bandInk=lum(o.band)>.4?'#15181a':'#ffffff';o.bandMute=mix(o.bandInk,o.band,.32);o.bandLine=mix(o.bandInk,o.band,.82);
  o.acc=acc;o.accInk=contrast(acc,'#ffffff')>=3.1?'#ffffff':'#151515';
  let at=acc;for(let k=0;k<24&&contrast(at,o.bg)<4.5;k++)at=mix(at,dark?'#ffffff':'#000000',.08);o.accText=at;
  o.sel=dark?mix(o.band,'#ffffff',.2):(paleBand?mix(t.band,'#000000',.62):t.band);o.selInk=lum(o.sel)>.4?'#151515':'#ffffff';
  o.sky1=dark?mix(o.bg,'#000000',.25):mix('#ffffff',paleBand?'#6d8a9c':t.band,.16);o.sky2=dark?o.bg:mix('#ffffff',t.band,.04);
  o.glass=dark?rgba(o.panel,.93):'rgba(255,255,255,.94)';o.warn=dark?'#ffb35c':'#a35400';o.danger=dark?'#ff7070':'#c4262e';o.fcb=mix(acc,o.bg,.55);o.ok=dark?'#5fd081':'#2f8f46';
  return o}
function apply(){
  PAL=palette();const r=document.documentElement,s=r.style,o=PAL;
  const V={'--bg':o.bg,'--panel':o.panel,'--ink':o.ink,'--mute':o.mute,'--line':o.line,'--band':o.band,'--band-ink':o.bandInk,'--band-mute':o.bandMute,'--band-line':o.bandLine,
    '--acc':o.acc,'--acc-ink':o.accInk,'--acc-text':o.accText,'--sel':o.sel,'--sel-ink':o.selInk,'--sky1':o.sky1,'--sky2':o.sky2,'--glass':o.glass,'--warn':o.warn,'--danger':o.danger,'--fcb':o.fcb,'--ok':o.ok,
    '--band-glass':o.bandInk==='#ffffff'?'rgba(255,255,255,.1)':'rgba(0,0,0,.05)','--band-glass-line':o.bandInk==='#ffffff'?'rgba(255,255,255,.34)':'rgba(0,0,0,.2)'};
  for(const k in V)s.setProperty(k,V[k]);
  s.setProperty('--rk',String({soft:1,sharp:.3,round:1.75}[P.corners]||1));
  s.fontSize={m:'100%',l:'112.5%',xl:'125%'}[P.text]||'100%';
  if(o.theme.metal){const b=o.band;s.setProperty('--band-img',`linear-gradient(180deg,${mix(b,'#ffffff',.2)} 0%,${mix(b,'#ffffff',.07)} 46%,${b} 54%,${mix(b,'#ffffff',.1)} 100%)`)}
  else s.removeProperty('--band-img');
  r.dataset.mode=o.dark?'dark':'light';r.dataset.theme=o.theme.id;r.dataset.list=P.list;r.dataset.texture=P.texture?'on':'off';s.colorScheme=o.dark?'dark':'light';
  const m=document.querySelector('meta[name=theme-color]');if(m)m.content=o.band;
  document.dispatchEvent(new CustomEvent('hp-look'))}
mq.addEventListener?mq.addEventListener('change',()=>{if(P.mode==='auto')apply()}):mq.addListener(()=>{if(P.mode==='auto')apply()});

/* ---------- the sky: by time of day, or in the theme's colours ---------- */
const TOD=[[0,'#0a1228','#1b2846'],[4.8,'#0f1734','#2a2f55'],[6,'#33356a','#e5957c'],[7.3,'#4677bd','#cfdfe9'],[12,'#3c72bf','#d8e7f1'],[16.6,'#4673b6','#e8dcc6'],[18.4,'#3a376a','#ef9659'],[19.6,'#232852','#9c5d7a'],[21,'#0e1630','#222e4c'],[24,'#0a1228','#1b2846']];
function skyAt(hour){let a=TOD[0],b=TOD[1];for(let k=1;k<TOD.length;k++)if(hour<=TOD[k][0]){a=TOD[k-1];b=TOD[k];break}const f=(hour-a[0])/Math.max(.01,b[0]-a[0]);
  const top=mix(a[1],b[1],f),hor=mix(a[2],b[2],f),day=hour>6.1&&hour<19.4,sunF=day?(hour-6.1)/13.3:0;
  return{top,hor,ink:'#ffffff',sun:day?{x:.12+.76*sunF,y:.8-.46*Math.sin(Math.PI*sunF),warm:Math.max(0,1-Math.sin(Math.PI*sunF)*1.6)}:null,night:hour<5.4||hour>20.2}}
function sky(){const o=PAL||palette();if(P.tod){const h=+(new URLSearchParams(location.search).get('hour')??NaN);const d=new Date();return skyAt(isFinite(h)?h:d.getHours()+d.getMinutes()/60)}
  const pale=lum(o.band)>.4;return pale?{top:mix(o.band,'#4f6d80',.62),hor:mix(o.band,'#9db2bf',.5),ink:'#15181a',sun:null,night:false}:{top:mix(o.band,'#ffffff',o.dark?.1:.2),hor:mix(o.band,'#ffffff',o.dark?.42:.72),ink:'#ffffff',sun:null,night:false}}

/* ---------- the skyline: a hike's real elevation profile drawn as a ridge ---------- */
function rnd(seed){let s=seed|0;return()=>{s=s+0x6D2B79F5|0;let t=Math.imul(s^s>>>15,1|s);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296}}
function skyline(prof,o){ // returns {svg, y(fr)}; y is a fraction of the height. o.top/o.bot: where the highest and lowest points sit
  const n=prof.length,W=1000,H=400;let lo=Math.min(...prof),hi=Math.max(...prof);const span=Math.max(hi-lo,550),mid=(hi+lo)/2;lo=mid-span/2;hi=mid+span/2;
  const top=o.top??.3,bot=o.bot??.88,Y=e=>top+(1-(e-lo)/(hi-lo))*(bot-top);
  const pts=prof.map((e,i)=>[i/(n-1)*W,Y(e)*H]);
  // a distant range: fractal noise, sitting in the upper half of the ridge band, mostly hidden behind the main ridge
  const r=rnd((o.seed||7)*977),oct=[[3,.55],[8,.27],[19,.13],[41,.05]].map(([f,a])=>({f,a,v:Array.from({length:f+2},r)}));
  const sm=t=>t*t*(3-2*t),noise=x=>oct.reduce((s,q)=>{const u=x*q.f,i=Math.floor(u),t=sm(u-i);return s+q.a*(q.v[i]*(1-t)+q.v[i+1]*t)},0);
  const far=[];for(let i=0;i<=120;i++){const x=i/120;far.push([x*W,(top+(bot-top)*(.08+.62*(1-noise(x))))*H])}
  const path=p=>'M'+p.map(q=>q[0].toFixed(1)+' '+q[1].toFixed(1)).join('L');
  const svg=`<svg class="ridge" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true" stroke="none">
<defs><linearGradient id="haze${o.seed||7}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${o.hor}" stop-opacity="0"/><stop offset="1" stop-color="${o.hor}" stop-opacity=".6"/></linearGradient></defs>
<path d="${path(far)}L${W} ${H}L0 ${H}Z" fill="${o.far}"/>
<rect x="0" y="${(top*H).toFixed(1)}" width="${W}" height="${((1-top)*H).toFixed(1)}" fill="url(#haze${o.seed||7})"/>
<path d="${path(pts)}L${W} ${H}L0 ${H}Z" fill="${o.band}"/>
<path d="${path(pts)}" fill="none" stroke="${o.rim}" stroke-width="1.5" vector-effect="non-scaling-stroke" stroke-linejoin="round"/></svg>`;
  return{svg,y:fr=>{const x=Math.min(1,Math.max(0,fr))*(n-1),i=Math.min(n-2,Math.floor(x)),f=x-i;return Y(prof[i]*(1-f)+prof[i+1]*f)}}}
function stars(seed){const r=rnd(seed||3);let s='';for(let k=0;k<70;k++){const x=r()*100,y=r()*58,a=.25+r()*.75,z=r()<.12?1.6:1;s+=`<circle cx="${x.toFixed(2)}" cy="${y.toFixed(2)}" r="${(z*.16).toFixed(2)}" fill="#fff" opacity="${a.toFixed(2)}"/>`}
  return`<svg class="stars" viewBox="0 0 100 100" preserveAspectRatio="xMidYMid slice" aria-hidden="true" stroke="none">${s}</svg>`}

/* ---------- small helpers for the rest of the app ---------- */
const ICONS={sun:'<circle cx="12" cy="12" r="4.2"/><path d="M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M5.3 5.3l1.5 1.5M17.2 17.2l1.5 1.5M5.3 18.7l1.5-1.5M17.2 6.8l1.5-1.5"/>',
  part:'<path d="M8.5 4.5v1.6M3.5 9.5h1.6M5.2 6.2l1.1 1.1M12 6.6a4 4 0 0 0-6.6 4.6"/><path d="M8 19.5a3.8 3.8 0 1 1 .9-7.5 5 5 0 0 1 9.4 1.4 3.1 3.1 0 0 1-.6 6.1z"/>',
  cloud:'<path d="M7 18.5a4.3 4.3 0 1 1 1.1-8.4A5.6 5.6 0 0 1 18.8 12a3.3 3.3 0 0 1-.6 6.5z"/>',
  rain:'<path d="M7 15a4.5 4.5 0 1 1 1.2-8.8A5.8 5.8 0 0 1 19 8.1a3.6 3.6 0 0 1-.6 6.9H7"/><path d="M8.5 18l-1 2.8M12.5 18l-1 2.8M16.5 18l-1 2.8"/>',
  storm:'<path d="M7 16.5a4.5 4.5 0 1 1 1.2-8.8A5.8 5.8 0 0 1 19 9.6a3.6 3.6 0 0 1-.6 7"/><path d="M13 12.5l-2.6 4.5h3.4l-2.4 4.5"/>',
  snow:'<path d="M12 2.5v19M3.8 7.3l16.4 9.4M3.8 16.7l16.4-9.4M9.3 3.8L12 5.6l2.7-1.8M9.3 20.2l2.7-1.8 2.7 1.8"/>',
  fog:'<path d="M6.5 11a4 4 0 0 1 7.6-1.6A3.5 3.5 0 0 1 19 11"/><path d="M3 14.5h18M5 18h14M8 21.5h8"/>',
  wind:'<path d="M3 8.5h10.5a3 3 0 1 0-3-3M3 12.5h15a3 3 0 1 1-3 3M3 16.5h6"/>'};
HP.look={THEMES,ACCENTS,ROUTE,DEF,ICONS,mix,rgba,lum,contrast,skyAt,sky,skyline,stars,
  get:()=>P,pal:()=>PAL||palette(),
  set(k,v){P[k]=v;save();apply()},setMany(o){Object.assign(P,o);save();apply()},
  reset(){P=Object.assign({},DEF);save();apply()},
  routeColors:()=>(ROUTE[P.route]||ROUTE.vivid).c};
apply();
})();
