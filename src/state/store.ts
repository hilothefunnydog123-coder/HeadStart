import type { Commitment, Place, Settings } from "../core/types";

export interface AppState {
  settings: Settings;
  commitments: Commitment[];
}

const STORAGE_KEY = "smart-departure-alarm/v1";

// A believable default so the app is alive on first launch: home in the
// Mission, an 9am standup downtown, Mon–Fri.
const DEMO_HOME: Place = {
  id: "home",
  label: "Home — Mission District",
  lat: 37.7599,
  lng: -122.4148,
};

const DEMO_OFFICE: Place = {
  id: "office",
  label: "Office — Financial District",
  lat: 37.7946,
  lng: -122.3999,
};

export function defaultState(): AppState {
  return {
    settings: {
      home: DEMO_HOME,
      prepMinutes: 45,
      arrivalBufferMinutes: 10,
      wakeAheadMinutes: 5,
      trafficProvider: "simulated",
      apiKey: "",
      soundEnabled: true,
    },
    commitments: [
      {
        id: "standup",
        title: "Morning standup",
        destination: DEMO_OFFICE,
        travelMode: "drive",
        arriveByMinutes: 9 * 60, // 09:00
        days: [1, 2, 3, 4, 5],
        enabled: true,
      },
    ],
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
      settings: { ...base.settings, ...parsed.settings },
      commitments: Array.isArray(parsed.commitments)
        ? parsed.commitments
        : base.commitments,
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
