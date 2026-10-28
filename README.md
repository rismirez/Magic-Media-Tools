# Magic Media Tools

Conversor y compresor de **imágenes y vídeos** por lotes, 100 % local (nada se sube a servidores). Mismo código para **web** (Vite + TypeScript, sin framework) y **escritorio** (Electron). Interfaz en español e inglés, tema claro/oscuro.

Basado en el análisis de *Image Compressor & WebP Converter*: cola por lotes, 4 perfiles de calidad, redimensionado con proporción, canal alfa y guardado no destructivo.

## Imagen

- Entrada: WebP, AVIF, JPEG, PNG, HEIC/HEIF, TIFF (también GIF/BMP); archivos, carpetas, arrastrar y soltar y pegar del portapapeles.
- Salida: WebP, AVIF, JPEG, PNG. Perfiles: Mantener calidad · Sin pérdida · Equilibrado · Más pequeño.
- **Peso máximo (KB):** busca la mayor calidad que cabe.
- **Tamaño:** original · reducir (sin ampliar) · **recortar** (cover, con selector de posición 3×3 y vista previa) · **encajar** (contain, con relleno). En recortar/encajar hay selector de **proporción** (1:1, 4:3, 3:4, 16:9, 9:16, 21:9 u otra): al fijarla, la otra medida se calcula sola; sin medidas se usa el mayor tamaño posible.
- **Vista previa** siempre visible (también en original y reducir) con **rotar y voltear** aplicados.
- Varias versiones por imagen (anchos para `srcset`), **marca de agua de texto o de imagen** (posición 3×3, opacidad hasta 100 % sin transparencia, tamaño), plantilla de nombre (`{nombre}`, `{ancho}`, `{alto}`, `{formato}`).
- **Visor antes/después** con deslizador: clic en una fila o en «Antes / después». Si aún no está convertida, se genera al momento con los ajustes actuales (sin guardar nada).
- Ajustes guardados con nombre, ETA.
- Transparencia conservada (JPEG se rellena de blanco). EXIF: se aplica la orientación y no se copian metadatos.
- Códecs WASM (`@jsquash/*`) en Web Workers; HEIC con `heic-to`, TIFF con `utif2`.

## Vídeo

- MP4 (H.264 / H.265) y WebM (VP9 / AV1), con perfiles de calidad, peso máximo (MB), resolución y FPS máximos, audio (mantener/quitar y calidad) y recorte de fragmento.
- Extraer un fotograma (JPEG/PNG/WebP).
- **Marca de agua** (texto o imagen, posición 3×3, opacidad, tamaño en % del ancho) en vídeo, GIF, WebP animado y fotogramas. Escritorio: el texto/imagen se dibuja como PNG y ffmpeg lo superpone; web: se pinta sobre cada fotograma con WebCodecs.
- **Escritorio:** ffmpeg incluido (rápido, todos los códecs) y además GIF animado y WebP animado.
- **Web:** WebCodecs vía [mediabunny](https://mediabunny.dev); sólo se ofrecen los formatos que tu navegador puede codificar. El resultado se genera en memoria, así que con vídeos muy grandes es mejor la app de escritorio.

## Comunes

- No destructivo: los originales no se tocan y nunca se sobrescribe (se añade `-1`, `-2`…). El destino se pregunta en cada conversión (carpeta, o ZIP en la web).
- Idioma (ES/EN) y tema en la cabecera. Cambiar de idioma recarga la interfaz.
- Web: botón **Descargar** en la cabecera (enlaza a la última *release* de GitHub; versión Windows, Mac en camino). No aparece en la app de escritorio.
- El botón **Convertir** queda fijo en la parte inferior del panel de ajustes, con el resumen y el progreso.
- Escritorio: búsqueda de actualizaciones en GitHub Releases (sólo instalador; no en portable).

## Uso

> La ruta del proyecto contiene `&`, que rompe los atajos `.cmd` de `node_modules/.bin` en Windows; por eso los scripts llaman a `node` directamente.

```bash
npm install
npm run dev              # web en http://localhost:5173
npm run build            # typecheck + build a dist/
npm run electron:dev     # escritorio con recarga en caliente
npm run electron:start   # escritorio con el build de producción
npm run electron:build   # instalador (Windows: nsis + portable) en release/
```

Si `npm install` no descarga el binario de Electron (scripts de instalación bloqueados), ejecuta `node node_modules/electron/install.js`.

## Estructura

- `src/engine/` — worker de imagen, pool, perfiles, geometría de recorte (compartida con la vista previa), vídeo web.
- `src/tabs/` — pestañas de imagen y vídeo. `src/ui/` — piezas reutilizables (cuadrícula 3×3, vista previa, comparador).
- `src/platform/sinks.ts` — destinos de salida (carpeta, ZIP, Electron).
- `src/i18n/` — textos `es.ts` (base) y `en.ts` (mismo tipo: el compilador avisa de claves que falten).
- `electron/` — proceso principal (protocolo `app://`, CSP, escritura restringida a la carpeta elegida), preload y `video.cjs` (ffmpeg con opciones validadas).

## Limitaciones conocidas

- JPEG no tiene modo sin pérdida real: «sin pérdida» usa calidad 100. PNG es siempre sin pérdida (sin cuantización a paleta).
- Las imágenes animadas (GIF/WebP) se procesan como imagen fija (primer fotograma); para animaciones usa la pestaña de vídeo.
- El peso máximo de vídeo es aproximado (tasa de bits constante, una pasada).
- Las actualizaciones automáticas requieren publicar los instaladores como *release* en GitHub.
- Los ejecutables no están firmados: Windows SmartScreen puede avisar.
