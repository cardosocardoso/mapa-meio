#!/usr/bin/env node
//
// Build the local geocoder + candidate-town database from GeoNames (free, ~13 MB).
//
//   node scripts/build-geodata.mjs
//
// Produces data/geo.db with two tables:
//   cities (populated places, with population)  -> city autocomplete + meeting candidates
//   zips   (US postal codes)                    -> ZIP-code autocomplete
//
// No OSM parsing and no routing engine needed for this step — Valhalla handles routing
// separately. This keeps geocoding tiny in both disk and RAM.
import Database from 'better-sqlite3';
import { unzipSync } from 'fflate';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { mkdirSync } from 'node:fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const DB_PATH = process.env.GEO_DB ?? resolve(ROOT, 'data/geo.db');

const CITIES_URL = 'https://download.geonames.org/export/dump/cities500.zip';
const ZIP_URL = 'https://download.geonames.org/export/zip/US.zip';
const COUNTRY = process.env.GEO_COUNTRY ?? 'US';

async function fetchZipEntry(url, entryName) {
  process.stdout.write(`  downloading ${url}\n`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Download failed ${res.status}: ${url}`);
  const buf = new Uint8Array(await res.arrayBuffer());
  const files = unzipSync(buf, { filter: (f) => f.name === entryName });
  if (!files[entryName]) throw new Error(`${entryName} not found in ${url}`);
  return Buffer.from(files[entryName]).toString('utf8');
}

mkdirSync(resolve(ROOT, 'data'), { recursive: true });
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.exec(`
  DROP TABLE IF EXISTS cities;
  DROP TABLE IF EXISTS zips;
  CREATE TABLE cities (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    state TEXT,
    lat REAL NOT NULL,
    lon REAL NOT NULL,
    population INTEGER NOT NULL DEFAULT 0,
    weight INTEGER NOT NULL DEFAULT 0
  );
  CREATE TABLE zips (
    zip TEXT PRIMARY KEY,
    name TEXT,
    state TEXT,
    lat REAL NOT NULL,
    lon REAL NOT NULL
  );
`);

// --- cities500: populated places (feature class P) for the chosen country ---
console.log('==> Cities');
const citiesTxt = await fetchZipEntry(CITIES_URL, 'cities500.txt');
const cityRows = [];
for (const line of citiesTxt.split('\n')) {
  if (!line) continue;
  const c = line.split('\t');
  // geonameid, name, ascii, alt, lat, lon, fclass, fcode, country, cc2, admin1, ...pop@14
  if (c[8] !== COUNTRY) continue;
  const lat = parseFloat(c[4]);
  const lon = parseFloat(c[5]);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
  const population = parseInt(c[14], 10) || 0;
  cityRows.push({
    id: parseInt(c[0], 10),
    name: c[1],
    state: c[10] || null,
    lat,
    lon,
    population,
    weight: population,
  });
}
const insCity = db.prepare(
  'INSERT OR REPLACE INTO cities (id,name,state,lat,lon,population,weight) VALUES (@id,@name,@state,@lat,@lon,@population,@weight)'
);
db.transaction((rows) => rows.forEach((r) => insCity.run(r)))(cityRows);
console.log(`    ${cityRows.length} cities`);

// --- US postal codes ---
console.log('==> ZIP codes');
const zipTxt = await fetchZipEntry(ZIP_URL, `${COUNTRY}.txt`);
const zipRows = [];
for (const line of zipTxt.split('\n')) {
  if (!line) continue;
  const c = line.split('\t');
  // country, postal, place, admin1, admin1code, admin2, admin2code, admin3, admin3code, lat, lon, acc
  const lat = parseFloat(c[9]);
  const lon = parseFloat(c[10]);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
  zipRows.push({ zip: c[1], name: c[2], state: c[4] || null, lat, lon });
}
const insZip = db.prepare(
  'INSERT OR REPLACE INTO zips (zip,name,state,lat,lon) VALUES (@zip,@name,@state,@lat,@lon)'
);
db.transaction((rows) => rows.forEach((r) => insZip.run(r)))(zipRows);
console.log(`    ${zipRows.length} ZIP codes`);

console.log('==> Indexing');
db.exec(`
  CREATE INDEX idx_cities_lat ON cities(lat);
  CREATE INDEX idx_cities_lon ON cities(lon);
  CREATE INDEX idx_cities_name ON cities(name COLLATE NOCASE);
  CREATE INDEX idx_zips_zip ON zips(zip);
`);
db.close();
console.log(`Done -> ${DB_PATH}`);
