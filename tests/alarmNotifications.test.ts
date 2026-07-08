import { describe, expect, it } from "vitest";
import {
  alarmNotificationsForPlan,
  notificationDeliveryState,
} from "../src/core/alarmNotifications";
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
  title: "Chem lab",
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
  notificationsEnabled: true,
  locationTrackingEnabled: false,
};

const estimate: TravelEstimate = {
  durationSeconds: 30 * 60,
  freeFlowSeconds: 20 * 60,
  distanceMeters: 8_000,
  congestion: 1.5,
  source: "test",
};

describe("alarm notification scheduling", () => {
  const plan = buildPlan({
    commitment,
    arriveBy: new Date(2026, 6, 8, 9, 0, 0),
    estimate,
    settings,
    now: new Date(2026, 6, 8, 7, 0, 0),
  });

  it("builds wake and leave notifications from a plan", () => {
    const notifications = alarmNotificationsForPlan(plan);

    expect(notifications).toHaveLength(2);
    expect(notifications[0]?.title).toBe("Time to wake up");
    expect(notifications[0]?.body).toContain("Chem lab");
    expect(notifications[1]?.title).toBe("Time to leave");
    expect(notifications[1]?.body).toContain("Office");
  });

  it("classifies future, due, and expired delivery windows", () => {
    const at = new Date(2026, 6, 8, 8, 0, 0);

    expect(
      notificationDeliveryState(at, new Date(2026, 6, 8, 7, 59, 30)),
    ).toEqual({ status: "future", delayMs: 30_000 });
    expect(
      notificationDeliveryState(at, new Date(2026, 6, 8, 8, 0, 30)),
    ).toEqual({ status: "due" });
    expect(
      notificationDeliveryState(at, new Date(2026, 6, 8, 8, 2, 0)),
    ).toEqual({ status: "expired" });
  });
});
