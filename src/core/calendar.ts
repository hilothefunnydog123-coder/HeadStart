import { isoDate, nextOccurrence } from "./time";
import type {
  CalendarProviderId,
  Commitment,
  Place,
  TravelMode,
  Weekday,
} from "./types";

const MAX_IMPORTED_EVENTS = 50;
const DEFAULT_TRAVEL_MODE: TravelMode = "drive";
const ALL_DAYS: Weekday[] = [0, 1, 2, 3, 4, 5, 6];

const DAY_CODE_TO_WEEKDAY: Record<string, Weekday> = {
  SU: 0,
  MO: 1,
  TU: 2,
  WE: 3,
  TH: 4,
  FR: 5,
  SA: 6,
};

interface IcsProperty {
  name: string;
  params: Record<string, string>;
  value: string;
}

interface ParsedIcsDate {
  date: Date;
  allDay: boolean;
}

interface RawCalendarEvent {
  uid?: string;
  summary?: string;
  location?: string;
  geo?: string;
  start?: ParsedIcsDate;
  rrule?: string;
  status?: string;
}

export interface GoogleCalendarEvent {
  id?: string;
  iCalUID?: string;
  summary?: string;
  location?: string;
  status?: string;
  start?: {
    date?: string;
    dateTime?: string;
    timeZone?: string;
  };
}

interface Coordinates {
  lat: number;
  lng: number;
}

export function parseCalendarIcs(
  content: string,
  provider: CalendarProviderId,
  fallbackDestination: Place,
  now = new Date(),
): Commitment[] {
  const importedAt = now.toISOString();
  const commitments = readEvents(content)
    .map((event, index) =>
      eventToCommitment(event, provider, fallbackDestination, importedAt, now, index),
    )
    .filter((commitment): commitment is Commitment => commitment !== null)
    .sort((a, b) => {
      const aNext = nextOccurrence(a, now)?.getTime() ?? Number.MAX_SAFE_INTEGER;
      const bNext = nextOccurrence(b, now)?.getTime() ?? Number.MAX_SAFE_INTEGER;
      return aNext - bNext;
    });

  return commitments.slice(0, MAX_IMPORTED_EVENTS);
}

export function googleCalendarEventsToCommitments(
  events: GoogleCalendarEvent[],
  fallbackDestination: Place,
  now = new Date(),
): Commitment[] {
  const importedAt = now.toISOString();
  const commitments = events
    .map((event, index) => googleEventToRawEvent(event, index))
    .map((event, index) =>
      eventToCommitment(event, "google", fallbackDestination, importedAt, now, index),
    )
    .filter((commitment): commitment is Commitment => commitment !== null)
    .sort((a, b) => {
      const aNext = nextOccurrence(a, now)?.getTime() ?? Number.MAX_SAFE_INTEGER;
      const bNext = nextOccurrence(b, now)?.getTime() ?? Number.MAX_SAFE_INTEGER;
      return aNext - bNext;
    });

  return commitments.slice(0, MAX_IMPORTED_EVENTS);
}

export function mergeCalendarCommitments(
  existing: Commitment[],
  imported: Commitment[],
  provider: CalendarProviderId,
): Commitment[] {
  const previousByExternalId = new Map<string, Commitment>();
  for (const commitment of existing) {
    if (commitment.source?.kind === "calendar" && commitment.source.provider === provider) {
      previousByExternalId.set(commitment.source.externalId, commitment);
    }
  }

  const untouched = existing.filter(
    (commitment) =>
      commitment.source?.kind !== "calendar" || commitment.source.provider !== provider,
  );

  const merged = imported.map((incoming) => {
    const externalId = incoming.source?.externalId;
    const previous = externalId ? previousByExternalId.get(externalId) : undefined;
    if (!previous) return incoming;

    return {
      ...incoming,
      id: previous.id,
      destination: previous.destination,
      travelMode: previous.travelMode,
      enabled: previous.enabled,
      prepMinutesOverride: previous.prepMinutesOverride,
      source: incoming.source
        ? {
            ...incoming.source,
            needsLocationReview:
              incoming.source.needsLocationReview && previous.source?.needsLocationReview,
          }
        : incoming.source,
    };
  });

  return [...untouched, ...merged];
}

export function removeCalendarCommitments(
  commitments: Commitment[],
  provider: CalendarProviderId,
): Commitment[] {
  return commitments.filter(
    (commitment) =>
      commitment.source?.kind !== "calendar" || commitment.source.provider !== provider,
  );
}

function googleEventToRawEvent(
  event: GoogleCalendarEvent,
  index: number,
): RawCalendarEvent {
  const start = googleEventStart(event);
  return {
    uid: event.id || event.iCalUID || `google-${index}`,
    summary: event.summary,
    location: event.location,
    status: event.status,
    start,
  };
}

function googleEventStart(event: GoogleCalendarEvent): ParsedIcsDate | undefined {
  if (event.start?.dateTime) {
    const date = new Date(event.start.dateTime);
    return Number.isNaN(date.getTime()) ? undefined : { date, allDay: false };
  }

  if (event.start?.date) {
    const [year, month, day] = event.start.date.split("-").map(Number);
    if (!year || !month || !day) return undefined;
    const date = new Date(year, month - 1, day);
    return Number.isNaN(date.getTime()) ? undefined : { date, allDay: true };
  }

  return undefined;
}

function eventToCommitment(
  event: RawCalendarEvent,
  provider: CalendarProviderId,
  fallbackDestination: Place,
  importedAt: string,
  now: Date,
  index: number,
): Commitment | null {
  if (!event.start || event.start.allDay) return null;
  if (event.status?.toUpperCase() === "CANCELLED") return null;
  if (event.rrule && rruleExpired(event.rrule, now)) return null;

  const recurrenceDays = event.rrule ? parseRecurrenceDays(event.rrule, event.start.date) : null;
  const days = recurrenceDays ?? [];
  const title = event.summary?.trim() || "Calendar event";
  const externalId = event.uid || `${provider}-${event.start.date.toISOString()}-${index}`;
  const destinationInfo = destinationFromEvent(
    event,
    provider,
    externalId,
    fallbackDestination,
  );

  const commitment: Commitment = {
    id: `cal-${provider}-${stableIdPart(externalId)}`,
    title,
    destination: destinationInfo.destination,
    travelMode: DEFAULT_TRAVEL_MODE,
    arriveByMinutes: event.start.date.getHours() * 60 + event.start.date.getMinutes(),
    days,
    oneOffDate: days.length > 0 ? undefined : isoDate(event.start.date),
    enabled: true,
    source: {
      kind: "calendar",
      provider,
      externalId,
      importedAt,
      originalLocation: event.location,
      needsLocationReview: destinationInfo.needsLocationReview,
    },
  };

  return nextOccurrence(commitment, now) ? commitment : null;
}

function readEvents(content: string): RawCalendarEvent[] {
  const events: RawCalendarEvent[] = [];
  let inEvent = false;
  let props: IcsProperty[] = [];

  for (const line of unfoldIcsLines(content)) {
    const upper = line.toUpperCase();
    if (upper === "BEGIN:VEVENT") {
      inEvent = true;
      props = [];
      continue;
    }
    if (upper === "END:VEVENT") {
      if (inEvent) events.push(rawEventFromProps(props));
      inEvent = false;
      props = [];
      continue;
    }
    if (!inEvent) continue;

    const prop = parseProperty(line);
    if (prop) props.push(prop);
  }

  return events;
}

function rawEventFromProps(props: IcsProperty[]): RawCalendarEvent {
  const event: RawCalendarEvent = {};

  for (const prop of props) {
    switch (prop.name) {
      case "UID":
        event.uid = cleanText(prop.value);
        break;
      case "SUMMARY":
        event.summary = cleanText(prop.value);
        break;
      case "LOCATION":
        event.location = cleanText(prop.value);
        break;
      case "GEO":
        event.geo = prop.value.trim();
        break;
      case "DTSTART":
        event.start = parseIcsDate(prop);
        break;
      case "RRULE":
        event.rrule = prop.value.trim();
        break;
      case "STATUS":
        event.status = prop.value.trim();
        break;
    }
  }

  return event;
}

function unfoldIcsLines(content: string): string[] {
  const unfolded: string[] = [];
  for (const rawLine of content.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n")) {
    if (/^[ \t]/.test(rawLine) && unfolded.length > 0) {
      const previous = unfolded[unfolded.length - 1] ?? "";
      unfolded[unfolded.length - 1] = previous + rawLine.slice(1);
    } else {
      unfolded.push(rawLine.trimEnd());
    }
  }
  return unfolded.filter(Boolean);
}

function parseProperty(line: string): IcsProperty | null {
  const separator = line.indexOf(":");
  if (separator === -1) return null;

  const head = line.slice(0, separator);
  const value = line.slice(separator + 1);
  const [rawName, ...rawParams] = head.split(";");
  if (!rawName) return null;

  const params: Record<string, string> = {};
  for (const rawParam of rawParams) {
    const equals = rawParam.indexOf("=");
    if (equals === -1) continue;
    const key = rawParam.slice(0, equals).toUpperCase();
    const paramValue = rawParam.slice(equals + 1).replace(/^"|"$/g, "");
    params[key] = paramValue;
  }

  return {
    name: rawName.toUpperCase(),
    params,
    value,
  };
}

function parseIcsDate(prop: IcsProperty): ParsedIcsDate | undefined {
  const value = prop.value.trim();
  if (prop.params.VALUE?.toUpperCase() === "DATE" || /^\d{8}$/.test(value)) {
    const year = Number(value.slice(0, 4));
    const month = Number(value.slice(4, 6));
    const day = Number(value.slice(6, 8));
    const date = new Date(year, month - 1, day);
    return Number.isNaN(date.getTime()) ? undefined : { date, allDay: true };
  }

  const match = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})?(Z)?$/.exec(value);
  if (!match) return undefined;

  const year = Number(match[1] ?? "");
  const month = Number(match[2] ?? "");
  const day = Number(match[3] ?? "");
  const hour = Number(match[4] ?? "");
  const minute = Number(match[5] ?? "");
  const second = Number(match[6] ?? "0");
  const isUtc = match[7] === "Z";

  const date = isUtc
    ? new Date(Date.UTC(year, month - 1, day, hour, minute, second))
    : new Date(year, month - 1, day, hour, minute, second);

  return Number.isNaN(date.getTime()) ? undefined : { date, allDay: false };
}

function parseRecurrenceDays(rrule: string, start: Date): Weekday[] | null {
  const fields = parseRRuleFields(rrule);
  const freq = fields.get("FREQ");
  if (freq === "DAILY") return ALL_DAYS;
  if (freq !== "WEEKLY") return null;

  const byDay = fields.get("BYDAY");
  if (!byDay) return [start.getDay() as Weekday];

  const days = byDay
    .split(",")
    .map((dayCode) => DAY_CODE_TO_WEEKDAY[dayCode.replace(/^\d+/, "").toUpperCase()])
    .filter((day): day is Weekday => day !== undefined);

  return [...new Set(days)].sort((a, b) => a - b);
}

function rruleExpired(rrule: string, now: Date): boolean {
  const until = parseRRuleFields(rrule).get("UNTIL");
  if (!until) return false;
  const parsed = parseIcsDate({ name: "UNTIL", params: {}, value: until });
  return parsed ? parsed.date.getTime() < now.getTime() : false;
}

function parseRRuleFields(rrule: string): Map<string, string> {
  const fields = new Map<string, string>();
  for (const part of rrule.split(";")) {
    const equals = part.indexOf("=");
    if (equals === -1) continue;
    const key = part.slice(0, equals).toUpperCase();
    const value = part.slice(equals + 1).toUpperCase();
    fields.set(key, value);
  }
  return fields;
}

function destinationFromEvent(
  event: RawCalendarEvent,
  provider: CalendarProviderId,
  externalId: string,
  fallbackDestination: Place,
): { destination: Place; needsLocationReview: boolean } {
  const location = event.location?.trim();
  const coords = parseCoordinates(event.geo) ?? parseCoordinates(location);

  return {
    destination: {
      id: `place-${provider}-${stableIdPart(externalId)}`,
      label: location || fallbackDestination.label,
      lat: coords?.lat ?? fallbackDestination.lat,
      lng: coords?.lng ?? fallbackDestination.lng,
    },
    needsLocationReview: !coords,
  };
}

function parseCoordinates(value: string | undefined): Coordinates | null {
  if (!value) return null;
  const match = /(-?\d+(?:\.\d+)?)\s*[,;]\s*(-?\d+(?:\.\d+)?)/.exec(value);
  if (!match) return null;

  const lat = Number(match[1] ?? "");
  const lng = Number(match[2] ?? "");
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return { lat, lng };
}

function cleanText(value: string): string {
  return value
    .replace(/\\n/gi, " ")
    .replace(/\\,/g, ",")
    .replace(/\\;/g, ";")
    .replace(/\\\\/g, "\\")
    .trim();
}

function stableIdPart(value: string): string {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) | 0;
  }
  return Math.abs(hash).toString(36);
}
