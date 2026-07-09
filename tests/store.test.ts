import { describe, expect, it, vi } from "vitest";

describe("state storage", () => {
  it("starts without inferred saved places or demo commitments", async () => {
    vi.resetModules();
    window.localStorage.clear();

    const { defaultState } = await import("../src/state/store");
    const state = defaultState();

    expect(state.settings.home).toBeNull();
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

  it("keeps saved app state separate for each account", async () => {
    vi.resetModules();
    window.localStorage.clear();

    const { defaultState, loadState, saveState, stateStorageKey } = await import(
      "../src/state/store"
    );
    const base = defaultState();

    saveState(
      {
        ...base,
        settings: {
          ...base.settings,
          prepMinutes: 20,
        },
      },
      "user-a",
    );
    saveState(
      {
        ...base,
        settings: {
          ...base.settings,
          prepMinutes: 55,
        },
      },
      "user-b",
    );

    expect(stateStorageKey("user-a")).toBe(
      "smart-departure-alarm/v1/users/user-a",
    );
    expect(loadState("user-a").settings.prepMinutes).toBe(20);
    expect(loadState("user-b").settings.prepMinutes).toBe(55);
    expect(loadState().settings.prepMinutes).toBe(45);
  });

  it("removes legacy demo Home and Morning standup from existing browsers", async () => {
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
});
