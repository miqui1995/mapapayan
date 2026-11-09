// MandaoYa – interfaz del TENDERO
import { mountStoreProducts } from './catalogo.js';
import { mountTopupReview } from './recargas.js';
import { $, esc, money, toast, ask, sheet, closeSheet, pickLocation, PAY, statusBadge, shortCode, pin4, dayKey, ago, hhmm, waLink, telLink, trackUrl, beep, VEHICLES } from './ui.js';

export function mount(root, ctx) {
  const { db } = ctx;
  let prodStop = null;
  let tab = 'pedidos', store = null, active = [], today = [], seen = null;
  root.innerHTML = `<div class="storeBar" id="tBar"></div>
    <div class="tabs ${ctx.me.socio ? 'scroll' : ''}"><button data-t="pedidos" class="on">Pedidos <span id="tCnt" class="cnt hidden"></span></button><button data-t="nuevo">+ Domicilio</button><button data-t="productos">Productos</button><button data-t="caja">Hoy</button>${ctx.me.socio ? '<button data-t="recargas">Recargas</button>' : ''}</div>
    <div id="tBody" class="pad"></div>`;
  const body = $('#tBody', root);
  root.querySelector('.tabs').onclick = e => { const b = e.target.closest('[data-t]'); if (!b) return; setTab(b.dataset.t); };
  function setTab(t) { tab = t; root.querySelectorAll('.tabs button').forEach(x => x.classList.toggle('on', x.dataset.t === t)); render(); }

  const u0 = db.watchDoc('stores', db.uid, s => { store = s; renderBar(); });
  const u1 = db.watch('orders', [['storeId', '==', db.uid], ['active', '==', true]], o => {
    active = o.sort((a, b) => a.createdAt - b.createdAt);
    const fresh = active.filter(x => x.status === 'solicitado');
    if (seen && fresh.some(x => !seen.has(x.id))) { beep(4); toast('¡Nuevo pedido!'); }
    seen = new Set(active.map(x => x.id));
    $('#tCnt', root).textContent = active.length; $('#tCnt', root).classList.toggle('hidden', !active.length);
    if (tab === 'pedidos') render();
  });
  const u2 = db.watch('orders', [['storeId', '==', db.uid], ['day', '==', dayKey()]], o => { today = o; if (tab === 'caja') render(); });
  const tick = setInterval(() => { if (tab === 'pedidos' && active.some(o => o.status === 'buscando')) render(); }, 30000);

  function renderBar() {
    if (!store) return;
    $('#tBar', root).innerHTML = `<div><b>${esc(store.name)}</b><small>${store.open ? 'Recibiendo pedidos' : 'Cerrada: los clientes no pueden pedirte'}</small></div>
      <button class="toggle ${store.open ? 'on' : ''}" id="tOpen"><span></span>${store.open ? 'Abierta' : 'Cerrada'}</button>`;
    $('#tOpen', root).onclick = () => db.update('stores', db.uid, { open: !store.open });
  }

  function orderCard(o) {
    const wait = o.status === 'buscando' ? Math.floor((Date.now() - (o.times?.buscando || o.createdAt)) / 60000) : 0;
    const late = o.status === 'buscando' && wait >= (ctx.settings.assignTimeoutMin || 5);
    return `<div class="card order ${o.status === 'solicitado' ? 'hot' : ''}" data-o="${o.id}">
      <div class="rowb"><b>#${esc(o.code)} · ${esc(o.clientName || 'Cliente')}</b>${statusBadge(o.status)}</div>
      <small>${hhmm(o.createdAt)} · ${esc(o.dest?.zoneName || '')} · ${esc(o.dest?.ref || '')}</small>
      <div class="items">${esc(o.items)}</div>
      ${o.note ? `<small>Nota: ${esc(o.note)}</small>` : ''}
      <small>${PAY[o.pay]}${o.payWith ? ' · paga con ' + money(o.payWith) : ''} · Domicilio ${money(o.fee)}${o.total ? ' · <b>Total ' + money(o.total) + '</b>' : ''}</small>
      ${o.courierName ? `<small>🛵 ${esc(o.courierName)} (${esc(VEHICLES[o.courierVehicle]?.[0] || '')}) · <a href="${telLink(o.courierPhone)}">Llamar</a> · <a href="${waLink(o.courierPhone, `Hola ${o.courierName}, sobre el pedido #${o.code}`)}" target="_blank">WhatsApp</a></small>` : ''}
      ${late ? `<div class="warn">Nadie lo ha aceptado en ${wait} min. ${ctx.settings.adminWhatsApp ? `<a href="${waLink(ctx.settings.adminWhatsApp, `Pedido #${o.code} de ${store?.name} lleva ${wait} min sin domiciliario`)}" target="_blank">Avisar al administrador</a>` : ''}</div>` : ''}
      <div class="acts">
        ${o.status === 'solicitado' ? `<input class="in" type="number" inputmode="numeric" placeholder="Valor de los productos" data-sub="${o.id}" value="${o.subtotal ?? ''}">
            <div class="row"><button class="btn danger" data-a="reject">Rechazar</button><button class="btn primary" data-a="confirm">Confirmar</button></div>` : ''}
        ${o.status === 'preparando' ? `<button class="btn primary block" data-a="call">🛵 Pedir domiciliario</button>` : ''}
        ${o.status === 'asignado' ? `<button class="btn primary block" data-a="handed">Entregué el pedido al domiciliario</button>` : ''}
        <div class="row">
          ${o.clientPhone ? `<a class="btn" href="${waLink(o.clientPhone, `Hola ${o.clientName || ''}, tu pedido #${o.code} de ${store?.name || ''}. Síguelo aquí: ${trackUrl(o.id)}  Código de entrega: ${o.pin}`)}" target="_blank">Enviar seguimiento</a>` : ''}
          ${['solicitado', 'preparando', 'buscando'].includes(o.status) && o.status !== 'solicitado' ? `<button class="btn danger" data-a="cancel">Cancelar</button>` : ''}
          <a class="btn" href="#/seguir/${o.id}">Ver</a>
        </div>
      </div></div>`;
  }

  function render() {
    if (prodStop) { prodStop(); prodStop = null; }
    if (tab === 'pedidos') {
      const typed = {}; body.querySelectorAll('[data-sub]').forEach(i => { if (i.value) typed[i.dataset.sub] = i.value; });
      const focused = document.activeElement?.dataset?.sub;
      body.innerHTML = active.length ? active.map(orderCard).join('')
        : `<div class="empty"><div class="bigicon">📭</div><p>No hay pedidos en curso.</p><button class="btn primary" data-a="new">+ Crear un domicilio</button></div>`;
      for (const [id, v] of Object.entries(typed)) { const i = body.querySelector(`[data-sub="${id}"]`); if (i) i.value = v; }
      if (focused) body.querySelector(`[data-sub="${focused}"]`)?.focus();
    } else if (tab === 'nuevo') newForm();
    else if (tab === 'productos') prodStop = mountStoreProducts(body, ctx);
    else if (tab === 'recargas') prodStop = mountTopupReview(body, ctx, { asSocio: true });
    else caja();
  }

  body.onclick = async e => {
    const a = e.target.closest('[data-a]'); if (!a) return;
    if (a.dataset.a === 'new') return setTab('nuevo');
    const card = e.target.closest('[data-o]'); const o = active.find(x => x.id === card?.dataset.o); if (!o) return;
    const now = Date.now();
    try {
      if (a.dataset.a === 'confirm') {
        const sub = +($(`[data-sub="${o.id}"]`, body).value || 0);
        if (!sub) return toast('Escribe el valor de los productos');
        const warn = o.pay === 'efectivo' && o.payWith && o.payWith < sub + o.fee ? `<br><b>Ojo:</b> el cliente dijo que paga con ${money(o.payWith)}.` : '';
        if (!(await ask('Confirmar pedido', `Productos ${money(sub)} + domicilio ${money(o.fee)} = <b>${money(sub + o.fee)}</b>${warn}`, 'Confirmar'))) return;
        await db.update('orders', o.id, { subtotal: sub, total: sub + o.fee, status: 'preparando', 'times.preparando': now });
        toast('Pedido confirmado. Cuando esté listo, pide el domiciliario.');
      }
      if (a.dataset.a === 'reject' || a.dataset.a === 'cancel') {
        const reason = await reasonSheet();
        if (reason == null) return;
        await db.update('orders', o.id, { status: 'cancelado', active: false, cancelReason: reason, cancelBy: 'tienda', 'times.cancelado': now });
      }
      if (a.dataset.a === 'call') await db.update('orders', o.id, { status: 'buscando', 'times.buscando': now });
      if (a.dataset.a === 'handed') await db.update('orders', o.id, { status: 'recogido', 'times.recogido': now });
    } catch (err) { toast('Error: ' + (err.message || err)); }
  };

  function reasonSheet() {
    return new Promise(res => {
      const b = sheet(`<h2>¿Por qué se cancela?</h2>
        ${['No tengo los productos', 'La tienda va a cerrar', 'No hay domiciliario disponible', 'El cliente lo pidió', 'Dirección fuera de cobertura'].map(r => `<button class="btn block" data-r="${esc(r)}">${esc(r)}</button>`).join('')}
        <button class="btn block" data-r="">Volver</button>`, () => res(null));
      b.onclick = e => { const r = e.target.closest('[data-r]'); if (!r) return; const v = r.dataset.r; closeSheet(); res(v || null); };
    });
  }

  function newForm() {
    let dest = null;
    const zoneOpts = ctx.zones.map(z => `<option value="${z.id}">${esc(z.name)} — ${money(z.fee)}</option>`).join('');
    body.innerHTML = `<h2>Nuevo domicilio</h2>
      <p class="note">Para pedidos que te hacen por teléfono, WhatsApp o en el mostrador.</p>
      <label class="f">Nombre del cliente</label><input class="in" id="nName">
      <label class="f">Celular del cliente</label><input class="in" id="nPhone" type="tel" inputmode="tel" placeholder="Para enviarle el seguimiento">
      <label class="f">Sector</label><select class="in" id="nZone">${zoneOpts}</select>
      <label class="f">Dirección o referencia</label><textarea class="in" id="nRef" placeholder="Ej: casa verde detrás del colegio"></textarea>
      <button class="btn block" id="nLoc">📍 Marcar en el mapa (opcional)</button>
      <label class="f">¿Qué lleva?</label><textarea class="in" id="nItems" placeholder="Ej: 1 canasta de huevos, 2 gaseosas"></textarea>
      <label class="f">Valor de los productos</label><input class="in" id="nSub" type="number" inputmode="numeric" placeholder="0">
      <h3>Pago</h3>
      <div class="seg" id="nPay">${Object.entries(PAY).map(([k, v], i) => `<button data-p="${k}" class="${i ? '' : 'on'}">${v}</button>`).join('')}</div>
      <div id="nCashW"><label class="f">El cliente paga con (para llevar cambio)</label><input class="in" id="nCash" type="number" inputmode="numeric"></div>
      <label class="check"><input type="checkbox" id="nNow" checked> Pedir domiciliario de una vez (el pedido ya está listo)</label>
      <div class="sum" id="nSum"></div>
      <button class="btn primary block" id="nSave">Crear domicilio</button>`;
    let pay = 'efectivo';
    const fee = () => ctx.zones.find(z => z.id === $('#nZone').value)?.fee ?? ctx.settings.baseFee ?? 3000;
    const sum = () => { const s = +($('#nSub').value || 0); $('#nSum').innerHTML = `<div class="rowb"><span>Productos</span><span>${money(s)}</span></div><div class="rowb"><span>Domicilio</span><span>${money(fee())}</span></div><div class="rowb"><b>Total a cobrar</b><b>${money(s + fee())}</b></div>`; };
    sum(); $('#nZone').onchange = sum; $('#nSub').oninput = sum;
    $('#nPay').onclick = e => { const b = e.target.closest('[data-p]'); if (!b) return; pay = b.dataset.p; $('#nPay').querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b)); $('#nCashW').classList.toggle('hidden', pay !== 'efectivo'); };
    $('#nLoc').onclick = async () => { const l = await pickLocation('Ubicación del cliente', dest); if (l) { dest = l; $('#nLoc').textContent = '✅ Ubicación marcada'; } };
    $('#nSave').onclick = async () => {
      const items = $('#nItems').value.trim(), ref = $('#nRef').value.trim(), sub = +($('#nSub').value || 0);
      if (!items || !ref) return toast('Escribe qué lleva y la dirección/referencia');
      const z = ctx.zones.find(x => x.id === $('#nZone').value); const now = Date.now(); const now2 = $('#nNow').checked;
      const o = {
        code: shortCode(), type: 'tienda', createdBy: 'tienda', storeId: db.uid, storeName: store.name, storePhone: store.phone,
        pickup: { lat: store.lat, lng: store.lng, ref: store.ref || '' },
        clientUid: null, clientName: $('#nName').value.trim() || 'Cliente', clientPhone: $('#nPhone').value.trim(),
        dest: { ...(dest || {}), ref, zoneId: z?.id || null, zoneName: z?.name || '' },
        items, note: '', subtotal: sub, fee: fee(), total: sub + fee(), pay, payWith: pay === 'efectivo' ? +($('#nCash').value || 0) || null : null,
        status: now2 ? 'buscando' : 'preparando', active: true, day: dayKey(now), pin: pin4(), createdAt: now,
        times: { solicitado: now, preparando: now, ...(now2 ? { buscando: now } : {}) }, courierUid: null,
      };
      $('#nSave').disabled = true;
      try {
        const id = await db.add('orders', o);
        const b = sheet(`<h2>Domicilio #${o.code} creado</h2>
          <p class="note">${now2 ? 'Ya se avisó a los domiciliarios.' : 'Cuando esté listo, toca “Pedir domiciliario”.'}</p>
          <p>Código de entrega para el cliente: <b class="pinbig">${o.pin}</b></p>
          ${o.clientPhone ? `<a class="btn primary block" target="_blank" href="${waLink(o.clientPhone, `Hola ${o.clientName}, tu pedido #${o.code} de ${store.name} va en camino pronto. Síguelo en el mapa: ${trackUrl(id)}  Total: ${money(o.total)}. Código de entrega: ${o.pin}`)}">Enviar seguimiento por WhatsApp</a>` : ''}
          <button class="btn block" id="okNew">Listo</button>`);
        $('#okNew', b).onclick = () => { closeSheet(); setTab('pedidos'); };
      } catch (err) { $('#nSave').disabled = false; toast('No se pudo crear: ' + (err.message || err)); }
    };
  }

  function caja() {
    const done = today.filter(o => o.status === 'entregado');
    const canc = today.filter(o => o.status === 'cancelado');
    const sales = done.reduce((s, o) => s + (o.subtotal || 0), 0);
    const byCourier = {};
    for (const o of done.filter(o => o.pay === 'efectivo')) {
      const k = o.courierName || '—'; byCourier[k] = byCourier[k] || { n: 0, owe: 0, phone: o.courierPhone };
      byCourier[k].n++; byCourier[k].owe += o.subtotal || 0;
    }
    body.innerHTML = `<h2>Hoy</h2>
      <div class="stats"><div class="stat"><b>${done.length}</b><span>entregados</span></div><div class="stat"><b>${money(sales)}</b><span>ventas</span></div><div class="stat"><b>${canc.length}</b><span>cancelados</span></div></div>
      <h3>Efectivo que te deben entregar</h3>
      ${Object.keys(byCourier).length ? `<ul class="list">${Object.entries(byCourier).map(([k, v]) => `<li><div class="meta"><b>${esc(k)}</b><small>${v.n} pedido(s) en efectivo</small></div><b>${money(v.owe)}</b></li>`).join('')}</ul>`
        : '<p class="note">Sin pagos en efectivo pendientes hoy.</p>'}
      <h3>Pedidos de hoy</h3>
      <ul class="list">${today.sort((a, b) => b.createdAt - a.createdAt).map(o => `<li><div class="meta"><b>#${esc(o.code)} · ${esc(o.clientName)}</b><small>${hhmm(o.createdAt)} · ${PAY[o.pay]} · ${o.courierName ? esc(o.courierName) : 'sin domiciliario'}</small></div>${statusBadge(o.status)}</li>`).join('') || '<li class="note">Nada todavía</li>'}</ul>`;
  }

  render();
  return () => { if (prodStop) prodStop(); u0(); u1(); u2(); clearInterval(tick); body.onclick = null; };
}
