import { describe, expect, it } from "vitest";
import {
  systemReminderCalendar,
  systemReminderFileName,
} from "../src/core/systemReminders";
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
  label: "Science Hall",
  lat: 37.7946,
  lng: -122.3999,
};

const commitment: Commitment = {
  id: "lab",
  title: "Chemistry lab",
  destination,
  travelMode: "walk",
  arriveByMinutes: 9 * 60,
  days: [1],
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
  locationTrackingEnabled: false,
};

const estimate: TravelEstimate = {
  durationSeconds: 20 * 60,
  freeFlowSeconds: 20 * 60,
  distanceMeters: 1_500,
  congestion: 1,
  source: "test",
};

describe("system reminders", () => {
  const plan = buildPlan({
    commitment,
    arriveBy: new Date("2026-07-13T16:00:00.000Z"),
    estimate,
    settings,
    now: new Date("2026-07-13T14:00:00.000Z"),
  });

  it("creates wake and leave calendar events with immediate alarms", () => {
    const ics = systemReminderCalendar(
      plan,
      new Date("2026-07-07T18:00:00.000Z"),
    );

    expect(ics).toContain("BEGIN:VCALENDAR");
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(2);
    expect(ics.match(/BEGIN:VALARM/g)).toHaveLength(2);
    expect(ics).toContain("TRIGGER:PT0M");
    expect(ics).toContain("SUMMARY:Wake up for Chemistry lab");
    expect(ics).toContain("SUMMARY:Leave for Chemistry lab");
    expect(ics).toContain("Science Hall");
  });

  it("uses a readable reminder filename", () => {
    expect(systemReminderFileName(plan)).toBe(
      "departure-reminders-2026-07-13-chemistry-lab.ics",
    );
  });
});
