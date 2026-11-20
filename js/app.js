'use strict';
/* Hike Planner 3D: screens, the home screen, the menu, Customize, the planning map, file import, building a plan */
(function(){
const {$,$$,nf,fmtH,esc,isoDay,parseDay,fmtDate}=HP.u;
const LOOK=HP.look;
const coarse=matchMedia('(pointer: coarse)').matches;
const isIOS=/iPad|iPhone|iPod/.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
const standalone=()=>matchMedia('(display-mode: standalone)').matches||navigator.standalone===true;
const VERSION='1.4';
const SCREENS=['home','new','build','view','custom','about'];
let cur='',viewId=null,building=null,installEvt=null;

/* ---------- navigation ---------- */
function show(name,title){cur=name;SCREENS.forEach(s=>{$('#scr-'+s).hidden=s!==name});document.body.dataset.screen=name;
  $('#menubtn').hidden=name!=='home';$('#back').hidden=name==='home';$('#more').hidden=name!=='view';$('#ttl').textContent=title||'Hike Planner 3D';
  document.title=title?`${title} · Hike Planner 3D`:'Hike Planner 3D';window.scrollTo(0,0);headerState()}
const depth=()=>(history.state&&history.state.d)||0;
function go(hash){history.pushState({d:depth()+1},'',hash);route()}
function replace(hash){history.replaceState({d:depth()},'',hash);route()}
function back(){if(depth()>0)history.back();else replace('#/')}
async function route(){
  const h=location.hash.replace(/^#\/?/,''),target=h.startsWith('hike/')?'view':h==='new'?'new':h==='customize'?'custom':h==='about'?'about':'home';
  if(building&&target!=='new')cancelBuild();
  if(cur==='view'&&(target!=='view'||h.slice(5)!==viewId)){await flushSave();HP.viewer.close();viewId=null}
  if(updPending&&(target==='home'||target==='about')){try{sessionStorage.setItem('hp-upd',Date.now())}catch(e){}location.reload();return}
  if(target==='view')return openHike(decodeURIComponent(h.slice(5)));
  if(target==='new'){if(cur!=='new'&&cur!=='build')openNew();return}
  if(target==='custom'){if(cur!=='custom'){show('custom','Customize');renderCustom()}return}
  if(target==='about'){show('about','About');$('#ver').textContent=`Version ${VERSION}`;return}
  showHome()}
addEventListener('popstate',route);
$('#back').addEventListener('click',()=>{if(cur==='build'){cancelBuild();show('new','New hike');refreshNewMap();return}back()});
// on the home screen the header floats over the sky until the page scrolls past it
function headerState(){const t=$('#top');if(cur!=='home'){t.classList.remove('solid');return}const sky=$('#hero .hero-sky');t.classList.toggle('solid',scrollY>(sky?sky.offsetHeight-t.offsetHeight-6:160))}
addEventListener('scroll',headerState,{passive:true});

/* ---------- dialogs ---------- */
function ask(msg,{input=null,ok='OK',danger=false,cancel=true}={}){return new Promise(res=>{const d=$('#dialog'),inp=$('#dlginput');
  $('#dlgmsg').textContent=msg;inp.hidden=input===null;inp.value=input||'';$('#dlgok').textContent=ok;$('#dlgok').classList.toggle('danger',danger);$('#dlgno').hidden=!cancel;d.hidden=false;(input!==null?inp:$('#dlgok')).focus();
  const done=v=>{d.hidden=true;$('#dlgok').onclick=$('#dlgno').onclick=d.onclick=inp.onkeydown=null;res(v)};
  $('#dlgok').onclick=()=>done(input!==null?inp.value.trim():true);$('#dlgno').onclick=()=>done(null);
  d.onclick=e=>{if(e.target===d)done(null)};inp.onkeydown=e=>{if(e.key==='Enter')$('#dlgok').click()}})}
addEventListener('keydown',e=>{if(e.key!=='Escape')return;if(!$('#dialog').hidden)$('#dlgno').click();else if(!$('#drawer').hidden)closeDrawer();else if(!$('#sheet').hidden)$('#sheet').hidden=true});

/* ---------- home: the next hike as a skyline, then the list ---------- */
// sample skyline for an empty app: the Făgăraș ridge from Bâlea Lac to Vârful Moldoveanu (OpenStreetMap trail, SRTM heights)
const SAMPLE={prof:[2039,2037,2067,2106,2156,2200,2271,2295,2322,2300,2276,2252,2257,2271,2288,2300,2296,2286,2215,2188,2141,2142,2118,2099,2086,2079,2082,2124,2162,2166,2181,2156,2115,2123,2149,2157,2140,2103,2030,1962,1958,1971,1990,2024,2079,2130,2141,2143,2086,2084,2080,2083,2112,2180,2253,2296,2234,2186,2200,2210,2226,2267,2301,2296,2315,2336,2349,2354,2344,2329,2336,2334,2286,2252,2225,2232,2270,2286,2308,2297,2293,2302,2309,2332,2347,2321,2318,2303,2302,2304,2318,2318,2310,2306,2342,2407,2457,2498,2499,2508],
  pin:{fr:.99,e:2544,name:'Vârful Moldoveanu'},cap:'The Făgăraș ridge from Bâlea Lac'};
const fmtKm=k=>{k=+k||0;return k<20?k.toFixed(1):nf.format(Math.round(k))};
const daysTo=s=>Math.round((parseDay(s)-parseDay(isoDay(new Date())))/864e5);
function greeting(){const h=new Date().getHours(),n=(LOOK.get().name||'').trim();return(h>=5&&h<12?'Good morning':h>=12&&h<18?'Good afternoon':'Good evening')+(n?`, ${n}`:'')+'.'}
function fmtRange(a,b){const A=parseDay(a),B=parseDay(b||a),o=(d,x)=>d.toLocaleDateString('en-GB',x);
  if(!b||a===b)return o(A,{weekday:'long',day:'numeric',month:'long'});
  if(A.getMonth()===B.getMonth())return`${o(A,{weekday:'short'})} ${A.getDate()} to ${o(B,{weekday:'short'})} ${B.getDate()} ${o(B,{month:'long'})}`;
  return`${o(A,{weekday:'short',day:'numeric',month:'short'})} to ${o(B,{weekday:'short',day:'numeric',month:'short'})}`}
let nextMeta=null,latestMeta=null,lastList=[],hasPhoto=false;const fcFail=new Set();
function heroModel(next,count){const g=greeting();
  if(next){const n=daysTo(next.date),e=daysTo(next.end||next.date);
    const when=n>1?`Your next hike starts in ${n} days.`:n===1?'Your next hike starts tomorrow.':n===0?'Your hike starts today.':e>=0?`Today is day ${1-n} of this hike.`:'';
    return{kind:'next',m:next,greet:`${g} ${when}`,title:next.name,dates:fmtRange(next.date,next.end),
      nums:[[fmtKm(next.km),'km'],[nf.format(next.up),'m of climbing'],[next.days,next.days>1?'days':'day']],
      prof:next.prof||SAMPLE.prof,pin:next.prof?{fr:next.hiFr,e:next.hi,name:next.hiName}:null,nights:next.nights||[],go:['open','Open in 3D'],alt:['new','New hike']}}
  return{kind:count?'more':'first',greet:g,title:count?'Where to next?':'Plan your first hike',
    text:count?'Draw a new route on the map or import a GPX file. Your earlier hikes are below.':'Draw a route on the map or import a GPX file. You get a 3D model of the hike with walking times, overnight stops and the weather for your days.',
    prof:SAMPLE.prof,pin:SAMPLE.pin,cap:SAMPLE.cap,nights:[],go:['draw','Draw a route'],alt:['import','Import a GPX file']}}
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
function fcHTML(m){const w=HP.forecastWindow(m.date),wx=m.wx,deg=v=>`${Math.round(v)}°`.replace('-','−'),dayWx=d=>wx&&wx.days?wx.days.find(x=>x.d===d):null;
  if(m.fcd&&m.fcd.length)return`<div class="hfc${m.fcd.length<=4?' fit':''}" role="list" aria-label="Forecast for the hike" style="--n:${m.fcd.length}">${m.fcd.map(d=>{const x=dayWx(d.d),ens=x&&x.src==='ens'&&x.pct,k=ens?topK(x.pct):null;
      return`<div class="fcd" role="listitem"><svg viewBox="0 0 24 24" aria-hidden="true">${LOOK.ICONS[k?HP.WXT[k].ic:d.ic]||LOOK.ICONS.cloud}</svg><b>${esc(fmtDate(d.d,{weekday:'short',day:'numeric'}))}</b>${k?`<span class="lk">${HP.WXT[k].short} ${x.pct[k]}%</span>`:''}<span>${deg(d.tx)} / ${deg(d.tn)}</span>${d.pr>=1?`<span>${Math.round(d.pr)} mm</span>`:''}${ens?mbar(x.pct):''}</div>`}).join('')}</div>`+
    (wx&&wx.src!=='clim'?`<p class="fcnote">Percentages are the share of 51 forecast runs that give that weather. Open the hike for every type.</p>`:'');
  const fd=parseDay(m.date);fd.setDate(fd.getDate()-15);const when=fd.toLocaleDateString('en-GB',{weekday:'long',day:'numeric',month:'long'});
  if(wx&&wx.pct&&w.days>14){const ks=HP.WXK.filter(k=>wx.pct[k]>0).sort((a,b)=>wx.pct[b]-wx.pct[a]);
    return`<div class="hlikely"><p class="hlt">Usual weather on these dates</p>${mbar(wx.pct)}<ul>${ks.map(k=>`<li><i style="background:${HP.WXT[k].c}"></i>${HP.WXT[k].name} <b>${wx.pct[k]}%</b></li>`).join('')}</ul>
      <p class="fcnote">How often each happened here${m.years?` from ${m.years[0]} to ${m.years[1]}`:''}. ${w.days>15?`The forecast for your days appears on ${esc(when)}.`:''}</p></div>`}
  if(w.days>15)return`<p class="fcnote">The forecast for these days appears on ${esc(when)}.</p>`;
  if(w.ok)return`<p class="fcnote">${fcFail.has(m.id)?'The forecast could not be loaded. Open the hike to try again.':navigator.onLine?'Getting the forecast…':'The forecast loads when you are online.'}</p>`;
  return''}
function blobURL(root,b){const u=URL.createObjectURL(b);(root._urls||(root._urls=[])).push(u);return u}
async function renderHero(root,model,{mini=false}={}){
  const P=LOOK.get(),pal=LOOK.pal();let bg=P.bg,ink=pal.bandInk,bgHTML='',skyStyle='',skyInner='';
  let img=null;if(bg==='photo')img=await HP.db.blob('app:photo').catch(()=>null);else if(bg==='map'){const m=model.m||latestMeta;if(m)img=await HP.db.blob(m.id+':relief').catch(()=>null)}
  (root._urls||[]).forEach(u=>URL.revokeObjectURL(u));root._urls=[];
  if(bg==='photo'||bg==='map'){if(img){bgHTML=`<img src="${blobURL(root,img)}" alt=""><div class="shade" style="background:linear-gradient(180deg,rgba(0,0,0,.36) 0%,rgba(0,0,0,0) 24%,rgba(0,0,0,.16) 50%,rgba(6,10,8,.9) 100%),rgba(0,0,0,${(P.dim||0)/100})"></div>`;ink='#fff'}else bg=bg==='map'?'contours':'skyline'}
  if(bg==='contours')bgHTML='<div class="lines"></div>';
  if(bg==='skyline'){const s=skyParts(model,mini);skyInner=s.html;skyStyle=`background:${s.bg}`;ink=s.ink}
  root.dataset.bg=bg;
  const nums=model.nums?`<div class="hnums">${model.nums.map(([v,u])=>`<div><b>${v}</b><span>${u}</span></div>`).join('')}</div>`:'';
  root.innerHTML=`<div class="hero-bg" aria-hidden="true">${bgHTML}</div><div class="hero-sky" style="${skyStyle}">${skyInner}</div><div class="hero-body">`+
    `<p class="greet">${esc(model.greet)}</p><h2 class="htitle">${esc(model.title)}</h2>`+(model.dates&&!mini?`<p class="hdates">${esc(model.dates)}</p>`:'')+(model.text&&!mini?`<p class="hdates htext">${esc(model.text)}</p>`:'')+nums+
    (model.kind==='next'&&!mini?fcHTML(model.m):'')+
    (!mini?`<div class="hcta"><button class="btn primary" data-act="${model.go[0]}">${model.go[1]}</button><button class="btn glass" data-act="${model.alt[0]}">${model.alt[0]==='new'?'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>':''}${model.alt[1]}</button></div>`:'')+`</div>`;
  return ink}
let homeSeq=0;
async function showHome(){show('home');await renderHome()}
async function loadHikes(){let list=[];try{list=await HP.db.list()}catch(e){HP.toast('Saved hikes could not be read: '+e.message)}
  const today=isoDay(new Date()),up=list.filter(m=>(m.end||m.date)>=today).sort((a,b)=>a.date<b.date?-1:1),past=list.filter(m=>(m.end||m.date)<today).sort((a,b)=>a.date<b.date?1:-1);
  return{list,up,past,next:up[0]||null,latest:list.slice().sort((a,b)=>(b.created||0)-(a.created||0))[0]||null}}
async function renderHome(){const seq=++homeSeq,{list,up,past,next,latest}=await loadHikes();
  if(seq!==homeSeq)return;lastList=list;nextMeta=next;latestMeta=latest;
  const ink=await renderHero($('#hero'),heroModel(nextMeta,list.length));if(seq!==homeSeq)return;
  document.body.style.setProperty('--sky-ink',ink);headerState();renderList(up,past,list);installHint();
  const miss=list.filter(m=>m.v!==3);if(miss.length)backfill(miss).then(ch=>{if(ch&&cur==='home')renderHome()});
  else if(nextMeta)refreshForecast(nextMeta).then(ch=>{if(ch&&cur==='home')renderHome()})}
function spark(p){if(!p||p.length<2)return'';const lo=Math.min(...p),hi=Math.max(...p),r=Math.max(hi-lo,250),n=p.length,pt=p.map((e,i)=>`${(i/(n-1)*100).toFixed(1)},${(22.5-(e-lo)/r*19).toFixed(1)}`).join('L');
  return`<svg viewBox="0 0 100 24" preserveAspectRatio="none" aria-hidden="true"><path d="M0,24L${pt}L100,24Z" fill="currentColor" fill-opacity=".16" stroke="none"/><path d="M${pt}" stroke="currentColor" stroke-width="1.6" vector-effect="non-scaling-stroke"/></svg>`}
function renderList(up,past,list){const P=LOOK.get();
  const row=(m,old)=>`<button class="hike${old?' past':''}" data-id="${esc(m.id)}">${m.thumb?`<img class="th" src="${m.thumb}" alt="">`:'<span class="th"></span>'}<span class="nm">${esc(m.name)}</span><span class="dt">${esc(fmtDate(m.date,{weekday:'short',day:'numeric',month:'short',year:'numeric'}))}, ${m.days} ${m.days>1?'days':'day'}</span><span class="pf">${spark(m.prof)}<span>${fmtKm(m.km)} km</span><span>${nf.format(m.up)} m up</span></span><svg class="chev" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg></button>`;
  $('#listwrap').querySelector('.listhead').hidden=!list.length;
  const tk=list.reduce((s,m)=>s+(+m.km||0),0),tu=list.reduce((s,m)=>s+(+m.up||0),0);
  $('#totals').textContent=P.totals&&list.length>1?`${list.length} hikes, ${fmtKm(tk)} km and ${nf.format(Math.round(tu/10)*10)} m of climbing in all.`:'';
  $('#hikes').innerHTML=up.map(m=>row(m,false)).join('')+(past.length?`<h3 class="past-h">Past hikes</h3>`+past.map(m=>row(m,true)).join(''):'')}
$('#hikes').addEventListener('click',e=>{const b=e.target.closest('.hike');if(b)go('#/hike/'+encodeURIComponent(b.dataset.id))});
$('#hero').addEventListener('click',e=>{const b=e.target.closest('[data-act]');if(!b)return;const a=b.dataset.act;
  if(a==='open'&&nextMeta)go('#/hike/'+encodeURIComponent(nextMeta.id));else if(a==='new'||a==='draw'){go('#/new');setMode('draw')}else if(a==='import')startImport()});
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
  el.innerHTML=installEvt?`<b>Install the app</b> to open it from your home screen, full screen and without a connection. <button class="btn small" id="instbtn">Install</button>`:
    isIOS?`<b>Put it on your home screen:</b> in Safari, tap the Share button, then <b>Add to Home Screen</b>. It then opens full screen and works without a connection.`:
    `<b>Put it on your home screen:</b> open the browser menu, then choose <b>Install app</b> or <b>Add to Home screen</b>. It then opens full screen and works without a connection.`;
  const b=$('#instbtn');if(b)b.onclick=installNow}
async function installNow(){if(standalone()){HP.toast('The app is already on your home screen.');return}
  if(installEvt){const ev=installEvt;installEvt=null;ev.prompt();try{await ev.userChoice}catch(e){}if(cur==='home')installHint();return}
  await ask(isIOS?'In Safari, tap the Share button, then Add to Home Screen. The app then opens from its own icon, full screen, and works without a connection.':'Open the browser menu, then choose Install app or Add to Home screen. The app then opens from its own icon, full screen, and works without a connection.',{ok:'Done',cancel:false})}
addEventListener('beforeinstallprompt',e=>{e.preventDefault();installEvt=e;if(cur==='home')installHint()});
document.addEventListener('hp-look',()=>{if(cur==='home')renderHome()});

/* ---------- the menu ---------- */
function openDrawer(){const d=$('#drawer');d.hidden=false;$('#menubtn').setAttribute('aria-expanded','true');
  const here={home:'home',custom:'customize',about:'about'}[cur];$$('.ditem').forEach(b=>{if(b.dataset.go===here)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current')});
  $('#dinstall').hidden=standalone();storageNote();$('.ditem').focus()}
function closeDrawer(){$('#drawer').hidden=true;$('#menubtn').setAttribute('aria-expanded','false');$('#menubtn').focus()}
$('#menubtn').addEventListener('click',openDrawer);$('#dclose').addEventListener('click',closeDrawer);
$('#drawer').addEventListener('click',e=>{if(e.target.id==='drawer'){closeDrawer();return}const b=e.target.closest('[data-go]');if(!b)return;const g=b.dataset.go;closeDrawer();
  if(g==='home'){if(cur!=='home')go('#/')}else if(g==='new'){go('#/new');setMode('draw')}else if(g==='import')startImport();else if(g==='customize')go('#/customize');else if(g==='about')go('#/about');else if(g==='install')installNow()});
async function storageNote(){const n=lastList.length;let t=n?`${n} ${n>1?'hikes':'hike'} saved on this phone`:'No hikes saved yet';
  try{const e=navigator.storage&&await navigator.storage.estimate();if(e&&e.usage&&n)t+=`, using ${(e.usage/1048576).toFixed(e.usage<10485760?1:0)} MB`}catch(x){}
  $('#dfoot').textContent=`${t}. Version ${VERSION}.`}

/* ---------- Customize ---------- */
const BGS=[['skyline','Skyline of your next hike'],['contours','Contour lines'],['map','Map of your hike'],['photo','Your photo'],['plain','Plain colour']];
const seg=(k,opts)=>opts.map(([v,t])=>`<button data-k="${k}" data-v="${v}" aria-pressed="${String(LOOK.get()[k])===v}">${t}</button>`).join('');
async function renderCustom(){
  if(!lastList.length){const h=await loadHikes();lastList=h.list;nextMeta=h.next;latestMeta=h.latest}
  const P=LOOK.get(),pal=LOOK.pal(),sky=LOOK.sky(),photo=await HP.db.blob('app:photo').catch(()=>null);hasPhoto=!!photo;
  const box=$('#custom'),focus=document.activeElement&&box.contains(document.activeElement)?(document.activeElement.id||`[data-k="${document.activeElement.dataset.k}"][data-v="${document.activeElement.dataset.v}"]`):null;
  (box._urls||[]).forEach(u=>URL.revokeObjectURL(u));box._urls=[];
  const prof=nextMeta&&nextMeta.prof||SAMPLE.prof,mini=LOOK.skyline(prof,{band:pal.band,far:LOOK.mix(LOOK.mix(pal.band,sky.top,.5),sky.hor,.34),hor:sky.hor,rim:LOOK.mix(pal.band,'#ffffff',.24),seed:7,top:.3,bot:.96}).svg;
  const thumb=(nextMeta||latestMeta||{}).thumb;
  const pv={skyline:`<div style="background:linear-gradient(${sky.top},${sky.hor})"></div>${mini}`,contours:`<div class="lines" style="background:${pal.bandInk};opacity:.2;-webkit-mask:url(img/contours.svg) center/cover;mask:url(img/contours.svg) center/cover"></div>`,
    map:thumb?`<img src="${thumb}" alt="">`:`<span class="pvnote">Plan a hike first</span>`,photo:photo?`<img src="${blobURL(box,photo)}" alt="">`:`<span class="pvnote">Choose a photo</span>`,plain:''};
  box.innerHTML=`<div class="cprev" aria-hidden="true"><div class="hero" id="cprev"></div></div>
<section class="csec"><h3>Theme</h3><p>Colours for the header, the home screen and the buttons.</p><div class="themes">${LOOK.THEMES.map(t=>`<button class="tsw" data-k="theme" data-v="${t.id}" aria-pressed="${P.theme===t.id}" style="--b:${t.band};--a:${P.acc||t.acc}"><span class="blz"><i></i></span><b>${t.name}</b><small>${t.note}</small></button>`).join('')}</div></section>
<section class="csec"><h3>Light or dark</h3><p>Automatic follows your phone's setting.</p><div class="segc">${seg('mode',[['auto','Automatic'],['light','Light'],['dark','Dark']])}</div></section>
<section class="csec"><h3>Accent colour</h3><p>For the main buttons, the trail mark and highlights.</p><div class="swatches"><button class="sw def" data-k="acc" data-v="" aria-pressed="${!P.acc}">Theme colour</button>${LOOK.ACCENTS.map(c=>`<button class="sw" data-k="acc" data-v="${c}" style="--c:${c}" aria-pressed="${P.acc===c}" aria-label="Accent colour ${c}"></button>`).join('')}<label class="sw pick" title="Any colour"><input type="color" id="accpick" value="${pal.acc}" aria-label="Choose any accent colour"></label></div></section>
<section class="csec"><h3>Home screen background</h3><p>What sits behind your next hike.</p><div class="bgs">${BGS.map(([k,t])=>`<button class="bgt" data-k="bg" data-v="${k}" aria-pressed="${P.bg===k}"><span class="pv">${pv[k]}</span><span>${t}</span></button>`).join('')}</div>
  <div class="copt"${P.bg==='skyline'?'':' hidden'}><label for="todtg">Sky follows the time of day<small>Dawn, daylight, sunset and night by your phone's clock. Off uses the theme colours.</small></label><input type="checkbox" class="tg" id="todtg"${P.tod?' checked':''}></div>
  <div class="crange"${P.bg==='photo'||P.bg==='map'?'':' hidden'}><label for="dimr">Darken the picture</label><input type="range" id="dimr" min="0" max="70" step="5" value="${P.dim}"><output>${P.dim}%</output></div>
  <div class="row2"${P.bg==='photo'?'':' hidden'}><button class="btn small" id="cphoto">${photo?'Choose another photo':'Choose a photo'}</button>${photo?'<button class="btn small ghost" id="cnophoto">Remove the photo</button>':''}</div>
  <div class="copt"><label for="textg">Contour lines behind the pages<small>A faint topographic pattern on the page background</small></label><input type="checkbox" class="tg" id="textg"${P.texture?' checked':''}></div></section>
<section class="csec"><h3>Text size</h3><div class="segc">${seg('text',[['m','Standard'],['l','Large'],['xl','Extra large']])}</div></section>
<section class="csec"><h3>Corners</h3><div class="segc">${seg('corners',[['soft','Soft'],['sharp','Sharp'],['round','Round']])}</div></section>
<section class="csec"><h3>Your hikes list</h3><div class="segc">${seg('list',[['rows','Rows'],['cards','Cards']])}</div><div class="copt"><label for="tottg">Show totals<small>Hikes, kilometres and climbing added up</small></label><input type="checkbox" class="tg" id="tottg"${P.totals?' checked':''}></div></section>
<section class="csec"><h3>Greeting</h3><p>Your name for the greeting on the home screen. Leave it empty for no name.</p><input class="cname" id="cname" maxlength="30" value="${esc(P.name)}" placeholder="Your name" autocomplete="given-name" aria-label="Your name"></section>
<section class="csec"><h3>Route colours in 3D</h3><p>The colours of the days on the 3D map, the profile and the table. They change the next time you open a hike.</p><div class="routes">${Object.entries(LOOK.ROUTE).map(([k,r])=>`<button class="rt" data-k="route" data-v="${k}" aria-pressed="${P.route===k}"><i>${r.c.slice(0,5).map(c=>`<b style="--c:${c}"></b>`).join('')}</i>${r.name}</button>`).join('')}</div></section>
<button class="btn ghost creset" id="creset">Reset to the original look</button>`;
  await renderPreview();
  if(focus){const el=focus.startsWith('[')?box.querySelector(focus):document.getElementById(focus);if(el)el.focus({preventScroll:true})}}
async function renderPreview(){const el=$('#cprev');if(el)await renderHero(el,heroModel(nextMeta,lastList.length),{mini:true})}
$('#custom').addEventListener('click',async e=>{const b=e.target.closest('[data-k]');
  if(b){const k=b.dataset.k,v=b.dataset.v;if(k==='bg'&&v==='photo'&&!hasPhoto){$('#photoin').click();return}LOOK.set(k,v);renderCustom();return}
  if(e.target.closest('#cphoto')){$('#photoin').click();return}
  if(e.target.closest('#cnophoto')){await HP.db.delBlob('app:photo').catch(()=>{});LOOK.set('bg','skyline');renderCustom();return}
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
  L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',{subdomains:'abc',maxZoom:17,attribution:'© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>, SRTM · <a href="https://opentopomap.org">OpenTopoMap</a> (CC-BY-SA)'}).addTo(map);
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
function updateHow(){const n=NEW.pts.length;$('#how').textContent=(navigator.onLine?'':'You are offline. Planning a new hike needs a connection; your saved hikes still open. ')+(NEW.mode==='file'?'Choose a route file. It shows on the map; the plan follows it exactly.':
  n===0?'Tap the map where you start. Search for a place or use your location to get there quickly.':n===1?'Now tap where you finish, or the next place you want to pass.':
  'Tap to add more points. Drag a point to move it, tap a point to remove it, or tap the line to add a point in between. The route follows mapped trails.')}
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
$('#bcancel').addEventListener('click',()=>{cancelBuild();show('new','New hike');refreshNewMap()});
$('#details').addEventListener('submit',e=>{e.preventDefault();startBuild()});
const newId=()=>Date.now().toString(36)+Math.random().toString(36).slice(2,7);
const metaOf=(D,thumb)=>{const R=D.route,n=R.d.length,L=R.d[n-1]||1,end=parseDay(D.date);end.setDate(end.getDate()+D.days.length-1);
  const prof=[];let j=0;for(let k=0;k<100;k++){let mx=-1e9;const lim=L*(k+1)/100+1e-6;while(j<n&&R.d[j]<=lim){mx=Math.max(mx,R.e[j]);j++}prof.push(Math.round(mx>-1e9?mx:(k?prof[k-1]:R.e[0])))}
  let hi=0;for(let i=1;i<n;i++)if(R.e[i]>R.e[hi])hi=i;
  const near=D.points.filter(p=>p.kind!=='water'&&p.kind!=='high'&&Math.abs(R.d[p.i]-R.d[hi])<.4).sort((a,b)=>Math.abs(R.d[a.i]-R.d[hi])-Math.abs(R.d[b.i]-R.d[hi]))[0];
  const hiE=near&&D.official&&D.official[near.name]?D.official[near.name]:R.e[hi];
  return{v:3,id:D.id,name:D.name,date:D.date,end:isoDay(end),days:D.days.length,km:+(+L).toFixed(2),up:D.days.reduce((s,d)=>s+d.up,0),created:D.created,updated:Date.now(),center:D.center,thumb,
    prof,hi:Math.round(hiE),hiFr:+(R.d[hi]/L).toFixed(4),hiName:near?near.name:'',nights:D.days.slice(0,-1).map(d=>+(R.d[d.i1]/L).toFixed(4)),fcd:fcDays(D),fcAt:D.fc?D.fc.issued:0,
    wx:wxSummary(D),ensAt:D.ens?D.ens.issued:0,years:D.clim&&D.clim.years||null}};
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
    building=null;Object.assign(NEW,{pts:[],hist:[],routed:null,file:null,err:''});$('#hname').value='';delete $('#hname').dataset.auto;
    if(map){drawWps();drawLine()}updateStats();
    replace('#/hike/'+encodeURIComponent(D.id))}
  catch(e){if(ac.signal.aborted||ac!==building)return;building=null;console.error(e);
    const li=$('#steps li.work');if(li)stepSet(li.dataset.k,-1);
    $('#berr').hidden=false;$('#berr').textContent=/Cancelled/.test(e.message)?'Cancelled.':e.message||'Something went wrong.';$('#bagain').hidden=false;$('#bcancel').textContent='Back to the route'}}
$('#bagain').addEventListener('click',startBuild);

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
  if(!D.id)D.id=id;viewId=id;show('view',D.name);HP.viewer.open(D,blobs,onPlanChange)}
$('#more').addEventListener('click',()=>{$('#sheet').hidden=false;$('#sheet .row').focus()});
$('#sheet').addEventListener('click',async e=>{const sh=$('#sheet');if(e.target===sh){sh.hidden=true;return}const b=e.target.closest('[data-act]');if(!b)return;sh.hidden=true;
  const D=HP.viewer.current();if(!D)return;const act=b.dataset.act;
  if(act==='rename'){const v=await ask('Name of this hike',{input:D.name,ok:'Save'});if(v){D.name=v.slice(0,80);onPlanChange(D);await flushSave()}}
  else if(act==='gpx')exportGPX(D);
  else if(act==='forecast'){if(!navigator.onLine){HP.toast('No connection right now.');return}HP.viewer.updateForecast()}
  else if(act==='delete'){if(await ask(`Delete “${D.name}” from this phone?`,{ok:'Delete',danger:true})){pending=null;clearTimeout(saveT);HP.viewer.close();viewId=null;cur='';await HP.db.remove(D.id);HP.toast('Hike deleted');replace('#/')}}});
async function exportGPX(D){const R=D.route;
  const w=D.points.filter(p=>p.kind!=='high').map(p=>({lat:R.lat[p.i],lon:R.lon[p.i],name:p.name}));D.days.slice(0,-1).forEach(d=>{if(!D.points.some(p=>p.i===d.i1))w.push({lat:R.lat[d.i1],lon:R.lon[d.i1],name:`Night ${d.n}: ${d.to}`})});
  const gpx=HP.toGPX(D.name,R.lat,R.lon,R.e,w),fname=(D.name.replace(/[\\/:*?"<>|]+/g,'').trim().replace(/\s+/g,'-')||'hike')+'.gpx',file=new File([gpx],fname,{type:'application/gpx+xml'});
  if(coarse&&navigator.canShare){try{if(navigator.canShare({files:[file]})){await navigator.share({files:[file],title:D.name});return}}catch(e){if(e.name==='AbortError')return}}
  HP.download(fname,file);HP.toast('GPX file saved to your downloads')}

/* ---------- start ---------- */
$('#hint').textContent=coarse?'One finger turns · two fingers move and zoom · tap the line':'Drag to turn · right-drag to move · scroll to zoom · click the line';
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
