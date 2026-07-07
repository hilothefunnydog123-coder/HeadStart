import { describe, expect, it, vi } from "vitest";

describe("state storage", () => {
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
});
