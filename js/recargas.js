// MandaoYa – SALDO PREPAGADO de domiciliarios
// El domiciliario recarga (Nequi/Daviplata con comprobante, o efectivo con un socio local),
// el admin o un socio aprueba, y cada domicilio aceptado descuenta la comisión fija.
import { $, esc, money, toast, ask, sheet, closeSheet, fdate, ago, waLink } from './ui.js';
import { photoToDataURL } from './catalogo.js';

export const prepaidOn = ctx => !!ctx.settings?.prepaidEnabled;
export const courierFee = ctx => +(ctx.settings?.courierFee ?? 500);
export const minTopup = ctx => +(ctx.settings?.minTopup ?? 5000);
const METHODS = { nequi: 'Nequi', daviplata: 'Daviplata', efectivo: 'Efectivo con socio' };
const weekAgo = () => Date.now() - 7 * 86400000;

// ---------- Domiciliario: tarjeta de saldo + historial ----------
export function balanceCard(ctx, movements = [], topups = []) {
  const bal = ctx.me.balance || 0, fee = courierFee(ctx);
  const left = Math.floor(bal / fee);
  const pend = topups.filter(t => t.status === 'pendiente');
  return `<div class="card balance ${bal < fee ? 'empty' : bal < fee * 4 ? 'low' : ''}">
      <small class="lbl">Mi saldo MandaoYa</small>
      <div class="rowb"><b class="balAmt">${money(bal)}</b><button class="btn primary" data-rc="open">Recargar</button></div>
      <small>${bal < fee ? `Sin saldo: recarga para seguir aceptando domicilios.` : `Alcanza para ${left} domicilio(s) o carrera(s). Cada uno descuenta ${money(fee)}.`}</small>
      ${pend.length ? `<div class="warn">Recarga en revisión: ${pend.map(t => money(t.amount)).join(', ')}</div>` : ''}
    </div>
    <h3>Movimientos del saldo</h3>
    <ul class="list">${[...movements].sort((a, b) => b.at - a.at).slice(0, 40).map(m => `<li><div class="meta"><b>${esc(m.type === 'comision' && m.rideId ? 'Comisión carrera' : ({ recarga: 'Recarga', comision: 'Comisión domicilio', devolucion: 'Devolución', ajuste: 'Ajuste', bono: 'Crédito de bienvenida' }[m.type] || m.type))}${m.orderCode ? ' #' + esc(m.orderCode) : ''}</b>
      <small>${fdate(m.at)}${m.note ? ' · ' + esc(m.note) : ''}</small></div><b class="${m.amount < 0 ? 'neg' : 'pos'}">${m.amount < 0 ? '−' : '+'} ${money(Math.abs(m.amount))}</b></li>`).join('')
      || '<li class="note">Sin movimientos todavía.</li>'}</ul>
    ${topups.filter(t => t.status === 'rechazada' && t.reviewedAt > weekAgo()).map(t => `<div class="warn">Recarga de ${money(t.amount)} rechazada${t.reviewNote ? ': ' + esc(t.reviewNote) : ''}</div>`).join('')}`;
}

export function topupSheet(ctx) {
  const S = ctx.settings || {}, { db } = ctx;
  let amount = Math.max(minTopup(ctx), 10000), method = S.topupNequi ? 'nequi' : 'efectivo', receipt = null;
  const amounts = [5000, 10000, 20000, 50000].filter(a => a >= minTopup(ctx));
  const b = sheet(`<h2>Recargar saldo</h2>
    <label class="f">¿Cuánto quieres recargar?</label>
    <div class="chips" id="rcAmts">${amounts.map(a => `<button class="chip ${a === amount ? 'on' : ''}" data-a="${a}">${money(a)}</button>`).join('')}</div>
    <input class="in" id="rcOther" type="number" inputmode="numeric" placeholder="Otro valor (mínimo ${money(minTopup(ctx))})">
    <label class="f">¿Cómo vas a pagar?</label>
    <div class="seg" id="rcMeth">${Object.entries(METHODS).filter(([k]) => k === 'efectivo' || S.topupNequi).map(([k, v]) => `<button data-m="${k}" class="${k === method ? 'on' : ''}">${v}</button>`).join('')}</div>
    <div id="rcInfo"></div>
    <button class="btn primary block" id="rcSend">Enviar recarga</button>
    <p class="note">Tu saldo se carga cuando el administrador o un socio confirme el pago.</p>`);
  const info = () => {
    const isDig = method !== 'efectivo';
    $('#rcInfo', b).innerHTML = isDig
      ? `<div class="card"><small class="lbl">Envía ${money(amount)} por ${METHODS[method]} a</small><div class="rowb"><b class="mono big">${esc(S.topupNequi)}</b><button class="btn small" id="rcCopy">Copiar</button></div>
          ${S.topupName ? `<small>A nombre de ${esc(S.topupName)}</small>` : ''}</div>
          <label class="f">Foto o captura del comprobante</label>
          <div class="photoPick small" id="rcBox">${receipt ? `<img src="${receipt}" alt="">` : '<span>🧾<br><small>Agregar comprobante</small></span>'}</div>
          <input type="file" id="rcFile" accept="image/*" class="hidden">`
      : `<div class="card"><small>Entrega ${money(amount)} en efectivo a un socio de MandaoYa${S.socioInfo ? ': <b>' + esc(S.socioInfo) + '</b>' : ''}. Él aprueba tu recarga desde su celular.</small></div>`;
    if (isDig) {
      $('#rcCopy', b).onclick = () => navigator.clipboard?.writeText(S.topupNequi).then(() => toast('Número copiado'));
      $('#rcBox', b).onclick = () => $('#rcFile', b).click();
      $('#rcFile', b).onchange = async e => { const f = e.target.files[0]; if (!f) return; try { receipt = await photoToDataURL(f, 900, 0.6); info(); } catch (err) { toast('No se pudo leer la imagen'); } };
    }
  };
  info();
  $('#rcAmts', b).onclick = e => { const c = e.target.closest('[data-a]'); if (!c) return; amount = +c.dataset.a; $('#rcOther', b).value = ''; b.querySelectorAll('#rcAmts .chip').forEach(x => x.classList.toggle('on', x === c)); info(); };
  $('#rcOther', b).oninput = e => { const v = +e.target.value; if (v) { amount = v; b.querySelectorAll('#rcAmts .chip').forEach(x => x.classList.remove('on')); info(); } };
  $('#rcMeth', b).onclick = e => { const c = e.target.closest('[data-m]'); if (!c) return; method = c.dataset.m; b.querySelectorAll('#rcMeth button').forEach(x => x.classList.toggle('on', x === c)); info(); };
  $('#rcSend', b).onclick = async () => {
    if (amount < minTopup(ctx)) return toast(`La recarga mínima es ${money(minTopup(ctx))}`);
    if (method !== 'efectivo' && !receipt) return toast('Agrega la foto del comprobante');
    $('#rcSend', b).disabled = true;
    try {
      await db.add('topups', { courierUid: db.uid, courierName: ctx.me.name, courierPhone: ctx.me.phone, amount, method, receipt: receipt || null, status: 'pendiente', createdAt: Date.now() });
      closeSheet(); toast('Recarga enviada. Te avisamos cuando la aprueben.');
    } catch (e) { $('#rcSend', b).disabled = false; toast('No se pudo enviar: ' + (e.message || e)); }
  };
}

// ---------- Aprobar recargas (admin o socio) ----------
export async function approveTopup(ctx, tp) {
  const { db } = ctx; const now = Date.now();
  await db.runTx(async t => {
    const cur = await t.get('topups', tp.id); if (!cur || cur.status !== 'pendiente') throw new Error('Esta recarga ya fue revisada');
    const u = await t.get('users', cur.courierUid); if (!u) throw new Error('El domiciliario no existe');
    const bal = (u.balance || 0) + cur.amount;
    t.update('users', cur.courierUid, { balance: bal });
    t.update('topups', tp.id, { status: 'aprobada', reviewedBy: db.uid, reviewedByName: ctx.me.name, reviewedAt: now });
    t.set('movements', db.newId(), { courierUid: cur.courierUid, type: 'recarga', amount: cur.amount, method: cur.method, topupId: tp.id, balanceAfter: bal, by: db.uid, byName: ctx.me.name, at: now });
  });
}
export async function adjustBalance(ctx, courier, amount, note) {
  const { db } = ctx; const now = Date.now();
  await db.runTx(async t => {
    const u = await t.get('users', courier.id); const bal = (u.balance || 0) + amount;
    t.update('users', courier.id, { balance: bal });
    t.set('movements', db.newId(), { courierUid: courier.id, type: 'ajuste', amount, note: note || '', balanceAfter: bal, by: db.uid, byName: ctx.me.name, at: now });
  });
}
// Devolver la comisión cuando el admin cancela o reasigna un pedido ya cobrado
export async function refundFee(ctx, order) {
  if (!order.feeCharged || order.feeRefunded || !order.courierUid) return;
  const { db } = ctx; const now = Date.now();
  await db.runTx(async t => {
    const u = await t.get('users', order.courierUid); if (!u) return;
    const bal = (u.balance || 0) + order.feeCharged;
    t.update('users', order.courierUid, { balance: bal });
    t.update('orders', order.id, { feeRefunded: true });
    t.set('movements', db.newId(), { courierUid: order.courierUid, type: 'devolucion', amount: order.feeCharged, orderId: order.id, orderCode: order.code, balanceAfter: bal, by: db.uid, at: now });
  });
}

// Lista de recargas pendientes + resumen semanal de quien aprueba (para admin y socios)
export function mountTopupReview(box, ctx, { asSocio = false } = {}) {
  const { db } = ctx;
  let pending = [], mine = [];
  const u1 = db.watch('topups', [['status', '==', 'pendiente']], t => { pending = t.sort((a, b) => a.createdAt - b.createdAt); draw(); });
  const u2 = db.watch('topups', [['reviewedBy', '==', db.uid]], t => { mine = t.filter(x => x.status === 'aprobada' && x.reviewedAt > weekAgo()); draw(); });
  function draw() {
    const cash = mine.filter(t => t.method === 'efectivo').reduce((s, t) => s + t.amount, 0);
    const pct = +(ctx.settings?.socioPct ?? 20);
    box.innerHTML = `<h2>Recargas por aprobar ${pending.length ? `<span class="cnt">${pending.length}</span>` : ''}</h2>
      ${pending.map(t => `<div class="card" data-tp="${t.id}">
        <div class="rowb"><b>${esc(t.courierName)}</b><b class="pos">${money(t.amount)}</b></div>
        <small>${METHODS[t.method] || t.method} · ${ago(t.createdAt)} · ${esc(t.courierPhone || '')}</small>
        ${t.receipt ? `<img class="receipt" src="${t.receipt}" alt="Comprobante">` : t.method === 'efectivo' ? '<small><b>Confirma que recibiste el efectivo en la mano.</b></small>' : '<small>Sin comprobante</small>'}
        ${t.method !== 'efectivo' ? '<small>Revisa en tu Nequi/Daviplata que el pago haya llegado antes de aprobar.</small>' : ''}
        <div class="row"><a class="btn small" target="_blank" href="${waLink(t.courierPhone, `Hola ${t.courierName}, sobre tu recarga de ${money(t.amount)} en MandaoYa`)}">WhatsApp</a>
          <button class="btn small danger" data-rv="reject">Rechazar</button><button class="btn small primary" data-rv="approve">Aprobar</button></div></div>`).join('')
        || '<p class="note">No hay recargas pendientes.</p>'}
      <h3>Aprobadas por ti (últimos 7 días)</h3>
      <div class="card sum">
        <div class="rowb"><span>Recargas aprobadas</span><b>${mine.length} · ${money(mine.reduce((s, t) => s + t.amount, 0))}</b></div>
        <div class="rowb"><span>Recibido en efectivo</span><b>${money(cash)}</b></div>
        ${asSocio ? `<div class="rowb"><span>Tu parte como socio (${pct}%)</span><b>${money(cash * pct / 100)}</b></div>
          <div class="rowb total"><span>Debes entregar a MandaoYa</span><b>${money(cash * (1 - pct / 100))}</b></div>` : ''}
      </div>`;
  }
  async function onClick(e) {
    const b = e.target.closest('[data-rv]'); if (!b) return;
    const tp = pending.find(x => x.id === e.target.closest('[data-tp]').dataset.tp); if (!tp) return;
    try {
      if (b.dataset.rv === 'approve') {
        if (!(await ask('¿Aprobar recarga?', `${esc(tp.courierName)} · <b>${money(tp.amount)}</b> por ${METHODS[tp.method]}. Solo aprueba si ya recibiste el dinero.`, 'Aprobar'))) return;
        await approveTopup(ctx, tp); toast('Saldo cargado');
      } else {
        const r = await new Promise(res => {
          const s = sheet(`<h2>Rechazar recarga</h2>${['No llegó el pago', 'El comprobante no es válido', 'El valor no coincide', 'No recibí el efectivo'].map(x => `<button class="btn block" data-r="${x}">${x}</button>`).join('')}<button class="btn block" data-r="">Volver</button>`, () => res(null));
          s.onclick = ev => { const c = ev.target.closest('[data-r]'); if (!c) return; closeSheet(); res(c.dataset.r || null); };
        });
        if (!r) return;
        await db.update('topups', tp.id, { status: 'rechazada', reviewNote: r, reviewedBy: db.uid, reviewedAt: Date.now() });
      }
    } catch (err) { toast('Error: ' + (err.message || err)); }
  }
  box.addEventListener('click', onClick);
  return () => { u1(); u2(); box.removeEventListener('click', onClick); };
}
