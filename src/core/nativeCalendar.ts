import { calendarApiEventsToCommitments } from "./calendar";
import type { Commitment, Place } from "./types";
import type { NativeCalendarEvent } from "../native/departureNative";

export function nativeCalendarEventsToCommitments(
  events: NativeCalendarEvent[],
  fallbackDestination: Place,
  now = new Date(),
): Commitment[] {
  const physicalEvents = events.filter(
    (event) =>
      !event.allDay &&
      !event.cancelled &&
      !event.remote &&
      Boolean(event.startAt) &&
      Boolean(event.location || hasCoordinates(event)),
  );
  return calendarApiEventsToCommitments(
    physicalEvents.map((event) => ({
      id: event.id,
      summary: event.title,
      status: event.cancelled ? "cancelled" : "confirmed",
      location: hasCoordinates(event)
        ? `${event.latitude},${event.longitude}`
        : event.location,
      start: { dateTime: event.startAt },
    })),
    "device",
    fallbackDestination,
    now,
  );
}

function hasCoordinates(
  event: NativeCalendarEvent,
): event is NativeCalendarEvent & { latitude: number; longitude: number } {
  return (
    typeof event.latitude === "number" &&
    Number.isFinite(event.latitude) &&
    typeof event.longitude === "number" &&
    Number.isFinite(event.longitude)
  );
}
