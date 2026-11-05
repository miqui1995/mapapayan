/* MapaPayán – mapeo de calles y puntos para OpenStreetMap
   Todo se guarda en el teléfono (IndexedDB). Funciona sin internet. */
'use strict';

// ---------- Configuración ----------
const HOME = [1.69684, -78.24514]; // San José, Roberto Payán
const DEFAULT_SETTINGS = { maxAcc: 20, minDist: 3, autoFollow: true };

const HIGHWAYS = [
  ['residential', 'Calle del pueblo', '#0f766e'],
  ['unclassified', 'Vía principal / entre caseríos', '#7c3aed'],
  ['service', 'Acceso / callejón de servicio', '#0891b2'],
  ['footway', 'Peatonal / andén / puente peatonal', '#db2777'],
  ['path', 'Sendero', '#a16207'],
  ['track', 'Camino rural (trocha)', '#92400e'],
  ['steps', 'Escaleras', '#475569'],
];
const SURFACES = [
  ['', 'Sin especificar'], ['concrete', 'Concreto / pavimento rígido'], ['asphalt', 'Asfalto'],
  ['paving_stones', 'Adoquín'], ['gravel', 'Balasto / gravilla'], ['dirt', 'Tierra'],
  ['ground', 'Tierra natural / barro'], ['wood', 'Madera'], ['unpaved', 'Sin pavimentar (otro)'],
];
// categoría -> [etiqueta, etiquetas OSM, color, privado(no se exporta a OSM)]
const CATS = {
  tienda: ['Tienda / granero', { shop: 'convenience' }, '#16a34a'],
  supermercado: ['Supermercado / autoservicio', { shop: 'supermarket' }, '#15803d'],
  drogueria: ['Droguería', { amenity: 'pharmacy', healthcare: 'pharmacy' }, '#0ea5e9'],
  restaurante: ['Restaurante', { amenity: 'restaurant' }, '#f97316'],
  comidas: ['Comidas rápidas / asadero', { amenity: 'fast_food' }, '#fb923c'],
  panaderia: ['Panadería', { shop: 'bakery' }, '#ca8a04'],
  carniceria: ['Carnicería / pescadería', { shop: 'butcher' }, '#b91c1c'],
  ferreteria: ['Ferretería', { shop: 'hardware' }, '#57534e'],
  bar: ['Bar / discoteca', { amenity: 'bar' }, '#9333ea'],
  licores: ['Licorera', { shop: 'alcohol' }, '#a855f7'],
  ropa: ['Ropa / calzado', { shop: 'clothes' }, '#ec4899'],
  celulares: ['Celulares / recargas', { shop: 'mobile_phone' }, '#6366f1'],
  papeleria: ['Papelería / internet', { shop: 'stationery' }, '#8b5cf6'],
  peluqueria: ['Peluquería / barbería', { shop: 'hairdresser' }, '#f472b6'],
  taller: ['Taller de motos', { shop: 'motorcycle_repair' }, '#525252'],
  combustible: ['Venta de combustible', { amenity: 'fuel' }, '#dc2626'],
  muelle: ['Muelle / embarcadero', { man_made: 'pier' }, '#0284c7'],
  iglesia: ['Iglesia / templo', { amenity: 'place_of_worship' }, '#78716c'],
  escuela: ['Escuela / colegio', { amenity: 'school' }, '#2563eb'],
  salud: ['Centro / puesto de salud', { amenity: 'clinic', healthcare: 'clinic' }, '#e11d48'],
  gobierno: ['Oficina pública', { office: 'government' }, '#334155'],
  cancha: ['Cancha', { leisure: 'pitch' }, '#65a30d'],
  parque: ['Parque', { leisure: 'park' }, '#22c55e'],
  casa: ['Casa / cliente (privado)', { building: 'house' }, '#94a3b8', true],
  referencia: ['Punto de referencia (privado)', {}, '#64748b', true],
  otro: ['Otro (etiqueta OSM manual)', {}, '#0f172a'],
};

// ---------- Utilidades ----------
const $ = s => document.querySelector(s);
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const xesc = esc;
const fmtDist = m => m >= 1000 ? (m / 1000).toFixed(2) + ' km' : Math.round(m) + ' m';
const fmtDate = t => new Date(t).toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'short' });
const pad2 = n => String(n).padStart(2, '0');
function haversine(a, b) {
  const R = 6371000, toR = Math.PI / 180;
  const dLat = (b[0] - a[0]) * toR, dLon = (b[1] - a[1]) * toR;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(a[0] * toR) * Math.cos(b[0] * toR) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}
function trackLength(coords) {
  let d = 0; for (let i = 1; i < coords.length; i++) d += haversine(coords[i - 1], coords[i]); return d;
}
let toastT;
function toast(msg, ms = 2600) {
  const t = $('#toast'); t.textContent = msg; t.classList.remove('hidden');
  clearTimeout(toastT); toastT = setTimeout(() => t.classList.add('hidden'), ms);
}
function hwColor(h) { return (HIGHWAYS.find(x => x[0] === h) || HIGHWAYS[0])[2]; }
function hwLabel(h) { return (HIGHWAYS.find(x => x[0] === h) || [h, h])[1]; }
function catOf(k) { return CATS[k] || CATS.otro; }

// ---------- Base de datos (IndexedDB) ----------
const DB = (() => {
  let dbp;
  function open() {
    if (dbp) return dbp;
    dbp = new Promise((res, rej) => {
      const r = indexedDB.open('mapapayan', 1);
      r.onupgradeneeded = () => {
        const db = r.result;
        db.createObjectStore('tracks', { keyPath: 'id' });
        db.createObjectStore('points', { keyPath: 'id' });
        db.createObjectStore('photos', { keyPath: 'id' });
        db.createObjectStore('kv');
      };
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
    return dbp;
  }
  async function tx(store, mode, fn) {
    const db = await open();
    return new Promise((res, rej) => {
      const t = db.transaction(store, mode);
      const s = t.objectStore(store);
      let out;
      Promise.resolve(fn(s)).then(v => { out = v; });
      t.oncomplete = () => res(out);
      t.onerror = () => rej(t.error);
      t.onabort = () => rej(t.error);
    });
  }
  const req = r => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
  return {
    all: store => tx(store, 'readonly', s => req(s.getAll())),
    get: (store, id) => tx(store, 'readonly', s => req(s.get(id))),
    put: (store, v, key) => tx(store, 'readwrite', s => { key === undefined ? s.put(v) : s.put(v, key); }),
    del: (store, id) => tx(store, 'readwrite', s => { s.delete(id); }),
    clear: store => tx(store, 'readwrite', s => { s.clear(); }),
  };
})();

// ---------- Estado ----------
let settings = { ...DEFAULT_SETTINGS };
let tracks = [], points = [];
let rec = null;            // { id, coords: [[lat,lon,ele,acc,t]], started, paused, segments }
let lastFix = null;        // último fix GPS (cualquier precisión)
let watchId = null;
let follow = true;
let wakeLock = null;
let recTimer = null;

// ---------- Mapa ----------
const map = L.map('map', { zoomControl: false, attributionControl: true }).setView(HOME, 17);
const baseOSM = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 19, attribution: '© Colaboradores de OpenStreetMap'
});
const baseSat = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
  maxZoom: 19, maxNativeZoom: 18, attribution: 'Imágenes © Esri, Maxar, Earthstar Geographics'
});
let currentBase = baseOSM.addTo(map);

const tracksLayer = L.layerGroup().addTo(map);
const pointsLayer = L.layerGroup().addTo(map);
const recLine = L.polyline([], { color: '#dc2626', weight: 5, opacity: .9 }).addTo(map);
const meMarker = L.marker(HOME, { icon: L.divIcon({ className: '', html: '<div class="me-dot"></div>', iconSize: [18, 18], iconAnchor: [9, 9] }), interactive: false, zIndexOffset: 1000 });
const meAcc = L.circle(HOME, { radius: 0, color: '#2563eb', weight: 1, fillOpacity: .12, interactive: false });

map.on('dragstart', () => { if (follow) setFollow(false); });

function setFollow(v) {
  follow = v; $('#btnFollow').classList.toggle('on', v);
  if (v && lastFix) map.panTo([lastFix.lat, lastFix.lon]);
}
$('#btnFollow').onclick = () => setFollow(!follow);
$('#btnLayers').onclick = () => {
  map.removeLayer(currentBase);
  currentBase = currentBase === baseOSM ? baseSat : baseOSM;
  currentBase.addTo(map); currentBase.bringToBack();
  $('#btnLayers').textContent = currentBase === baseOSM ? 'Capa' : 'Satélite';
  toast(currentBase === baseOSM ? 'Mapa OpenStreetMap' : 'Imagen satelital (referencia)');
};

function drawAll() {
  tracksLayer.clearLayers(); pointsLayer.clearLayers();
  for (const t of tracks) {
    if (t.coords.length < 2) continue;
    const line = L.polyline(t.coords.map(c => [c[0], c[1]]), {
      color: hwColor(t.highway), weight: 5, opacity: .85, dashArray: t.highway === 'path' || t.highway === 'track' ? '8 6' : null
    });
    line.bindPopup(() => trackPopup(t));
    line.addTo(tracksLayer);
  }
  for (const p of points) {
    const c = catOf(p.cat);
    const m = L.circleMarker([p.lat, p.lon], { radius: 8, color: '#fff', weight: 2, fillColor: c[2], fillOpacity: 1 });
    m.bindPopup(() => pointPopup(p));
    m.addTo(pointsLayer);
  }
}
function trackPopup(t) {
  const d = document.createElement('div');
  d.innerHTML = `<b>${esc(t.name || 'Sin nombre')}</b><br>${esc(hwLabel(t.highway))}${t.bridge ? ' · puente' : ''}<br>
    <small>${fmtDist(t.distance)} · ${t.coords.length} pts · ${fmtDate(t.created)}</small>
    <button class="btn">Editar</button>`;
  d.querySelector('button').onclick = () => { map.closePopup(); editTrack(t); };
  return d;
}
function pointPopup(p) {
  const d = document.createElement('div');
  d.innerHTML = `<b>${esc(p.name || catOf(p.cat)[0])}</b><br>${esc(catOf(p.cat)[0])}
    ${p.ref ? `<br><small>${esc(p.ref)}</small>` : ''}${p.photoIds?.length ? `<br><small>${p.photoIds.length} foto(s)</small>` : ''}
    <button class="btn">Editar</button>`;
  d.querySelector('button').onclick = () => { map.closePopup(); editPoint(p); };
  return d;
}

// ---------- GPS ----------
function startGps() {
  if (!('geolocation' in navigator)) { toast('Este navegador no tiene GPS disponible'); return; }
  if (watchId !== null) return;
  watchId = navigator.geolocation.watchPosition(onFix, onGpsErr, { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 });
}
function onGpsErr(e) {
  const chip = $('#gpsChip'); chip.className = 'chip chip-bad';
  if (e.code === 1) { chip.textContent = 'GPS: sin permiso'; toast('Activa la ubicación: Ajustes › Privacidad › Localización › Safari/MapaPayán', 6000); }
  else chip.textContent = 'GPS: buscando…';
}
function onFix(pos) {
  const c = pos.coords;
  lastFix = { lat: c.latitude, lon: c.longitude, acc: c.accuracy, ele: c.altitude, t: pos.timestamp };
  const chip = $('#gpsChip');
  chip.textContent = `GPS ±${Math.round(c.accuracy)} m`;
  chip.className = 'chip ' + (c.accuracy <= 10 ? 'chip-good' : c.accuracy <= settings.maxAcc ? 'chip-mid' : 'chip-bad');
  meMarker.setLatLng([c.latitude, c.longitude]); meAcc.setLatLng([c.latitude, c.longitude]).setRadius(c.accuracy);
  if (!map.hasLayer(meMarker)) { meMarker.addTo(map); meAcc.addTo(map); if (follow) map.setView([c.latitude, c.longitude], 18); }
  else if (follow) map.panTo([c.latitude, c.longitude], { animate: true });
  if (rec && !rec.paused) addRecPoint(lastFix);
}

// ---------- Grabación de recorridos ----------
function addRecPoint(f) {
  const warn = $('#recWarn');
  if (f.acc > settings.maxAcc) {
    warn.textContent = `Señal GPS débil (±${Math.round(f.acc)} m). Esperando mejor precisión… sal de debajo de techos o árboles.`;
    warn.classList.remove('hidden'); return;
  }
  warn.classList.add('hidden');
  const seg = rec.segments[rec.segments.length - 1];
  const last = seg[seg.length - 1];
  const p = [+f.lat.toFixed(7), +f.lon.toFixed(7), f.ele == null ? null : +f.ele.toFixed(1), Math.round(f.acc), f.t];
  if (last) {
    const d = haversine(last, p);
    const dt = Math.max(1, (p[4] - last[4]) / 1000);
    if (d < settings.minDist) return;            // no se ha movido lo suficiente
    if (d / dt > 25 && d > 40) return;           // salto imposible a pie/moto (>90 km/h)
  }
  seg.push(p);
  rec.distance = rec.segments.reduce((s, sg) => s + trackLength(sg), 0);
  recLine.setLatLngs(rec.segments.map(sg => sg.map(c => [c[0], c[1]])));
  updateRecPanel();
  saveRecDraft();
}
let draftT;
function saveRecDraft() { clearTimeout(draftT); draftT = setTimeout(() => DB.put('kv', rec, 'draft').catch(() => {}), 400); }

async function startRec(resumeFrom) {
  startGps();
  rec = resumeFrom || { id: uid(), segments: [[]], started: Date.now(), distance: 0, paused: false, pausedMs: 0 };
  rec.paused = false;
  $('#recPanel').classList.remove('hidden');
  $('#btnRec').classList.add('hidden'); $('#btnPause').classList.remove('hidden'); $('#btnStop').classList.remove('hidden');
  $('#btnPause').innerHTML = '<span class="ico">❚❚</span><span>Pausa</span>';
  $('#recDot').classList.remove('paused'); $('#recState').textContent = 'Grabando';
  recLine.setLatLngs(rec.segments.map(sg => sg.map(c => [c[0], c[1]])));
  setFollow(true);
  await keepAwake();
  clearInterval(recTimer); recTimer = setInterval(updateRecPanel, 1000);
  updateRecPanel(); saveRecDraft();
  if (lastFix && Date.now() - lastFix.t < 5000) addRecPoint(lastFix);
}
function togglePause() {
  if (!rec) return;
  rec.paused = !rec.paused;
  if (rec.paused) { rec.pauseAt = Date.now(); }
  else { rec.pausedMs += Date.now() - (rec.pauseAt || Date.now()); rec.segments.push([]); }
  $('#btnPause').innerHTML = rec.paused ? '<span class="ico">▶</span><span>Seguir</span>' : '<span class="ico">❚❚</span><span>Pausa</span>';
  $('#recDot').classList.toggle('paused', rec.paused);
  $('#recState').textContent = rec.paused ? 'En pausa' : 'Grabando';
  saveRecDraft();
}
function updateRecPanel() {
  if (!rec) return;
  const n = rec.segments.reduce((s, sg) => s + sg.length, 0);
  const now = rec.paused ? rec.pauseAt : Date.now();
  const secs = Math.max(0, Math.floor((now - rec.started - rec.pausedMs) / 1000));
  $('#recDist').textContent = fmtDist(rec.distance || 0);
  $('#recPts').textContent = n + ' pts';
  $('#recTime').textContent = (secs >= 3600 ? Math.floor(secs / 3600) + ':' : '') + pad2(Math.floor(secs / 60) % 60) + ':' + pad2(secs % 60);
}
function stopRec() {
  if (!rec) return;
  const segs = rec.segments.filter(s => s.length >= 2);
  if (!segs.length) {
    openSheet(`<h2>Recorrido muy corto</h2><p class="note">No hay suficientes puntos con buena precisión para guardar un recorrido.</p>
      <div class="row actions"><button class="btn" id="kAgain">Seguir grabando</button><button class="btn danger" id="kDiscard">Descartar</button></div>`);
    $('#kAgain').onclick = () => { closeSheet(); if (rec.paused) togglePause(); };
    $('#kDiscard').onclick = () => { closeSheet(); endRec(); };
    return;
  }
  if (!rec.paused) togglePause();
  // Cada tramo (entre pausas) se guarda como un recorrido independiente
  trackForm({ isNew: true, segs }, async vals => {
    const base = rec.id; let i = 0;
    for (const sg of segs) {
      const t = { id: segs.length > 1 ? base + '-' + (++i) : base, coords: sg, created: rec.started, distance: trackLength(sg), ...vals };
      if (segs.length > 1 && vals.name) t.name = vals.name;
      await DB.put('tracks', t); tracks.push(t);
    }
    endRec(); drawAll(); toast(segs.length > 1 ? `Guardados ${segs.length} tramos` : 'Recorrido guardado');
  }, () => { if (rec && rec.paused) togglePause(); });
}
function endRec() {
  rec = null; clearInterval(recTimer); DB.del('kv', 'draft').catch(() => {});
  recLine.setLatLngs([]); $('#recPanel').classList.add('hidden');
  $('#btnRec').classList.remove('hidden'); $('#btnPause').classList.add('hidden'); $('#btnStop').classList.add('hidden');
  releaseAwake();
}

// Mantener la pantalla encendida mientras graba (iOS 16.4+)
async function keepAwake() {
  try { if ('wakeLock' in navigator) wakeLock = await navigator.wakeLock.request('screen'); }
  catch (e) { /* no disponible */ }
  if (!wakeLock) toast('Mantén la pantalla encendida y la app abierta mientras caminas', 5000);
}
function releaseAwake() { try { wakeLock && wakeLock.release(); } catch (e) { } wakeLock = null; }
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && rec && !rec.paused) keepAwake();
});

$('#btnRec').onclick = () => startRec();
$('#btnPause').onclick = togglePause;
$('#btnStop').onclick = stopRec;

// ---------- Hoja modal ----------
let sheetOnClose = null;
function openSheet(html, onClose) {
  $('#sheetBody').innerHTML = html; sheetOnClose = onClose || null;
  $('#sheet').classList.remove('hidden'); $('#sheetBg').classList.remove('hidden'); $('#sheet').scrollTop = 0;
}
function closeSheet(cancelled) {
  $('#sheet').classList.add('hidden'); $('#sheetBg').classList.add('hidden');
  const f = sheetOnClose; sheetOnClose = null; if (cancelled && f) f();
}
$('#sheetBg').onclick = () => closeSheet(true);

// ---------- Formulario de recorrido ----------
function trackForm(t, onSave, onCancel) {
  const opts = HIGHWAYS.map(h => `<option value="${h[0]}" ${t.highway === h[0] ? 'selected' : ''}>${h[1]}</option>`).join('');
  const sopts = SURFACES.map(s => `<option value="${s[0]}" ${t.surface === s[0] ? 'selected' : ''}>${s[1]}</option>`).join('');
  const dist = t.isNew ? t.segs.reduce((s, g) => s + trackLength(g), 0) : t.distance;
  openSheet(`<h2>${t.isNew ? 'Guardar recorrido' : 'Editar recorrido'}</h2>
    <p class="note">${fmtDist(dist)}${t.isNew && t.segs.length > 1 ? ` en ${t.segs.length} tramos (uno por cada pausa)` : ''}</p>
    <label class="f">Nombre de la calle (si tiene)</label>
    <input class="in" id="fName" placeholder="Ej: Calle 3, Calle del Comercio" value="${esc(t.name)}">
    <label class="f">Tipo de vía</label><select class="in" id="fHw">${opts}</select>
    <label class="f">Superficie</label><select class="in" id="fSurf">${sopts}</select>
    <label class="check"><input type="checkbox" id="fBridge" ${t.bridge ? 'checked' : ''}> Es un puente</label>
    <label class="check"><input type="checkbox" id="fFlood" ${t.flood ? 'checked' : ''}> Se inunda en invierno</label>
    <label class="f">Notas</label><textarea class="in" id="fNotes" placeholder="Ej: angosta, solo pasan motos">${esc(t.notes)}</textarea>
    <div class="row actions">
      ${t.isNew ? '<button class="btn danger" id="fDel">Descartar</button>' : '<button class="btn danger" id="fDel">Borrar</button>'}
      <button class="btn primary" id="fSave">Guardar</button>
    </div>`, onCancel);
  $('#fSave').onclick = () => {
    const vals = { name: $('#fName').value.trim(), highway: $('#fHw').value, surface: $('#fSurf').value,
      bridge: $('#fBridge').checked, flood: $('#fFlood').checked, notes: $('#fNotes').value.trim() };
    sheetOnClose = null; closeSheet(); onSave(vals);
  };
  $('#fDel').onclick = async () => {
    if (!confirm(t.isNew ? '¿Descartar este recorrido?' : '¿Borrar este recorrido?')) return;
    sheetOnClose = null; closeSheet();
    if (t.isNew) { endRec(); toast('Recorrido descartado'); }
    else { await DB.del('tracks', t.id); tracks = tracks.filter(x => x.id !== t.id); drawAll(); toast('Recorrido borrado'); }
  };
}
function editTrack(t) {
  trackForm(t, async vals => {
    Object.assign(t, vals); await DB.put('tracks', t); drawAll(); toast('Cambios guardados');
  });
}

// ---------- Puntos ----------
let placing = null;
function startPlacing(cb) {
  placing = cb;
  $('#crosshair').classList.remove('hidden'); $('#placeBar').classList.remove('hidden'); $('#bottombar').classList.add('hidden');
  if (lastFix) map.setView([lastFix.lat, lastFix.lon], Math.max(map.getZoom(), 18));
  setFollow(false);
}
function endPlacing() {
  placing = null;
  $('#crosshair').classList.add('hidden'); $('#placeBar').classList.add('hidden'); $('#bottombar').classList.remove('hidden');
}
$('#btnPoint').onclick = () => startPlacing((lat, lon, acc) => pointForm({ isNew: true, id: uid(), lat, lon, acc, cat: 'tienda', photoIds: [], created: Date.now() }));
$('#btnPlaceCancel').onclick = endPlacing;
$('#btnPlaceOk').onclick = () => { const c = map.getCenter(); const cb = placing; endPlacing(); cb && cb(+c.lat.toFixed(7), +c.lng.toFixed(7), null); };
$('#btnPlaceGps').onclick = () => {
  if (!lastFix) { toast('Aún no hay señal GPS'); return; }
  const cb = placing; endPlacing(); cb && cb(+lastFix.lat.toFixed(7), +lastFix.lon.toFixed(7), Math.round(lastFix.acc));
};

let formPhotos = []; // [{id, blob, isNew}]
async function pointForm(p) {
  formPhotos = [];
  for (const id of p.photoIds || []) { const ph = await DB.get('photos', id); if (ph) formPhotos.push({ id, blob: ph.blob }); }
  const copts = Object.entries(CATS).map(([k, v]) => `<option value="${k}" ${p.cat === k ? 'selected' : ''}>${v[0]}</option>`).join('');
  openSheet(`<h2>${p.isNew ? 'Nuevo punto' : 'Editar punto'}</h2>
    <p class="note">${p.lat.toFixed(6)}, ${p.lon.toFixed(6)}${p.acc ? ` · ±${p.acc} m` : ' · ubicado en el mapa'}</p>
    <label class="f">Categoría</label><select class="in" id="pCat">${copts}</select>
    <div id="pCustomWrap" class="${p.cat === 'otro' ? '' : 'hidden'}">
      <label class="f">Etiqueta OSM (clave=valor, una por línea)</label>
      <textarea class="in" id="pCustom" placeholder="shop=fishing">${esc(Object.entries(p.customTags || {}).map(([k, v]) => k + '=' + v).join('\n'))}</textarea>
    </div>
    <label class="f">Nombre</label><input class="in" id="pName" placeholder="Ej: Tienda Doña Rosa" value="${esc(p.name)}">
    <label class="f">Referencia para llegar</label><textarea class="in" id="pRef" placeholder="Ej: casa azul de dos pisos, frente al parque">${esc(p.ref)}</textarea>
    <label class="f">Barrio / sector</label><input class="in" id="pBarrio" placeholder="Ej: Barrio El Centro" value="${esc(p.barrio)}">
    <label class="f">Teléfono / WhatsApp</label><input class="in" id="pPhone" type="tel" inputmode="tel" placeholder="3xx xxx xxxx" value="${esc(p.phone)}">
    <label class="f">Horario</label><input class="in" id="pHours" placeholder="Ej: lun-sáb 7am-9pm" value="${esc(p.hours)}">
    <label class="check"><input type="checkbox" id="pDom" ${p.domicilios ? 'checked' : ''}> Le interesa vender a domicilio</label>
    <label class="f">Notas</label><textarea class="in" id="pNotes">${esc(p.notes)}</textarea>
    <label class="f">Fotos (fachada)</label>
    <div class="photos" id="pPhotos"></div>
    <div class="row" style="margin-top:8px">
      <button class="btn" id="pCam">Tomar foto</button>
    </div>
    <input type="file" id="pFile" accept="image/*" capture="environment" class="hidden">
    <div class="row actions">
      ${p.isNew ? '<button class="btn" id="pCancel">Cancelar</button>' : '<button class="btn danger" id="pDel">Borrar</button>'}
      ${p.isNew ? '' : '<button class="btn" id="pMove">Mover</button>'}
      <button class="btn primary" id="pSave">Guardar</button>
    </div>`);
  renderFormPhotos();
  $('#pCat').onchange = () => $('#pCustomWrap').classList.toggle('hidden', $('#pCat').value !== 'otro');
  $('#pCam').onclick = () => $('#pFile').click();
  $('#pFile').onchange = async e => {
    const f = e.target.files[0]; e.target.value = ''; if (!f) return;
    try { const blob = await resizeImage(f, 1280, 0.72); formPhotos.push({ id: uid(), blob, isNew: true }); renderFormPhotos(); }
    catch (err) { toast('No se pudo leer la foto'); }
  };
  if ($('#pCancel')) $('#pCancel').onclick = () => closeSheet();
  if ($('#pDel')) $('#pDel').onclick = async () => {
    if (!confirm('¿Borrar este punto y sus fotos?')) return;
    for (const id of p.photoIds || []) await DB.del('photos', id);
    await DB.del('points', p.id); points = points.filter(x => x.id !== p.id); closeSheet(); drawAll(); toast('Punto borrado');
  };
  if ($('#pMove')) $('#pMove').onclick = () => {
    closeSheet(); map.setView([p.lat, p.lon], 19);
    startPlacing(async (lat, lon, acc) => { p.lat = lat; p.lon = lon; p.acc = acc; await DB.put('points', p); drawAll(); toast('Punto movido'); });
    setTimeout(() => map.setView([p.lat, p.lon], 19), 0);
  };
  $('#pSave').onclick = async () => {
    const customTags = {};
    if ($('#pCat').value === 'otro') for (const line of $('#pCustom').value.split('\n')) {
      const i = line.indexOf('='); if (i > 0) customTags[line.slice(0, i).trim()] = line.slice(i + 1).trim();
    }
    const keep = new Set(formPhotos.map(x => x.id));
    for (const id of p.photoIds || []) if (!keep.has(id)) await DB.del('photos', id);
    for (const ph of formPhotos) if (ph.isNew) await DB.put('photos', { id: ph.id, pointId: p.id, blob: ph.blob });
    const np = { ...p, cat: $('#pCat').value, customTags, name: $('#pName').value.trim(), ref: $('#pRef').value.trim(),
      barrio: $('#pBarrio').value.trim(), phone: $('#pPhone').value.trim(), hours: $('#pHours').value.trim(),
      domicilios: $('#pDom').checked, notes: $('#pNotes').value.trim(), photoIds: formPhotos.map(x => x.id), updated: Date.now() };
    delete np.isNew;
    await DB.put('points', np);
    points = points.filter(x => x.id !== np.id).concat(np);
    closeSheet(); drawAll(); toast('Punto guardado');
  };
}
function renderFormPhotos() {
  const box = $('#pPhotos'); if (!box) return;
  box.innerHTML = formPhotos.length ? '' : '<span class="note">Sin fotos</span>';
  formPhotos.forEach((ph, i) => {
    const d = document.createElement('div'); d.className = 'ph';
    const img = document.createElement('img'); img.src = URL.createObjectURL(ph.blob);
    const b = document.createElement('button'); b.textContent = '✕'; b.onclick = () => { formPhotos.splice(i, 1); renderFormPhotos(); };
    d.append(img, b); box.append(d);
  });
}
function resizeImage(file, max, q) {
  return new Promise((res, rej) => {
    const img = new Image(); const url = URL.createObjectURL(file);
    img.onload = () => {
      const s = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement('canvas'); c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(url);
      c.toBlob(b => b ? res(b) : rej(new Error('blob')), 'image/jpeg', q);
    };
    img.onerror = rej; img.src = url;
  });
}
function editPoint(p) { pointForm(p); }

// ---------- Panel de datos ----------
$('#btnData').onclick = openData;
function openData() {
  const km = tracks.reduce((s, t) => s + (t.distance || 0), 0);
  const nPhotos = points.reduce((s, p) => s + (p.photoIds?.length || 0), 0);
  const tl = [...tracks].sort((a, b) => b.created - a.created).map(t => `<li data-t="${t.id}">
      <span class="sw" style="background:${hwColor(t.highway)}"></span>
      <div class="meta"><b>${esc(t.name || 'Sin nombre')}</b><small>${esc(hwLabel(t.highway))} · ${fmtDist(t.distance)} · ${fmtDate(t.created)}</small></div>
      <button class="btn small">Ver</button></li>`).join('') || '<li><span class="note">Aún no has grabado recorridos</span></li>';
  const pl = [...points].sort((a, b) => b.created - a.created).map(p => `<li data-p="${p.id}">
      <span class="sw" style="background:${catOf(p.cat)[2]};border-radius:50%"></span>
      <div class="meta"><b>${esc(p.name || catOf(p.cat)[0])}</b><small>${esc(catOf(p.cat)[0])}${p.photoIds?.length ? ' · ' + p.photoIds.length + ' foto(s)' : ''}</small></div>
      <button class="btn small">Ver</button></li>`).join('') || '<li><span class="note">Aún no has marcado puntos</span></li>';
  openSheet(`<h2>Mis datos</h2>
    <div class="stats">
      <div class="stat"><b>${fmtDist(km)}</b><span>recorridos</span></div>
      <div class="stat"><b>${points.length}</b><span>puntos</span></div>
      <div class="stat"><b>${nPhotos}</b><span>fotos</span></div>
    </div>
    <h3>Exportar</h3>
    <div class="grid2">
      <button class="btn primary" id="xZip">Paquete completo (.zip)</button>
      <button class="btn" id="xGpx">Recorridos GPX (OSM)</button>
      <button class="btn" id="xOsm">Puntos .osm (JOSM)</button>
      <button class="btn" id="xGeo">GeoJSON (domicilios)</button>
    </div>
    <p class="note">El .zip trae todo: GPX, .osm, GeoJSON y las fotos. Compártelo a Archivos, WhatsApp o tu correo.</p>
    <h3>Recorridos (${tracks.length})</h3><ul class="list" id="lT">${tl}</ul>
    <h3>Puntos (${points.length})</h3><ul class="list" id="lP">${pl}</ul>
    <h3>Respaldo</h3>
    <div class="grid2">
      <button class="btn" id="xBak">Crear respaldo</button>
      <button class="btn" id="xRes">Restaurar respaldo</button>
    </div>
    <input type="file" id="resFile" accept=".json,application/json" class="hidden">
    <p class="note">Haz un respaldo cada día de trabajo. Los datos viven solo en este teléfono.</p>
    <h3>Ajustes GPS</h3>
    <label class="f">Precisión máxima aceptada: <b id="vAcc">${settings.maxAcc}</b> m</label>
    <input type="range" class="in" id="sAcc" min="5" max="50" step="1" value="${settings.maxAcc}">
    <label class="f">Distancia mínima entre puntos: <b id="vMin">${settings.minDist}</b> m</label>
    <input type="range" class="in" id="sMin" min="1" max="15" step="1" value="${settings.minDist}">
    <div class="row actions"><button class="btn danger" id="xWipe">Borrar todo</button><button class="btn primary" id="xClose">Cerrar</button></div>
    <p class="note" style="text-align:center">MapaPayán v1 · MIQUITEC SAS</p>`);
  $('#xClose').onclick = () => closeSheet();
  $('#xZip').onclick = exportZip; $('#xGpx').onclick = () => share('recorridos_' + stamp() + '.gpx', new Blob([buildGPX()], { type: 'application/gpx+xml' }));
  $('#xOsm').onclick = () => share('puntos_' + stamp() + '.osm', new Blob([buildOSM()], { type: 'application/xml' }));
  $('#xGeo').onclick = () => share('mapapayan_' + stamp() + '.geojson', new Blob([JSON.stringify(buildGeoJSON(), null, 1)], { type: 'application/geo+json' }));
  $('#xBak').onclick = backup; $('#xRes').onclick = () => $('#resFile').click(); $('#resFile').onchange = restore;
  $('#xWipe').onclick = wipe;
  $('#sAcc').oninput = e => { settings.maxAcc = +e.target.value; $('#vAcc').textContent = settings.maxAcc; DB.put('kv', settings, 'settings'); };
  $('#sMin').oninput = e => { settings.minDist = +e.target.value; $('#vMin').textContent = settings.minDist; DB.put('kv', settings, 'settings'); };
  $('#lT').onclick = e => { const li = e.target.closest('li[data-t]'); if (!li) return; const t = tracks.find(x => x.id === li.dataset.t);
    closeSheet(); setFollow(false); map.fitBounds(L.latLngBounds(t.coords.map(c => [c[0], c[1]])), { padding: [40, 40] }); };
  $('#lP').onclick = e => { const li = e.target.closest('li[data-p]'); if (!li) return; const p = points.find(x => x.id === li.dataset.p);
    closeSheet(); setFollow(false); map.setView([p.lat, p.lon], 19); };
}
const stamp = () => { const d = new Date(); return `${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}_${pad2(d.getHours())}${pad2(d.getMinutes())}`; };

// ---------- Exportes ----------
function osmTagsForPoint(p) {
  const c = catOf(p.cat);
  const tags = { ...(p.cat === 'otro' ? p.customTags : c[1]) };
  if (p.name) tags.name = p.name;
  if (p.phone && !c[3]) {
    let ph = p.phone.replace(/[^\d+]/g, '');
    if (/^3\d{9}$/.test(ph)) ph = '+57 ' + ph.slice(0, 3) + ' ' + ph.slice(3, 6) + ' ' + ph.slice(6);
    tags.phone = ph;
  }
  return tags;
}
function osmTagsForTrack(t) {
  const tags = { highway: t.highway };
  if (t.name) tags.name = t.name;
  if (t.surface) tags.surface = t.surface;
  if (t.bridge) { tags.bridge = 'yes'; tags.layer = '1'; }
  return tags;
}
function buildGPX() {
  const iso = t => new Date(t).toISOString();
  let x = `<?xml version="1.0" encoding="UTF-8"?>\n<gpx version="1.1" creator="MapaPayan" xmlns="http://www.topografix.com/GPX/1/1">\n`;
  x += `<metadata><name>MapaPayán – Roberto Payán</name><time>${iso(Date.now())}</time></metadata>\n`;
  for (const p of points) {
    if (catOf(p.cat)[3]) continue; // privados no van a OSM
    x += `<wpt lat="${p.lat}" lon="${p.lon}"><time>${iso(p.created)}</time><name>${xesc(p.name || catOf(p.cat)[0])}</name><desc>${xesc(catOf(p.cat)[0])}</desc></wpt>\n`;
  }
  for (const t of tracks) {
    x += `<trk><name>${xesc(t.name || 'Recorrido')}</name><desc>${xesc(hwLabel(t.highway))}</desc><type>${xesc(t.highway)}</type><trkseg>\n`;
    for (const c of t.coords) x += `<trkpt lat="${c[0]}" lon="${c[1]}">${c[2] != null ? `<ele>${c[2]}</ele>` : ''}<time>${iso(c[4])}</time><hdop>${(c[3] / 5).toFixed(1)}</hdop></trkpt>\n`;
    x += `</trkseg></trk>\n`;
  }
  return x + '</gpx>\n';
}
function buildOSM() {
  // Solo puntos públicos (negocios, instituciones). Las calles se dibujan en el editor usando el GPX como guía.
  let id = -1, x = `<?xml version="1.0" encoding="UTF-8"?>\n<osm version="0.6" generator="MapaPayan" upload="true">\n`;
  for (const p of points) {
    if (catOf(p.cat)[3]) continue;
    const tags = osmTagsForPoint(p); if (!Object.keys(tags).length) continue;
    x += `  <node id="${id--}" lat="${p.lat}" lon="${p.lon}">\n`;
    for (const [k, v] of Object.entries(tags)) x += `    <tag k="${xesc(k)}" v="${xesc(v)}"/>\n`;
    x += `  </node>\n`;
  }
  return x + '</osm>\n';
}
function photoName(pid, i) { return `fotos/${pid}_${i + 1}.jpg`; }
function buildGeoJSON() {
  const features = [];
  for (const t of tracks) features.push({ type: 'Feature', geometry: { type: 'LineString', coordinates: t.coords.map(c => [c[1], c[0]]) },
    properties: { tipo: 'recorrido', id: t.id, nombre: t.name || null, via: hwLabel(t.highway), superficie: t.surface || null,
      puente: !!t.bridge, se_inunda: !!t.flood, notas: t.notes || null, distancia_m: Math.round(t.distance), fecha: new Date(t.created).toISOString(),
      osm: osmTagsForTrack(t) } });
  for (const p of points) features.push({ type: 'Feature', geometry: { type: 'Point', coordinates: [p.lon, p.lat] },
    properties: { tipo: 'punto', id: p.id, categoria: p.cat, categoria_nombre: catOf(p.cat)[0], nombre: p.name || null, referencia: p.ref || null,
      barrio: p.barrio || null, telefono: p.phone || null, horario: p.hours || null, domicilios: !!p.domicilios, notas: p.notes || null,
      privado: !!catOf(p.cat)[3], precision_m: p.acc ?? null, fecha: new Date(p.created).toISOString(),
      fotos: (p.photoIds || []).map((_, i) => photoName(p.id, i)), osm: osmTagsForPoint(p) } });
  return { type: 'FeatureCollection', name: 'MapaPayan', features };
}
async function exportZip() {
  toast('Preparando paquete…');
  const enc = new TextEncoder();
  const files = [
    { name: 'recorridos.gpx', data: enc.encode(buildGPX()) },
    { name: 'puntos_osm.osm', data: enc.encode(buildOSM()) },
    { name: 'mapapayan.geojson', data: enc.encode(JSON.stringify(buildGeoJSON(), null, 1)) },
  ];
  for (const p of points) for (let i = 0; i < (p.photoIds || []).length; i++) {
    const ph = await DB.get('photos', p.photoIds[i]);
    if (ph) files.push({ name: photoName(p.id, i), data: new Uint8Array(await ph.blob.arrayBuffer()) });
  }
  share('mapapayan_' + stamp() + '.zip', makeZip(files));
}
async function share(name, blob) {
  const file = new File([blob], name, { type: blob.type || 'application/octet-stream' });
  try {
    if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], title: name }); return; }
  } catch (e) { if (e.name === 'AbortError') return; }
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name;
  document.body.append(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 4000);
  toast('Archivo descargado: ' + name);
}

// ZIP sin compresión (las fotos ya están comprimidas)
const CRC_T = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
function crc32(u8) { let c = 0xFFFFFFFF; for (let i = 0; i < u8.length; i++) c = CRC_T[(c ^ u8[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }
function makeZip(files) {
  const enc = new TextEncoder(), parts = [], central = [];
  let offset = 0;
  const d = new Date(), dosTime = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1),
    dosDate = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
  for (const f of files) {
    const nm = enc.encode(f.name), crc = crc32(f.data), sz = f.data.length;
    const lh = new DataView(new ArrayBuffer(30));
    lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, 0x0800, true); lh.setUint16(8, 0, true);
    lh.setUint16(10, dosTime, true); lh.setUint16(12, dosDate, true); lh.setUint32(14, crc, true);
    lh.setUint32(18, sz, true); lh.setUint32(22, sz, true); lh.setUint16(26, nm.length, true); lh.setUint16(28, 0, true);
    parts.push(lh.buffer, nm, f.data);
    const ch = new DataView(new ArrayBuffer(46));
    ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true); ch.setUint16(8, 0x0800, true);
    ch.setUint16(10, 0, true); ch.setUint16(12, dosTime, true); ch.setUint16(14, dosDate, true); ch.setUint32(16, crc, true);
    ch.setUint32(20, sz, true); ch.setUint32(24, sz, true); ch.setUint16(28, nm.length, true);
    ch.setUint32(42, offset, true);
    central.push(ch.buffer, nm);
    offset += 30 + nm.length + sz;
  }
  const cSize = central.reduce((s, b) => s + (b.byteLength ?? b.length), 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true);
  end.setUint32(12, cSize, true); end.setUint32(16, offset, true);
  return new Blob([...parts, ...central, end.buffer], { type: 'application/zip' });
}

// ---------- Respaldo ----------
const blobToDataURL = b => new Promise(r => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(b); });
async function backup() {
  toast('Creando respaldo…');
  const photos = [];
  for (const ph of await DB.all('photos')) photos.push({ id: ph.id, pointId: ph.pointId, data: await blobToDataURL(ph.blob) });
  const data = { app: 'MapaPayan', version: 1, created: new Date().toISOString(), settings, tracks, points, photos };
  share('respaldo_mapapayan_' + stamp() + '.json', new Blob([JSON.stringify(data)], { type: 'application/json' }));
}
async function restore(e) {
  const f = e.target.files[0]; e.target.value = ''; if (!f) return;
  try {
    const data = JSON.parse(await f.text());
    if (data.app !== 'MapaPayan') throw new Error('formato');
    if (!confirm(`Restaurar ${data.tracks.length} recorridos y ${data.points.length} puntos? Se combinan con los que ya tienes.`)) return;
    for (const t of data.tracks) await DB.put('tracks', t);
    for (const p of data.points) await DB.put('points', p);
    for (const ph of data.photos) await DB.put('photos', { id: ph.id, pointId: ph.pointId, blob: await (await fetch(ph.data)).blob() });
    await loadAll(); closeSheet(); drawAll(); toast('Respaldo restaurado');
  } catch (err) { toast('Ese archivo no es un respaldo válido de MapaPayán'); }
}
async function wipe() {
  if (!confirm('¿Borrar TODOS los recorridos, puntos y fotos de este teléfono? Haz un respaldo antes.')) return;
  if (!confirm('Esta acción no se puede deshacer. ¿Seguro?')) return;
  await DB.clear('tracks'); await DB.clear('points'); await DB.clear('photos');
  tracks = []; points = []; closeSheet(); drawAll(); toast('Datos borrados');
}

// ---------- Inicio ----------
async function loadAll() {
  tracks = await DB.all('tracks'); points = await DB.all('points');
}
(async function init() {
  try {
    const s = await DB.get('kv', 'settings'); if (s) settings = { ...DEFAULT_SETTINGS, ...s };
    await loadAll(); drawAll();
    if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
    const draft = await DB.get('kv', 'draft');
    if (draft && draft.segments) {
      openSheet(`<h2>Recorrido sin terminar</h2><p class="note">Hay un recorrido de ${fmtDist(draft.distance || 0)} que no se guardó (la app se cerró mientras grababa).</p>
        <div class="row actions"><button class="btn danger" id="dDis">Descartar</button><button class="btn primary" id="dRes">Continuar</button></div>`);
      $('#dRes').onclick = () => { closeSheet(); draft.segments.push([]); startRec(draft); };
      $('#dDis').onclick = () => { closeSheet(); DB.del('kv', 'draft'); };
    }
  } catch (e) { toast('Error abriendo la base de datos local'); console.error(e); }
  startGps();
  const standalone = window.navigator.standalone || matchMedia('(display-mode: standalone)').matches;
  if (!standalone && /iPhone|iPad/.test(navigator.userAgent)) {
    toast('Instálala: botón Compartir › "Agregar a inicio"', 6000);
  }
  if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
})();
