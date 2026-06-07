import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildApp } from '../server/app.mjs';

let app;
beforeAll(async () => {
  app = await buildApp({ logger: false, serveStatic: false });
});
afterAll(async () => {
  await app.close();
});

async function ac(q) {
  const res = await app.inject({ method: 'GET', url: `/api/autocomplete?q=${encodeURIComponent(q)}` });
  return { status: res.statusCode, body: res.json() };
}

describe('GET /api/autocomplete', () => {
  it('returns city matches as {label, lat, lon, type}', async () => {
    const { status, body } = await ac('chicago');
    expect(status).toBe(200);
    expect(body.results.length).toBeGreaterThan(0);
    const first = body.results[0];
    expect(first.label).toContain('Chicago');
    expect(first.type).toBe('city');
    expect(first).toHaveProperty('lat');
    expect(first).toHaveProperty('lon');
  });

  it('returns ZIP matches for numeric queries', async () => {
    const { body } = await ac('212');
    expect(body.results[0].type).toBe('zip');
    expect(body.results[0].label).toContain('212');
  });

  it('returns empty for short queries', async () => {
    const { body } = await ac('c');
    expect(body.results).toEqual([]);
  });
});
