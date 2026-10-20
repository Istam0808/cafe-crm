import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ command }) => ({
  plugins: [react()],
  // build: relative paths, so the same build works at /waiter/ of the backend and inside the Android app;
  // dev: served under /waiter/ so the cashier dev server can proxy it (see web/vite.config.ts)
  base: command === 'serve' ? '/waiter/' : './',
  // menu photos etc., shared by both apps
  publicDir: fileURLToPath(new URL('../shared/public', import.meta.url)),
  resolve: {
    alias: { '@shared': fileURLToPath(new URL('../shared/src', import.meta.url)) },
  },
  server: { port: 5174, strictPort: true },
}));
