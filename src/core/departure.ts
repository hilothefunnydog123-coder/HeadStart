import { selectNextCommitment } from "./time";
import { getProvider } from "./traffic/provider";
import type {
  Commitment,
  DeparturePlan,
  PlanPhase,
  Settings,
  TravelEstimate,
} from "./types";

/** How long the alarm is considered to be "actively ringing" after wake time. */
export const ALARM_RING_WINDOW_MIN = 15;

const SEC_PER_MIN = 60;
const MS_PER_MIN = 60_000;

interface BuildPlanInput {
  commitment: Commitment;
  arriveBy: Date;
  estimate: TravelEstimate;
  settings: Settings;
  now: Date;
}

/**
 * Pure timeline math: given a commitment, its arrival instant, a travel-time
 * estimate and the user's prep preferences, work backwards to a leave time and
 * a wake time, then locate `now` on that timeline.
 *
 * leaveBy = arriveBy − arrivalBuffer − travelTime
 * wakeBy  = leaveBy  − prepTime − wakeAhead(comfort margin)
 *
 * This is deliberately a pure function so it's trivial to unit-test and reason
 * about; all the I/O (fetching an estimate) lives in `planNextDeparture`.
 */
export function buildPlan(input: BuildPlanInput): DeparturePlan {
  const { commitment, arriveBy, estimate, settings, now } = input;

  const prepMinutes =
    commitment.prepMinutesOverride ?? settings.prepMinutes;

  const leaveBy = new Date(
    arriveBy.getTime() -
      settings.arrivalBufferMinutes * MS_PER_MIN -
      (estimate.durationSeconds / SEC_PER_MIN) * MS_PER_MIN,
  );

  const wakeBy = new Date(
    leaveBy.getTime() -
      prepMinutes * MS_PER_MIN -
      settings.wakeAheadMinutes * MS_PER_MIN,
  );

  const phase = resolvePhase(now, wakeBy, leaveBy, arriveBy);

  const minutesUntilLeave = Math.round(
    (leaveBy.getTime() - now.getTime()) / MS_PER_MIN,
  );
  const minutesUntilWake = Math.round(
    (wakeBy.getTime() - now.getTime()) / MS_PER_MIN,
  );

  return {
    commitment,
    estimate,
    arriveBy,
    leaveBy,
    wakeBy,
    phase,
    minutesUntilLeave,
    minutesUntilWake,
  };
}

/**
 * Recompute only the time-dependent fields (phase + countdowns) of an existing
 * plan against a fresh `now`. Lets the UI tick every second without re-running
 * the traffic estimate.
 */
export function refreshPlanTiming(plan: DeparturePlan, now: Date): DeparturePlan {
  return {
    ...plan,
    phase: resolvePhase(now, plan.wakeBy, plan.leaveBy, plan.arriveBy),
    minutesUntilLeave: Math.round(
      (plan.leaveBy.getTime() - now.getTime()) / MS_PER_MIN,
    ),
    minutesUntilWake: Math.round(
      (plan.wakeBy.getTime() - now.getTime()) / MS_PER_MIN,
    ),
  };
}

function resolvePhase(
  now: Date,
  wakeBy: Date,
  leaveBy: Date,
  arriveBy: Date,
): PlanPhase {
  const t = now.getTime();
  if (t < wakeBy.getTime()) return "sleep";
  const ringEnd = Math.min(
    wakeBy.getTime() + ALARM_RING_WINDOW_MIN * MS_PER_MIN,
    leaveBy.getTime(),
  );
  if (t < ringEnd) return "wake";
  if (t < leaveBy.getTime()) return "prep";
  if (t < arriveBy.getTime()) return "leave";
  return "enroute";
}

/**
 * End-to-end: pick the soonest enabled commitment, fetch a traffic-aware
 * estimate for departing "around now / the leave window", and build the plan.
 *
 * Returns a phase-only stub plan when there's no home or no commitment so the
 * UI can prompt the user to finish setup.
 */
export async function planNextDeparture(
  commitments: Commitment[],
  settings: Settings,
  now: Date,
): Promise<DeparturePlan | { phase: "no-home" | "no-commitment" }> {
  if (!settings.home) return { phase: "no-home" };

  const next = selectNextCommitment(commitments, now);
  if (!next) return { phase: "no-commitment" };

  const provider =
    (getProvider(settings.trafficProvider)?.isReady(settings.apiKey)
      ? getProvider(settings.trafficProvider)
      : undefined) ?? getProvider("simulated")!;

  // Estimate for a departure near the actual leave window rather than "now",
  // so overnight planning still reflects morning rush hour. We approximate by
  // first estimating at arrival time, then refining once around the leave time.
  let estimate = await provider.estimate({
    origin: settings.home,
    destination: next.commitment.destination,
    mode: next.commitment.travelMode,
    departAt: next.arriveBy,
    apiKey: settings.apiKey,
  });

  const approxLeave = new Date(
    next.arriveBy.getTime() -
      settings.arrivalBufferMinutes * MS_PER_MIN -
      estimate.durationSeconds * 1000,
  );
  estimate = await provider.estimate({
    origin: settings.home,
    destination: next.commitment.destination,
    mode: next.commitment.travelMode,
    departAt: approxLeave,
    apiKey: settings.apiKey,
  });

  return buildPlan({
    commitment: next.commitment,
    arriveBy: next.arriveBy,
    estimate,
    settings,
    now,
  });
}
