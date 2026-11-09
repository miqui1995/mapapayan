// Copia la app web a www/ para empaquetarla con Capacitor
import { cpSync, rmSync, mkdirSync } from 'node:fs';
const files = ['index.html', 'styles.css', 'config.js', 'manifest.webmanifest', 'sw.js'];
const dirs = ['js', 'vendor', 'icons'];
rmSync('www', { recursive: true, force: true });
mkdirSync('www');
for (const f of files) cpSync(f, `www/${f}`);
for (const d of dirs) cpSync(d, `www/${d}`, { recursive: true });
console.log('www/ listo');
