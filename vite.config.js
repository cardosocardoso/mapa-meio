import { defineConfig } from 'vite';

// Frontend lives in web/, builds to dist/ (served by Fastify in production).
// In dev, Vite proxies API calls to the Fastify server on :3000.
export default defineConfig({
  root: 'web',
  publicDir: 'public',
  build: {
    outDir: '../dist',
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    proxy: {
      // API runs on 3100 in dev (3000 is taken by another app on this machine).
      '/api': 'http://localhost:3100',
    },
  },
});
