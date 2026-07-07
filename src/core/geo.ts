import type { Place } from "./types";

const EARTH_RADIUS_M = 6_371_000;

const toRad = (deg: number): number => (deg * Math.PI) / 180;

/**
 * Great-circle distance between two points in meters (Haversine formula).
 * Accurate enough for travel-time estimation at city scale.
 */
export function haversineMeters(a: Place, b: Place): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);

  const sinLat = Math.sin(dLat / 2);
  const sinLng = Math.sin(dLng / 2);
  const h =
    sinLat * sinLat + Math.cos(lat1) * Math.cos(lat2) * sinLng * sinLng;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Road/route distance is always longer than a straight line. This detour
 * factor turns crow-flies distance into a realistic on-the-ground distance.
 * ~1.4 is a well-established average for urban street networks.
 */
export const ROAD_DETOUR_FACTOR = 1.4;

export function routeDistanceMeters(a: Place, b: Place): number {
  return haversineMeters(a, b) * ROAD_DETOUR_FACTOR;
}
