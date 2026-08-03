/**
 * Canonical map layering for live delivery maps.
 * One z-order + overlap nudge shared by Driver / Customer / Admin / Restaurant.
 */

import { haversineDistanceKm } from '@/lib/haversine';
import type { MapLatLng } from '@/lib/maps/liveDriverMarker';

/** Vehicle always above stops and route. */
export const MAP_Z_DRIVER = 100;
export const MAP_Z_CUSTOMER_ACTIVE = 50;
export const MAP_Z_CUSTOMER = 48;
export const MAP_Z_RESTAURANT = 40;
export const MAP_Z_POLYLINE = 1;

/** ~18–25 m — pins closer than this get a display nudge so both stay visible. */
export const MAP_OVERLAP_THRESHOLD_KM = 0.022;

/** ~12 m northeast display offset (does not change Firestore GPS). */
const OVERLAP_NUDGE_DEG = 0.00012;

/**
 * If `point` is nearly on top of `anchor`, nudge it northeast for display only.
 */
export function offsetIfOverlapping(
  point: MapLatLng | null | undefined,
  anchor: MapLatLng | null | undefined,
): MapLatLng | null {
  if (!point) return null;
  if (!anchor) return point;
  const km = haversineDistanceKm(
    point.latitude,
    point.longitude,
    anchor.latitude,
    anchor.longitude,
  );
  if (!Number.isFinite(km) || km >= MAP_OVERLAP_THRESHOLD_KM) return point;
  return {
    latitude: point.latitude + OVERLAP_NUDGE_DEG,
    longitude: point.longitude + OVERLAP_NUDGE_DEG,
  };
}

/**
 * Nudge driver away from the nearest of restaurant / customers when stacked.
 */
export function offsetDriverFromStops(
  driver: MapLatLng | null | undefined,
  stops: Array<MapLatLng | null | undefined>,
): MapLatLng | null {
  if (!driver) return null;
  let best: MapLatLng | null = null;
  let bestKm = Number.POSITIVE_INFINITY;
  for (const stop of stops) {
    if (!stop) continue;
    const km = haversineDistanceKm(
      driver.latitude,
      driver.longitude,
      stop.latitude,
      stop.longitude,
    );
    if (Number.isFinite(km) && km < bestKm) {
      bestKm = km;
      best = stop;
    }
  }
  if (!best || bestKm >= MAP_OVERLAP_THRESHOLD_KM) return driver;
  return offsetIfOverlapping(driver, best);
}
