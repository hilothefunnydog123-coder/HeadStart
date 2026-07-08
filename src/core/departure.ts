import { scheduleContextForNext } from "./schedule";
import { getProvider } from "./traffic/provider";
import type {
  Commitment,
  DeparturePlan,
  PlanPhase,
  Place,
  Settings,
  TravelEstimate,
} from "./types";

/** How long the alarm is considered to be "actively ringing" after wake time. */
export const ALARM_RING_WINDOW_MIN = 15;

const SEC_PER_MIN = 60;
const MS_PER_MIN = 60_000;

export type OriginOverrideSource = "manual" | "live" | "campus";

interface BuildPlanInput {
  commitment: Commitment;
  arriveBy: Date;
  estimate: TravelEstimate;
  settings: Settings;
  now: Date;
  origin?: DeparturePlan["origin"];
  originLabel?: string;
  previousCommitment?: Commitment;
  previousArriveBy?: Date;
  isFirstClassOfDay?: boolean;
  usesWake?: boolean;
  gapMinutes?: number;
  impossibleTransition?: boolean;
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
  const usesWake = input.usesWake ?? true;

  const prepMinutes =
    commitment.prepMinutesOverride ??
    (usesWake ? settings.prepMinutes : settings.campusPrepMinutes ?? 5);
  const wakeCushionMinutes = usesWake ? settings.wakeAheadMinutes : 0;
  const arrivalBufferMinutes =
    settings.arrivalBufferMinutes +
    (commitment.travelMode === "walk"
      ? settings.campusWalkingBufferMinutes ?? 0
      : 0);

  const leaveBy = new Date(
    arriveBy.getTime() -
      arrivalBufferMinutes * MS_PER_MIN -
      (estimate.durationSeconds / SEC_PER_MIN) * MS_PER_MIN,
  );

  const wakeBy = new Date(
    leaveBy.getTime() -
      prepMinutes * MS_PER_MIN -
      wakeCushionMinutes * MS_PER_MIN,
  );

  const phase = resolvePhase(now, wakeBy, leaveBy, arriveBy);

  const minutesUntilLeave = Math.round(
    (leaveBy.getTime() - now.getTime()) / MS_PER_MIN,
  );
  const minutesUntilWake = Math.round(
    (wakeBy.getTime() - now.getTime()) / MS_PER_MIN,
  );
  const minutesUntilArrive = Math.round(
    (arriveBy.getTime() - now.getTime()) / MS_PER_MIN,
  );

  return {
    commitment,
    estimate,
    origin: input.origin ?? settings.home ?? commitment.destination,
    originLabel: input.originLabel ?? input.origin?.label ?? settings.home?.label ?? "Start",
    previousCommitment: input.previousCommitment,
    previousArriveBy: input.previousArriveBy,
    isFirstClassOfDay: input.isFirstClassOfDay ?? true,
    usesWake,
    gapMinutes: input.gapMinutes,
    impossibleTransition: input.impossibleTransition,
    arriveBy,
    leaveBy,
    wakeBy,
    phase,
    minutesUntilLeave,
    minutesUntilWake,
    minutesUntilArrive,
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
    minutesUntilArrive: Math.round(
      (plan.arriveBy.getTime() - now.getTime()) / MS_PER_MIN,
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
  originOverride?: Place | null,
  originOverrideSource: OriginOverrideSource = "manual",
): Promise<DeparturePlan | { phase: "no-home" | "no-commitment" }> {
  const effectiveOriginOverride =
    originOverride && (originOverrideSource !== "live" || settings.locationTrackingEnabled)
      ? originOverride
      : null;
  const context = scheduleContextForNext(
    commitments,
    settings,
    now,
    effectiveOriginOverride,
  );
  if (!context) return { phase: "no-commitment" };
  const { occurrence } = context;
  const needsStartLocation =
    !context.previous && !settings.home && !settings.campus && !effectiveOriginOverride;
  if (needsStartLocation) return { phase: "no-home" };

  const provider =
    (getProvider(settings.trafficProvider)?.isReady(settings.apiKey)
      ? getProvider(settings.trafficProvider)
      : undefined) ?? getProvider("simulated")!;

  // Estimate for a departure near the actual leave window rather than "now",
  // so overnight planning still reflects morning rush hour. We approximate by
  // first estimating at arrival time, then refining once around the leave time.
  let estimate = await provider.estimate({
    origin: context.origin,
    destination: occurrence.commitment.destination,
    mode: occurrence.commitment.travelMode,
    departAt: occurrence.arriveBy,
    apiKey: settings.apiKey,
  });

  const approxLeave = new Date(
    occurrence.arriveBy.getTime() -
      settings.arrivalBufferMinutes * MS_PER_MIN -
      estimate.durationSeconds * 1000,
  );
  estimate = await provider.estimate({
    origin: context.origin,
    destination: occurrence.commitment.destination,
    mode: occurrence.commitment.travelMode,
    departAt: approxLeave,
    apiKey: settings.apiKey,
  });

  const requiredTransitionMinutes = Math.ceil(estimate.durationSeconds / SEC_PER_MIN) +
    settings.arrivalBufferMinutes +
    (occurrence.commitment.travelMode === "walk"
      ? settings.campusWalkingBufferMinutes ?? 0
      : 0);

  return buildPlan({
    commitment: occurrence.commitment,
    arriveBy: occurrence.arriveBy,
    estimate,
    settings,
    now,
    origin: context.origin,
    originLabel: context.originLabel,
    previousCommitment: context.previous?.commitment,
    previousArriveBy: context.previous?.arriveBy,
    isFirstClassOfDay: context.isFirstClassOfDay,
    usesWake: context.usesWake,
    gapMinutes: context.gapMinutes,
    impossibleTransition:
      context.gapMinutes != null &&
      context.previous != null &&
      context.gapMinutes < requiredTransitionMinutes,
  });
}
