# MapaPayán: mapeo de calles y puntos para Roberto Payán

PWA para iPhone que graba con GPS los recorridos que caminas, marca negocios y referencias con foto, guarda todo en el teléfono sin internet y exporta los archivos para subirlos a OpenStreetMap y a la futura app de domicilios.

## 1. Publicarla (necesita HTTPS)

El GPS y la instalación solo funcionan si la app está en una dirección **https**. La forma gratis es GitHub Pages:

1. En github.com/miqui1995 crea un repositorio público, por ejemplo `mapapayan`.
2. Sube **el contenido** de esta carpeta (`index.html`, `app.js`, `sw.js`, `styles.css`, `manifest.webmanifest`, `vendor/`, `icons/`) a la raíz del repositorio con *Add file › Upload files*.
3. Ve a *Settings › Pages*, elige *Deploy from a branch*, rama `main` y carpeta `/ (root)`, y guarda.
4. En 1 o 2 minutos queda en `https://miqui1995.github.io/mapapayan/`.

También sirve cualquier hosting con SSL, por ejemplo un subdominio como `mapa.miquitec.com.co`.

## 2. Instalarla en el iPhone

1. Abre la dirección en **Safari** (no en Chrome).
2. Toca Compartir y luego **"Agregar a inicio"**.
3. Ábrela **siempre desde el ícono**. Los datos del ícono y los de una pestaña de Safari se guardan por separado.
4. Cuando pida ubicación, elige *Permitir*. Si te equivocas: *Ajustes › Privacidad › Localización*.
5. **Antes de salir a campo**, con señal, recorre el mapa del pueblo en las dos capas (Capa / Satélite) haciendo zoom. Así esas teselas quedan guardadas para usarlas sin internet.

## 3. Uso en campo

- **Grabar**: camina por la calle. La línea roja se dibuja con cada punto aceptado.
- **Pausa**: úsala para cruzar a otra calle o entrar a un negocio. Cada pausa corta el recorrido en tramos separados, así que conviene grabar **una calle por recorrido**.
- **Terminar**: le pones nombre, tipo de vía y superficie, y lo guardas.
- **Punto**: mueve el mapa hasta que la mira quede sobre el lugar y toca **Aquí**, o usa **Usar mi GPS** si estás parado en la puerta. Agrega nombre, referencia, teléfono, horario y foto de fachada.
- Las categorías **"Casa / cliente"** y **"Punto de referencia"** son privadas: nunca se exportan a OpenStreetMap, solo al GeoJSON para la app de domicilios.
- El chip de arriba muestra la precisión del GPS: verde ≤10 m, naranja aceptable y rojo descartado. Los puntos peores que el ajuste (20 m por defecto) se ignoran.

Limitación de iOS: Safari **no graba con la pantalla apagada ni con la app en segundo plano**. La app intenta mantener la pantalla encendida; si no puede, bloquea el apagado automático en *Ajustes › Pantalla y brillo › Bloqueo automático* mientras mapeas. Si iOS cierra la app en medio de una grabación, al abrirla de nuevo te ofrece continuar.

**Haz un respaldo cada día de trabajo** (*Datos › Crear respaldo*). Los datos viven solo en el teléfono.

## 4. Archivos que exporta

| Archivo | Para qué |
|---|---|
| `recorridos.gpx` | Trazas GPS para subir a OSM y usar como guía al dibujar calles |
| `puntos_osm.osm` | Negocios e instituciones con etiquetas OSM, listos para revisar en JOSM |
| `mapapayan.geojson` | Todo, con referencias, barrios, teléfonos y fotos: es la base de la app de domicilios |
| `fotos/` | Fotos de fachada (`<id_punto>_1.jpg`) |

## 5. Subir a OpenStreetMap

1. Crea una cuenta en openstreetmap.org.
2. **Trazas**: en *Trazas GPS › Subir traza* sube `recorridos.gpx` con visibilidad *Identificable*.
3. **Calles**: abre el editor web (botón *Editar*, editor iD) sobre San José. En el panel *Datos del mapa* carga el GPX y elige la imagen satelital *Esri World Imagery* como fondo.
   - Dibuja o corrige las calles **promediando** tu traza con la imagen. El GPS tiene de 5 a 15 m de error, así que no copies la línea tal cual.
   - Etiquétalas con `highway=residential`, `footway`, `path`, etc., y `name=Calle 3`.
   - Une las calles en los cruces.
4. **Negocios**: en JOSM (programa de PC) abre `puntos_osm.osm`, revisa que cada punto no esté repetido con algo que ya exista y súbelo. Otra opción es agregarlos uno por uno en iD.
5. En el comentario de cada cambio escribe algo como *"Calles y negocios de San José, Roberto Payán, levantados en campo con GPS"*.

Normas de OSM:

- No subas casas de personas, nombres de clientes ni teléfonos personales.
- No borres lo que ya existe sin verificarlo en campo.
- Las cargas masivas automáticas están restringidas. Por eso el flujo es revisar y subir a mano.

---

Notas técnicas: HTML, CSS y JS sin framework, con Leaflet 1.9.4 local. Los datos van en IndexedDB y el service worker cachea la app y las teselas vistas (máximo unas 4000). Versión 1, MIQUITEC SAS.
