// Read-only access to the local GeoNames database (built by scripts/build-geodata.mjs).
// Provides both the autocomplete geocoder (cities + ZIP codes) and the candidate-town
// source for the meeting-point search.
import Database from 'better-sqlite3';
import { existsSync } from 'node:fs';
import { config } from '../config.mjs';
import { contains } from './geo.mjs';

let db = null;

function getDb() {
  if (db) return db;
  if (!existsSync(config.geoDb)) {
    throw new Error(`geo.db not found at ${config.geoDb}. Run: npm run build:geo`);
  }
  db = new Database(config.geoDb, { readonly: true, fileMustExist: true });
  return db;
}

export function geoReady() {
  return existsSync(config.geoDb);
}

/**
 * Candidate towns inside `polygon`. Bbox-prefilters in SQL, keeps points actually inside
 * the polygon, ordered by population, capped at `limit`.
 */
export function candidatesInPolygon(polygon, bbox, limit) {
  const rows = getDb()
    .prepare(
      `SELECT id, name, state, lat, lon, population, weight
         FROM cities
        WHERE lat BETWEEN @south AND @north
          AND lon BETWEEN @west AND @east
        ORDER BY weight DESC`
    )
    .all(bbox);

  const inside = [];
  for (const r of rows) {
    if (contains(polygon, r.lon, r.lat)) {
      inside.push({ ...r, name: r.state ? `${r.name}, ${r.state}` : r.name });
      if (inside.length >= limit) break;
    }
  }
  return inside;
}

/**
 * Autocomplete search. Numeric queries match ZIP codes by prefix; otherwise city names
 * by prefix (ranked by population). Returns [{ label, lat, lon, type }].
 */
export function searchAutocomplete(q, limit = 8) {
  const query = q.trim();
  if (query.length < 2) return [];
  const d = getDb();

  if (/^\d/.test(query)) {
    return d
      .prepare(
        `SELECT zip, name, state, lat, lon FROM zips
          WHERE zip LIKE ? ORDER BY zip LIMIT ?`
      )
      .all(`${query}%`, limit)
      .map((r) => ({
        label: `${r.zip} · ${r.name}${r.state ? ', ' + r.state : ''}`,
        lat: r.lat,
        lon: r.lon,
        type: 'zip',
      }));
  }

  return d
    .prepare(
      `SELECT name, state, lat, lon, population FROM cities
        WHERE name LIKE ? COLLATE NOCASE
        ORDER BY population DESC LIMIT ?`
    )
    .all(`${query}%`, limit)
    .map((r) => ({
      label: r.state ? `${r.name}, ${r.state}` : r.name,
      lat: r.lat,
      lon: r.lon,
      type: 'city',
    }));
}
