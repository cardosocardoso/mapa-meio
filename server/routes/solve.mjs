// POST /api/solve — find the fair (equal-drive-time) meeting region between A and B.
import { config } from '../config.mjs';
import * as valhalla from '../lib/valhalla.mjs';
import { intersectPolys, bounds, centroid } from '../lib/geo.mjs';
import { candidatesInPolygon, geoReady } from '../lib/geodata.mjs';

// Multipliers of the total time T to try as isochrone contours until the two
// isochrones actually overlap. Starts at the requested band edge (0.5+thr) and
// widens as a fallback so a result is (almost) always produced.
function contourLadder(threshold) {
  const start = 0.5 + threshold;
  const ladder = [start, 0.6, 0.7, 0.85, 1.0].filter((m, i, arr) => arr.indexOf(m) === i && m >= start);
  return ladder.length ? ladder : [start];
}

function clampThreshold(t) {
  const n = Number(t);
  if (!Number.isFinite(n)) return 0;
  return Math.min(0.2, Math.max(0, n));
}

function isLatLon(p) {
  return p && Number.isFinite(p.lat) && Number.isFinite(p.lon);
}

export default async function solveRoutes(app) {
  app.post('/api/solve', async (request, reply) => {
    const { a, b } = request.body ?? {};
    const threshold = clampThreshold(request.body?.threshold);

    if (!isLatLon(a) || !isLatLon(b)) {
      return reply.code(400).send({ error: 'Provide a and b as {lat, lon}.' });
    }
    if (!geoReady()) {
      return reply.code(503).send({ error: 'geo.db not built yet. Run: npm run build:geo' });
    }

    // 1) Total fastest driving time A→B.
    const trip = await valhalla.route(a, b);
    const T = trip.time; // seconds
    const half = T / 2;

    // 2) Feasible band = intersection of both isochrones at contour (0.5+thr)·T,
    //    widening the contour only if the two don't overlap.
    let feasible = null;
    let usedMultiplier = null;
    for (const mult of contourLadder(threshold)) {
      const minutes = (mult * T) / 60;
      const [isoA, isoB] = await Promise.all([
        valhalla.isochrone(a, minutes),
        valhalla.isochrone(b, minutes),
      ]);
      feasible = intersectPolys(isoA, isoB);
      if (feasible) {
        usedMultiplier = mult;
        break;
      }
    }
    if (!feasible) {
      return reply.code(422).send({
        error: 'Could not find an overlapping reachable region between these points.',
      });
    }
    const widened = usedMultiplier > 0.5 + threshold + 1e-9;

    // 3) Candidate towns inside the feasible band.
    const bbox = bounds(feasible);
    let towns = candidatesInPolygon(feasible, bbox, config.maxCandidates);

    let midpoint;
    let candidates = [];

    if (towns.length === 0) {
      // Fallback: no named settlement in band — return the geometric centroid.
      midpoint = { ...centroid(feasible), name: 'Midpoint (no town nearby)', synthetic: true };
    } else {
      // 4) Drive times from A and B to every candidate (one matrix call).
      const m = await valhalla.matrix([a, b], towns);
      const fromA = m[0];
      const fromB = m[1];

      const ratioMin = 0.5 - threshold;
      const ratioMax = 0.5 + threshold;

      const scored = [];
      for (let i = 0; i < towns.length; i++) {
        const tA = fromA[i]?.time;
        const tB = fromB[i]?.time;
        if (tA == null || tB == null) continue;
        const total = tA + tB;
        if (total <= 0) continue;
        const ratio = tA / total;
        const inBand = ratio >= ratioMin - 1e-9 && ratio <= ratioMax + 1e-9;
        scored.push({ town: towns[i], tA, tB, total, ratio, inBand });
      }

      // Keep in-band towns; if none qualify, relax to all scored (sorted by balance).
      let pool = scored.filter((s) => s.inBand);
      const relaxed = pool.length === 0;
      if (relaxed) pool = scored;

      const minTotal = Math.min(...pool.map((s) => s.total));
      for (const s of pool) {
        s.score =
          config.scoring.alpha * Math.abs(s.ratio - 0.5) +
          config.scoring.beta * (s.total / minTotal - 1);
      }
      pool.sort((a, b) => a.score - b.score);

      candidates = pool.slice(0, config.resultLimit).map((s) => ({
        name: s.town.name,
        lat: s.town.lat,
        lon: s.town.lon,
        place: s.town.place,
        population: s.town.population,
        timeA: Math.round(s.tA),
        timeB: Math.round(s.tB),
        totalTime: Math.round(s.total),
        ratio: s.ratio,
        shareA: Math.round(s.ratio * 100),
        shareB: Math.round((1 - s.ratio) * 100),
        inBand: s.inBand,
      }));

      const best = candidates[0];
      midpoint = { name: best.name, lat: best.lat, lon: best.lon, synthetic: false };
    }

    return {
      a,
      b,
      threshold,
      totalTime: Math.round(T),
      halfTime: Math.round(half),
      route: trip.geometry,
      routeDistance: trip.distance,
      feasible, // GeoJSON Feature (Polygon/MultiPolygon)
      bbox,
      midpoint,
      candidates,
      meta: {
        candidateCount: towns.length,
        widenedBand: widened,
        usedMultiplier,
        relaxedRatio: candidates.length > 0 && candidates.every((c) => !c.inBand),
      },
    };
  });
}
