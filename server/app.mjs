import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import { resolve } from 'node:path';
import { existsSync } from 'node:fs';
import { config } from './config.mjs';
import solveRoutes from './routes/solve.mjs';
import autocompleteRoutes from './routes/autocomplete.mjs';
import * as valhalla from './lib/valhalla.mjs';
import { geoReady } from './lib/geodata.mjs';

export async function buildApp(opts = {}) {
  const app = Fastify({ logger: opts.logger ?? true, bodyLimit: 1_000_000 });

  await app.register(solveRoutes);
  await app.register(autocompleteRoutes);

  app.get('/api/health', async () => {
    const out = { geo: geoReady(), valhalla: false };
    try {
      await valhalla.status();
      out.valhalla = true;
    } catch {
      /* down */
    }
    return out;
  });

  // In production, serve the built frontend. In dev, Vite serves it and proxies /api here.
  const dist = resolve(config.root, 'dist');
  if (opts.serveStatic !== false && existsSync(dist)) {
    await app.register(fastifyStatic, { root: dist });
    app.setNotFoundHandler((req, reply) => {
      if (req.raw.url?.startsWith('/api/')) return reply.code(404).send({ error: 'Not found' });
      return reply.sendFile('index.html');
    });
  }

  return app;
}
