import { routeDistanceMeters } from "../geo";
import type { TravelEstimate, TravelMode } from "../types";
import type { EstimateRequest, TrafficProvider } from "./provider";

/** Free-flow travel speeds in meters/second by mode. */
const BASE_SPEED_MPS: Record<TravelMode, number> = {
  drive: 13.9, // ~50 km/h effective urban driving
  transit: 7.5, // ~27 km/h door-to-door incl. stops/wait
  cycle: 4.5, // ~16 km/h
  walk: 1.35, // ~4.9 km/h
};

/** Fixed per-trip overhead in seconds (parking, walking to a stop, etc.). */
const FIXED_OVERHEAD_SECONDS: Record<TravelMode, number> = {
  drive: 180,
  transit: 420,
  cycle: 90,
  walk: 0,
};

/**
 * A smooth "rush hour" congestion multiplier for a given local time.
 *
 * Two Gaussian bumps — a morning peak around 08:15 and an evening peak around
 * 17:30 — sit on top of a 1.0 free-flow baseline. Weekends are damped. The
 * result is a realistic, continuous curve (no cliff edges) so that departing a
 * few minutes earlier meaningfully reduces the estimate, which is exactly the
 * behaviour the alarm exploits.
 *
 * Exported for testing and for the UI's traffic sparkline.
 */
export function congestionMultiplier(departAt: Date): number {
  const minutes = departAt.getHours() * 60 + departAt.getMinutes();
  const day = departAt.getDay();
  const isWeekend = day === 0 || day === 6;

  const bump = (peakMinutes: number, height: number, widthMinutes: number) => {
    const z = (minutes - peakMinutes) / widthMinutes;
    return height * Math.exp(-0.5 * z * z);
  };

  const weekdayHeight = isWeekend ? 0.25 : 1.0;
  const morning = bump(495, 0.85 * weekdayHeight, 65); // 08:15
  const evening = bump(1050, 0.9 * weekdayHeight, 80); // 17:30
  const midday = bump(750, 0.18, 120); // gentle lunch swell

  return 1 + morning + evening + midday;
}

export function travelModeCongestionMultiplier(
  mode: TravelMode,
  departAt: Date,
): number {
  const rawCongestion = congestionMultiplier(departAt);
  return 1 + (rawCongestion - 1) * trafficSensitivity(mode);
}

function trafficSensitivity(mode: TravelMode): number {
  if (mode === "walk") return 0;
  if (mode === "cycle") return 0.15;
  if (mode === "transit") return 0.5;
  return 1;
}

/**
 * Deterministic pseudo-random jitter in [-amp, amp] derived from the trip's
 * coordinates and departure minute. Deterministic so estimates are stable
 * across re-renders (no flicker) while still varying trip-to-trip.
 */
function stableJitter(seed: number, amp: number): number {
  const x = Math.sin(seed) * 10_000;
  const frac = x - Math.floor(x); // [0,1)
  return (frac * 2 - 1) * amp;
}

/**
 * The default, offline, zero-config traffic provider. Models congestion as a
 * function of distance, travel mode and time-of-day. Good enough to make the
 * alarm behave believably, and a drop-in stand-in when no API key is set.
 */
export const simulatedProvider: TrafficProvider = {
  id: "simulated",
  label: "Simulated traffic (offline)",
  isReady: () => true,
  async estimate(request: EstimateRequest): Promise<TravelEstimate> {
    const { origin, destination, mode, departAt } = request;
    const distanceMeters = routeDistanceMeters(origin, destination);
    const overhead = FIXED_OVERHEAD_SECONDS[mode];
    const freeFlowSeconds = overhead + distanceMeters / BASE_SPEED_MPS[mode];

    const congestion = travelModeCongestionMultiplier(mode, departAt);

    const seed =
      origin.lat * 100 + origin.lng * 10 + destination.lat + departAt.getMinutes();
    const jitter = 1 + stableJitter(seed, 0.06); // ±6%

    const durationSeconds = Math.max(
      30,
      Math.round(freeFlowSeconds * congestion * jitter),
    );

    return {
      durationSeconds,
      freeFlowSeconds: Math.round(freeFlowSeconds),
      distanceMeters: Math.round(distanceMeters),
      congestion: durationSeconds / Math.max(1, freeFlowSeconds),
      source: simulatedProvider.label,
    };
  },
};
