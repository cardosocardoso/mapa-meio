import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildApp } from '../server/app.mjs';

const A = { lat: 41.8781, lon: -87.6298 }; // Chicago
const B = { lat: 39.2904, lon: -76.6122 }; // Baltimore

let app;
beforeAll(async () => {
  app = await buildApp({ logger: false, serveStatic: false });
});
afterAll(async () => {
  await app.close();
});

async function solve(body) {
  const res = await app.inject({ method: 'POST', url: '/api/solve', payload: body });
  return { status: res.statusCode, body: res.json() };
}

describe('POST /api/solve', () => {
  it('returns a midpoint, route, feasible region and ranked towns', async () => {
    const { status, body } = await solve({ a: A, b: B, threshold: 0.2 });
    expect(status).toBe(200);
    expect(body.totalTime).toBe(36000);
    expect(body.route.type).toBe('LineString');
    expect(body.feasible.geometry.type).toMatch(/Polygon/);
    expect(body.candidates.length).toBeGreaterThan(0);
    // Best candidate is one of the inside fixture towns, not a decoy.
    expect(body.midpoint.name).toMatch(/^(Midville|Equipoint|Centerton|Fairhaven), OH$/);
  });

  it('excludes decoy towns outside the feasible band', async () => {
    const { body } = await solve({ a: A, b: B, threshold: 0.2 });
    const names = body.candidates.map((c) => c.name);
    expect(names).not.toContain('FarWest');
    expect(names).not.toContain('FarEast');
    expect(names).not.toContain('WayNorth');
  });

  it('ranks the most balanced town first', async () => {
    const { body } = await solve({ a: A, b: B, threshold: 0.2 });
    const best = body.candidates[0];
    // shareA closest to 50 of all returned candidates
    const minDev = Math.min(...body.candidates.map((c) => Math.abs(c.shareA - 50)));
    expect(Math.abs(best.shareA - 50)).toBe(minDev);
  });

  it('keeps in-band candidates within the tolerance ratio', async () => {
    const { body } = await solve({ a: A, b: B, threshold: 0.2 });
    const inBand = body.candidates.filter((c) => c.inBand);
    expect(inBand.length).toBeGreaterThan(0);
    for (const c of inBand) {
      expect(c.ratio).toBeGreaterThanOrEqual(0.3 - 1e-6);
      expect(c.ratio).toBeLessThanOrEqual(0.7 + 1e-6);
    }
  });

  it('still returns a result at zero tolerance (relaxes if needed)', async () => {
    const { status, body } = await solve({ a: A, b: B, threshold: 0 });
    expect(status).toBe(200);
    expect(body.candidates.length).toBeGreaterThan(0);
  });

  it('clamps threshold above the 20% maximum', async () => {
    const { body } = await solve({ a: A, b: B, threshold: 0.9 });
    expect(body.threshold).toBe(0.2);
  });

  it('rejects missing coordinates', async () => {
    const { status } = await solve({ a: A });
    expect(status).toBe(400);
  });

  it('rejects non-numeric coordinates', async () => {
    const { status } = await solve({ a: { lat: 'x', lon: 1 }, b: B, threshold: 0 });
    expect(status).toBe(400);
  });
});
