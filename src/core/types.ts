/**
 * Core domain types for the Smart Departure Alarm.
 *
 * The app answers one question: "Given my first commitment of the day, and how
 * long it will actually take to get there right now, when do I need to wake up
 * and when do I need to leave?"
 */

/** A geographic point plus a human label. */
export interface Place {
  id: string;
  label: string;
  lat: number;
  lng: number;
}

/** A saved place the user has actually chosen, used for local suggestions. */
export interface PlaceHistoryEntry {
  id: string;
  place: Place;
  useCount: number;
  lastUsedAt: string;
  contexts: PlaceUsageContext[];
}

export interface PlaceUsageContext {
  kind: "home" | "destination";
  weekday: Weekday;
  hour: number;
  travelMode?: TravelMode;
}

/** Calendar providers the app can import as first-commitment sources. */
export type CalendarProviderId = "google" | "apple";

/** Calendar import status persisted with the rest of the local app state. */
export interface CalendarConnection {
  provider: CalendarProviderId;
  connected: boolean;
  eventCount: number;
  authMode?: "google-oauth" | "file-upload" | "ics-url";
  lastSyncedAt?: string;
  sourceLabel?: string;
  sourceUrl?: string;
  clientId?: string;
  error?: string;
}

/** How the user intends to travel to their commitment. */
export type TravelMode = "drive" | "transit" | "walk" | "cycle";

/**
 * Days of the week a commitment recurs on. 0 = Sunday ... 6 = Saturday,
 * matching `Date.prototype.getDay()`.
 */
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

/**
 * A commitment the user needs to arrive at. Recurs weekly on the given
 * weekdays (e.g. a 9am standup Mon–Fri), or is a one-off if `days` is empty
 * and `oneOffDate` is set.
 */
export interface Commitment {
  id: string;
  title: string;
  destination: Place;
  travelMode: TravelMode;
  /** Target arrival, minutes-from-midnight in local time (e.g. 9:00 => 540). */
  arriveByMinutes: number;
  /** Weekdays this commitment recurs on. Empty => one-off (see oneOffDate). */
  days: Weekday[];
  /** ISO date (YYYY-MM-DD) for a one-off commitment. Ignored when days is set. */
  oneOffDate?: string;
  /** Optional per-commitment override of the global prep time, in minutes. */
  prepMinutesOverride?: number;
  enabled: boolean;
  source?: {
    kind: "calendar";
    provider: CalendarProviderId;
    externalId: string;
    importedAt: string;
    originalLocation?: string;
    needsLocationReview?: boolean;
  };
}

/** Global user preferences shared across commitments. */
export interface Settings {
  /** Where the user departs from. */
  home: Place | null;
  /** Minutes from waking to walking out the door (shower, coffee, dress...). */
  prepMinutes: number;
  /** Extra minutes the user wants to arrive early, as a safety buffer. */
  arrivalBufferMinutes: number;
  /** How long before departure the app should also let the user snooze/prep. */
  wakeAheadMinutes: number;
  trafficProvider: string;
  /** Optional API key for a real routing provider (e.g. Google). */
  apiKey?: string;
  /** Sound the alarm when the wake time is reached. */
  soundEnabled: boolean;
  /** Show browser/PWA notifications for wake and leave moments. */
  notificationsEnabled: boolean;
  /** Use browser location while the app is open to detect missed departures. */
  locationTrackingEnabled: boolean;
}

/** A traffic-aware travel-time estimate for one leg. */
export interface TravelEstimate {
  /** Duration in traffic, seconds. */
  durationSeconds: number;
  /** Free-flow duration with no congestion, seconds. */
  freeFlowSeconds: number;
  /** Straight-line-derived distance, meters. */
  distanceMeters: number;
  /** 1.0 = free flowing, >1 = congested. durationSeconds / freeFlowSeconds. */
  congestion: number;
  /** Provider that produced the estimate. */
  source: string;
}

export type PlanPhase =
  | "no-commitment"
  | "no-home"
  | "sleep"
  | "wake"
  | "prep"
  | "leave"
  | "enroute";

/**
 * A fully-resolved plan for the next commitment: when to wake, when to leave,
 * and where the user currently sits on that timeline.
 */
export interface DeparturePlan {
  commitment: Commitment;
  estimate: TravelEstimate;
  /** Instant the commitment is due (arrival target). */
  arriveBy: Date;
  /** Latest instant the user can leave and still arrive on time (with buffer). */
  leaveBy: Date;
  /** Latest instant the user can wake and still leave on time. */
  wakeBy: Date;
  /** Current phase of the user's morning. */
  phase: PlanPhase;
  /** Whole minutes from `now` until leaveBy (negative if already past). */
  minutesUntilLeave: number;
  /** Whole minutes from `now` until wakeBy (negative if already past). */
  minutesUntilWake: number;
}
