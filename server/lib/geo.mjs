// Geometry helpers built on @turf/turf (v7 API).
import {
  intersect,
  featureCollection,
  bbox as turfBbox,
  booleanPointInPolygon,
  centroid as turfCentroid,
} from '@turf/turf';

/** Intersection of two polygon features. Returns a Feature<Polygon|MultiPolygon> or null. */
export function intersectPolys(a, b) {
  if (!a || !b) return null;
  try {
    return intersect(featureCollection([a, b]));
  } catch {
    return null;
  }
}

/** Bounding box of a geometry/feature as { west, south, east, north }. */
export function bounds(geojson) {
  const [west, south, east, north] = turfBbox(geojson);
  return { west, south, east, north };
}

/** True if [lon,lat] falls inside the polygon/multipolygon feature. */
export function contains(feature, lon, lat) {
  try {
    return booleanPointInPolygon([lon, lat], feature);
  } catch {
    return false;
  }
}

/** Centroid of a feature as { lat, lon }. */
export function centroid(feature) {
  const [lon, lat] = turfCentroid(feature).geometry.coordinates;
  return { lat, lon };
}
