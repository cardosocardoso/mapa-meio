# Meet in the Middle

Find the **fair meeting point** between two US locations — not the geometric midpoint on a
map, but the place where **both people drive roughly the same amount of time**. A 0–20%
tolerance slider widens the answer into a *band* of acceptable towns, so you can rotate who
drives more from one meetup to the next ("you drive 6h / I drive 4h this time, swap next").

Enter two cities or ZIP codes → it routes through the real road network, finds the
equal-drive-time region, and shows the ranked towns inside it on a clean fullscreen map.

Everything runs **self-hosted** with no paid APIs and no API keys.

---

## Table of contents

- [The problem](#the-problem)
- [How it works (high level)](#how-it-works-high-level)
- [The algorithm in detail](#the-algorithm-in-detail)
- [Tech stack — what and why](#tech-stack--what-and-why)
- [Data sources](#data-sources)
- [The map](#the-map)
- [API reference](#api-reference)
- [Performance & complexity](#performance--complexity)
- [Efficiency notes (for a critical review)](#efficiency-notes-for-a-critical-review)
- [Requirements](#requirements)
- [Setup & run](#setup--run)
- [Configuration](#configuration)
- [Testing](#testing)
- [Project layout](#project-layout)
- [Limitations](#limitations)
- [License](#license)

---

## The problem

If two people want to meet halfway, the naïve answer is the geographic midpoint. But roads
aren't uniform — a straight-line midpoint can leave one person on a fast interstate and the
other on slow rural roads, so they arrive at very different times. "Fair" should mean **equal
driving time**, not equal distance.

Formally, given origins **A** and **B** and a candidate meeting point **P**:

- `t_A(P)` = driving time A→P
- `t_B(P)` = driving time B→P
- We want `t_A(P) ≈ t_B(P)` — i.e. the **share** `r(P) = t_A / (t_A + t_B)` close to `0.5`.

The **tolerance** `θ` (0–20%) accepts any point where `0.5 − θ ≤ r(P) ≤ 0.5 + θ`. At θ=20%
on a 10-hour trip, each person drives between 3h and 7h — that band is what lets you
alternate who drives more over repeated meetups.

---

## How it works (high level)

```
                         ┌─────────────────────────────────────────────┐
  Browser (MapLibre GL)  │  Node + Fastify API (thin orchestrator)      │
  ─ landing / loading /  │                                              │
    fullscreen map       │   /api/autocomplete ──► geo.db (SQLite)      │
        │                │        (ZIP + city typeahead)                │
        │  POST /solve   │                                              │
        └───────────────►│   /api/solve ──► Valhalla (Docker, C++)      │
                         │      1 route + isochrones + 1 matrix         │
                         │              └► geo.db (candidate towns)     │
                         └─────────────────────────────────────────────┘
                                          │
                       ┌──────────────────┴───────────────────┐
                       │ Valhalla routing engine (localhost)   │
                       │  tiles built from US OpenStreetMap    │
                       └───────────────────────────────────────┘
```

Two data assets, built once:

1. **`data/geo.db`** (~5 MB) — a SQLite file of US **ZIP codes + populated places** from
   [GeoNames](https://www.geonames.org/). Powers *both* the address autocomplete and the
   list of candidate meeting towns. Built by `scripts/build-geodata.mjs` in seconds.
2. **Valhalla tiles** (~30–45 GB) — the road-network graph, built by the Valhalla container
   from the US OpenStreetMap extract. This is the only heavy component.

The Node backend does **no heavy math** — it orchestrates HTTP calls to Valhalla and runs
lightweight geometry. All routing computation happens in Valhalla's C++ engine.

---

## The algorithm in detail

Implemented in [`server/routes/solve.mjs`](server/routes/solve.mjs). Input: `A {lat,lon}`,
`B {lat,lon}`, `threshold` (0–0.20, clamped).

### 1. Total drive time

One Valhalla `/route` call A→B returns the total fastest driving time **T** (seconds) and the
route geometry (an encoded polyline we decode to GeoJSON for the map).

### 2. Feasible band via isochrone intersection

An **isochrone** is the polygon you can reach within a given time from a point. We request
one isochrone from A and one from B, both at contour **(0.5 + θ)·T** minutes. Their **polygon
intersection** is the feasible band:

- A point inside A's isochrone is reachable from A in ≤ (0.5+θ)·T.
- A point inside B's isochrone is reachable from B in ≤ (0.5+θ)·T.
- Near the corridor `t_A + t_B ≈ T`, so being inside *both* forces each share into
  `[0.5−θ, 0.5+θ]`. That overlap polygon is exactly the "fair zone" — and it's what we draw
  on the map.

If the two isochrones don't overlap (can happen for awkward geographies), we **widen the
contour** along a ladder — `(0.5+θ), 0.6, 0.7, 0.85, 1.0` × T — until they do, and flag that
the band was widened. This guarantees an answer instead of failing.

### 3. Candidate towns

We take the bounding box of the feasible polygon, pull every GeoNames city inside that bbox
from `geo.db` (indexed on lat/lon), then keep only those **actually inside** the polygon
(point-in-polygon test). They're ordered by population and capped at `MAX_CANDIDATES` (300)
to bound the next step.

### 4. Real drive times + ranking

One Valhalla `/sources_to_targets` **matrix** call with sources `[A, B]` and targets = all
candidate towns returns `t_A` and `t_B` for every town in a single request. For each town:

```
total  = t_A + t_B
r      = t_A / total                       # A's share of the driving
inBand = (0.5 − θ) ≤ r ≤ (0.5 + θ)
score  = α·|r − 0.5|  +  β·(total / minTotal − 1)      # α=1.0, β=0.15
```

- `α·|r − 0.5|` rewards **balance** (closer to a 50/50 split).
- `β·(total/minTotal − 1)` gently penalizes towns that make *both* people drive more than
  necessary. `minTotal` is the smallest total among the kept towns.

Towns are filtered to the band, then sorted by `score` ascending. If nothing lands in the
band, we relax to all scored towns (sorted by balance) rather than return nothing. The
best-scoring town becomes the recommended midpoint.

> **Why this is accurate even though the isochrone polygon is approximate:** the polygon is
> only used to *narrow the search area*. The actual ranking uses **real measured** `t_A`/`t_B`
> from the matrix call, so the drive-time numbers shown to the user are exact, not estimated.

### 5. Response

Returns A, B, the recommended midpoint, the feasible polygon, the route geometry, and the
ranked town list (each with `t_A`, `t_B`, the % split, and whether it's in-band).

---

## Tech stack — what and why

Every dependency is the newest published version (project policy: `npm install <pkg>@latest`,
never pin old versions). The "alternatives" column is there so you can sanity-check the choices.

| Concern | Choice | Why | Alternatives considered |
|---|---|---|---|
| **Routing engine** | **Valhalla** (C++, Docker) | Only open engine with **native isochrones *and* matrix**; tile-based so low RAM (~4–8 GB for the US); builds the planet "on a laptop". | **OSRM** — fastest matrices but **no native isochrones** (would need custom code) and 150–250 GB RAM to preprocess the US. **OpenRouteService** — has both but Java/heap-heavy, higher RAM per profile. |
| **Geocoder data** | **GeoNames** (ZIP + cities) baked into SQLite | ~5 MB, covers every US ZIP + populated place with coordinates & population. Zero runtime service, tens of MB RAM. | **Photon** — real street addresses but Elasticsearch/Java, and no US-only prebuilt index exists (only the 56 GB planet). **Nominatim** — full addresses but a heavy Postgres import (100 GB+). |
| **HTTP server** | **Fastify** | High-throughput Node framework, schema-friendly, low overhead. | Express (slower, less structured). |
| **Geometry** | **@turf/turf** | Standard geospatial toolkit: polygon `intersect`, `booleanPointInPolygon`, `bbox`, `centroid`. | JSTS / custom (more code, more risk). |
| **Embedded DB** | **better-sqlite3** | Synchronous, extremely fast for read-heavy embedded use; no server. | node-sqlite3 (async, slower), Postgres (overkill for a 5 MB read-only file). |
| **Unzip** | **fflate** | Tiny pure-JS zip decoder to extract GeoNames archives at build time; no native deps. | adm-zip, system `unzip` (extra dep / non-portable). |
| **Map rendering** | **MapLibre GL** | Open-source vector maps (Mapbox GL fork), smooth pan/zoom, GeoJSON layers, **no token**. | Leaflet (raster, less fluid), Mapbox GL (requires a paid token). |
| **Basemap tiles** | **OpenFreeMap** | Keyless, no account, no rate-limit signup — fits the "no API" goal. | Mapbox/MapTiler (API key), self-hosted tiles (extra ~10–20 GB). |
| **Bundler / dev** | **Vite** | Fast dev server + optimized production build; proxies `/api` in dev. | Webpack (slower), plain esbuild (less batteries). |
| **Tests** | **Vitest** | Vite-native, fast; runs the whole API against a mocked Valhalla + fixture DB with no data needed. | Jest (slower ESM story). |

Languages: **ES modules (`.mjs`), Node 20.19+**. One language across the stack (JS) — the
backend is deliberately thin because the expensive work lives in Valhalla's C++.

---

## Data sources

| Data | Source | Size | Refresh |
|---|---|---|---|
| Road network | OpenStreetMap US extract via [Geofabrik](https://download.geofabrik.de/north-america/us.html) | ~11 GB download → ~30–45 GB Valhalla tiles | Re-run `docker compose up` (Valhalla rebuilds if the pbf changes) |
| ZIP codes | GeoNames `US.zip` (postal) | ~0.6 MB → ~41,000 ZIPs | `npm run build:geo` |
| Cities / towns | GeoNames `cities500.zip` (pop ≥ 500) | ~13 MB → ~22,000 US places | `npm run build:geo` |
| Basemap | OpenFreeMap "positron" vector style | streamed (not stored) | n/a |

`geo.db` ends up ~5 MB and holds both a `cities` table (name, state, lat/lon, population) and
a `zips` table (zip, place, state, lat/lon).

---

## The map

- **Renderer:** MapLibre GL JS, drawing vector tiles from **OpenFreeMap** (the keyless
  "positron" light style).
- **What's drawn per result:**
  - the **feasible band** as a translucent filled polygon (the "fair zone"),
  - the **route** A→B as a line (decoded from Valhalla's polyline),
  - **A** and **B** pins (left/right),
  - **candidate town** dots, with the recommended midpoint highlighted,
  - a results panel listing towns with each side's drive time and the % split, plus a bar
    visualizing the balance.
- The UI is a 3-stage flow — **landing** (two autocompletes + tolerance slider) → **loading**
  (cycling status lines) → **fullscreen map** — with opacity transitions between them.

---

## API reference

All endpoints are served by the Node app (dev: API on `:3100`; Docker: `:8080`).

### `GET /api/autocomplete?q=<query>`
Typeahead over the local GeoNames DB. Numeric queries match ZIP codes; text queries match
city names (ranked by population).

```json
{ "results": [ { "label": "Chicago, IL", "lat": 41.85, "lon": -87.65, "type": "city" } ] }
```

### `POST /api/solve`
```json
{ "a": {"lat":41.88,"lon":-87.63}, "b": {"lat":39.29,"lon":-76.61}, "threshold": 0.1 }
```
Returns `a`, `b`, `totalTime`, `route` (GeoJSON LineString), `feasible` (GeoJSON polygon),
`midpoint`, and `candidates[]` (each with `timeA`, `timeB`, `shareA/shareB`, `ratio`,
`inBand`). Errors: `400` bad coords, `503` `geo.db` not built, `422` no overlapping region.

### `GET /api/health`
```json
{ "geo": true, "valhalla": true }
```

---

## Performance & complexity

**Per `/api/solve` request:**

| Work | Count | Where | Cost |
|---|---|---|---|
| Route A→B | 1 | Valhalla (C++) | cheap |
| Isochrones | 2 (typical); up to 10 if the band must widen | Valhalla | **the expensive part** — grows with contour size / trip length |
| Matrix `[A,B] → N towns` | 1 (one-to-many) | Valhalla | cheap (N ≤ 300) |
| Polygon intersection | 1 | Node (@turf) | small–moderate |
| Point-in-polygon | ≤ a few thousand, capped at 300 kept | Node | small (bbox-prefiltered in SQL) |

So a normal search is **~4 Valhalla HTTP calls** plus a little geometry in Node. Latency is
dominated by the isochrone computation, which scales with how far apart A and B are (bigger
`T` → larger reachable polygons). Cross-country pairs are the slowest; regional pairs are
near-instant. The matrix call is inexpensive because Valhalla computes one-to-many in a single
request.

**Memory:** the Node process is small; `geo.db` is opened read-only and memory-maps ~5 MB.
Valhalla serving the US needs ~2–4 GB. Building US tiles is the one heavy job (~4–8 GB RAM,
~30–45 GB disk, a few hours on a modest box — one-time).

---

## Efficiency notes (for a critical review)

Honest trade-offs, in case you want a senior dev to poke at them:

1. **Isochrone size on long trips.** At `(0.5+θ)·T`, isochrones for a 10-hour trip cover huge
   areas and are the main latency cost. An alternative is to compute a rough midpoint first
   and only isochrone a local neighborhood — faster, but more code and a bit less exact. The
   current approach favors correctness/simplicity.
2. **The widening ladder recomputes isochrones from scratch** on each rung (2 extra calls per
   rung). It rarely triggers, but a smarter version could grow a single contour set.
3. **Candidate cap = 300** is a heuristic balancing ranking quality vs. matrix size. Valhalla
   could handle more targets; 300 keeps latency predictable. Tunable via `MAX_CANDIDATES`.
4. **Point-in-polygon runs in JS per city.** Fine here thanks to the SQL bbox prefilter and
   the 300 cap; if the places DB grew 100×, an R-tree/spatial index would be worth it.
5. **No result caching.** Identical searches recompute. An LRU (or Redis) keyed on
   `(A, B, θ)` would make repeats instant — a clear win if traffic is bursty.
6. **Basemap tiles come from OpenFreeMap** — the one piece not self-hosted. It's keyless and
   fine for personal use; for full isolation you'd self-host vector tiles (+~10–20 GB).
7. **Single-profile routing** (`costing: 'auto'`). Adding walking/transit/truck would mean
   more Valhalla profiles (more build time/disk), not a code change here.
8. **Geocoding is place-level (ZIP + city), not house-number.** Deliberate: it's what this
   tool needs and keeps the geocoder at 5 MB instead of a multi-GB address database.

None of these are bugs — they're the knobs a reviewer would look at. The core design
principle (push all heavy compute into Valhalla, keep Node as a thin orchestrator, keep
geocoding as a tiny static file) is what keeps the whole thing runnable on ~8 GB RAM.

---

## Requirements

- Docker + docker compose
- ~50 GB free disk (Valhalla US tiles; `geo.db` is ~5 MB), ~8 GB RAM
- Node 20.19+ (only for local dev; the Docker path needs no host Node)

## Setup & run

### Docker (recommended for a server) — one command

Brings up the web app **and** Valhalla together; `geo.db` is baked into the app image.

```bash
git clone https://github.com/cardosocardoso/mapa-meio.git
cd mapa-meio
docker compose up -d --build      # app on http://<host>:8080
docker compose logs -f valhalla   # first run downloads the US map + builds tiles (a while)
```

Valhalla is ready when `curl -s localhost:8002/status` returns 200. Health check:

```bash
curl -s localhost:8080/api/health   # {"geo":true,"valhalla":true} = ready
```

### Local dev (Node)

```bash
npm install
./scripts/setup-data.sh    # builds geo.db (seconds) + starts Valhalla tile build
npm run dev                # UI http://localhost:5173 (API on :3100, proxied)
```

## Configuration

Environment variables (see [`server/config.mjs`](server/config.mjs)):

| Var | Default | Meaning |
|-----|---------|---------|
| `PORT` | `3000` (dev uses `3100`, Docker maps `8080`) | API port |
| `HOST` | `0.0.0.0` | Bind address |
| `VALHALLA_URL` | `http://localhost:8002` | Routing engine URL |
| `GEO_DB` | `data/geo.db` | Geocoder database path |
| `MAX_CANDIDATES` | `300` | Max towns scored per search |

## Testing

```bash
npm test        # 37 Vitest tests
```

Tests run the **entire API** against a **mocked Valhalla** (a fake `fetch` that emulates
`/route`, `/isochrone`, `/sources_to_targets`) and a **fixture `geo.db`** built in-memory — so
they need no OSM data, no Docker, and no network. Coverage: the geometry helpers, the Valhalla
client (including polyline decode), the geocoder queries, the full solve pipeline (ranking,
band filtering, decoy exclusion, threshold clamping, fallbacks), and the autocomplete route.

## Project layout

```
docker-compose.yml      app + valhalla services
Dockerfile              multi-stage build for the Node app (frontend + geo.db baked in)
scripts/
  setup-data.sh         build geo.db + start Valhalla tile build
  build-geodata.mjs     download GeoNames → data/geo.db
server/
  index.mjs             entrypoint (listens)
  app.mjs               Fastify app builder (testable via inject)
  config.mjs            all config + env overrides
  routes/solve.mjs      the meeting-point algorithm
  routes/autocomplete.mjs  ZIP + city typeahead
  lib/valhalla.mjs      route / isochrone / matrix client + polyline decode
  lib/geo.mjs           turf helpers (intersect, bbox, point-in-poly, centroid)
  lib/geodata.mjs       geo.db queries (candidates + autocomplete)
web/
  index.html
  src/                  main.js, autocomplete.js, map.js, format.js, style.css  (Vite)
data/                   valhalla/ (tiles), geo.db   (gitignored)
test/                   vitest suite (mocked Valhalla + fixture geo.db)
```

## Limitations

- **US only** (the built tiles + GeoNames data are US). Other regions = a different extract
  and a bigger build.
- **Driving only** (`costing: 'auto'`); no walking/transit/truck profiles.
- **Place-level geocoding** (ZIP + city), not individual street addresses.
- **Traffic-free** average-speed routing; no time-of-day congestion modeling.

## License

MIT
