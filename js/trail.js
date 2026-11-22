'use strict';
/* Hike Planner 3D: the trail check. The route is matched to the paths mapped in OpenStreetMap: how hard each part is (SAC
   grade), how visible and how well marked the path is, the waymarks to follow, the junctions where you must choose the right
   way, the hazards beside it (cliffs, glaciers, fords, ladders and chains, official closures) and where the roads are.
   The result is kept with the hike (D.trail), so it works offline. */
(function(){
const {geo}=HP;
HP.TRAIL_V=1;
const SAC={hiking:1,mountain_hiking:2,demanding_mountain_hiking:3,alpine_hiking:4,demanding_alpine_hiking:5,difficult_alpine_hiking:5};   // the app's grades stop at 5
const VIS={excellent:1,good:1,intermediate:2,bad:3,horrible:4,no:5};
HP.VISN=['','clear on the ground','visible in places','hard to see','barely visible','no visible path'];
const ROAD=/^(motorway|trunk|primary|secondary|tertiary|unclassified|residential|living_street|service|road)(_link)?$/;
const SKIP='bus_stop|platform|proposed|construction|elevator|razed|abandoned|disused|corridor|rest_area|services|emergency_bay|turning_circle|traffic_signals|street_lamp|crossing|give_way|stop|milestone';
const SERVERS=[['https://overpass-api.de/api/interpreter',60000],['https://overpass.kumi.systems/api/interpreter',45000],['https://overpass.private.coffee/api/interpreter',45000]];

// small boxes hugging the route: Overpass answers these much faster than a corridor around a long line
function boxes(R,stepKm=.6,padM=60){const out=[],m=R.lat.length;let a=0;
  while(a<m-1){let b=a;while(b<m-1&&R.d[b]-R.d[a]<stepKm)b++;let s=90,n=-90,w=180,e=-180;for(let i=a;i<=b;i++){s=Math.min(s,R.lat[i]);n=Math.max(n,R.lat[i]);w=Math.min(w,R.lon[i]);e=Math.max(e,R.lon[i])}
    const dl=padM/111320,dk=padM/(111320*Math.cos((s+n)/2*Math.PI/180));out.push(`${(s-dl).toFixed(5)},${(w-dk).toFixed(5)},${(n+dl).toFixed(5)},${(e+dk).toFixed(5)}`);a=b}
  return out}
HP.trailQuery=R=>{const B=boxes(R),U=f=>B.map(f).join('');
  return `[out:json][timeout:90][maxsize:134217728];(${U(b=>`way["highway"]["highway"!~"^(${SKIP})$"](${b});`)})->.w;.w out body geom qt;rel(bw.w)["route"~"^(hiking|foot|walking)$"];out body qt;`+
    `(${U(b=>`nwr["natural"~"^(cliff|glacier)$"](${b});nwr["hazard"](${b});node["ford"](${b});node["information"="guidepost"](${b});node["emergency"~"^(mountain_rescue|phone)$"](${b});`)});out body geom qt;`};
async function overpass(q,signal){let err;
  for(const[host,ms]of SERVERS){if(signal&&signal.aborted)throw Error('Cancelled');
    try{const j=await HP.fetchJSON(host,{method:'POST',body:'data='+encodeURIComponent(q),headers:{'Content-Type':'application/x-www-form-urlencoded'}},ms);if(j&&j.elements)return j.elements;err=Error('no data')}catch(e){err=e}}
  throw err||Error('Trail data unavailable')}
// official closures and detours of Swiss hiking trails (Federal Roads Office, through swisstopo)
const inCH=b=>b.n>45.8&&b.s<47.85&&b.e>5.95&&b.w<10.5;
async function closuresCH(b){if(!inCH(b))return[];const ext=`${b.w},${b.s},${b.e},${b.n}`;
  const j=await HP.fetchJSON(`https://api3.geo.admin.ch/rest/services/api/MapServer/identify?geometryType=esriGeometryEnvelope&geometry=${ext}&sr=4326&imageDisplay=600,600,96&mapExtent=${ext}&tolerance=0&layers=all:ch.astra.wanderland-sperrungen_umleitungen&returnGeometry=true&geometryFormat=geojson&lang=en`,{},20000);
  return(j.results||[]).map(r=>({a:r.properties||r.attributes||{},g:r.geometry})).filter(r=>r.g)}
async function country(lat,lon){try{const j=await HP.fetchJSON(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat.toFixed(4)}&lon=${lon.toFixed(4)}&zoom=3&accept-language=en`,{},12000);return(j.address&&j.address.country_code||'').toLowerCase()}catch(e){return''}}

/* ---------- waymarks: OSM's osmc:symbol, drawn and put into words ---------- */
const COL={red:'#d62828',white:'#ffffff',yellow:'#f2c400',blue:'#1d5fd6',green:'#2e9a3a',black:'#1a1a1a',orange:'#f08a18',purple:'#7b3fb3',brown:'#8a5a2b',gray:'#8a8a8a',grey:'#8a8a8a'};
const SHAPE={bar:'stripe',stripe:'vertical stripe',cross:'cross',x:'cross',triangle:'triangle',triangle_turned:'triangle',triangle_line:'triangle',dot:'dot',circle:'ring',diamond:'diamond',diamond_line:'diamond',lower:'band',upper:'band',corner:'corner',frame:'square',rectangle:'square',rectangle_line:'square',fork:'fork',arch:'arch',pointer:'arrow',bowl:'bowl',turned_T:'T',L:'L',slash:'slash',backslash:'slash',hiker:'walker',wheel:'wheel'};
HP.osmcParse=s=>{const p=String(s||'').split(':'),fg=(p[2]||'').match(/^([a-z]+)_([a-z_]+)$/i),bg=(p[1]||'').match(/^([a-z]+)(?:_([a-z]+))?$/i);
  return{way:p[0]||'',bgc:bg?bg[1]:'',bgs:bg&&bg[2]||'',fgc:fg?fg[1]:'',fgs:fg?fg[2]:p[2]||'',text:p[3]||'',tc:p[4]||'black'}};
HP.osmcWords=(s,cc)=>{const o=HP.osmcParse(s),c=o.fgc||o.way||o.bgc;
  if(cc==='ch'||cc==='li'){if(/red:white:red_bar/.test(s))return'white-red-white marks';if(/blue:white:blue_bar/.test(s))return'white-blue-white marks';if(/yellow/.test(s)&&/diamond/.test(s))return'yellow signs';}
  if(o.fgs&&SHAPE[o.fgs])return`${c} ${SHAPE[o.fgs]}`;if(o.text)return`${o.way||c} signs "${o.text}"`;return c?`${c} marks`:'marks'};
HP.osmcSVG=(s,px=22)=>{const o=HP.osmcParse(s),C=k=>COL[k]||COL.gray,bg=o.bgc?C(o.bgc):'#ffffff',fg=C(o.fgc||o.way||'red'),S=24;let g='';
  const rect=(x,y,w,h,c)=>`<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${c}"/>`;
  // background: plain, a circle, a frame or a round field
  if(o.bgs==='circle')g+=rect(0,0,S,S,'#fff')+`<circle cx="12" cy="12" r="9" fill="none" stroke="${bg}" stroke-width="3"/>`;
  else if(o.bgs==='frame')g+=rect(0,0,S,S,'#fff')+`<rect x="2.5" y="2.5" width="19" height="19" fill="none" stroke="${bg}" stroke-width="3"/>`;
  else if(o.bgs==='round')g+=rect(0,0,S,S,'#fff')+`<circle cx="12" cy="12" r="11" fill="${bg}"/>`;
  else g+=rect(0,0,S,S,bg);
  const f=o.fgs;
  if(f==='bar')g+=rect(0,8,S,8,fg);else if(f==='stripe')g+=rect(8,0,8,S,fg);
  else if(f==='cross')g+=rect(9,3,6,18,fg)+rect(3,9,18,6,fg);else if(f==='x')g+=`<path d="M4 4L20 20M20 4L4 20" stroke="${fg}" stroke-width="4.5"/>`;
  else if(/^triangle/.test(f))g+=f==='triangle_turned'?`<path d="M3 5h18L12 20z" fill="${fg}"/>`:`<path d="M12 4l9 16H3z" fill="${fg}"/>`;
  else if(f==='dot')g+=`<circle cx="12" cy="12" r="6.5" fill="${fg}"/>`;else if(f==='circle')g+=`<circle cx="12" cy="12" r="7" fill="none" stroke="${fg}" stroke-width="3.5"/>`;
  else if(/^diamond/.test(f))g+=`<path d="M12 2l10 10-10 10L2 12z" fill="${fg}"/>`;
  else if(f==='lower')g+=rect(0,12,S,12,fg);else if(f==='upper')g+=rect(0,0,S,12,fg);else if(f==='corner')g+=`<path d="M0 0h24L0 24z" fill="${fg}"/>`;
  else if(/^(frame|rectangle)/.test(f))g+=f==='rectangle'?rect(6,6,12,12,fg):`<rect x="5" y="5" width="14" height="14" fill="none" stroke="${fg}" stroke-width="3"/>`;
  else if(f==='arch')g+=`<path d="M5 21V12a7 7 0 0 1 14 0v9" fill="none" stroke="${fg}" stroke-width="4"/>`;
  else if(f==='pointer')g+=`<path d="M4 5l16 7-16 7z" fill="${fg}"/>`;else if(f==='L')g+=`<path d="M7 3v15h11" fill="none" stroke="${fg}" stroke-width="4.5"/>`;
  else if(f==='turned_T')g+=`<path d="M12 4v16M4 19h16" fill="none" stroke="${fg}" stroke-width="4.5"/>`;else if(f==='fork')g+=`<path d="M12 21v-8M12 13L5 4M12 13l7-9" fill="none" stroke="${fg}" stroke-width="4"/>`;
  else if(f==='slash')g+=`<path d="M3 21L21 3" stroke="${fg}" stroke-width="5"/>`;else if(f==='backslash')g+=`<path d="M3 3l18 18" stroke="${fg}" stroke-width="5"/>`;
  else if(f&&f!=='')g+=`<circle cx="12" cy="12" r="6" fill="${fg}"/>`;
  if(o.text)g+=`<text x="12" y="16.5" text-anchor="middle" font-family="Barlow Semi Condensed,sans-serif" font-weight="700" font-size="${o.text.length>2?8:o.text.length>1?10:12}" fill="${C(o.tc)}">${String(o.text).replace(/[<&]/g,'')}</text>`;
  return`<svg class="wm" viewBox="0 0 24 24" width="${px}" height="${px}" role="img" aria-label="${HP.osmcWords(s)}">${g}<rect x=".5" y=".5" width="23" height="23" fill="none" stroke="rgba(0,0,0,.35)"/></svg>`};
// physical marks on the ground score above route numbers and labels
const symScore=(s,net)=>{const o=HP.osmcParse(s);let v=0;if(o.fgs&&SHAPE[o.fgs])v+=3;if(o.text)v-=2;if(/lwn|rwn/.test(net||''))v+=.5;return v};

/* ---------- matching the route to the mapped paths ---------- */
function analyse(D,els,closures){
  const R=D.route,m=R.lat.length,c=D.center,kx=Math.cos(c.lat*Math.PI/180)*111320,ky=110540,X=lon=>(lon-c.lon)*kx,Y=lat=>(lat-c.lat)*ky;
  const px=new Float64Array(m),py=new Float64Array(m);for(let i=0;i<m;i++){px[i]=X(R.lon[i]);py[i]=Y(R.lat[i])}
  const ways=[],rels=[],wid=new Map(),feats=[];
  for(const e of els){if(e.type==='way'&&e.tags&&e.tags.highway&&e.geometry&&!wid.has(e.id)){wid.set(e.id,ways.length);ways.push({e,t:e.tags,g:e.geometry.map(p=>[X(p.lon),Y(p.lat)]),rel:[]})}}
  for(const e of els){const t=e.tags||{};
    if(e.type==='relation'&&/^(hiking|foot|walking)$/.test(t.route||'')){const ri=rels.length;rels.push({name:t['name:en']||t.name||'',ref:t.ref||'',sym:t['osmc:symbol']||'',net:t.network||'',col:t.colour||''});
      for(const mb of e.members||[])if(mb.type==='way'&&wid.has(mb.ref)){const w=ways[wid.get(mb.ref)];if(!w.rel.includes(ri))w.rel.push(ri)}}
    else if(!(e.type==='way'&&t.highway))feats.push(e)}
  // each path's character
  const W=ways.map(w=>{const t=w.t,hw=t.highway,sac=SAC[t.sac_scale]||0,vis=VIS[t.trail_visibility]||0;
    const syms=[...new Set([t['osmc:symbol'],...w.rel.map(r=>rels[r].sym)].filter(Boolean))];let sym='',best=-9;
    for(const s of syms){const r=w.rel.find(q=>rels[q].sym===s),v=symScore(s,r!=null?rels[r].net:'');if(v>best){best=v;sym=s}}
    return{hw,sac,vis,sym,marked:!!(sym||w.rel.length),name:t['name:en']||t.name||'',road:ROAD.test(hw),inf:t.informal==='yes',acc:/^(no|private)$/.test(t.access||'')&&!/^(yes|designated|permissive)$/.test(t.foot||'')||/^(no|private)$/.test(t.foot||''),
      ford:/^(yes|stepping_stones)$/.test(t.ford||''),vf:hw==='via_ferrata'||!!t.via_ferrata_scale,aid:t.ladder==='yes'||/^(yes|chain|cable|rope)$/.test(t.safety_rope||'')||t.handrail==='chain'||/ladder|chain|cable/.test(t.climbing_aids||''),
      steps:hw==='steps',br:!!t.bridge&&t.bridge!=='no',rel:w.rel}});
  // a grid of path segments for the nearest-path search
  const CS=40,grid=new Map(),key=(a,b)=>a+','+b;
  ways.forEach((w,wi)=>{for(let k=0;k<w.g.length-1;k++){const[a,b]=w.g[k],[c2,d2]=w.g[k+1],x0=Math.floor((Math.min(a,c2)-30)/CS),x1=Math.floor((Math.max(a,c2)+30)/CS),y0=Math.floor((Math.min(b,d2)-30)/CS),y1=Math.floor((Math.max(b,d2)+30)/CS);
    for(let gx=x0;gx<=x1;gx++)for(let gy=y0;gy<=y1;gy++){const q=key(gx,gy);let L=grid.get(q);if(!L)grid.set(q,L=[]);L.push(wi,k)}}});
  const seg=(wi,k,x,y)=>{const g=ways[wi].g,[a,b]=g[k],[c2,d2]=g[k+1],dx=c2-a,dy=d2-b,L=dx*dx+dy*dy,t=L?Math.max(0,Math.min(1,((x-a)*dx+(y-b)*dy)/L)):0,qx=a+t*dx-x,qy=b+t*dy-y,len=Math.sqrt(L)||1;return{d:Math.hypot(qx,qy),ux:dx/len,uy:dy/len}};
  const way=new Int16Array(m).fill(-1),off=new Float32Array(m);let prev=-1;
  for(let i=0;i<m;i++){const a=Math.max(0,i-1),b=Math.min(m-1,i+1);let dx=px[b]-px[a],dy=py[b]-py[a];const l=Math.hypot(dx,dy)||1;dx/=l;dy/=l;
    const L=grid.get(key(Math.floor(px[i]/CS),Math.floor(py[i]/CS)));let bw=-1,bs=1e9,bd=1e9;
    if(L)for(let q=0;q<L.length;q+=2){const s=seg(L[q],L[q+1],px[i],py[i]);if(s.d>32)continue;const al=Math.abs(dx*s.ux+dy*s.uy),sc=s.d+16*(1-al)+(L[q]===prev?0:5)+(W[L[q]].road&&!W[L[q]].marked?3:0);if(sc<bs){bs=sc;bw=L[q];bd=s.d}}
    way[i]=bw;off[i]=bw<0?99:bd;if(bw>=0)prev=bw}
  // short gaps (a GPS wobble) take the path on either side; one-point flickers to another path are ignored
  for(let i=0;i<m;i++)if(way[i]<0){let j=i;while(j<m&&way[j]<0)j++;if(j-i<=3&&i>0&&j<m){for(let k=i;k<j;k++)way[k]=R.d[k]-R.d[i-1]<R.d[j]-R.d[k]?way[i-1]:way[j]}i=j}
  for(let i=1;i<m-1;i++)if(way[i]!==way[i-1]&&way[i-1]===way[i+1]&&way[i-1]>=0)way[i]=way[i-1];
  // runs of one property along the route, as km
  const runs=(f,minKm=0)=>{const out=[];let s=-1,v=null;for(let i=0;i<=m;i++){const x=i<m?f(i):null;if(x!==v){if(v!=null&&v!==false&&s>=0&&R.d[i-1]-R.d[s]>=minKm)out.push({i0:s,i1:i-1,v});s=i;v=x}}return out};
  const at=i=>way[i]>=0?W[way[i]]:null;
  // waymarks along the route
  const syms=[],symIx=s=>{let k=syms.indexOf(s);if(k<0){k=syms.length;syms.push(s)}return k};
  const marks=runs(i=>{const w=at(i);return w&&w.sym?symIx(w.sym):-1}).filter(r=>r.v>=0);
  // hazards beside the route
  const hz=[];
  const near=(fx,fy,r)=>{let best=-1,bd=r;for(let i=0;i<m;i++){const d=Math.hypot(px[i]-fx,py[i]-fy);if(d<bd){bd=d;best=i}}return best};
  const ring=g=>g.map(p=>[X(p.lon),Y(p.lat)]),inPoly=(x,y,P)=>{let c2=false;for(let a=0,b=P.length-1;a<P.length;b=a++){const[xa,ya]=P[a],[xb,yb]=P[b];if((ya>y)!==(yb>y)&&x<(xb-xa)*(y-ya)/(yb-ya)+xa)c2=!c2}return c2};
  const distSeg=(x,y,G)=>{let d=1e9;for(let k=0;k<G.length-1;k++){const[a,b]=G[k],[c2,d2]=G[k+1],dx=c2-a,dy=d2-b,L=dx*dx+dy*dy,t=L?Math.max(0,Math.min(1,((x-a)*dx+(y-b)*dy)/L)):0;d=Math.min(d,Math.hypot(a+t*dx-x,b+t*dy-y))}return d};
  const distSide=(x,y,G)=>{let d=1e9,sd=0;for(let k=0;k<G.length-1;k++){const[a,b]=G[k],[c2,d2]=G[k+1],dx=c2-a,dy=d2-b,L=dx*dx+dy*dy,t=L?Math.max(0,Math.min(1,((x-a)*dx+(y-b)*dy)/L)):0,e=Math.hypot(a+t*dx-x,b+t*dy-y);if(e<d){d=e;sd=dx*(y-b)-dy*(x-a)}}return[d,sd]};
  for(const f of feats){const t=f.tags||{};
    // a cliff is drawn with its top on the left: a route on the left runs along the edge (a fall), on the right along the foot (falling rocks)
    if(t.natural==='cliff'&&f.geometry){const G=ring(f.geometry),side=new Int8Array(m);for(let i=0;i<m;i++){const[d,sd]=distSide(px[i],py[i],G);if(d<18)side[i]=sd>0?1:-1}
      for(const r of runs(i=>side[i]||null))hz.push({k:'cliff',i0:r.i0,i1:r.i1,top:r.v>0})}
    else if(t.natural==='glacier'){const polys=[];if(f.geometry)polys.push(ring(f.geometry));for(const mb of f.members||[])if(mb.role!=='inner'&&mb.geometry)polys.push(ring(mb.geometry));
      const ins=i=>polys.some(P=>P.length>3&&inPoly(px[i],py[i],P));for(const r of runs(ins,.05))hz.push({k:'glacier',i0:r.i0,i1:r.i1,name:t.name||''})}
    else if(t.hazard&&(f.lat!=null||f.geometry||f.center)){const g=f.lat!=null?[{lat:f.lat,lon:f.lon}]:f.geometry||[f.center];let bi=-1,bd=60;for(const p of g){const i=near(X(p.lon),Y(p.lat),bd);if(i>=0){bi=i;bd=Math.hypot(px[i]-X(p.lon),py[i]-Y(p.lat))}}
      if(bi>=0)hz.push({k:'hazard',i0:bi,i1:bi,what:String(t.hazard).replace(/_/g,' '),name:t.name||t.description||''})}
    else if(t.ford&&f.lat!=null){const i=near(X(f.lon),Y(f.lat),25);if(i>=0)hz.push({k:'ford',i0:i,i1:i})}}
  for(const[k,f]of[['vf',w=>w.vf],['aid',w=>w.aid],['ford',w=>w.ford],['inf',w=>w.inf],['acc',w=>w.acc]])for(const r of runs(i=>{const w=at(i);return!!(w&&f(w))}))hz.push({k,i0:r.i0,i1:r.i1});
  for(const r of runs(i=>way[i]<0,.06))hz.push({k:'off',i0:r.i0,i1:r.i1});
  for(const r of runs(i=>{const w=at(i);return w&&w.vis>=3?w.vis:false}))if(R.d[r.i1]-R.d[r.i0]>=.05)hz.push({k:'vis',i0:r.i0,i1:r.i1,v:r.v});
  for(const cl of closures||[]){const a=cl.a,G=[];const add=co=>{if(typeof co[0]==='number')G.push([X(co[0]),Y(co[1])]);else co.forEach(add)};add(cl.g.coordinates||[]);if(!G.length)continue;
    let bi=-1,bd=80;for(let i=0;i<m;i++){const d=G.length>1?distSeg(px[i],py[i],G):Math.hypot(px[i]-G[0][0],py[i]-G[0][1]);if(d<bd){bd=d;bi=i}}
    if(bi>=0)hz.push({k:'closed',i0:bi,i1:bi,type:a.sperrungen_type||'',title:a.title_en||a.title_de||'',reason:a.reason_en||a.reason_de||'',until:a.duration_en||a.duration_de||'',text:(a.abstract_en||a.abstract_de||'').slice(0,400)})}
  // junctions: points on the route where other paths meet it, and which way to go
  const nodes=new Map();ways.forEach((w,wi)=>(w.e.nodes||[]).forEach((id,k)=>{let L=nodes.get(id);if(!L)nodes.set(id,L=[]);L.push(wi,k)}));
  const rgrid=new Map();for(let i=0;i<m;i++){const q=key(Math.floor(px[i]/CS),Math.floor(py[i]/CS));let L=rgrid.get(q);if(!L)rgrid.set(q,L=[]);L.push(i)}
  const nearR=(x,y,r)=>{let bi=-1,bd=r;const gx=Math.floor(x/CS),gy=Math.floor(y/CS);for(let a=-1;a<=1;a++)for(let b=-1;b<=1;b++)for(const i of rgrid.get(key(gx+a,gy+b))||[]){const d=Math.hypot(px[i]-x,py[i]-y);if(d<bd){bd=d;bi=i}}return bi};
  const bear=(dx,dy)=>Math.atan2(dx,dy)*180/Math.PI,dAng=(a,b)=>((b-a+540)%360)-180;
  const along=(wi,k,dir,x,y)=>{const g=ways[wi].g;let j=k;while(j+dir>=0&&j+dir<g.length){j+=dir;if(Math.hypot(g[j][0]-x,g[j][1]-y)>=22)break}return j===k?null:bear(g[j][0]-x,g[j][1]-y)};
  const guide=feats.filter(f=>f.tags&&f.tags.information==='guidepost'&&f.lat!=null).map(f=>({x:X(f.lon),y:Y(f.lat),name:f.tags.name||'',ele:f.tags.ele||''}));
  const junc=[];
  for(const[id,L]of nodes){if(L.length<4)continue;   // a node shared by two or more paths
    const[x,y]=ways[L[0]].g[L[1]];
    const i=nearR(x,y,14);if(i<0||i<2||i>m-3)continue;
    // the route's own ways must pass through this node
    const onRoute=new Set([way[Math.max(0,i-2)],way[i],way[Math.min(m-1,i+2)]]);let mine=false;for(let q=0;q<L.length;q+=2)if(onRoute.has(L[q]))mine=true;if(!mine)continue;
    const br=[];for(let q=0;q<L.length;q+=2){const wi=L[q],k=L[q+1];for(const dir of[-1,1]){const b=along(wi,k,dir,x,y);if(b!=null)br.push({b,wi})}}
    if(br.length<3)continue;
    const a0=Math.max(0,i-3),a1=Math.min(m-1,i+3),inB=bear(px[i]-px[a0],py[i]-py[a0]),outB=bear(px[a1]-px[i],py[a1]-py[i]);
    let back=0,bb=1e9,go=0,bg=1e9;br.forEach((r,k)=>{const d=Math.abs(dAng(inB+180,r.b));if(d<bb){bb=d;back=k}});br.forEach((r,k)=>{if(k===back)return;const d=Math.abs(dAng(outB,r.b));if(d<bg){bg=d;go=k}});
    const others=br.filter((r,k)=>k!==back&&k!==go);if(!others.length)continue;
    const turn=dAng(inB,br[go].b),side=turn<0?'L':'R',abs=Math.abs(turn);
    const fork=others.some(r=>Math.abs(dAng(br[go].b,r.b))<40),straighter=others.some(r=>Math.abs(dAng(inB,r.b))+12<abs);
    let code=abs<22?'S':abs<55?'S'+side:abs<140?side:'H'+side;if(fork&&abs<55)code='K'+(others.some(r=>dAng(br[go].b,r.b)>0)?'L':'R');
    let gp=null,gd=45;for(const g of guide){const d=Math.hypot(g.x-x,g.y-y);if(d<gd){gd=d;gp=g}}
    const w=W[br[go].wi];junc.push({i,id,c:code,n:others.length,sym:w.sym?symIx(w.sym):-1,hw:w.hw,town:w.road&&others.every(r=>W[r.wi].road),key:straighter||abs>=55||fork,gp:gp?(gp.name||'').slice(0,60):'',ele:gp?gp.ele:''})}
  junc.sort((a,b)=>a.i-b.i);const J=[];for(const j of junc){const l=J[J.length-1];if(l&&R.d[j.i]-R.d[l.i]<.025){if(j.key&&!l.key)J[J.length-1]=j;continue}J.push(j)}
  // roads the route uses or crosses: places a car or a rescue team can reach
  const road=runs(i=>{const w=at(i);return!!(w&&w.road&&!w.acc&&/^(primary|secondary|tertiary|unclassified|residential|living_street|service|trunk)/.test(w.hw))}).map(r=>[r.i0,r.i1]);
  // compact per-point arrays: the path index, which keeps the path's character in a short list
  const used=[...new Set(way)].filter(x=>x>=0),remap=new Map(used.map((w,k)=>[w,k]));
  const P=used.map(wi=>{const w=W[wi];return{hw:w.hw,sac:w.sac,vis:w.vis,sym:w.sym?symIx(w.sym):-1,mk:w.marked?1:0,name:w.name.slice(0,60),inf:w.inf?1:0,acc:w.acc?1:0,rel:w.rel.slice(0,4)}});
  const relUsed=[...new Set(P.flatMap(p=>p.rel))],rmap=new Map(relUsed.map((r,k)=>[r,k]));P.forEach(p=>p.rel=p.rel.map(r=>rmap.get(r)));
  const pw=new Int16Array(m);for(let i=0;i<m;i++)pw[i]=way[i]>=0?remap.get(way[i]):-1;
  return{v:HP.TRAIL_V,at:Date.now(),n:m,src:'osm',pw,paths:P,rels:relUsed.map(r=>rels[r]),syms,marks:marks.map(r=>[r.i0,r.i1,r.v]),hz,junc:J,road}}

/* ---------- the check itself ---------- */
HP.trailCheck=async function(D,signal){const R=D.route,m=R.lat.length;let la0=90,la1=-90,lo0=180,lo1=-180;for(let i=0;i<m;i++){la0=Math.min(la0,R.lat[i]);la1=Math.max(la1,R.lat[i]);lo0=Math.min(lo0,R.lon[i]);lo1=Math.max(lo1,R.lon[i])}
  const b={s:la0,n:la1,w:lo0,e:lo1};
  // the countries at the start and the end, one after the other (Nominatim asks for one request a second); the end only when it is far from the start
  const countries=async()=>{const a=await country(R.lat[0],R.lon[0]);if(HP.geo.hav(R.lat[0],R.lon[0],R.lat[m-1],R.lon[m-1])<20000)return[a,a];await new Promise(r=>setTimeout(r,1100));return[a,await country(R.lat[m-1],R.lon[m-1])]};
  const [els,cl,[cc0,cc1]]=await Promise.all([overpass(HP.trailQuery(R),signal),closuresCH(b).catch(()=>null),countries()]);
  const T=analyse(D,els,cl||[]);T.cc=[...new Set([cc0,cc1].filter(Boolean))];T.closuresOk=cl!=null||!inCH(b);return T};
HP.trailAnalyse=analyse;   // for tests
})();
