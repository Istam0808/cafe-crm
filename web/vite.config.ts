import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // relative paths so the same build works when served by Django
  base: './',
  // menu photos etc., shared by both apps
  publicDir: fileURLToPath(new URL('../shared/public', import.meta.url)),
  resolve: {
    alias: { '@shared': fileURLToPath(new URL('../shared/src', import.meta.url)) },
  },
  server: {
    port: 5173,
    strictPort: true,
    // in dev the waiter app (npm run dev:waiter, port 5174) is reachable at /waiter/ of this server:
    // same origin, so in demo mode both apps share one localStorage "backend" like in production
    proxy: {
      '/waiter/': { target: 'http://localhost:5174', ws: true },
    },
  },
});
