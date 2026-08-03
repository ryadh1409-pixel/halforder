/**
 * Shared helpers for Uber-style live driver vehicle markers.
 * Canonical position source remains `orders.driverLocation` / live GPS session —
 * this module is display-only (animation + heading).
 */

export type MapLatLng = { latitude: number; longitude: number };

export type LiveDriverLocationInput = {
  latitude: number;
  longitude: number;
  heading?: number | null;
} | null;

/** Reject null-island and non-finite coords. */
export function validMapCoord(c: MapLatLng | null | undefined): MapLatLng | null {
  if (!c) return null;
  if (!Number.isFinite(c.latitude) || !Number.isFinite(c.longitude)) return null;
  if (Math.abs(c.latitude) < 0.001 && Math.abs(c.longitude) < 0.001) return null;
  return c;
}

/** Compass bearing from A → B in degrees [0, 360). */
export function bearingDegrees(from: MapLatLng, to: MapLatLng): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const φ1 = toRad(from.latitude);
  const φ2 = toRad(to.latitude);
  const Δλ = toRad(to.longitude - from.longitude);
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x =
    Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

export function normalizeHeadingDegrees(heading: unknown): number | null {
  if (typeof heading !== 'number' || !Number.isFinite(heading)) return null;
  if (heading < 0) return null;
  return ((heading % 360) + 360) % 360;
}

/** Animation duration from distance moved (smooth, no jump). */
export function driverMarkerAnimationDurationMs(
  prev: MapLatLng | null,
  next: MapLatLng,
  distanceKm: number,
): number {
  if (!prev) return 0;
  if (distanceKm < 0.0005) return 400;
  return Math.min(2200, Math.max(700, Math.round(distanceKm * 12000)));
}

/**
 * Prefer GPS heading; else derive from movement between updates.
 */
export function resolveDriverMarkerHeading(args: {
  reportedHeading?: number | null;
  previous?: MapLatLng | null;
  next: MapLatLng;
  previousHeading?: number | null;
}): number {
  const reported = normalizeHeadingDegrees(args.reportedHeading);
  if (reported != null) return reported;
  if (args.previous) {
    const moved =
      Math.abs(args.next.latitude - args.previous.latitude) > 1e-6 ||
      Math.abs(args.next.longitude - args.previous.longitude) > 1e-6;
    if (moved) return bearingDegrees(args.previous, args.next);
  }
  return normalizeHeadingDegrees(args.previousHeading) ?? 0;
}
