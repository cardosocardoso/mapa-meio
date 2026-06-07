// A fake `fetch` that emulates the local Valhalla and Photon HTTP APIs so the full
// server pipeline can be tested without the real engines or any OSM data.

// Encode coords ([ [lon,lat], ... ]) as a Valhalla polyline6 string (lat then lng).
export function encodePolyline(coords, precision = 6) {
  const factor = 10 ** precision;
  let lastLat = 0;
  let lastLng = 0;
  let out = '';
  const enc = (v) => {
    v = v < 0 ? ~(v << 1) : v << 1;
    let s = '';
    while (v >= 0x20) {
      s += String.fromCharCode((0x20 | (v & 0x1f)) + 63);
      v >>= 5;
    }
    s += String.fromCharCode(v + 63);
    return s;
  };
  for (const [lng, lat] of coords) {
    const la = Math.round(lat * factor);
    const ln = Math.round(lng * factor);
    out += enc(la - lastLat);
    out += enc(ln - lastLng);
    lastLat = la;
    lastLng = ln;
  }
  return out;
}

// Axis-aligned square polygon centered on origin, half-size scaled by contour minutes.
function squareAround(origin, minutes) {
  const half = minutes * 0.02; // degrees; 300 min -> ±6°, enough to overlap cross-country
  const { lat, lon } = origin;
  const ring = [
    [lon - half, lat - half],
    [lon + half, lat - half],
    [lon + half, lat + half],
    [lon - half, lat + half],
    [lon - half, lat - half],
  ];
  return {
    type: 'Feature',
    properties: { contour: minutes },
    geometry: { type: 'Polygon', coordinates: [ring] },
  };
}

const SEC_PER_DEG = 700; // arbitrary but consistent; only ratios matter for ranking
function driveTime(a, b) {
  const dx = a.lon - b.lon;
  const dy = a.lat - b.lat;
  return Math.sqrt(dx * dx + dy * dy) * SEC_PER_DEG;
}

function json(obj) {
  return new Response(JSON.stringify(obj), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

function parseValhallaBody(urlStr) {
  const u = new URL(urlStr);
  const raw = u.searchParams.get('json');
  return raw ? JSON.parse(raw) : {};
}

// Configurable state so individual tests can tweak behaviour.
export const mockState = {
  routeTime: 36000, // 10h
  routeDistanceKm: 1100,
};

export function installMockFetch() {
  const original = globalThis.fetch;

  globalThis.fetch = async (input) => {
    const urlStr = typeof input === 'string' ? input : input.toString();

    // --- Valhalla ---
    if (urlStr.includes('mock.valhalla')) {
      if (urlStr.includes('/status')) return json({ version: 'mock', tileset_last_modified: 0 });

      const body = parseValhallaBody(urlStr);

      if (urlStr.includes('/route')) {
        const [a, b] = body.locations;
        const shape = encodePolyline([
          [a.lon, a.lat],
          [(a.lon + b.lon) / 2, (a.lat + b.lat) / 2],
          [b.lon, b.lat],
        ]);
        return json({
          trip: {
            status: 0,
            status_message: 'Found route',
            summary: { time: mockState.routeTime, length: mockState.routeDistanceKm },
            legs: [{ shape }],
          },
        });
      }

      if (urlStr.includes('/isochrone')) {
        const origin = body.locations[0];
        const minutes = body.contours[0].time;
        return json({
          type: 'FeatureCollection',
          features: [squareAround(origin, minutes)],
        });
      }

      if (urlStr.includes('/sources_to_targets')) {
        const rows = body.sources.map((s) =>
          body.targets.map((t) => ({
            time: driveTime(s, t),
            distance: driveTime(s, t) / 100,
          }))
        );
        return json({ sources_to_targets: rows });
      }
    }

    throw new Error(`Unexpected fetch in test: ${urlStr}`);
  };

  return () => {
    globalThis.fetch = original;
  };
}
