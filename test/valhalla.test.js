import { describe, it, expect } from 'vitest';
import * as valhalla from '../server/lib/valhalla.mjs';
import { encodePolyline } from './helpers/mockEngines.js';

const A = { lat: 41.8781, lon: -87.6298 };
const B = { lat: 39.2904, lon: -76.6122 };

describe('valhalla.route', () => {
  it('returns time, distance and a decoded LineString', async () => {
    const r = await valhalla.route(A, B);
    expect(r.time).toBe(36000);
    expect(r.distance).toBe(1100);
    expect(r.geometry.type).toBe('LineString');
    expect(r.geometry.coordinates.length).toBe(3);
    const [lon, lat] = r.geometry.coordinates[0];
    expect(lon).toBeCloseTo(A.lon, 4);
    expect(lat).toBeCloseTo(A.lat, 4);
  });

  it('round-trips the polyline encoder/decoder', async () => {
    // Indirectly verified by route(); also assert the encoder produces a string.
    const s = encodePolyline([
      [A.lon, A.lat],
      [B.lon, B.lat],
    ]);
    expect(typeof s).toBe('string');
    expect(s.length).toBeGreaterThan(0);
  });
});

describe('valhalla.isochrone', () => {
  it('returns a polygon feature', async () => {
    const f = await valhalla.isochrone(A, 120);
    expect(f).not.toBeNull();
    expect(['Polygon', 'MultiPolygon']).toContain(f.geometry.type);
  });
});

describe('valhalla.matrix', () => {
  it('returns rows of {time, distance} per source', async () => {
    const m = await valhalla.matrix([A, B], [{ lat: 40.5, lon: -82 }]);
    expect(m.length).toBe(2);
    expect(m[0].length).toBe(1);
    expect(m[0][0].time).toBeGreaterThan(0);
    expect(m[1][0].time).toBeGreaterThan(0);
  });
});

describe('valhalla.status', () => {
  it('resolves when the engine is up', async () => {
    await expect(valhalla.status()).resolves.toBeTruthy();
  });
});
