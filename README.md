# Meet in the Middle

Find the **fair meeting point** between two US locations — not the geometric midpoint, but
the place where **both people drive roughly the same amount of time**. A 0–20% tolerance
slider widens the result into a *band* of acceptable towns, so you can rotate who drives
more from one meetup to the next ("you drive 6h / I drive 4h this time, swap next time").

Enter two cities or ZIP codes → it routes through the real road network, finds the
equal-drive-time region, and shows you the ranked towns inside it on a clean fullscreen map.

Everything runs **self-hosted** with no paid APIs.

![flow: landing → loading → map]

## How it works

1. **Route** A→B with [Valhalla](https://valhalla.github.io/valhalla/) to get the total drive time `T`.
2. **Isochrones** from both ends at `(0.5 + tolerance)·T`; their overlap is the feasible band.
3. **Candidate towns** inside that band come from a local [GeoNames](https://www.geonames.org/) database.
4. **Distance matrix** from both origins ranks each town by how balanced the drive is.

| Piece | What | Footprint |
|------|------|-----------|
| Routing | Valhalla (Docker) | ~30–50 GB disk, ~4–8 GB RAM for the US |
| Geocoder + towns | GeoNames → `data/geo.db` | ~5 MB, negligible RAM |
| Backend | Node + Fastify | tiny |
| Frontend | MapLibre GL + Vite | keyless OpenFreeMap basemap |

Geocoding is **city + ZIP code** level (no street house-numbers) — which is exactly the
granularity this tool needs, and keeps it featherweight.

## Requirements

- Docker + docker compose
- Node 20.19+
- ~50 GB free disk, ~8 GB RAM (a small Linux VM / Proxmox container is ideal)

## Quick start — Docker (recommended for a server)

Brings up the web app **and** Valhalla together. The geocoder is baked into the app image,
so no Node install is needed on the host.

```bash
git clone https://github.com/cardosocardoso/mapa-meio.git
cd mapa-meio
docker compose up -d --build      # app on http://<host>:8080
docker compose logs -f valhalla   # first run downloads the US map + builds tiles (a while)
```

Valhalla is ready when `curl -s localhost:8002/status` returns 200. Until then the app
loads but search will say routing is unavailable. Check the wiring:

```bash
curl -s localhost:8080/api/health   # {"geo":true,"valhalla":true} = ready
```

## Quick start — local dev (Node)

```bash
npm install
./scripts/setup-data.sh    # builds geo.db (seconds) + starts Valhalla (downloads/builds tiles)
npm run dev                # UI http://localhost:5173 (API on :3100)
curl -s localhost:3100/api/health
```

## Development

```bash
npm test            # full suite (mocks Valhalla, uses a fixture geo.db — no data needed)
npm run build:geo   # rebuild geo.db from GeoNames
npm run build && npm start   # production build + serve
```

Ports: UI on **5173**, API on **3100** in dev (configurable via `PORT` / `vite.config.js`).

## Configuration

Environment variables (see `server/config.mjs`):

| Var | Default | Meaning |
|-----|---------|---------|
| `PORT` | `3000` (dev uses `3100`) | API port |
| `VALHALLA_URL` | `http://localhost:8002` | Routing engine |
| `GEO_DB` | `data/geo.db` | Geocoder database path |
| `MAX_CANDIDATES` | `300` | Max towns scored per search |

## License

MIT
