(() => {
'use strict';
const D = window.OQ_DATA;
const PLACES = D.places, CATS = D.cats, ROUTES = D.routes, MISSIONS = D.missions, LEVELS = D.levels;
const STATE_KEY='oq_v4_state', OLD_VISITS='olomouc_visits_v2', OLD_NICK='olomouc_nickname', DEVICE_KEY='oq_v4_device';
const FIREBASE_CONFIG={apiKey:'AIzaSyCOMtm6UGqMfnqUu8aIdNF3aULcLBlTgBk',authDomain:'olomouc-2026-dca3c.firebaseapp.com',projectId:'olomouc-2026-dca3c',storageBucket:'olomouc-2026-dca3c.firebasestorage.app',messagingSenderId:'87040929426',appId:'1:87040929426:web:0315a17940ac88efaa804b'};
const FAMILY_LABELS={all:'Todo',useful:'Útil',food:'Comer',night:'Noche',culture:'Cultura',nature:'Naturaleza',free:'Gratis',unvisited:'Pendientes'};
const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const byId=id=>document.getElementById(id);
const placeById=id=>PLACES.find(p=>p.id===id);
const placeByName=name=>PLACES.find(p=>p.name===name);
const esc=v=>String(v??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
const fmtDate=(iso,opts={day:'numeric',month:'short'})=>new Intl.DateTimeFormat('es-ES',opts).format(new Date(iso));
const fmtDateTime=iso=>new Intl.DateTimeFormat('es-ES',{dateStyle:'medium',timeStyle:'short'}).format(new Date(iso));
const uid=()=>crypto.randomUUID?crypto.randomUUID():'id-'+Date.now()+'-'+Math.random().toString(36).slice(2);
function getDeviceId(){let id=localStorage.getItem(DEVICE_KEY);if(!id){id=uid();localStorage.setItem(DEVICE_KEY,id)}return id}
function defaultState(){return{nickname:'',visited:{},groupCode:'',personalEvents:[],localGroup:null,votes:{},comments:{},statusReports:{},mapScope:'city',mapFilter:'all',agendaFilter:'all'}}
function loadState(){
  let s=defaultState();
  try{const raw=localStorage.getItem(STATE_KEY);if(raw)s={...s,...JSON.parse(raw)};
    if(!Object.keys(s.visited||{}).length){const old=JSON.parse(localStorage.getItem(OLD_VISITS)||'{}');s.visited=old||{}}
    if(!s.nickname)s.nickname=localStorage.getItem(OLD_NICK)||'';
  }catch(e){console.warn(e)}
  return s;
}
let state=loadState();
function saveState(){localStorage.setItem(STATE_KEY,JSON.stringify(state))}
function toast(msg){const el=byId('toast');el.textContent=msg;el.classList.add('show');clearTimeout(toast.t);toast.t=setTimeout(()=>el.classList.remove('show'),3200)}
function haversine(a,b){const R=6371000,r=x=>x*Math.PI/180,dLat=r(b.lat-a.lat),dLng=r(b.lng-a.lng);const q=Math.sin(dLat/2)**2+Math.cos(r(a.lat))*Math.cos(r(b.lat))*Math.sin(dLng/2)**2;return 2*R*Math.asin(Math.sqrt(q))}
function pointsFor(p){return p.points??CATS[p.cat].points}
function visitedEntry(p){return state.visited[p.id]}
function isVisited(p){return !!visitedEntry(p)}
function isVerified(p){return !!visitedEntry(p)?.verified}
function currentPoints(verifiedOnly=false){return PLACES.reduce((sum,p)=>{const e=visitedEntry(p);return e&&(!verifiedOnly||e.verified)?sum+pointsFor(p):sum},0)}
function currentLevel(){const pts=currentPoints();let level=LEVELS[0];LEVELS.forEach(l=>{if(pts>=l.min)level=l});const i=LEVELS.indexOf(level),next=LEVELS[i+1];return{...level,next,pts,pct:next?Math.min(100,Math.round((pts-level.min)/(next.min-level.min)*100)):100}}
function missionPlaces(m){return PLACES.filter(p=>(m.placeNames&&m.placeNames.includes(p.name))||(m.categories&&m.categories.includes(p.cat))||(m.scopes&&m.scopes.includes(p.scope)))}
function missionProgress(m){const all=missionPlaces(m),done=all.filter(isVisited),target=Math.min(m.target||all.length,all.length);return{done:Math.min(done.length,target),target,complete:done.length>=target,pct:target?Math.round(Math.min(done.length,target)/target*100):0}}

let db=null,firebaseReady=false;
try{if(window.firebase){firebase.initializeApp(FIREBASE_CONFIG);db=firebase.firestore();firebaseReady=true}}catch(e){console.warn('Firebase:',e)}
async function syncPlayer(){
  if(!firebaseReady||!state.nickname)return;
  const data={name:state.nickname,points:currentPoints(true),visitedCount:PLACES.filter(p=>isVerified(p)).length,level:currentLevel().level,updatedAt:firebase.firestore.FieldValue.serverTimestamp()};
  try{
    await db.collection('rankings').doc('v4-erasmus-2026-27').collection('players').doc(getDeviceId()).set(data,{merge:true});
    const now=new Date(),month=`v4-month-${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
    const monthPoints=PLACES.reduce((s,p)=>{const e=visitedEntry(p);if(!e?.verified||!e.visitedAt)return s;const d=new Date(e.visitedAt);return d.getFullYear()===now.getFullYear()&&d.getMonth()===now.getMonth()?s+pointsFor(p):s},0);
    await db.collection('rankings').doc(month).collection('players').doc(getDeviceId()).set({...data,points:monthPoints},{merge:true});
    if(state.groupCode)await db.collection('groups').doc(state.groupCode).collection('members').doc(getDeviceId()).set(data,{merge:true});
  }catch(e){console.warn('Sync failed',e)}
}
async function fetchRanking(kind='erasmus'){
  if(!firebaseReady)return[];
  try{
    let ref;
    if(kind==='group'&&state.groupCode)ref=db.collection('groups').doc(state.groupCode).collection('members');
    else if(kind==='monthly'){const n=new Date();ref=db.collection('rankings').doc(`v4-month-${n.getFullYear()}-${String(n.getMonth()+1).padStart(2,'0')}`).collection('players')}
    else ref=db.collection('rankings').doc('v4-erasmus-2026-27').collection('players');
    const snap=await ref.orderBy('points','desc').limit(50).get();return snap.docs.map(x=>({id:x.id,...x.data()}));
  }catch(e){console.warn(e);return[]}
}

function setView(name){
  $$('.view').forEach(v=>v.classList.toggle('active',v.id===`view-${name}`));
  $$('.bottom-nav button').forEach(b=>b.classList.toggle('active',b.dataset.view===name));
  window.scrollTo({top:0,behavior:'instant'});
  if(name==='map'){initMap();setTimeout(()=>map?.invalidateSize(),120)}
  if(name==='profile')renderProfile();
  if(name==='agenda')renderAgenda();
  if(name==='routes')renderRoutes();
}
$$('[data-view]').forEach(b=>b.addEventListener('click',()=>setView(b.dataset.view)));

function updateNetwork(){const on=navigator.onLine,el=byId('networkBadge');el.textContent=on?'En línea':'Sin conexión';el.classList.toggle('offline',!on);el.classList.toggle('online',on)}
window.addEventListener('online',()=>{updateNetwork();toast('Conexión recuperada');syncPlayer()});window.addEventListener('offline',()=>{updateNetwork();toast('Modo sin conexión activo')});updateNetwork();
let deferredPrompt=null;window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();deferredPrompt=e;byId('installBtn').classList.remove('hidden')});
byId('installBtn').addEventListener('click',async()=>{if(!deferredPrompt)return openOffline();deferredPrompt.prompt();await deferredPrompt.userChoice;deferredPrompt=null;byId('installBtn').classList.add('hidden')});
if('serviceWorker'in navigator)window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js').catch(console.warn));

function renderLevel(){const l=currentLevel();byId('levelNumber').textContent=l.level;byId('levelName').textContent=l.name;byId('levelProgress').style.width=l.pct+'%';byId('levelText').textContent=l.next?`${l.pts} pts · faltan ${l.next.min-l.pts} para ${l.next.name}`:`${l.pts} pts · nivel máximo`}
function renderHome(){renderLevel();const upcoming=combinedEvents().filter(e=>new Date(e.end||e.start)>=new Date()).sort((a,b)=>new Date(a.start)-new Date(b.start)).slice(0,3);byId('homeEvents').innerHTML=upcoming.length?upcoming.map(eventMiniHtml).join(''):'<div class="empty-state"><span>□</span>No hay próximos planes.</div>';byId('homeRoutes').innerHTML=ROUTES.slice(0,5).map(routePreviewHtml).join('')}
function eventMiniHtml(e){const d=new Date(e.start);return`<article class="event-mini"><div class="date-box"><strong>${d.getDate()}</strong><small>${fmtDate(e.start,{month:'short'})}</small></div><div><h3>${esc(e.title)}</h3><p>${esc(e.location||'Sin ubicación')} · ${e.type==='official'?'Oficial':e.type==='group'?'Grupo':'Personal'}</p></div><button data-action="event-detail" data-event-id="${esc(e.id)}">›</button></article>`}
function routePreviewHtml(r){return`<article class="route-preview"><div class="route-icon">${r.icon}</div><h3>${esc(r.name)}</h3><p>${esc(r.description)}</p><div class="meta-line"><span class="meta-pill">${esc(r.duration)}</span><span class="meta-pill">${esc(r.budget)}</span></div><button class="text-button" data-action="route-detail" data-route-id="${r.id}">Abrir ruta →</button></article>`}

let map=null,markersLayer=null,userMarker=null,markerMap=new Map(),lastLocation=null;
function initMap(){
  if(map)return;
  map=L.map('map',{center:[49.594,17.252],zoom:13,zoomControl:false});
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'&copy; OpenStreetMap contributors'}).addTo(map);
  L.control.zoom({position:'bottomright'}).addTo(map);
  markersLayer=window.L.markerClusterGroup?L.markerClusterGroup({showCoverageOnHover:false,maxClusterRadius:45}):L.layerGroup();markersLayer.addTo(map);
  renderMapFilters();renderMapMarkers();
}
function markerIcon(p){const c=CATS[p.cat];return L.divIcon({className:'',html:`<div class="custom-pin ${isVisited(p)?'visited':''}" style="background:${c.color}"><span>${c.icon}</span></div>`,iconSize:[35,35],iconAnchor:[17,34]})}
function mapFilteredPlaces(){const q=(byId('placeSearch')?.value||'').trim().toLowerCase(),scope=state.mapScope,filter=state.mapFilter;let list=PLACES.filter(p=>p.scope===scope);if(q)list=list.filter(p=>[p.name,p.addr,p.note,CATS[p.cat].label,...(p.tags||[])].join(' ').toLowerCase().includes(q));if(filter==='free')list=list.filter(p=>p.budgetMin===0);else if(filter==='unvisited')list=list.filter(p=>!isVisited(p));else if(filter!=='all')list=list.filter(p=>CATS[p.cat].family===filter);if(lastLocation)list.sort((a,b)=>haversine(lastLocation,a)-haversine(lastLocation,b));return list}
function renderMapFilters(){const available=['all','useful','food','night','culture','nature','free','unvisited'];byId('mapFilters').innerHTML=available.map(f=>`<button class="filter-chip ${state.mapFilter===f?'active':''}" data-map-filter="${f}">${FAMILY_LABELS[f]}</button>`).join('')}
function renderMapMarkers(){if(!map)return;markersLayer.clearLayers();markerMap.clear();const list=mapFilteredPlaces();list.forEach(p=>{const m=L.marker([p.lat,p.lng],{icon:markerIcon(p),title:p.name});m.on('click',()=>openPlace(p));markersLayer.addLayer(m);markerMap.set(p.id,m)});byId('mapCount').textContent=list.length;if(list.length&&state.mapScope==='trip'&&!lastLocation){const g=L.featureGroup(list.map(p=>L.marker([p.lat,p.lng])));map.fitBounds(g.getBounds(),{padding:[35,35],maxZoom:9})}}
byId('placeSearch').addEventListener('input',renderMapMarkers);byId('mapFilters').addEventListener('click',e=>{const b=e.target.closest('[data-map-filter]');if(!b)return;state.mapFilter=b.dataset.mapFilter;saveState();renderMapFilters();renderMapMarkers()});
$$('.scope-tab').forEach(b=>b.addEventListener('click',()=>{state.mapScope=b.dataset.scope;state.mapFilter='all';saveState();$$('.scope-tab').forEach(x=>x.classList.toggle('active',x===b));renderMapFilters();renderMapMarkers();if(state.mapScope==='city')map.flyTo([49.594,17.252],13)}));
async function locateUser(openList=false){
  if(!navigator.geolocation)return toast('El navegador no permite ubicación.');toast('Buscando tu posición…');
  navigator.geolocation.getCurrentPosition(pos=>{lastLocation={lat:pos.coords.latitude,lng:pos.coords.longitude};initMap();if(userMarker)map.removeLayer(userMarker);userMarker=L.marker([lastLocation.lat,lastLocation.lng],{icon:L.divIcon({className:'',html:'<div class="user-location"></div>',iconSize:[18,18]})}).addTo(map);map.flyTo([lastLocation.lat,lastLocation.lng],14);renderMapMarkers();toast('Lugares ordenados por distancia.');if(openList)openPlaceList()},()=>toast('No se pudo obtener tu ubicación.'),{enableHighAccuracy:true,timeout:12000,maximumAge:20000})
}
byId('nearMeBtn').addEventListener('click',()=>locateUser(false));byId('nearMeHome').addEventListener('click',()=>{setView('map');setTimeout(()=>locateUser(true),150)});byId('openPlaceList').addEventListener('click',openPlaceList);
function openPlaceList(){const list=mapFilteredPlaces();openSheet(`<h2>${state.mapScope==='city'?'Olomouc':'Escapadas'}</h2><p>${lastLocation?'Ordenado por cercanía.':'Activa “Cerca de mí” para ordenar por distancia.'}</p><div class="stack-list">${list.map(p=>`<button class="list-row" data-action="place-detail" data-place-id="${p.id}" style="width:100%;display:grid;grid-template-columns:38px 1fr auto;align-items:center;text-align:left;padding:11px;border:0"><span style="font-size:21px">${CATS[p.cat].icon}</span><span><strong style="display:block">${esc(p.name)}</strong><small style="color:var(--muted)">${lastLocation?formatDistance(haversine(lastLocation,p))+' · ':''}${esc(p.budgetLabel)}</small></span><b>+${pointsFor(p)}</b></button>`).join('')}</div>`)}
function formatDistance(m){return m<1000?`${Math.round(m/10)*10} m`:`${(m/1000).toFixed(1)} km`}

function statusCommunityHtml(stats){if(!stats)return'';const total=stats.open+stats.closed+stats.outdated;if(!total)return'<span>Sin informes recientes</span>';return`<span>${stats.open} abierto · ${stats.closed} cerrado · ${stats.outdated} horario dudoso</span>`}
async function openPlace(p){
  currentPlaceId=p.id;const c=CATS[p.cat],e=visitedEntry(p),dist=lastLocation?formatDistance(haversine(lastLocation,p)):null;
  openSheet(`<div class="place-hero"><span class="place-category" style="background:${c.color}">${c.icon} ${esc(c.label)} · +${pointsFor(p)} pts</span><h2 class="place-title">${esc(p.name)}</h2><div class="place-address">${esc(p.addr)}</div></div>
  <div class="place-meta-grid"><div class="place-meta"><small>Presupuesto</small><strong>${esc(p.budgetLabel)}</strong></div><div class="place-meta"><small>Distancia</small><strong>${dist||'Activa Cerca de mí'}</strong></div><div class="place-meta"><small>Estado</small><strong><i class="status-dot ${p.statusType==='always'||p.statusType==='essential'?'good':''}"></i>${esc(p.statusText)}</strong></div><div class="place-meta"><small>Horario</small><strong>${esc(p.hours||'Consultar')}</strong></div></div>
  <p>${esc(p.note)}</p><div class="tag-row">${(p.tags||[]).slice(0,8).map(t=>`<span class="tag">${esc(t)}</span>`).join('')}</div>
  <div class="sheet-actions"><button class="primary-button" data-action="visit" data-place-id="${p.id}">${e?(e.verified?'✓ Verificado':'✓ Visitado'):'Estoy aquí'}</button><button class="secondary-button" data-action="directions" data-place-id="${p.id}">Cómo llegar</button></div>
  <div class="sheet-actions"><button class="secondary-button" data-action="photo" data-place-id="${p.id}" ${e?'':'disabled'}>📷 Foto</button><button class="secondary-button" data-action="share-place" data-place-id="${p.id}">Compartir</button></div>
  ${p.officialUrl?`<button class="text-button" data-action="official" data-url="${esc(p.officialUrl)}">Información oficial →</button>`:''}
  <section class="content-section"><div class="section-heading"><div><span class="section-kicker">Votación rápida</span><h3>¿Cómo es para Erasmus?</h3></div></div><div id="placeVotes" class="vote-row"><button class="vote-button" data-vote="worth">👍 Merece la pena</button><button class="vote-button" data-vote="cheap">💸 Buen precio</button><button class="vote-button" data-vote="group">👥 Buen grupo</button></div><small id="voteStats">Cargando votos…</small></section>
  <section class="content-section"><div class="section-heading"><div><span class="section-kicker">Estado comunitario</span><h3>¿Está correcto?</h3></div></div><div class="vote-row"><button class="vote-button" data-status-report="open">✅ Abierto</button><button class="vote-button" data-status-report="closed">⛔ Cerrado</button><button class="vote-button" data-status-report="outdated">🕒 Horario dudoso</button></div><small id="statusStats">Cargando informes…</small></section>
  <section class="content-section"><div class="section-heading"><div><span class="section-kicker">Consejos breves</span><h3>Comentarios Erasmus</h3></div></div><div id="placeComments" class="comment-list"><div class="loading-lines">Cargando…</div></div><div class="form-grid" style="margin-top:10px"><label class="field-label">Añadir consejo<textarea id="commentText" maxlength="180" placeholder="Ej.: reserva, lleva efectivo, mejor los jueves…"></textarea></label><button class="primary-button" data-action="comment" data-place-id="${p.id}">Publicar comentario</button></div></section>`);
  loadFeedback(p.id);
}
let currentPlaceId=null;
function attemptVisit(p){
  const existing=visitedEntry(p);if(existing){openModal(`<h2>Visita guardada</h2><p>${existing.verified?'Esta visita está verificada.':'Esta visita cuenta en tu progreso personal, pero no en el ranking verificado.'}</p><div class="modal-actions"><button class="secondary-button" data-action="remove-visit" data-place-id="${p.id}">Eliminar visita</button><button class="primary-button" data-action="photo" data-place-id="${p.id}">Añadir foto</button></div>`);return}
  if(!navigator.geolocation)return offerUnverified(p,'Este dispositivo no permite comprobar la ubicación.');toast('Comprobando ubicación…');navigator.geolocation.getCurrentPosition(pos=>{const d=haversine({lat:pos.coords.latitude,lng:pos.coords.longitude},p),allowed=p.radius+Math.min(pos.coords.accuracy||0,120);if(d<=allowed){state.visited[p.id]={visitedAt:new Date().toISOString(),verified:true,distance:Math.round(d)};saveState();syncPlayer();renderAll();closeSheet();toast(`Visita verificada · +${pointsFor(p)} puntos`);setTimeout(()=>askPhoto(p),400)}else offerUnverified(p,`Estás a ${formatDistance(d)}. Para verificarla debes estar a unos ${p.radius} m.`)},err=>offerUnverified(p,err.code===1?'Has denegado la ubicación.':'No se obtuvo una ubicación fiable.'),{enableHighAccuracy:true,timeout:12000,maximumAge:10000})
}
function offerUnverified(p,reason){openModal(`<h2>No se pudo verificar</h2><p>${esc(reason)}</p><p>Puede guardarse para tu colección personal, pero no contará en el ranking competitivo.</p><div class="modal-actions"><button class="secondary-button" data-action="cancel-modal">Cancelar</button><button class="primary-button" data-action="save-unverified" data-place-id="${p.id}">Guardar visita</button></div>`)}
function askPhoto(p){openModal(`<h2>¿Guardar un recuerdo?</h2><p>Añade una foto de la visita. Se comprime y se guarda en este dispositivo para que la app siga siendo rápida.</p><div class="modal-actions"><button class="secondary-button" data-action="cancel-modal">Ahora no</button><button class="primary-button" data-action="photo" data-place-id="${p.id}">Hacer foto</button></div>`)}

// IndexedDB photos
let photoDBPromise=null;function photoDB(){if(photoDBPromise)return photoDBPromise;photoDBPromise=new Promise((resolve,reject)=>{const r=indexedDB.open('oq-v4-photos',1);r.onupgradeneeded=()=>r.result.createObjectStore('photos',{keyPath:'id'});r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)});return photoDBPromise}
async function storePhoto(rec){const dbi=await photoDB();return new Promise((res,rej)=>{const tx=dbi.transaction('photos','readwrite');tx.objectStore('photos').put(rec);tx.oncomplete=res;tx.onerror=()=>rej(tx.error)})}
async function allPhotos(){try{const dbi=await photoDB();return await new Promise((res,rej)=>{const r=dbi.transaction('photos').objectStore('photos').getAll();r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)})}catch{return[]}}
let photoTarget=null;byId('photoInput').addEventListener('change',async e=>{const f=e.target.files[0];if(!f||!photoTarget)return;toast('Procesando foto…');const data=await compressImage(f);await storePhoto({id:uid(),placeId:photoTarget,createdAt:new Date().toISOString(),data});e.target.value='';photoTarget=null;closeModal();toast('Foto guardada.');renderProfile()});
function compressImage(file){return new Promise((resolve,reject)=>{const img=new Image(),url=URL.createObjectURL(file);img.onload=()=>{const max=1280,scale=Math.min(1,max/Math.max(img.width,img.height)),c=document.createElement('canvas');c.width=Math.round(img.width*scale);c.height=Math.round(img.height*scale);c.getContext('2d').drawImage(img,0,0,c.width,c.height);URL.revokeObjectURL(url);resolve(c.toDataURL('image/jpeg',.76))};img.onerror=reject;img.src=url})}

async function loadFeedback(placeId){
  const localV=state.votes[placeId]||{},localStatus=state.statusReports[placeId]||'';$$('[data-vote]').forEach(b=>b.classList.toggle('active',!!localV[b.dataset.vote]));$$('[data-status-report]').forEach(b=>b.classList.toggle('active',localStatus===b.dataset.statusReport));
  let comments=(state.comments[placeId]||[]).slice(-8),voteStats={worth:0,cheap:0,group:0},statusStats={open:0,closed:0,outdated:0};
  if(firebaseReady&&navigator.onLine){try{const root=db.collection('place_feedback').doc(placeId);const [cs,vs]=await Promise.all([root.collection('comments').orderBy('createdAt','desc').limit(20).get(),root.collection('votes').limit(250).get()]);comments=cs.docs.map(d=>d.data());vs.docs.forEach(d=>{const x=d.data();['worth','cheap','group'].forEach(k=>{if(x[k])voteStats[k]++});if(statusStats[x.status]!==undefined)statusStats[x.status]++})}catch(e){console.warn(e)}}
  const c=byId('placeComments');if(c)c.innerHTML=comments.length?comments.map(x=>`<div class="comment"><strong>${esc(x.name||'Erasmus')}</strong>${esc(x.text)}</div>`).join(''):'<div class="empty-state">Todavía no hay consejos.</div>';
  const v=byId('voteStats');if(v)v.textContent=`${voteStats.worth} lo recomiendan · ${voteStats.cheap} buen precio · ${voteStats.group} ideal para grupo`;
  const s=byId('statusStats');if(s)s.innerHTML=statusCommunityHtml(statusStats);
}
async function toggleVote(placeId,key){state.votes[placeId]=state.votes[placeId]||{};state.votes[placeId][key]=!state.votes[placeId][key];saveState();if(firebaseReady){try{await db.collection('place_feedback').doc(placeId).collection('votes').doc(getDeviceId()).set({...state.votes[placeId],status:state.statusReports[placeId]||null,updatedAt:firebase.firestore.FieldValue.serverTimestamp()},{merge:true})}catch(e){console.warn(e)}}loadFeedback(placeId)}
async function setStatusReport(placeId,status){state.statusReports[placeId]=status;saveState();if(firebaseReady){try{await db.collection('place_feedback').doc(placeId).collection('votes').doc(getDeviceId()).set({...state.votes[placeId],status,updatedAt:firebase.firestore.FieldValue.serverTimestamp()},{merge:true})}catch(e){console.warn(e)}}loadFeedback(placeId);toast('Estado registrado.')}
async function addComment(placeId){const input=byId('commentText'),text=input?.value.trim();if(!text)return toast('Escribe un comentario.');const rec={id:uid(),name:state.nickname||'Erasmus',text,createdAt:new Date().toISOString()};state.comments[placeId]=[...(state.comments[placeId]||[]),rec].slice(-30);saveState();input.value='';if(firebaseReady){try{await db.collection('place_feedback').doc(placeId).collection('comments').doc(rec.id).set({...rec,createdAt:firebase.firestore.FieldValue.serverTimestamp()})}catch(e){console.warn(e)}}loadFeedback(placeId);toast('Comentario publicado.')}

function renderRoutes(filter='all'){const list=filter==='all'?ROUTES:ROUTES.filter(r=>r.type===filter);byId('routesList').innerHTML=list.map(r=>`<article class="route-card"><div class="route-card-head"><div><span class="eyebrow" style="color:var(--terracotta)">${esc(r.type)}</span><h2>${r.icon} ${esc(r.name)}</h2></div><span class="meta-pill">${esc(r.difficulty)}</span></div><p>${esc(r.description)}</p><div class="meta-line"><span class="meta-pill">⏱ ${esc(r.duration)}</span><span class="meta-pill">💰 ${esc(r.budget)}</span><span class="meta-pill">🚋 ${esc(r.transport)}</span></div><div class="route-stops">${r.placeNames.slice(0,5).map((n,i)=>`${i?'<i></i>':''}<span>${CATS[placeByName(n)?.cat]?.icon||'•'}</span>`).join('')}</div><div class="route-actions"><button class="primary-button" data-action="route-detail" data-route-id="${r.id}">Ver ruta</button><button class="secondary-button" data-action="share-route" data-route-id="${r.id}">Compartir</button></div></article>`).join('')}
byId('routeFilters').addEventListener('click',e=>{const b=e.target.closest('[data-route-filter]');if(!b)return;$$('#routeFilters button').forEach(x=>x.classList.toggle('active',x===b));renderRoutes(b.dataset.routeFilter)});
function openRoute(r){const stops=r.placeNames.map(n=>placeByName(n)).filter(Boolean);openSheet(`<span class="place-category" style="background:var(--terracotta)">${r.icon} Ruta preparada</span><h2>${esc(r.name)}</h2><p>${esc(r.description)}</p><div class="place-meta-grid"><div class="place-meta"><small>Duración</small><strong>${esc(r.duration)}</strong></div><div class="place-meta"><small>Presupuesto</small><strong>${esc(r.budget)}</strong></div><div class="place-meta"><small>Dificultad</small><strong>${esc(r.difficulty)}</strong></div><div class="place-meta"><small>Mejor momento</small><strong>${esc(r.best)}</strong></div></div><h3>Paradas</h3><div class="stack-list">${stops.map((p,i)=>`<button class="list-row" data-action="place-detail" data-place-id="${p.id}" style="border:0;padding:11px;text-align:left"><strong>${i+1}. ${esc(p.name)}</strong><small style="display:block;color:var(--muted)">${esc(p.addr)}</small></button>`).join('')}</div><div class="sheet-actions"><button class="primary-button" data-action="show-route-map" data-route-id="${r.id}">Ver en mapa</button><button class="secondary-button" data-action="share-route" data-route-id="${r.id}">Compartir</button></div><button class="secondary-button" style="width:100%;margin-top:9px" data-action="route-to-agenda" data-route-id="${r.id}">Añadir como plan</button>`)}
function showRouteMap(r){state.mapScope=r.type==='urban'||r.type==='nature'?'city':'trip';saveState();setView('map');setTimeout(()=>{initMap();renderMapMarkers();const ps=r.placeNames.map(placeByName).filter(Boolean);if(ps.length){const g=L.featureGroup(ps.map(p=>L.marker([p.lat,p.lng])));map.fitBounds(g.getBounds(),{padding:[55,55],maxZoom:13})}},150);closeSheet()}
function shareText(title,text,url=''){if(navigator.share)return navigator.share({title,text,url}).catch(()=>{});navigator.clipboard?.writeText(`${title}\n${text}\n${url}`).then(()=>toast('Copiado para compartir.')).catch(()=>toast('No se pudo compartir.'))}
function shareRoute(r){shareText(`Plan Erasmus: ${r.name}`,`${r.icon} ${r.name}\n${r.duration} · ${r.budget} · ${r.transport}\n${r.description}\nParadas: ${r.placeNames.join(' → ')}`,location.href)}

function combinedEvents(){const group=groupPlansCache.map(x=>({...x,type:'group'}));return[...D.events,...state.personalEvents,...group]}
function renderAgenda(){const f=state.agendaFilter||'all',events=combinedEvents().filter(e=>f==='all'||e.type===f).sort((a,b)=>new Date(a.start)-new Date(b.start));byId('agendaList').innerHTML=events.length?events.map(e=>{const past=new Date(e.end||e.start)<new Date();return`<article class="agenda-card ${past?'past':''}"><div class="date-box"><strong>${new Date(e.start).getDate()}</strong><small>${fmtDate(e.start,{month:'short'})}</small></div><div><span class="eyebrow" style="color:var(--terracotta)">${e.type==='official'?'Oficial':e.type==='group'?'Grupo':'Personal'}</span><h3>${esc(e.title)}</h3><p>${fmtDateTime(e.start)} · ${esc(e.location||'Sin ubicación')}<br>${esc(e.description||'')}</p><div class="agenda-card-actions"><button class="mini-button" data-action="share-event" data-event-id="${e.id}">Compartir</button>${e.type!=='official'?`<button class="mini-button" data-action="delete-event" data-event-id="${e.id}">Eliminar</button>`:''}</div></div></article>`}).join(''):'<div class="empty-state"><span>□</span>No hay eventos en esta vista.</div>'}
byId('agendaFilters').addEventListener('click',e=>{const b=e.target.closest('[data-agenda-filter]');if(!b)return;state.agendaFilter=b.dataset.agendaFilter;saveState();$$('#agendaFilters button').forEach(x=>x.classList.toggle('active',x===b));renderAgenda()});
byId('addEventBtn').addEventListener('click',()=>openEventForm());byId('shareAgendaBtn').addEventListener('click',()=>{const next=combinedEvents().filter(e=>new Date(e.start)>new Date()).sort((a,b)=>new Date(a.start)-new Date(b.start)).slice(0,5);shareText('Próximos planes Erasmus',next.map(e=>`${fmtDateTime(e.start)} — ${e.title} (${e.location||'sin ubicación'})`).join('\n'),location.href)});
function openEventForm(prefill={}){openModal(`<h2>Añadir plan</h2><div class="form-grid"><label class="field-label">Título<input id="eventTitle" maxlength="70" value="${esc(prefill.title||'')}"></label><label class="field-label">Fecha y hora<input id="eventDate" type="datetime-local" value="${esc(prefill.date||'')}"></label><label class="field-label">Lugar<input id="eventLocation" maxlength="80" value="${esc(prefill.location||'')}"></label><label class="field-label">Descripción<textarea id="eventDescription" maxlength="300">${esc(prefill.description||'')}</textarea></label><label class="field-label">Visibilidad<select id="eventVisibility"><option value="personal">Solo en mi dispositivo</option>${state.groupCode?'<option value="group">Compartir con mi grupo</option>':''}</select></label><button class="primary-button" data-action="save-event">Guardar plan</button></div>`)}
async function saveEvent(){const title=byId('eventTitle').value.trim(),start=byId('eventDate').value,locationText=byId('eventLocation').value.trim(),description=byId('eventDescription').value.trim(),type=byId('eventVisibility').value;if(!title||!start)return toast('Completa título y fecha.');const rec={id:uid(),title,start:new Date(start).toISOString(),end:new Date(start).toISOString(),location:locationText,description,type};if(type==='group'&&state.groupCode&&firebaseReady){try{await db.collection('groups').doc(state.groupCode).collection('plans').doc(rec.id).set({...rec,author:state.nickname||'Erasmus',createdAt:firebase.firestore.FieldValue.serverTimestamp()});await loadGroupPlans()}catch(e){toast('No se pudo compartir; guardado como personal.');rec.type='personal';state.personalEvents.push(rec)}}else state.personalEvents.push(rec);saveState();closeModal();renderAgenda();renderHome();toast('Plan guardado.')}
function findEvent(id){return combinedEvents().find(e=>e.id===id)}
function shareEvent(e){shareText(e.title,`${fmtDateTime(e.start)}\n${e.location||''}\n${e.description||''}`,location.href)}
async function deleteEvent(e){if(e.type==='group'&&firebaseReady&&state.groupCode){try{await db.collection('groups').doc(state.groupCode).collection('plans').doc(e.id).delete();await loadGroupPlans()}catch{toast('No se pudo eliminar.')}}else state.personalEvents=state.personalEvents.filter(x=>x.id!==e.id);saveState();renderAgenda();renderHome()}

let groupPlansCache=[];
async function loadGroupPlans(){groupPlansCache=[];if(state.groupCode&&firebaseReady){try{const s=await db.collection('groups').doc(state.groupCode).collection('plans').orderBy('start','asc').limit(100).get();groupPlansCache=s.docs.map(d=>({id:d.id,...d.data(),type:'group'}))}catch(e){console.warn(e)}}renderAgenda();renderHome()}
function groupHtml(){if(!state.groupCode)return`<p>No perteneces a ningún grupo. Crea uno para compartir agenda, planes y ranking privado.</p><button class="primary-button" data-action="manage-group">Crear o unirme</button>`;return`<span class="eyebrow" style="color:var(--terracotta)">Código ${esc(state.groupCode)}</span><h3>${esc(state.localGroup?.name||'Grupo Erasmus')}</h3><p>Comparte este código para que tus amigos entren en la misma agenda y clasificación.</p><div class="sheet-actions"><button class="primary-button" data-action="share-group">Compartir código</button><button class="secondary-button" data-action="manage-group">Gestionar</button></div>`}
function openGroupManager(){openModal(`<h2>Grupos privados</h2>${state.groupCode?`<p>Estás en el grupo <b>${esc(state.localGroup?.name||state.groupCode)}</b>.</p><div class="modal-actions"><button class="secondary-button" data-action="share-group">Compartir código</button><button class="primary-button" data-action="leave-group">Salir</button></div>`:`<div class="form-grid"><label class="field-label">Crear grupo<input id="newGroupName" placeholder="Ej.: Españoles Olomouc"></label><button class="primary-button" data-action="create-group">Crear grupo</button><hr style="width:100%;border:0;border-top:1px solid var(--line)"><label class="field-label">Unirme con código<input id="joinGroupCode" maxlength="8" placeholder="ABC123"></label><button class="secondary-button" data-action="join-group">Unirme</button></div>`}`)}
function makeGroupCode(){return Math.random().toString(36).slice(2,8).toUpperCase()}
async function createGroup(){const name=byId('newGroupName').value.trim();if(!name)return toast('Escribe un nombre.');const code=makeGroupCode();state.groupCode=code;state.localGroup={name};saveState();if(firebaseReady){try{await db.collection('groups').doc(code).set({name,createdAt:firebase.firestore.FieldValue.serverTimestamp(),createdBy:getDeviceId()});await syncPlayer()}catch(e){console.warn(e)}}closeModal();renderProfile();loadGroupPlans();toast(`Grupo creado: ${code}`)}
async function joinGroup(){const code=byId('joinGroupCode').value.trim().toUpperCase();if(code.length<4)return toast('Código no válido.');let name='Grupo Erasmus';if(firebaseReady){try{const d=await db.collection('groups').doc(code).get();if(!d.exists)return toast('No existe ese grupo.');name=d.data().name||name}catch(e){return toast('No se pudo comprobar el grupo.')}}state.groupCode=code;state.localGroup={name};saveState();await syncPlayer();closeModal();renderProfile();loadGroupPlans();toast('Te has unido al grupo.')}
function leaveGroup(){state.groupCode='';state.localGroup=null;groupPlansCache=[];saveState();closeModal();renderProfile();renderAgenda();toast('Has salido del grupo.')}

async function renderProfile(){renderLevel();const photos=await allPhotos(),verified=PLACES.filter(p=>isVerified(p)).length,visited=PLACES.filter(isVisited).length,l=currentLevel();byId('profileAvatar').textContent=(state.nickname||'?').slice(0,1).toUpperCase();byId('profileTitle').textContent=state.nickname||'Tu progreso';byId('profileSummary').textContent=`Nivel ${l.level} · ${l.name}`;byId('profilePoints').textContent=currentPoints();byId('profileVisits').textContent=visited;byId('profileVerified').textContent=verified;byId('profilePhotos').textContent=photos.length;byId('groupPanel').innerHTML=groupHtml();byId('missionsList').innerHTML=MISSIONS.map(m=>{const p=missionProgress(m);return`<article class="mission-card"><div class="mission-card-head"><span>${m.icon}</span><h3>${esc(m.name)}</h3><small>${p.done}/${p.target}</small></div><div class="mission-progress"><span style="width:${p.pct}%"></span></div><small>${esc(m.description)} · +${m.bonus} bonus</small></article>`}).join('');renderRanking();byId('photoGallery').innerHTML=photos.length?photos.sort((a,b)=>b.createdAt.localeCompare(a.createdAt)).map(x=>`<button class="photo-tile" data-action="photo-view" data-photo-id="${x.id}"><img src="${x.data}" alt="Foto de ${esc(placeById(x.placeId)?.name||'visita')}"><span>${esc(placeById(x.placeId)?.name||'Visita')}</span></button>`).join(''):'<div class="empty-state" style="grid-column:1/-1">Aún no has guardado fotos.</div>'}
let rankingKind='erasmus';async function renderRanking(){const el=byId('rankingList');el.innerHTML='<div class="loading-lines">Cargando ranking…</div>';if(rankingKind==='group'&&!state.groupCode){el.innerHTML='<div class="empty-state">Únete a un grupo para ver su ranking.</div>';return}const list=await fetchRanking(rankingKind);if(!list.length){el.innerHTML='<div class="empty-state">No hay datos compartidos todavía. Tu progreso local está a salvo.</div>';return}el.innerHTML=list.map((p,i)=>`<div class="rank-row ${p.id===getDeviceId()?'me':''}"><span class="rank-pos">${i+1}</span><span>${esc(p.name||'Erasmus')}</span><strong>${p.points||0} pts</strong></div>`).join('')}
byId('rankingTabs').addEventListener('click',e=>{const b=e.target.closest('[data-ranking]');if(!b)return;rankingKind=b.dataset.ranking;$$('#rankingTabs button').forEach(x=>x.classList.toggle('active',x===b));renderRanking()});
byId('editNameBtn').addEventListener('click',()=>openNameEditor());function openNameEditor(){openModal(`<h2>Tu nombre</h2><div class="form-grid"><label class="field-label">Nombre visible<input id="nicknameInput" maxlength="24" value="${esc(state.nickname)}"></label><button class="primary-button" data-action="save-name">Guardar</button></div>`)}
async function saveName(){const n=byId('nicknameInput').value.trim();if(!n)return toast('Escribe un nombre.');state.nickname=n;saveState();await syncPlayer();closeModal();renderProfile();toast('Nombre actualizado.')}

function openTransport(){openModal(`<h2>Transporte y facultades</h2><p><b>Billete:</b> ${esc(D.transport.ticket)} · ${esc(D.transport.ticketValidity)}. Billete de 24 h: ${esc(D.transport.dayTicket)}.</p><div class="transport-table"><div class="transport-row header"><span>Destino</span><span>Desde Neředín</span><span>Desde Envelopa</span></div>${D.facultyTravel.map(x=>`<button class="transport-row" data-action="transport-place" data-place-name="${esc(x.placeName)}" style="border:0;text-align:left"><strong>${esc(x.name)}</strong><span>${esc(x.fromNeredin)}</span><span>${esc(x.fromEnvelopa)}</span></button>`).join('')}</div><p><small>${esc(D.transport.note)}</small></p><div class="modal-actions"><button class="primary-button" data-action="external" data-url="${D.transport.officialUrl}">Abrir DPMO</button><button class="secondary-button" data-action="between-dorms">Ruta residencias</button></div>`)}
function openEmergency(){openModal(`<h2>Emergencias</h2><p>En una situación urgente, llama primero. Después puedes compartir tu posición actual con el grupo o con una persona de confianza.</p><div class="emergency-grid">${D.emergency.map(x=>`<a class="emergency-call" href="tel:${x.number}"><strong>${x.number}</strong><span>${esc(x.label)}</span><small>${esc(x.detail)}</small></a>`).join('')}</div><div class="modal-actions"><button class="primary-button" data-action="share-location">Compartir mi ubicación</button><button class="secondary-button" data-action="hospital">Ver hospital</button></div>`)}
function openOffline(){openModal(`<h2>Modo sin conexión</h2><p>La aplicación, las rutas, la agenda y tus visitas funcionan sin red. El mapa conserva las teselas que ya hayas abierto.</p><div class="card-panel"><b>Estado actual:</b> ${navigator.onLine?'en línea':'sin conexión'}<br><small>Para una excursión, abre antes la zona del mapa que vas a utilizar.</small></div><div class="modal-actions"><button class="primary-button" data-action="prefetch-map">Preparar mapa de Olomouc</button><button class="secondary-button" data-action="install">Instalar app</button></div>`)}
function prefetchMap(){toast('Guardando mapa básico…');const center={lat:49.594,lng:17.252},urls=[];for(let z=12;z<=15;z++){const n=2**z,x=Math.floor((center.lng+180)/360*n),latRad=center.lat*Math.PI/180,y=Math.floor((1-Math.asinh(Math.tan(latRad))/Math.PI)/2*n),r=z<14?1:2;for(let dx=-r;dx<=r;dx++)for(let dy=-r;dy<=r;dy++)urls.push(`https://a.tile.openstreetmap.org/${z}/${x+dx}/${y+dy}.png`)}Promise.allSettled(urls.map(u=>fetch(u,{mode:'no-cors'}))).then(()=>toast('Mapa básico preparado para uso sin conexión.'))}

function openSheet(html){byId('sheetContent').innerHTML=html;byId('bottomSheet').classList.add('open');byId('bottomSheet').setAttribute('aria-hidden','false');byId('sheetBackdrop').classList.add('open')}
function closeSheet(){byId('bottomSheet').classList.remove('open');byId('bottomSheet').setAttribute('aria-hidden','true');byId('sheetBackdrop').classList.remove('open')}
function openModal(html){byId('modalContent').innerHTML=html;byId('modal').classList.add('open');byId('modal').setAttribute('aria-hidden','false');byId('modalBackdrop').classList.add('open')}
function closeModal(){byId('modal').classList.remove('open');byId('modal').setAttribute('aria-hidden','true');byId('modalBackdrop').classList.remove('open')}
byId('closeSheet').addEventListener('click',closeSheet);byId('sheetBackdrop').addEventListener('click',closeSheet);byId('closeModal').addEventListener('click',closeModal);byId('modalBackdrop').addEventListener('click',closeModal);

// Global actions
function actionHandler(e){
  const a=e.target.closest('[data-action]');if(!a)return;const act=a.dataset.action;
  if(act==='route-detail')openRoute(ROUTES.find(r=>r.id===a.dataset.routeId));
  else if(act==='share-route')shareRoute(ROUTES.find(r=>r.id===a.dataset.routeId));
  else if(act==='show-route-map')showRouteMap(ROUTES.find(r=>r.id===a.dataset.routeId));
  else if(act==='route-to-agenda'){const r=ROUTES.find(x=>x.id===a.dataset.routeId);closeSheet();openEventForm({title:r.name,location:r.placeNames[0]||'',description:`${r.duration} · ${r.budget}. ${r.description}`})}
  else if(act==='place-detail'){const p=placeById(a.dataset.placeId);if(p)openPlace(p)}
  else if(act==='visit')attemptVisit(placeById(a.dataset.placeId));
  else if(act==='save-unverified'){const p=placeById(a.dataset.placeId);state.visited[p.id]={visitedAt:new Date().toISOString(),verified:false};saveState();syncPlayer();closeModal();closeSheet();renderAll();toast(`Visita guardada · +${pointsFor(p)} puntos`)}
  else if(act==='remove-visit'){delete state.visited[a.dataset.placeId];saveState();syncPlayer();closeModal();renderAll();toast('Visita eliminada.')}
  else if(act==='photo'){photoTarget=a.dataset.placeId;byId('photoInput').click()}
  else if(act==='directions'){const p=placeById(a.dataset.placeId);window.open(`https://www.google.com/maps/dir/?api=1&destination=${p.lat},${p.lng}`,'_blank','noopener')}
  else if(act==='share-place'){const p=placeById(a.dataset.placeId);shareText(p.name,`${p.note}\n${p.addr}\nPresupuesto: ${p.budgetLabel}`,`https://www.google.com/maps/search/?api=1&query=${p.lat},${p.lng}`)}
  else if(act==='official'||act==='external')window.open(a.dataset.url,'_blank','noopener');
  else if(act==='comment')addComment(a.dataset.placeId);
  else if(act==='save-event')saveEvent();
  else if(act==='share-event'){const x=findEvent(a.dataset.eventId);if(x)shareEvent(x)}
  else if(act==='delete-event'){const x=findEvent(a.dataset.eventId);if(x)deleteEvent(x)}
  else if(act==='event-detail'){const x=findEvent(a.dataset.eventId);if(x)openModal(`<h2>${esc(x.title)}</h2><p>${fmtDateTime(x.start)} · ${esc(x.location||'')}</p><p>${esc(x.description||'')}</p><button class="primary-button" data-action="share-event" data-event-id="${x.id}">Compartir plan</button>`)}
  else if(act==='manage-group')openGroupManager();
  else if(act==='create-group')createGroup();else if(act==='join-group')joinGroup();else if(act==='leave-group')leaveGroup();
  else if(act==='share-group')shareText('Únete a mi grupo de Olomouc Quest',`Código del grupo: ${state.groupCode}`,location.href);
  else if(act==='save-name')saveName();
  else if(act==='cancel-modal')closeModal();
  else if(act==='transport-place'){const p=placeByName(a.dataset.placeName);if(p){closeModal();setView('map');setTimeout(()=>{initMap();map.flyTo([p.lat,p.lng],16);openPlace(p)},160)}}
  else if(act==='between-dorms')window.open(`https://www.google.com/maps/dir/?api=1&origin=${D.residences.neredin.lat},${D.residences.neredin.lng}&destination=${D.residences.envelopa.lat},${D.residences.envelopa.lng}&travelmode=transit`,'_blank','noopener');
  else if(act==='share-location')locateAndShare();else if(act==='hospital'){const p=PLACES.find(x=>x.cat==='health');if(p){closeModal();setView('map');setTimeout(()=>{initMap();map.flyTo([p.lat,p.lng],16);openPlace(p)},160)}}
  else if(act==='prefetch-map')prefetchMap();else if(act==='install'){if(deferredPrompt)byId('installBtn').click();else toast('Usa “Añadir a pantalla de inicio” en el menú del navegador.')}
  else if(act==='photo-view'){allPhotos().then(ps=>{const p=ps.find(x=>x.id===a.dataset.photoId);if(p)openModal(`<h2>${esc(placeById(p.placeId)?.name||'Recuerdo')}</h2><img src="${p.data}" alt="Foto de visita" style="width:100%;border-radius:16px">`)})}
}
document.addEventListener('click',actionHandler);
document.addEventListener('click',e=>{const v=e.target.closest('[data-vote]');if(v&&currentPlaceId)toggleVote(currentPlaceId,v.dataset.vote);const s=e.target.closest('[data-status-report]');if(s&&currentPlaceId)setStatusReport(currentPlaceId,s.dataset.statusReport)});
function locateAndShare(){if(!navigator.geolocation)return toast('Ubicación no disponible.');navigator.geolocation.getCurrentPosition(pos=>shareText('Mi ubicación',`Estoy aquí: ${pos.coords.latitude.toFixed(6)}, ${pos.coords.longitude.toFixed(6)}`,`https://www.google.com/maps?q=${pos.coords.latitude},${pos.coords.longitude}`),()=>toast('No se pudo obtener la ubicación.'),{enableHighAccuracy:true,timeout:10000})}

byId('emergencyBtn').addEventListener('click',openEmergency);byId('emergencyProfile').addEventListener('click',openEmergency);byId('transportHome').addEventListener('click',openTransport);byId('transportProfile').addEventListener('click',openTransport);byId('groupsHome').addEventListener('click',openGroupManager);byId('groupManageBtn').addEventListener('click',openGroupManager);byId('offlineHome').addEventListener('click',openOffline);byId('offlineProfile').addEventListener('click',openOffline);
byId('resetBtn').addEventListener('click',()=>{if(confirm('¿Borrar visitas, perfil, comentarios locales y agenda personal? Las fotos se conservan.')){state=defaultState();saveState();location.reload()}});

function renderAll(){renderHome();if(map){renderMapFilters();renderMapMarkers()}renderAgenda();renderProfile()}
renderRoutes();renderHome();renderAgenda();renderProfile();loadGroupPlans();syncPlayer();
})();
