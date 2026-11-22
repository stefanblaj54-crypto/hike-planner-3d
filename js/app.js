'use strict';
/* Hike Planner 3D: screens, the home screen, the menu, Customize, the planning map, file import, building a plan */
(function(){
const {$,$$,nf,fmtH,esc,isoDay,parseDay,fmtDate}=HP.u;
const LOOK=HP.look;
const coarse=matchMedia('(pointer: coarse)').matches;
const isIOS=/iPad|iPhone|iPod/.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
const standalone=()=>matchMedia('(display-mode: standalone)').matches||navigator.standalone===true;
const VERSION='2.1';
const SCREENS=['home','new','build','view','custom','about','inv','detail'];
let cur='',viewId=null,building=null,installEvt=null,pendingDet=null,pendingLook=null,pendingShow=null,pendingGuide=false,viewScroll=0;

/* ---------- navigation ---------- */
function show(name,title){cur=name;SCREENS.forEach(s=>{$('#scr-'+s).hidden=s!==name});document.body.dataset.screen=name;
  $('#menubtn').hidden=name!=='home';$('#back').hidden=name==='home';$('#more').hidden=name!=='view';$('#ttl').textContent=title||'Hike Planner 3D';
  document.title=title?`${title} · Hike Planner 3D`:'Hike Planner 3D';window.scrollTo(0,0);headerState()}
const depth=()=>(history.state&&history.state.d)||0;
function go(hash){history.pushState({d:depth()+1},'',hash);route()}
function replace(hash){history.replaceState({d:depth()},'',hash);route()}
function back(hint){hint=typeof hint==='string'?hint:null;if(depth()>0){navHint=hint;history.back()}else{navHint=hint||'pop';replace('#/')}}
let navD=null,vtPic=null,navHint=null;
async function route(){
  const h=location.hash.replace(/^#\/?/,''),target=h.startsWith('hike/')?'view':h==='new'?'new':h==='customize'?'custom':h==='about'?'about':h==='inventory'?'inv':'home';
  if(cur==='view'&&target==='view'&&decodeURIComponent(h.slice(5))===viewId){syncDetail();syncGuide();return}
  // the first screen just appears; going deeper slides in from the right, going back the reverse; a hike's picture grows into its 3D view
  const d=depth();let type=navD==null||cur==='build'?'none':navHint||(d>navD?'push':d<navD?'pop':'fade'),from=null;navD=d;navHint=null;
  if(vtPic&&target==='view'&&type!=='none'){from=vtPic;type='hero'}vtPic=null;
  return HP.motion.vt(()=>routeTo(h,target),{type,from,name:'pic',to:type==='hero'?()=>$('#stage'):null})}
async function routeTo(h,target){
  if(HP.guide.active())closeGuide(true);
  if(building&&target!=='new')cancelBuild();
  if(cur==='view'&&(target!=='view'||h.slice(5)!==viewId)){await flushSave();HP.viewer.close();viewId=null}
  if(updPending&&(target==='home'||target==='about')){try{sessionStorage.setItem('hp-upd',Date.now())}catch(e){}location.reload();return}
  if(target==='view')return openHike(decodeURIComponent(h.slice(5)));
  if(target==='new'){if(cur!=='new'&&cur!=='build')openNew();return}
  if(target==='custom'){if(cur!=='custom'){show('custom','Customize');renderCustom()}return}
  if(target==='about'){show('about','About');$('#ver').textContent=`Version ${VERSION}`;return}
  if(target==='inv'){if(cur!=='inv'){show('inv','Inventory');renderInv()}return}
  showHome();offerResume()}
addEventListener('popstate',route);
$('#back').addEventListener('click',()=>{if(cur==='build'){cancelBuild();show('new','New hike');refreshNewMap();return}back()});
// on the home screen the header floats over the sky until the page scrolls past it
function headerState(){const t=$('#top');if(cur!=='home'){t.classList.remove('solid');return}const sky=$('#hero .hero-sky');t.classList.toggle('solid',scrollY>(sky?sky.offsetHeight-t.offsetHeight-6:160))}
addEventListener('scroll',headerState,{passive:true});

/* ---------- dialogs ---------- */
function ask(msg,{input=null,ok='OK',danger=false,cancel=true,html=false}={}){return new Promise(res=>{const d=$('#dialog'),inp=$('#dlginput');
  if(html)$('#dlgmsg').innerHTML=msg;else $('#dlgmsg').textContent=msg;$('#dlgmsg').classList.toggle('rich',html);inp.hidden=input===null;inp.value=input||'';$('#dlgok').textContent=ok;$('#dlgok').classList.toggle('danger',danger);$('#dlgno').hidden=!cancel;HP.motion.open(d);(input!==null?inp:$('#dlgok')).focus();
  const done=v=>{HP.motion.close(d);$('#dlgok').onclick=$('#dlgno').onclick=d.onclick=inp.onkeydown=null;res(v)};
  $('#dlgok').onclick=()=>done(input!==null?inp.value.trim():true);$('#dlgno').onclick=()=>done(null);
  d.onclick=e=>{if(e.target===d)done(null)};inp.onkeydown=e=>{if(e.key==='Enter')$('#dlgok').click()}})}
addEventListener('keydown',e=>{if(e.key!=='Escape')return;if(!$('#ied').hidden)$('#iedno').click();else if(!$('#dialog').hidden)$('#dlgno').click();else if(!$('#drawer').hidden)closeDrawer();else if(!$('#sheet').hidden)HP.motion.close($('#sheet'))});

/* ---------- home: the next hike as a skyline, then the list ---------- */
// sample skyline for an empty app: the Făgăraș ridge from Bâlea Lac to Vârful Moldoveanu (OpenStreetMap trail, SRTM heights)
const SAMPLE={prof:[2039,2037,2067,2106,2156,2200,2271,2295,2322,2300,2276,2252,2257,2271,2288,2300,2296,2286,2215,2188,2141,2142,2118,2099,2086,2079,2082,2124,2162,2166,2181,2156,2115,2123,2149,2157,2140,2103,2030,1962,1958,1971,1990,2024,2079,2130,2141,2143,2086,2084,2080,2083,2112,2180,2253,2296,2234,2186,2200,2210,2226,2267,2301,2296,2315,2336,2349,2354,2344,2329,2336,2334,2286,2252,2225,2232,2270,2286,2308,2297,2293,2302,2309,2332,2347,2321,2318,2303,2302,2304,2318,2318,2310,2306,2342,2407,2457,2498,2499,2508],
  pin:{fr:.99,e:2544,name:'Vârful Moldoveanu'},cap:'The Făgăraș ridge from Bâlea Lac',pic:'the Bärentrek in the Bernese Oberland'};
const fmtKm=k=>{k=+k||0;return k<20?k.toFixed(1):nf.format(Math.round(k))};
const daysTo=s=>Math.round((parseDay(s)-parseDay(isoDay(new Date())))/864e5);
function fmtRange(a,b){const A=parseDay(a),B=parseDay(b||a),wd=d=>d.toLocaleDateString('en-GB',{weekday:'short'}),mo=d=>d.toLocaleDateString('en-GB',{month:'short'});
  if(!b||a===b)return`${wd(A)} ${A.getDate()} ${mo(A)}`;
  return A.getMonth()===B.getMonth()?`${wd(A)} ${A.getDate()} – ${wd(B)} ${B.getDate()} ${mo(B)}`:`${wd(A)} ${A.getDate()} ${mo(A)} – ${wd(B)} ${B.getDate()} ${mo(B)}`}
let nextMeta=null,latestMeta=null,lastList=[],hasPhoto=false;const fcFail=new Set();
// the three dials of the next hike: the chance of fair weather, the effort of the hardest day, the daylight left on the tightest day
const hmm=h=>`${Math.floor(h)}:${String(Math.round((h%1)*60)).padStart(2,'0')}`.replace(/(\d+):60/,(x,a)=>`${+a+1}:00`);
function ringsOf(m){const R=[],pf=m.wx&&m.wx.pct?m.wx.pct.fair||0:null;
  R.push(pf==null?{v:0,c:'var(--line)',val:'–',label:'Fair weather',aria:'Fair weather not known yet'}:{v:pf/100,c:pf>=55?'var(--good)':pf>=30?'var(--fair)':'var(--bad)',val:`${pf}<i>%</i>`,label:'Fair weather',aria:`Fair weather ${pf}%`,det:'wx'});
  if(m.eff!=null)R.push({v:Math.min(1,m.eff/45),c:'var(--eff)',val:Math.round(m.eff),unit:HP.effortWord(m.eff),label:'Effort',aria:`Effort ${Math.round(m.eff)}, ${HP.effortWord(m.eff)}`,det:'effort'});
  if(m.dl!=null){const x=m.dl;R.push({v:x<0?1:Math.max(.02,Math.min(1,x/5)),c:x>=1?'var(--good)':x>=0?'var(--fair)':'var(--bad)',val:(x<0?'−':'')+hmm(Math.abs(x)),unit:x<0?'after dark':'h spare',label:'Daylight',aria:x<0?`Arrive ${hmm(-x)} after dark`:`${hmm(x)} of daylight to spare`,det:'daylight'})}
  return R}
function heroModel(next,count){
  if(next){const n=daysTo(next.date),e=daysTo(next.end||next.date);
    const when=n>1?`In ${n} days`:n===1?'Tomorrow':n===0?'Today':e>=0?`Day ${1-n}`:'';
    return{kind:'next',m:next,meta:[when,fmtRange(next.date,next.end),`${next.days} ${next.days>1?'days':'day'}`].filter(Boolean).join(' · '),title:next.name,
      rings:ringsOf(next),stats:[[fmtKm(next.km),'km'],[nf.format(next.up),'m up'],...(next.hi?[[nf.format(next.hi),'m top']]:[])],
      nums:[[fmtKm(next.km),'km'],[nf.format(next.up),'m up'],[next.days,next.days>1?'days':'day']],
      prof:next.prof||SAMPLE.prof,pin:next.prof?{fr:next.hiFr,e:next.hi,name:next.hiName}:null,nights:next.nights||[],go:['open','Open in 3D'],alt:['new','New hike']}}
  return{kind:count?'more':'first',meta:'',title:count?'Where to next?':'Plan your first hike',
    text:'Draw a route on the map or import a GPX file.',
    prof:SAMPLE.prof,pin:SAMPLE.pin,cap:SAMPLE.cap,nights:[],go:['draw','Draw a route'],alt:['import','Import a GPX file']}}
const ring=r=>{const C=2*Math.PI*44,len=Math.max(0,Math.min(1,r.v))*C;
  return`<div class="ring"${r.det?` role="button" tabindex="0" data-det="${r.det}"`:' role="img"'} aria-label="${esc(r.aria)}" style="--c:${r.c}"><div class="rd"><svg viewBox="0 0 100 100" aria-hidden="true"><circle class="trk" cx="50" cy="50" r="44"/><circle class="arc" cx="50" cy="50" r="44" stroke-dasharray="${len.toFixed(1)} ${C.toFixed(1)}"/></svg><div class="rv"><b>${r.val}</b>${r.unit?`<small>${esc(r.unit)}</small>`:''}</div></div><span class="micro">${esc(r.label)}</span></div>`};
function skyParts(model,mini){
  const pal=LOOK.pal(),sky=LOOK.sky();let h='';
  if(sky.night)h+=LOOK.stars(11);
  if(sky.sun){const w=sky.sun.warm,c1=LOOK.mix('#fff8e4','#ffbe7a',w),c2=LOOK.mix('#ffe7ad','#ff8f52',w);h+=`<span class="sun" style="left:${(sky.sun.x*100).toFixed(1)}%;top:${(sky.sun.y*100).toFixed(1)}%;background:radial-gradient(circle,${c1} 0 21%,${LOOK.rgba(c2,.45)} 25%,${LOOK.rgba(c2,0)} 68%)"></span>`}
  else if(sky.night)h+='<span class="moon" style="left:79%;top:26%"></span>';
  // keep the summit label clear of the header: the ridge starts below it, and day labels fit under the ridge
  const skyH=mini?140:Math.min(innerWidth>=900?520:470,Math.max(innerWidth>=900?300:270,innerHeight*(innerWidth>=900?.5:.46))),hdr=mini?0:($('#top').offsetHeight||58);
  const sl=LOOK.skyline(model.prof,{band:pal.band,far:LOOK.mix(LOOK.mix(pal.band,sky.top,.5),sky.hor,.34),hor:sky.hor,rim:LOOK.mix(pal.band,'#ffffff',.24),seed:7,top:Math.min(.55,(hdr+(mini?46:66))/skyH),bot:1-(mini?18:30)/skyH});h+=sl.svg;
  if(model.pin&&isFinite(model.pin.fr)){const fr=model.pin.fr,side=fr>.8?' r':fr<.2?' l':'';
    h+=`<span class="pin${side}" style="left:${(fr*100).toFixed(2)}%;top:${(sl.y(fr)*100).toFixed(2)}%"><b>${nf.format(Math.round(model.pin.e))} m${model.pin.name&&!mini?`<small>${esc(model.pin.name)}</small>`:''}</b><i></i><s></s></span>`}
  const b=[0,...model.nights,1];
  model.nights.forEach(f=>{h+=`<span class="dayline" style="left:${(f*100).toFixed(2)}%;top:${(sl.y(f)*100+1).toFixed(2)}%"></span>`});
  if(model.nights.length)for(let k=0;k<b.length-1;k++){if(b[k+1]-b[k]<(mini?.18:.11))continue;h+=`<span class="daylab" style="left:${((b[k]+b[k+1])/2*100).toFixed(2)}%">Day ${k+1}</span>`}
  if(model.cap&&!mini)h+=`<p class="skycap">${esc(model.cap)}</p>`;
  return{html:h,bg:`linear-gradient(180deg,${sky.top} 0%,${sky.hor} 100%)`,ink:sky.ink}}
const mbar=pc=>{const ks=HP.WXK.filter(k=>pc[k]>0).sort((a,b)=>pc[b]-pc[a]);return`<span class="mbar" aria-hidden="true">${ks.map(k=>`<i style="background:${HP.WXT[k].c};flex:${pc[k]} 1 0"></i>`).join('')}</span>`};
const topK=pc=>HP.WXK.reduce((a,b)=>pc[b]>pc[a]?b:a);
function fcHTML(m){const w=HP.forecastWindow(m.date),wx=m.wx,dayWx=d=>wx&&wx.days?wx.days.find(x=>x.d===d):null;
  if(m.fcd&&m.fcd.length)return`<div class="hfc${m.fcd.length<=4?' fit':''}" role="list" aria-label="Forecast for the hike" style="--n:${m.fcd.length}">${m.fcd.map(d=>{const x=dayWx(d.d),ens=x&&x.src==='ens'&&x.pct,k=ens?topK(x.pct):null;
      return`<div class="fcd" role="listitem"><span class="micro">${esc(fmtDate(d.d,{weekday:'short',day:'numeric'}))}</span><svg viewBox="0 0 24 24" aria-hidden="true">${LOOK.ICONS[k?HP.WXT[k].ic:d.ic]||LOOK.ICONS.cloud}</svg>${k?`<b>${x.pct[k]}%</b><span>${HP.WXT[k].short}</span>`:''}<span class="tmp">${degS(d.tx)} / ${degS(d.tn)}</span>${d.pr>=1?`<span class="mm">${Math.round(d.pr)} mm</span>`:''}${ens?mbar(x.pct):''}</div>`}).join('')}</div>`;
  if(w.days>15){const fd=parseDay(m.date);fd.setDate(fd.getDate()-15);return`<p class="fcwhen micro">Forecast from ${esc(fd.toLocaleDateString('en-GB',{weekday:'short',day:'numeric',month:'short'}))}</p>`}
  if(w.ok)return`<p class="fcwhen micro">${fcFail.has(m.id)?'Forecast unavailable':navigator.onLine?'Getting the forecast…':'Forecast loads when online'}</p>`;
  return''}
const degS=v=>`${Math.round(v)}°`.replace('-','−');
/* the 3D pictures of the hikes (saved by the 3D view as <id>:cover) and the sample picture for an empty list */
const COV=new Map(),SAMPLE_PIC={w:'img/sample-wide.jpg',t:'img/sample-tall.jpg'},wideHero=()=>innerWidth>=900;
const inkOf=url=>new Promise(ok=>{const im=new Image();im.onload=()=>{try{const c=document.createElement('canvas');c.width=12;c.height=16;const x=c.getContext('2d');x.drawImage(im,0,0,12,16);
  const d=x.getImageData(0,0,12,2).data;let L=0;for(let i=0;i<d.length;i+=4)L+=(.2126*d[i]+.7152*d[i+1]+.0722*d[i+2])/255;ok(L/(d.length/4)>.56?'#13201a':'#fff')}catch(e){ok('#fff')}};im.onerror=()=>ok('#fff');im.src=url});
async function coverOf(m,wide){if(!m||!m.cover)return null;const key=m.id+(wide?':w':':t'),c=COV.get(key);if(c&&c.k===m.cover)return c;
  const b=await HP.db.blob(m.id+(wide?':coverw':':cover')).catch(()=>null);if(!b)return null;if(c)URL.revokeObjectURL(c.url);
  const o={k:m.cover,url:URL.createObjectURL(b),ch:inSwiss(m.center)};COV.set(key,o);return o}
const sampleCover=wide=>{const k=wide?'w':'t';return COV.get('sample:'+k)||COV.set('sample:'+k,{url:SAMPLE_PIC[k],sample:true,ch:true}).get('sample:'+k)};
const dropCovers=id=>['w','t'].forEach(k=>{const c=COV.get(id+':'+k);if(c){URL.revokeObjectURL(c.url);COV.delete(id+':'+k)}});
// swisstopo pictures are used close up in and around Switzerland, so those pictures carry its credit too
const inSwiss=c=>!!c&&c.lat>45.6&&c.lat<48.05&&c.lon>5.7&&c.lon<10.75;
const SATCREDIT='Satellite picture: Sentinel-2 cloudless - https://s2maps.eu by EOX IT Services GmbH (Contains modified Copernicus Sentinel data 2025)';
function blobURL(root,b){const u=URL.createObjectURL(b);(root._urls||(root._urls=[])).push(u);return u}
async function renderHero(root,model,{mini=false}={}){
  const P=LOOK.get(),pal=LOOK.pal();let bg=P.bg,ink=pal.bandInk,bgHTML='',skyStyle='',skyInner='';
  let img=null,cv=null;if(bg==='photo')img=await HP.db.blob('app:photo').catch(()=>null);else if(bg==='map'){const m=model.m||latestMeta;if(m)img=await HP.db.blob(m.id+':relief').catch(()=>null)}
  // the 3D picture of the next hike; with no hike ahead, the latest hike's picture or the sample; a next hike without a picture yet keeps the skyline
  else if(bg==='3d'){const m=model.kind==='next'?model.m:latestMeta,wide=mini||wideHero();cv=await coverOf(m,wide);if(!cv&&model.kind!=='next')cv=sampleCover(wide);
    // the header sits on the picture's sky: dark letters on a pale sky (the usual case, so the first guess), white on a dark one
    if(!cv)bg='skyline';else if(!mini&&!cv.ink)inkOf(cv.url).then(k=>{cv.ink=k;if(cur==='home'&&root.dataset.bg==='3d'&&root.querySelector(`img.cov[src="${cv.url}"]`))document.body.style.setProperty('--sky-ink',k)})}
  (root._urls||[]).forEach(u=>URL.revokeObjectURL(u));root._urls=[];
  if(bg==='photo'||bg==='map'){if(img){bgHTML=`<img src="${blobURL(root,img)}" alt=""><div class="shade" style="background:linear-gradient(180deg,rgba(0,0,0,.36) 0%,rgba(0,0,0,0) 24%,rgba(0,0,0,.16) 50%,rgba(6,10,8,.9) 100%),rgba(0,0,0,${(P.dim||0)/100})"></div>`;ink='#fff'}else bg=bg==='map'?'contours':'skyline'}
  if(bg==='3d'&&mini){bgHTML=`<img src="${cv.url}" alt=""><div class="shade" style="background:linear-gradient(180deg,rgba(0,0,0,0) 30%,rgba(6,10,8,.88) 100%)"></div>`;ink='#fff';bg='photo'}
  else if(bg==='3d'){bgHTML=`<img class="blur" src="${cv.url}" alt=""><div class="shade"></div>`;ink=cv.ink||'#13201a';skyInner=`<img class="cov" src="${cv.url}" alt="">`}
  if(bg==='contours')bgHTML='<div class="lines"></div>';
  if(bg==='skyline'){const s=skyParts(model,mini);skyInner=s.html;skyStyle=`background:${s.bg}`;ink=s.ink}
  root.dataset.bg=bg;
  const kp=list=>`<ul class="kpis">${list.map(([v,u])=>`<li><b>${v}</b><span>${u}</span></li>`).join('')}</ul>`;
  root.innerHTML=`<div class="hero-bg" aria-hidden="true">${bgHTML}</div><div class="hero-sky" style="${skyStyle}">${skyInner}</div><div class="hero-body">`+
    (model.meta?`<p class="hmeta micro">${esc(model.meta)}</p>`:'')+`<h2 class="htitle">${esc(model.title)}</h2>`+(model.text&&!mini?`<p class="htext">${esc(model.text)}</p>`:'')+
    (mini?(model.nums?kp(model.nums):''):(model.rings?`<div class="rings">${model.rings.map(ring).join('')}</div>`:'')+(model.stats?kp(model.stats):''))+
    (model.kind==='next'&&!mini?(f=>f?`<div class="hwx">${f}</div>`:'')(fcHTML(model.m)):'')+
    (!mini?`<div class="hcta"><button class="btn primary" data-act="${model.go[0]}">${model.go[1]}</button>${model.alt[0]==='new'?`<button class="btn glass round" data-act="new" aria-label="${model.alt[1]}" title="${model.alt[1]}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg></button>`:`<button class="btn glass" data-act="${model.alt[0]}">${model.alt[1]}</button>`}</div>`:'')+
    (bg==='3d'&&!mini&&model.kind!=='next'?`<p class="hcap">${cv.sample?`Sample: ${esc(SAMPLE.pic)}`:`Last hike: ${esc(latestMeta.name)}`}</p>`:'')+
    (bg==='3d'&&!mini?`<p class="hcred">${SATCREDIT}${cv.ch?' · Aerial pictures © swisstopo':''}</p>`:'')+`</div>`;
  return ink}
let homeSeq=0;
async function showHome(){show('home');await renderHome()}
async function loadHikes(){let list=[];try{list=await HP.db.list()}catch(e){HP.toast('Saved hikes could not be read: '+e.message)}
  const today=isoDay(new Date()),up=list.filter(m=>(m.end||m.date)>=today).sort((a,b)=>a.date<b.date?-1:1),past=list.filter(m=>(m.end||m.date)<today).sort((a,b)=>a.date<b.date?1:-1);
  return{list,up,past,next:up[0]||null,latest:list.slice().sort((a,b)=>(b.created||0)-(a.created||0))[0]||null}}
// the dials fill once, the first time the home screen shows in a visit: the one orchestrated moment
let ringsDrawn=false;
function drawRings(){if(ringsDrawn)return;ringsDrawn=true;if(HP.motion.reduced())return;
  document.querySelectorAll('#hero .ring .arc').forEach((a,k)=>{const v=a.getAttribute('stroke-dasharray');if(!v||!a.animate)return;const C=v.split(/\s+/)[1]||'277';
    a.animate([{strokeDasharray:`0 ${C}`},{strokeDasharray:v}],{duration:1300,delay:200+k*120,easing:'cubic-bezier(.22,1,.36,1)',fill:'backwards'})})}
async function renderHome(){const seq=++homeSeq,{list,up,past,next,latest}=await loadHikes();
  if(seq!==homeSeq)return;lastList=list;nextMeta=next;latestMeta=latest;
  const ink=await renderHero($('#hero'),heroModel(nextMeta,list.length));if(seq!==homeSeq)return;drawRings();
  document.body.style.setProperty('--sky-ink',ink);headerState();await renderList(up,past,list);if(seq!==homeSeq)return;installHint();
  const miss=list.filter(m=>m.v!==4);if(miss.length)backfill(miss).then(ch=>{if(ch&&cur==='home')renderHome()});
  else if(nextMeta)refreshForecast(nextMeta).then(ch=>{if(ch&&cur==='home')renderHome()})}
function spark(p){if(!p||p.length<2)return'';const lo=Math.min(...p),hi=Math.max(...p),r=Math.max(hi-lo,250),n=p.length,pt=p.map((e,i)=>`${(i/(n-1)*100).toFixed(1)},${(22.5-(e-lo)/r*19).toFixed(1)}`).join('L');
  return`<svg viewBox="0 0 100 24" preserveAspectRatio="none" aria-hidden="true"><path d="M0,24L${pt}L100,24Z" fill="currentColor" fill-opacity=".16" stroke="none"/><path d="M${pt}" stroke="currentColor" stroke-width="1.6" vector-effect="non-scaling-stroke"/></svg>`}
async function renderList(up,past,list){const P=LOOK.get(),cards=P.list==='cards',pics={};
  if(cards)for(const m of list){const c=await coverOf(m,true);if(c)pics[m.id]=c}
  const row=(m,old)=>`<button class="hike${old?' past':''}" data-id="${esc(m.id)}">${pics[m.id]?`<img class="th cov" src="${pics[m.id].url}" alt="">`:m.thumb?`<img class="th" src="${m.thumb}" alt="">`:'<span class="th"></span>'}<span class="nm">${esc(m.name)}</span><span class="dt micro">${esc(fmtDate(m.date,{weekday:'short',day:'numeric',month:'short',year:'numeric'}))} · ${m.days} ${m.days>1?'days':'day'}</span><span class="pf">${spark(m.prof)}<span>${fmtKm(m.km)} km</span><span>${nf.format(m.up)} m up</span></span><svg class="chev" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg></button>`;
  $('#listwrap').querySelector('.listhead').hidden=!list.length;
  const tk=list.reduce((s,m)=>s+(+m.km||0),0),tu=list.reduce((s,m)=>s+(+m.up||0),0);
  $('#totals').textContent=P.totals&&list.length>1?`${list.length} hikes · ${fmtKm(tk)} km · ${nf.format(Math.round(tu/10)*10)} m up`:'';
  $('#hikes').innerHTML=up.map(m=>row(m,false)).join('')+(past.length?`<h3 class="past-h micro">Past hikes</h3>`+past.map(m=>row(m,true)).join(''):'');
  const sat=Object.keys(pics).length||list.some(m=>m.thumb);$('#foot').innerHTML=`Stored on this phone only. Map data © OpenStreetMap contributors.${sat?' '+SATCREDIT.replace('Satellite picture','Satellite pictures')+(list.some(m=>inSwiss(m.center))?' · Aerial pictures © swisstopo':'')+'.':''}`}
$('#hikes').addEventListener('click',e=>{const b=e.target.closest('.hike');if(!b)return;vtPic=b.querySelector('img.cov')||null;go('#/hike/'+encodeURIComponent(b.dataset.id))});
$('#hero').addEventListener('click',e=>{const r=e.target.closest('.ring[data-det]');if(r&&nextMeta){pendingDet=r.dataset.det;go('#/hike/'+encodeURIComponent(nextMeta.id));return}const b=e.target.closest('[data-act]');if(!b)return;const a=b.dataset.act;
  if(a==='open'&&nextMeta){vtPic=document.querySelector('#hero img.cov')||null;go('#/hike/'+encodeURIComponent(nextMeta.id))}else if(a==='new'||a==='draw'){go('#/new');setMode('draw')}else if(a==='import')startImport()});
$('#hero').addEventListener('keydown',e=>{if((e.key==='Enter'||e.key===' ')&&e.target.matches('.ring[data-det]')){e.preventDefault();e.target.click()}});
function startImport(){if(cur!=='new')go('#/new');setMode('file');$('#file').click()}
async function backfill(ms){let ch=false;for(const m of ms){try{const D=await HP.db.plan(m.id);if(!D)continue;if(!D.id)D.id=m.id;await HP.db.putMeta(Object.assign(m,metaOf(D,m.thumb)));ch=true}catch(e){}}return ch}
const fcBusy=new Set();
async function refreshForecast(m){if(!navigator.onLine||fcBusy.has(m.id)||fcFail.has(m.id))return false;
  if(!HP.forecastWindow(m.date).ok)return m.wx?false:refreshClim(m);if(m.fcAt&&Date.now()-m.fcAt<3*3600e3&&m.fcd&&m.ensAt)return false;
  fcBusy.add(m.id);try{const D=await HP.db.plan(m.id);if(!D)return false;const[fr,er]=await Promise.allSettled([HP.fetchForecast(D),HP.fetchEnsemble(D)]);if(er.status==='fulfilled'&&er.value)D.ens=er.value;if(fr.status!=='fulfilled')throw fr.reason;const fc=fr.value;D.fc=fc;D.tz=D.tz||fc.tz;if(D.set&&D.set.wx==='fair')D.set.wx='fc';if(!D.id)D.id=m.id;
    await HP.db.putPlan(m.id,D);const mm=await HP.db.meta(m.id);if(mm)await HP.db.putMeta(Object.assign(mm,metaOf(D,mm.thumb)));return true}
  catch(e){fcFail.add(m.id);return true}finally{fcBusy.delete(m.id)}}
async function refreshClim(m){if(fcBusy.has(m.id))return false;fcBusy.add(m.id);
  try{const D=await HP.db.plan(m.id);if(!D||!D.clim||D.clim.cls)return false;const z=D.clim.z||[D.terr.min,D.terr.max],c=await HP.fetchClimate(D.center.lat,D.center.lon,z[0],z[1]);D.clim=c;if(!D.id)D.id=m.id;
    await HP.db.putPlan(m.id,D);const mm=await HP.db.meta(m.id);if(mm)await HP.db.putMeta(Object.assign(mm,metaOf(D,mm.thumb)));return true}
  catch(e){fcFail.add(m.id);return false}finally{fcBusy.delete(m.id)}}
function installHint(){const el=$('#install');if(standalone()){el.hidden=true;return}el.hidden=false;
  el.innerHTML=installEvt?`<span><b>Install the app</b>: full screen, works offline.</span> <button class="btn small" id="instbtn">Install</button>`:
    isIOS?`<b>Install:</b> Safari's Share button, then <b>Add to Home Screen</b>.`:
    `<b>Install:</b> browser menu, then <b>Install app</b> or <b>Add to Home screen</b>.`;
  const b=$('#instbtn');if(b)b.onclick=installNow}
async function installNow(){if(standalone()){HP.toast('The app is already on your home screen.');return}
  if(installEvt){const ev=installEvt;installEvt=null;ev.prompt();try{await ev.userChoice}catch(e){}if(cur==='home')installHint();return}
  await ask(isIOS?'In Safari, tap the Share button, then Add to Home Screen. The app then opens from its own icon, full screen, and works without a connection.':'Open the browser menu, then choose Install app or Add to Home screen. The app then opens from its own icon, full screen, and works without a connection.',{ok:'Done',cancel:false})}
addEventListener('beforeinstallprompt',e=>{e.preventDefault();installEvt=e;if(cur==='home')installHint()});
document.addEventListener('hp-look',()=>{if(cur==='home')renderHome()});
// the hero takes the tall 3D picture on a phone and the wide one on a wide screen
matchMedia('(min-width:900px)').addEventListener('change',()=>{if(cur==='home')renderHome()});

/* ---------- the menu ---------- */
function openDrawer(){const d=$('#drawer');HP.motion.open(d);$('#menubtn').setAttribute('aria-expanded','true');
  const here={home:'home',custom:'customize',about:'about',inv:'inventory'}[cur];$$('.ditem').forEach(b=>{if(b.dataset.go===here)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current')});
  $('#dinstall').hidden=standalone();storageNote();$('.ditem').focus()}
function closeDrawer(now){const d=$('#drawer');if(now)d.hidden=true;else HP.motion.close(d);$('#menubtn').setAttribute('aria-expanded','false');$('#menubtn').focus()}
$('#menubtn').addEventListener('click',openDrawer);$('#dclose').addEventListener('click',closeDrawer);
$('#drawer').addEventListener('click',e=>{if(e.target.id==='drawer'){closeDrawer();return}const b=e.target.closest('[data-go]');if(!b)return;const g=b.dataset.go;closeDrawer(/^(home|new|customize|inventory|about)$/.test(g));
  if(g==='home'){if(cur!=='home')go('#/')}else if(g==='new'){go('#/new');setMode('draw')}else if(g==='import')startImport();else if(g==='customize')go('#/customize');else if(g==='inventory')go('#/inventory');else if(g==='about')go('#/about');else if(g==='install')installNow()});
async function storageNote(){const n=lastList.length;let t=n?`${n} ${n>1?'hikes':'hike'} saved on this phone`:'No hikes saved yet';
  try{const e=navigator.storage&&await navigator.storage.estimate();if(e&&e.usage&&n)t+=`, using ${(e.usage/1048576).toFixed(e.usage<10485760?1:0)} MB`}catch(x){}
  $('#dfoot').textContent=`${t}. Version ${VERSION}.`}

/* ---------- Inventory: the person's own gear, named by the packing advice ---------- */
const INVEX={shirt:'e.g. Patagonia Capilene Cool',base:'e.g. Icebreaker 200 Oasis',fleece:'e.g. Patagonia R1',shell:"e.g. Arc'teryx Beta AR",puffy:'e.g. Rab Microlight Alpine',trousers:'e.g. Fjällräven Keb',
  rainpants:'e.g. Montane Minimus',hat:'e.g. Buff merino beanie',sunhat:'e.g. Outdoor Research Sun Runner',gloves:'e.g. Black Diamond Midweight',socks:'e.g. Darn Tough Hiker',gaiters:'e.g. Outdoor Research Rocky Mountain',
  boots:'e.g. La Sportiva TX4 Mid GTX',spikes:'e.g. Kahtoola Microspikes',pack:'e.g. Osprey Talon 33',liner:'e.g. Sea to Summit pack liner',poles:'e.g. Black Diamond Trail',headlamp:'e.g. Petzl Actik Core',
  water:'e.g. two 1 l bottles',firstaid:'e.g. Adventure Medical Kits Ultralight',sunglasses:'e.g. Julbo, category 3',nav:'e.g. Swisstopo app with offline maps',power:'e.g. Anker 10,000 mAh',
  sleep:'e.g. silk sleeping-bag liner',tent:'e.g. MSR Hubba Hubba',mat:'e.g. Therm-a-Rest NeoAir',stove:'e.g. MSR PocketRocket',other:'e.g. whistle, knife, ID'};
function renderInv(){const inv=HP.inv.load(),it=inv.items,cnt=HP.inv.count(),all=HP.INVCAT.reduce((s,g)=>s+g.k.length,0);let g0=0,kinds=0;
  for(const k in it){const a=Array.isArray(it[k])?it[k]:[];if(a.length)kinds++;a.forEach(x=>{if(x&&x.g)g0+=+x.g})}
  $('#inv').innerHTML=`<ul class="kpis ihead"><li><b>${cnt}</b><span>${cnt===1?'item':'items'}</span></li><li><b>${(g0/1000).toFixed(1)}</b><span>kg weighed</span></li><li><b>${kinds}<small>/${all}</small></b><span>kinds covered</span></li></ul>
    <p class="small mute inote">Your own gear. Each hike's packing advice names it; where you have nothing, it uses general words. The first item of a kind is the one it names. Stored on this phone only.</p>`+
    HP.INVCAT.map(g=>`<section class="igrp"><h2 class="micro">${esc(g.g)}</h2><div class="card ilist">${g.k.map(([k,label,word])=>{const a=(Array.isArray(it[k])?it[k]:[]).filter(x=>x&&x.name);
      return`<div class="irow"><span class="ilbl">${esc(label)}</span><div class="ivals">${a.map((x,n)=>`<button class="ichip${n?'':' first'}" data-k="${k}" data-n="${n}"><span class="inm">${esc(x.name)}</span>${x.g?`<small>${nf.format(+x.g)} g</small>`:''}</button>`).join('')}${a.length||!word||word.toLowerCase()===label.toLowerCase()?'':`<span class="iword">${esc(word)}</span>`}<button class="iadd" data-k="${k}" aria-label="Add: ${esc(label)}">+</button></div></div>`}).join('')}</div></section>`).join('')}
$('#inv').addEventListener('click',e=>{const b=e.target.closest('.ichip,.iadd');if(!b)return;editItem(b.dataset.k,b.classList.contains('iadd')?-1:+b.dataset.n)});
function editItem(k,n){const inv=HP.inv.load(),a=(inv.items[k]=Array.isArray(inv.items[k])?inv.items[k]:[]),x=n>=0?a[n]:null,d=$('#ied'),K=HP.INVK[k];
  $('#iedttl').textContent=K.label;$('#iedname').value=x?x.name:'';$('#iedname').placeholder=INVEX[k]||'';$('#iedg').value=x&&x.g?x.g:'';$('#ieddel').hidden=!x;$('#iedfirst').hidden=!x||n===0;HP.motion.open(d);$('#iedname').focus();
  const done=act=>{HP.motion.close(d);$('#iedform').onsubmit=$('#iedno').onclick=$('#ieddel').onclick=$('#iedfirst').onclick=d.onclick=null;
    if(act==='save'){const name=$('#iedname').value.trim().slice(0,60),g=Math.round(+$('#iedg').value)||0;if(!name)return;const o={name};if(g>0&&g<50000)o.g=g;if(x)a[n]=o;else a.push(o)}
    else if(act==='del')a.splice(n,1);else if(act==='first'){a.splice(n,1);a.unshift(x)}else return;
    if(!a.length)delete inv.items[k];HP.inv.save(inv);renderInv();HP.toast(act==='del'?'Removed':act==='first'?`${x.name} is now the first choice`:'Saved')};
  $('#iedform').onsubmit=e=>{e.preventDefault();done('save')};$('#iedno').onclick=()=>done(null);$('#ieddel').onclick=()=>done('del');$('#iedfirst').onclick=()=>done('first');d.onclick=e=>{if(e.target===d)done(null)}}

/* ---------- Customize ---------- */
const BGS=[['3d','3D picture of your next hike'],['skyline','Skyline of your next hike'],['contours','Contour lines'],['map','Map of your hike'],['photo','Your photo'],['plain','Plain colour']];
const seg=(k,opts)=>opts.map(([v,t])=>`<button data-k="${k}" data-v="${v}" aria-pressed="${String(LOOK.get()[k])===v}">${t}</button>`).join('');
async function renderCustom(){
  if(!lastList.length){const h=await loadHikes();lastList=h.list;nextMeta=h.next;latestMeta=h.latest}
  const P=LOOK.get(),pal=LOOK.pal(),sky=LOOK.sky(),photo=await HP.db.blob('app:photo').catch(()=>null);hasPhoto=!!photo;
  const box=$('#custom'),focus=document.activeElement&&box.contains(document.activeElement)?(document.activeElement.id||`[data-k="${document.activeElement.dataset.k}"][data-v="${document.activeElement.dataset.v}"]`):null;
  (box._urls||[]).forEach(u=>URL.revokeObjectURL(u));box._urls=[];
  const prof=nextMeta&&nextMeta.prof||SAMPLE.prof,mini=LOOK.skyline(prof,{band:pal.band,far:LOOK.mix(LOOK.mix(pal.band,sky.top,.5),sky.hor,.34),hor:sky.hor,rim:LOOK.mix(pal.band,'#ffffff',.24),seed:7,top:.3,bot:.96}).svg;
  const thumb=(nextMeta||latestMeta||{}).thumb,c3=await coverOf(nextMeta||latestMeta,true)||sampleCover(true);
  const pv={'3d':`<img src="${c3.url}" alt="">`,skyline:`<div style="background:linear-gradient(${sky.top},${sky.hor})"></div>${mini}`,contours:`<div class="lines" style="background:${pal.bandInk};opacity:.2;-webkit-mask:url(img/contours.svg) center/cover;mask:url(img/contours.svg) center/cover"></div>`,
    map:thumb?`<img src="${thumb}" alt="">`:`<span class="pvnote">Plan a hike first</span>`,photo:photo?`<img src="${blobURL(box,photo)}" alt="">`:`<span class="pvnote">Choose a photo</span>`,plain:''};
  box.innerHTML=`<div class="cprev" aria-hidden="true"><div class="hero" id="cprev"></div></div>
<section class="csec"><h3>Theme</h3><div class="themes">${LOOK.THEMES.map(t=>`<button class="tsw" data-k="theme" data-v="${t.id}" aria-pressed="${P.theme===t.id}" style="--b:${t.band};--a:${t.mark||P.acc||t.acc}"><span class="blz"><i></i></span><b>${t.name}</b><small>${t.note}</small></button>`).join('')}</div></section>
<section class="csec"${pal.theme.carbon?' hidden':''}><h3>Light or dark</h3><div class="segc">${seg('mode',[['auto','Automatic'],['light','Light'],['dark','Dark']])}</div></section>
<section class="csec"><h3>Accent colour</h3><div class="swatches"><button class="sw def" data-k="acc" data-v="" aria-pressed="${!P.acc}">Theme colour</button>${LOOK.ACCENTS.map(c=>`<button class="sw" data-k="acc" data-v="${c}" style="--c:${c}" aria-pressed="${P.acc===c}" aria-label="Accent colour ${c}"></button>`).join('')}<label class="sw pick" title="Any colour"><input type="color" id="accpick" value="${pal.acc}" aria-label="Choose any accent colour"></label></div></section>
<section class="csec"><h3>Home screen background</h3><div class="bgs">${BGS.map(([k,t])=>`<button class="bgt" data-k="bg" data-v="${k}" aria-pressed="${P.bg===k}"><span class="pv">${pv[k]}</span><span>${t}</span></button>`).join('')}</div>
  <div class="copt"${P.bg==='skyline'?'':' hidden'}><label for="todtg">Sky follows the time of day</label><input type="checkbox" class="tg" id="todtg"${P.tod?' checked':''}></div>
  <div class="crange"${P.bg==='photo'||P.bg==='map'?'':' hidden'}><label for="dimr">Darken the picture</label><input type="range" id="dimr" min="0" max="70" step="5" value="${P.dim}"><output>${P.dim}%</output></div>
  <div class="row2"${P.bg==='photo'?'':' hidden'}><button class="btn small" id="cphoto">${photo?'Choose another photo':'Choose a photo'}</button>${photo?'<button class="btn small ghost" id="cnophoto">Remove the photo</button>':''}</div>
  <div class="copt"><label for="textg">Contour lines behind the pages</label><input type="checkbox" class="tg" id="textg"${P.texture?' checked':''}></div></section>
<section class="csec"><h3>Text size</h3><div class="segc">${seg('text',[['m','Standard'],['l','Large'],['xl','Extra large']])}</div></section>
<section class="csec"><h3>Corners</h3><div class="segc">${seg('corners',[['soft','Soft'],['sharp','Sharp'],['round','Round']])}</div></section>
<section class="csec"><h3>Your hikes list</h3><div class="segc">${seg('list',[['rows','Rows'],['cards','Cards']])}</div><div class="copt"><label for="tottg">Show totals</label><input type="checkbox" class="tg" id="tottg"${P.totals?' checked':''}></div></section>

<section class="csec"><h3>Route colours in 3D</h3><p>From the next time you open a hike.</p><div class="routes">${Object.entries(LOOK.ROUTE).map(([k,r])=>`<button class="rt" data-k="route" data-v="${k}" aria-pressed="${P.route===k}"><i>${r.c.slice(0,5).map(c=>`<b style="--c:${c}"></b>`).join('')}</i>${r.name}</button>`).join('')}</div></section>
<button class="btn ghost creset" id="creset">Reset to the original look</button>`;
  await renderPreview();
  if(focus){const el=focus.startsWith('[')?box.querySelector(focus):document.getElementById(focus);if(el)el.focus({preventScroll:true})}}
async function renderPreview(){const el=$('#cprev');if(el)await renderHero(el,heroModel(nextMeta,lastList.length),{mini:true})}
$('#custom').addEventListener('click',async e=>{const b=e.target.closest('[data-k]');
  if(b){const k=b.dataset.k,v=b.dataset.v;if(k==='bg'&&v==='photo'&&!hasPhoto){$('#photoin').click();return}LOOK.set(k,v);renderCustom();return}
  if(e.target.closest('#cphoto')){$('#photoin').click();return}
  if(e.target.closest('#cnophoto')){await HP.db.delBlob('app:photo').catch(()=>{});LOOK.set('bg','3d');renderCustom();return}
  if(e.target.closest('#creset')&&await ask('Go back to the original look? Your hikes stay as they are.',{ok:'Reset'})){LOOK.reset();renderCustom()}});
$('#custom').addEventListener('change',e=>{const t=e.target,m={todtg:'tod',textg:'texture',tottg:'totals'}[t.id];
  if(m){LOOK.set(m,t.checked);renderCustom()}else if(t.id==='accpick'){LOOK.set('acc',t.value);renderCustom()}});
$('#custom').addEventListener('input',e=>{const t=e.target;
  if(t.id==='dimr'){LOOK.set('dim',+t.value);t.nextElementSibling.textContent=t.value+'%';renderPreview()}
  else if(t.id==='cname'){LOOK.set('name',t.value.trim().slice(0,30));renderPreview()}
  else if(t.id==='accpick'){LOOK.set('acc',t.value);renderPreview()}});
$('#photoin').addEventListener('change',async e=>{const f=e.target.files&&e.target.files[0];e.target.value='';if(!f)return;
  try{const url=URL.createObjectURL(f),im=await new Promise((ok,no)=>{const i=new Image();i.onload=()=>ok(i);i.onerror=()=>no(Error('the file is not a picture this browser can open'));i.src=url});
    const s=Math.min(1,1800/Math.max(im.naturalWidth,im.naturalHeight)),cv=document.createElement('canvas');cv.width=Math.round(im.naturalWidth*s);cv.height=Math.round(im.naturalHeight*s);cv.getContext('2d').drawImage(im,0,0,cv.width,cv.height);URL.revokeObjectURL(url);
    const b=await new Promise(ok=>cv.toBlob(ok,'image/jpeg',.86));cv.width=cv.height=0;if(!b)throw Error('the picture could not be saved');
    await HP.db.putBlob('app:photo',b);hasPhoto=true;LOOK.set('bg','photo');if(cur==='custom')renderCustom();HP.toast('Photo set as the home screen background')}
  catch(err){HP.toast('This picture could not be used: '+err.message)}});

/* ---------- new hike: planning map and file import ---------- */
const NEW={mode:'draw',pts:[],hist:[],routed:null,file:null,err:''};
let map=null,wpLayer,lineLayer,locLayer,rAC=null,rTimer=0;
const nextSat=()=>{const d=new Date();d.setHours(12,0,0,0);d.setDate(d.getDate()+((6-d.getDay()+7)%7||7));return isoDay(d)};
function openNew(){show('new','New hike');if(!$('#hdate').value)$('#hdate').value=nextSat();setMode(NEW.mode);refreshNewMap()}
function refreshNewMap(){if(typeof L==='undefined'){$('#pmap').innerHTML='<p class="pad mute">The map could not load. Check the connection, or import a file instead.</p>';return}
  if(!map)initMap();requestAnimationFrame(()=>map.invalidateSize())}
function initMap(){let v={center:[46.6,15],zoom:5};try{const s=JSON.parse(localStorage.getItem('hp-view')||'null');if(s&&s.center)v=s}catch(e){}
  map=L.map('pmap',{zoomControl:false,doubleClickZoom:false,tapTolerance:18}).setView(v.center,v.zoom);if(!coarse)L.control.zoom({position:'bottomright'}).addTo(map);
  L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',{subdomains:'abc',maxZoom:17,attribution:'© OpenStreetMap contributors, SRTM · map style © OpenTopoMap (CC-BY-SA)'}).addTo(map);map.attributionControl.setPrefix(false);
  lineLayer=L.layerGroup().addTo(map);wpLayer=L.layerGroup().addTo(map);locLayer=L.layerGroup().addTo(map);
  map.on('click',e=>{if(NEW.mode!=='draw')return;pushHist();NEW.pts.push({lat:e.latlng.lat,lon:e.latlng.lng});changed()});
  map.on('moveend',()=>{const c=map.getCenter();try{localStorage.setItem('hp-view',JSON.stringify({center:[+c.lat.toFixed(5),+c.lng.toFixed(5)],zoom:map.getZoom()}))}catch(e){}});
  map.on('locationfound',e=>{locLayer.clearLayers();L.circle(e.latlng,{radius:e.accuracy,weight:1,color:'#1c7ed6',fillOpacity:.08}).addTo(locLayer);L.circleMarker(e.latlng,{radius:7,weight:2,color:'#fff',fillColor:'#1c7ed6',fillOpacity:1}).addTo(locLayer)});
  map.on('locationerror',()=>HP.toast('Your location is not available. Allow location access for this site and try again.'))}
function pushHist(){NEW.hist.push(JSON.stringify(NEW.pts));if(NEW.hist.length>60)NEW.hist.shift()}
function setMode(m){NEW.mode=m;$('#tab-draw').setAttribute('aria-selected',String(m==='draw'));$('#tab-file').setAttribute('aria-selected',String(m==='file'));
  $('#filebox').hidden=m!=='file';$('#undo').hidden=$('#clear').hidden=m!=='draw';$('#reverse').hidden=!(m==='file'&&NEW.file);
  if(map){drawWps();drawLine();if(m==='file'&&NEW.file)fitFile()}updateHow();updateStats();updateBuildBtn()}
$('#tab-draw').addEventListener('click',()=>setMode('draw'));$('#tab-file').addEventListener('click',()=>setMode('file'));
function updateHow(){const n=NEW.pts.length;$('#how').textContent=(navigator.onLine?'':'Offline: a new hike needs a connection. ')+(NEW.mode==='file'?'':
  n===0?'Tap where you start.':n===1?'Tap where you finish.':'Tap to add a point. Drag to move one, tap one to remove it.')}
addEventListener('online',()=>{if(cur==='new')updateHow()});addEventListener('offline',()=>{if(cur==='new')updateHow()});
function wpIcon(k,n){const t=k===0?'S':k===n-1?'F':String(k);return L.divIcon({className:'',html:`<span class="wp ${k===0?'s':k===n-1?'f':''}">${t}</span>`,iconSize:[30,30],iconAnchor:[15,15],popupAnchor:[0,-14]})}
function drawWps(){if(!map)return;wpLayer.clearLayers();if(NEW.mode!=='draw')return;const n=NEW.pts.length;
  NEW.pts.forEach((p,k)=>{const m=L.marker([p.lat,p.lon],{draggable:true,icon:wpIcon(k,n),autoPan:true,title:k===0?'Start':k===n-1?'Finish':'Point '+k});
    m.on('dragend',()=>{const ll=m.getLatLng();pushHist();NEW.pts[k]={lat:ll.lat,lon:ll.lng};changed()});
    const box=document.createElement('div');box.className='wpop';box.innerHTML=`<b>${k===0?'Start':k===n-1&&n>1?'Finish':'Point '+k}</b><button class="btn small" type="button">Remove this point</button>`;
    box.querySelector('button').onclick=()=>{map.closePopup();pushHist();NEW.pts.splice(k,1);changed()};
    m.bindPopup(box,{closeButton:false,minWidth:150});wpLayer.addLayer(m)})}
function lineOf(pts,hit){const ll=pts.map(p=>[p.lat,p.lon]);const g=L.featureGroup([L.polyline(ll,{color:'#fff',weight:8,opacity:.95,interactive:false}),L.polyline(ll,{color:LOOK.pal().acc,weight:4.5,interactive:false})]);
  if(hit){const h=L.polyline(ll,{color:'#000',opacity:0,weight:24,bubblingMouseEvents:false});h.on('click',e=>{L.DomEvent.stop(e);insertOnLine(e.latlng)});g.addLayer(h)}return g}
function drawLine(){if(!map)return;lineLayer.clearLayers();
  if(NEW.mode==='draw'){if(NEW.routed)lineOf(NEW.routed.pts,true).addTo(lineLayer)}
  else if(NEW.file){lineOf(NEW.file.pts,false).addTo(lineLayer);const a=NEW.file.pts[0],b=NEW.file.pts[NEW.file.pts.length-1];
    L.marker([a.lat,a.lon],{icon:wpIcon(0,2),interactive:false}).addTo(lineLayer);L.marker([b.lat,b.lon],{icon:wpIcon(1,2),interactive:false}).addTo(lineLayer)}}
function insertOnLine(ll){const r=NEW.routed;if(!r)return;const near=(p,from)=>{let bi=from,bd=1e18;for(let i=from;i<r.pts.length;i++){const d=(r.pts[i].lat-p.lat)**2+((r.pts[i].lon-p.lon)*Math.cos(p.lat*Math.PI/180))**2;if(d<bd){bd=d;bi=i}}return bi};
  const ci=near({lat:ll.lat,lon:ll.lng},0);let at=1,prev=0;for(let k=0;k<NEW.pts.length;k++){const wi=near(NEW.pts[k],prev);if(wi<=ci)at=k+1;prev=wi}
  at=Math.min(Math.max(1,at),NEW.pts.length-1);pushHist();NEW.pts.splice(at,0,{lat:ll.lat,lon:ll.lng});changed()}
function changed(){NEW.routed=null;NEW.err='';drawWps();drawLine();updateHow();updateBuildBtn();clearTimeout(rTimer);if(rAC){rAC.abort();rAC=null}
  if(NEW.pts.length<2){updateStats();return}$('#rstats').innerHTML='<span class="mute">Finding the trail…</span>';rTimer=setTimeout(doRoute,300)}
async function doRoute(){const ac=rAC=new AbortController();
  try{const r=await HP.route(NEW.pts,ac.signal);if(ac!==rAC)return;NEW.routed=r;NEW.err=''}
  catch(e){if(ac.signal.aborted)return;NEW.err=e.message}
  rAC=null;drawLine();updateStats();updateBuildBtn()}
$('#undo').addEventListener('click',()=>{if(!NEW.hist.length){HP.toast('Nothing to undo');return}NEW.pts=JSON.parse(NEW.hist.pop());changed()});
$('#clear').addEventListener('click',()=>{if(!NEW.pts.length)return;pushHist();NEW.pts=[];changed();HP.toast('Route cleared. Undo brings it back.')});
$('#locate').addEventListener('click',()=>{if(map)map.locate({setView:true,maxZoom:14,enableHighAccuracy:true,timeout:15000})});
function summary(pts,sac){let L0=0,up=0,dn=0,ref=NaN,hasE=false;
  for(let i=0;i<pts.length;i++){if(i)L0+=HP.geo.hav(pts[i-1].lat,pts[i-1].lon,pts[i].lat,pts[i].lon);const e=+pts[i].e;if(!isFinite(e))continue;hasE=true;if(!isFinite(ref))ref=e;else if(e-ref>=5){up+=e-ref;ref=e}else if(ref-e>=5){dn+=ref-e;ref=e}}
  const km=L0/1000,hz=km/4,vt=up/300+dn/500,t=Math.max(hz,vt)+Math.min(hz,vt)/2;let g=0;if(sac)for(const v of sac)g=Math.max(g,v);
  return`<b>${km.toFixed(km<20?1:0)} km</b>`+(hasE?` · ${nf.format(Math.round(up/10)*10)} m up · ${nf.format(Math.round(dn/10)*10)} m down · about ${fmtH(t)} walking at an average pace`:' · heights are added when the plan is built')+(g?` · hardest section T${g}`:'')+(km>110?`<br><span class="err">This is longer than the app can handle in one plan (about 120 km). Split it into parts.</span>`:'')}
function updateStats(){const el=$('#rstats');
  if(NEW.mode==='draw')el.innerHTML=NEW.err?`<span class="err">${esc(NEW.err)}</span>`:NEW.routed?summary(NEW.routed.pts,NEW.routed.sac):'';
  else el.innerHTML=NEW.err&&!NEW.file?`<span class="err">${esc(NEW.err)}</span>`:NEW.file?summary(NEW.file.pts):''}
function updateBuildBtn(){$('#buildbtn').disabled=!(NEW.mode==='draw'?NEW.routed:NEW.file)||!$('#hdate').value}
$('#hdate').addEventListener('input',updateBuildBtn);
$('#file').addEventListener('change',async e=>{const f=e.target.files&&e.target.files[0];e.target.value='';if(!f)return;
  try{if(f.size>40e6)throw Error('This file is too large.');if(/\.(kmz|fit|tcx)$/i.test(f.name))throw Error('Export the route as GPX, KML or GeoJSON instead.');
    const r=HP.parseRouteFile(await f.text(),f.name);NEW.file=r;NEW.err='';if(!$('#hname').value.trim()||$('#hname').dataset.auto)$('#hname').value=r.title,$('#hname').dataset.auto='1';
    setMode('file')}
  catch(err){NEW.file=null;NEW.err=err.message;setMode('file')}});
$('#hname').addEventListener('input',e=>{delete e.target.dataset.auto});
$('#reverse').addEventListener('click',()=>{if(!NEW.file)return;NEW.file.pts.reverse();drawLine();HP.toast('Direction reversed: the finish is now the start')});
function fitFile(){const b=L.latLngBounds(NEW.file.pts.map(p=>[p.lat,p.lon]));map.fitBounds(b,{padding:[30,30]})}
$('#search').addEventListener('submit',async e=>{e.preventDefault();const q=$('#q').value.trim(),res=$('#results');if(!q)return;res.hidden=false;res.innerHTML='<p class="pad mute">Searching…</p>';
  try{const j=await HP.fetchJSON(`https://nominatim.openstreetmap.org/search?format=jsonv2&limit=6&accept-language=en&q=${encodeURIComponent(q)}`,{},15000);
    if(!j.length){res.innerHTML='<p class="pad mute">Nothing found. Try another spelling, or add the country.</p>';return}
    res.innerHTML=j.map((r,k)=>`<button type="button" data-k="${k}">${esc(r.name||r.display_name.split(',')[0])}<small>${esc(r.display_name)}</small></button>`).join('');
    res.onclick=ev=>{const b=ev.target.closest('button');if(!b)return;const r=j[+b.dataset.k];res.hidden=true;$('#q').blur();if(!map)return;
      const bb=(r.boundingbox||[]).map(Number);if(bb.length===4&&(bb[1]-bb[0]>.15||bb[3]-bb[2]>.15))map.fitBounds([[bb[0],bb[2]],[bb[1],bb[3]]],{maxZoom:14});else map.setView([+r.lat,+r.lon],14);
      locLayer.clearLayers();L.circleMarker([+r.lat,+r.lon],{radius:6,weight:2,color:'#fff',fillColor:'#123b2f',fillOpacity:1,interactive:false}).addTo(locLayer)}}
  catch(err){res.innerHTML=`<p class="pad err">Search is not available: ${esc(err.message)}</p>`}});
document.addEventListener('click',e=>{if(!e.target.closest('#search'))$('#results').hidden=true});

/* ---------- building ---------- */
const STEPS=[['route','The route'],['terrain','Terrain heights'],['map','Map and satellite pictures'],['places','Huts, passes, water and place names'],['weather','Climate statistics and the forecast'],['save','Saving on this phone']];
function stepSet(k,f,note){const li=$(`#steps [data-k="${k}"]`);if(!li)return;li.className=f>=1?'done':f<0?'fail':'work';li.querySelector('.pb>span').style.width=Math.round(Math.max(0,Math.min(1,f))*100)+'%';if(note!=null)li.querySelector('small').textContent=note}
function cancelBuild(){if(building){building.abort();building=null}}
$('#bcancel').addEventListener('click',()=>{cancelBuild();if(lastBuild&&lastBuild.from){lastBuild=null;cur='';route()}else{show('new','New hike');refreshNewMap()}});
$('#details').addEventListener('submit',e=>{e.preventDefault();startBuild()});
const newId=()=>Date.now().toString(36)+Math.random().toString(36).slice(2,7);
const metaOf=(D,thumb)=>{const R=D.route,n=R.d.length,L=R.d[n-1]||1,end=parseDay(D.date);end.setDate(end.getDate()+D.days.length-1);
  const prof=[];let j=0;for(let k=0;k<100;k++){let mx=-1e9;const lim=L*(k+1)/100+1e-6;while(j<n&&R.d[j]<=lim){mx=Math.max(mx,R.e[j]);j++}prof.push(Math.round(mx>-1e9?mx:(k?prof[k-1]:R.e[0])))}
  let hi=0;for(let i=1;i<n;i++)if(R.e[i]>R.e[hi])hi=i;
  const near=D.points.filter(p=>p.kind!=='water'&&p.kind!=='high'&&Math.abs(R.d[p.i]-R.d[hi])<.4).sort((a,b)=>Math.abs(R.d[a.i]-R.d[hi])-Math.abs(R.d[b.i]-R.d[hi]))[0];
  const hiE=near&&D.official&&D.official[near.name]?D.official[near.name]:R.e[hi];
  return{v:4,id:D.id,name:D.name,date:D.date,end:isoDay(end),days:D.days.length,km:+(+L).toFixed(2),up:D.days.reduce((s,d)=>s+d.up,0),created:D.created,updated:Date.now(),center:D.center,thumb,
    prof,hi:Math.round(hiE),hiFr:+(R.d[hi]/L).toFixed(4),hiName:near?near.name:'',nights:D.days.slice(0,-1).map(d=>+(R.d[d.i1]/L).toFixed(4)),fcd:fcDays(D),fcAt:D.fc?D.fc.issued:0,
    wx:wxSummary(D),ensAt:D.ens?D.ens.issued:0,years:D.clim&&D.clim.years||null,cover:D.cover||'',...dayFigures(D)}};
// km-effort of the hardest day, and the daylight left at arrival on the tightest day (walking times from the plan, at the chosen pace and rests)
function dayFigures(D){try{const st=D.set||{},[h,mn]=String(st.start||'07:00').split(':').map(Number),t0=(h||0)+(mn||0)/60,k=(+st.pace||1)*(st.breaks===false?1:7/6);
  let eff=0,dl=99;D.days.forEach((d,j)=>{eff=Math.max(eff,HP.effort(d.km,d.up));const day=parseDay(D.date);day.setDate(day.getDate()+j);
    const s=HP.sunTimes(D.center.lat,D.center.lon,day,D.tz);dl=Math.min(dl,s.set-(t0+(d.hours||0)*k))});
  return{eff:+eff.toFixed(1),dl:dl<99?+dl.toFixed(2):null}}catch(e){return{}}}
function wxSummary(D){try{const T=HP.wxTrip(D);return T?{src:T.src,pct:T.pct,days:T.days.map(x=>({d:x.d,src:x.src,pct:x.pct}))}:null}catch(e){return null}}
// one line of weather per day for the home screen, from the hourly forecast along the route (walking hours)
function fcDays(D){const F=D.fc;if(!F||!F.start||F.start.slice(0,10)!==D.date||!F.pts)return null;const out=[];
  for(let k=0;k<D.days.length;k++){const h0=k*24;if(h0+18>F.n-1)break;let tx=-99,tn=99,pr=0,th=false,sn=false,fog=0,cl=0,cn=0,wg=0;
    for(const p of F.pts){const H=p.h;let ps=0;for(let h=h0+6;h<=h0+20;h++){const T=H.T[h];if(T===T){if(h>=h0+8&&h<=h0+18)tx=Math.max(tx,T);tn=Math.min(tn,T)}
        if(h>=h0+7&&h<=h0+19){const r=H.pr[h]||0;ps+=r;if((H.sf[h]||0)>0||(r>.2&&T<.5))sn=true}
        if(h>=h0+8&&h<=h0+19){const c=H.code[h];if(c>=95)th=true;if(c===45||c===48)fog++;const cc=Math.max(H.cl[h]||0,(H.cm[h]||0)*.8);if(cc===cc){cl+=cc;cn++}wg=Math.max(wg,H.wg[h]||0)}}
      pr=Math.max(pr,ps)}
    if(tx===-99)break;const c=cn?cl/cn:0,ic=th?'storm':pr>=1?(sn?'snow':'rain'):fog>=3?'fog':c>70?'cloud':c>30?'part':'sun';
    const d=parseDay(D.date);d.setDate(d.getDate()+k);out.push({d:isoDay(d),ic,tx:+tx.toFixed(1),tn:+tn.toFixed(1),pr:+pr.toFixed(1),wg:Math.round(wg)})}
  return out.length?out:null}
async function startBuild(){
  const src=NEW.mode==='draw'?NEW.routed:NEW.file;if(!src)return;
  const input=NEW.mode==='draw'?{pts:src.pts,sac:src.sac,wpts:[],names:{}}:{pts:src.pts,wpts:src.wpts,names:{}};
  const opts={name:$('#hname').value.trim(),date:$('#hdate').value,days:$('#hdays').value,start:$('#hstart').value||'07:00',pace:$('#hpace').value,breaks:$('#hbreaks').checked};
  runBuild(input,opts)}
// from: the hike an easier way is made from (Cancel goes back to it, and the new hike opens on top of it)
let lastBuild=null;
async function runBuild(input,opts,from=null){lastBuild={input,opts,from};
  const ac=building=new AbortController();
  show('build','Building the plan');$('#bname').textContent=opts.name||'Building your plan';$('#berr').hidden=true;$('#bagain').hidden=true;$('#bcancel').textContent='Cancel';
  $('#steps').innerHTML=STEPS.map(([k,t])=>`<li data-k="${k}"><i></i><b>${t}</b><span class="pb"><span></span></span><small></small></li>`).join('');
  try{
    const {D,blobs}=await HP.buildPlan(input,opts,(k,f,note)=>{if(ac===building)stepSet(k,f,note)},ac.signal);
    if(ac!==building)return;
    stepSet('save',.3);D.id=newId();
    const thumb=await HP.thumb(D,blobs.sat||blobs.topo||blobs.relief);
    await HP.db.save(metaOf(D,thumb),D,blobs);stepSet('save',1);
    if(navigator.storage&&navigator.storage.persist)navigator.storage.persist().catch(()=>{});
    building=null;
    if(from){go('#/hike/'+encodeURIComponent(D.id));return}
    Object.assign(NEW,{pts:[],hist:[],routed:null,file:null,err:''});$('#hname').value='';delete $('#hname').dataset.auto;
    if(map){drawWps();drawLine()}updateStats();
    replace('#/hike/'+encodeURIComponent(D.id))}
  catch(e){if(ac.signal.aborted||ac!==building)return;building=null;console.error(e);
    const li=$('#steps li.work');if(li)stepSet(li.dataset.k,-1);
    $('#berr').hidden=false;$('#berr').textContent=/Cancelled/.test(e.message)?'Cancelled.':e.message||'Something went wrong.';$('#bagain').hidden=false;$('#bcancel').textContent=from?'Back to the hike':'Back to the route'}}
$('#bagain').addEventListener('click',()=>{if(lastBuild)runBuild(lastBuild.input,lastBuild.opts,lastBuild.from)});

/* ---------- a saved hike ---------- */
let saveT=0,pending=null;
function onPlanChange(D){pending=D;clearTimeout(saveT);saveT=setTimeout(flushSave,700);if(cur==='view')$('#ttl').textContent=D.name}
// a new list picture for a hike wins over any list entry written from an older read (forecast refresh, plan save)
const THUMBS={},putMeta0=HP.db.putMeta;HP.db.putMeta=m=>{if(m&&THUMBS[m.id])m.thumb=THUMBS[m.id];return putMeta0(m)};
HP.setThumb=async(id,t)=>{THUMBS[id]=t;const m=await HP.db.meta(id);if(m)await HP.db.putMeta(m)};
async function flushSave(){clearTimeout(saveT);const D=pending;pending=null;if(!D)return;
  try{await HP.db.putPlan(D.id,D);const m=await HP.db.meta(D.id);if(m)await HP.db.putMeta(Object.assign(m,metaOf(D,m.thumb)))}catch(e){HP.toast('Could not save the change: '+e.message)}}
addEventListener('visibilitychange',()=>{if(document.hidden)flushSave()});addEventListener('pagehide',flushSave);
async function openHike(id){if(cur==='view'&&viewId===id)return;
  let D,blobs;try{D=await HP.db.plan(id);if(D){blobs={};for(const k of['topo','relief','sat','dem'])blobs[k]=await HP.db.blob(id+':'+k)}}catch(e){HP.toast('This hike could not be read: '+e.message)}
  if(!D){HP.toast('This hike is no longer saved on this phone.');replace('#/');return}
  if(!D.id)D.id=id;viewId=id;await stagePicture(id);show('view',D.name);HP.viewer.open(D,blobs,onPlanChange);if(pendingDet){const k=pendingDet;pendingDet=null;setTimeout(()=>openDetail(k,true),60)}
  if(pendingGuide){pendingGuide=false;setTimeout(openGuide,60)}}
/* ---------- an easier way: the same hike round its hard places, built as a new hike next to it ---------- */
const EASYK=/^(sac|vf|glacier|closed|aid|drop|edge|off|vis|hazard)$/;
const leaveDetail=()=>new Promise(res=>{if(!(history.state&&history.state.det))return res();addEventListener('popstate',()=>setTimeout(res,30),{once:true});history.back()});
async function findEasier(btn){const D=HP.viewer.current(),F=HP.viewer.safety();if(!D||!F||!btn||btn.disabled)return;
  if(!navigator.onLine){HP.toast('Connect to the internet to look for an easier way.');return}
  const spots=F.items.filter(x=>x.lvl!=='info'&&EASYK.test(x.k));if(!spots.length){HP.toast('Nothing on this route needs a way round.');return}
  const label=btn.innerHTML,say=(n,t)=>{btn.innerHTML=`<span class="spin" aria-hidden="true"></span>Looking for an easier way${t?` · ${Math.min(n,t)} of ${t}`:''}`};
  btn.disabled=true;btn.classList.add('busy');say(0,0);let r=null;
  try{r=await HP.easier(D,spots,null,say)}catch(e){console.warn(e)}finally{btn.disabled=false;btn.classList.remove('busy');btn.innerHTML=label}
  if(HP.viewer.current()!==D)return;
  if(!r){HP.toast('The trail router could not be reached. Try again later.');return}
  if(r.none){await ask('No easier way nearby: the hard places are on the only paths through. Plan a different hike, or go with someone experienced.',{cancel:false});return}
  const name=x=>{const y=x.g.items.find(y=>y.k==="sac")||x.g.items[0];return`${esc(y.near||`Day ${y.day}, km ${y.km}`)}: ${esc(y.what.charAt(0).toLowerCase()+y.what.slice(1))}`};
  const done=r.reps.filter(x=>!x.fail),left=r.reps.filter(x=>x.fail),sg=(v,u,d=0)=>`${v>=0?'+':'−'}${Math.abs(v).toFixed(d)}<i> ${u}</i>`;
  const html=`<b class="dlgt">An easier way</b><ul class="kpis ecmp"><li><b>${sg(r.extra,'km',1)}</b><span>distance</span></li><li><b>${sg(Math.round(r.dUp/10)*10,'m')}</b><span>climbing</span></li>${r.hard!=null?`<li><b>${r.hard?'T'+r.hard:'–'}</b><span>hardest</span></li>`:''}</ul>`+
    `<p class="micro">Goes round</p><ul class="elist ok">${done.map(x=>`<li>${name(x)}</li>`).join('')}</ul>`+
    (left.length?`<p class="micro">Still on the way, with no easier way nearby</p><ul class="elist">${left.map(x=>`<li>${name(x)}</li>`).join('')}</ul>`:'')+
    `<p class="small mute">It is saved as a new hike; this one stays as it is.</p>`;
  if(!await ask(html,{html:true,ok:'Create this hike'}))return;
  await leaveDetail();await flushSave();const from=D.id,st=D.set||{};HP.viewer.close();viewId=null;
  runBuild({pts:r.pts,sac:r.sac,wpts:[],names:{}},{name:`${D.name} · easier`.slice(0,80),date:D.date,days:String(D.days.length),start:st.start||'07:00',pace:String(st.pace||1),breaks:!!st.breaks},from)}
$('#scr-view .cards').addEventListener('click',e=>{const b=e.target.closest('[data-act="easier"]');if(b)findEasier(b)});

/* ---------- the live guide: over the open hike, with its own step in the history so Back closes it ---------- */
function openGuide(){if(cur!=='view'||HP.guide.active())return;history.pushState({d:depth()+1,guide:1},'',location.hash);syncGuide()}
function syncGuide(){const g=history.state&&history.state.guide;
  if(g&&cur==='view'&&!HP.guide.active()){if(!HP.guide.open()){history.back();return}$('#scr-view').hidden=true;$('#scr-detail').hidden=true}
  else if(!g&&HP.guide.active())closeGuide()}
function closeGuide(now){if(cur==='view'&&!(history.state&&history.state.det))$('#scr-view').hidden=false;if(now){HP.guide.close();return}HP.motion.close($('#guide'),()=>HP.guide.close())}
HP.openGuide=openGuide;
$('#guidebtn').addEventListener('click',openGuide);
// a guide still running when the app was closed: offer to carry on
async function offerResume(){let g=null;try{g=JSON.parse(localStorage.getItem('hp-guide')||'null')}catch(e){}const el=$('#resume');
  if(!g||Date.now()-g.t>12*36e5){el.hidden=true;return}let D=null;try{D=await HP.db.plan(g.id)}catch(e){}if(!D||cur!=='home'){el.hidden=true;return}
  $('#resname').textContent=D.name;el.hidden=false;$('#resgo').onclick=()=>{el.hidden=true;pendingGuide=true;go('#/hike/'+encodeURIComponent(g.id))};
  $('#resno').onclick=()=>{el.hidden=true;try{localStorage.removeItem('hp-guide')}catch(e){}}}
// until the 3D view draws its first frame it shows the hike's own picture (the one on the home screen), so the picture
// that grew from the list simply comes alive; the loading message hides behind it
async function stagePicture(id){const st=$('#stage');st.classList.remove('ph','live');st.style.removeProperty('--ph');
  const m=lastList.find(x=>x.id===id)||(nextMeta&&nextMeta.id===id?nextMeta:null),c=m&&await coverOf(m,innerWidth>=900).catch(()=>null);if(!c)return;
  try{const im=new Image();im.src=c.url;await im.decode()}catch(e){return}st.style.setProperty('--ph',`url("${c.url}")`);st.classList.add('ph')}
new MutationObserver(()=>{const m=$('#msg');if(m.hidden||!/^Building/.test(m.textContent))$('#stage').classList.add('live')}).observe($('#msg'),{attributes:true,attributeFilter:['hidden'],childList:true,characterData:true,subtree:true});
// the sliding indicators: the map's own controls now, Customize each time it is drawn
HP.motion.sliders();new MutationObserver(()=>HP.motion.sliders($('#custom'))).observe($('#custom'),{childList:true});
/* ---------- detail pages: a card's whole story, over the open hike; Back returns to the map ---------- */
let detPlain=false,detSwipe=false;
function openDetail(k,plain){if(cur!=='view')return;detPlain=!!plain;history.pushState({d:depth()+1,det:k},'',location.hash);syncDetail()}
HP.openDetail=openDetail;
const detSrc=k=>{const c=document.querySelector(`#scr-view .card[data-det="${k}"]`);return c&&!c.hidden&&!$('#scr-view').hidden?c:null};
function syncDetail(){const k=history.state&&history.state.det,el=$('#scr-detail');
  if(k&&cur==='view'){const r=HP.viewer.detail(k);if(!r){history.back();return}const opening=el.hidden,src=opening&&!detPlain?detSrc(k):null;detPlain=false;if(opening)viewScroll=scrollY;
    HP.motion.vt(()=>{$('#detail').innerHTML=r.html;$('#detail').dataset.k=k;el.hidden=false;$('#scr-view').hidden=true;$('#more').hidden=true;
      $('#ttl').textContent=r.title;document.body.dataset.detail=k;window.scrollTo(0,0)},{type:!opening?'none':src?'expand':'fade',from:src})}
  else if(!el.hidden){const k0=$('#detail').dataset.k,y=viewScroll,lk=pendingLook,sh=pendingShow,pg=pendingGuide;pendingLook=pendingShow=null;pendingGuide=false;
    // looking from a viewpoint, showing a place or opening the guide move on from the map: a plain fade; otherwise the page goes back into its card
    const plain=lk!=null||sh!=null||pg||detSwipe;detSwipe=false;
    HP.motion.vt(()=>{el.hidden=true;$('#scr-view').hidden=false;$('#more').hidden=cur!=='view';const D=HP.viewer.current();if(cur==='view'&&D)$('#ttl').textContent=D.name;delete document.body.dataset.detail;if(!plain)window.scrollTo(0,y)},
      {type:plain?'fade':'collapse',to:plain?null:()=>detSrc(k0)}).then(()=>requestAnimationFrame(()=>{if(lk!=null&&HP.viewer.look)HP.viewer.look(lk,true);else if(sh!=null&&HP.viewer.show)HP.viewer.show(sh);else if(pg)openGuide()}))}}
// a tap on a card opens its page; buttons, links, fields and the profile's own chart keep their own job
$('#scr-view .cards').addEventListener('click',e=>{const c=e.target.closest('.card[data-det]');if(!c||e.target.closest('button,a,input,select,label,#prof'))return;openDetail(c.dataset.det)});
$('#scr-view .cards').addEventListener('keydown',e=>{if((e.key==='Enter'||e.key===' ')&&e.target.matches('.card[data-det]')){e.preventDefault();openDetail(e.target.dataset.det)}});
$('#detail').addEventListener('change',e=>{const t=e.target;if(!t.matches('[data-pack]'))return;HP.viewer.pack(t.dataset.pack,t.checked);
  const sec=t.closest('.dsec'),all=sec.querySelectorAll('[data-pack]'),on=[...all].filter(x=>x.checked).length,lab=sec.querySelector('.ch span.micro');if(lab)lab.textContent=lab.textContent.replace(/^\d+\/\d+/,`${on}/${all.length-sec.querySelectorAll('[data-pack^="o:"]').length}`)});
$('#detail').addEventListener('click',e=>{const b=e.target.closest('[data-dact]');if(!b)return;const a=b.dataset.dact;
  if(a==='inv')go('#/inventory');else if(a.startsWith('look:')||a==='walk'){pendingLook=a==='walk'?-1:+a.slice(5);history.back()}
  else if(a.startsWith('show:')){pendingShow=+a.slice(5);history.back()}
  else if(a==='guide'){pendingGuide=true;history.back()}
  else if(a==='easier')findEasier(b);
  else if(a==='recheck'){if(!navigator.onLine){HP.toast('Connect to the internet to check the trail.');return}HP.toast('Checking the trail…');b.disabled=true;
    Promise.resolve(HP.viewer.recheck()).then(()=>{if(history.state&&history.state.det==='safety'){const r=HP.viewer.detail('safety');if(r)$('#detail').innerHTML=r.html}})}});
$('#more').addEventListener('click',()=>{HP.motion.open($('#sheet'));$('#sheet .row').focus()});
// the hike's menu can be dragged down to close it
HP.motion.dragDismiss($('#sheet .sheetbox'),()=>{const sh=$('#sheet');return sh.animate({opacity:[1,0]},{duration:180,easing:'ease-out'}).finished.then(()=>{sh.hidden=true})});
// swipe from the left edge to go back, on the pages that have a way back and no map of their own to drag
HP.motion.edgeBack(()=>{if(!$('#scr-detail').hidden)return $('#scr-detail');return/^(about|custom|inv)$/.test(cur)?$('#scr-'+cur):null},
  reset=>{if(!$('#scr-detail').hidden){detSwipe=true;history.back()}else back('fade');setTimeout(reset,700)});
$('#sheet').addEventListener('click',async e=>{const sh=$('#sheet');if(e.target===sh){HP.motion.close(sh);return}const b=e.target.closest('[data-act]');if(!b)return;HP.motion.close(sh);
  const D=HP.viewer.current();if(!D)return;const act=b.dataset.act;
  if(act==='guide'){openGuide();return}
  if(act==='rename'){const v=await ask('Name of this hike',{input:D.name,ok:'Save'});if(v){D.name=v.slice(0,80);onPlanChange(D);await flushSave()}}
  else if(act==='gpx')exportGPX(D);
  else if(act==='forecast'){if(!navigator.onLine){HP.toast('No connection right now.');return}HP.viewer.updateForecast()}
  else if(act==='delete'){if(await ask(`Delete “${D.name}” from this phone?`,{ok:'Delete',danger:true})){pending=null;clearTimeout(saveT);HP.viewer.close();viewId=null;cur='';await HP.db.remove(D.id);dropCovers(D.id);HP.toast('Hike deleted');replace('#/')}}});
async function exportGPX(D){const R=D.route;
  const w=D.points.filter(p=>p.kind!=='high').map(p=>({lat:R.lat[p.i],lon:R.lon[p.i],name:p.name}));D.days.slice(0,-1).forEach(d=>{if(!D.points.some(p=>p.i===d.i1))w.push({lat:R.lat[d.i1],lon:R.lon[d.i1],name:`Night ${d.n}: ${d.to}`})});
  const gpx=HP.toGPX(D.name,R.lat,R.lon,R.e,w),fname=(D.name.replace(/[\\/:*?"<>|]+/g,'').trim().replace(/\s+/g,'-')||'hike')+'.gpx',file=new File([gpx],fname,{type:'application/gpx+xml'});
  if(coarse&&navigator.canShare){try{if(navigator.canShare({files:[file]})){await navigator.share({files:[file],title:D.name});return}}catch(e){if(e.name==='AbortError')return}}
  HP.download(fname,file);HP.toast('GPX file saved to your downloads')}

/* ---------- start ---------- */
$('#hint').textContent=coarse?'One finger moves · two fingers turn and zoom · tap the line':'Drag to turn · right-drag to move · scroll to zoom · click the line';
if(isIOS)$('#file').removeAttribute('accept'); // iOS greys out .gpx files when it does not know the type
/* Updates: the app opens instantly from the copy kept on the phone, then asks the service worker to look for newer files.
   When the app has changed, it reloads straight away on the hikes list or About; anywhere else it waits until you go back to the list. */
let updPending=false;
const SWOK='serviceWorker'in navigator&&!/[?&]nosw/.test(location.search);
function applyUpdate(){
  let t=0;try{t=+sessionStorage.getItem('hp-upd')||0}catch(e){}
  if((cur==='home'||cur==='about')&&Date.now()-t>30000){try{sessionStorage.setItem('hp-upd',Date.now())}catch(e){}location.reload();return} // never reloads in a loop
  if(!updPending){updPending=true;HP.toast('A newer version of the app is ready. It opens when you go back to your hikes.',5000)}}
let lastCheck=0;
function checkUpdate(force){
  if(!SWOK||!navigator.onLine||(!force&&Date.now()-lastCheck<60000))return;lastCheck=Date.now();
  navigator.serviceWorker.ready.then(reg=>{reg.update().catch(()=>{});if(reg.active)reg.active.postMessage({type:'check'})}).catch(()=>{})}
if(SWOK){navigator.serviceWorker.register('sw.js').catch(()=>{});
  let had=!!navigator.serviceWorker.controller;navigator.serviceWorker.addEventListener('controllerchange',()=>{if(!had){had=true;return}applyUpdate()});
  navigator.serviceWorker.addEventListener('message',e=>{if(e.data&&e.data.type==='updated')applyUpdate()});
  addEventListener('load',()=>setTimeout(checkUpdate,1500));
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')checkUpdate()})}
HP.update={check:()=>checkUpdate(true),pending:()=>updPending,version:VERSION};
HP.dbg={map:()=>map,NEW};
if(!history.state)history.replaceState({d:0},'',location.hash||'#/');
route();
})();
