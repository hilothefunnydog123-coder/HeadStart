import { afterEach, describe, expect, it, vi } from "vitest";
import { requestGoogleAccountProfile } from "../src/core/googleCalendar";

describe("Google account authorization", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    delete window.google;
  });

  it("requests profile scopes and returns Google's verified account", async () => {
    let requestedScope = "";
    window.google = {
      accounts: {
        oauth2: {
          initTokenClient: (config) => {
            requestedScope = config.scope;
            return {
              requestAccessToken: () =>
                config.callback({
                  access_token: "google-access-token",
                  scope: config.scope,
                }),
            };
          },
        },
      },
    };
    const fetcher = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          sub: "google-subject",
          email: "student@example.com",
          email_verified: true,
          name: "Student Name",
          picture: "https://example.com/avatar.png",
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    const profile = await requestGoogleAccountProfile("client-id");

    expect(requestedScope).toBe("openid email profile");
    expect(profile).toMatchObject({
      sub: "google-subject",
      email: "student@example.com",
      name: "Student Name",
    });
    expect(fetcher).toHaveBeenCalledWith(
      "https://openidconnect.googleapis.com/v1/userinfo",
      { headers: { Authorization: "Bearer google-access-token" } },
    );
  });
});
