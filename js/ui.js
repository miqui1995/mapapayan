// MandaoYa – utilidades de interfaz, mapa y cálculos
export const CFG = window.MANDAOYA_CONFIG || {};
export const HOME = CFG.center || [1.69684, -78.24514];

export const $ = (s, el = document) => el.querySelector(s);
export const $$ = (s, el = document) => [...el.querySelectorAll(s)];
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const money = n => '$' + Math.round(+n || 0).toLocaleString('es-CO');
export const pad2 = n => String(n).padStart(2, '0');
export const dayKey = (t = Date.now()) => {
  const d = new Date(t); return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
};
export const hhmm = t => t ? new Date(t).toLocaleTimeString('es-CO', { hour: 'numeric', minute: '2-digit' }) : '';
export const fdate = t => t ? new Date(t).toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'short' }) : '';
export const ago = t => {
  const m = Math.round((Date.now() - t) / 60000);
  return m < 1 ? 'ahora' : m < 60 ? `hace ${m} min` : `hace ${Math.floor(m / 60)} h ${m % 60} min`;
};
export function normPhone(p) {
  const d = String(p || '').replace(/\D/g, '');
  if (d.length === 10 && d[0] === '3') return '57' + d;
  return d;
}
export const waLink = (phone, text) => `https://wa.me/${normPhone(phone)}?text=${encodeURIComponent(text || '')}`;
export const telLink = phone => `tel:+${normPhone(phone)}`;
export const shortCode = () => { const a = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; let s = ''; for (const b of crypto.getRandomValues(new Uint8Array(4))) s += a[b % a.length]; return s; };
export const pin4 = () => String(crypto.getRandomValues(new Uint16Array(1))[0] % 10000).padStart(4, '0');

export function haversine(a, b) {
  if (!a || !b) return null;
  const R = 6371000, r = Math.PI / 180;
  const dLat = (b.lat - a.lat) * r, dLon = (b.lng - a.lng) * r;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}
export const fdist = m => m == null ? '' : m >= 1000 ? (m / 1000).toFixed(1) + ' km' : Math.round(m) + ' m';

export const VEHICLES = { moto: ['Moto', 18], carro: ['Carro', 22], bici: ['Bicicleta', 12], pie: ['A pie', 4.5], lancha: ['Lancha', 15] };
// Minutos estimados recorriendo calles (factor 1.4 sobre la línea recta) + margen
export function travelMin(meters, vehicle = 'moto') {
  if (meters == null) return null;
  const kmh = (VEHICLES[vehicle] || VEHICLES.moto)[1];
  return Math.max(1, Math.ceil((meters * 1.4) / (kmh * 1000 / 60) + 1));
}
export function orderEta(o) {
  const v = o.courierVehicle || 'moto';
  if (o.status === 'asignado') {
    const toStore = o.pickup ? haversine(o.courierLoc, o.pickup) : 0;
    const toDest = haversine(o.pickup || o.courierLoc, o.dest);
    if (toStore == null || toDest == null) return null;
    return travelMin(toStore, v) + travelMin(toDest, v);
  }
  if (o.status === 'recogido') return travelMin(haversine(o.courierLoc, o.dest), v);
  return null;
}

export const STATUS = {
  solicitado: ['Esperando a la tienda', '#d97706'],
  preparando: ['Preparando tu pedido', '#2563eb'],
  buscando: ['Buscando domiciliario', '#9333ea'],
  asignado: ['Domiciliario va por tu pedido', '#0891b2'],
  recogido: ['En camino', '#ea580c'],
  entregado: ['Entregado', '#16a34a'],
  cancelado: ['Cancelado', '#dc2626'],
};
export const STEPS = ['solicitado', 'preparando', 'buscando', 'asignado', 'recogido', 'entregado'];
export const PAY = { efectivo: 'Efectivo', nequi: 'Nequi', daviplata: 'Daviplata' };
export const STORE_CATS = {
  tienda: 'Tienda / granero', drogueria: 'Droguería', restaurante: 'Restaurante / asadero', panaderia: 'Panadería',
  carniceria: 'Carnicería / pescadería', licores: 'Licores / bebidas', ferreteria: 'Ferretería', otro: 'Otro',
};

// ---------- toast, hoja modal ----------
let tT;
export function toast(msg, ms = 2800) {
  const t = $('#toast'); t.textContent = msg; t.classList.remove('hidden');
  clearTimeout(tT); tT = setTimeout(() => t.classList.add('hidden'), ms);
}
let sheetClose = null;
export function sheet(html, onClose) {
  $('#sheetBody').onclick = null; // quita el manejador de la hoja anterior
  $('#sheetBody').innerHTML = html; sheetClose = onClose || null;
  $('#sheet').classList.remove('hidden'); $('#sheetBg').classList.remove('hidden'); $('#sheet').scrollTop = 0;
  return $('#sheetBody');
}
export function closeSheet() {
  $('#sheet').classList.add('hidden'); $('#sheetBg').classList.add('hidden');
  const f = sheetClose; sheetClose = null; f && f();
}
document.addEventListener('click', e => { if (e.target.id === 'sheetBg') closeSheet(); });

export function ask(title, msg, okLabel = 'Aceptar', danger = false) {
  return new Promise(res => {
    const b = sheet(`<h2>${esc(title)}</h2>${msg ? `<p class="note">${msg}</p>` : ''}
      <div class="row actions"><button class="btn" data-a="no">Cancelar</button>
      <button class="btn ${danger ? 'danger' : 'primary'}" data-a="ok">${esc(okLabel)}</button></div>`, () => res(false));
    b.onclick = e => { const a = e.target.dataset.a; if (!a) return; sheetClose = null; closeSheet(); res(a === 'ok'); };
  });
}
export function prompt4(title, msg) {
  return new Promise(res => {
    const b = sheet(`<h2>${esc(title)}</h2><p class="note">${msg}</p>
      <input class="in pincode" id="pinIn" inputmode="numeric" maxlength="4" autocomplete="one-time-code" placeholder="0000">
      <div class="row actions"><button class="btn" data-a="no">Cancelar</button><button class="btn primary" data-a="ok">Confirmar</button></div>`, () => res(null));
    setTimeout(() => $('#pinIn').focus(), 100);
    b.onclick = e => { const a = e.target.dataset.a; if (!a) return; const v = $('#pinIn').value.trim(); sheetClose = null; closeSheet(); res(a === 'ok' ? v : null); };
  });
}

// ---------- sonido de alerta (se desbloquea con el primer toque) ----------
let actx;
document.addEventListener('touchend', unlockAudio, { once: true });
document.addEventListener('click', unlockAudio, { once: true });
function unlockAudio() { try { actx = actx || new (window.AudioContext || window.webkitAudioContext)(); actx.resume(); } catch (e) { } }
export function beep(times = 3) {
  try {
    if (!actx) return;
    for (let i = 0; i < times; i++) {
      const o = actx.createOscillator(), g = actx.createGain();
      o.type = 'square'; o.frequency.value = i % 2 ? 880 : 1175;
      g.gain.setValueAtTime(0.0001, actx.currentTime + i * 0.35);
      g.gain.exponentialRampToValueAtTime(0.25, actx.currentTime + i * 0.35 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, actx.currentTime + i * 0.35 + 0.28);
      o.connect(g).connect(actx.destination); o.start(actx.currentTime + i * 0.35); o.stop(actx.currentTime + i * 0.35 + 0.3);
    }
    navigator.vibrate && navigator.vibrate([200, 100, 200]);
  } catch (e) { }
}

// ---------- mapa ----------
export function makeMap(el, center = HOME, zoom = 16) {
  const m = L.map(el, { zoomControl: false, attributionControl: true }).setView(center, zoom);
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' }).addTo(m);
  setTimeout(() => { try { if (m._container && m._container.isConnected) m.invalidateSize(); } catch (e) { } }, 50);
  return m;
}
export const icon = (emoji, cls = '') => L.divIcon({ className: '', html: `<div class="pin ${cls}">${emoji}</div>`, iconSize: [36, 36], iconAnchor: [18, 18] });
export const ICONS = {
  store: () => icon('🏪', 'p-store'), dest: () => icon('🏠', 'p-dest'), courier: () => icon('🛵', 'p-courier'), me: () => icon('📍', 'p-me'),
};
export function fitTo(map, pts) {
  const p = pts.filter(Boolean).map(x => [x.lat, x.lng]);
  try {
    if (p.length === 1) map.setView(p[0], 17, { animate: false });
    else if (p.length > 1) map.fitBounds(p, { padding: [40, 40], maxZoom: 18, animate: false });
  } catch (e) { }
}

export function getGPS(timeout = 12000) {
  return new Promise((res, rej) => {
    if (!navigator.geolocation) return rej(new Error('sin GPS'));
    navigator.geolocation.getCurrentPosition(p => res({ lat: +p.coords.latitude.toFixed(6), lng: +p.coords.longitude.toFixed(6), acc: Math.round(p.coords.accuracy) }),
      e => rej(e), { enableHighAccuracy: true, timeout, maximumAge: 15000 });
  });
}

// Selector de ubicación: mapa con mira central
export function pickLocation(title = 'Ubicación', start) {
  return new Promise(res => {
    const b = sheet(`<h2>${esc(title)}</h2>
      <p class="note">Mueve el mapa hasta que la mira quede sobre la puerta.</p>
      <div class="pickWrap"><div id="pickMap"></div><div class="cross"></div></div>
      <div class="row" style="margin-top:10px"><button class="btn" id="pkGps">📍 Usar mi ubicación</button></div>
      <div class="row actions"><button class="btn" id="pkNo">Cancelar</button><button class="btn primary" id="pkOk">Confirmar aquí</button></div>`, () => { m.remove(); res(null); });
    const m = makeMap($('#pickMap', b), start ? [start.lat, start.lng] : HOME, start ? 18 : 17);
    const gps = async () => {
      $('#pkGps').textContent = 'Buscando GPS…';
      try { const g = await getGPS(); m.setView([g.lat, g.lng], 18); $('#pkGps').textContent = `📍 Ubicado (±${g.acc} m)`; }
      catch (e) { $('#pkGps').textContent = '📍 Usar mi ubicación'; toast('No se pudo obtener el GPS. Ubica el punto moviendo el mapa.'); }
    };
    $('#pkGps').onclick = gps;
    if (!start) gps();
    $('#pkNo').onclick = () => closeSheet();
    $('#pkOk').onclick = () => { const c = m.getCenter(); sheetClose = null; closeSheet(); m.remove(); res({ lat: +c.lat.toFixed(6), lng: +c.lng.toFixed(6) }); };
  });
}

// Mantener pantalla encendida
let wl = null;
export async function keepAwake(on) {
  try {
    if (on && !wl && 'wakeLock' in navigator) { wl = await navigator.wakeLock.request('screen'); wl.addEventListener('release', () => { wl = null; }); }
    if (!on && wl) { await wl.release(); wl = null; }
  } catch (e) { }
}

export function statusBadge(s) { const [l, c] = STATUS[s] || [s, '#64748b']; return `<span class="badge" style="background:${c}">${esc(l)}</span>`; }
export function stepper(s) {
  if (s === 'cancelado') return `<div class="stepper"><div class="st cur" style="--c:#dc2626">Cancelado</div></div>`;
  const i = s === 'entregado' ? STEPS.length : STEPS.indexOf(s);
  return `<div class="stepper">${STEPS.slice(1).map((k, j) => `<div class="st ${j + 1 < i ? 'done' : j + 1 === i ? 'cur' : ''}"></div>`).join('')}</div>
    <div class="stLabel">${esc(STATUS[s][0])}</div>`;
}
export function trackUrl(id) { return location.origin + location.pathname + '#/seguir/' + id; }
