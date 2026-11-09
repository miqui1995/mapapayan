// ===== CONFIGURACIÓN DE MANDAOYA =====
// Mientras firebase sea null, la app funciona en MODO DEMO (datos solo en el teléfono).
// Para el modo real, pega aquí la configuración de tu app web de Firebase
// (Consola de Firebase › Configuración del proyecto › Tus apps › SDK setup and configuration › Config).
window.MANDAOYA_CONFIG = {
  firebase: null,
  firebase:{
  apiKey: "AIzaSyBacNwOsGDJlL3bNirFqM77mkubmJvf8Ho",
  authDomain: "mandaoya-7c278.firebaseapp.com",
  projectId: "mandaoya-7c278",
  storageBucket: "mandaoya-7c278.firebasestorage.app",
  messagingSenderId: "467974402026",
  appId: "1:467974402026:web:0d34128296183d1e958c93"
 },
  center: [1.69684, -78.24514], // San José, Roberto Payán
  // App Android: pon true cuando hayas agregado google-services.json (notificaciones push)
  nativePush: false,
};
