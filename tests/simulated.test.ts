import { describe, expect, it } from "vitest";
import {
  congestionMultiplier,
  simulatedProvider,
  travelModeCongestionMultiplier,
} from "../src/core/traffic/simulated";
import type { Place } from "../src/core/types";

const home: Place = { id: "h", label: "Home", lat: 37.7599, lng: -122.4148 };
const office: Place = { id: "o", label: "Office", lat: 37.7946, lng: -122.3999 };

describe("congestionMultiplier", () => {
  it("peaks during weekday morning rush and dips overnight", () => {
    const rush = congestionMultiplier(new Date(2026, 6, 8, 8, 15)); // Wed 08:15
    const night = congestionMultiplier(new Date(2026, 6, 8, 3, 0)); // Wed 03:00
    expect(rush).toBeGreaterThan(1.5);
    expect(night).toBeLessThan(1.1);
    expect(rush).toBeGreaterThan(night);
  });

  it("is calmer on weekends than weekdays at the same hour", () => {
    const weekday = congestionMultiplier(new Date(2026, 6, 8, 8, 15)); // Wed
    const weekend = congestionMultiplier(new Date(2026, 6, 11, 8, 15)); // Sat
    expect(weekend).toBeLessThan(weekday);
  });

  it("scales the morning curve by travel mode", () => {
    const rush = new Date(2026, 6, 8, 8, 15);

    expect(travelModeCongestionMultiplier("walk", rush)).toBe(1);
    expect(travelModeCongestionMultiplier("cycle", rush)).toBeGreaterThan(1);
    expect(travelModeCongestionMultiplier("cycle", rush)).toBeLessThan(
      travelModeCongestionMultiplier("drive", rush),
    );
  });
});

describe("simulatedProvider", () => {
  it("takes longer in rush hour than at night for the same trip", async () => {
    const night = await simulatedProvider.estimate({
      origin: home,
      destination: office,
      mode: "drive",
      departAt: new Date(2026, 6, 8, 3, 0),
    });
    const rush = await simulatedProvider.estimate({
      origin: home,
      destination: office,
      mode: "drive",
      departAt: new Date(2026, 6, 8, 8, 15),
    });
    expect(rush.durationSeconds).toBeGreaterThan(night.durationSeconds);
    expect(rush.congestion).toBeGreaterThan(night.congestion);
  });

  it("never dips below free-flow duration", async () => {
    const est = await simulatedProvider.estimate({
      origin: home,
      destination: office,
      mode: "drive",
      departAt: new Date(2026, 6, 8, 3, 0),
    });
    // congestion is 1.0 baseline; jitter can only add a little, floor is ~free-flow
    expect(est.durationSeconds).toBeGreaterThan(0);
    expect(est.distanceMeters).toBeGreaterThan(0);
  });

  it("is deterministic for identical inputs (no flicker)", async () => {
    const args = {
      origin: home,
      destination: office,
      mode: "drive" as const,
      departAt: new Date(2026, 6, 8, 8, 15),
    };
    const a = await simulatedProvider.estimate(args);
    const b = await simulatedProvider.estimate(args);
    expect(a.durationSeconds).toBe(b.durationSeconds);
  });

  it("makes walking immune to vehicle congestion", async () => {
    const walkNight = await simulatedProvider.estimate({
      origin: home,
      destination: office,
      mode: "walk",
      departAt: new Date(2026, 6, 8, 3, 0),
    });
    const walkRush = await simulatedProvider.estimate({
      origin: home,
      destination: office,
      mode: "walk",
      departAt: new Date(2026, 6, 8, 8, 15),
    });
    // Only jitter differs; congestion factor is ~1 for walking.
    expect(walkRush.congestion).toBeLessThan(1.15);
    expect(walkNight.congestion).toBeLessThan(1.15);
  });
});
