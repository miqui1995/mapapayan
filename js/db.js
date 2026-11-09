// MandaoYa – capa de datos. Misma interfaz para:
//  - Modo DEMO: todo en este teléfono (localStorage), sincroniza entre pestañas.
//  - Modo FIREBASE: Firestore en tiempo real entre todos los teléfonos.
// Filtros: [[campo, '==' | 'in', valor], ...]

const FB_VER = '10.12.2';

function match(doc, filters = []) {
  return filters.every(([f, op, v]) => {
    const x = f.split('.').reduce((o, k) => (o == null ? undefined : o[k]), doc);
    if (op === '==') return x === v;
    if (op === 'in') return v.includes(x);
    return false;
  });
}
const rid = (n = 20) => {
  const a = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let s = ''; const r = crypto.getRandomValues(new Uint8Array(n));
  for (const b of r) s += a[b % a.length]; return s;
};

// ---------------- DEMO ----------------
export function createLocalDB(seedFn) {
  const KEY = 'mandaoya_demo_v1';
  const ch = 'BroadcastChannel' in self ? new BroadcastChannel('mandaoya') : null;
  let data = load();
  const listeners = new Set();
  function load() { try { return JSON.parse(localStorage.getItem(KEY)) || null; } catch (e) { return null; } }
  function save() {
    localStorage.setItem(KEY, JSON.stringify(data));
    ch && ch.postMessage('changed');
    notify();
  }
  function notify() { for (const l of listeners) l(); }
  ch && (ch.onmessage = () => { data = load() || data; notify(); });
  self.addEventListener('storage', e => { if (e.key === KEY) { data = load() || data; notify(); } });
  const col = c => (data[c] = data[c] || {});
  const clone = o => o == null ? null : JSON.parse(JSON.stringify(o));
  function deepMerge(a, b) {
    for (const [k, v] of Object.entries(b)) {
      if (v && typeof v === 'object' && !Array.isArray(v) && a[k] && typeof a[k] === 'object') deepMerge(a[k], v);
      else a[k] = v;
    }
    return a;
  }

  const api = {
    mode: 'demo',
    uid: null,
    async init() {
      if (!data) { data = {}; seedFn && seedFn(api, data); save(); }
      api.uid = sessionStorage.getItem('mandaoya_uid') || localStorage.getItem('mandaoya_last_uid') || null;
      return api.uid;
    },
    // Solo demo: cambiar de identidad para probar roles
    async useIdentity(uid) {
      api.uid = uid;
      sessionStorage.setItem('mandaoya_uid', uid); localStorage.setItem('mandaoya_last_uid', uid);
    },
    async newIdentity() { const u = 'demo_' + rid(10); await api.useIdentity(u); return u; },
    async signOut() { sessionStorage.removeItem('mandaoya_uid'); localStorage.removeItem('mandaoya_last_uid'); api.uid = null; },
    isAnonymous: () => true,
    async signInEmail() { await api.useIdentity('demo_admin'); return 'demo_admin'; },
    async resetDemo() { localStorage.removeItem(KEY); data = null; await api.signOut(); },
    newId: () => rid(),
    async get(c, id) { const d = col(c)[id]; return d ? { id, ...clone(d) } : null; },
    async add(c, obj) { const id = rid(); col(c)[id] = clone(obj); save(); return id; },
    async set(c, id, obj, opt = {}) { col(c)[id] = opt.merge && col(c)[id] ? deepMerge(col(c)[id], clone(obj)) : clone(obj); save(); },
    async update(c, id, patch) {
      if (!col(c)[id]) throw new Error('No existe ' + c + '/' + id);
      for (const [k, v] of Object.entries(patch)) {
        const path = k.split('.'); let o = col(c)[id];
        for (let i = 0; i < path.length - 1; i++) o = o[path[i]] = o[path[i]] || {};
        o[path[path.length - 1]] = clone(v);
      }
      save();
    },
    async del(c, id) { delete col(c)[id]; save(); },
    async list(c, filters) { return Object.entries(col(c)).map(([id, d]) => ({ id, ...clone(d) })).filter(d => match(d, filters)); },
    watch(c, filters, cb) {
      const run = () => cb(Object.entries(col(c)).map(([id, d]) => ({ id, ...clone(d) })).filter(d => match(d, filters)));
      listeners.add(run); setTimeout(run, 0);
      return () => listeners.delete(run);
    },
    watchDoc(c, id, cb) {
      const run = () => { const d = col(c)[id]; cb(d ? { id, ...clone(d) } : null); };
      listeners.add(run); setTimeout(run, 0);
      return () => listeners.delete(run);
    },
    async tx(c, id, fn) {
      data = load() || data; // lee lo último escrito por otras pestañas
      const cur = col(c)[id] ? { id, ...clone(col(c)[id]) } : null;
      const patch = await fn(cur);
      if (patch) await api.update(c, id, patch);
    },
    // Transacción con varios documentos: t.get / t.update / t.set
    async runTx(fn) {
      data = load() || data;
      const writes = [];
      const t = { get: (c, id) => api.get(c, id), update: (c, id, p) => writes.push(['u', c, id, p]), set: (c, id, d) => writes.push(['s', c, id, d]) };
      await fn(t);
      for (const [k, c, id, p] of writes) k === 'u' ? await api.update(c, id, p) : await api.set(c, id, p);
    },
    async isAdmin() { return !!(await api.get('admins', api.uid)); },
  };
  return api;
}

// ---------------- FIREBASE ----------------
export async function createFirebaseDB(config) {
  // SDK de Firebase incluido en la app (funciona sin depender de internet para cargarlo y dentro de la app Android)
  const base = new URL('../vendor/firebase/', import.meta.url).href;
  const { initializeApp } = await import(base + 'firebase-app.js');
  const A = await import(base + 'firebase-auth.js');
  const F = await import(base + 'firebase-firestore.js');
  const app = initializeApp(config);
  const auth = A.getAuth(app);
  let fs;
  try { fs = F.initializeFirestore(app, { ignoreUndefinedProperties: true, localCache: F.persistentLocalCache({ tabManager: F.persistentMultipleTabManager() }) }); }
  catch (e) { fs = F.initializeFirestore(app, { ignoreUndefinedProperties: true }); }

  const toQ = (c, filters = []) => F.query(F.collection(fs, c), ...filters.map(([f, op, v]) => F.where(f, op, v)));
  const snapList = s => s.docs.map(d => ({ id: d.id, ...d.data() }));

  const api = {
    mode: 'firebase',
    uid: null,
    init() {
      return new Promise((res, rej) => {
        const off = A.onAuthStateChanged(auth, async u => {
          if (u) { off(); api.uid = u.uid; res(u.uid); }
          else { try { await A.signInAnonymously(auth); } catch (e) { off(); rej(e); } }
        });
      });
    },
    async signOut() { await A.signOut(auth); api.uid = null; },
    isAnonymous: () => !auth.currentUser || auth.currentUser.isAnonymous,
    email: () => auth.currentUser?.email || '',
    // Acceso del administrador con correo y contraseña (creado en Firebase › Authentication)
    async signInEmail(email, pass) { const c = await A.signInWithEmailAndPassword(auth, email, pass); api.uid = c.user.uid; return c.user.uid; },
    async resetPassword(email) { await A.sendPasswordResetEmail(auth, email); },
    newId: () => F.doc(F.collection(fs, 'x')).id,
    async get(c, id) { const d = await F.getDoc(F.doc(fs, c, id)); return d.exists() ? { id: d.id, ...d.data() } : null; },
    async add(c, obj) { const r = await F.addDoc(F.collection(fs, c), obj); return r.id; },
    async set(c, id, obj, opt = {}) { await F.setDoc(F.doc(fs, c, id), obj, opt.merge ? { merge: true } : {}); },
    async update(c, id, patch) { await F.updateDoc(F.doc(fs, c, id), patch); },
    async del(c, id) { await F.deleteDoc(F.doc(fs, c, id)); },
    async list(c, filters) { return snapList(await F.getDocs(toQ(c, filters))); },
    watch(c, filters, cb) {
      return F.onSnapshot(toQ(c, filters), s => cb(snapList(s)), e => { console.error('watch', c, e); cb([], e); });
    },
    watchDoc(c, id, cb) {
      return F.onSnapshot(F.doc(fs, c, id), d => cb(d.exists() ? { id: d.id, ...d.data() } : null), e => { console.error('watchDoc', c, e); cb(null, e); });
    },
    async tx(c, id, fn) {
      await F.runTransaction(fs, async t => {
        const ref = F.doc(fs, c, id);
        const d = await t.get(ref);
        const patch = await fn(d.exists() ? { id: d.id, ...d.data() } : null);
        if (patch) t.update(ref, patch);
      });
    },
    async runTx(fn) {
      await F.runTransaction(fs, async tr => {
        const t = {
          get: async (c, id) => { const d = await tr.get(F.doc(fs, c, id)); return d.exists() ? { id: d.id, ...d.data() } : null; },
          update: (c, id, p) => tr.update(F.doc(fs, c, id), p),
          set: (c, id, d) => tr.set(F.doc(fs, c, id), d),
        };
        await fn(t);
      });
    },
    async isAdmin() { try { return !!(await api.get('admins', api.uid)); } catch (e) { return false; } },
  };
  return api;
}
