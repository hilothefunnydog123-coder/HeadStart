import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AlarmCard } from "../src/components/AlarmCard";
import { buildPlan } from "../src/core/departure";
import type { Commitment, Place, Settings, TravelEstimate } from "../src/core/types";

const home: Place = { id: "home", label: "Home", lat: 37.7599, lng: -122.4148 };
const office: Place = { id: "office", label: "Office", lat: 37.7946, lng: -122.3999 };
const commitment: Commitment = {
  id: "meeting",
  title: "Team meeting",
  destination: office,
  travelMode: "drive",
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
  freeFlowSeconds: 18 * 60,
  distanceMeters: 5_000,
  congestion: 1.1,
  source: "Simulated traffic (offline)",
};

describe("screen-reader behavior", () => {
  it("limits live announcements to the changing dial status", () => {
    const now = new Date(2026, 6, 13, 7, 0, 0);
    const plan = buildPlan({
      commitment,
      arriveBy: new Date(2026, 6, 13, 9, 0, 0),
      estimate,
      settings,
      now,
    });

    const { container } = render(
      <AlarmCard
        plan={plan}
        now={now}
        settings={settings}
        liveStatus={{ kind: "disabled" }}
        onReviewLocationConsent={() => undefined}
        onTravelModeChange={() => undefined}
        confidence={null}
        briefing={{
          supported: false,
          speaking: false,
          onBrief: () => undefined,
        }}
      />,
    );

    expect(container.querySelector(".alarm-card")).not.toHaveAttribute("aria-live");
    expect(screen.getAllByRole("status")).toHaveLength(1);
  });
});
