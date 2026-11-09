// MandaoYa – notificaciones push. Avisan aunque la app esté cerrada.
// Se publican con:  firebase deploy --only functions   (requiere el plan Blaze de Firebase)
const { onDocumentCreated, onDocumentUpdated } = require('firebase-functions/v2/firestore');
const { setGlobalOptions } = require('firebase-functions/v2');
const { initializeApp } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const { getMessaging } = require('firebase-admin/messaging');

initializeApp();
setGlobalOptions({ region: 'southamerica-east1', maxInstances: 5 });
const db = getFirestore();
const money = n => '$' + Math.round(+n || 0).toLocaleString('es-CO');

// Junta los tokens de una lista de usuarios: [{uid, token}]
async function tokensOf(uids) {
  const out = [];
  for (const uid of [...new Set(uids.filter(Boolean))]) {
    const u = await db.doc(`users/${uid}`).get();
    for (const t of (u.exists && u.get('fcmTokens')) || []) out.push({ uid, token: t });
  }
  return out;
}
async function onlineCouriers() {
  const s = await db.collection('users').where('role', '==', 'domiciliario').where('approved', '==', true).where('online', '==', true).get();
  return s.docs.map(d => d.id);
}
async function adminsAndSocios() {
  const a = await db.collection('admins').get();
  const s = await db.collection('users').where('socio', '==', true).get();
  return [...a.docs.map(d => d.id), ...s.docs.map(d => d.id)];
}

// Envía y limpia los tokens que ya no sirven
async function send(targets, title, body, data = {}) {
  if (!targets.length) return;
  const res = await getMessaging().sendEachForMulticast({
    tokens: targets.map(t => t.token),
    notification: { title, body },
    data: Object.fromEntries(Object.entries(data).map(([k, v]) => [k, String(v ?? '')])),
    android: { priority: 'high', notification: { channelId: 'pedidos', sound: 'default', defaultVibrateTimings: true } },
  });
  const dead = [];
  res.responses.forEach((r, i) => {
    const code = r.error && r.error.code;
    if (code === 'messaging/registration-token-not-registered' || code === 'messaging/invalid-registration-token') dead.push(targets[i]);
  });
  for (const d of dead) await db.doc(`users/${d.uid}`).update({ fcmTokens: FieldValue.arrayRemove(d.token) }).catch(() => {});
}

const where = o => o.type === 'mandado' ? 'Mandado' : (o.storeName || 'Tienda');

// ---------- Pedidos ----------
exports.pedidoNuevo = onDocumentCreated('orders/{id}', async e => {
  const o = e.data.data(), id = e.params.id;
  if (o.status === 'solicitado' && o.storeId)
    await send(await tokensOf([o.storeId]), `Nuevo pedido #${o.code}`, `${o.clientName || 'Cliente'} · ${o.dest?.zoneName || ''}`, { orderId: id, kind: 'tienda' });
  if (o.status === 'buscando')
    await send(await tokensOf(await onlineCouriers()), `Nuevo domicilio · gana ${money(o.fee)}`, `${where(o)} → ${o.dest?.zoneName || ''}`, { orderId: id, kind: 'domi' });
});

exports.pedidoCambio = onDocumentUpdated('orders/{id}', async e => {
  const b = e.data.before.data(), a = e.data.after.data(), id = e.params.id;
  if (b.issue !== a.issue && a.issue)
    await send(await tokensOf((await db.collection('admins').get()).docs.map(d => d.id)), `Problema en el pedido #${a.code}`, a.issue, { orderId: id, kind: 'admin' });
  if (b.status === a.status) return;
  const client = a.clientUid ? await tokensOf([a.clientUid]) : [];
  switch (a.status) {
    case 'preparando':
      await send(client, 'La tienda confirmó tu pedido', `${where(a)} · total ${money(a.total)}`, { orderId: id });
      break;
    case 'buscando':
      await send(await tokensOf(await onlineCouriers()), `Nuevo domicilio · gana ${money(a.fee)}`, `${where(a)} → ${a.dest?.zoneName || ''}`, { orderId: id, kind: 'domi' });
      break;
    case 'asignado':
      await send(client, `${a.courierName} va por tu pedido`, where(a), { orderId: id });
      if (a.storeId) await send(await tokensOf([a.storeId]), `${a.courierName} va por el pedido #${a.code}`, 'Tenlo listo para entregar', { orderId: id, kind: 'tienda' });
      break;
    case 'recogido':
      await send(client, 'Tu pedido va en camino', `${a.courierName} ya lo recogió`, { orderId: id });
      break;
    case 'entregado':
      await send(client, '¡Pedido entregado!', 'Cuéntanos cómo te fue: califica tu domicilio', { orderId: id });
      break;
    case 'cancelado': {
      const who = [a.clientUid, a.courierUid, a.cancelBy !== 'tienda' ? a.storeId : null];
      await send(await tokensOf(who), `Pedido #${a.code} cancelado`, a.cancelReason || '', { orderId: id });
      break;
    }
  }
});

// ---------- Recargas de saldo ----------
exports.recargaNueva = onDocumentCreated('topups/{id}', async e => {
  const t = e.data.data();
  await send(await tokensOf(await adminsAndSocios()), `Recarga por aprobar · ${money(t.amount)}`, `${t.courierName} · ${t.method}`, { kind: 'recarga' });
});
exports.recargaRevisada = onDocumentUpdated('topups/{id}', async e => {
  const b = e.data.before.data(), a = e.data.after.data();
  if (b.status === a.status || a.status === 'pendiente') return;
  await send(await tokensOf([a.courierUid]),
    a.status === 'aprobada' ? `Recarga aprobada: +${money(a.amount)}` : 'Recarga rechazada',
    a.status === 'aprobada' ? 'Ya puedes aceptar domicilios' : (a.reviewNote || 'Revisa el pago y vuelve a intentar'), { kind: 'recarga' });
});

// ---------- Carreras ----------
const VEH = { moto: 'moto', carro: 'carro', lancha: 'lancha' };
async function rideDrivers(vehicle) {
  const s = await db.collection('users').where('role', '==', 'domiciliario').where('approved', '==', true).where('online', '==', true).get();
  return s.docs.filter(d => d.get('rides') === true && (d.get('rideVehicle') || d.get('vehicle')) === vehicle).map(d => d.id);
}
exports.carreraNueva = onDocumentCreated('rides/{id}', async e => {
  const r = e.data.data();
  await send(await tokensOf(await rideDrivers(VEH[r.vehicle] || 'moto')), `Nueva carrera · ofrecen ${money(r.offer)}`,
    `${r.origin?.ref || 'Recogida'} → ${r.dest?.ref || 'Destino'}`, { rideId: e.params.id, kind: 'carrera' });
});
exports.carreraCambio = onDocumentUpdated('rides/{id}', async e => {
  const b = e.data.before.data(), a = e.data.after.data(), id = e.params.id;
  const newOffers = Object.keys(a.offers || {}).filter(k => !(b.offers || {})[k]);
  for (const k of newOffers)
    await send(await tokensOf([a.clientUid]), `Nueva oferta: ${money(a.offers[k].price)}`, `${a.offers[k].name} puede llevarte`, { rideId: id });
  if (b.offer !== a.offer && a.status === 'buscando')
    await send(await tokensOf(await rideDrivers(VEH[a.vehicle] || 'moto')), `Subieron la oferta: ${money(a.offer)}`, `${a.origin?.ref || ''} → ${a.dest?.ref || ''}`, { rideId: id, kind: 'carrera' });
  if (b.status === a.status) return;
  switch (a.status) {
    case 'asignada': await send(await tokensOf([a.driverUid]), '¡Te eligieron para una carrera!', `Recoge a ${a.clientName}: ${a.origin?.ref || ''}`, { rideId: id, kind: 'carrera' }); break;
    case 'llego': await send(await tokensOf([a.clientUid]), 'Tu conductor llegó', `${a.driverName} te está esperando`, { rideId: id }); break;
    case 'finalizada': await send(await tokensOf([a.clientUid]), 'Viaje terminado', 'Califica a tu conductor', { rideId: id }); break;
    case 'cancelada': await send(await tokensOf([a.clientUid, a.driverUid]), `Carrera #${a.code} cancelada`, a.cancelReason || '', { rideId: id }); break;
  }
});
