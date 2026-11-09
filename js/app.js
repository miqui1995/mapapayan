// MandaoYa – arranque, registro y enrutador
import { createLocalDB, createFirebaseDB } from './db.js';
import { CFG, HOME, $, esc, toast, sheet, closeSheet, ask, pickLocation, STORE_CATS, VEHICLES, waLink, getGPS, haversine } from './ui.js';
import { photoToDataURL } from './catalogo.js';
import { initPush, isNative } from './native.js';
import * as Cliente from './cliente.js';
import * as Tienda from './tienda.js';
import * as Domi from './domi.js';
import * as Admin from './admin.js';
import * as Seguir from './seguir.js';
import { mountRideTrack } from './carreras.js';

const ctx = { db: null, me: null, settings: {}, zones: [], cleanup: null };
window.MandaoYa = ctx; // útil para depurar

// ---------- datos de demostración ----------
function seed(api, data) {
  const now = Date.now();
  const s = (c, id, o) => { (data[c] = data[c] || {})[id] = o; };
  s('config', 'general', { baseFee: 3000, commissionPct: 0, assignTimeoutMin: 5, adminWhatsApp: '', town: 'San José, Roberto Payán' });
  [['centro', 'Centro', 3000, 1], ['alto', 'Parte alta', 4000, 2], ['rio', 'Orilla del río', 4000, 3], ['afueras', 'Afueras / veredas cercanas', 7000, 4]]
    .forEach(([id, name, fee, order]) => s('zones', id, { name, fee, order, active: true }));
  const U = (id, o) => s('users', id, { createdAt: now, approved: true, ...o });
  U('demo_admin', { role: 'admin', name: 'Administrador', phone: '3000000000' });
  s('admins', 'demo_admin', { since: now });
  U('demo_t1', { role: 'tendero', name: 'Rosa', phone: '3001111111' });
  U('demo_t2', { role: 'tendero', name: 'Jairo', phone: '3002222222' });
  U('demo_t3', { role: 'tendero', name: 'Nelly', phone: '3003333333' });
  U('demo_d1', { role: 'domiciliario', name: 'Carlos', phone: '3004444444', vehicle: 'moto', plate: 'ABC12D', online: false });
  U('demo_d2', { role: 'domiciliario', name: 'Yesid', phone: '3005555555', vehicle: 'pie', online: false });
  U('demo_c1', { role: 'cliente', name: 'María', phone: '3006666666' });
  const S = (id, o) => s('stores', id, { ownerUid: id, approved: true, open: true, createdAt: now, ...o });
  S('demo_t1', { name: 'Tienda Doña Rosa', cat: 'tienda', phone: '3001111111', lat: 1.69660, lng: -78.24560, ref: 'Frente al parque', zoneId: 'centro', hours: '6am – 9pm' });
  S('demo_t2', { name: 'Droguería La Esperanza', cat: 'drogueria', phone: '3002222222', lat: 1.69710, lng: -78.24470, ref: 'Al lado de la iglesia', zoneId: 'centro', hours: '7am – 8pm' });
  S('demo_t3', { name: 'Asadero El Telembí', cat: 'restaurante', phone: '3003333333', lat: 1.69620, lng: -78.24420, ref: 'Bajando al muelle', zoneId: 'rio', hours: '11am – 10pm' });
}

// Productos de ejemplo para la demo
const DEMO_PRODUCTS = {
  demo_t1: [['Granos', 'Arroz libra', 2500], ['Granos', 'Fríjol libra', 4500], ['Granos', 'Lenteja libra', 3500], ['Abarrotes', 'Aceite 1 litro', 9500],
    ['Abarrotes', 'Panela', 2500], ['Abarrotes', 'Azúcar libra', 2600], ['Lácteos', 'Leche bolsa 1 litro', 4200], ['Lácteos', 'Queso campesino libra', 9000],
    ['Bebidas', 'Gaseosa 400 ml', 2500], ['Bebidas', 'Agua bolsa', 500], ['Aseo', 'Jabón de barra', 3000], ['Aseo', 'Papel higiénico x4', 6500]],
  demo_t2: [['Medicamentos', 'Acetaminofén 500 mg x10', 3000], ['Medicamentos', 'Suero oral', 4500], ['Medicamentos', 'Antiácido sobre', 1500],
    ['Cuidado personal', 'Toallas higiénicas x10', 5500], ['Cuidado personal', 'Repelente', 12000], ['Bebés', 'Pañales etapa 3 x10', 15000]],
  demo_t3: [['Almuerzos', 'Almuerzo corriente', 12000, 'Sopa, seco, jugo'], ['Almuerzos', 'Pescado frito con patacón', 22000, 'Con arroz y ensalada'],
    ['Asados', 'Pollo asado entero', 35000, 'Con papa y arepa'], ['Asados', '1/2 pollo asado', 19000], ['Bebidas', 'Jugo natural', 4000], ['Bebidas', 'Gaseosa 1.5 L', 6500]],
};
async function seedDemoProducts(db) {
  if ((await db.list('products', [])).length) return;
  for (const [sid, list] of Object.entries(DEMO_PRODUCTS))
    for (const [i, [section, name, price, desc]] of list.entries())
      await db.add('products', { storeId: sid, section, name, price, desc: desc || '', available: true, photo: null, order: i, createdAt: Date.now() });
}

export const COURIER_DEFAULTS = auto => ({ courierAutoApprove: auto, requireInvite: false, trialDeliveries: 10, trialMaxTotal: 50000, trialMaxActive: 1, serviceRadiusKm: 30 });

// ---------- arranque ----------
async function boot() {
  try {
    ctx.db = CFG.firebase ? await createFirebaseDB(CFG.firebase) : createLocalDB(seed);
    await ctx.db.init();
  } catch (e) {
    console.error(e);
    $('#app').innerHTML = `<div class="pad"><h2>No se pudo conectar</h2><p class="note">${esc(e.message || e)}</p>
      <p class="note">Revisa la configuración de Firebase en config.js y que la autenticación anónima esté activada.</p>
      <button class="btn primary" onclick="location.reload()">Reintentar</button></div>`;
    return;
  }
  document.body.classList.toggle('demo', ctx.db.mode === 'demo');
  if (ctx.db.mode === 'demo') {
    await seedDemoProducts(ctx.db);
    const g = await ctx.db.get('config', 'general');
    if (g && g.courierAutoApprove === undefined) await ctx.db.set('config', 'general', COURIER_DEFAULTS(true), { merge: true });
    if (g && g.prepaidEnabled !== undefined && g.welcomeCredit === undefined) await ctx.db.set('config', 'general', { welcomeCredit: 2500 }, { merge: true });
    if (g && g.ridesEnabled === undefined) {
      await ctx.db.set('config', 'general', { ridesEnabled: true, rideFee: 500, rideRadiusKm: 5 }, { merge: true });
      await ctx.db.update('users', 'demo_d1', { rides: true, rideVehicle: 'moto' }).catch(() => { });
    }
    if (g && g.prepaidEnabled === undefined) {
      await ctx.db.set('config', 'general', { prepaidEnabled: true, courierFee: 500, welcomeCredit: 2500, minTopup: 5000, topupNequi: '3000000000', topupName: 'MandaoYa (demo)', socioPct: 20, socioInfo: 'Tienda Doña Rosa, frente al parque' }, { merge: true });
      for (const id of ['demo_d1', 'demo_d2']) { const u = await ctx.db.get('users', id); if (u && u.balance == null) await ctx.db.update('users', id, { balance: 2000 }); }
      await ctx.db.update('users', 'demo_t1', { socio: true }).catch(() => { });
    }
  }
  ctx.db.watchDoc('config', 'general', d => { ctx.settings = d || {}; });
  ctx.db.watch('zones', [], z => { ctx.zones = z.filter(x => x.active !== false).sort((a, b) => (a.order || 0) - (b.order || 0)); });
  window.addEventListener('hashchange', route);
  if (isNative) document.body.classList.add('native');
  if (!isNative && 'serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => { });
  route();
}

let meUnsub = null;
async function route() {
  ctx.cleanup && ctx.cleanup(); ctx.cleanup = null;
  const root = $('#app');
  const m = location.hash.match(/^#\/seguir\/([\w-]+)/);
  if (m) { setHeader('Seguimiento'); ctx.cleanup = Seguir.mount(root, ctx, m[1]); return; }
  const mr = location.hash.match(/^#\/carrera\/([\w-]+)/);
  if (mr) { setHeader('Carrera'); ctx.cleanup = mountRideTrack(root, ctx, mr[1]); return; }
  if (location.hash === '#/carreras') { sessionStorage.setItem('mandaoya_tab', 'carrera'); history.replaceState(null, '', location.pathname); }
  if (/^#\/admin/.test(location.hash)) return adminGate();
  if (!ctx.db.uid) { if (ctx.db.mode === 'demo') return showWelcome(); await ctx.db.init(); }
  meUnsub && meUnsub();
  let first = true, lastKey = '';
  meUnsub = ctx.db.watchDoc('users', ctx.db.uid, me => {
    ctx.me = me;
    const key = me ? me.role + '|' + !!me.approved + '|' + !!me.socio : 'none';
    if (!first && key === lastKey) return; // solo re-dibuja si cambia el rol o la aprobación
    first = false; lastKey = key;
    ctx.cleanup && ctx.cleanup(); ctx.cleanup = null;
    if (/^#\/(seguir|carrera)\//.test(location.hash)) return;
    if (!me) return showWelcome();
    if (!me.approved) return showPending(me);
    const R = { cliente: Cliente, tendero: Tienda, domiciliario: Domi, admin: Admin }[me.role];
    if (!R) return showWelcome();
    setHeader(me.name, me.role);
    initPush(ctx);
    root.onclick = null; root.innerHTML = '';
    ctx.cleanup = R.mount(root, ctx);
  });
}

const ROLE_LABEL = { cliente: 'Cliente', tendero: 'Tienda', domiciliario: 'Domiciliario', admin: 'Admin' };
function setHeader(name, role) {
  $('#hdrRole').textContent = role ? ROLE_LABEL[role] : name || '';
  $('#hdrRole').classList.toggle('hidden', !role && !name);
}
$('#hdrMenu').onclick = () => profileMenu();
$('#hdrBrand').onclick = () => { if (location.hash) location.hash = ''; };

function profileMenu() {
  const me = ctx.me;
  const b = sheet(`<h2>${me ? esc(me.name) : 'MandaoYa'}</h2>
    ${me ? `<p class="note">${esc(ROLE_LABEL[me.role] || '')} · ${esc(me.phone || '')}</p>` : ''}
    ${me && me.role !== 'admin' ? '<button class="btn block" id="pmEdit">Editar mis datos</button>' : ''}
    ${ctx.db.mode === 'demo' ? '<button class="btn block" id="pmSwitch">Cambiar de usuario (demo)</button><button class="btn block danger" id="pmReset">Reiniciar datos de demo</button>' : ''}
    ${me ? '<button class="btn block danger" id="pmOut">Cerrar sesión / cambiar de rol</button>' : ''}
    <p class="note center">MandaoYa · ${ctx.db.mode === 'demo' ? 'Modo demo (datos solo en este teléfono)' : 'Conectado'}<br>
    ${ctx.db.mode === 'firebase' ? `ID: <code>${esc(ctx.db.uid)}</code>` : ''}</p>`);
  b.onclick = async e => {
    const id = e.target.id;
    if (id === 'pmEdit') { closeSheet(); editProfile(); }
    if (id === 'pmSwitch') { closeSheet(); meUnsub && meUnsub(); meUnsub = null; ctx.me = null; await ctx.db.signOut(); location.hash = ''; showWelcome(); }
    if (id === 'pmReset') { if (await ask('¿Reiniciar la demo?', 'Se borran todos los pedidos y usuarios de prueba.', 'Reiniciar', true)) { await ctx.db.resetDemo(); location.reload(); } }
    if (id === 'pmOut') {
      closeSheet();
      if (me?.role === 'admin') { meUnsub && meUnsub(); meUnsub = null; ctx.me = null; await ctx.db.signOut(); location.hash = ctx.db.mode === 'firebase' ? '#/admin' : ''; if (ctx.db.mode === 'firebase') location.reload(); else showWelcome(); return; }
      if (ctx.db.mode === 'firebase') {
        if (!(await ask('¿Salir?', 'En este teléfono se borrará tu cuenta actual y podrás registrarte con otro rol. Tus pedidos anteriores no se pierden para la tienda ni el administrador.', 'Salir', true))) return;
        await ctx.db.del('users', ctx.db.uid).catch(() => { });
        await ctx.db.signOut(); location.hash = ''; location.reload();
      } else { meUnsub && meUnsub(); meUnsub = null; ctx.me = null; await ctx.db.signOut(); location.hash = ''; showWelcome(); }
    }
  };
}

function editProfile() {
  const me = ctx.me;
  const b = sheet(`<h2>Mis datos</h2>
    <label class="f">Nombre</label><input class="in" id="eName" value="${esc(me.name)}">
    <label class="f">Celular / WhatsApp</label><input class="in" id="ePhone" type="tel" inputmode="tel" value="${esc(me.phone)}">
    ${me.role === 'domiciliario' ? `<label class="f">Vehículo</label><select class="in" id="eVeh">${Object.entries(VEHICLES).map(([k, v]) => `<option value="${k}" ${me.vehicle === k ? 'selected' : ''}>${v[0]}</option>`).join('')}</select>
      <label class="f">Placa (si tiene)</label><input class="in" id="ePlate" value="${esc(me.plate)}">` : ''}
    <div class="row actions"><button class="btn" id="eNo">Cancelar</button><button class="btn primary" id="eOk">Guardar</button></div>`);
  $('#eNo', b).onclick = closeSheet;
  $('#eOk', b).onclick = async () => {
    const p = { name: $('#eName').value.trim(), phone: $('#ePhone').value.trim() };
    if ($('#eVeh')) { p.vehicle = $('#eVeh').value; p.plate = $('#ePlate').value.trim().toUpperCase(); }
    if (!p.name || !p.phone) return toast('Nombre y celular son obligatorios');
    await ctx.db.update('users', ctx.db.uid, p); closeSheet(); toast('Datos guardados');
  };
}

// ---------- bienvenida y registro ----------
function showWelcome() {
  ctx.cleanup && ctx.cleanup(); ctx.cleanup = null;
  if (!ctx.db.uid || !ctx.me) { meUnsub && meUnsub(); meUnsub = null; }
  setHeader('');
  const demo = ctx.db.mode === 'demo';
  $('#app').innerHTML = `<div class="pad welcome">
    <div class="hero"><img src="icons/icon-192.png" alt=""><h1>MandaoYa</h1><p>Domicilios en ${esc(ctx.settings.town || 'Roberto Payán')}</p></div>
    <div class="roles">
      <button class="role" data-r="cliente"><span>🛍️</span><b>Quiero pedir</b><small>Pide a las tiendas, mandados y carreras</small></button>
      <button class="role" data-r="tendero"><span>🏪</span><b>Tengo una tienda</b><small>Recibe pedidos y solicita domiciliarios</small></button>
      <button class="role" data-r="domiciliario"><span>🛵</span><b>Soy domiciliario</b><small>Haz domicilios y carreras, y gana por cada una</small></button>
    </div>
    ${demo ? `<div class="demoBox"><h3>Modo demo</h3>
      <p class="note">Los datos viven solo en este teléfono. Abre varias pestañas de Safari con roles distintos para probar el flujo completo.</p>
      <div class="chips">${[['demo_c1', '🛍️ María (cliente)'], ['demo_t1', '🏪 Tienda Doña Rosa'], ['demo_t2', '🏪 Droguería'], ['demo_d1', '🛵 Carlos (moto)'], ['demo_d2', '🛵 Yesid (a pie)'], ['demo_admin', '⚙️ Admin']]
        .map(([u, l]) => `<button class="chip" data-u="${u}">${l}</button>`).join('')}</div></div>` : ''}
  </div>`;
  $('#app').onclick = async e => {
    const u = e.target.closest('[data-u]'); const r = e.target.closest('[data-r]');
    if (u) { $('#app').onclick = null; await ctx.db.useIdentity(u.dataset.u); route(); }
    if (r) { if (demo && !ctx.db.uid) await ctx.db.newIdentity(); register(r.dataset.r); }
  };
}

async function register(role) {
  $('#app').onclick = null;
  const zoneOpts = ctx.zones.map(z => `<option value="${z.id}">${esc(z.name)}</option>`).join('');
  $('#app').innerHTML = `<div class="pad"><button class="link" id="rBack">‹ Volver</button>
    <h2>${{ cliente: 'Crear mi cuenta', tendero: 'Registrar mi tienda', domiciliario: 'Registro de domiciliario' }[role]}</h2>
    <label class="f">Tu nombre</label><input class="in" id="rName" autocomplete="name" placeholder="Nombre y apellido">
    <label class="f">Celular / WhatsApp</label><input class="in" id="rPhone" type="tel" inputmode="tel" autocomplete="tel" placeholder="3xx xxx xxxx">
    ${role === 'domiciliario' ? `<label class="f">¿En qué haces los domicilios?</label>
      <select class="in" id="rVeh">${Object.entries(VEHICLES).map(([k, v]) => `<option value="${k}">${v[0]}</option>`).join('')}</select>
      <label class="f">Placa (si tiene)</label><input class="in" id="rPlate" placeholder="Opcional">
      <h3>Requisitos</h3>
      <p class="note">${ctx.settings.courierAutoApprove ? 'Si cumples todos los requisitos, <b>tu cuenta se activa de inmediato</b> en nivel de prueba.' : 'El administrador revisará tus documentos antes de activarte.'}</p>
      <div class="reqs">
        <button class="req" data-req="selfie"><span class="rq-ico">🤳</span><span><b>Foto tuya (selfie)</b><small>De frente, con buena luz</small></span><span class="rq-st">Pendiente</span></button>
        <button class="req" data-req="idPhoto"><span class="rq-ico">🪪</span><span><b>Foto de tu cédula</b><small>Por el frente, que se lea</small></span><span class="rq-st">Pendiente</span></button>
        <button class="req" data-req="vehiclePhoto" id="rqVeh"><span class="rq-ico">🛵</span><span><b>Foto del vehículo</b><small>Donde se vea la placa si tiene</small></span><span class="rq-st">Pendiente</span></button>
        <button class="req" data-req="gps"><span class="rq-ico">📍</span><span><b>GPS activo en la zona</b><small>Verifica que tu celular comparte ubicación</small></span><span class="rq-st">Pendiente</span></button>
      </div>
      <input type="file" id="rqFile" accept="image/*" class="hidden">
      ${ctx.settings.requireInvite ? '<label class="f">Código de invitación</label><input class="in" id="rInvite" placeholder="Te lo da el administrador o una tienda" autocapitalize="characters">' : ''}
      <label class="check"><input type="checkbox" id="rAdult"> Soy mayor de 18 años.</label>
      <label class="check"><input type="checkbox" id="rTerms"> Me comprometo a entregar los pedidos con el código del cliente, cuidar la mercancía y entregar el efectivo a las tiendas el mismo día.</label>` : ''}
    ${role === 'tendero' ? `<h3>Datos de la tienda</h3>
      <label class="f">Nombre de la tienda</label><input class="in" id="rStore" placeholder="Ej: Tienda Doña Rosa">
      <label class="f">Tipo</label><select class="in" id="rCat">${Object.entries(STORE_CATS).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select>
      <label class="f">Teléfono de la tienda</label><input class="in" id="rSPhone" type="tel" inputmode="tel" placeholder="Si es el mismo, déjalo vacío">
      <label class="f">Sector</label><select class="in" id="rZone">${zoneOpts}</select>
      <label class="f">Referencia</label><input class="in" id="rRef" placeholder="Ej: frente al parque">
      <label class="f">Horario</label><input class="in" id="rHours" placeholder="Ej: 6am – 9pm">
      <label class="f">Ubicación en el mapa</label><button class="btn block" id="rLoc">📍 Marcar ubicación de la tienda</button>` : ''}
    <label class="check"><input type="checkbox" id="rOk"> Acepto el tratamiento de mis datos (nombre, celular y ubicación) para prestar el servicio de domicilios, según la Ley 1581 de 2012.</label>
    <button class="btn primary block" id="rSave">${role === 'cliente' ? 'Empezar a pedir' : 'Enviar registro'}</button>
    ${role === 'tendero' ? '<p class="note">El administrador revisará tu registro antes de activarlo.</p>' : ''}
  </div>`;
  let loc = null; const req = {};
  $('#rBack').onclick = () => showWelcome();
  if (role === 'domiciliario') {
    const setSt = (k, ok, txt) => { const b = $(`[data-req="${k}"]`); b.classList.toggle('done', ok); b.querySelector('.rq-st').textContent = txt || (ok ? '✅ Listo' : 'Pendiente'); };
    const vehShown = () => $('#rVeh').value !== 'pie';
    $('#rVeh').onchange = () => $('#rqVeh').classList.toggle('hidden', !vehShown());
    let pending = null;
    $('#rqFile').onchange = async e => {
      const f = e.target.files[0]; e.target.value = ''; if (!f || !pending) return;
      setSt(pending, false, 'Procesando…');
      try { req[pending] = await photoToDataURL(f, pending === 'idPhoto' ? 900 : 480, 0.6); setSt(pending, true); }
      catch (err) { setSt(pending, false); toast('No se pudo leer la foto'); }
    };
    $('.reqs').onclick = async e => {
      const b = e.target.closest('[data-req]'); if (!b) return; const k = b.dataset.req;
      if (k === 'gps') {
        setSt('gps', false, 'Buscando…');
        try {
          const g = await getGPS(15000); const km = haversine({ lat: HOME[0], lng: HOME[1] }, g) / 1000;
          const max = ctx.settings.serviceRadiusKm || 30;
          if (km > max) { setSt('gps', false, `Fuera de zona (${km.toFixed(0)} km)`); toast(`Debes estar a menos de ${max} km del pueblo para registrarte`); return; }
          req.gps = { ...g, at: Date.now() }; setSt('gps', true, `✅ ±${g.acc} m`);
        } catch (err) { setSt('gps', false, 'Sin GPS'); toast('Activa la ubicación del celular para MandaoYa'); }
        return;
      }
      pending = k; const fi = $('#rqFile'); fi.setAttribute('capture', k === 'selfie' ? 'user' : 'environment'); fi.click();
    };
  }
  if ($('#rLoc')) $('#rLoc').onclick = async () => { const l = await pickLocation('Ubicación de la tienda', loc); if (l) { loc = l; $('#rLoc').textContent = '✅ Ubicación marcada (cambiar)'; } };
  $('#rSave').onclick = async () => {
    const name = $('#rName').value.trim(), phone = $('#rPhone').value.trim();
    if (!name || phone.replace(/\D/g, '').length < 7) return toast('Escribe tu nombre y un celular válido');
    if (!$('#rOk').checked) return toast('Debes aceptar el tratamiento de datos');
    const user = { role, name, phone, approved: role === 'cliente', createdAt: Date.now() };
    let inviteCode = null;
    if (role === 'domiciliario') {
      const veh = $('#rVeh').value;
      const missing = [!req.selfie && 'selfie', !req.idPhoto && 'foto de la cédula', veh !== 'pie' && !req.vehiclePhoto && 'foto del vehículo', !req.gps && 'verificar GPS',
        !$('#rAdult').checked && 'confirmar que eres mayor de edad', !$('#rTerms').checked && 'aceptar el compromiso'].filter(Boolean);
      if (missing.length) return toast('Falta: ' + missing.join(', '), 5000);
      if (ctx.settings.requireInvite) {
        inviteCode = $('#rInvite').value.trim().toUpperCase();
        const inv = inviteCode ? await ctx.db.get('invites', inviteCode).catch(() => null) : null;
        if (!inv || !inv.active || (inv.maxUses && (inv.uses || 0) >= inv.maxUses)) return toast('El código de invitación no es válido o ya se usó');
      }
      const auto = !!ctx.settings.courierAutoApprove;
      const welcome = ctx.settings.prepaidEnabled ? +(ctx.settings.welcomeCredit || 0) : 0;
      Object.assign(user, { vehicle: veh, plate: $('#rPlate').value.trim().toUpperCase(), online: false, approved: auto, level: 'prueba', autoApproved: auto, inviteCode,
        balance: welcome, welcomeCredit: welcome,
        requirements: { selfie: true, idPhoto: true, vehiclePhoto: !!req.vehiclePhoto, gps: true, adult: true, terms: true } });
      $('#rSave').disabled = true;
      try { await ctx.db.set('courierDocs', ctx.db.uid, { selfie: req.selfie, idPhoto: req.idPhoto, vehiclePhoto: req.vehiclePhoto || null, gps: req.gps, createdAt: Date.now() }); }
      catch (e) { $('#rSave').disabled = false; return toast('No se pudieron subir los documentos: ' + (e.message || e)); }
    }
    if (role === 'tendero') {
      const sname = $('#rStore').value.trim();
      if (!sname) return toast('Escribe el nombre de la tienda');
      if (!loc) return toast('Marca la ubicación de la tienda en el mapa');
      await ctx.db.set('stores', ctx.db.uid, {
        ownerUid: ctx.db.uid, name: sname, cat: $('#rCat').value, phone: $('#rSPhone').value.trim() || phone,
        zoneId: $('#rZone').value, ref: $('#rRef').value.trim(), hours: $('#rHours').value.trim(),
        lat: loc.lat, lng: loc.lng, open: false, approved: false, createdAt: Date.now(),
      });
    }
    $('#rSave').disabled = true;
    try {
      await ctx.db.set('users', ctx.db.uid, user);
      if (inviteCode) { const inv = await ctx.db.get('invites', inviteCode); ctx.db.update('invites', inviteCode, { uses: (inv?.uses || 0) + 1 }).catch(() => { }); }
      if (role === 'domiciliario' && user.welcomeCredit) ctx.db.add('movements', { courierUid: ctx.db.uid, type: 'bono', amount: user.welcomeCredit, note: 'Crédito de bienvenida', balanceAfter: user.welcomeCredit, at: Date.now() }).catch(() => { });
      if (role === 'domiciliario' && user.approved) toast(user.welcomeCredit ? `¡Cuenta activada! Tienes ${user.welcomeCredit / (ctx.settings.courierFee || 500)} domicilios de regalo para empezar.` : '¡Cuenta activada! Empiezas en nivel de prueba.', 5000);
      route();
    }
    catch (e) { $('#rSave').disabled = false; toast('No se pudo guardar: ' + (e.message || e)); }
  };
}

// ---------- Acceso de administrador: SOLO por la dirección web .../#/admin ----------
// No aparece en la pantalla de bienvenida. En modo real exige correo y contraseña de Firebase
// y que ese usuario esté en la colección "admins" (que solo se crea desde la consola).
async function adminGate() {
  ctx.cleanup && ctx.cleanup(); ctx.cleanup = null; meUnsub && meUnsub(); meUnsub = null;
  setHeader('Administrador');
  const root = $('#app'); root.onclick = null;
  if (isNative) {
    root.innerHTML = `<div class="pad center"><div class="bigicon">🔒</div><h2>Panel de administrador</h2><p class="note">El panel se usa desde la web, en el computador.</p><button class="btn block" id="agBack">Volver</button></div>`;
    $('#agBack').onclick = () => { location.hash = ''; };
    return;
  }
  if (ctx.db.mode === 'demo') { await ctx.db.useIdentity('demo_admin'); location.hash = ''; return; }
  const enter = async () => {
    const u = await ctx.db.get('users', ctx.db.uid).catch(() => null);
    if (!u || u.role !== 'admin') await ctx.db.set('users', ctx.db.uid, { role: 'admin', name: 'Administrador', phone: '', approved: true, createdAt: Date.now() });
    location.replace(location.pathname); // recarga limpia ya como administrador
  };
  if (!ctx.db.isAnonymous() && await ctx.db.isAdmin()) return enter();
  const signedNotAdmin = !ctx.db.isAnonymous();
  root.innerHTML = `<div class="pad" style="max-width:420px">
    <h2>Panel de administrador</h2>
    ${signedNotAdmin ? `<div class="warn">La cuenta ${esc(ctx.db.email())} no es administradora. En Firestore crea la colección <b>admins</b> con un documento cuyo ID sea <code class="sel">${esc(ctx.db.uid)}</code>.</div>` : ''}
    <label class="f">Correo</label><input class="in" id="agEmail" type="email" autocomplete="username">
    <label class="f">Contraseña</label><input class="in" id="agPass" type="password" autocomplete="current-password">
    <button class="btn primary block" id="agGo">Entrar</button>
    <button class="link" id="agForgot">Olvidé mi contraseña</button>
    <p class="note">Esta página no aparece en la app. Solo se entra escribiendo esta dirección.</p></div>`;
  $('#agGo').onclick = async () => {
    const email = $('#agEmail').value.trim(), pass = $('#agPass').value;
    if (!email || !pass) return toast('Escribe correo y contraseña');
    $('#agGo').disabled = true;
    try {
      await ctx.db.signInEmail(email, pass);
      if (await ctx.db.isAdmin()) return enter();
      adminGate();
    } catch (e) { $('#agGo').disabled = false; toast(/invalid|wrong|user-not-found|credential/i.test(e.code || e.message) ? 'Correo o contraseña incorrectos' : 'No se pudo entrar: ' + (e.code || e.message)); }
  };
  $('#agForgot').onclick = async () => {
    const email = $('#agEmail').value.trim(); if (!email) return toast('Escribe tu correo primero');
    try { await ctx.db.resetPassword(email); toast('Te enviamos un correo para cambiar la contraseña'); } catch (e) { toast('No se pudo enviar: ' + (e.code || e.message)); }
  };
}

function showPending(me) {
  setHeader(me.name, me.role);
  const wa = ctx.settings.adminWhatsApp;
  $('#app').innerHTML = `<div class="pad center">
    <div class="bigicon">⏳</div><h2>Registro en revisión</h2>
    <p class="note">Hola ${esc(me.name)}. El administrador de MandaoYa debe aprobar tu cuenta de ${me.role === 'tendero' ? 'tienda' : 'domiciliario'}. Esta pantalla se actualiza sola cuando te aprueben.</p>
    ${wa ? `<a class="btn primary block" href="${waLink(wa, `Hola, me registré en MandaoYa como ${me.role} (${me.name}). ¿Me ayudan con la aprobación?`)}" target="_blank">Escribir al administrador</a>` : ''}
  </div>`;
}

boot();
