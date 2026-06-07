import { buildApp } from './app.mjs';
import { config } from './config.mjs';

const app = await buildApp();

try {
  await app.listen({ port: config.port, host: config.host });
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
