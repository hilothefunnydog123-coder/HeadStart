import { describe, expect, it } from "vitest";
import {
  delayMinutes,
  isStillAtDeparture,
  shouldCheckLateDeparture,
  updatedArrival,
} from "../src/core/liveDeparture";
import { buildPlan } from "../src/core/departure";
import type {
  Commitment,
  Place,
  Settings,
  TravelEstimate,
} from "../src/core/types";

const home: Place = { id: "home", label: "Home", lat: 37.7599, lng: -122.4148 };
const destination: Place = {
  id: "office",
  label: "Office",
  lat: 37.7946,
  lng: -122.3999,
};

const commitment: Commitment = {
  id: "c",
  title: "Meeting",
  destination,
  travelMode: "drive",
  arriveByMinutes: 9 * 60,
  days: [1, 2, 3, 4, 5],
  enabled: true,
};

const settings: Settings = {
  home,
  prepMinutes: 30,
  arrivalBufferMinutes: 10,
  wakeAheadMinutes: 5,
  trafficProvider: "simulated",
  apiKey: "",
  soundEnabled: false,
  notificationsEnabled: false,
  locationTrackingEnabled: true,
};

const estimate: TravelEstimate = {
  durationSeconds: 30 * 60,
  freeFlowSeconds: 20 * 60,
  distanceMeters: 8_000,
  congestion: 1.5,
  source: "test",
};

describe("live departure helpers", () => {
  it("detects whether the user is still at the departure point", () => {
    expect(
      isStillAtDeparture(home, {
        id: "near",
        label: "Near home",
        lat: 37.7601,
        lng: -122.4149,
      }),
    ).toBe(true);

    expect(isStillAtDeparture(home, destination)).toBe(false);
  });

  it("checks missed departures only after leave time and before arrival", () => {
    const plan = buildPlan({
      commitment,
      arriveBy: new Date(2026, 6, 8, 9, 0, 0),
      estimate,
      settings,
      now: new Date(2026, 6, 8, 8, 0, 0),
    });

    expect(shouldCheckLateDeparture(plan, new Date(2026, 6, 8, 8, 19, 0))).toBe(false);
    expect(shouldCheckLateDeparture(plan, new Date(2026, 6, 8, 8, 21, 0))).toBe(true);
    expect(shouldCheckLateDeparture(plan, new Date(2026, 6, 8, 9, 1, 0))).toBe(false);
  });

  it("computes updated arrival and delay from a leave-now estimate", () => {
    const plan = buildPlan({
      commitment,
      arriveBy: new Date(2026, 6, 8, 9, 0, 0),
      estimate,
      settings,
      now: new Date(2026, 6, 8, 8, 0, 0),
    });
    const arrival = updatedArrival(new Date(2026, 6, 8, 8, 45, 0), estimate);

    expect(arrival.getHours()).toBe(9);
    expect(arrival.getMinutes()).toBe(15);
    expect(delayMinutes(plan, arrival)).toBe(15);
  });
});
