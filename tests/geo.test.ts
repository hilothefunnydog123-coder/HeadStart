import { describe, expect, it } from "vitest";
import { haversineMeters, routeDistanceMeters } from "../src/core/geo";
import type { Place } from "../src/core/types";

const sf: Place = { id: "a", label: "SF", lat: 37.7749, lng: -122.4194 };
const oakland: Place = { id: "b", label: "Oakland", lat: 37.8044, lng: -122.2712 };

describe("haversineMeters", () => {
  it("is zero for identical points", () => {
    expect(haversineMeters(sf, sf)).toBe(0);
  });

  it("matches the known SF↔Oakland great-circle distance (~13.4 km)", () => {
    const d = haversineMeters(sf, oakland);
    expect(d).toBeGreaterThan(13_000);
    expect(d).toBeLessThan(14_000);
  });

  it("is symmetric", () => {
    expect(haversineMeters(sf, oakland)).toBeCloseTo(
      haversineMeters(oakland, sf),
      6,
    );
  });
});

describe("routeDistanceMeters", () => {
  it("inflates straight-line distance by the detour factor", () => {
    const straight = haversineMeters(sf, oakland);
    const route = routeDistanceMeters(sf, oakland);
    expect(route).toBeGreaterThan(straight);
    expect(route / straight).toBeCloseTo(1.4, 5);
  });
});
