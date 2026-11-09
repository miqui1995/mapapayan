// MandaoYa – interfaz del CLIENTE
import { mountCatalog, cartLines, cartTotal } from './catalogo.js';
import { mountClientRide, ridesOn } from './carreras.js';
import { $, esc, money, toast, pickLocation, STORE_CATS, PAY, statusBadge, shortCode, pin4, dayKey, ago } from './ui.js';

export function mount(root, ctx) {
  const { db } = ctx;
  let tab = 'pedir', stores = [], orders = [], view = 'list', catUnsub = null;
  const carts = {};
  const stopCat = () => { if (catUnsub) { catUnsub(); catUnsub = null; } };
  let rideStop = null;
  const startTab = sessionStorage.getItem('mandaoya_tab'); sessionStorage.removeItem('mandaoya_tab');
  root.innerHTML = `<div class="tabs"><button data-t="pedir" class="on">Pedir</button>${ridesOn(ctx) ? '<button data-t="carrera">Carrera</button>' : ''}<button data-t="mis">Mis pedidos <span id="cBadge" class="cnt hidden"></span></button></div>
    <div id="cBody" class="pad"></div>`;
  const body = $('#cBody', root);
  root.querySelector('.tabs').onclick = e => { const b = e.target.closest('[data-t]'); if (!b) return; tab = b.dataset.t; root.querySelectorAll('.tabs button').forEach(x => x.classList.toggle('on', x === b)); render(); };

  const u1 = db.watch('stores', [['approved', '==', true]], s => { stores = s; if (tab === 'pedir' && view === 'list') render(); });
  const u2 = db.watch('orders', [['clientUid', '==', db.uid]], o => {
    orders = o.sort((a, b) => b.createdAt - a.createdAt);
    const act = orders.filter(x => x.active).length;
    $('#cBadge', root).textContent = act; $('#cBadge', root).classList.toggle('hidden', !act);
    if (tab === 'mis') render();
  });

  function render() {
    stopCat(); view = 'list';
    if (rideStop) { rideStop(); rideStop = null; }
    if (tab === 'carrera') { view = 'ride'; rideStop = mountClientRide(body, ctx); return; }
    if (tab === 'pedir') {
      const list = [...stores].sort((a, b) => (b.open - a.open) || a.name.localeCompare(b.name));
      const act = orders.filter(o => o.active);
      body.innerHTML = `
        ${act.length ? `<button class="card active-banner" data-go="${act[0].id}"><b>Tienes ${act.length} pedido(s) en curso</b><small>Toca para ver el seguimiento</small></button>` : ''}
        <button class="card mandado" id="cMandado"><span class="ci">🛵</span><div><b>Mandado</b><small>Que te traigan o lleven lo que necesites: compras, paquetes, recibos…</small></div></button>
        <h3>Tiendas</h3>
        ${list.length ? list.map(s => `<button class="card store ${s.open ? '' : 'closed'}" data-s="${s.id}">
            <span class="ci">${{ drogueria: '💊', restaurante: '🍗', panaderia: '🥖', carniceria: '🐟', licores: '🍺', ferreteria: '🔧' }[s.cat] || '🏪'}</span>
            <div><b>${esc(s.name)}</b><small>${esc(STORE_CATS[s.cat] || '')}${s.hours ? ' · ' + esc(s.hours) : ''}</small>
            <small>${s.open ? '<span class="ok">● Abierta</span>' : '<span class="off">● Cerrada</span>'}${s.ref ? ' · ' + esc(s.ref) : ''}</small></div></button>`).join('')
          : '<p class="note">Aún no hay tiendas registradas.</p>'}`;
    } else {
      body.innerHTML = orders.length ? orders.map(o => `<button class="card order" data-go="${o.id}">
          <div class="rowb"><b>${esc(o.type === 'mandado' ? 'Mandado' : o.storeName)}</b>${statusBadge(o.status)}</div>
          <small>#${esc(o.code)} · ${ago(o.createdAt)} · ${o.total ? money(o.total) : 'Valor por confirmar'}</small>
          <small class="clip">${esc(o.items)}</small></button>`).join('') : '<p class="note">Aún no has hecho pedidos.</p>';
    }
  }
  body.onclick = e => {
    const go = e.target.closest('[data-go]'); if (go) { location.hash = '#/seguir/' + go.dataset.go; return; }
    const s = e.target.closest('[data-s]');
    if (s) { const st = stores.find(x => x.id === s.dataset.s); if (!st.open) return toast('Esta tienda está cerrada en este momento'); openStore(st); }
    if (e.target.closest('#cMandado')) orderForm(null);
  };

  function openStore(st) {
    stopCat(); view = 'catalog'; window.scrollTo(0, 0);
    const cart = carts[st.id] = carts[st.id] || {};
    catUnsub = mountCatalog(body, ctx, st, cart, {
      onCheckout: () => { stopCat(); orderForm(st, cart); },
      onBack: render,
      onNoProducts: () => { stopCat(); orderForm(st, null); },
    });
  }

  function orderForm(store, cart) {
    view = 'form'; window.scrollTo(0, 0);
    const hasCart = cart && Object.keys(cart).length > 0;
    const me = ctx.me; const addr = me.address || {};
    let dest = addr.lat ? { lat: addr.lat, lng: addr.lng } : null, pickup = null;
    const zoneOpts = ctx.zones.map(z => `<option value="${z.id}" ${addr.zoneId === z.id ? 'selected' : ''}>${esc(z.name)} — ${money(z.fee)}</option>`).join('');
    body.innerHTML = `<button class="link" id="oBack">‹ Volver</button>
      <h2>${store ? esc(store.name) : 'Nuevo mandado'}</h2>
      ${store ? `<p class="note">${esc(store.ref || '')}</p>` : ''}
      ${hasCart ? `<div class="card"><small class="lbl">Tu pedido</small>${Object.values(cart).map(c => `<div class="rowb"><span>${c.qty} × ${esc(c.name)}</span><span>${money(c.qty * c.price)}</span></div>`).join('')}
        <button class="link" id="oEditCart">Editar productos</button></div>` : ''}
      <label class="f">${hasCart ? '¿Algo más que no esté en el catálogo? (opcional)' : store ? '¿Qué necesitas?' : '¿Qué hay que hacer?'}</label>
      <textarea class="in ${hasCart ? '' : 'big'}" id="oItems" placeholder="${store ? 'Ej: 2 libras de arroz, 1 aceite de litro, 1 bolsa de leche' : 'Ej: recoger un paquete donde mi tía y traérmelo / comprar 1 pipeta de gas'}"></textarea>
      ${store ? '' : `<label class="f">¿Dónde se recoge o se compra?</label>
        <input class="in" id="oPickRef" placeholder="Ej: donde Don Pedro, al lado del muelle">
        <button class="btn block" id="oPickLoc">📍 Marcar en el mapa (opcional)</button>
        <label class="f">Valor aproximado de la compra (si hay que comprar)</label>
        <input class="in" id="oEst" type="number" inputmode="numeric" placeholder="0">`}
      <h3>Entrega</h3>
      <label class="f">Sector</label><select class="in" id="oZone">${zoneOpts}</select>
      <label class="f">Dirección o referencia</label>
      <textarea class="in" id="oRef" placeholder="Ej: casa azul de dos pisos, frente a la cancha">${esc(addr.ref || '')}</textarea>
      <button class="btn block" id="oLoc">${dest ? '✅ Ubicación guardada (cambiar)' : '📍 Marcar mi ubicación en el mapa'}</button>
      <h3>Pago</h3>
      <div class="seg" id="oPay">${Object.entries(PAY).map(([k, v], i) => `<button data-p="${k}" class="${i ? '' : 'on'}">${v}</button>`).join('')}</div>
      <div id="oCashW"><label class="f">¿Con cuánto vas a pagar? (para llevarte el cambio)</label>
        <input class="in" id="oCash" type="number" inputmode="numeric" placeholder="Ej: 50000"></div>
      <label class="f">Nota para el domiciliario (opcional)</label><input class="in" id="oNote" placeholder="Ej: tocar fuerte, perro bravo">
      <div class="sum" id="oSum"></div>
      <button class="btn primary block" id="oSend">${store ? 'Enviar pedido' : 'Pedir mandado'}</button>
      <p class="note">${store ? 'La tienda confirmará el valor de los productos antes de enviarlo.' : 'Un domiciliario aceptará tu mandado y verás en el mapa cuándo llega.'}</p>`;
    let pay = 'efectivo';
    const zone = () => ctx.zones.find(z => z.id === $('#oZone').value);
    const fee = () => zone()?.fee ?? ctx.settings.baseFee ?? 3000;
    const sum = () => {
      const est = store ? null : +($('#oEst')?.value || 0);
      $('#oSum').innerHTML = `<div class="rowb"><span>Domicilio</span><b>${money(fee())}</b></div>
        ${hasCart ? `<div class="rowb"><span>Productos</span><b>${money(cartTotal(cart))}</b></div><div class="rowb total"><span>Total</span><b>${money(cartTotal(cart) + fee())}</b></div>` : store ? '<div class="rowb"><span>Productos</span><span>Lo confirma la tienda</span></div>' : est ? `<div class="rowb"><span>Compra aprox.</span><b>${money(est)}</b></div>` : ''}`;
    };
    sum();
    $('#oZone').onchange = sum; if ($('#oEst')) $('#oEst').oninput = sum;
    $('#oBack').onclick = () => hasCart ? openStore(store) : render();
    if ($('#oEditCart')) $('#oEditCart').onclick = () => openStore(store);
    $('#oPay').onclick = e => { const b = e.target.closest('[data-p]'); if (!b) return; pay = b.dataset.p; $('#oPay').querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b)); $('#oCashW').classList.toggle('hidden', pay !== 'efectivo'); };
    $('#oLoc').onclick = async () => { const l = await pickLocation('¿Dónde entregamos?', dest); if (l) { dest = l; $('#oLoc').textContent = '✅ Ubicación marcada (cambiar)'; } };
    if ($('#oPickLoc')) $('#oPickLoc').onclick = async () => { const l = await pickLocation('¿Dónde se recoge?', pickup); if (l) { pickup = l; $('#oPickLoc').textContent = '✅ Punto de recogida marcado'; } };
    $('#oSend').onclick = async () => {
      const extra = $('#oItems').value.trim(), ref = $('#oRef').value.trim();
      const items = hasCart ? cartLines(cart) + (extra ? '\nAdemás: ' + extra : '') : extra;
      if (!items) return toast(store ? 'Escribe qué necesitas' : 'Describe el mandado');
      if (!ref && !dest) return toast('Escribe una referencia o marca tu ubicación');
      const z = zone(); const now = Date.now();
      const est = store ? (hasCart ? cartTotal(cart) : 0) : +($('#oEst').value || 0);
      const o = {
        code: shortCode(), type: store ? 'tienda' : 'mandado', createdBy: 'cliente',
        storeId: store ? store.id : null, storeName: store ? store.name : null, storePhone: store ? store.phone : null,
        pickup: store ? { lat: store.lat, lng: store.lng, ref: store.ref || '' } : { ...(pickup || {}), ref: $('#oPickRef').value.trim() },
        clientUid: db.uid, clientName: me.name, clientPhone: me.phone,
        dest: { ...(dest || {}), ref, zoneId: z?.id || null, zoneName: z?.name || '' },
        items, cart: hasCart ? Object.values(cart) : null, note: $('#oNote').value.trim(),
        subtotal: store && !hasCart ? null : est, fee: fee(), total: store && !hasCart ? null : est + fee(),
        pay, payWith: pay === 'efectivo' ? +($('#oCash').value || 0) || null : null,
        status: store ? 'solicitado' : 'buscando', active: true, day: dayKey(now), pin: pin4(),
        createdAt: now, times: { [store ? 'solicitado' : 'buscando']: now }, courierUid: null,
      };
      $('#oSend').disabled = true;
      try {
        const id = await db.add('orders', o);
        db.update('users', db.uid, { address: { lat: dest?.lat ?? null, lng: dest?.lng ?? null, ref, zoneId: z?.id || null } }).catch(() => { });
        if (store) delete carts[store.id];
        toast('¡Pedido enviado!'); location.hash = '#/seguir/' + id;
      } catch (e) { $('#oSend').disabled = false; toast('No se pudo enviar: ' + (e.message || e)); }
    };
  }

  render();
  if (startTab === 'carrera' && ridesOn(ctx)) { tab = 'carrera'; root.querySelectorAll('.tabs button').forEach(x => x.classList.toggle('on', x.dataset.t === 'carrera')); render(); }
  return () => { stopCat(); if (rideStop) rideStop(); u1(); u2(); body.onclick = null; };
}
