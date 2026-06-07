// Runs before any test module imports. Points the server config at a mocked Valhalla and
// a throwaway GeoNames-style SQLite fixture, and installs the fake fetch.
import Database from 'better-sqlite3';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdtempSync } from 'node:fs';
import { installMockFetch } from './helpers/mockEngines.js';

const dir = mkdtempSync(join(tmpdir(), 'mapa-meio-test-'));
const dbPath = join(dir, 'geo.db');

process.env.VALHALLA_URL = 'http://mock.valhalla';
process.env.GEO_DB = dbPath;

// Cities chosen to sit inside the Chicago↔Baltimore feasible band, plus decoys outside it.
export const FIXTURE_CITIES = [
  // inside (lon ~ -82, lat 39.5–41) — survive both tight and wide tolerances
  { id: 1, name: 'Midville', state: 'OH', lat: 40.5, lon: -82.0, population: 25000 },
  { id: 2, name: 'Equipoint', state: 'OH', lat: 41.0, lon: -82.2, population: 90000 },
  { id: 3, name: 'Centerton', state: 'OH', lat: 39.8, lon: -81.8, population: 12000 },
  { id: 4, name: 'Fairhaven', state: 'OH', lat: 40.2, lon: -82.4, population: 4000 },
  // decoys outside the feasible intersection
  { id: 5, name: 'FarWest', state: 'IA', lat: 41.88, lon: -95.0, population: 500000 },
  { id: 6, name: 'FarEast', state: 'NJ', lat: 39.29, lon: -70.0, population: 500000 },
  { id: 7, name: 'WayNorth', state: 'ON', lat: 49.0, lon: -82.0, population: 500000 },
  // endpoints, for city autocomplete tests
  { id: 8, name: 'Chicago', state: 'IL', lat: 41.8781, lon: -87.6298, population: 2700000 },
  { id: 9, name: 'Baltimore', state: 'MD', lat: 39.2904, lon: -76.6122, population: 590000 },
];

export const FIXTURE_ZIPS = [
  { zip: '60601', name: 'Chicago', state: 'IL', lat: 41.8853, lon: -87.6216 },
  { zip: '21201', name: 'Baltimore', state: 'MD', lat: 39.2966, lon: -76.6217 },
  { zip: '60614', name: 'Chicago', state: 'IL', lat: 41.9215, lon: -87.6513 },
];

const db = new Database(dbPath);
db.exec(`
  CREATE TABLE cities (
    id INTEGER PRIMARY KEY, name TEXT, state TEXT, lat REAL, lon REAL,
    population INTEGER, weight INTEGER
  );
  CREATE TABLE zips (zip TEXT PRIMARY KEY, name TEXT, state TEXT, lat REAL, lon REAL);
  CREATE INDEX idx_cities_lat ON cities(lat);
  CREATE INDEX idx_cities_lon ON cities(lon);
  CREATE INDEX idx_cities_name ON cities(name COLLATE NOCASE);
  CREATE INDEX idx_zips_zip ON zips(zip);
`);
const insC = db.prepare(
  'INSERT INTO cities (id,name,state,lat,lon,population,weight) VALUES (?,?,?,?,?,?,?)'
);
for (const c of FIXTURE_CITIES) insC.run(c.id, c.name, c.state, c.lat, c.lon, c.population, c.population);
const insZ = db.prepare('INSERT INTO zips (zip,name,state,lat,lon) VALUES (?,?,?,?,?)');
for (const z of FIXTURE_ZIPS) insZ.run(z.zip, z.name, z.state, z.lat, z.lon);
db.close();

installMockFetch();
