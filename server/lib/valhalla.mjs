// Thin client for the local Valhalla routing engine.
// Docs: https://valhalla.github.io/valhalla/api/
import { config } from '../config.mjs';

async function call(endpoint, body) {
  const url = `${config.valhallaUrl}${endpoint}?json=${encodeURIComponent(
    JSON.stringify(body)
  )}`;
  const res = await fetch(url);
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Valhalla ${endpoint} failed (${res.status}): ${text.slice(0, 300)}`);
  }
  return res.json();
}

// Decode Valhalla's encoded polyline (precision 6) into [ [lon,lat], ... ].
function decodeShape(str, precision = 6) {
  const factor = 10 ** precision;
  let index = 0;
  let lat = 0;
  let lng = 0;
  const coords = [];
  while (index < str.length) {
    let shift = 0;
    let result = 0;
    let byte;
    do {
      byte = str.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    lat += result & 1 ? ~(result >> 1) : result >> 1;
    shift = 0;
    result = 0;
    do {
      byte = str.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    lng += result & 1 ? ~(result >> 1) : result >> 1;
    coords.push([lng / factor, lat / factor]);
  }
  return coords;
}

/** Fastest driving route A→B. Returns { time (s), distance (km), geometry (GeoJSON LineString) }. */
export async function route(a, b) {
  const data = await call('/route', {
    locations: [
      { lat: a.lat, lon: a.lon },
      { lat: b.lat, lon: b.lon },
    ],
    costing: config.costing,
    units: 'kilometers',
  });
  const trip = data.trip;
  if (!trip || trip.status !== 0) {
    throw new Error(`No route found: ${trip?.status_message ?? 'unknown'}`);
  }
  const coords = trip.legs.flatMap((leg) => decodeShape(leg.shape));
  return {
    time: trip.summary.time, // seconds
    distance: trip.summary.length, // km
    geometry: { type: 'LineString', coordinates: coords },
  };
}

/**
 * Isochrone polygon reachable from `origin` within `minutes` of driving.
 * Returns a GeoJSON Feature (Polygon or MultiPolygon) or null.
 */
export async function isochrone(origin, minutes) {
  const data = await call('/isochrone', {
    locations: [{ lat: origin.lat, lon: origin.lon }],
    costing: config.costing,
    contours: [{ time: minutes }],
    polygons: true,
    denoise: 0.4,
    generalize: 60,
  });
  const feature = data.features?.find(
    (f) => f.geometry?.type === 'Polygon' || f.geometry?.type === 'MultiPolygon'
  );
  return feature ?? null;
}

/**
 * Time/distance matrix from each source to each target.
 * Returns rows: result[srcIdx][tgtIdx] = { time (s)|null, distance (km)|null }.
 */
export async function matrix(sources, targets) {
  const data = await call('/sources_to_targets', {
    sources: sources.map((p) => ({ lat: p.lat, lon: p.lon })),
    targets: targets.map((p) => ({ lat: p.lat, lon: p.lon })),
    costing: config.costing,
    units: 'kilometers',
  });
  return data.sources_to_targets.map((row) =>
    row.map((cell) => ({ time: cell.time, distance: cell.distance }))
  );
}

/** Liveness check used at startup / health endpoint. */
export async function status() {
  const res = await fetch(`${config.valhallaUrl}/status`);
  if (!res.ok) throw new Error(`Valhalla status ${res.status}`);
  return res.json();
}
