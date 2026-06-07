import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

export const config = {
  port: Number(process.env.PORT ?? 3000),
  host: process.env.HOST ?? '0.0.0.0',

  // Routing engine (Docker, see docker-compose.yml)
  valhallaUrl: process.env.VALHALLA_URL ?? 'http://localhost:8002',

  // Local geocoder + candidate-town source (GeoNames; built by scripts/build-geodata.mjs)
  geoDb: process.env.GEO_DB ?? resolve(ROOT, 'data/geo.db'),

  costing: 'auto', // Valhalla costing model for driving

  // Cap on candidate towns sent to the matrix, to bound compute. Highest-weight
  // (most populous) settlements inside the feasible band are kept first.
  maxCandidates: Number(process.env.MAX_CANDIDATES ?? 300),

  // Ranking weights: balance (how close to 50/50) vs. total driving effort.
  scoring: { alpha: 1.0, beta: 0.15 },

  // How many ranked towns to return to the client.
  resultLimit: 25,

  root: ROOT,
};
