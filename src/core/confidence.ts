import { arrivalBufferMinutesFor } from "./departure";
import type { DeparturePlan, Settings } from "./types";

/**
 * "How sure are we you'll actually make it?"
 *
 * Travel times aren't a single number — they're a right-skewed distribution
 * (you can be a little early, but a jam can make you very late). We model the
 * trip as a lognormal whose spread grows with congestion, then Monte-Carlo
 * sample it to estimate the probability of arriving on time if you leave at the
 * recommended `leaveBy`.
 *
 * The maths that makes it work: leaveBy already subtracts the mean travel time
 * and your arrival buffer, so you arrive on time exactly when the *actual*
 * travel time doesn't exceed the mean by more than that buffer. Confidence is
 * therefore how much of the distribution falls within `mean + buffer`.
 *
 * Everything here is deterministic (seeded RNG) so the number is stable across
 * renders and unit-testable.
 */

export interface Confidence {
  /** P(on time) in [0,1] if you leave at leaveBy. */
  probability: number;
  /** The confidence we'd like to hit (e.g. 0.9). */
  target: number;
  /** Extra minutes of buffer needed to reach `target` (0 if already there). */
  extraMinutesForTarget: number;
  /** Median travel time, minutes. */
  p50Minutes: number;
  /** 90th-percentile ("bad day") travel time, minutes. */
  p90Minutes: number;
  level: "high" | "medium" | "low";
}

export interface ConfidenceOptions {
  samples?: number;
  target?: number;
  seed?: number;
}

/** Deterministic PRNG (mulberry32) — same seed, same stream. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Standard-normal sample via Box–Muller, driven by a uniform RNG. */
function gaussian(rng: () => number): number {
  let u = 0;
  let v = 0;
  while (u === 0) u = rng();
  while (v === 0) v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/**
 * Coefficient of variation (sd / mean) for the trip. Free-flowing roads are
 * predictable; congestion widens the spread fast.
 */
export function travelCV(congestion: number): number {
  const excess = Math.min(1.2, Math.max(0, congestion - 1));
  return 0.1 + 0.2 * excess;
}

function quantile(sorted: number[], q: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(
    sorted.length - 1,
    Math.max(0, Math.round(q * (sorted.length - 1))),
  );
  return sorted[idx]!;
}

export function computeConfidence(
  plan: DeparturePlan,
  settings: Settings,
  opts: ConfidenceOptions = {},
): Confidence {
  const samples = opts.samples ?? 2000;
  const target = opts.target ?? 0.9;
  const rng = mulberry32(opts.seed ?? 1337);

  const meanSec = plan.estimate.durationSeconds;
  const bufferSec = arrivalBufferMinutesFor(plan.commitment, settings) * 60;
  const cv = travelCV(plan.estimate.congestion);

  // Lognormal parameters matched to the desired mean and CV.
  const sigmaLog = Math.sqrt(Math.log(1 + cv * cv));
  const muLog = Math.log(Math.max(1, meanSec)) - (sigmaLog * sigmaLog) / 2;

  const draws: number[] = new Array(samples);
  let onTime = 0;
  const threshold = meanSec + bufferSec;
  for (let i = 0; i < samples; i++) {
    const t = Math.exp(muLog + sigmaLog * gaussian(rng));
    draws[i] = t;
    if (t <= threshold) onTime++;
  }
  draws.sort((a, b) => a - b);

  const probability = onTime / samples;

  // Minutes of extra buffer to cover the `target` quantile of travel time.
  const targetTravel = quantile(draws, target);
  const extraSec = Math.max(0, targetTravel - threshold);

  const level: Confidence["level"] =
    probability >= 0.85 ? "high" : probability >= 0.6 ? "medium" : "low";

  return {
    probability,
    target,
    extraMinutesForTarget: Math.ceil(extraSec / 60),
    p50Minutes: Math.round(quantile(draws, 0.5) / 60),
    p90Minutes: Math.round(quantile(draws, 0.9) / 60),
    level,
  };
}

/** A short spoken/printed morning briefing derived from the plan. */
export function buildBriefing(
  plan: DeparturePlan,
  confidence: Confidence,
): string {
  const clock = (d: Date) =>
    d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  const pct = Math.round(confidence.probability * 100);
  const congestion = plan.estimate.congestion;
  const traffic =
    congestion >= 1.6
      ? "Traffic is heavy"
      : congestion >= 1.25
        ? "Traffic is moderate"
        : "Roads are clear";

  const isCatch = plan.commitment.kind === "catch";
  const parts = [
    `Good morning.`,
    isCatch
      ? `You're catching ${plan.commitment.title} — it leaves at ${clock(plan.arriveBy)}.`
      : `Your first commitment is ${plan.commitment.title} at ${clock(plan.arriveBy)}.`,
    `${traffic} — plan to leave by ${clock(plan.leaveBy)}.`,
    isCatch
      ? `You're ${pct} percent likely to make it.`
      : `You're ${pct} percent likely to arrive on time.`,
  ];
  if (confidence.extraMinutesForTarget > 0) {
    parts.push(
      `Leave ${confidence.extraMinutesForTarget} minutes earlier to be safe.`,
    );
  }
  return parts.join(" ");
}
