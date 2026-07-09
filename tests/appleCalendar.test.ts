import { beforeEach, describe, expect, it, vi } from "vitest";
import { fetchPrivateAppleCalendar } from "../src/core/appleCalendar";

describe("private Apple Calendar connection", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("sends credentials to the same-site function and returns private events", async () => {
    const fetcher = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          sourceLabel: "Apple Calendar",
          ics: "BEGIN:VCALENDAR\nBEGIN:VEVENT\nUID:private\nEND:VEVENT\nEND:VCALENDAR",
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    const result = await fetchPrivateAppleCalendar({
      email: "person@icloud.com",
      appSpecificPassword: "abcd-efgh-ijkl-mnop",
    });

    expect(result.sourceLabel).toBe("Apple Calendar");
    expect(result.ics).toContain("UID:private");
    expect(fetcher).toHaveBeenCalledWith(
      "/.netlify/functions/apple-calendar",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          email: "person@icloud.com",
          appSpecificPassword: "abcd-efgh-ijkl-mnop",
        }),
      }),
    );
  });

  it("surfaces the connector's safe authorization error", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ error: "Apple could not authorize that account." }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      }),
    );

    await expect(
      fetchPrivateAppleCalendar({
        email: "person@icloud.com",
        appSpecificPassword: "wrong-password",
      }),
    ).rejects.toThrow("Apple could not authorize");
  });
});
