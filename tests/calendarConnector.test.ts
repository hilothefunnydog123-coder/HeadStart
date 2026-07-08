import { describe, expect, it, vi } from "vitest";
import {
  calendarConnectorCleanUrl,
  readCalendarConnectorReturn,
} from "../src/core/calendarConnector";
import type { Place } from "../src/core/types";

const fallback: Place = {
  id: "fallback",
  label: "Default office",
  lat: 37.7946,
  lng: -122.3999,
};
const now = new Date(2026, 6, 7, 8, 0, 0);

describe("calendar connector return handling", () => {
  it("imports Apple connector events without requiring a public iCal URL", async () => {
    const events = encodePayload(
      JSON.stringify([
        {
          id: "apple-event-1",
          summary: "Private school pickup",
          location: "Dearham Primary School",
          start: { dateTime: "2026-07-08T15:00:00-07:00" },
        },
      ]),
    );
    const result = await readCalendarConnectorReturn({
      url: `https://example.test/?calendarProvider=apple&calendarEvents=${events}&calendarSourceLabel=Apple%20Calendar`,
      fallbackDestination: fallback,
      now,
    });

    expect(result).not.toBeNull();
    expect(result && "commitments" in result ? result.metadata.authMode : null)
      .toBe("apple-connector");
    expect(result && "commitments" in result ? result.commitments[0]?.source?.provider : null)
      .toBe("apple");
    expect(result && "commitments" in result ? result.commitments[0]?.enabled : true)
      .toBe(false);
    expect(result && "commitments" in result ? result.commitments[0]?.source?.needsLocationReview : false)
      .toBe(true);
  });

  it("can fetch connector payloads by URL", async () => {
    const fetcher = vi.fn(async () =>
      new Response(
        JSON.stringify({
          sourceLabel: "School calendar",
          events: [
            {
              id: "apple-event-2",
              summary: "Practice",
              location: "37.343,-121.917",
              start: { dateTime: "2026-07-08T17:00:00-07:00" },
            },
          ],
        }),
        { status: 200 },
      ),
    );

    const result = await readCalendarConnectorReturn({
      url: "https://example.test/?calendarProvider=apple&calendarPayloadUrl=https%3A%2F%2Fconnector.test%2Fpayload%2F1",
      fallbackDestination: fallback,
      fetcher: fetcher as typeof fetch,
      now,
    });

    expect(fetcher).toHaveBeenCalledWith("https://connector.test/payload/1", {
      headers: { Accept: "application/json" },
    });
    expect(result && "commitments" in result ? result.metadata.sourceLabel : null)
      .toBe("School calendar");
    expect(result && "commitments" in result ? result.commitments[0]?.enabled : false)
      .toBe(true);
  });

  it("removes connector callback parameters from the URL", () => {
    expect(
      calendarConnectorCleanUrl(
        "https://example.test/app?calendarProvider=apple&calendarConnectorStatus=success&x=1#calendarEvents=abc",
      ),
    ).toBe("/app?x=1");
  });
});

function encodePayload(value: string): string {
  return btoa(value).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}
