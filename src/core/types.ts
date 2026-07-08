/**
 * Core domain types for HeadStart, the student schedule assistant.
 *
 * The app answers one question: "Given my next class, test, study block, or
 * campus event, what do I need to do next to arrive prepared and on time?"
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
  suggestionDismissals?: PlaceSuggestionDismissal[];
}

export interface PlaceUsageContext {
  kind: "home" | "destination";
  weekday: Weekday;
  hour: number;
  travelMode?: TravelMode;
}

/** User feedback that a learned place should be hidden for a time context. */
export interface PlaceSuggestionDismissal {
  kind: PlaceUsageContext["kind"];
  hour: number;
  travelMode?: TravelMode;
  hiddenUntil: string;
  dismissedDates: string[];
  suppressedAt?: string;
}

/** Calendar providers the app can import as schedule sources. */
export type CalendarProviderId = "google" | "apple";

/** Calendar import status persisted with the rest of the local app state. */
export interface CalendarConnection {
  provider: CalendarProviderId;
  connected: boolean;
  eventCount: number;
  authMode?: "google-oauth" | "apple-connector" | "file-upload" | "ics-url";
  lastSyncedAt?: string;
  sourceLabel?: string;
  sourceUrl?: string;
  error?: string;
}

/** How the student intends to travel to their next campus item. */
export type TravelMode = "drive" | "transit" | "walk" | "cycle";

export type ScheduleItemType = "class" | "event" | "test" | "study";
export type StudyStatus = "planned" | "done" | "skipped";
export type TestDifficulty = "light" | "standard" | "heavy";
export type OriginStrategy = "home" | "campus" | "previous" | "current";

export interface SemesterSettings {
  startDate?: string;
  endDate?: string;
  finalsStartDate?: string;
  finalsEndDate?: string;
  holidays?: string[];
}

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
  /** Student-facing item type. Legacy records default to "event". */
  itemType?: ScheduleItemType;
  /** Optional course label, e.g. BIO 101. */
  courseId?: string;
  /** Optional room within the destination building. */
  room?: string;
  /** Human building name, kept separate from the full mappable place label. */
  buildingName?: string;
  campusId?: string;
  /** How the app should choose the starting point for this item. */
  originStrategy?: OriginStrategy;
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
  test?: {
    relatedClassId?: string;
    testDate: string;
    targetStudyMinutes: number;
    difficulty: TestDifficulty;
  };
  study?: {
    relatedTestId: string;
    relatedClassId?: string;
    testTitle?: string;
    testDate?: string;
    plannedMinutes: number;
    status: StudyStatus;
  };
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
  /** Where the student departs from before the first class of the day. */
  home: Place | null;
  /** Optional campus anchor for hybrid campus search and "already on campus". */
  campus?: Place | null;
  /** Optional saved destination shortcuts chosen explicitly by the user. */
  work?: Place | null;
  school?: Place | null;
  favoriteBuildings?: Place[];
  /** Minutes from waking to walking out for the first morning class. */
  prepMinutes: number;
  /** Minutes needed before leaving for normal between-class movement. */
  campusPrepMinutes?: number;
  /** Extra walking cushion for campus transitions. */
  campusWalkingBufferMinutes?: number;
  /** Default total study time when planning a test. */
  defaultStudyMinutes?: number;
  /** Maximum generated study block length. */
  maxStudySessionMinutes?: number;
  /** Preferred number of generated study sessions for a new test. */
  targetStudySessions?: number;
  /** Latest time of day the planner should start a study block. */
  avoidStudyAfterMinutes?: number;
  /** Academic calendar used to hide weekly classes during breaks/finals. */
  semester?: SemesterSettings;
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
  origin: Place;
  originLabel: string;
  previousCommitment?: Commitment;
  previousArriveBy?: Date;
  isFirstClassOfDay: boolean;
  usesWake: boolean;
  gapMinutes?: number;
  impossibleTransition?: boolean;
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
  /** Whole minutes from `now` until the schedule item starts. */
  minutesUntilArrive: number;
}
