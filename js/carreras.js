// MandaoYa – CARRERAS estilo inDrive
// El pasajero propone un precio, los conductores en línea aceptan o hacen contraoferta,
// y el pasajero elige. Al iniciar el viaje se descuenta la comisión del saldo del conductor.
import { $, esc, money, toast, ask, sheet, closeSheet, pickLocation, getGPS, haversine, fdist, travelMin, makeMap, icon, fitTo,
  beep, waLink, telLink, dayKey, ago, hhmm, shortCode, PAY } from './ui.js';
import { prepaidOn, topupSheet } from './recargas.js';

export const RIDE_VEH = { moto: ['Moto', '🏍️', 1, 22], carro: ['Carro', '🚗', 4, 25], lancha: ['Lancha', '🚤', 8, 15] }; // nombre, ícono, cupos, km/h
const DEF_TARIFF = { moto: { base: 2000, perKm: 1000, min: 3000 }, carro: { base: 4000, perKm: 1800, min: 6000 }, lancha: { base: 5000, perKm: 3000, min: 10000 } };
export const RSTATUS = {
  buscando: ['Buscando conductor', '#9333ea'], asignada: ['Conductor en camino', '#0891b2'], llego: ['Tu conductor llegó', '#d97706'],
  en_curso: ['En viaje', '#ea580c'], finalizada: ['Viaje terminado', '#16a34a'], cancelada: ['Cancelada', '#dc2626'],
};
export const rideFee = ctx => +(ctx.settings?.rideFee ?? 500);
export const ridesOn = ctx => ctx.settings?.ridesEnabled !== false;
const tariffs = ctx => ({ ...DEF_TARIFF, ...(ctx.settings?.rideTariffs || {}) });
const enabledVeh = ctx => Object.keys(RIDE_VEH).filter(v => tariffs(ctx)[v]?.enabled !== false);
const tripMeters = (a, b, veh) => { const d = haversine(a, b); return d == null ? null : d * (veh === 'lancha' ? 1.2 : 1.35); };
export function suggestPrice(ctx, veh, meters) {
  const t = tariffs(ctx)[veh] || DEF_TARIFF.moto;
  const p = Math.max(t.min, t.base + t.perKm * (meters || 0) / 1000);
  return Math.ceil(p / 500) * 500;
}
const minutes = (m, veh) => m == null ? null : Math.max(1, Math.ceil(m / ((RIDE_VEH[veh]?.[3] || 20) * 1000 / 60)) + 1);
const rbadge = s => { const [l, c] = RSTATUS[s] || [s, '#64748b']; return `<span class="badge" style="background:${c}">${esc(l)}</span>`; };
const vIcon = v => icon(RIDE_VEH[v]?.[1] || '🏍️', 'p-courier');
export const rideUrl = id => location.origin + location.pathname + '#/carrera/' + id;

// ================= PASAJERO: pedir una carrera =================
export function mountClientRide(body, ctx) {
  const { db } = ctx;
  let mine = [], veh = enabledVeh(ctx)[0] || 'moto', origin = null, dest = null, pay = 'efectivo', price = 0, touched = false;
  const unsub = db.watch('rides', [['clientUid', '==', db.uid]], r => { mine = r.sort((a, b) => b.createdAt - a.createdAt); drawHead(); });
  body.innerHTML = `<div id="rHead"></div><div id="rForm"></div><div id="rHist"></div>`;

  function drawHead() {
    const act = mine.find(r => r.active);
    $('#rHead', body).innerHTML = act ? `<button class="card active-banner" data-go-ride="${act.id}"><b>Tienes una carrera en curso</b><small>${esc(RSTATUS[act.status][0])} · toca para verla</small></button>` : '';
    $('#rHist', body).innerHTML = mine.filter(r => !r.active).length ? `<h3>Mis carreras</h3>${mine.filter(r => !r.active).slice(0, 10).map(r => `<button class="card order" data-go-ride="${r.id}">
      <div class="rowb"><b>${RIDE_VEH[r.vehicle]?.[1] || ''} ${esc(r.dest?.ref || 'Destino')}</b>${rbadge(r.status)}</div>
      <small>${ago(r.createdAt)} · ${money(r.price || r.offer)}${r.driverName ? ' · ' + esc(r.driverName) : ''}</small></button>`).join('')}` : '';
  }

  function drawForm() {
    const meters = origin && dest ? tripMeters(origin, dest, veh) : null;
    const sug = suggestPrice(ctx, veh, meters), t = tariffs(ctx)[veh];
    if (!touched) price = sug;
    $('#rForm', body).innerHTML = `<h2>Pedir una carrera</h2>
      <div class="seg" id="rVeh">${enabledVeh(ctx).map(v => `<button data-v="${v}" class="${v === veh ? 'on' : ''}">${RIDE_VEH[v][1]} ${RIDE_VEH[v][0]}</button>`).join('')}</div>
      <label class="f">¿Dónde te recogen?</label>
      <button class="btn block" id="rOri">${origin ? '✅ Punto de recogida marcado (cambiar)' : '📍 Usar mi ubicación'}</button>
      <input class="in" id="rOriRef" placeholder="Referencia: ej. frente a la iglesia" value="${esc(origin?.ref || '')}" style="margin-top:8px">
      <label class="f">¿A dónde vas?</label>
      <button class="btn block" id="rDst">${dest ? '✅ Destino marcado (cambiar)' : '🏁 Marcar destino en el mapa'}</button>
      <input class="in" id="rDstRef" placeholder="Referencia del destino" value="${esc(dest?.ref || '')}" style="margin-top:8px">
      <label class="f">Pasajeros</label>
      <div class="seg" id="rPax">${Array.from({ length: Math.min(4, RIDE_VEH[veh][2]) }, (_, i) => `<button data-n="${i + 1}" class="${i === 0 ? 'on' : ''}">${i + 1}</button>`).join('')}</div>
      <label class="f">Tu oferta ${meters ? `· ${fdist(meters)}, ~${minutes(meters, veh)} min` : ''}</label>
      <div class="offer"><button class="btn" data-adj="-500">−</button><b id="rPrice">${money(price)}</b><button class="btn" data-adj="500">+</button></div>
      <p class="note center">Precio sugerido ${money(sug)} · mínimo ${money(t.min)}. Ofrecer un poco más consigue conductor más rápido.</p>
      <label class="f">Pago</label>
      <div class="seg" id="rPay">${Object.entries(PAY).map(([k, v]) => `<button data-p="${k}" class="${k === pay ? 'on' : ''}">${v}</button>`).join('')}</div>
      <label class="f">Comentario (opcional)</label><input class="in" id="rNote" placeholder="Ej: llevo una maleta">
      <button class="btn primary block big" id="rGo">Buscar conductor</button>`;
    let pax = 1;
    $('#rVeh', body).onclick = e => { const b = e.target.closest('[data-v]'); if (!b) return; veh = b.dataset.v; touched = false; drawForm(); };
    $('#rPax', body).onclick = e => { const b = e.target.closest('[data-n]'); if (!b) return; pax = +b.dataset.n; $('#rPax', body).querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b)); };
    $('#rPay', body).onclick = e => { const b = e.target.closest('[data-p]'); if (!b) return; pay = b.dataset.p; $('#rPay', body).querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b)); };
    body.querySelectorAll('[data-adj]').forEach(b => b.onclick = () => { touched = true; price = Math.max(t.min, price + +b.dataset.adj); $('#rPrice', body).textContent = money(price); });
    $('#rOri', body).onclick = async () => { const l = await pickLocation('¿Dónde te recogen?', origin); if (l) { origin = { ...l, ref: $('#rOriRef').value.trim() }; drawForm(); } };
    $('#rDst', body).onclick = async () => { const l = await pickLocation('¿A dónde vas?', dest || origin); if (l) { dest = { ...l, ref: $('#rDstRef').value.trim() }; origin && (origin.ref = $('#rOriRef').value.trim()); drawForm(); } };
    $('#rGo', body).onclick = async () => {
      if (mine.some(r => r.active)) return toast('Ya tienes una carrera en curso');
      if (!origin) return toast('Marca dónde te recogen');
      if (!dest) return toast('Marca a dónde vas');
      const m = tripMeters(origin, dest, veh), now = Date.now();
      const r = {
        code: shortCode(), clientUid: db.uid, clientName: ctx.me.name, clientPhone: ctx.me.phone,
        origin: { lat: origin.lat, lng: origin.lng, ref: $('#rOriRef').value.trim() }, dest: { lat: dest.lat, lng: dest.lng, ref: $('#rDstRef').value.trim() },
        distanceM: Math.round(m), vehicle: veh, passengers: pax, offer: price, suggested: suggestPrice(ctx, veh, m), pay, note: $('#rNote').value.trim(),
        status: 'buscando', active: true, day: dayKey(now), createdAt: now, times: { buscando: now }, offers: {}, driverUid: null,
      };
      $('#rGo', body).disabled = true;
      try { const id = await db.add('rides', r); location.hash = '#/carrera/' + id; }
      catch (e) { $('#rGo', body).disabled = false; toast('No se pudo pedir: ' + (e.message || e)); }
    };
  }

  // ubicación inicial automática
  getGPS().then(g => { if (!origin) { origin = { ...g, ref: '' }; drawForm(); } }).catch(() => { });
  drawForm();
  const onClick = e => { const g = e.target.closest('[data-go-ride]'); if (g) location.hash = '#/carrera/' + g.dataset.goRide; };
  body.addEventListener('click', onClick);
  return () => { unsub(); body.removeEventListener('click', onClick); };
}

// ================= SEGUIMIENTO (pasajero o quien tenga el enlace) =================
export function mountRideTrack(root, ctx, id) {
  const { db } = ctx;
  let r = null, map = null, mk = {}, lastStatus = null, lastOffers = 0, fitted = false;
  root.innerHTML = `<div class="pad"><button class="link" id="rtBack">‹ Volver</button><div id="rtTop"></div></div><div id="rtMap" class="map tall"></div><div class="pad" id="rtInfo"></div>`;
  $('#rtBack', root).onclick = () => { location.hash = ''; };
  map = makeMap($('#rtMap', root));
  const unsub = db.watchDoc('rides', id, d => {
    r = d;
    if (!r) { $('#rtTop', root).innerHTML = '<h2>Carrera no encontrada</h2>'; return; }
    const nOff = Object.keys(r.offers || {}).length;
    if (lastStatus && lastStatus !== r.status) { beep(2); toast(RSTATUS[r.status][0]); }
    if (lastStatus === 'buscando' && r.status === 'buscando' && nOff > lastOffers) { beep(1); toast('Nueva oferta de conductor'); }
    const changed = lastStatus !== r.status; lastStatus = r.status; lastOffers = nOff;
    draw(); drawMap(changed);
  });
  const tick = setInterval(() => r && r.status === 'buscando' && draw(), 30000);

  function drawMap(refit) {
    const set = (k, p, ic) => { if (!p?.lat) { mk[k]?.remove(); delete mk[k]; return; } mk[k] ? mk[k].setLatLng([p.lat, p.lng]) : (mk[k] = L.marker([p.lat, p.lng], { icon: ic }).addTo(map)); };
    set('o', r.origin, icon('🙋', 'p-store')); set('d', r.dest, icon('🏁', 'p-dest'));
    const showD = ['asignada', 'llego', 'en_curso'].includes(r.status) && r.driverLoc;
    set('drv', showD ? r.driverLoc : null, vIcon(r.vehicle));
    if (!mk.line && r.origin?.lat && r.dest?.lat) mk.line = L.polyline([[r.origin.lat, r.origin.lng], [r.dest.lat, r.dest.lng]], { color: '#ea580c', weight: 3, dashArray: '6 8' }).addTo(map);
    if (!fitted || refit) { fitTo(map, [r.origin, r.dest, showD ? r.driverLoc : null].filter(p => p?.lat)); fitted = true; }
  }

  function draw() {
    const isClient = db.uid && r.clientUid === db.uid;
    const offers = Object.entries(r.offers || {}).map(([uid, o]) => ({ uid, ...o })).sort((a, b) => a.price - b.price);
    let eta = null;
    if (r.status === 'asignada' && r.driverLoc) eta = minutes(tripMeters(r.driverLoc, r.origin, r.vehicle), r.vehicle);
    if (r.status === 'en_curso' && r.driverLoc) eta = minutes(tripMeters(r.driverLoc, r.dest, r.vehicle), r.vehicle);
    $('#rtTop', root).innerHTML = `<div class="rowb"><h2>${RIDE_VEH[r.vehicle]?.[1] || ''} Carrera <small>#${esc(r.code)}</small></h2>${rbadge(r.status)}</div>
      ${eta ? `<div class="eta"><b>${eta} min</b><span>${r.status === 'asignada' ? 'para recogerte' : 'para llegar'} · ${hhmm(Date.now() + eta * 60000)}</span></div>` : ''}
      <small class="note">${esc(r.origin?.ref || 'Recogida')} → ${esc(r.dest?.ref || 'Destino')} · ${fdist(r.distanceM)}</small>`;
    let html = '';
    if (r.status === 'buscando') {
      html += `<div class="card"><div class="rowb"><span>Tu oferta</span><b class="big">${money(r.offer)}</b></div>
        ${isClient ? `<div class="row"><button class="btn" data-ra="raise">Subir $500</button><button class="btn danger" data-ra="cancel">Cancelar</button></div>` : ''}</div>
        <h3>Ofertas de conductores (${offers.length})</h3>
        ${offers.length ? offers.map(o => `<div class="card offerCard"><div class="rowb"><b>${RIDE_VEH[o.vehicle]?.[1] || ''} ${esc(o.name)}</b><b class="earn">${money(o.price)}</b></div>
          <small>${esc(RIDE_VEH[o.vehicle]?.[0] || '')}${o.plate ? ' · ' + esc(o.plate) : ''}${o.loc && r.origin ? ` · a ${fdist(haversine(o.loc, r.origin))} (~${minutes(tripMeters(o.loc, r.origin, r.vehicle), r.vehicle)} min)` : ''}${o.rating ? ` · ${o.rating.toFixed(1)}★` : ''}</small>
          ${isClient ? `<button class="btn primary block" data-ra="pick" data-uid="${o.uid}">Aceptar a ${esc(o.name)} por ${money(o.price)}</button>` : ''}</div>`).join('')
          : `<div class="empty"><div class="bigicon">⏳</div><p>Esperando ofertas…</p><p class="note">Los conductores cercanos ya vieron tu solicitud ${ago(r.createdAt)}.</p></div>`}`;
    } else if (r.driverName) {
      html += `<div class="card courier"><span class="ci">${RIDE_VEH[r.vehicle]?.[1] || '🏍️'}</span><div><b>${esc(r.driverName)}</b><small>${esc(RIDE_VEH[r.driverVehicle || r.vehicle]?.[0] || '')}${r.driverPlate ? ' · placa ' + esc(r.driverPlate) : ''}</small></div>
        ${r.active ? `<div class="row tight"><a class="btn small" href="${telLink(r.driverPhone)}">Llamar</a><a class="btn small" target="_blank" href="${waLink(r.driverPhone, `Hola ${r.driverName}, soy ${r.clientName}, de la carrera #${r.code}`)}">WhatsApp</a></div>` : ''}</div>
        <div class="card sum"><div class="rowb total"><span>Precio acordado · ${PAY[r.pay]}</span><b>${money(r.price)}</b></div>
        ${r.pay !== 'efectivo' ? '<p class="note">Paga al conductor por ' + PAY[r.pay] + ' al terminar el viaje.</p>' : ''}</div>`;
      if (r.status === 'llego') html += `<div class="warn">Tu conductor te está esperando en el punto de recogida.</div>`;
      if (r.active) html += `<div class="row"><button class="btn" data-ra="share">Compartir mi viaje</button><button class="btn danger" data-ra="sos">Emergencia</button></div>
        ${isClient && ['asignada', 'llego'].includes(r.status) ? '<button class="btn block" data-ra="cancel">Cancelar carrera</button>' : ''}`;
      if (r.status === 'finalizada' && isClient && !r.rating) html += `<div class="card center"><b>¿Cómo te fue con ${esc(r.driverName)}?</b><div class="stars">${[1, 2, 3, 4, 5].map(n => `<button data-ra="rate" data-n="${n}">★</button>`).join('')}</div></div>`;
      if (r.rating) html += `<p class="note center">Calificaste el viaje con ${'★'.repeat(r.rating)}</p>`;
    }
    if (r.status === 'cancelada') html += `<p class="note">Motivo: ${esc(r.cancelReason || '—')}</p><button class="btn primary block" data-ra="again">Pedir otra carrera</button>`;
    $('#rtInfo', root).innerHTML = html;
  }

  root.onclick = async e => {
    const b = e.target.closest('[data-ra]'); if (!b || !r) return;
    const a = b.dataset.ra, now = Date.now();
    try {
      if (a === 'raise') await db.update('rides', id, { offer: r.offer + 500 });
      if (a === 'pick') {
        const o = r.offers[b.dataset.uid];
        await db.update('rides', id, { status: 'asignada', driverUid: b.dataset.uid, driverName: o.name, driverPhone: o.phone, driverVehicle: o.vehicle,
          driverPlate: o.plate || '', driverLoc: o.loc || null, price: o.price, 'times.asignada': now });
      }
      if (a === 'cancel' && await ask('¿Cancelar la carrera?', r.status === 'buscando' ? '' : 'Avísale también al conductor.', 'Cancelar', true))
        await db.update('rides', id, { status: 'cancelada', active: false, cancelReason: 'Cancelada por el pasajero', cancelBy: 'cliente', 'times.cancelada': now });
      if (a === 'rate') await db.update('rides', id, { rating: +b.dataset.n });
      if (a === 'share') {
        const txt = `Voy en una carrera de MandaoYa con ${r.driverName} (${RIDE_VEH[r.vehicle]?.[0]}${r.driverPlate ? ', placa ' + r.driverPlate : ''}). Sígueme aquí: ${rideUrl(id)}`;
        if (navigator.share) navigator.share({ text: txt }).catch(() => { }); else window.open(waLink('', txt), '_blank');
      }
      if (a === 'sos') {
        const s = sheet(`<h2>Emergencia</h2><p class="note">Usa esto solo si estás en peligro.</p>
          <a class="btn danger block" href="tel:123">Llamar a la línea 123</a>
          ${ctx.settings.adminWhatsApp ? `<a class="btn block" target="_blank" href="${waLink(ctx.settings.adminWhatsApp, `EMERGENCIA en la carrera #${r.code} con ${r.driverName}. Ubicación del viaje: ${rideUrl(id)}`)}">Avisar al administrador de MandaoYa</a>` : ''}
          <button class="btn block" id="sosNo">Cerrar</button>`);
        $('#sosNo', s).onclick = closeSheet;
      }
      if (a === 'again') { sessionStorage.setItem('mandaoya_tab', 'carrera'); location.hash = ''; }
    } catch (err) { toast('Error: ' + (err.message || err)); }
  };
  return () => { unsub(); clearInterval(tick); map && map.remove(); root.onclick = null; };
}

// ================= CONDUCTOR (domiciliario que también hace carreras) =================
export function mountDriverRides(body, ctx, { getLoc, isOnline, balance }) {
  const { db } = ctx;
  let reqs = [], mine = [], seen = null, map = null, mk = {}, shownKey = '';
  const veh = () => ctx.me.rideVehicle || (RIDE_VEH[ctx.me.vehicle] ? ctx.me.vehicle : 'moto');
  const u1 = db.watch('rides', [['status', '==', 'buscando']], r => {
    reqs = r.filter(x => x.vehicle === veh());
    const fresh = seen && ctx.me.rides && isOnline() && reqs.some(x => !seen.has(x.id));
    if (fresh) { beep(3); toast('Nueva solicitud de carrera'); }
    seen = new Set(reqs.map(x => x.id));
    draw();
  });
  const u2 = db.watch('rides', [['driverUid', '==', db.uid], ['active', '==', true]], r => {
    const had = mine.length; mine = r;
    if (mine.length > had) { beep(4); toast('¡Te eligieron para una carrera!'); }
    draw();
  });

  function draw() {
    const act = mine[0];
    if (!ctx.me.rides) {
      if (map) { map.remove(); map = null; mk = {}; shownKey = ''; }
      body.innerHTML = `<div class="card"><h2>¿También haces carreras?</h2><p class="note">Lleva pasajeros en tu vehículo cuando estés en línea. El pasajero propone el precio y tú aceptas o haces una contraoferta. MandaoYa cobra ${money(rideFee(ctx))} de tu saldo por cada viaje que inicias.</p>
        <label class="f">Vehículo para carreras</label><div class="seg" id="dvVeh">${Object.entries(RIDE_VEH).map(([k, v]) => `<button data-v="${k}" class="${k === veh() ? 'on' : ''}">${v[1]} ${v[0]}</button>`).join('')}</div>
        <label class="check"><input type="checkbox" id="dvOk"> Tengo mis documentos al día (licencia, SOAT y los permisos que exija el municipio) y casco para el pasajero si voy en moto.</label>
        <button class="btn primary block" id="dvOn">Activar carreras</button></div>`;
      let v = veh();
      $('#dvVeh', body).onclick = e => { const b = e.target.closest('[data-v]'); if (!b) return; v = b.dataset.v; $('#dvVeh', body).querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b)); };
      $('#dvOn', body).onclick = async () => { if (!$('#dvOk').checked) return toast('Confirma que tienes tus documentos al día'); await db.update('users', db.uid, { rides: true, rideVehicle: v }); ctx.me.rides = true; ctx.me.rideVehicle = v; draw(); };
      return;
    }
    if (act) return drawActive(act);
    if (map) { map.remove(); map = null; mk = {}; shownKey = ''; }
    if (!isOnline()) { body.innerHTML = `<div class="empty"><div class="bigicon">${RIDE_VEH[veh()][1]}</div><p>Ponte en línea para ver solicitudes de carrera.</p></div>`; return; }
    const me = getLoc(), radius = (ctx.settings.rideRadiusKm || 5) * 1000, fee = rideFee(ctx);
    const near = reqs.filter(x => !me || !x.origin?.lat || haversine(me, x.origin) <= radius).sort((a, b) => a.createdAt - b.createdAt);
    const noBal = prepaidOn(ctx) && balance() < fee;
    body.innerHTML = `<div class="rowb"><h2>Carreras ${RIDE_VEH[veh()][1]}</h2><button class="link" id="dvOff">Dejar de hacer carreras</button></div>
      ${noBal ? `<div class="card balance empty"><b>Sin saldo para carreras</b><small>Cada viaje descuenta ${money(fee)} al iniciarlo.</small><button class="btn primary block" data-dv="topup">Recargar saldo</button></div>` : ''}
      ${near.length ? near.map(x => {
        const my = x.offers?.[db.uid];
        return `<div class="card order" data-rid="${x.id}">
          <div class="rowb"><b>${esc(x.clientName)} · ${x.passengers} pasajero(s)</b><b class="earn">${money(x.offer)}</b></div>
          <small>Recoger: ${esc(x.origin?.ref || 'ver mapa')}${me && x.origin?.lat ? ` · a ${fdist(haversine(me, x.origin))} de ti` : ''}</small>
          <small>Destino: ${esc(x.dest?.ref || 'ver mapa')} · viaje de ${fdist(x.distanceM)} (~${minutes(x.distanceM, x.vehicle)} min)</small>
          <small>${PAY[x.pay]} · sugerido ${money(x.suggested)} · ${ago(x.createdAt)}${x.note ? ' · ' + esc(x.note) : ''}</small>
          ${my ? `<div class="warn">Ofreciste ${money(my.price)}. Esperando que el pasajero elija.</div>` : noBal ? '' : `
            <button class="btn primary block" data-dv="offer" data-p="${x.offer}">Aceptar por ${money(x.offer)}</button>
            <div class="row"><button class="btn small" data-dv="offer" data-p="${x.offer + 500}">${money(x.offer + 500)}</button><button class="btn small" data-dv="offer" data-p="${x.offer + 1000}">${money(x.offer + 1000)}</button><button class="btn small" data-dv="offer" data-p="${x.offer + 2000}">${money(x.offer + 2000)}</button></div>`}
        </div>`;
      }).join('') : `<div class="empty"><div class="bigicon">⏳</div><p>No hay solicitudes cerca.</p><p class="note">Te sonará una alerta cuando alguien pida una carrera.</p></div>`}`;
  }

  function drawActive(x) {
    const key = x.id + x.status;
    if (map && shownKey === key) { mk.me && getLoc() && mk.me.setLatLng([getLoc().lat, getLoc().lng]); return; }
    if (map) { map.remove(); map = null; mk = {}; }
    shownKey = key;
    const next = ['asignada', 'llego'].includes(x.status) ? x.origin : x.dest;
    body.innerHTML = `<div class="rowb"><h2>Carrera #${esc(x.code)}</h2>${rbadge(x.status)}</div>
      <div id="dvMap" class="map mid"></div>
      <div class="card"><small class="lbl">${['asignada', 'llego'].includes(x.status) ? '1. Recoger a' : '2. Llevar a'}</small>
        <b>${esc(x.clientName)} · ${x.passengers} pasajero(s)</b>
        <small>${['asignada', 'llego'].includes(x.status) ? esc(x.origin?.ref || '') : 'Destino: ' + esc(x.dest?.ref || '')}</small>
        <div class="row"><a class="btn" href="${telLink(x.clientPhone)}">Llamar</a><a class="btn" target="_blank" href="${waLink(x.clientPhone, `Hola ${x.clientName}, soy ${ctx.me.name}, tu conductor de MandaoYa.`)}">WhatsApp</a></div>
        ${next?.lat ? `<a class="btn block" target="_blank" href="https://www.google.com/maps/dir/?api=1&destination=${next.lat},${next.lng}">Abrir ruta en Google Maps</a>` : ''}</div>
      <div class="card sum"><div class="rowb total"><span>Cobrar · ${PAY[x.pay]}</span><b>${money(x.price)}</b></div>${x.note ? `<small>Nota: ${esc(x.note)}</small>` : ''}</div>
      ${x.status === 'asignada' ? '<button class="btn primary block big" data-dv="arrived">Llegué al punto de recogida</button>' : ''}
      ${x.status === 'llego' ? `<button class="btn primary block big" data-dv="start">Iniciar viaje${prepaidOn(ctx) ? ` (se descuentan ${money(rideFee(ctx))})` : ''}</button>` : ''}
      ${x.status === 'en_curso' ? '<button class="btn primary block big" data-dv="finish">Terminar viaje</button>' : ''}
      ${['asignada', 'llego'].includes(x.status) ? '<button class="btn block danger" data-dv="cancel">Cancelar carrera</button>' : ''}`;
    map = makeMap($('#dvMap', body));
    if (x.origin?.lat) mk.o = L.marker([x.origin.lat, x.origin.lng], { icon: icon('🙋', 'p-store') }).addTo(map);
    if (x.dest?.lat) mk.d = L.marker([x.dest.lat, x.dest.lng], { icon: icon('🏁', 'p-dest') }).addTo(map);
    const me = getLoc(); if (me) mk.me = L.marker([me.lat, me.lng], { icon: vIcon(x.vehicle) }).addTo(map);
    fitTo(map, [x.origin, x.dest, me].filter(p => p?.lat));
  }

  async function onClick(e) {
    if (e.target.closest('#dvOff')) { await db.update('users', db.uid, { rides: false }); ctx.me.rides = false; draw(); return; }
    const b = e.target.closest('[data-dv]'); if (!b) return;
    const a = b.dataset.dv, now = Date.now(), x = mine[0];
    try {
      if (a === 'topup') return topupSheet(ctx);
      if (a === 'offer') {
        const id = e.target.closest('[data-rid]').dataset.rid;
        if (mine.length) return toast('Termina tu carrera actual primero');
        await db.update('rides', id, { ['offers.' + db.uid]: { name: ctx.me.name, phone: ctx.me.phone, vehicle: veh(), plate: ctx.me.plate || '', price: +b.dataset.p, loc: getLoc() || null, at: now } });
        toast('Oferta enviada. Si el pasajero te elige, te avisamos.');
      }
      if (a === 'arrived') await db.update('rides', x.id, { status: 'llego', driverLoc: getLoc() || x.driverLoc || null, 'times.llego': now });
      if (a === 'start') {
        const fee = rideFee(ctx), pre = prepaidOn(ctx);
        await db.runTx(async t => {
          const cur = await t.get('rides', x.id); if (!cur || cur.status !== 'llego' || cur.driverUid !== db.uid) throw new Error('La carrera cambió');
          const patch = { status: 'en_curso', 'times.en_curso': now };
          if (pre) {
            const u = await t.get('users', db.uid); const b0 = u?.balance || 0;
            if (b0 < fee) throw new Error('SALDO');
            t.update('users', db.uid, { balance: b0 - fee });
            t.set('movements', db.newId(), { courierUid: db.uid, type: 'comision', amount: -fee, rideId: x.id, orderCode: 'C-' + cur.code, balanceAfter: b0 - fee, at: now });
            patch.feeCharged = fee;
          }
          t.update('rides', x.id, patch);
        });
      }
      if (a === 'finish' && await ask('¿Terminar el viaje?', `Cobra ${money(x.price)} ${x.pay === 'efectivo' ? 'en efectivo' : 'por ' + PAY[x.pay]}.`, 'Terminar'))
        await db.update('rides', x.id, { status: 'finalizada', active: false, 'times.finalizada': now });
      if (a === 'cancel') {
        const reason = await new Promise(res => {
          const s = sheet(`<h2>¿Por qué cancelas?</h2>${['El pasajero no aparece', 'Problema con el vehículo', 'El pasajero pidió cancelar', 'Zona insegura'].map(t => `<button class="btn block" data-r="${t}">${t}</button>`).join('')}<button class="btn block" data-r="">Volver</button>`, () => res(null));
          s.onclick = ev => { const c = ev.target.closest('[data-r]'); if (!c) return; closeSheet(); res(c.dataset.r || null); };
        });
        if (reason) await db.update('rides', x.id, { status: 'cancelada', active: false, cancelReason: reason, cancelBy: 'conductor', 'times.cancelada': now });
      }
    } catch (err) {
      if (/SALDO/.test(err.message || err)) { toast('No tienes saldo suficiente'); topupSheet(ctx); }
      else toast('Error: ' + (err.message || err));
    }
  }
  body.addEventListener('click', onClick);
  draw();
  return {
    stop: () => { u1(); u2(); body.removeEventListener('click', onClick); if (map) map.remove(); },
    redraw: draw,
    activeRides: () => mine,
  };
}

// Devolver la comisión de una carrera cancelada por el admin después de iniciada
export async function refundRideFee(ctx, ride) {
  if (!ride.feeCharged || ride.feeRefunded || !ride.driverUid) return;
  const { db } = ctx, now = Date.now();
  await db.runTx(async t => {
    const u = await t.get('users', ride.driverUid); if (!u) return;
    const bal = (u.balance || 0) + ride.feeCharged;
    t.update('users', ride.driverUid, { balance: bal });
    t.update('rides', ride.id, { feeRefunded: true });
    t.set('movements', db.newId(), { courierUid: ride.driverUid, type: 'devolucion', amount: ride.feeCharged, rideId: ride.id, orderCode: 'C-' + ride.code, balanceAfter: bal, by: db.uid, at: now });
  });
}
