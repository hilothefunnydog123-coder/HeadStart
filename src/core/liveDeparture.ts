import { haversineMeters } from "./geo";
import type { DeparturePlan, Place, TravelEstimate } from "./types";

export const STILL_HOME_RADIUS_M = 180;
const MS_PER_MIN = 60_000;

export function isStillAtDeparture(
  home: Place,
  current: Place,
  accuracyMeters = 0,
): boolean {
  const radius = Math.max(STILL_HOME_RADIUS_M, accuracyMeters + 50);
  return haversineMeters(home, current) <= radius;
}

export function updatedArrival(now: Date, estimate: TravelEstimate): Date {
  return new Date(now.getTime() + estimate.durationSeconds * 1000);
}

export function delayMinutes(plan: DeparturePlan, arrival: Date): number {
  return Math.max(
    0,
    Math.ceil((arrival.getTime() - plan.arriveBy.getTime()) / MS_PER_MIN),
  );
}

export function shouldCheckLateDeparture(plan: DeparturePlan, now: Date): boolean {
  const t = now.getTime();
  return t >= plan.leaveBy.getTime() && t < plan.arriveBy.getTime();
}
