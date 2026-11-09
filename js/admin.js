// MandaoYa – interfaz del ADMINISTRADOR
import { mountTopupReview, adjustBalance, refundFee, courierFee } from './recargas.js';
import { RIDE_VEH, RSTATUS, refundRideFee } from './carreras.js';
import { beep } from './ui.js';
import { $, esc, money, toast, ask, sheet, closeSheet, PAY, STATUS, statusBadge, dayKey, ago, hhmm, waLink, telLink, makeMap, ICONS, fitTo,
  VEHICLES, STORE_CATS, HOME } from './ui.js';

export function mount(root, ctx) {
  const { db } = ctx;
  let invites = [], trialStats = {}, saldosStop = null;
  let tab = 'vivo', active = [], pending = [], users = [], stores = [], dayOrders = [], day = dayKey(), map = null, layer = null, unsubDay = null;
  root.innerHTML = `<div class="tabs scroll"><button data-t="vivo" class="on">En vivo <span id="aCnt" class="cnt hidden"></span></button><button data-t="aprob">Aprobar <span id="aPend" class="cnt hidden"></span></button><button data-t="gente">Gente</button><button data-t="saldos">Saldos <span id="aTop" class="cnt hidden"></span></button><button data-t="tarifas">Tarifas</button><button data-t="rep">Reportes</button></div>
    <div id="aBody"></div>`;
  const body = $('#aBody', root);
  root.querySelector('.tabs').onclick = e => { const b = e.target.closest('[data-t]'); if (b) setTab(b.dataset.t); };
  function setTab(t) {
    tab = t; root.querySelectorAll('.tabs button').forEach(x => x.classList.toggle('on', x.dataset.t === t));
    if (saldosStop) { saldosStop(); saldosStop = null; }
    if (map) { map.remove(); map = null; layer = null; }
    render();
  }

  let activeRides = [], dayRides = [], unsubDayR = null;
  const u8 = db.watch('rides', [['active', '==', true]], r => { activeRides = r.sort((a, b) => a.createdAt - b.createdAt); if (tab === 'vivo') renderVivo(true); });
  const u1 = db.watch('orders', [['active', '==', true]], o => {
    active = o.sort((a, b) => a.createdAt - b.createdAt);
    $('#aCnt', root).textContent = active.length; $('#aCnt', root).classList.toggle('hidden', !active.length);
    if (tab === 'vivo') renderVivo(true);
  });
  const u2 = db.watch('users', [], u => {
    users = u; pending = u.filter(x => !x.approved && x.role !== 'cliente' && !x.rejected);
    $('#aPend', root).textContent = pending.length; $('#aPend', root).classList.toggle('hidden', !pending.length);
    if (tab === 'aprob' || tab === 'gente') render();
    if (tab === 'saldos') drawBalances();
    if (tab === 'vivo') renderVivo(true);
  });
  const u3 = db.watch('stores', [], s => { stores = s; if (tab === 'aprob' || tab === 'gente') render(); });
  let seenTop = null;
  const u6 = db.watch('topups', [['status', '==', 'pendiente']], t => {
    if (seenTop && t.some(x => !seenTop.has(x.id))) { beep(3); toast('Nueva recarga por aprobar'); }
    seenTop = new Set(t.map(x => x.id));
    $('#aTop', root).textContent = t.length; $('#aTop', root).classList.toggle('hidden', !t.length); });

  // ---------- Saldos (prepago) ----------
  function renderSaldos() {
    body.innerHTML = `<div class="pad">${ctx.settings.prepaidEnabled ? '' : '<div class="warn">El saldo prepagado está apagado. Actívalo en Tarifas › Prepago.</div>'}
      <div id="aTopups"></div><div id="aBal"></div></div>`;
    saldosStop = mountTopupReview($('#aTopups', body), ctx);
    drawBalances();
  }
  function drawBalances() {
    const box = $('#aBal', body); if (!box) return;
    const fee = courierFee(ctx);
    const doms = users.filter(u => u.role === 'domiciliario' && u.approved).sort((a, b) => (a.balance || 0) - (b.balance || 0));
    const total = doms.reduce((s2, u) => s2 + (u.balance || 0), 0);
    const tenderos = users.filter(u => u.role === 'tendero' && u.approved);
    box.innerHTML = `<h2>Saldos de domiciliarios</h2>
      <p class="note">Saldo total prepagado: <b>${money(total)}</b> (es dinero que ya recibiste y se irá consumiendo en comisiones).</p>
      <ul class="list">${doms.map(u => `<li data-u="${u.id}"><div class="meta"><b>${esc(u.name)}</b><small>${Math.floor((u.balance || 0) / fee)} domicilio(s) disponibles</small></div>
        <b class="${(u.balance || 0) < fee ? 'neg' : ''}">${money(u.balance || 0)}</b><button class="btn small" data-a="adjust">Ajustar</button></li>`).join('') || '<li class="note">Sin domiciliarios</li>'}</ul>
      <h2>Socios locales</h2>
      <p class="note">Un socio (por ejemplo, un tendero de confianza) recibe recargas en efectivo y las aprueba desde su celular. Se queda con el ${ctx.settings.socioPct ?? 20}% de lo que recibe en efectivo.</p>
      <ul class="list">${tenderos.map(u => `<li data-u="${u.id}"><div class="meta"><b>${esc(u.name)}</b><small>${esc(stores.find(x => x.id === u.id)?.name || '')}${u.socio ? ' · <span class="ok">Socio</span>' : ''}</small></div>
        <button class="btn small ${u.socio ? 'danger' : ''}" data-a="socio">${u.socio ? 'Quitar socio' : 'Hacer socio'}</button></li>`).join('') || '<li class="note">Sin tiendas aprobadas</li>'}</ul>`;
  }

  const u5 = db.watch('invites', [], i => { invites = i.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)); if (tab === 'aprob') render(); });

  // Promoción automática de domiciliarios en prueba (corre mientras el panel de admin está abierto)
  async function autoPromote() {
    const S = ctx.settings || {}; const need = S.trialDeliveries || 10;
    const trials = users.filter(u => u.role === 'domiciliario' && u.approved && u.level === 'prueba');
    for (const u of trials) {
      try {
        const done = await db.list('orders', [['courierUid', '==', u.id], ['status', '==', 'entregado']]);
        const rated = done.filter(o => o.rating); const avg = rated.length ? rated.reduce((a, o) => a + o.rating, 0) / rated.length : null;
        const issues = done.filter(o => o.issue).length; const noPin = done.filter(o => o.pinOk === false).length;
        trialStats[u.id] = { done: done.length, avg, issues, noPin };
        if (done.length >= need && (avg == null || avg >= 4) && noPin <= Math.floor(need / 5)) {
          await db.update('users', u.id, { level: 'completo', promotedAt: Date.now(), promotedBy: 'auto' });
          toast(`${u.name} pasó a nivel completo (${done.length} entregas)`);
        }
      } catch (e) { console.warn('autoPromote', e); }
    }
    if (tab === 'aprob') render();
  }
  setTimeout(autoPromote, 1500);
  const promoTimer = setInterval(autoPromote, 5 * 60000);

  function watchDay() { unsubDayR && unsubDayR(); unsubDayR = db.watch('rides', [['day', '==', day]], r => { dayRides = r; if (tab === 'rep') render(); }); unsubDay && unsubDay(); unsubDay = db.watch('orders', [['day', '==', day]], o => { dayOrders = o; if (tab === 'rep') render(); }); }
  watchDay();

  function render() {
    if (tab === 'vivo') renderVivo(); else if (tab === 'aprob') renderAprob(); else if (tab === 'gente') renderGente();
    else if (tab === 'tarifas') renderTarifas(); else if (tab === 'saldos') renderSaldos(); else renderRep();
  }

  // ---------- En vivo ----------
  function renderVivo(update) {
    const couriers = users.filter(u => u.role === 'domiciliario' && u.approved && u.online);
    if (!update || !map) {
      body.innerHTML = `<div id="aMap" class="map mid"></div><div class="pad" id="aList"></div>`;
      map = makeMap($('#aMap', body)); layer = L.layerGroup().addTo(map);
    }
    layer.clearLayers();
    const pts = [];
    for (const c of couriers) if (c.loc) { L.marker([c.loc.lat, c.loc.lng], { icon: ICONS.courier() }).bindPopup(`<b>${esc(c.name)}</b><br>${esc(VEHICLES[c.vehicle]?.[0] || '')}<br>${ago(c.loc.at || Date.now())}`).addTo(layer); pts.push(c.loc); }
    for (const o of active) if (o.dest?.lat) { L.marker([o.dest.lat, o.dest.lng], { icon: ICONS.dest() }).bindPopup(`#${esc(o.code)} · ${esc(STATUS[o.status][0])}`).addTo(layer); pts.push(o.dest); }
    if (!update) fitTo(map, pts.length ? pts : [{ lat: HOME[0], lng: HOME[1] }]);
    const timeout = ctx.settings.assignTimeoutMin || 5;
    $('#aList', body).innerHTML = `<div class="stats"><div class="stat"><b>${active.length}</b><span>en curso</span></div><div class="stat"><b>${active.filter(o => o.status === 'buscando').length}</b><span>sin domiciliario</span></div><div class="stat"><b>${couriers.length}</b><span>domiciliarios en línea</span></div></div>
      ${active.map(o => {
        const late = o.status === 'buscando' && (Date.now() - (o.times?.buscando || o.createdAt)) / 60000 >= timeout;
        return `<div class="card order ${late || o.issue ? 'hot' : ''}" data-o="${o.id}">
          <div class="rowb"><b>#${esc(o.code)} · ${esc(o.type === 'mandado' ? 'Mandado' : o.storeName)}</b>${statusBadge(o.status)}</div>
          <small>${esc(o.clientName || '')} · ${esc(o.dest?.zoneName || '')} · ${ago(o.createdAt)} · ${o.total ? money(o.total) : 'sin valor'}</small>
          ${o.courierName ? `<small>🛵 ${esc(o.courierName)}</small>` : ''}
          ${late ? `<div class="warn">Lleva más de ${timeout} min sin domiciliario</div>` : ''}
          ${o.issue ? `<div class="warn">Problema reportado: ${esc(o.issue)}</div>` : ''}
          <div class="row"><a class="btn small" href="#/seguir/${o.id}">Ver</a>
            ${o.courierUid ? '<button class="btn small" data-a="unassign">Reasignar</button>' : ''}
            ${o.issue ? '<button class="btn small" data-a="clearIssue">Resuelto</button>' : ''}
            <button class="btn small danger" data-a="cancel">Cancelar</button></div></div>`;
      }).join('') || '<p class="note">No hay pedidos en curso.</p>'}
      ${activeRides.length ? `<h3>Carreras en curso (${activeRides.length})</h3>${activeRides.map(x => `<div class="card order" data-ride="${x.id}">
        <div class="rowb"><b>${RIDE_VEH[x.vehicle]?.[1] || ''} #${esc(x.code)} · ${esc(x.clientName)}</b><span class="badge" style="background:${RSTATUS[x.status][1]}">${esc(RSTATUS[x.status][0])}</span></div>
        <small>${esc(x.origin?.ref || '')} → ${esc(x.dest?.ref || '')} · ${money(x.price || x.offer)}${x.driverName ? ' · ' + esc(x.driverName) : ` · ${Object.keys(x.offers || {}).length} oferta(s)`} · ${ago(x.createdAt)}</small>
        <div class="row"><a class="btn small" href="#/carrera/${x.id}">Ver</a><button class="btn small danger" data-a="cancelRide">Cancelar</button></div></div>`).join('')}` : ''}
      ${couriers.length ? `<h3>Domiciliarios en línea</h3><ul class="list">${couriers.map(c => `<li><div class="meta"><b>${esc(c.name)}</b><small>${esc(VEHICLES[c.vehicle]?.[0] || '')} · ${active.filter(o => o.courierUid === c.id).length} pedido(s) · GPS ${c.loc ? ago(c.loc.at || 0) : 'sin datos'}</small></div><a class="btn small" href="${waLink(c.phone, '')}" target="_blank">WhatsApp</a></li>`).join('')}</ul>` : ''}`;
  }

  // ---------- Aprobaciones ----------
  function renderAprob() {
    body.innerHTML = `<div class="pad"><h2>Registros por aprobar</h2>${pending.map(u => {
      const s = stores.find(x => x.id === u.id);
      return `<div class="card" data-u="${u.id}"><div class="rowb"><b>${esc(u.name)}</b><span class="badge" style="background:#64748b">${u.role === 'tendero' ? 'Tienda' : 'Domiciliario'}</span></div>
        <small>${esc(u.phone)} · ${ago(u.createdAt)}</small>
        ${u.role === 'domiciliario' ? `<small>${esc(VEHICLES[u.vehicle]?.[0] || '')}${u.plate ? ' · placa ' + esc(u.plate) : ''}</small>` : ''}
        ${s ? `<small>🏪 <b>${esc(s.name)}</b> · ${esc(STORE_CATS[s.cat] || '')} · ${esc(s.ref || '')}</small>` : ''}
        <p class="note">Verifica en persona: cédula${u.role === 'domiciliario' ? ', vehículo y documentos' : ' y ubicación de la tienda'}.</p>
        <div class="row">${u.role === 'domiciliario' ? '<button class="btn" data-a="docs">Documentos</button>' : ''}<a class="btn" href="${waLink(u.phone, `Hola ${u.name}, soy el administrador de MandaoYa.`)}" target="_blank">WhatsApp</a><button class="btn danger" data-a="reject">Rechazar</button><button class="btn primary" data-a="approve">Aprobar</button></div></div>`;
    }).join('') || '<p class="note">No hay registros pendientes.</p>'}
      ${trialList()}
      ${invitesBlock()}</div>`;
  }
  function trialList() {
    const S = ctx.settings || {}; const need = S.trialDeliveries || 10;
    const trials = users.filter(u => u.role === 'domiciliario' && u.approved && u.level === 'prueba');
    return `<h2>Domiciliarios en prueba (${trials.length})</h2>
      <p class="note">${S.courierAutoApprove ? 'Se activan solos si cumplen los requisitos.' : 'La aprobación automática está apagada (actívala en Tarifas).'} Pasan a nivel completo con ${need} entregas, calificación de 4★ o más y casi todas con código.</p>
      ${trials.map(u => { const t = trialStats[u.id] || {}; return `<div class="card" data-u="${u.id}"><div class="rowb"><b>${esc(u.name)}</b><span class="badge" style="background:#d97706">Prueba</span></div>
        <small>${esc(VEHICLES[u.vehicle]?.[0] || '')}${u.plate ? ' · ' + esc(u.plate) : ''} · ${esc(u.phone)} · ${u.autoApproved ? 'activado automático' : 'aprobado a mano'}${u.inviteCode ? ' · invitación ' + esc(u.inviteCode) : ''}</small>
        <small>${t.done ?? '…'} / ${need} entregas${t.avg ? ' · ' + t.avg.toFixed(1) + '★' : ''}${t.noPin ? ' · ' + t.noPin + ' sin código' : ''}${t.issues ? ' · ' + t.issues + ' con problemas' : ''}</small>
        <div class="row"><button class="btn small" data-a="docs">Documentos</button><button class="btn small danger" data-a="suspend">Suspender</button><button class="btn small primary" data-a="promote">Nivel completo</button></div></div>`; }).join('') || '<p class="note">Nadie en prueba.</p>'}`;
  }
  function invitesBlock() {
    return `<h2>Códigos de invitación</h2>
      <p class="note">${ctx.settings.requireInvite ? 'Obligatorios para registrarse como domiciliario.' : 'Opcionales (actívalos en Tarifas si quieres exigirlos).'}</p>
      <div class="row"><input class="in" id="invUses" type="number" inputmode="numeric" value="5" style="flex:0 0 90px"><button class="btn" data-a="newInvite">+ Crear código</button></div>
      <ul class="list" style="margin-top:8px">${invites.map(i => `<li data-inv="${i.id}"><div class="meta"><b class="mono">${esc(i.id)}</b><small>${i.uses || 0}/${i.maxUses || '∞'} usos · ${i.active ? 'activo' : 'desactivado'}${i.note ? ' · ' + esc(i.note) : ''}</small></div>
        ${i.active ? `<a class="btn small" target="_blank" href="${waLink('', `Regístrate como domiciliario en MandaoYa: ${location.origin + location.pathname}  Código de invitación: ${i.id}`)}">Compartir</a><button class="btn small danger" data-a="offInvite">Desactivar</button>` : ''}</li>`).join('') || '<li class="note">Sin códigos</li>'}</ul>`;
  }

  // ---------- Gente ----------
  function renderGente() {
    const doms = users.filter(u => u.role === 'domiciliario' && u.approved);
    const clients = users.filter(u => u.role === 'cliente');
    body.innerHTML = `<div class="pad"><h2>Tiendas (${stores.filter(s => s.approved).length})</h2><ul class="list">${stores.filter(s => s.approved).map(s => `<li data-s="${s.id}"><div class="meta"><b>${esc(s.name)}</b><small>${s.open ? '● Abierta' : '○ Cerrada'} · ${esc(s.phone || '')}</small></div>
        <button class="btn small" data-a="suspendStore">Suspender</button></li>`).join('') || '<li class="note">Sin tiendas</li>'}</ul>
      <h2>Domiciliarios (${doms.length})</h2><ul class="list">${doms.map(u => `<li data-u="${u.id}"><div class="meta"><b>${esc(u.name)}</b><small>${esc(VEHICLES[u.vehicle]?.[0] || '')} · ${u.online ? 'en línea' : 'fuera'} · ${esc(u.phone)}</small></div>
        <button class="btn small" data-a="suspend">Suspender</button></li>`).join('') || '<li class="note">Sin domiciliarios</li>'}</ul>
      <h2>Clientes (${clients.length})</h2><ul class="list">${clients.slice(0, 200).map(u => `<li><div class="meta"><b>${esc(u.name)}</b><small>${esc(u.phone)}</small></div></li>`).join('') || '<li class="note">Sin clientes</li>'}</ul></div>`;
  }

  // ---------- Tarifas ----------
  function renderTarifas() {
    const s = ctx.settings;
    body.innerHTML = `<div class="pad"><h2>Tarifas por sector</h2>
      <p class="note">El cliente elige su sector y se le cobra esa tarifa de domicilio.</p>
      <ul class="list">${ctx.zones.map(z => `<li data-z="${z.id}"><div class="meta"><input class="in" data-f="name" value="${esc(z.name)}"></div><input class="in money" data-f="fee" type="number" inputmode="numeric" value="${z.fee}"><button class="btn small danger" data-a="delZone">✕</button></li>`).join('')}</ul>
      <button class="btn block" data-a="addZone">+ Agregar sector</button>
      <h2>Ajustes</h2>
      <label class="f">Tarifa base (si no hay sector)</label><input class="in" id="tBase" type="number" inputmode="numeric" value="${s.baseFee ?? 3000}">
      <label class="f">Comisión de MandaoYa sobre cada domicilio (%)</label><input class="in" id="tComm" type="number" inputmode="numeric" value="${s.commissionPct ?? 0}">
      <label class="f">Minutos sin domiciliario antes de alertar</label><input class="in" id="tTime" type="number" inputmode="numeric" value="${s.assignTimeoutMin ?? 5}">
      <h2>Domiciliarios</h2>
      <label class="check"><input type="checkbox" id="tAuto" ${s.courierAutoApprove ? 'checked' : ''}> Activar automáticamente a quien cumpla los requisitos (selfie, cédula, vehículo, GPS en la zona, mayor de edad)</label>
      <label class="check"><input type="checkbox" id="tInv" ${s.requireInvite ? 'checked' : ''}> Exigir código de invitación</label>
      <label class="f">Entregas para salir del nivel de prueba</label><input class="in" id="tTrialN" type="number" inputmode="numeric" value="${s.trialDeliveries ?? 10}">
      <label class="f">Valor máximo de pedido en nivel de prueba</label><input class="in" id="tTrialMax" type="number" inputmode="numeric" value="${s.trialMaxTotal ?? 50000}">
      <label class="f">Pedidos a la vez en nivel de prueba</label><input class="in" id="tTrialAct" type="number" inputmode="numeric" value="${s.trialMaxActive ?? 1}">
      <label class="f">Radio de servicio para registrarse (km desde el pueblo)</label><input class="in" id="tRadius" type="number" inputmode="numeric" value="${s.serviceRadiusKm ?? 30}">
      <h2>Carreras</h2>
      <label class="check"><input type="checkbox" id="tRides" ${s.ridesEnabled !== false ? 'checked' : ''}> Activar carreras (pasajeros) en la app</label>
      <label class="f">Comisión por carrera iniciada (se descuenta del saldo del conductor)</label><input class="in" id="tRideFee" type="number" inputmode="numeric" value="${s.rideFee ?? 500}">
      <label class="f">Radio para mostrar solicitudes a los conductores (km)</label><input class="in" id="tRideRad" type="number" inputmode="numeric" value="${s.rideRadiusKm ?? 5}">
      <p class="note">Precio sugerido = base + valor por km (nunca menos del mínimo). El pasajero puede subirlo o bajarlo hasta el mínimo.</p>
      <ul class="list">${Object.entries(RIDE_VEH).map(([k, v]) => { const t = (s.rideTariffs || {})[k] || { moto: { base: 2000, perKm: 1000, min: 3000 }, carro: { base: 4000, perKm: 1800, min: 6000 }, lancha: { base: 5000, perKm: 3000, min: 10000 } }[k]; return `<li data-rt="${k}"><div class="meta"><b>${v[1]} ${v[0]}</b><label class="check" style="margin:4px 0"><input type="checkbox" data-f="enabled" ${t.enabled === false ? '' : 'checked'}> Activo</label></div>
        <div class="tgrid"><label>Base<input class="in" data-f="base" type="number" inputmode="numeric" value="${t.base}"></label><label>Por km<input class="in" data-f="perKm" type="number" inputmode="numeric" value="${t.perKm}"></label><label>Mínimo<input class="in" data-f="min" type="number" inputmode="numeric" value="${t.min}"></label></div></li>`; }).join('')}</ul>
      <h2>Prepago (comisión de MandaoYa)</h2>
      <label class="check"><input type="checkbox" id="tPre" ${s.prepaidEnabled ? 'checked' : ''}> Cobrar comisión con saldo prepagado: el domiciliario sin saldo no puede aceptar domicilios</label>
      <label class="f">Comisión por domicilio aceptado</label><input class="in" id="tFee" type="number" inputmode="numeric" value="${s.courierFee ?? 500}">
      <label class="f">Crédito de bienvenida para domiciliarios nuevos (0 para no dar)</label><input class="in" id="tWelcome" type="number" inputmode="numeric" value="${s.welcomeCredit ?? 2500}">
      <label class="f">Recarga mínima</label><input class="in" id="tMinTop" type="number" inputmode="numeric" value="${s.minTopup ?? 5000}">
      <label class="f">Número Nequi/Daviplata para recargas</label><input class="in" id="tNequi" type="tel" inputmode="tel" value="${esc(s.topupNequi || '')}">
      <label class="f">Titular de la cuenta</label><input class="in" id="tNequiName" value="${esc(s.topupName || '')}" placeholder="Ej: MIQUITEC SAS">
      <label class="f">% para el socio local sobre recargas en efectivo</label><input class="in" id="tSocioPct" type="number" inputmode="numeric" value="${s.socioPct ?? 20}">
      <label class="f">Dónde recargar en efectivo (se muestra al domiciliario)</label><input class="in" id="tSocioInfo" value="${esc(s.socioInfo || '')}" placeholder="Ej: Tienda Doña Rosa, frente al parque">
      <h2>Soporte</h2>
      <label class="f">WhatsApp del administrador (soporte)</label><input class="in" id="tWa" type="tel" inputmode="tel" value="${esc(s.adminWhatsApp || '')}">
      <label class="f">Nombre del pueblo</label><input class="in" id="tTown" value="${esc(s.town || 'San José, Roberto Payán')}">
      <button class="btn primary block" data-a="saveSettings">Guardar todo</button></div>`;
  }

  // ---------- Reportes ----------
  function renderRep() {
    const done = dayOrders.filter(o => o.status === 'entregado'), canc = dayOrders.filter(o => o.status === 'cancelado');
    const comm = (ctx.settings.commissionPct || 0) / 100;
    const fees = done.reduce((s, o) => s + (o.fee || 0), 0), sales = done.reduce((s, o) => s + (o.subtotal || 0), 0);
    const mins = done.filter(o => o.times?.entregado).map(o => (o.times.entregado - o.createdAt) / 60000);
    const avg = mins.length ? Math.round(mins.reduce((a, b) => a + b, 0) / mins.length) : null;
    const group = (key, label) => {
      const g = {};
      for (const o of dayOrders.filter(x => x.status === 'entregado')) { const k = label(o); g[k] = g[k] || { n: 0, fee: 0, sub: 0, feeCh: 0 }; g[k].n++; g[k].fee += o.fee || 0; g[k].sub += o.subtotal || 0; g[k].feeCh += o.feeCharged && !o.feeRefunded ? o.feeCharged : 0; }
      return Object.entries(g).sort((a, b) => b[1].n - a[1].n);
    };
    const ratings = done.filter(o => o.rating).map(o => o.rating);
    body.innerHTML = `<div class="pad"><div class="rowb"><h2>Reporte</h2><input type="date" class="in date" id="rDay" value="${day}"></div>
      <div class="stats"><div class="stat"><b>${done.length}</b><span>entregados</span></div><div class="stat"><b>${canc.length}</b><span>cancelados</span></div><div class="stat"><b>${avg ?? '—'}${avg != null ? ' min' : ''}</b><span>tiempo promedio</span></div></div>
      <div class="stats"><div class="stat"><b>${money(sales)}</b><span>ventas tiendas</span></div><div class="stat"><b>${money(fees)}</b><span>domicilios</span></div><div class="stat"><b>${money(ctx.settings.prepaidEnabled ? dayOrders.filter(o => o.feeCharged && !o.feeRefunded).reduce((s2, o) => s2 + o.feeCharged, 0) : fees * comm)}</b><span>comisión MandaoYa</span></div></div>
      ${ratings.length ? `<p class="note">Calificación promedio: ${(ratings.reduce((a, b) => a + b, 0) / ratings.length).toFixed(1)} ★ (${ratings.length})</p>` : ''}
      <h3>Por tienda</h3><ul class="list">${group('s', o => o.type === 'mandado' ? 'Mandados' : o.storeName).map(([k, v]) => `<li><div class="meta"><b>${esc(k)}</b><small>${v.n} pedidos</small></div><b>${money(v.sub)}</b></li>`).join('') || '<li class="note">—</li>'}</ul>
      <h3>Por domiciliario</h3><ul class="list">${group('c', o => o.courierName || '—').map(([k, v]) => `<li><div class="meta"><b>${esc(k)}</b><small>${v.n} entregas · comisión ${money(ctx.settings.prepaidEnabled ? v.feeCh : v.fee * comm)}</small></div><b>${money(v.fee)}</b></li>`).join('') || '<li class="note">—</li>'}</ul>
      ${canc.length ? `<h3>Cancelaciones</h3><ul class="list">${canc.map(o => `<li><div class="meta"><b>#${esc(o.code)} · ${esc(o.storeName || 'Mandado')}</b><small>${esc(o.cancelReason || '')} (${esc(o.cancelBy || '')})</small></div></li>`).join('')}</ul>` : ''}
      ${dayRides.length ? `<h3>Carreras</h3><div class="stats"><div class="stat"><b>${dayRides.filter(x => x.status === 'finalizada').length}</b><span>terminadas</span></div><div class="stat"><b>${money(dayRides.filter(x => x.status === 'finalizada').reduce((a, x) => a + (x.price || 0), 0))}</b><span>valor de viajes</span></div><div class="stat"><b>${money(dayRides.reduce((a, x) => a + (x.feeCharged && !x.feeRefunded ? x.feeCharged : 0), 0))}</b><span>comisión carreras</span></div></div>` : ''}
      <button class="btn block" data-a="csv">Descargar CSV del día</button></div>`;
    $('#rDay', body).onchange = e => { day = e.target.value; watchDay(); };
  }

  // ---------- acciones ----------
  body.onclick = async e => {
    const a = e.target.closest('[data-a]'); if (!a) return;
    const act = a.dataset.a; const now = Date.now();
    try {
      if (act === 'approve' || act === 'reject') {
        const uid = e.target.closest('[data-u]').dataset.u; const u = users.find(x => x.id === uid);
        if (act === 'approve') {
          await db.update('users', uid, { approved: true, approvedAt: now, ...(u.role === 'domiciliario' ? { level: 'completo' } : {}) });
          if (u.role === 'tendero' && stores.find(s => s.id === uid)) await db.update('stores', uid, { approved: true });
          toast(`${u.name} aprobado`);
        } else if (await ask('¿Rechazar registro?', esc(u.name), 'Rechazar', true)) await db.update('users', uid, { rejected: true });
      }
      if (act === 'adjust') {
        const uid = e.target.closest('[data-u]').dataset.u; const u = users.find(x => x.id === uid);
        const b2 = sheet(`<h2>Ajustar saldo de ${esc(u.name)}</h2><p class="note">Saldo actual: ${money(u.balance || 0)}. Usa un número negativo para descontar.</p>
          <label class="f">Valor</label><input class="in" id="adjV" type="number" inputmode="numeric" placeholder="Ej: 2000 o -500">
          <label class="f">Motivo</label><input class="in" id="adjN" placeholder="Ej: bono de bienvenida">
          <div class="row actions"><button class="btn" id="adjNo">Cancelar</button><button class="btn primary" id="adjOk">Aplicar</button></div>`);
        $('#adjNo', b2).onclick = closeSheet;
        $('#adjOk', b2).onclick = async () => { const v = +$('#adjV').value; if (!v) return toast('Escribe un valor'); await adjustBalance(ctx, u, v, $('#adjN').value.trim()); closeSheet(); toast('Saldo ajustado'); };
      }
      if (act === 'socio') { const uid = e.target.closest('[data-u]').dataset.u; const u = users.find(x => x.id === uid); await db.update('users', uid, { socio: !u.socio }); toast(u.socio ? 'Ya no es socio' : `${u.name} ahora es socio`); }
      if (act === 'docs') {
        const uid = e.target.closest('[data-u]').dataset.u; const u = users.find(x => x.id === uid);
        const d = await db.get('courierDocs', uid);
        if (!d) return toast('Este domiciliario no subió documentos');
        sheet(`<h2>Documentos de ${esc(u.name)}</h2>
          <div class="docs">${[['selfie', 'Selfie'], ['idPhoto', 'Cédula'], ['vehiclePhoto', 'Vehículo']].filter(([k]) => d[k]).map(([k, l]) => `<figure><img src="${d[k]}" alt=""><figcaption>${l}</figcaption></figure>`).join('')}</div>
          ${d.gps ? `<p class="note">GPS al registrarse: ${d.gps.lat}, ${d.gps.lng} (±${d.gps.acc} m)</p>` : ''}
          <p class="note">Compara la selfie con la cédula y llama al número ${esc(u.phone)} si tienes dudas.</p>`);
      }
      if (act === 'promote') { const uid = e.target.closest('[data-u]').dataset.u; await db.update('users', uid, { level: 'completo', promotedAt: now, promotedBy: 'admin' }); toast('Pasó a nivel completo'); }
      if (act === 'newInvite') {
        const a2 = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; let code = ''; for (const b of crypto.getRandomValues(new Uint8Array(6))) code += a2[b % a2.length];
        await db.set('invites', code, { active: true, uses: 0, maxUses: +$('#invUses').value || 0, createdAt: now });
        toast('Código creado: ' + code);
      }
      if (act === 'offInvite') { const code = e.target.closest('[data-inv]').dataset.inv; await db.update('invites', code, { active: false }); }
      if (act === 'suspend') { const uid = e.target.closest('[data-u]').dataset.u; if (await ask('¿Suspender domiciliario?', 'No podrá aceptar domicilios hasta que lo apruebes de nuevo.', 'Suspender', true)) await db.update('users', uid, { approved: false, online: false }); }
      if (act === 'suspendStore') { const sid = e.target.closest('[data-s]').dataset.s; if (await ask('¿Suspender tienda?', 'Dejará de aparecer para los clientes.', 'Suspender', true)) { await db.update('stores', sid, { approved: false, open: false }); await db.update('users', sid, { approved: false }).catch(() => { }); } }
      const oid = e.target.closest('[data-o]')?.dataset.o;
      const ord = oid ? active.find(x => x.id === oid) : null;
      if (act === 'cancel' && oid && await ask('¿Cancelar pedido?', `Se avisará a la tienda, al cliente y al domiciliario en su pantalla.${ord?.feeCharged ? ' Se le devuelve la comisión al domiciliario.' : ''}`, 'Cancelar pedido', true)
        && (await refundFee(ctx, ord), true))
        await db.update('orders', oid, { status: 'cancelado', active: false, cancelReason: 'Cancelado por el administrador', cancelBy: 'admin', 'times.cancelado': now });
      if (act === 'unassign' && oid && await ask('¿Reasignar?', `El pedido vuelve a la lista de disponibles para otro domiciliario.${ord?.feeCharged ? ' Se le devuelve la comisión al domiciliario actual.' : ''}`, 'Reasignar')
        && (await refundFee(ctx, ord), true))
        await db.update('orders', oid, { status: 'buscando', courierUid: null, courierName: null, courierPhone: null, courierLoc: null, 'times.buscando': now });
      if (act === 'cancelRide') {
        const rid = e.target.closest('[data-ride]').dataset.ride, x = activeRides.find(y => y.id === rid);
        if (x && await ask('¿Cancelar la carrera?', x.feeCharged ? 'Se le devuelve la comisión al conductor.' : '', 'Cancelar carrera', true)) {
          await refundRideFee(ctx, x);
          await db.update('rides', rid, { status: 'cancelada', active: false, cancelReason: 'Cancelada por el administrador', cancelBy: 'admin', 'times.cancelada': now });
        }
      }
      if (act === 'clearIssue' && oid) await db.update('orders', oid, { issue: null });
      if (act === 'addZone') { await db.add('zones', { name: 'Nuevo sector', fee: ctx.settings.baseFee || 3000, order: ctx.zones.length + 1, active: true }); setTimeout(renderTarifas, 200); }
      if (act === 'delZone') { const zid = e.target.closest('[data-z]').dataset.z; if (await ask('¿Quitar este sector?', '', 'Quitar', true)) { await db.update('zones', zid, { active: false }); setTimeout(renderTarifas, 200); } }
      if (act === 'saveSettings') {
        for (const li of body.querySelectorAll('[data-z]')) {
          await db.update('zones', li.dataset.z, { name: li.querySelector('[data-f="name"]').value.trim(), fee: +li.querySelector('[data-f="fee"]').value || 0 });
        }
        await db.set('config', 'general', { baseFee: +$('#tBase').value || 0, commissionPct: +$('#tComm').value || 0, assignTimeoutMin: +$('#tTime').value || 5,
          adminWhatsApp: $('#tWa').value.trim(), town: $('#tTown').value.trim(),
          ridesEnabled: $('#tRides').checked, rideFee: +$('#tRideFee').value || 0, rideRadiusKm: +$('#tRideRad').value || 5,
          rideTariffs: Object.fromEntries([...body.querySelectorAll('[data-rt]')].map(li => [li.dataset.rt, { enabled: li.querySelector('[data-f="enabled"]').checked,
            base: +li.querySelector('[data-f="base"]').value || 0, perKm: +li.querySelector('[data-f="perKm"]').value || 0, min: +li.querySelector('[data-f="min"]').value || 0 }])),
          prepaidEnabled: $('#tPre').checked, courierFee: +$('#tFee').value || 0, welcomeCredit: +$('#tWelcome').value || 0, minTopup: +$('#tMinTop').value || 0, topupNequi: $('#tNequi').value.trim(),
          topupName: $('#tNequiName').value.trim(), socioPct: +$('#tSocioPct').value || 0, socioInfo: $('#tSocioInfo').value.trim(),
          courierAutoApprove: $('#tAuto').checked, requireInvite: $('#tInv').checked, trialDeliveries: +$('#tTrialN').value || 10,
          trialMaxTotal: +$('#tTrialMax').value || 50000, trialMaxActive: +$('#tTrialAct').value || 1, serviceRadiusKm: +$('#tRadius').value || 30 }, { merge: true });
        toast('Tarifas y ajustes guardados');
      }
      if (act === 'csv') {
        const cols = ['code', 'day', 'type', 'storeName', 'clientName', 'clientPhone', 'zone', 'courierName', 'status', 'pay', 'subtotal', 'fee', 'total', 'creado', 'entregado', 'cancelReason', 'rating'];
        const rows = dayOrders.map(o => [o.code, o.day, o.type, o.storeName, o.clientName, o.clientPhone, o.dest?.zoneName, o.courierName, o.status, o.pay, o.subtotal, o.fee, o.total, hhmm(o.createdAt), hhmm(o.times?.entregado), o.cancelReason, o.rating]);
        const csv = [cols, ...rows].map(r => r.map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
        const blob = new Blob(['﻿' + csv], { type: 'text/csv' });
        const f = new File([blob], `mandaoya_${day}.csv`, { type: 'text/csv' });
        if (navigator.canShare && navigator.canShare({ files: [f] })) await navigator.share({ files: [f] });
        else { const l = document.createElement('a'); l.href = URL.createObjectURL(blob); l.download = f.name; l.click(); }
      }
    } catch (err) { if (err.name !== 'AbortError') toast('Error: ' + (err.message || err)); }
  };

  render();
  return () => { u8(); unsubDayR && unsubDayR(); u5(); u6(); if (saldosStop) saldosStop(); clearInterval(promoTimer); u1(); u2(); u3(); unsubDay && unsubDay(); map && map.remove(); body.onclick = null; };
}
