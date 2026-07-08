import { describe, expect, it, vi } from "vitest";

describe("state storage", () => {
  it("starts without inferred saved places or demo commitments", async () => {
    vi.resetModules();
    window.localStorage.clear();

    const { defaultState } = await import("../src/state/store");
    const state = defaultState();

    expect(state.settings.home).toBeNull();
    expect(state.settings.campus).toBeNull();
    expect(state.settings.work).toBeNull();
    expect(state.settings.school).toBeNull();
    expect(state.commitments).toEqual([]);
  });

  it("drops legacy Google OAuth client IDs from saved calendar connections", async () => {
    vi.resetModules();
    window.localStorage.clear();
    window.localStorage.setItem(
      "smart-departure-alarm/v1",
      JSON.stringify({
        calendarConnections: [
          {
            provider: "google",
            connected: true,
            eventCount: 2,
            authMode: "google-oauth",
            clientId: "legacy-client-id.apps.googleusercontent.com",
          },
        ],
      }),
    );

    const { loadState } = await import("../src/state/store");
    const state = loadState();

    expect(state.calendarConnections[0]).not.toHaveProperty("clientId");
    expect(state.calendarConnections[0]).toMatchObject({
      provider: "google",
      connected: true,
      eventCount: 2,
      authMode: "google-oauth",
    });
  });

  it("removes legacy demo Home and demo-office commitments from existing browsers", async () => {
    vi.resetModules();
    window.localStorage.clear();
    window.localStorage.setItem(
      "smart-departure-alarm/v1",
      JSON.stringify({
        settings: {
          home: {
            id: "home",
            label: "Home — Mission District",
            lat: 37.7599,
            lng: -122.4148,
          },
        },
        commitments: [
          {
            id: "standup",
            title: "Morning standup",
            destination: {
              id: "office",
              label: "Office — Financial District",
              lat: 37.7946,
              lng: -122.3999,
            },
            travelMode: "drive",
            arriveByMinutes: 540,
            days: [1, 2, 3, 4, 5],
            enabled: true,
          },
          {
            id: "edited-demo",
            title: "d",
            destination: {
              id: "office",
              label: "Office — Financial District",
              lat: 37.7946,
              lng: -122.3999,
            },
            travelMode: "walk",
            arriveByMinutes: 540,
            days: [1],
            enabled: true,
          },
          {
            id: "real",
            title: "Library",
            destination: {
              id: "library",
              label: "Main Library",
              lat: 37.7789,
              lng: -122.412,
            },
            travelMode: "walk",
            arriveByMinutes: 900,
            days: [2],
            enabled: true,
          },
        ],
        placeHistory: [
          {
            id: "place-37.75990,-122.41480",
            place: {
              id: "home",
              label: "Home — Mission District",
              lat: 37.7599,
              lng: -122.4148,
            },
            useCount: 1,
            lastUsedAt: "2026-07-07T12:00:00.000Z",
            contexts: [{ kind: "home", weekday: 2, hour: 18 }],
          },
        ],
      }),
    );

    const { loadState } = await import("../src/state/store");
    const state = loadState();

    expect(state.settings.home).toBeNull();
    expect(state.commitments.map((commitment) => commitment.id)).toEqual(["real"]);
    expect(state.placeHistory).toEqual([]);
  });

  it("migrates older schedule data into student defaults", async () => {
    vi.resetModules();
    window.localStorage.clear();
    window.localStorage.setItem(
      "smart-departure-alarm/v1",
      JSON.stringify({
        commitments: [
          {
            id: "quiz",
            title: "Chemistry Quiz",
            destination: {
              id: "science",
              label: "Science Hall",
              lat: 37.428,
              lng: -122.17,
            },
            travelMode: "walk",
            arriveByMinutes: 600,
            days: [],
            oneOffDate: "2026-07-15",
            enabled: true,
          },
        ],
      }),
    );

    const { loadState } = await import("../src/state/store");
    const state = loadState();

    expect(state.settings.campusPrepMinutes).toBe(5);
    expect(state.settings.defaultStudyMinutes).toBe(180);
    expect(state.settings.targetStudySessions).toBe(3);
    expect(state.settings.semester).toMatchObject({ holidays: [] });
    expect(state.commitments[0]).toMatchObject({
      id: "quiz",
      itemType: "test",
      originStrategy: "previous",
    });
  });
});
