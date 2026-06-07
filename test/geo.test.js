import { describe, it, expect } from 'vitest';
import { polygon } from '@turf/turf';
import { intersectPolys, bounds, contains, centroid } from '../server/lib/geo.mjs';

const sq = (minX, minY, maxX, maxY) =>
  polygon([
    [
      [minX, minY],
      [maxX, minY],
      [maxX, maxY],
      [minX, maxY],
      [minX, minY],
    ],
  ]);

describe('intersectPolys', () => {
  it('returns the overlap of two polygons', () => {
    const r = intersectPolys(sq(0, 0, 2, 2), sq(1, 1, 3, 3));
    expect(r).not.toBeNull();
    const b = bounds(r);
    expect(b.west).toBeCloseTo(1);
    expect(b.south).toBeCloseTo(1);
    expect(b.east).toBeCloseTo(2);
    expect(b.north).toBeCloseTo(2);
  });

  it('returns null for disjoint polygons', () => {
    expect(intersectPolys(sq(0, 0, 1, 1), sq(5, 5, 6, 6))).toBeNull();
  });

  it('returns null when an input is missing', () => {
    expect(intersectPolys(null, sq(0, 0, 1, 1))).toBeNull();
  });
});

describe('bounds', () => {
  it('computes a bbox', () => {
    expect(bounds(sq(-3, -1, 4, 5))).toEqual({ west: -3, south: -1, east: 4, north: 5 });
  });
});

describe('contains', () => {
  const p = sq(0, 0, 10, 10);
  it('is true inside', () => expect(contains(p, 5, 5)).toBe(true));
  it('is false outside', () => expect(contains(p, 20, 20)).toBe(false));
});

describe('centroid', () => {
  it('finds the center', () => {
    const c = centroid(sq(0, 0, 10, 10));
    expect(c.lat).toBeCloseTo(5);
    expect(c.lon).toBeCloseTo(5);
  });
});
