import { afterEach, describe, expect, it, vi } from "vitest";
import { buildPlan } from "../src/core/departure";
import { nativeCalendarEventsToCommitments } from "../src/core/nativeCalendar";
import { hostedProvider } from "../src/core/traffic/hosted";
import type { Commitment, Place, Settings, TravelEstimate } from "../src/core/types";
import { trafficRefreshCadenceMinutes } from "../src/hooks/usePlan";
import {
  nativePlanPayload,
  verifyNativeAlarm,
} from "../src/native/departureNative";

const home: Place = { id: "home", label: "Home", lat: 37.76, lng: -122.42 };
const office: Place = { id: "office", label: "Office", lat: 37.79, lng: -122.4 };
const commitment: Commitment = {
  id: "meeting",
  title: "Design review",
  destination: office,
  travelMode: "drive",
  arriveByMinutes: 9 * 60,
  oneOffDate: "2026-07-10",
  days: [],
  enabled: true,
};
const settings: Settings = {
  home,
  prepMinutes: 30,
  arrivalBufferMinutes: 10,
  wakeAheadMinutes: 5,
  trafficProvider: "hosted",
  apiKey: "",
  soundEnabled: true,
  notificationsEnabled: true,
  locationTrackingEnabled: false,
  nativeAlarmsEnabled: true,
  calendarAutomationEnabled: true,
};
const estimate: TravelEstimate = {
  durationSeconds: 1_800,
  freeFlowSeconds: 1_500,
  distanceMeters: 9_000,
  congestion: 1.2,
  source: "Departure live traffic",
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("hosted traffic", () => {
  it("posts coordinates and returns a validated live estimate", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        durationSeconds: 1_920,
        freeFlowSeconds: 1_600,
        distanceMeters: 9_500,
        source: "Departure live traffic · Google Routes",
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await hostedProvider.estimate({
      origin: home,
      destination: office,
      mode: "drive",
      departAt: new Date("2026-07-10T15:00:00.000Z"),
      apiKey: "",
    });

    expect(result.durationSeconds).toBe(1_920);
    expect(result.congestion).toBeCloseTo(1.2);
    expect(fetchMock).toHaveBeenCalledWith(
      "/.netlify/functions/traffic",
      expect.objectContaining({ method: "POST" }),
    );
    const request = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(JSON.parse(String(request.body))).toMatchObject({
      origin: { lat: home.lat, lng: home.lng },
      destination: { lat: office.lat, lng: office.lng },
      mode: "drive",
    });
  });

  it("rejects incomplete provider responses so the planner can fall back", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }));
    await expect(
      hostedProvider.estimate({
        origin: home,
        destination: office,
        mode: "drive",
        departAt: new Date(),
        apiKey: "",
      }),
    ).rejects.toThrow("incomplete route");
  });
});

describe("native plan and background cadence", () => {
  const plan = buildPlan({
    commitment,
    arriveBy: new Date("2026-07-10T16:00:00.000Z"),
    estimate,
    settings,
    now: new Date("2026-07-10T12:00:00.000Z"),
  });

  it("serializes every value needed for native alarm and traffic rescheduling", () => {
    const payload = nativePlanPayload(plan, settings);
    expect(payload).toMatchObject({
      id: expect.stringContaining("meeting:"),
      title: "Design review",
      destinationLabel: "Office",
      origin: { lat: home.lat, lng: home.lng },
      destination: { lat: office.lat, lng: office.lng },
      prepMinutes: 30,
      arrivalBufferMinutes: 10,
      wakeCushionMinutes: 5,
    });
    expect(payload?.wakeAt).toBe(plan.wakeBy.toISOString());
    expect(payload?.leaveAt).toBe(plan.leaveBy.toISOString());
  });

  it("refreshes at 15, 5, and 1 minute cadences as wake time approaches", () => {
    expect(
      trafficRefreshCadenceMinutes(plan, new Date(plan.wakeBy.getTime() - 181 * 60_000)),
    ).toBe(15);
    expect(
      trafficRefreshCadenceMinutes(plan, new Date(plan.wakeBy.getTime() - 31 * 60_000)),
    ).toBe(5);
    expect(
      trafficRefreshCadenceMinutes(plan, new Date(plan.wakeBy.getTime() - 30 * 60_000)),
    ).toBe(1);
  });

  it("returns an actionable verification result in the web preview", async () => {
    await expect(verifyNativeAlarm()).resolves.toMatchObject({
      scheduled: false,
      checks: [expect.objectContaining({ id: "native-app", status: "warning" })],
    });
  });
});

describe("device calendar automation", () => {
  it("imports only future, timed, physical events and preserves coordinates", () => {
    const now = new Date("2026-07-10T12:00:00.000Z");
    const result = nativeCalendarEventsToCommitments(
      [
        {
          id: "physical",
          title: "Client meeting",
          startAt: "2026-07-10T18:00:00.000Z",
          location: "1 Market St",
          latitude: 37.7936,
          longitude: -122.3958,
        },
        {
          id: "remote",
          title: "Video call",
          startAt: "2026-07-10T19:00:00.000Z",
          location: "Zoom",
          remote: true,
        },
        {
          id: "all-day",
          title: "Holiday",
          startAt: "2026-07-11T00:00:00.000Z",
          allDay: true,
        },
      ],
      office,
      now,
    );

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      title: "Client meeting",
      enabled: true,
      destination: { lat: 37.7936, lng: -122.3958 },
      source: { provider: "device", externalId: "physical" },
    });
  });
});
