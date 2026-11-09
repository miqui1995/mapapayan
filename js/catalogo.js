// MandaoYa – catálogo de productos: la tienda administra su menú y el cliente arma su carrito
import { $, esc, money, toast, ask, sheet, closeSheet } from './ui.js';

const SECTION_ICON = s => {
  const t = (s || '').toLowerCase();
  if (/bebida|gaseosa|jugo|cerveza|licor/.test(t)) return '🥤';
  if (/aseo|limpieza|jab/.test(t)) return '🧼';
  if (/medic|droga|salud|farm/.test(t)) return '💊';
  if (/carne|pollo|pesc|mariscos/.test(t)) return '🍗';
  if (/fruta|verdura/.test(t)) return '🍌';
  if (/pan|desayuno/.test(t)) return '🥖';
  if (/almuerzo|plato|comida|menú|menu|corriente/.test(t)) return '🍛';
  if (/l[aá]cteo|leche|queso/.test(t)) return '🥛';
  return '🛒';
};
const sortProducts = list => [...list].sort((a, b) => (a.section || '').localeCompare(b.section || '') || (a.order || 0) - (b.order || 0) || a.name.localeCompare(b.name));
const groupBy = list => { const g = {}; for (const p of list) (g[p.section || 'Otros'] = g[p.section || 'Otros'] || []).push(p); return g; };

// Foto liviana guardada dentro del producto (no requiere Firebase Storage ni plan de pago)
export function photoToDataURL(file, max = 480, q = 0.6) {
  return new Promise((res, rej) => {
    const img = new Image(), url = URL.createObjectURL(file);
    img.onload = () => {
      const s = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement('canvas'); c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(url);
      res(c.toDataURL('image/jpeg', q));
    };
    img.onerror = rej; img.src = url;
  });
}

// ============ TIENDA: administrar productos ============
export function mountStoreProducts(body, ctx) {
  const { db } = ctx;
  let products = [], filter = '';
  const unsub = db.watch('products', [['storeId', '==', db.uid]], p => { products = p; draw(); });

  function draw() {
    const list = sortProducts(products).filter(p => !filter || (p.name + ' ' + (p.section || '')).toLowerCase().includes(filter));
    const g = groupBy(list);
    const focus = document.activeElement?.id === 'pSearch';
    body.innerHTML = `<div class="rowb"><h2>Mis productos <small>${products.length}</small></h2></div>
      <p class="note">Los clientes verán este catálogo con precios y fotos. Marca “Agotado” cuando no tengas un producto.</p>
      <div class="row"><button class="btn primary" data-pa="add">+ Producto</button><button class="btn" data-pa="bulk">Pegar lista</button></div>
      ${products.length > 6 ? `<input class="in" id="pSearch" placeholder="Buscar producto…" value="${esc(filter)}" style="margin-top:10px">` : ''}
      ${Object.entries(g).map(([sec, ps]) => `<h3>${esc(sec)}</h3><ul class="list">${ps.map(p => `<li data-pid="${p.id}" class="${p.available === false ? 'soldout' : ''}">
          ${p.photo ? `<img class="pthumb" src="${p.photo}" alt="">` : `<span class="pthumb ph">${SECTION_ICON(p.section)}</span>`}
          <div class="meta"><b>${esc(p.name)}</b><small>${money(p.price)}${p.available === false ? ' · <span class="off">Agotado</span>' : ''}</small></div>
          <button class="btn small" data-pa="toggle">${p.available === false ? 'Activar' : 'Agotado'}</button>
          <button class="btn small" data-pa="edit">Editar</button></li>`).join('')}</ul>`).join('')}
      ${!products.length ? `<div class="empty"><div class="bigicon">📦</div><p>Aún no tienes productos.</p><p class="note">Puedes agregarlos uno por uno con foto, o pegar una lista rápida.</p></div>` : ''}`;
    const s = $('#pSearch', body);
    if (s) { s.oninput = () => { filter = s.value.trim().toLowerCase(); draw(); }; if (focus) { s.focus(); s.setSelectionRange(s.value.length, s.value.length); } }
  }

  async function onClick(e) {
    const a = e.target.closest('[data-pa]'); if (!a) return;
    const pid = e.target.closest('[data-pid]')?.dataset.pid; const p = products.find(x => x.id === pid);
    if (a.dataset.pa === 'add') editProduct(null);
    if (a.dataset.pa === 'edit' && p) editProduct(p);
    if (a.dataset.pa === 'toggle' && p) await db.update('products', p.id, { available: p.available === false });
    if (a.dataset.pa === 'bulk') bulk();
  }
  body.addEventListener('click', onClick);

  const sections = () => [...new Set(products.map(p => p.section).filter(Boolean))];

  function editProduct(p) {
    let photo = p?.photo || null;
    const b = sheet(`<h2>${p ? 'Editar producto' : 'Nuevo producto'}</h2>
      <div class="photoPick" id="ppBox">${photo ? `<img src="${photo}" alt="">` : '<span>📷<br><small>Agregar foto</small></span>'}</div>
      <input type="file" id="ppFile" accept="image/*" class="hidden">
      <label class="f">Nombre</label><input class="in" id="ppName" value="${esc(p?.name)}" placeholder="Ej: Arroz Diana libra">
      <label class="f">Precio</label><input class="in" id="ppPrice" type="number" inputmode="numeric" value="${p?.price ?? ''}" placeholder="0">
      <label class="f">Sección</label><input class="in" id="ppSec" list="ppSecs" value="${esc(p?.section || '')}" placeholder="Ej: Granos, Bebidas, Almuerzos">
      <datalist id="ppSecs">${sections().map(s => `<option value="${esc(s)}">`).join('')}</datalist>
      <label class="f">Descripción (opcional)</label><textarea class="in" id="ppDesc" placeholder="Ej: incluye sopa, seco y jugo">${esc(p?.desc || '')}</textarea>
      <label class="check"><input type="checkbox" id="ppAvail" ${p?.available === false ? '' : 'checked'}> Disponible</label>
      <div class="row actions">${p ? '<button class="btn danger" id="ppDel">Borrar</button>' : '<button class="btn" id="ppNo">Cancelar</button>'}<button class="btn primary" id="ppOk">Guardar</button></div>`);
    $('#ppBox', b).onclick = () => $('#ppFile', b).click();
    $('#ppFile', b).onchange = async e => {
      const f = e.target.files[0]; if (!f) return;
      try { photo = await photoToDataURL(f); $('#ppBox', b).innerHTML = `<img src="${photo}" alt="">`; } catch (err) { toast('No se pudo leer la foto'); }
    };
    if ($('#ppNo', b)) $('#ppNo', b).onclick = closeSheet;
    if ($('#ppDel', b)) $('#ppDel', b).onclick = async () => {
      if (!(await ask('¿Borrar producto?', esc(p.name), 'Borrar', true))) return;
      await db.del('products', p.id); toast('Producto borrado');
    };
    $('#ppOk', b).onclick = async () => {
      const data = { storeId: db.uid, name: $('#ppName').value.trim(), price: +$('#ppPrice').value || 0, section: $('#ppSec').value.trim() || 'Otros',
        desc: $('#ppDesc').value.trim(), available: $('#ppAvail').checked, photo: photo || null, updatedAt: Date.now() };
      if (!data.name) return toast('Escribe el nombre del producto');
      if (!data.price) return toast('Escribe el precio');
      $('#ppOk').disabled = true;
      try {
        if (p) await db.update('products', p.id, data);
        else await db.add('products', { ...data, order: products.length, createdAt: Date.now() });
        closeSheet(); toast('Producto guardado');
      } catch (err) { $('#ppOk').disabled = false; toast('No se pudo guardar: ' + (err.message || err)); }
    };
  }

  function bulk() {
    const b = sheet(`<h2>Pegar lista de productos</h2>
      <p class="note">Un producto por línea: <b>nombre, precio</b>. Para poner sección, escribe una línea con la sección terminada en dos puntos.</p>
      <textarea class="in" id="bkText" style="min-height:200px" placeholder="Granos:\nArroz libra, 2500\nFríjol libra, 4500\nBebidas:\nGaseosa 400 ml, 2500\nAgua bolsa, 500"></textarea>
      <div class="row actions"><button class="btn" id="bkNo">Cancelar</button><button class="btn primary" id="bkOk">Agregar</button></div>`);
    $('#bkNo', b).onclick = closeSheet;
    $('#bkOk', b).onclick = async () => {
      let sec = 'Otros', n = 0, bad = 0;
      const lines = $('#bkText').value.split('\n').map(l => l.trim()).filter(Boolean);
      $('#bkOk').disabled = true;
      for (const l of lines) {
        if (/:$/.test(l)) { sec = l.slice(0, -1).trim(); continue; }
        const m = l.match(/^(.+?)[,;\t]\s*\$?\s*([\d.]+)\s*$/);
        if (!m) { bad++; continue; }
        await db.add('products', { storeId: db.uid, name: m[1].trim(), price: +m[2].replace(/\./g, ''), section: sec, desc: '', available: true, photo: null, order: products.length + n, createdAt: Date.now() });
        n++;
      }
      closeSheet(); toast(`${n} productos agregados${bad ? ` · ${bad} línea(s) no se entendieron` : ''}`);
    };
  }

  draw();
  return () => { unsub(); body.removeEventListener('click', onClick); };
}

// ============ CLIENTE: ver catálogo y armar carrito ============
// cart: { [pid]: { pid, name, price, qty } }
export function mountCatalog(body, ctx, store, cart, { onCheckout, onBack, onNoProducts }) {
  const { db } = ctx;
  let products = null, q = '', sec = '';
  const unsub = db.watch('products', [['storeId', '==', store.id]], p => {
    const first = products === null;
    products = p.filter(x => x.available !== false);
    if (first && !products.length) { onNoProducts(); return; }
    // si un producto del carrito se agotó, quitarlo
    for (const id of Object.keys(cart)) if (!products.find(x => x.id === id)) delete cart[id];
    draw();
  });

  const count = () => Object.values(cart).reduce((s, c) => s + c.qty, 0);
  const total = () => Object.values(cart).reduce((s, c) => s + c.qty * c.price, 0);

  function draw() {
    if (!products) return;
    const focus = document.activeElement?.id === 'cSearch';
    const list = sortProducts(products).filter(p => (!sec || (p.section || 'Otros') === sec) && (!q || (p.name + ' ' + (p.desc || '')).toLowerCase().includes(q)));
    const secs = [...new Set(sortProducts(products).map(p => p.section || 'Otros'))];
    const g = groupBy(list);
    body.innerHTML = `<button class="link" data-ca="back">‹ Tiendas</button>
      <div class="storeHead"><h2>${esc(store.name)}</h2><small>${esc(store.hours || '')}${store.ref ? ' · ' + esc(store.ref) : ''}</small></div>
      ${products.length > 6 ? `<input class="in" id="cSearch" placeholder="Buscar en ${esc(store.name)}…" value="${esc(q)}">` : ''}
      ${secs.length > 1 ? `<div class="chips scrollx"><button class="chip ${sec ? '' : 'on'}" data-sec="">Todo</button>${secs.map(s => `<button class="chip ${sec === s ? 'on' : ''}" data-sec="${esc(s)}">${SECTION_ICON(s)} ${esc(s)}</button>`).join('')}</div>` : ''}
      ${Object.entries(g).map(([s, ps]) => `<h3>${esc(s)}</h3><div class="pgrid">${ps.map(p => {
        const c = cart[p.id]?.qty || 0;
        return `<div class="pcard ${c ? 'in' : ''}" data-pid="${p.id}">
          ${p.photo ? `<img src="${p.photo}" alt="" loading="lazy">` : `<div class="ph">${SECTION_ICON(p.section)}</div>`}
          <div class="pinfo"><b>${esc(p.name)}</b>${p.desc ? `<small>${esc(p.desc)}</small>` : ''}<span class="price">${money(p.price)}</span></div>
          ${c ? `<div class="qty"><button data-ca="minus">−</button><b>${c}</b><button data-ca="plus">+</button></div>` : `<button class="addbtn" data-ca="plus">Agregar</button>`}
        </div>`;
      }).join('')}</div>`).join('') || '<p class="note">No hay productos con ese nombre.</p>'}
      <div class="cartSpacer"></div>
      ${count() ? `<button class="cartBar" data-ca="checkout"><span class="cnt2">${count()}</span><b>Ver pedido</b><b>${money(total())}</b></button>` : ''}`;
    const s = $('#cSearch', body);
    if (s) { s.oninput = () => { q = s.value.trim().toLowerCase(); draw(); }; if (focus) { s.focus(); s.setSelectionRange(s.value.length, s.value.length); } }
  }

  function onClick(e) {
    const sc = e.target.closest('[data-sec]'); if (sc) { sec = sc.dataset.sec; draw(); return; }
    const a = e.target.closest('[data-ca]'); if (!a) return;
    const act = a.dataset.ca;
    if (act === 'back') return onBack();
    if (act === 'checkout') return onCheckout();
    const p = products.find(x => x.id === e.target.closest('[data-pid]')?.dataset.pid); if (!p) return;
    const c = cart[p.id] || (cart[p.id] = { pid: p.id, name: p.name, price: p.price, qty: 0 });
    c.qty += act === 'plus' ? 1 : -1;
    if (c.qty <= 0) delete cart[p.id];
    draw();
  }
  body.addEventListener('click', onClick);
  return () => { unsub(); body.removeEventListener('click', onClick); };
}

export function cartLines(cart) {
  return Object.values(cart).map(c => `${c.qty} x ${c.name} (${money(c.price * c.qty)})`).join('\n');
}
export const cartTotal = cart => Object.values(cart).reduce((s, c) => s + c.qty * c.price, 0);
