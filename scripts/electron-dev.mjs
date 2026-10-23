// Arranca Vite y, cuando responde, abre Electron apuntando a él.
// Se usa node directamente (en vez de concurrently/wait-on) porque los .cmd de node_modules/.bin
// fallan cuando la ruta del proyecto contiene "&".
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import net from 'node:net';

const require = createRequire(import.meta.url);
const PORT = 5173;

const vite = spawn(process.execPath, [require.resolve('vite/bin/vite.js'), '--port', String(PORT), '--strictPort'], {
  stdio: 'inherit',
});

const waitForPort = () =>
  new Promise((resolve) => {
    const tryConnect = () => {
      const s = net.connect(PORT, '127.0.0.1');
      s.once('connect', () => {
        s.destroy();
        resolve();
      });
      s.once('error', () => setTimeout(tryConnect, 250));
    };
    tryConnect();
  });

await waitForPort();

const electron = spawn(require('electron'), ['.'], {
  stdio: 'inherit',
  env: { ...process.env, ELECTRON_DEV: '1' },
});

const stop = () => {
  vite.kill();
  electron.kill();
};
electron.on('exit', (code) => {
  vite.kill();
  process.exit(code ?? 0);
});
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
