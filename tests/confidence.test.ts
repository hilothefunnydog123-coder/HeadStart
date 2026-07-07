import { describe, expect, it } from "vitest";
import {
  buildBriefing,
  computeConfidence,
  travelCV,
} from "../src/core/confidence";
import type { Commitment, DeparturePlan, Place, Settings } from "../src/core/types";

const office: Place = { id: "o", label: "Office", lat: 37.79, lng: -122.4 };
const commitment: Commitment = {
  id: "c",
  title: "Standup",
  destination: office,
  travelMode: "drive",
  arriveByMinutes: 540,
  days: [1, 2, 3, 4, 5],
  enabled: true,
};

const settings: Settings = {
  home: null,
  prepMinutes: 45,
  arrivalBufferMinutes: 10,
  wakeAheadMinutes: 5,
  trafficProvider: "simulated",
  soundEnabled: false,
  notificationsEnabled: false,
  locationTrackingEnabled: false,
};

function planWith(durationMin: number, congestion: number): DeparturePlan {
  const arriveBy = new Date(2026, 6, 8, 9, 0, 0);
  const leaveBy = new Date(arriveBy.getTime() - (10 + durationMin) * 60000);
  return {
    commitment,
    estimate: {
      durationSeconds: durationMin * 60,
      freeFlowSeconds: (durationMin / congestion) * 60,
      distanceMeters: 8000,
      congestion,
      source: "test",
    },
    arriveBy,
    leaveBy,
    wakeBy: new Date(leaveBy.getTime() - 50 * 60000),
    phase: "sleep",
    minutesUntilLeave: 120,
    minutesUntilWake: 70,
  };
}

describe("travelCV", () => {
  it("grows with congestion", () => {
    expect(travelCV(1.0)).toBeCloseTo(0.1, 5);
    expect(travelCV(1.5)).toBeGreaterThan(travelCV(1.0));
    expect(travelCV(3.0)).toBeCloseTo(0.1 + 0.2 * 1.2, 5); // clamped
  });
});

describe("computeConfidence", () => {
  it("is deterministic for a fixed seed", () => {
    const a = computeConfidence(planWith(30, 1.5), settings, { seed: 7 });
    const b = computeConfidence(planWith(30, 1.5), settings, { seed: 7 });
    expect(a.probability).toBe(b.probability);
  });

  it("returns a probability in [0,1]", () => {
    const c = computeConfidence(planWith(30, 1.4), settings);
    expect(c.probability).toBeGreaterThanOrEqual(0);
    expect(c.probability).toBeLessThanOrEqual(1);
  });

  it("is more confident with a bigger arrival buffer", () => {
    const tight = computeConfidence(planWith(30, 1.6), {
      ...settings,
      arrivalBufferMinutes: 2,
    });
    const roomy = computeConfidence(planWith(30, 1.6), {
      ...settings,
      arrivalBufferMinutes: 25,
    });
    expect(roomy.probability).toBeGreaterThan(tight.probability);
  });

  it("is less confident when traffic is more volatile", () => {
    const calm = computeConfidence(planWith(30, 1.05), settings);
    const chaos = computeConfidence(planWith(30, 2.2), settings);
    expect(chaos.probability).toBeLessThan(calm.probability);
  });

  it("recommends extra buffer only when short of target", () => {
    const roomy = computeConfidence(planWith(30, 1.05), {
      ...settings,
      arrivalBufferMinutes: 40,
    });
    expect(roomy.extraMinutesForTarget).toBe(0);

    const tight = computeConfidence(planWith(30, 1.9), {
      ...settings,
      arrivalBufferMinutes: 1,
    });
    expect(tight.extraMinutesForTarget).toBeGreaterThan(0);
  });

  it("orders percentiles p50 <= p90", () => {
    const c = computeConfidence(planWith(30, 1.5), settings);
    expect(c.p50Minutes).toBeLessThanOrEqual(c.p90Minutes);
  });
});

describe("buildBriefing", () => {
  it("mentions the commitment, leave time and confidence", () => {
    const plan = planWith(30, 1.6);
    const conf = computeConfidence(plan, settings);
    const text = buildBriefing(plan, conf);
    expect(text).toContain("Standup");
    expect(text).toMatch(/leave by/i);
    expect(text).toMatch(/percent likely/i);
  });
});
