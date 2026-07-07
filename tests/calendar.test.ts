import { describe, expect, it } from "vitest";
import {
  mergeCalendarCommitments,
  parseCalendarIcs,
  removeCalendarCommitments,
} from "../src/core/calendar";
import type { Commitment, Place } from "../src/core/types";

const fallback: Place = {
  id: "fallback",
  label: "Default office",
  lat: 37.7946,
  lng: -122.3999,
};

const now = new Date(2026, 6, 7, 8, 0, 0);

describe("parseCalendarIcs", () => {
  it("imports upcoming timed events as one-off commitments", () => {
    const commitments = parseCalendarIcs(
      [
        "BEGIN:VCALENDAR",
        "BEGIN:VEVENT",
        "UID:event-1",
        "SUMMARY:Client meeting",
        "DTSTART;TZID=America/Los_Angeles:20260708T093000",
        "LOCATION:37.8044,-122.2712",
        "END:VEVENT",
        "END:VCALENDAR",
      ].join("\n"),
      "google",
      fallback,
      now,
    );

    expect(commitments).toHaveLength(1);
    expect(commitments[0]?.title).toBe("Client meeting");
    expect(commitments[0]?.arriveByMinutes).toBe(9 * 60 + 30);
    expect(commitments[0]?.oneOffDate).toBe("2026-07-08");
    expect(commitments[0]?.destination.lat).toBe(37.8044);
    expect(commitments[0]?.source?.provider).toBe("google");
  });

  it("imports weekly recurring events using RRULE BYDAY", () => {
    const commitments = parseCalendarIcs(
      [
        "BEGIN:VCALENDAR",
        "BEGIN:VEVENT",
        "UID:standup",
        "SUMMARY:Team standup",
        "DTSTART:20260706T090000",
        "RRULE:FREQ=WEEKLY;BYDAY=MO,WE",
        "END:VEVENT",
        "END:VCALENDAR",
      ].join("\n"),
      "apple",
      fallback,
      now,
    );

    expect(commitments).toHaveLength(1);
    expect(commitments[0]?.days).toEqual([1, 3]);
    expect(commitments[0]?.oneOffDate).toBeUndefined();
    expect(commitments[0]?.source?.needsLocationReview).toBe(true);
  });

  it("skips all-day and cancelled events", () => {
    const commitments = parseCalendarIcs(
      [
        "BEGIN:VCALENDAR",
        "BEGIN:VEVENT",
        "UID:all-day",
        "SUMMARY:Holiday",
        "DTSTART;VALUE=DATE:20260708",
        "END:VEVENT",
        "BEGIN:VEVENT",
        "UID:cancelled",
        "SUMMARY:Cancelled meeting",
        "DTSTART:20260708T110000",
        "STATUS:CANCELLED",
        "END:VEVENT",
        "END:VCALENDAR",
      ].join("\n"),
      "google",
      fallback,
      now,
    );

    expect(commitments).toHaveLength(0);
  });
});

describe("calendar commitment sync", () => {
  it("preserves user edits when the same calendar event is synced again", () => {
    const firstImport = parseCalendarIcs(
      [
        "BEGIN:VCALENDAR",
        "BEGIN:VEVENT",
        "UID:event-1",
        "SUMMARY:Original title",
        "DTSTART:20260708T093000",
        "END:VEVENT",
        "END:VCALENDAR",
      ].join("\n"),
      "google",
      fallback,
      now,
    );
    const editedDestination: Place = {
      id: "custom",
      label: "Customer HQ",
      lat: 37.78,
      lng: -122.41,
    };
    const existing: Commitment[] = [
      {
        ...firstImport[0]!,
        destination: editedDestination,
        travelMode: "transit",
        source: firstImport[0]?.source
          ? { ...firstImport[0].source, needsLocationReview: false }
          : undefined,
      },
    ];

    const secondImport = parseCalendarIcs(
      [
        "BEGIN:VCALENDAR",
        "BEGIN:VEVENT",
        "UID:event-1",
        "SUMMARY:Updated title",
        "DTSTART:20260708T100000",
        "END:VEVENT",
        "END:VCALENDAR",
      ].join("\n"),
      "google",
      fallback,
      now,
    );

    const merged = mergeCalendarCommitments(existing, secondImport, "google");

    expect(merged).toHaveLength(1);
    expect(merged[0]?.title).toBe("Updated title");
    expect(merged[0]?.arriveByMinutes).toBe(10 * 60);
    expect(merged[0]?.destination).toEqual(editedDestination);
    expect(merged[0]?.travelMode).toBe("transit");
    expect(merged[0]?.source?.needsLocationReview).toBe(false);
  });

  it("removes commitments from a disconnected provider", () => {
    const imported = parseCalendarIcs(
      [
        "BEGIN:VCALENDAR",
        "BEGIN:VEVENT",
        "UID:event-1",
        "SUMMARY:Client meeting",
        "DTSTART:20260708T093000",
        "END:VEVENT",
        "END:VCALENDAR",
      ].join("\n"),
      "apple",
      fallback,
      now,
    );

    expect(removeCalendarCommitments(imported, "apple")).toHaveLength(0);
  });
});
