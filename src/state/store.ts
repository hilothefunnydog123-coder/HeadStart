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
      work: null,
      school: null,
      prepMinutes: 45,
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

export function stateStorageKey(ownerId?: string): string {
  return ownerId ? `${STORAGE_KEY}/users/${ownerId}` : STORAGE_KEY;
}

export function hasSavedState(ownerId?: string): boolean {
  if (!isBrowser()) return false;
  return window.localStorage.getItem(stateStorageKey(ownerId)) !== null;
}

export function loadState(ownerId?: string): AppState {
  if (!isBrowser()) return defaultState();
  try {
    const raw = window.localStorage.getItem(stateStorageKey(ownerId));
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

export function saveState(state: AppState, ownerId?: string): void {
  if (!isBrowser()) return;
  try {
    window.localStorage.setItem(stateStorageKey(ownerId), JSON.stringify(state));
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
    work: isLegacyDemoPlace(settings.work) ? null : settings.work ?? null,
    school: isLegacyDemoPlace(settings.school) ? null : settings.school ?? null,
  };
}

function normalizeCommitments(
  value: Commitment[] | undefined,
  fallback: Commitment[],
): Commitment[] {
  if (!Array.isArray(value)) return fallback;
  return value.filter((commitment) => !isLegacyDemoCommitment(commitment));
}

function isLegacyDemoCommitment(value: Partial<Commitment>): boolean {
  return (
    value.id === "standup" &&
    value.title === "Morning standup" &&
    isSameDemoPlace(value.destination, LEGACY_DEMO_OFFICE)
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
  return isSameDemoPlace(value, LEGACY_DEMO_OFFICE);
}

function isSameDemoPlace(
  value: Place | null | undefined,
  demoPlace: Place,
): boolean {
  return (
    hasDemoCoordinates(value, demoPlace) &&
    value?.id === demoPlace.id &&
    value.label === demoPlace.label
  );
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
