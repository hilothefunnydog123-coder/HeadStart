import { describe, expect, it } from "vitest";
import { buildPlan, refreshPlanTiming } from "../src/core/departure";
import "../src/core"; // register providers
import { planNextDeparture } from "../src/core/departure";
import type {
  Commitment,
  Place,
  Settings,
  TravelEstimate,
} from "../src/core/types";

const home: Place = { id: "h", label: "Home", lat: 37.7599, lng: -122.4148 };
const office: Place = { id: "o", label: "Office", lat: 37.7946, lng: -122.3999 };

const commitment: Commitment = {
  id: "c",
  title: "Standup",
  destination: office,
  travelMode: "drive",
  arriveByMinutes: 9 * 60,
  days: [1, 2, 3, 4, 5],
  enabled: true,
};

const settings: Settings = {
  home,
  prepMinutes: 45,
  arrivalBufferMinutes: 10,
  wakeAheadMinutes: 5,
  trafficProvider: "simulated",
  apiKey: "",
  soundEnabled: false,
  notificationsEnabled: false,
  locationTrackingEnabled: false,
};

// A fixed 30-minute drive so the math is exact and independent of the sim.
const estimate: TravelEstimate = {
  durationSeconds: 30 * 60,
  freeFlowSeconds: 20 * 60,
  distanceMeters: 8000,
  congestion: 1.5,
  source: "test",
};

describe("buildPlan timeline math", () => {
  const arriveBy = new Date(2026, 6, 8, 9, 0, 0); // Wed 09:00

  it("works backwards: leaveBy = arrive − buffer − travel", () => {
    const now = new Date(2026, 6, 8, 6, 0, 0);
    const plan = buildPlan({ commitment, arriveBy, estimate, settings, now });
    // 09:00 − 10m buffer − 30m travel = 08:20
    expect(plan.leaveBy.getHours()).toBe(8);
    expect(plan.leaveBy.getMinutes()).toBe(20);
  });

  it("works backwards: wakeBy = leaveBy − prep − wakeAhead", () => {
    const now = new Date(2026, 6, 8, 6, 0, 0);
    const plan = buildPlan({ commitment, arriveBy, estimate, settings, now });
    // 08:20 − 45m prep − 5m comfort = 07:30
    expect(plan.wakeBy.getHours()).toBe(7);
    expect(plan.wakeBy.getMinutes()).toBe(30);
  });

  it("honours a per-commitment prep override", () => {
    const now = new Date(2026, 6, 8, 6, 0, 0);
    const plan = buildPlan({
      commitment: { ...commitment, prepMinutesOverride: 15 },
      arriveBy,
      estimate,
      settings,
      now,
    });
    // 08:20 − 15m − 5m = 08:00
    expect(plan.wakeBy.getHours()).toBe(8);
    expect(plan.wakeBy.getMinutes()).toBe(0);
  });

  it("more traffic pushes the wake time earlier", () => {
    const now = new Date(2026, 6, 8, 6, 0, 0);
    const light = buildPlan({
      commitment,
      arriveBy,
      estimate: { ...estimate, durationSeconds: 20 * 60 },
      settings,
      now,
    });
    const heavy = buildPlan({
      commitment,
      arriveBy,
      estimate: { ...estimate, durationSeconds: 50 * 60 },
      settings,
      now,
    });
    expect(heavy.wakeBy.getTime()).toBeLessThan(light.wakeBy.getTime());
  });

  it.each([
    ["sleep", new Date(2026, 6, 8, 7, 0, 0)], // before 07:30 wake
    ["wake", new Date(2026, 6, 8, 7, 35, 0)], // within ring window
    ["prep", new Date(2026, 6, 8, 8, 0, 0)], // between wake and leave
    ["leave", new Date(2026, 6, 8, 8, 25, 0)], // between leave and arrive
    ["enroute", new Date(2026, 6, 8, 9, 5, 0)], // after arrive
  ])("resolves phase %s", (expected, now) => {
    const plan = buildPlan({ commitment, arriveBy, estimate, settings, now });
    expect(plan.phase).toBe(expected);
  });
});

describe("refreshPlanTiming", () => {
  it("recomputes phase/countdowns without touching fixed instants", () => {
    const arriveBy = new Date(2026, 6, 8, 9, 0, 0);
    const early = new Date(2026, 6, 8, 6, 0, 0);
    const plan = buildPlan({ commitment, arriveBy, estimate, settings, now: early });
    expect(plan.phase).toBe("sleep");

    const later = new Date(2026, 6, 8, 8, 25, 0);
    const refreshed = refreshPlanTiming(plan, later);
    expect(refreshed.phase).toBe("leave");
    expect(refreshed.leaveBy.getTime()).toBe(plan.leaveBy.getTime());
    expect(refreshed.minutesUntilLeave).toBeLessThan(0);
  });
});

describe("planNextDeparture (integration)", () => {
  it("returns a ready plan using the simulated provider", async () => {
    const now = new Date(2026, 6, 8, 6, 0, 0);
    const result = await planNextDeparture([commitment], settings, now);
    expect("commitment" in result).toBe(true);
    if ("commitment" in result) {
      expect(result.estimate.durationSeconds).toBeGreaterThan(0);
      expect(result.wakeBy.getTime()).toBeLessThan(result.leaveBy.getTime());
      expect(result.leaveBy.getTime()).toBeLessThan(result.arriveBy.getTime());
    }
  });

  it("updates travel time and leave time for bike and walk modes", async () => {
    const now = new Date(2026, 6, 8, 6, 0, 0);
    const drive = await planNextDeparture(
      [{ ...commitment, travelMode: "drive" }],
      settings,
      now,
    );
    const bike = await planNextDeparture(
      [{ ...commitment, travelMode: "cycle" }],
      settings,
      now,
    );
    const walk = await planNextDeparture(
      [{ ...commitment, travelMode: "walk" }],
      settings,
      now,
    );

    expect("commitment" in drive).toBe(true);
    expect("commitment" in bike).toBe(true);
    expect("commitment" in walk).toBe(true);
    if (!("commitment" in drive) || !("commitment" in bike) || !("commitment" in walk)) {
      throw new Error("Expected ready plans");
    }

    expect(bike.estimate.durationSeconds).toBeGreaterThan(
      drive.estimate.durationSeconds,
    );
    expect(walk.estimate.durationSeconds).toBeGreaterThan(
      bike.estimate.durationSeconds,
    );
    expect(bike.leaveBy.getTime()).toBeLessThan(drive.leaveBy.getTime());
    expect(walk.leaveBy.getTime()).toBeLessThan(bike.leaveBy.getTime());
  });

  it("reports no-home when home is unset", async () => {
    const now = new Date(2026, 6, 8, 6, 0, 0);
    const result = await planNextDeparture(
      [commitment],
      { ...settings, home: null },
      now,
    );
    expect(result).toEqual({ phase: "no-home" });
  });

  it("reports no-commitment when nothing is enabled", async () => {
    const now = new Date(2026, 6, 8, 6, 0, 0);
    const result = await planNextDeparture(
      [{ ...commitment, enabled: false }],
      settings,
      now,
    );
    expect(result).toEqual({ phase: "no-commitment" });
  });
});
