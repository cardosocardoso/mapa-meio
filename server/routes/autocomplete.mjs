// GET /api/autocomplete?q=... — typeahead over the local GeoNames geocoder.
// Numeric queries match ZIP codes; text queries match city names.
import { searchAutocomplete, geoReady } from '../lib/geodata.mjs';

export default async function autocompleteRoutes(app) {
  app.get('/api/autocomplete', async (request, reply) => {
    const q = (request.query?.q ?? '').toString();
    if (q.trim().length < 2) return { results: [] };
    if (!geoReady()) {
      return reply.code(503).send({ error: 'geo.db not built yet. Run: npm run build:geo', results: [] });
    }
    return { results: searchAutocomplete(q) };
  });
}
