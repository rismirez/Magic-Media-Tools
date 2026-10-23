const { app, BrowserWindow, dialog, ipcMain, protocol, shell, session } = require('electron');
const fs = require('node:fs/promises');
const path = require('node:path');
const video = require('./video.cjs');

const isDev = process.env.ELECTRON_DEV === '1';
const DIST = path.join(__dirname, '..', 'dist');

// Servimos el build desde app:// (y no file://) para que los workers y los .wasm carguen con normalidad.
protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } },
]);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.wasm': 'application/wasm',
  '.svg': 'image/svg+xml',
  '.json': 'application/json',
  '.png': 'image/png',
};

const CSP = [
  "default-src 'self'",
  "script-src 'self' 'wasm-unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "worker-src 'self' blob:",
  "media-src 'self' blob:",
  "connect-src 'self' blob: data:",
].join('; ');

/** Carpeta de destino elegida por el usuario: es la única donde el renderer puede escribir. */
let outputRoot = null;

function registerAppProtocol() {
  protocol.handle('app', async (request) => {
    const { pathname } = new URL(request.url);
    const rel = decodeURIComponent(pathname === '/' ? '/index.html' : pathname);
    const file = path.normalize(path.join(DIST, rel));
    if (!file.startsWith(DIST + path.sep)) return new Response('Forbidden', { status: 403 });
    try {
      const body = await fs.readFile(file);
      return new Response(body, {
        headers: {
          'Content-Type': MIME[path.extname(file).toLowerCase()] ?? 'application/octet-stream',
          'Content-Security-Policy': CSP,
        },
      });
    } catch {
      return new Response('Not found', { status: 404 });
    }
  });
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 820,
    minWidth: 760,
    minHeight: 560,
    title: 'Media Compressor',
    icon: path.join(__dirname, 'icon.png'),
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  // Nada de navegar ni abrir ventanas fuera de la app.
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith('app://') && !(isDev && url.startsWith('http://localhost:5173'))) e.preventDefault();
  });

  win.loadURL(isDev ? 'http://localhost:5173' : 'app://bundle/index.html');
}

function uniqueName(dir, name, taken) {
  const ext = path.extname(name);
  const stem = name.slice(0, name.length - ext.length);
  return (async () => {
    let candidate = name;
    let n = 0;
    for (;;) {
      const full = path.join(dir, candidate);
      const exists = taken.has(full) || (await fs.access(full).then(() => true, () => false));
      if (!exists) return candidate;
      candidate = `${stem}-${++n}${ext}`;
    }
  })();
}

const written = new Set();

ipcMain.handle('output:choose', async (event) => {
  // Gancho sólo para pruebas automáticas (nunca en la app empaquetada).
  if (!app.isPackaged && process.env.MC_TEST_OUTPUT_DIR) {
    outputRoot = process.env.MC_TEST_OUTPUT_DIR;
    written.clear();
    return outputRoot;
  }
  const win = BrowserWindow.fromWebContents(event.sender);
  const res = await dialog.showOpenDialog(win, {
    properties: ['openDirectory', 'createDirectory'],
    title: 'Carpeta de destino',
  });
  if (res.canceled || !res.filePaths[0]) return null;
  outputRoot = res.filePaths[0];
  written.clear();
  return outputRoot;
});

ipcMain.handle('output:write', async (_event, relPath, data) => {
  if (!outputRoot) throw new Error('No hay carpeta de destino elegida');
  if (typeof relPath !== 'string' || !(data instanceof Uint8Array)) throw new Error('Petición inválida');

  const target = path.resolve(outputRoot, ...relPath.split('/'));
  if (!target.startsWith(path.resolve(outputRoot) + path.sep)) throw new Error('Ruta fuera de la carpeta de destino');

  const dir = path.dirname(target);
  await fs.mkdir(dir, { recursive: true });
  const name = await uniqueName(dir, path.basename(target), written);
  const finalPath = path.join(dir, name);
  written.add(finalPath);
  await fs.writeFile(finalPath, data, { flag: 'wx' });
  return path.relative(outputRoot, finalPath).split(path.sep).join('/');
});

/** Ruta de salida segura y sin colisiones dentro de la carpeta elegida. */
async function resolveOutput(relPath) {
  if (!outputRoot) throw new Error('No hay carpeta de destino elegida');
  if (typeof relPath !== 'string') throw new Error('Petición inválida');
  const target = path.resolve(outputRoot, ...relPath.split('/'));
  if (!target.startsWith(path.resolve(outputRoot) + path.sep)) throw new Error('Ruta fuera de la carpeta de destino');
  const dir = path.dirname(target);
  await fs.mkdir(dir, { recursive: true });
  const name = await uniqueName(dir, path.basename(target), written);
  const finalPath = path.join(dir, name);
  written.add(finalPath);
  return finalPath;
}

ipcMain.handle('video:run', async (event, req) => {
  const { id, inputPath, relOut, options } = req ?? {};
  if (typeof inputPath !== 'string' || !path.isAbsolute(inputPath)) throw new Error('Ruta de entrada inválida');
  if (!(await fs.stat(inputPath)).isFile()) throw new Error('La entrada no es un archivo');
  if (typeof relOut !== 'string' || !video.isAllowedOutput(relOut)) throw new Error('Extensión de salida no permitida');
  const outputPath = await resolveOutput(relOut);
  const size = await video.run({
    id,
    inputPath,
    outputPath,
    options,
    onProgress: (ratio) => event.sender.send('video:progress', { id, ratio }),
  });
  return { relPath: path.relative(outputRoot, outputPath).split(path.sep).join('/'), size };
});

ipcMain.handle('video:cancel', (_event, id) => video.cancel(id));

ipcMain.handle('output:open', async () => {
  if (outputRoot) await shell.openPath(outputRoot);
});

/** Busca actualizaciones en GitHub Releases (sólo instalada, no portable ni en desarrollo). Si falla, se ignora. */
function checkForUpdates() {
  if (!app.isPackaged || process.env.PORTABLE_EXECUTABLE_FILE) return;
  try {
    const { autoUpdater } = require('electron-updater');
    autoUpdater.on('error', () => {});
    autoUpdater.checkForUpdatesAndNotify().catch(() => {});
  } catch {
    /* sin actualizaciones automáticas */
  }
}

app.whenReady().then(() => {
  if (!isDev) registerAppProtocol();
  // Sin permisos especiales (cámara, geolocalización, etc.).
  session.defaultSession.setPermissionRequestHandler((_wc, _perm, cb) => cb(false));
  createWindow();
  checkForUpdates();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
