import { defineConfig } from 'vite';

export default defineConfig({
  // Rutas relativas: el mismo build sirve para la web y para el protocolo app:// de Electron.
  base: './',
  worker: { format: 'es' },
  // Los códecs WASM resuelven su .wasm con import.meta.url: no deben pre-empaquetarse.
  optimizeDeps: {
    exclude: ['@jsquash/webp', '@jsquash/avif', '@jsquash/jpeg', '@jsquash/png', '@jsquash/oxipng'],
  },
  build: { target: 'es2022' },
});
