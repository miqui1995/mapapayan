// MandaoYa – funciones nativas cuando la app corre empaquetada en Android (Capacitor).
// En el navegador todo cae a las APIs web, así que el mismo código sirve para la PWA y la app.
import { CFG, toast } from './ui.js';

const Cap = window.Capacitor;
export const isNative = !!(Cap && Cap.isNativePlatform && Cap.isNativePlatform());
const plugin = name => (isNative && Cap.registerPlugin ? Cap.registerPlugin(name) : null);
const BG = plugin('BackgroundGeolocation');
const Push = plugin('PushNotifications');

// ---------- Ubicación: en la app sigue enviando con la pantalla apagada ----------
// cb({lat, lng, acc, at}); devuelve una función para detener
export function watchLocation(cb, onError) {
  if (isNative && BG) {
    let id = null, stopped = false;
    BG.addWatcher({
      backgroundTitle: 'MandaoYa: estás en línea',
      backgroundMessage: 'Compartiendo tu ubicación para los domicilios',
      requestPermissions: true, stale: false, distanceFilter: 15,
    }, (loc, err) => {
      if (err) {
        if (err.code === 'NOT_AUTHORIZED') {
          toast('MandaoYa necesita permiso de ubicación. Actívalo en Ajustes › Apps › MandaoYa › Ubicación.', 7000);
          BG.openSettings && BG.openSettings();
        }
        onError && onError({ code: err.code === 'NOT_AUTHORIZED' ? 1 : 2 });
        return;
      }
      if (loc) cb({ lat: +loc.latitude.toFixed(6), lng: +loc.longitude.toFixed(6), acc: Math.round(loc.accuracy || 0), at: loc.time || Date.now() });
    }).then(w => { id = w; if (stopped) BG.removeWatcher({ id }); }).catch(e => onError && onError(e));
    return () => { stopped = true; if (id) BG.removeWatcher({ id }).catch(() => { }); };
  }
  if (!navigator.geolocation) { onError && onError({ code: 2 }); return () => { }; }
  const wid = navigator.geolocation.watchPosition(
    p => cb({ lat: +p.coords.latitude.toFixed(6), lng: +p.coords.longitude.toFixed(6), acc: Math.round(p.coords.accuracy), at: Date.now() }),
    e => onError && onError(e), { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 });
  return () => navigator.geolocation.clearWatch(wid);
}

// ---------- Notificaciones push (requiere google-services.json y CFG.nativePush = true) ----------
let pushStarted = false;
export async function initPush(ctx) {
  if (!isNative || !Push || pushStarted || !CFG.nativePush || ctx.db.mode !== 'firebase') return;
  pushStarted = true;
  try {
    let perm = await Push.checkPermissions();
    if (perm.receive === 'prompt' || perm.receive === 'prompt-with-rationale') perm = await Push.requestPermissions();
    if (perm.receive !== 'granted') { toast('Activa las notificaciones de MandaoYa para recibir los pedidos con la app cerrada', 6000); return; }
    await Push.createChannel({ id: 'pedidos', name: 'Pedidos', description: 'Pedidos nuevos, recargas y cambios de estado', importance: 5, visibility: 1, vibration: true, lights: true }).catch(() => { });
    await Push.addListener('registration', async t => {
      try {
        const me = await ctx.db.get('users', ctx.db.uid);
        const list = (me?.fcmTokens || []).filter(x => x !== t.value).slice(-4);
        await ctx.db.update('users', ctx.db.uid, { fcmTokens: [...list, t.value], fcmAt: Date.now() });
      } catch (e) { console.warn('token', e); }
    });
    await Push.addListener('registrationError', e => console.warn('push error', e));
    await Push.addListener('pushNotificationActionPerformed', a => {
      const d = a.notification?.data || {};
      if (d.rideId && ctx.me?.role === 'cliente') location.hash = '#/carrera/' + d.rideId;
      else if (d.orderId && ctx.me?.role === 'cliente') location.hash = '#/seguir/' + d.orderId;
      else if (location.hash) location.hash = '';
    });
    await Push.register();
  } catch (e) { console.warn('initPush', e); }
}
