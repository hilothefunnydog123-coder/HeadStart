import type {
  CalendarConnection,
  CalendarProviderId,
  Commitment,
  Place,
  PlaceHistoryEntry,
  Settings,
} from "../core/types";
import { normalizePlaceHistory } from "../core/placeHistory";

export interface AppState {
  settings: Settings;
  commitments: Commitment[];
  calendarConnections: CalendarConnection[];
  placeHistory: PlaceHistoryEntry[];
}

export const STORAGE_KEY = "smart-departure-alarm/v1";

const LEGACY_DEMO_HOME: Place = {
  id: "home",
  label: "Home — Mission District",
  lat: 37.7599,
  lng: -122.4148,
};

const LEGACY_DEMO_OFFICE: Place = {
  id: "office",
  label: "Office — Financial District",
  lat: 37.7946,
  lng: -122.3999,
};

const CALENDAR_PROVIDERS: CalendarProviderId[] = ["google", "apple"];

export function defaultState(): AppState {
  return {
    settings: {
      home: null,
      campus: null,
      work: null,
      school: null,
      favoriteBuildings: [],
      prepMinutes: 45,
      campusPrepMinutes: 5,
      campusWalkingBufferMinutes: 5,
      defaultStudyMinutes: 180,
      maxStudySessionMinutes: 60,
      targetStudySessions: 3,
      avoidStudyAfterMinutes: 21 * 60,
      semester: {
        holidays: [],
      },
      arrivalBufferMinutes: 10,
      wakeAheadMinutes: 5,
      trafficProvider: "simulated",
      apiKey: "",
      soundEnabled: true,
      notificationsEnabled: false,
      locationTrackingEnabled: false,
    },
    commitments: [],
    calendarConnections: defaultCalendarConnections(),
    placeHistory: [],
  };
}

function isBrowser(): boolean {
  return typeof window !== "undefined" && "localStorage" in window;
}

export function loadState(): AppState {
  if (!isBrowser()) return defaultState();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultState();
    const parsed = JSON.parse(raw) as Partial<AppState>;
    const base = defaultState();
    return {
      settings: normalizeSettings(parsed.settings, base.settings),
      commitments: normalizeCommitments(parsed.commitments, base.commitments),
      calendarConnections: normalizeCalendarConnections(parsed.calendarConnections),
      placeHistory: normalizePlaceHistory(parsed.placeHistory).filter(
        (entry) => !isLegacyDemoHome(entry.place),
      ),
    };
  } catch {
    return defaultState();
  }
}

export function saveState(state: AppState): void {
  if (!isBrowser()) return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Storage full or unavailable (private mode) — non-fatal.
  }
}

/** Small stable id generator that doesn't depend on crypto being present. */
export function makeId(prefix = "id"): string {
  const rand = Math.floor((Date.now() ^ (Math.random() * 1e9)) & 0xffffff);
  return `${prefix}-${rand.toString(36)}`;
}

export function defaultCalendarConnections(): CalendarConnection[] {
  return CALENDAR_PROVIDERS.map((provider) => ({
    provider,
    connected: false,
    eventCount: 0,
  }));
}

function normalizeCalendarConnections(
  value: Partial<CalendarConnection>[] | undefined,
): CalendarConnection[] {
  const incoming = Array.isArray(value) ? value : [];
  return CALENDAR_PROVIDERS.map((provider) => {
    const saved = incoming.find((connection) => connection.provider === provider);
    return {
      provider,
      connected: Boolean(saved?.connected),
      eventCount: Number.isFinite(saved?.eventCount) ? Number(saved?.eventCount) : 0,
      authMode: saved?.authMode,
      lastSyncedAt: saved?.lastSyncedAt,
      sourceLabel: saved?.sourceLabel,
      sourceUrl: saved?.sourceUrl,
      error: saved?.error,
    };
  });
}

function normalizeSettings(
  value: Partial<Settings> | undefined,
  base: Settings,
): Settings {
  const settings = { ...base, ...(value ?? {}) };
  return {
    ...settings,
    home: isLegacyDemoHome(settings.home) ? null : settings.home ?? null,
    campus: isLegacyDemoPlace(settings.campus) ? null : settings.campus ?? null,
    work: isLegacyDemoPlace(settings.work) ? null : settings.work ?? null,
    school: isLegacyDemoPlace(settings.school) ? null : settings.school ?? null,
    favoriteBuildings: Array.isArray(settings.favoriteBuildings)
      ? settings.favoriteBuildings.filter((place) => !isLegacyDemoPlace(place))
      : [],
    campusPrepMinutes: numberOr(settings.campusPrepMinutes, base.campusPrepMinutes),
    campusWalkingBufferMinutes: numberOr(
      settings.campusWalkingBufferMinutes,
      base.campusWalkingBufferMinutes,
    ),
    defaultStudyMinutes: numberOr(
      settings.defaultStudyMinutes,
      base.defaultStudyMinutes,
    ),
    maxStudySessionMinutes: numberOr(
      settings.maxStudySessionMinutes,
      base.maxStudySessionMinutes,
    ),
    targetStudySessions: numberOr(
      settings.targetStudySessions,
      base.targetStudySessions,
    ),
    avoidStudyAfterMinutes: numberOr(
      settings.avoidStudyAfterMinutes,
      base.avoidStudyAfterMinutes,
    ),
    semester: normalizeSemesterSettings(settings.semester, base.semester),
  };
}

function normalizeSemesterSettings(
  value: Settings["semester"] | undefined,
  fallback: Settings["semester"] | undefined,
): Settings["semester"] {
  const semester = { ...(fallback ?? {}), ...(value ?? {}) };
  return {
    startDate: normalizeDate(semester.startDate),
    endDate: normalizeDate(semester.endDate),
    finalsStartDate: normalizeDate(semester.finalsStartDate),
    finalsEndDate: normalizeDate(semester.finalsEndDate),
    holidays: normalizeDateList(semester.holidays),
  };
}

function normalizeCommitments(
  value: Commitment[] | undefined,
  fallback: Commitment[],
): Commitment[] {
  if (!Array.isArray(value)) return fallback;
  return value
    .filter((commitment) => !isLegacyDemoCommitment(commitment))
    .map(normalizeScheduleItem);
}

function normalizeScheduleItem(commitment: Commitment): Commitment {
  const itemType =
    commitment.itemType ??
    (isTestTitle(commitment.title)
      ? "test"
      : commitment.study
        ? "study"
        : "event");
  return {
    ...commitment,
    itemType,
    travelMode: commitment.travelMode ?? "walk",
    originStrategy:
      commitment.originStrategy ??
      (itemType === "class" || itemType === "study" || itemType === "test"
        ? "previous"
        : undefined),
  };
}

function isLegacyDemoCommitment(value: Partial<Commitment>): boolean {
  return (
    isLegacyDemoOffice(value.destination) &&
    (value.id === "standup" ||
      value.title === "Morning standup" ||
      value.destination?.label === LEGACY_DEMO_OFFICE.label)
  );
}

function isLegacyDemoPlace(value: Place | null | undefined): boolean {
  return isLegacyDemoHome(value) || isLegacyDemoOffice(value);
}

function isLegacyDemoHome(value: Place | null | undefined): boolean {
  return (
    hasDemoCoordinates(value, LEGACY_DEMO_HOME) &&
    /^Home\s+[—-]\s+Mission District$/.test(value?.label ?? "")
  );
}

function isLegacyDemoOffice(value: Place | null | undefined): boolean {
  return value?.label === LEGACY_DEMO_OFFICE.label;
}

function hasDemoCoordinates(
  value: Place | null | undefined,
  demoPlace: Place,
): boolean {
  return (
    Boolean(value) &&
    Math.abs((value?.lat ?? 0) - demoPlace.lat) < 0.00001 &&
    Math.abs((value?.lng ?? 0) - demoPlace.lng) < 0.00001
  );
}

function numberOr(value: number | undefined, fallback: number | undefined): number {
  return Number.isFinite(value) ? Number(value) : Number(fallback ?? 0);
}

function normalizeDate(value: string | undefined): string | undefined {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? value
    : undefined;
}

function normalizeDateList(value: string[] | undefined): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map(normalizeDate).filter(Boolean) as string[])].sort();
}

function isTestTitle(title: string): boolean {
  return /\b(test|quiz|exam|midterm|final)\b/i.test(title);
}
