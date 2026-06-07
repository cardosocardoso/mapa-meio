import { describe, it, expect } from 'vitest';
import { formatDuration, formatMiles } from '../web/src/format.js';

describe('formatDuration', () => {
  it('formats hours and minutes', () => {
    expect(formatDuration(5 * 3600 + 12 * 60)).toBe('5h 12m');
  });
  it('formats whole hours', () => {
    expect(formatDuration(3 * 3600)).toBe('3h');
  });
  it('formats minutes only', () => {
    expect(formatDuration(47 * 60)).toBe('47m');
  });
  it('formats seconds for tiny values', () => {
    expect(formatDuration(30)).toBe('30s');
  });
  it('clamps negatives to 0s', () => {
    expect(formatDuration(-100)).toBe('0s');
  });
});

describe('formatMiles', () => {
  it('converts km to miles', () => {
    expect(formatMiles(1131)).toBe('703 mi'); // 703 mi ≈ 1131 km
  });
});
