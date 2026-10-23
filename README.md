# Media Compressor

Conversor y compresor de imágenes por lotes, 100 % local (nada se sube a servidores). Mismo código para **web** (Vite + TypeScript) y **escritorio** (Electron).

Basado en el análisis de *Image Compressor & WebP Converter*: cola por lotes, 4 perfiles de calidad, redimensionado con proporción, canal alfa y guardado no destructivo.

## Funciones

- Entrada: WebP, AVIF, JPEG, PNG, HEIC/HEIF, TIFF (también GIF/BMP); archivos, carpetas y arrastrar y soltar.
- Salida: WebP, AVIF, JPEG, PNG.
- Perfiles: Mantener calidad original · Optimización sin pérdida · Equilibrado · Más pequeño.
- Redimensionado por ancho/alto máximo (sin deformar, sin ampliar).
- Transparencia conservada en WebP/AVIF/PNG (JPEG se rellena de blanco).
- No destructivo: los originales no se tocan y nunca se sobrescribe (se añade `-1`, `-2`…).
- Destino: carpeta (File System Access API / diálogo nativo en Electron) o ZIP.
- Códecs WASM (`@jsquash/*`) en Web Workers; HEIC con `heic-to`, TIFF con `utif2`.

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

- `src/engine/` — worker de conversión, pool, perfiles de calidad, lectura de entradas.
- `src/platform/sinks.ts` — destinos de salida (carpeta, ZIP, Electron).
- `src/i18n/` — textos (de momento sólo español; para inglés, añadir `en.ts`).
- `electron/` — proceso principal (protocolo `app://`, CSP, escritura restringida a la carpeta elegida) y preload.

## Limitaciones conocidas

- JPEG no tiene modo sin pérdida real: «sin pérdida» usa calidad 100.
- PNG es siempre sin pérdida (sin cuantización a paleta).
- El PDF indica HEIC solo de lectura; aquí también es solo de entrada.
