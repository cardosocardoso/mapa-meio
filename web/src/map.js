// MapLibre rendering of a solve result: A/B/midpoint markers, route line,
// feasible band polygon, and candidate town markers.
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { formatDuration } from './format.js';

// Keyless basemap (OpenFreeMap — no account/token needed).
const STYLE = 'https://tiles.openfreemap.org/styles/positron';

let map = null;

export function createMap(container) {
  map = new maplibregl.Map({
    container,
    style: STYLE,
    center: [-90, 40],
    zoom: 3.5,
    attributionControl: { compact: true },
  });
  map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-left');
  return map;
}

function markerEl(kind, text) {
  const el = document.createElement('div');
  el.className = `marker marker--${kind}`;
  el.innerHTML = `<span class="marker-dot"></span><span class="marker-label">${text}</span>`;
  return el;
}

function clearLayer(id) {
  if (map.getLayer(id)) map.removeLayer(id);
  if (map.getSource(id)) map.removeSource(id);
}

let markers = [];

export function renderResult(result, { onPick } = {}) {
  // Reset previous render.
  markers.forEach((m) => m.remove());
  markers = [];
  ['route', 'feasible', 'feasible-outline', 'candidates'].forEach(clearLayer);

  const { a, b, midpoint, route, feasible, candidates } = result;

  // Feasible band polygon.
  map.addSource('feasible', { type: 'geojson', data: feasible });
  map.addLayer({
    id: 'feasible',
    type: 'fill',
    source: 'feasible',
    paint: { 'fill-color': '#ff6a3d', 'fill-opacity': 0.12 },
  });
  map.addLayer({
    id: 'feasible-outline',
    type: 'line',
    source: 'feasible',
    paint: { 'line-color': '#ff6a3d', 'line-width': 1.5, 'line-opacity': 0.5 },
  });

  // Route line.
  map.addSource('route', { type: 'geojson', data: { type: 'Feature', geometry: route } });
  map.addLayer({
    id: 'route',
    type: 'line',
    source: 'route',
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': '#5b6dfa', 'line-width': 4, 'line-opacity': 0.85 },
  });

  // Candidate town markers (excluding the best, which gets the midpoint marker).
  candidates.slice(1).forEach((c) => {
    const el = markerEl('town', '');
    el.title = `${c.name} · A ${formatDuration(c.timeA)} / B ${formatDuration(c.timeB)}`;
    el.addEventListener('click', () => onPick?.(c));
    markers.push(new maplibregl.Marker({ element: el }).setLngLat([c.lon, c.lat]).addTo(map));
  });

  // A, B, midpoint.
  markers.push(
    new maplibregl.Marker({ element: markerEl('a', 'A') }).setLngLat([a.lon, a.lat]).addTo(map)
  );
  markers.push(
    new maplibregl.Marker({ element: markerEl('b', 'B') }).setLngLat([b.lon, b.lat]).addTo(map)
  );
  markers.push(
    new maplibregl.Marker({ element: markerEl('mid', midpoint.name) })
      .setLngLat([midpoint.lon, midpoint.lat])
      .addTo(map)
  );

  // Fit everything in view.
  const bounds = new maplibregl.LngLatBounds();
  bounds.extend([a.lon, a.lat]);
  bounds.extend([b.lon, b.lat]);
  route.coordinates.forEach((c) => bounds.extend(c));
  map.fitBounds(bounds, { padding: { top: 80, bottom: 80, left: 380, right: 80 }, duration: 900 });
}

export function flyToTown(c) {
  map?.flyTo({ center: [c.lon, c.lat], zoom: 9, duration: 800 });
}
