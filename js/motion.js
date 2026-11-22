'use strict';
/* Hike Planner 3D: motion.
   - Press: anything you can press shrinks a little the moment a finger lands (no waiting for the tap to finish) and springs
     back when it lifts; a scroll that starts on it cancels the press. Small things shrink more than big cards.
   - Pages: the View Transition API animates from one screen to the next: a push from the right going deeper, the reverse going
     back, a card growing into its page and shrinking back into its place, a hike's picture growing into its 3D view.
     Browsers without it get a short slide or fade of the new screen.
   - Overlays (menu, sheet, dialog, toast, the live guide) animate in with CSS, and out through close() before they hide.
   - Segmented controls and chip rows get one indicator that slides to the chosen option.
   Only transform and opacity are animated, so the compositor does the work; reduced motion turns it all into instant changes. */
(function(){
const RM=matchMedia('(prefers-reduced-motion: reduce)'),reduced=()=>RM.matches;
// a spring with a little give (damping 0.68): fast to respond, soft to settle; and a calmer one (0.8) for things that slide
const SPRING='linear(0, 0.0211, 0.0762, 0.1544, 0.2467, 0.3459, 0.4461, 0.5431, 0.6338, 0.7162, 0.789, 0.8518, 0.9045, 0.9477, 0.982, 1.0083, 1.0276, 1.0409, 1.0491, 1.0533, 1.0543, 1.0528, 1.0496, 1.0452, 1.0401, 1.0347, 1.0293, 1.024, 1.0192, 1.0148, 1.0109, 1.0076, 1.0048, 1.0025, 1.0007, 0.9994, 0.9984, 0.9977, 0.9973, 0.9971, 0.9971, 0.9972, 0.9973, 0.9976, 0.9979, 0.9982, 0.9985, 0.9987, 1)';
const OUT='cubic-bezier(.22,1,.36,1)';
const okLinear=(()=>{try{return CSS.supports('transition-timing-function','linear(0, 1)')}catch(e){return false}})();
const SPR=okLinear?SPRING:'cubic-bezier(.34,1.3,.64,1)';

/* ---------- press ---------- */
const PRESS='button,.btn,[role=button],.card[data-det],.hike,.chip,.wchip,label.ck,a.sosn,.gcall a';
const SKIP='#cv,.leaflet-container,#prof,.dchart,[disabled],.seg,.segc,.chips,.wchips';
let pr=null;
const scaleOf=el=>{const v=getComputedStyle(el).scale;return!v||v==='none'?1:parseFloat(v)||1};
function pressIn(el){const r=el.getBoundingClientRect();if(!r.width)return;const s=Math.max(.95,Math.min(.985,1-7/Math.max(r.width,r.height*1.6)));
  const from=scaleOf(el);if(el._pa)el._pa.cancel();el._pa=el.animate({scale:[String(from),String(s)]},{duration:110,easing:OUT,fill:'forwards'})}
function pressOut(el){const from=scaleOf(el);if(el._pa)el._pa.cancel();el._pa=el.animate({scale:[String(from),'1']},{duration:520,easing:SPR});el._pa.onfinish=()=>{el._pa=null}}
document.addEventListener('pointerdown',e=>{if(e.button>0||reduced())return;const el=e.target.closest(PRESS);if(!el||el.matches(SKIP)||el.closest(SKIP))return;
  if(pr)pressOut(pr.el);pr={el,x:e.clientX,y:e.clientY};pressIn(el)},{passive:true});
const release=()=>{if(pr){pressOut(pr.el);pr=null}};
document.addEventListener('pointerup',release,{passive:true});document.addEventListener('pointercancel',release,{passive:true});
document.addEventListener('pointermove',e=>{if(pr&&Math.hypot(e.clientX-pr.x,e.clientY-pr.y)>10)release()},{passive:true});
addEventListener('blur',release);
// iOS shows :active only when a touch listener exists somewhere
document.addEventListener('touchstart',()=>{},{passive:true});

/* ---------- page transitions ---------- */
let vtTo=null;
// type: push, pop, expand (from a card into its page), collapse (back into the card), hero (a picture into the 3D view), fade, none
function vt(update,{type='fade',from=null,to=null,name='surface'}={}){const html=document.documentElement;
  const after=()=>{const el=typeof to==='function'?to():to;return el};
  if(type==='none'||reduced()||document.hidden||!document.startViewTransition){
    const r=Promise.resolve(update());if(type!=='none'&&!reduced()&&!document.hidden)r.then(()=>fallback(type)).catch(()=>{});return r.catch(e=>console.error(e))}
  if(from&&from.isConnected&&from.getClientRects().length)from.style.viewTransitionName=name;else from=null;
  if((type==='expand'||type==='hero')&&!from)type='fade';
  html.dataset.vt=type;if(type==='hero'||type==='expand'||type==='collapse')html.dataset.vtn=name;
  let t;try{t=document.startViewTransition(async()=>{if(from)from.style.viewTransitionName='';await update();
      const el=after();if(el&&el.getClientRects().length){el.style.viewTransitionName=name;vtTo=el}else if(type==='collapse')html.dataset.vt='fade'})}
  catch(e){delete html.dataset.vt;if(from)from.style.viewTransitionName='';return Promise.resolve(update())}
  t.finished.catch(()=>{}).finally(()=>{if(!t._stale){delete html.dataset.vt;delete html.dataset.vtn}if(vtTo){vtTo.style.viewTransitionName='';vtTo=null}});
  if(vt.cur)vt.cur._stale=true;vt.cur=t;t.finished.finally(()=>{if(vt.cur===t)vt.cur=null}).catch(()=>{});
  return t.updateCallbackDone.catch(e=>console.error(e))}
// without the API: the screen that just appeared slides or fades in
function fallback(type){const el=[...document.querySelectorAll('main>.screen,#scr-detail')].find(s=>!s.hidden);if(!el||!el.animate)return;
  const k={push:[{transform:'translateX(28px)',opacity:0},{transform:'none',opacity:1}],pop:[{transform:'translateX(-20px)',opacity:0},{transform:'none',opacity:1}],
    expand:[{transform:'translateY(18px) scale(.985)',opacity:0},{transform:'none',opacity:1}],hero:[{opacity:0},{opacity:1}],collapse:[{opacity:0},{opacity:1}],fade:[{opacity:0},{opacity:1}]}[type];
  if(k)el.animate(k,{duration:type==='push'||type==='expand'?340:240,easing:OUT})}

/* ---------- overlays: CSS brings them in; close() plays the way out, then hides ---------- */
function open(el){if(!el)return;clearTimeout(el._ct);el.classList.remove('out');el.hidden=false}
function close(el,done){if(!el||el.hidden){if(done)done();return}if(el.classList.contains('out')){el._done=done||el._done;return}
  if(reduced()){el.hidden=true;if(done)done();return}
  el.classList.add('out');el._done=done;void el.offsetWidth;
  const anims=el.getAnimations?el.getAnimations({subtree:true}).filter(a=>a.playState!=='finished'):[];
  const fin=()=>{if(!el.classList.contains('out'))return;clearTimeout(el._ct);el.classList.remove('out');el.hidden=true;const d=el._done;el._done=null;if(d)d()};
  el._ct=setTimeout(fin,420);if(anims.length)Promise.all(anims.map(a=>a.finished.catch(()=>{}))).then(fin)}

/* ---------- a sliding indicator for segmented controls and chip rows ---------- */
const LAST=new Map();   // where each control's indicator was, so a control drawn again slides from there
function slider(box){if(!box||box._sl)return;box._sl=true;box.classList.add('has-ind');const key=box.id||(box.querySelector('[data-k]')||{dataset:{}}).dataset.k||'';let last=key&&LAST.get(key)||null,fresh=!!last;
  const place=anim=>{if(fresh){anim=true;fresh=false}const b=box.querySelector('button[aria-pressed=true]');let ind=box.querySelector(':scope>.segi');
    if(!ind){ind=document.createElement('i');ind.className='segi';ind.setAttribute('aria-hidden','true');box.prepend(ind)}
    if(!b||!b.offsetWidth){ind.style.opacity='0';return}
    const p={x:b.offsetLeft,y:b.offsetTop,w:b.offsetWidth,h:b.offsetHeight};
    if(last&&anim&&!reduced()&&(last.x!==p.x||last.w!==p.w)){ind.animate({transform:[`translate(${last.x}px,${last.y}px)`,`translate(${p.x}px,${p.y}px)`],width:[last.w+'px',p.w+'px'],height:[last.h+'px',p.h+'px']},{duration:560,easing:SPR})}
    ind.style.transform=`translate(${p.x}px,${p.y}px)`;ind.style.width=p.w+'px';ind.style.height=p.h+'px';ind.style.opacity='1';last=p;if(key)LAST.set(key,p)};
  let q=0;const later=()=>{if(!q)q=requestAnimationFrame(()=>{q=0;place(true)})};
  new MutationObserver(later).observe(box,{subtree:true,childList:true,attributes:true,attributeFilter:['aria-pressed']});
  if(window.ResizeObserver)new ResizeObserver(()=>place(false)).observe(box);
  place(false)}
function sliders(root=document){root.querySelectorAll('.seg,.segc,.chips,.wchips').forEach(slider)}

/* ---------- gestures: drag a sheet down to close it; swipe from the left edge to go back ---------- */
// A sheet follows the finger down (and resists going up); let go past a quarter of its height, or with a flick, and it closes.
function dragDismiss(box,onClose){if(!box||box._dd)return;box._dd=true;let g=null;
  box.addEventListener('pointerdown',e=>{if(e.pointerType==='mouse'&&e.button>0)return;g={y:e.clientY,x:e.clientX,t:performance.now(),dy:0,on:false,id:e.pointerId}},{passive:true});
  box.addEventListener('pointermove',e=>{if(!g||e.pointerId!==g.id)return;const dy=e.clientY-g.y,dx=e.clientX-g.x;
    if(!g.on){if(Math.abs(dx)>Math.abs(dy)&&Math.abs(dx)>8){g=null;return}if(Math.abs(dy)<8)return;g.on=true;try{box.setPointerCapture(e.pointerId)}catch(_){}}
    g.dy=dy>0?dy:-Math.sqrt(-dy)*2;g.v=dy/(performance.now()-g.t);box.style.transform=`translateY(${g.dy}px)`},{passive:true});
  const end=()=>{if(!g)return;const on=g.on,dy=g.dy,v=g.v||0;g=null;if(!on)return;
    if(dy>box.offsetHeight*.25||v>.6&&dy>24){const a=box.animate({transform:[`translateY(${dy}px)`,'translateY(100%)']},{duration:200,easing:OUT,fill:'forwards'});
      a.finished.then(()=>Promise.resolve(onClose()).then(()=>{a.cancel();box.style.transform=''}))}
    else{box.animate({transform:[`translateY(${dy}px)`,'translateY(0)']},{duration:480,easing:SPR});box.style.transform=''}
    box.addEventListener('click',ev=>{ev.stopPropagation();ev.preventDefault()},{capture:true,once:true})};
  box.addEventListener('pointerup',end);box.addEventListener('pointercancel',()=>{if(g&&g.on){box.animate({transform:[`translateY(${g.dy}px)`,'translateY(0)']},{duration:400,easing:SPR});box.style.transform=''}g=null})}
// Swipe back: a touch that starts at the left edge of a page that has a way back drags the page to the right;
// past a third of the screen, or with a flick, it slides off and the app goes back. Touch listeners are added only for
// such a touch, so scrolling everywhere else keeps the browser's fast path.
function edgeBack(getPage,goBack){
  document.addEventListener('touchstart',e=>{if(e.touches.length!==1||reduced())return;const t=e.touches[0];if(t.clientX>24)return;const el=getPage();if(!el)return;
    let g={x:t.clientX,y:t.clientY,t:performance.now(),dx:0,on:false,v:0};
    const move=ev=>{const p=ev.touches[0],dx=p.clientX-g.x,dy=p.clientY-g.y;
      if(!g.on){if(Math.abs(dy)>10&&Math.abs(dy)>Math.abs(dx)){done();return}if(dx<8)return;g.on=true;el.style.willChange='transform'}
      ev.preventDefault();const n=performance.now();g.v=(dx-g.dx)/Math.max(1,n-(g.tm||g.t));g.tm=n;g.dx=Math.max(0,dx);
      el.style.transform=`translateX(${g.dx}px)`;el.style.boxShadow='-18px 0 40px rgba(0,0,0,.35)'};
    const done=()=>{document.removeEventListener('touchmove',move,{passive:false});document.removeEventListener('touchend',up);document.removeEventListener('touchcancel',up)};
    const up=()=>{done();if(!g.on)return;const W=innerWidth,dx=g.dx;el.style.willChange='';
      if(dx>W/3||g.v>.45&&dx>30){const a=el.animate({transform:[`translateX(${dx}px)`,`translateX(${W}px)`]},{duration:Math.max(140,260*(1-dx/W)),easing:OUT,fill:'forwards'});
        a.finished.then(()=>{goBack(()=>{a.cancel();el.style.transform='';el.style.boxShadow=''})})}
      else{el.animate({transform:[`translateX(${dx}px)`,'translateX(0)']},{duration:460,easing:SPR});el.style.transform='';el.style.boxShadow=''}};
    document.addEventListener('touchmove',move,{passive:false});document.addEventListener('touchend',up);document.addEventListener('touchcancel',up)},{passive:true})}

HP.motion={vt,open,close,slider,sliders,dragDismiss,edgeBack,reduced,SPRING:SPR,OUT};
})();
