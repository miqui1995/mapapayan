// Ajusta el proyecto Android generado por Capacitor: permisos y versión
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
const man = 'android/app/src/main/AndroidManifest.xml';
let m = readFileSync(man, 'utf8');
const perms = [
  'android.permission.ACCESS_COARSE_LOCATION',
  'android.permission.ACCESS_FINE_LOCATION',
  'android.permission.FOREGROUND_SERVICE',
  'android.permission.FOREGROUND_SERVICE_LOCATION',
  'android.permission.POST_NOTIFICATIONS',
  'android.permission.WAKE_LOCK',
  'android.permission.CAMERA',
];
const add = perms.filter(p => !m.includes(`"${p}"`)).map(p => `    <uses-permission android:name="${p}" />`).join('\n');
if (add) m = m.replace(/\n(\s*)<application/, `\n${add}\n$1<application`);
writeFileSync(man, m);

// Textos del servicio de ubicación en segundo plano
const strings = 'android/app/src/main/res/values/strings.xml';
if (existsSync(strings)) {
  let s = readFileSync(strings, 'utf8');
  if (!s.includes('capacitor_background_geolocation_notification_channel_name'))
    s = s.replace('</resources>', '    <string name="capacitor_background_geolocation_notification_channel_name">Ubicación en línea</string>\n</resources>');
  writeFileSync(strings, s);
}

// Versión: usa el número de ejecución de GitHub Actions si existe
const gradle = 'android/app/build.gradle';
const run = Number(process.env.GITHUB_RUN_NUMBER || 1);
let g = readFileSync(gradle, 'utf8');
g = g.replace(/versionCode \d+/, `versionCode ${run}`).replace(/versionName "[^"]*"/, `versionName "1.5.${run}"`);
writeFileSync(gradle, g);
console.log('Android ajustado: permisos + versión', run);

// Compatibilidad del plugin de ubicación en segundo plano con Capacitor 8 / Android Gradle Plugin 8+
const bgGradle = 'node_modules/@capacitor-community/background-geolocation/android/build.gradle';
if (existsSync(bgGradle)) {
  let b = readFileSync(bgGradle, 'utf8');
  b = b.replace("getDefaultProguardFile('proguard-android.txt')", "getDefaultProguardFile('proguard-android-optimize.txt')")
       .replace(/lintOptions\s*\{/, 'lint {');
  if (!b.includes('JavaVersion.VERSION_21'))
    b = b.replace(/android\s*\{/, 'android {\n    compileOptions {\n        sourceCompatibility JavaVersion.VERSION_21\n        targetCompatibility JavaVersion.VERSION_21\n    }');
  writeFileSync(bgGradle, b);
  console.log('Plugin de ubicación ajustado');
}
