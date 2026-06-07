# CLAUDE.md — Equal-Drive-Time Meeting Point Finder

A self-hosted web app: enter two US locations (city or ZIP), get the **fair meeting
point** where both people drive roughly equal time, with a 0–20% tolerance band of
acceptable towns.

## Dependency policy (IMPORTANT)

- **Always install the newest version published on npm.** Use `npm install <pkg>@latest`.
  Never pin to or reintroduce older versions.
- Before adding a dependency, check its latest version: `npm view <pkg> version`.
- Prefer the highest-performing, actively-maintained current library for the job.

## Architecture

- **Valhalla** (Docker, C++): the only heavy component. Routing engine serving `/route`,
  `/isochrone`, `/sources_to_targets` (matrix) on `localhost:8002`. Auto-downloads the US
  extract and builds tiles on first `docker compose up`.
- **Local geocoder** (no service): ZIP codes + cities come from **GeoNames** data baked
  into `data/geo.db` (~5 MB) by `scripts/build-geodata.mjs`. Powers autocomplete *and* the
  candidate-town list for the midpoint search. No Photon/Nominatim/Elasticsearch.
- **Node + Fastify** (`server/`): serves the frontend + a thin API. No heavy math in Node.
- **MapLibre GL** frontend (`web/`, Vite). Basemap from OpenFreeMap (keyless).

## Layout

```
docker-compose.yml      valhalla only
scripts/                setup-data.sh, build-geodata.mjs
server/                 index.mjs, app.mjs, routes/, lib/ (valhalla, geo, geodata)
web/                    index.html, src/  (Vite)
data/                   valhalla/ (tiles), geo.db   (gitignored)
test/                   vitest suite (mocked Valhalla + fixture geo.db)
```

## Requirements (target: a Linux box / Proxmox)

- Docker + docker compose
- ~30–50 GB disk for Valhalla US tiles (geo.db is ~5 MB)
- ~4–8 GB RAM for Valhalla to build/serve
- Node 20.19+

## Setup & run

Two ways:

**Docker (recommended for servers)** — app + Valhalla together; geo.db baked into the image:
```bash
docker compose up -d --build      # app on http://<host>:8080
docker compose logs -f valhalla   # first run downloads US map + builds tiles (a while)
# ready when: curl -s -o /dev/null -w '%{http_code}' http://localhost:8002/status -> 200
```

**Local dev (Node):**
```bash
npm install
./scripts/setup-data.sh    # builds geo.db (seconds) + starts Valhalla tile build (a while)
npm run dev                # UI -> http://localhost:5173 (API on :3100, proxied)
```

Dev ports: Vite UI **5173**, API **3100** (the API default is 3000; dev uses 3100 and
the Vite proxy points there — see vite.config.js / package.json `dev:api`).

## Commands

```bash
npm test                 # 37 tests, no data/engines needed (mocks Valhalla, fixture geo.db)
npm run build:geo        # rebuild geo.db from GeoNames
docker compose up -d     # start Valhalla   /   docker compose logs -f valhalla
docker compose down      # stop
curl -s localhost:3100/api/health   # {"geo":true,"valhalla":true} = ready
```

## The algorithm (server/routes/solve.mjs)

1. Valhalla `/route` A→B → total time `T` + geometry.
2. Two isochrones at contour `(0.5 + threshold)·T`, one per origin → polygon intersection
   = feasible band (widen the contour if they don't overlap).
3. Candidate towns = `geo.db` cities inside that polygon (bbox prefilter + point-in-poly).
4. One Valhalla matrix call `[A,B] → candidates` → `t_A`, `t_B` per town.
5. Filter to ratio band `[0.5−thr, 0.5+thr]`, rank by `α·|r−0.5| + β·normalizedTotal`.
6. Return A, B, best midpoint, feasible polygon, route geometry, ranked towns.

## Conventions

- ES modules (`.mjs`), Node 20+. Geometry via `@turf/turf`, SQLite via `better-sqlite3`.
- Config (engine URL, db path, ports) in `server/config.mjs`, overridable by env vars.
