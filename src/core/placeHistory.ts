import type {
  Place,
  PlaceHistoryEntry,
  PlaceUsageContext,
  TravelMode,
  Weekday,
} from "./types";

export interface PlaceSuggestion {
  historyId: string;
  place: Place;
  reason: "usual" | "recent";
  label: string;
  useCount: number;
  lastUsedAt: string;
}

const MAX_HISTORY = 30;
const MAX_CONTEXTS_PER_PLACE = 20;

export function rememberPlaceUsage(
  history: PlaceHistoryEntry[],
  place: Place,
  context: PlaceUsageContext,
  usedAt = new Date(),
): PlaceHistoryEntry[] {
  if (!isUsefulPlace(place)) return history;

  const id = placeHistoryId(place);
  const existing = history.find((entry) => entry.id === id);
  const entry: PlaceHistoryEntry = existing
    ? {
        ...existing,
        place: { ...existing.place, label: place.label, lat: place.lat, lng: place.lng },
        useCount: existing.useCount + 1,
        lastUsedAt: usedAt.toISOString(),
        contexts: [context, ...existing.contexts].slice(0, MAX_CONTEXTS_PER_PLACE),
      }
    : {
        id,
        place,
        useCount: 1,
        lastUsedAt: usedAt.toISOString(),
        contexts: [context],
      };

  return [entry, ...history.filter((item) => item.id !== id)]
    .sort((a, b) => b.lastUsedAt.localeCompare(a.lastUsedAt))
    .slice(0, MAX_HISTORY);
}

export function suggestPlaces(
  history: PlaceHistoryEntry[],
  context: PlaceUsageContext,
  limit = 4,
): PlaceSuggestion[] {
  return history
    .map((entry) => suggestionForEntry(entry, context))
    .filter((suggestion): suggestion is PlaceSuggestion => suggestion !== null)
    .sort((a, b) => {
      const reasonScore =
        (b.reason === "usual" ? 1 : 0) - (a.reason === "usual" ? 1 : 0);
      if (reasonScore !== 0) return reasonScore;
      if (b.useCount !== a.useCount) return b.useCount - a.useCount;
      return b.lastUsedAt.localeCompare(a.lastUsedAt);
    })
    .slice(0, limit);
}

export function forgetPlaceHistoryEntry(
  history: PlaceHistoryEntry[],
  historyId: string,
): PlaceHistoryEntry[] {
  return history.filter((entry) => entry.id !== historyId);
}

export function normalizePlaceHistory(value: unknown): PlaceHistoryEntry[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => normalizeEntry(entry))
    .filter((entry): entry is PlaceHistoryEntry => entry !== null)
    .slice(0, MAX_HISTORY);
}

function suggestionForEntry(
  entry: PlaceHistoryEntry,
  context: PlaceUsageContext,
): PlaceSuggestion | null {
  const matchingContexts = entry.contexts.filter((item) =>
    isSimilarContext(item, context),
  );

  if (entry.useCount >= 3 && matchingContexts.length >= 2) {
    return {
      historyId: entry.id,
      place: entry.place,
      reason: "usual",
      label: "Usually around now",
      useCount: entry.useCount,
      lastUsedAt: entry.lastUsedAt,
    };
  }

  if (entry.contexts.some((item) => item.kind === context.kind)) {
    return {
      historyId: entry.id,
      place: entry.place,
      reason: "recent",
      label: "Recent",
      useCount: entry.useCount,
      lastUsedAt: entry.lastUsedAt,
    };
  }

  return null;
}

function isSimilarContext(
  saved: PlaceUsageContext,
  current: PlaceUsageContext,
): boolean {
  return (
    saved.kind === current.kind &&
    saved.weekday === current.weekday &&
    Math.abs(saved.hour - current.hour) <= 2 &&
    (!current.travelMode || !saved.travelMode || current.travelMode === saved.travelMode)
  );
}

function normalizeEntry(value: unknown): PlaceHistoryEntry | null {
  if (!value || typeof value !== "object") return null;
  const item = value as Partial<PlaceHistoryEntry>;
  const place = item.place;
  if (!place || !isUsefulPlace(place)) return null;
  const contexts = Array.isArray(item.contexts)
    ? item.contexts
        .map((context) => normalizeContext(context))
        .filter((context): context is PlaceUsageContext => context !== null)
    : [];
  return {
    id: typeof item.id === "string" ? item.id : placeHistoryId(place),
    place,
    useCount: Number.isFinite(item.useCount) ? Number(item.useCount) : 1,
    lastUsedAt:
      typeof item.lastUsedAt === "string"
        ? item.lastUsedAt
        : new Date(0).toISOString(),
    contexts: contexts.slice(0, MAX_CONTEXTS_PER_PLACE),
  };
}

function normalizeContext(value: unknown): PlaceUsageContext | null {
  if (!value || typeof value !== "object") return null;
  const item = value as Partial<PlaceUsageContext>;
  if (item.kind !== "home" && item.kind !== "destination") return null;
  const weekday = Number(item.weekday);
  const hour = Number(item.hour);
  if (!isWeekday(weekday) || !Number.isFinite(hour)) return null;
  const travelMode = isTravelMode(item.travelMode) ? item.travelMode : undefined;
  return {
    kind: item.kind,
    weekday,
    hour: Math.min(23, Math.max(0, Math.round(hour))),
    travelMode,
  };
}

function isWeekday(value: number): value is Weekday {
  return Number.isInteger(value) && value >= 0 && value <= 6;
}

function isTravelMode(value: unknown): value is TravelMode {
  return value === "drive" || value === "transit" || value === "walk" || value === "cycle";
}

function isUsefulPlace(place: Place): boolean {
  return (
    typeof place.label === "string" &&
    place.label.trim().length > 0 &&
    Number.isFinite(place.lat) &&
    Number.isFinite(place.lng)
  );
}

function placeHistoryId(place: Place): string {
  const lat = place.lat.toFixed(5);
  const lng = place.lng.toFixed(5);
  return `place-${lat},${lng}`;
}
