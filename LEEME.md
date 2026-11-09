# MandaoYa: domicilios para Roberto Payán

PWA con 4 interfaces en una sola app:

- **Cliente**: compra del catálogo de la tienda con carrito (estilo Rappi), o escribe su pedido libre si la tienda no tiene catálogo, o pide un "mandado"; marca su casa en el mapa, elige cómo paga y sigue el pedido en vivo (estado, mapa, tiempo estimado, datos del domiciliario y código de entrega).
- **Tienda**: carga su **catálogo de productos** (foto, precio, sección, agotado/disponible, o pegando una lista rápida), abre o cierra la tienda, recibe pedidos con alerta sonora, confirma el valor, pide domiciliario, crea domicilios de pedidos que le llegan por teléfono o WhatsApp, envía el enlace de seguimiento por WhatsApp y ve el cuadre del día.
- **Domiciliario**: se pone en línea, recibe alertas, acepta domicilios (gana el primero que acepta), ve la ruta y cuánto cobrar y de cuánto llevar cambio, comparte su GPS, entrega con el código del cliente y lleva su caja del día.
- **Administrador**: mapa en vivo, aprobación de tiendas y domiciliarios, cancelar o reasignar pedidos, tarifas por sector, comisión y reportes con descarga CSV.

## 1. Probar ya (modo demo)

Con `config.js` como viene (`firebase: null`) la app funciona en **modo demo**: los datos quedan solo en ese teléfono y aparece la etiqueta DEMO.

1. Sube **el contenido** de esta carpeta a un repositorio nuevo, por ejemplo `miqui1995/mandaoya`. Luego ve a *Settings › Pages*, elige *Deploy from a branch*, rama `main` y carpeta `/ (root)`.
2. Abre `https://miqui1995.github.io/mandaoya/` en Safari.
3. Abre 3 pestañas: en una entra como **María (cliente)**, en otra como **Tienda Doña Rosa** y en otra como **Carlos (moto)**. Haz un pedido y míralo pasar por las tres. Para cambiar de usuario, usa ☰ › *Cambiar de usuario (demo)*.

## 2. Modo real con Firebase (gratis para empezar)

1. Entra a **console.firebase.google.com**, toca *Agregar proyecto*, ponle de nombre `mandaoya` y desactiva Analytics si quieres.
2. Activa el inicio de sesión: *Authentication › Comenzar › Método de acceso › **Anónimo** › Habilitar*.
3. Autoriza tu dominio: *Authentication › Configuración › Dominios autorizados*, agrega `miqui1995.github.io`.
4. Crea la base de datos: *Firestore Database › Crear base de datos*. Elige ubicación `southamerica-east1` (São Paulo, la más cercana) y modo producción.
5. Publica las reglas: en *Firestore › Reglas* pega todo el contenido de `firestore.rules` y toca **Publicar**.
6. Registra la app web: *Configuración del proyecto (engranaje) › Tus apps › Web (</>)*, con el nombre `MandaoYa`. Copia el objeto `firebaseConfig`.
7. Pega esos datos en `config.js`, en el campo `firebase: { ... }`, y súbelo al repositorio.
8. **Crea tu administrador.** El panel de administrador **no aparece en la app**: solo se entra por la dirección web `…/#/admin`, con correo y contraseña.
   1. En *Authentication › Método de acceso*, habilita **Correo electrónico/contraseña**, además de Anónimo.
   2. En *Authentication › Usuarios › Agregar usuario*, crea tu correo y una contraseña fuerte. Copia el **UID** que aparece.
   3. En *Firestore › Iniciar colección*, crea la colección `admins` con ese UID como ID del documento. Agrega un campo cualquiera, por ejemplo `nombre: Miguel`.
   4. Entra a `https://miqui1995.github.io/mandaoya/#/admin` desde el computador e inicia sesión.

   Nadie más puede volverse administrador: aunque alguien encuentre esa dirección, necesita una cuenta que solo tú creas en la consola, y las reglas de Firestore rechazan cualquier perfil de administrador que no esté en `admins`. En la app Android esa dirección muestra "el panel se usa desde la web".
9. **Configura**: en *Tarifas* crea los sectores reales del pueblo con su precio, tu WhatsApp de soporte y la comisión.
10. Comparte el enlace con tenderos y domiciliarios. Cuando se registren, los apruebas en *Aprobar*. Antes, verifica en persona su cédula y su vehículo.

**Costos:** el plan gratuito *Spark* de Firebase incluye 50.000 lecturas y 20.000 escrituras al día. Alcanza para un pueblo en arranque (cientos de pedidos al día). Configura una alerta de presupuesto si luego pasas al plan *Blaze*.

Si una consulta pide un índice, la consola del navegador muestra un enlace de Firebase que lo crea con un clic.

## 3. Instalar en el teléfono

- **iPhone:** abre en Safari, toca Compartir y luego "Agregar a inicio".
- **Android:** abre en Chrome, toca el menú y luego "Instalar app".

Siempre abre la app desde el ícono.

## 4. Cómo funciona el flujo

```
Cliente pide ─► SOLICITADO ─(tienda confirma valor)─► PREPARANDO ─(tienda pide domiciliario)─► BUSCANDO
Mandado del cliente / domicilio creado por la tienda ─────────────────────────────────────────► BUSCANDO
BUSCANDO ─(un domiciliario acepta)─► ASIGNADO ─(recoge)─► EN CAMINO ─(código del cliente)─► ENTREGADO
```

- **Tarifa:** según el sector que elige el cliente. Se configura en *Tarifas*.
- **Tiempo estimado:** distancia entre domiciliario, tienda y cliente, por 1,4 para aproximar las calles, según la velocidad del vehículo (moto 18 km/h, a pie 4,5 km/h, etc.).
- **Código de 4 dígitos:** el cliente lo ve en su seguimiento y se lo dice al domiciliario al recibir. Si el cliente pidió por teléfono y no tiene el enlace, el domiciliario puede marcar "entregado sin código" y queda registrado.
- **Caja:** el domiciliario ve cuánto efectivo recibió, cuánto debe entregar a cada tienda y cuánto le queda. La tienda ve cuánto le debe cada domiciliario.

## Catálogo de productos

- En la pestaña **Productos**, la tienda agrega productos uno por uno con foto (la cámara del celular sirve) o pega una lista:
  ```
  Granos:
  Arroz libra, 2500
  Fríjol libra, 4500
  Bebidas:
  Gaseosa 400 ml, 2500
  ```
- Las fotos se reducen y se guardan dentro del producto (unos 30 a 60 KB cada una). No hace falta Firebase Storage ni el plan de pago.
- Al pedir, el valor de los productos le llega a la tienda ya calculado. La tienda solo confirma, o lo ajusta si el cliente agregó "algo más".
- Si una tienda no tiene productos cargados, el cliente le escribe su pedido como texto, igual que antes.

## Carreras (estilo inDrive)

Los domiciliarios también pueden llevar pasajeros en su vehículo: moto, carro o lancha.

1. **Pasajero:** en la pestaña **Carrera** marca dónde lo recogen y a dónde va, elige el vehículo y el número de pasajeros, y **propone un precio**. La app sugiere uno con base + valor por km.
2. **Conductores en línea con carreras activadas:** les suena la solicitud si están dentro del radio (5 km por defecto). Pueden **aceptar por ese precio** o hacer una **contraoferta** (+$500, +$1.000, +$2.000).
3. **El pasajero ve las ofertas** con nombre, vehículo, placa y distancia, y **elige una**. Si nadie ofrece, puede subir su oferta.
4. **El conductor** marca **Llegué** y luego **Iniciar viaje**. En ese momento se descuenta la comisión de carrera de su saldo prepagado ($500 por defecto). Al llegar, marca **Terminar viaje** y cobra.
5. **Durante el viaje** el pasajero ve el mapa en vivo, el tiempo de llegada y los datos del conductor, y tiene los botones **Compartir mi viaje** y **Emergencia** (línea 123 y aviso al administrador). Al final califica.

El administrador:
- configura en **Tarifas › Carreras** la base, el valor por km y el mínimo de cada vehículo, la comisión y el radio;
- ve las carreras en curso en **En vivo** y puede cancelarlas (si ya se cobró la comisión, se devuelve);
- ve el resumen de carreras en **Reportes**.

Cada domiciliario activa las carreras desde su pestaña **Carreras**, confirmando que tiene sus documentos al día.

**Importante (legal):** en Colombia el transporte de pasajeros en moto no está autorizado como servicio público, y el de carro o lancha requiere habilitación. Las plataformas de este tipo operan en una zona gris. Antes de lanzar las carreras, consulta con un abogado y con la alcaldía, y define tus términos de uso. En **Tarifas** puedes apagar las carreras o dejar activos solo algunos vehículos.

## Saldo prepagado (cómo cobras tu comisión)

Se configura en *Admin › Tarifas › Prepago*: comisión por domicilio ($500 por defecto), recarga mínima, tu número Nequi/Daviplata y el porcentaje del socio.

1. **El domiciliario recarga** desde *Mi caja › Recargar*:
   - por **Nequi o Daviplata** a tu número, subiendo la foto del comprobante;
   - o en **efectivo** con un socio local.
2. **Tú (en *Admin › Saldos*) o un socio aprueban** la recarga desde el celular, después de confirmar que el dinero llegó.
3. **Cada domicilio aceptado descuenta la comisión** del saldo, en la misma operación. **Sin saldo, no puede aceptar** domicilios.
4. **Si cancelas o reasignas** un pedido ya cobrado, la comisión se le devuelve sola.
5. **Socios locales:** en *Admin › Saldos* conviertes a un tendero de confianza en socio. Le aparece la pestaña *Recargas* para aprobar las recargas en efectivo y ver cuánto recibió, cuánto es su parte y cuánto te debe entregar.
6. **Ajustes manuales:** desde *Admin › Saldos* puedes dar bonos (por ejemplo, de bienvenida) o hacer correcciones. Todo queda en el historial de movimientos.

Las reglas de Firestore impiden que un domiciliario acepte un pedido sin descontar la comisión, y que se suba el saldo él mismo. Solo el admin o un socio pueden hacerlo.

Los domiciliarios nuevos empiezan con saldo $0. Si quieres que su primer domicilio sea gratis, dales un bono desde *Saldos › Ajustar*.

## Activación automática de domiciliarios

Se configura en *Admin › Tarifas › Domiciliarios*.

**Requisitos que la app exige al registrarse:**
- selfie;
- foto de la cédula;
- foto del vehículo (si no es a pie);
- GPS activo dentro del radio del pueblo (30 km por defecto);
- declarar que es mayor de edad;
- aceptar el compromiso del servicio y el tratamiento de datos;
- código de invitación, solo si lo exiges.

Si cumple todo, la cuenta **se activa al instante en nivel de prueba**:
- solo puede tomar pedidos de hasta $50.000;
- solo un pedido a la vez (los dos límites se configuran).

**Sube a nivel completo automáticamente** al llegar a 10 entregas con calificación de 4★ o más y casi todas entregadas con código. La revisión corre cada vez que tienes el panel de administrador abierto. También puedes subirlo a mano con "Nivel completo", o suspenderlo.

**Códigos de invitación:** en *Admin › Aprobar* los creas, con número máximo de usos, y los compartes por WhatsApp. Así una tienda de confianza puede "recomendar" domiciliarios.

**Documentos:** se guardan en la colección `courierDocs`. Solo los ve el domiciliario y el administrador. Revísalos con el botón "Documentos": compara la selfie con la cédula.

La app no puede comprobar por sí sola que la cédula sea real ni que la persona de la selfie sea la misma. Por eso existe el nivel de prueba con límites: si alguien hace trampa, el daño máximo es un pedido pequeño, y lo suspendes con un toque.

## App Android (Capacitor)

Es la misma app empaquetada como app nativa, con dos cosas que la web no puede hacer bien:

- **GPS del domiciliario con la pantalla apagada:** un servicio en primer plano muestra la notificación "MandaoYa: estás en línea" y sigue enviando la ubicación.
- **Notificaciones push con la app cerrada:** pedido nuevo, recarga por aprobar, "tu pedido va en camino", etc.

La web (GitHub Pages) sigue funcionando igual para los clientes.

### A. Obtener el APK (sin instalar nada en tu PC)

1. Sube al repositorio, además de la app web:
   - `package.json`, `capacitor.config.json`, `firebase.json`
   - las carpetas `scripts/`, `resources/` y `functions/` (sin `node_modules`)
   - el archivo `.github/workflows/android.yml`. Si la carpeta `.github` no sube al arrastrarla, crea el archivo con *Add file › Create new file* escribiendo como nombre `.github/workflows/android.yml` y pega su contenido.
2. En la pestaña **Actions** del repositorio corre "App Android" (unos 10 minutos).
3. Al terminar, abre la ejecución y descarga **mandaoya-android** (en *Artifacts*). Adentro está `app-debug.apk`.
4. Pásalo al celular Android, ábrelo y permite "instalar apps de origen desconocido".

Cada vez que subas cambios se genera un APK nuevo.

### B. Activar las notificaciones push

1. En la consola de Firebase: *Configuración del proyecto › Agregar app › Android*.
   - Paquete: `co.com.miquitec.mandaoya`
   - Descarga `google-services.json`.
2. En GitHub: *Settings › Secrets and variables › Actions › New repository secret*.
   - Nombre: `GOOGLE_SERVICES_JSON`
   - Valor: todo el contenido del archivo.
3. En `config.js` pon `nativePush: true` y súbelo.
4. Activa el plan **Blaze** en Firebase. Se paga por uso; con poco movimiento queda prácticamente en $0. Configura una alerta de presupuesto.
5. Publica las funciones que envían las notificaciones. Se hace una sola vez, desde tu PC con Node.js instalado:
   ```
   npm install -g firebase-tools
   firebase login
   firebase use TU-PROYECTO
   cd functions && npm install && cd ..
   firebase deploy --only functions,firestore:rules
   ```
6. Corre de nuevo la compilación en Actions e instala el APK nuevo.

### C. Publicar en Google Play (cuando quieras)

1. Crea la cuenta de desarrollador en Google Play Console (pago único).
2. Crea tu llave de firma una sola vez, y **guárdala muy bien**: sin ella no podrás actualizar la app.
   ```
   keytool -genkey -v -keystore mandaoya.jks -alias mandaoya -keyalg RSA -keysize 2048 -validity 10000
   ```
3. Agrega estos secretos en GitHub:
   - `ANDROID_KEYSTORE_BASE64`: el archivo .jks en base64
   - `ANDROID_KEYSTORE_PASSWORD`
   - `ANDROID_KEY_ALIAS`: `mandaoya`
   - `ANDROID_KEY_PASSWORD`
4. Actions generará también `app-release.aab` firmado. Ese es el archivo que se sube a Play Console.
5. En Play Console declara el uso de **ubicación en un servicio en primer plano**: Google pide explicar para qué es y a veces un video corto. Usa el texto "el domiciliario comparte su ubicación con el cliente mientras está en línea entregando un pedido".

## 5. Limitaciones de esta versión

- **Alertas en la web:** suenan solo con la app abierta. En la **app Android** llegan como notificación push aunque esté cerrada (ver la sección App Android).
- **Cuentas:** son anónimas y quedan atadas al teléfono. Si se borra la app o los datos de Safari, toca registrarse de nuevo. Más adelante se puede pasar a verificación por SMS o WhatsApp.
- **Pagos:** Nequi y Daviplata son manuales (el cliente muestra el comprobante). No hay pasarela de pagos.
- **Mapa:** las rutas son en línea recta hasta el destino, porque no hay un mapa de calles confiable para calcular rutas. Cuando completes el mapa del pueblo en OpenStreetMap con MapaPayán, se puede agregar un ruteo real.
- **Enlace de seguimiento:** quien tenga el enlace ve el pedido y el código. Compártelo solo con el cliente.

## Archivos

| Archivo | Qué es |
|---|---|
| `config.js` | **El único que debes editar**: datos de Firebase y centro del mapa |
| `firestore.rules` | Reglas de seguridad para pegar en la consola |
| `js/app.js` | Arranque, registro y enrutador |
| `js/cliente.js`, `tienda.js`, `domi.js`, `admin.js`, `seguir.js` | Una pantalla por rol |
| `js/db.js` | Capa de datos (demo local o Firestore) |
| `js/ui.js` | Utilidades, mapa, cálculos de tiempo y precios |

Versión 1 · MIQUITEC SAS
