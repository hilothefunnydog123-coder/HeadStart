import type {
  Place,
  PlaceHistoryEntry,
  PlaceSuggestionDismissal,
  PlaceUsageContext,
  TravelMode,
  Weekday,
} from "./types";

export interface PlaceSuggestion {
  historyId: string;
  place: Place;
  reason: "usual" | "recent" | "favorite";
  label: string;
  useCount: number;
  lastUsedAt: string;
  dismissible?: boolean;
}

const MAX_HISTORY = 30;
const MAX_CONTEXTS_PER_PLACE = 20;
const MAX_DISMISSALS_PER_PLACE = 10;
const TEMP_HIDE_MS = 24 * 60 * 60 * 1000;
const DISMISS_DAYS_TO_SUPPRESS = 3;

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
        suggestionDismissals: [],
      };

  return [entry, ...history.filter((item) => item.id !== id)]
    .sort((a, b) => b.lastUsedAt.localeCompare(a.lastUsedAt))
    .slice(0, MAX_HISTORY);
}

export function suggestPlaces(
  history: PlaceHistoryEntry[],
  context: PlaceUsageContext,
  limit = 4,
  at = new Date(),
): PlaceSuggestion[] {
  return history
    .map((entry) => suggestionForEntry(entry, context, at))
    .filter((suggestion): suggestion is PlaceSuggestion => suggestion !== null)
    .sort((a, b) => {
      const reasonScore = reasonRank(b.reason) - reasonRank(a.reason);
      if (reasonScore !== 0) return reasonScore;
      if (b.useCount !== a.useCount) return b.useCount - a.useCount;
      return b.lastUsedAt.localeCompare(a.lastUsedAt);
    })
    .slice(0, limit);
}

function reasonRank(reason: PlaceSuggestion["reason"]): number {
  if (reason === "favorite") return 2;
  if (reason === "usual") return 1;
  return 0;
}

export function dismissPlaceSuggestion(
  history: PlaceHistoryEntry[],
  historyId: string,
  context: PlaceUsageContext,
  dismissedAt = new Date(),
): PlaceHistoryEntry[] {
  return history.map((entry) => {
    if (entry.id !== historyId) return entry;
    const dateKey = localDateKey(dismissedAt);
    const nextDismissal = dismissalForContext(entry, context);
    const dismissals = entry.suggestionDismissals ?? [];
    const updatedDismissal = nextDismissal
      ? updateDismissal(nextDismissal, dateKey, dismissedAt)
      : createDismissal(context, dateKey, dismissedAt);

    return {
      ...entry,
      suggestionDismissals: [
        updatedDismissal,
        ...dismissals.filter((dismissal) => dismissal !== nextDismissal),
      ].slice(0, MAX_DISMISSALS_PER_PLACE),
    };
  });
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
  at: Date,
): PlaceSuggestion | null {
  if (isDismissedForContext(entry, context, at)) return null;

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

function isDismissedForContext(
  entry: PlaceHistoryEntry,
  context: PlaceUsageContext,
  at: Date,
): boolean {
  const dismissal = dismissalForContext(entry, context);
  if (!dismissal) return false;
  if (dismissal.suppressedAt) return true;
  return new Date(dismissal.hiddenUntil).getTime() > at.getTime();
}

function dismissalForContext(
  entry: PlaceHistoryEntry,
  context: PlaceUsageContext,
): PlaceSuggestionDismissal | undefined {
  return entry.suggestionDismissals?.find((dismissal) =>
    isSimilarDismissalContext(dismissal, context),
  );
}

function createDismissal(
  context: PlaceUsageContext,
  dateKey: string,
  dismissedAt: Date,
): PlaceSuggestionDismissal {
  return {
    kind: context.kind,
    hour: context.hour,
    travelMode: context.travelMode,
    hiddenUntil: hiddenUntil(dismissedAt),
    dismissedDates: [dateKey],
  };
}

function updateDismissal(
  dismissal: PlaceSuggestionDismissal,
  dateKey: string,
  dismissedAt: Date,
): PlaceSuggestionDismissal {
  const dismissedDates = [
    dateKey,
    ...dismissal.dismissedDates.filter((date) => date !== dateKey),
  ];
  return {
    ...dismissal,
    hiddenUntil: hiddenUntil(dismissedAt),
    dismissedDates,
    suppressedAt:
      dismissal.suppressedAt ??
      (dismissedDates.length >= DISMISS_DAYS_TO_SUPPRESS
        ? dismissedAt.toISOString()
        : undefined),
  };
}

function isSimilarDismissalContext(
  dismissal: PlaceSuggestionDismissal,
  context: PlaceUsageContext,
): boolean {
  return (
    dismissal.kind === context.kind &&
    Math.abs(dismissal.hour - context.hour) <= 2 &&
    (!context.travelMode ||
      !dismissal.travelMode ||
      context.travelMode === dismissal.travelMode)
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
    suggestionDismissals: normalizeDismissals(item.suggestionDismissals),
  };
}

function normalizeDismissals(value: unknown): PlaceSuggestionDismissal[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((dismissal) => normalizeDismissal(dismissal))
    .filter(
      (dismissal): dismissal is PlaceSuggestionDismissal => dismissal !== null,
    )
    .slice(0, MAX_DISMISSALS_PER_PLACE);
}

function normalizeDismissal(value: unknown): PlaceSuggestionDismissal | null {
  if (!value || typeof value !== "object") return null;
  const item = value as Partial<PlaceSuggestionDismissal>;
  if (item.kind !== "home" && item.kind !== "destination") return null;
  const hour = Number(item.hour);
  if (!Number.isFinite(hour)) return null;
  const hiddenUntil =
    typeof item.hiddenUntil === "string"
      ? item.hiddenUntil
      : new Date(0).toISOString();
  const dismissedDates = Array.isArray(item.dismissedDates)
    ? item.dismissedDates.filter(
        (date): date is string => typeof date === "string",
      )
    : [];
  return {
    kind: item.kind,
    hour: Math.min(23, Math.max(0, Math.round(hour))),
    travelMode: isTravelMode(item.travelMode) ? item.travelMode : undefined,
    hiddenUntil,
    dismissedDates,
    suppressedAt:
      typeof item.suppressedAt === "string" ? item.suppressedAt : undefined,
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

function hiddenUntil(dismissedAt: Date): string {
  return new Date(dismissedAt.getTime() + TEMP_HIDE_MS).toISOString();
}

function localDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
