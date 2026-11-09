// MandaoYa – pantalla de SEGUIMIENTO del pedido (cliente o cualquiera con el enlace)
import { $, esc, money, toast, ask, sheet, closeSheet, PAY, STATUS, stepper, hhmm, waLink, telLink, orderEta, haversine, fdist,
  makeMap, ICONS, fitTo, beep, VEHICLES, trackUrl } from './ui.js';

export function mount(root, ctx, id) {
  const { db } = ctx;
  let map = null, mk = {}, lastStatus = null, fitted = false, o = null;
  root.innerHTML = `<div class="pad"><button class="link" id="sBack">‹ Volver</button><div id="sTop"></div></div>
    <div id="sMap" class="map tall"></div><div class="pad" id="sInfo"></div>`;
  $('#sBack', root).onclick = () => { location.hash = ''; };
  map = makeMap($('#sMap', root));

  const unsub = db.watchDoc('orders', id, d => {
    o = d;
    if (!o) { $('#sTop', root).innerHTML = '<h2>Pedido no encontrado</h2><p class="note">Revisa el enlace.</p>'; return; }
    if (lastStatus && lastStatus !== o.status) { beep(2); toast(STATUS[o.status][0]); }
    const statusChanged = lastStatus !== o.status; lastStatus = o.status;
    renderTop(); updateMap(statusChanged); if (statusChanged || !$('#sInfo', root).innerHTML) renderInfo();
  });
  const tick = setInterval(() => o && renderTop(), 30000);

  function renderTop() {
    const eta = orderEta(o);
    const etaTxt = eta != null ? `<div class="eta"><b>${eta} min</b><span>Llega aprox. ${hhmm(Date.now() + eta * 60000)}</span></div>` : '';
    const isCourier = db.uid && o.courierUid === db.uid;
    const showPin = !isCourier && o.active && ['asignado', 'recogido'].includes(o.status);
    $('#sTop', root).innerHTML = `<div class="rowb"><h2>${esc(o.type === 'mandado' ? 'Mandado' : o.storeName)} <small>#${esc(o.code)}</small></h2></div>
      ${stepper(o.status)}
      ${etaTxt}
      ${o.status === 'buscando' ? '<p class="note">Estamos avisando a los domiciliarios cercanos…</p>' : ''}
      ${o.status === 'solicitado' ? '<p class="note">La tienda está revisando tu pedido. Te confirmará el valor.</p>' : ''}
      ${o.status === 'cancelado' ? `<p class="note">Motivo: ${esc(o.cancelReason || '—')}</p>` : ''}
      ${showPin ? `<div class="pinbox">Código de entrega <b>${esc(o.pin)}</b><small>Dáselo al domiciliario solo cuando recibas tu pedido</small></div>` : ''}`;
  }

  function updateMap(refit) {
    const set = (k, p, ic) => {
      if (!p?.lat) { if (mk[k]) { mk[k].remove(); delete mk[k]; } return; }
      if (mk[k]) mk[k].setLatLng([p.lat, p.lng]); else mk[k] = L.marker([p.lat, p.lng], { icon: ic() }).addTo(map);
    };
    set('store', o.pickup, ICONS.store); set('dest', o.dest, ICONS.dest);
    const showCourier = ['asignado', 'recogido'].includes(o.status) && o.courierLoc;
    set('courier', showCourier ? o.courierLoc : null, ICONS.courier);
    const pts = [o.pickup?.lat ? o.pickup : null, o.dest?.lat ? o.dest : null, showCourier ? o.courierLoc : null];
    if (mk.line) { mk.line.remove(); delete mk.line; }
    if (showCourier) {
      const target = o.status === 'asignado' && o.pickup?.lat ? o.pickup : o.dest;
      if (target?.lat) mk.line = L.polyline([[o.courierLoc.lat, o.courierLoc.lng], [target.lat, target.lng]], { color: '#ea580c', weight: 3, dashArray: '6 8' }).addTo(map);
    }
    if (!fitted || refit) { fitTo(map, pts); fitted = true; }
  }

  function renderInfo() {
    const mineAsClient = db.uid && o.clientUid === db.uid;
    const canCancel = mineAsClient && ['solicitado', 'preparando', 'buscando'].includes(o.status);
    const change = o.pay === 'efectivo' && o.payWith && o.total ? o.payWith - o.total : 0;
    $('#sInfo', root).innerHTML = `
      ${o.courierName && o.status !== 'cancelado' ? `<div class="card courier"><span class="ci">🛵</span><div><b>${esc(o.courierName)}</b>
          <small>${esc(VEHICLES[o.courierVehicle]?.[0] || '')}${o.courierPlate ? ' · ' + esc(o.courierPlate) : ''}${o.courierLoc && o.dest?.lat && o.status !== 'entregado' ? ' · a ' + fdist(haversine(o.courierLoc, o.dest)) : ''}</small></div>
          ${o.active ? `<div class="row tight"><a class="btn small" href="${telLink(o.courierPhone)}">Llamar</a><a class="btn small" target="_blank" href="${waLink(o.courierPhone, `Hola ${o.courierName}, sobre mi pedido #${o.code}`)}">WhatsApp</a></div>` : ''}</div>` : ''}
      <div class="card"><small class="lbl">Tu pedido</small><div class="items">${esc(o.items)}</div>
        <small>Entregar en: ${esc(o.dest?.zoneName || '')} · ${esc(o.dest?.ref || '')}</small>
        <div class="sum">
          ${o.subtotal != null ? `<div class="rowb"><span>${o.type === 'mandado' ? 'Compra aprox.' : 'Productos'}</span><span>${money(o.subtotal)}</span></div>` : '<div class="rowb"><span>Productos</span><span>Por confirmar</span></div>'}
          <div class="rowb"><span>Domicilio</span><span>${money(o.fee)}</span></div>
          <div class="rowb total"><span>Total · ${PAY[o.pay]}</span><b>${o.total != null ? money(o.total) : '—'}</b></div>
          ${change > 0 ? `<div class="rowb"><span>Pagas con ${money(o.payWith)} · cambio</span><span>${money(change)}</span></div>` : ''}
          ${o.pay !== 'efectivo' && o.active ? `<p class="note">Paga por ${PAY[o.pay]} al número de la tienda${o.storePhone ? ' (' + esc(o.storePhone) + ')' : ''} y muéstrale el comprobante al domiciliario.</p>` : ''}
        </div></div>
      ${o.storePhone ? `<div class="row"><a class="btn" href="${telLink(o.storePhone)}">Llamar a la tienda</a><a class="btn" target="_blank" href="${waLink(o.storePhone, `Hola, sobre mi pedido #${o.code}`)}">WhatsApp tienda</a></div>` : ''}
      <button class="btn block" id="sShare">Compartir seguimiento</button>
      ${canCancel ? '<button class="btn danger block" id="sCancel">Cancelar pedido</button>' : ''}
      ${o.status === 'entregado' && mineAsClient && !o.rating ? `<div class="card center"><b>¿Cómo te fue?</b><div class="stars" id="sStars">${[1, 2, 3, 4, 5].map(n => `<button data-r="${n}">★</button>`).join('')}</div></div>` : ''}
      ${o.rating ? `<p class="note center">Calificaste este pedido con ${'★'.repeat(o.rating)}</p>` : ''}`;
    const sh = $('#sShare', root);
    sh.onclick = async () => {
      const url = trackUrl(o.id);
      try { if (navigator.share) await navigator.share({ title: 'Pedido MandaoYa', url }); else { await navigator.clipboard.writeText(url); toast('Enlace copiado'); } } catch (e) { }
    };
    const c = $('#sCancel', root);
    if (c) c.onclick = async () => {
      if (o.status !== 'solicitado' && !(await ask('¿Cancelar?', 'La tienda ya confirmó tu pedido. Avísale también por WhatsApp.', 'Cancelar pedido', true))) return;
      if (o.status === 'solicitado' && !(await ask('¿Cancelar el pedido?', '', 'Sí, cancelar', true))) return;
      try { await db.update('orders', o.id, { status: 'cancelado', active: false, cancelReason: 'Cancelado por el cliente', cancelBy: 'cliente', 'times.cancelado': Date.now() }); }
      catch (e) { toast('No se pudo cancelar: ' + (e.message || e)); }
    };
    const st = $('#sStars', root);
    if (st) st.onclick = async e => { const r = e.target.closest('[data-r]'); if (!r) return; await db.update('orders', o.id, { rating: +r.dataset.r }); toast('¡Gracias por calificar!'); renderInfo(); };
  }

  return () => { unsub(); clearInterval(tick); map && map.remove(); };
}
