import { describe, it, expect } from 'vitest';
import { polygon } from '@turf/turf';
import { candidatesInPolygon, searchAutocomplete, geoReady } from '../server/lib/geodata.mjs';
import { bounds } from '../server/lib/geo.mjs';

// Polygon covering the four "inside" fixture cities (lon ~ -82, lat 39.5–41.5),
// excluding the FarWest/FarEast/WayNorth decoys and the Chicago/Baltimore endpoints.
const region = polygon([
  [
    [-83, 39.5],
    [-81, 39.5],
    [-81, 41.5],
    [-83, 41.5],
    [-83, 39.5],
  ],
]);

describe('geo fixture', () => {
  it('reports the db is ready', () => {
    expect(geoReady()).toBe(true);
  });
});

describe('candidatesInPolygon', () => {
  it('returns only cities inside the polygon (with state suffix)', () => {
    const got = candidatesInPolygon(region, bounds(region), 100).map((t) => t.name).sort();
    expect(got).toEqual(['Centerton, OH', 'Equipoint, OH', 'Fairhaven, OH', 'Midville, OH']);
  });

  it('orders by population descending', () => {
    const got = candidatesInPolygon(region, bounds(region), 100);
    expect(got[0].name).toBe('Equipoint, OH');
  });

  it('respects the limit cap', () => {
    expect(candidatesInPolygon(region, bounds(region), 2).length).toBe(2);
  });
});

describe('searchAutocomplete', () => {
  it('matches city names by prefix, ranked by population', () => {
    const r = searchAutocomplete('Chi');
    expect(r[0].label).toBe('Chicago, IL');
    expect(r[0].type).toBe('city');
  });

  it('matches ZIP codes for numeric queries', () => {
    const r = searchAutocomplete('606');
    expect(r.length).toBeGreaterThan(0);
    expect(r.every((x) => x.type === 'zip')).toBe(true);
    expect(r[0].label).toContain('606');
  });

  it('returns nothing for very short queries', () => {
    expect(searchAutocomplete('c')).toEqual([]);
  });

  it('returns lat/lon for each result', () => {
    const r = searchAutocomplete('Balt');
    expect(Number.isFinite(r[0].lat)).toBe(true);
    expect(Number.isFinite(r[0].lon)).toBe(true);
  });
});
