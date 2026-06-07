#!/usr/bin/env bash
#
# One-time data build for the meeting-point finder.
#
#   ./scripts/setup-data.sh
#
# Two pieces:
#   1. Geocoder + candidate towns -> data/geo.db   (GeoNames, ~13 MB, seconds)
#   2. Routing tiles               -> Valhalla      (US extract, tens of GB, a while)
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

echo "==> [1/2] Building local geocoder (GeoNames: ZIP codes + cities)"
node "$ROOT/scripts/build-geodata.mjs"

echo "==> [2/2] Starting Valhalla (downloads the US extract + builds tiles on first run)"
docker compose up -d valhalla
cat <<'EOF'

    Valhalla is building tiles in the background. Watch progress with:
      docker compose logs -f valhalla
    It's ready when this returns 200:
      curl -s -o /dev/null -w '%{http_code}\n' http://localhost:8002/status

==> Once Valhalla is ready, run the app:
      npm run dev        # UI on http://localhost:5173 (API on :3100)
EOF
