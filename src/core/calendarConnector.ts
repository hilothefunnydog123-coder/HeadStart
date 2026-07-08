import {
  calendarApiEventsToCommitments,
  parseCalendarIcs,
  type GoogleCalendarEvent,
} from "./calendar";
import type {
  CalendarConnection,
  CalendarProviderId,
  Commitment,
  Place,
} from "./types";

const CONNECTOR_KEYS = [
  "calendarProvider",
  "calendarConnectorStatus",
  "calendarConnectorError",
  "calendarEvents",
  "calendarIcs",
  "calendarPayloadUrl",
  "calendarSourceLabel",
  "calendarSourceUrl",
];

export interface CalendarConnectorImport {
  provider: CalendarProviderId;
  commitments: Commitment[];
  metadata: {
    sourceLabel: string;
    sourceUrl?: string;
    authMode: CalendarConnection["authMode"];
  };
}

export interface CalendarConnectorFailure {
  provider: CalendarProviderId;
  message: string;
}

interface RemoteConnectorPayload {
  events?: GoogleCalendarEvent[];
  ics?: string;
  sourceLabel?: string;
  sourceUrl?: string;
}

export async function readCalendarConnectorReturn({
  url,
  fallbackDestination,
  fetcher = fetch,
  now = new Date(),
}: {
  url: string;
  fallbackDestination: Place;
  fetcher?: typeof fetch;
  now?: Date;
}): Promise<CalendarConnectorImport | CalendarConnectorFailure | null> {
  const parsed = new URL(url);
  const params = connectorParams(parsed);
  const provider = parseProvider(params.get("calendarProvider"));
  if (!provider) return null;

  const error =
    params.get("calendarConnectorError") ||
    (params.get("calendarConnectorStatus") === "error"
      ? "Calendar connector could not finish."
      : "");
  if (error) return { provider, message: error };

  const remote = await remotePayload(params.get("calendarPayloadUrl"), fetcher);
  const sourceLabel =
    params.get("calendarSourceLabel") ||
    remote?.sourceLabel ||
    `${providerLabel(provider)} connector`;
  const sourceUrl = params.get("calendarSourceUrl") || remote?.sourceUrl;
  const events = remote?.events ?? decodedEvents(params.get("calendarEvents"));
  const ics = remote?.ics ?? decodedText(params.get("calendarIcs"));
  const commitments = events
    ? calendarApiEventsToCommitments(events, provider, fallbackDestination, now)
    : ics
      ? parseCalendarIcs(ics, provider, fallbackDestination, now)
      : [];

  if (commitments.length === 0) {
    return { provider, message: "No upcoming timed events were returned." };
  }

  return {
    provider,
    commitments,
    metadata: {
      sourceLabel,
      sourceUrl,
      authMode: provider === "apple" ? "apple-connector" : "google-oauth",
    },
  };
}

export function calendarConnectorCleanUrl(url: string): string {
  const parsed = new URL(url);
  removeConnectorKeys(parsed.searchParams);
  if (parsed.hash) {
    const hash = parsed.hash.slice(1);
    const marker = hash.includes("?") ? "?" : "";
    const [path, query = ""] = marker ? hash.split("?") : ["", hash];
    const params = new URLSearchParams(query);
    removeConnectorKeys(params);
    const nextHash = marker
      ? `${path}${params.toString() ? `?${params}` : ""}`
      : params.toString();
    parsed.hash = nextHash ? `#${nextHash}` : "";
  }
  return `${parsed.pathname}${parsed.search}${parsed.hash}`;
}

function connectorParams(url: URL): URLSearchParams {
  const params = new URLSearchParams(url.search);
  if (!url.hash) return params;

  const hash = url.hash.slice(1);
  const query = hash.includes("?") ? hash.split("?")[1] : hash;
  for (const [key, value] of new URLSearchParams(query)) {
    if (!params.has(key)) params.set(key, value);
  }
  return params;
}

function parseProvider(value: string | null): CalendarProviderId | null {
  return value === "google" || value === "apple" ? value : null;
}

async function remotePayload(
  payloadUrl: string | null,
  fetcher: typeof fetch,
): Promise<RemoteConnectorPayload | null> {
  if (!payloadUrl) return null;
  const response = await fetcher(payloadUrl, {
    headers: { Accept: "application/json" },
  });
  if (!response.ok) {
    throw new Error(`Calendar connector returned ${response.status}.`);
  }
  return (await response.json()) as RemoteConnectorPayload;
}

function decodedEvents(value: string | null): GoogleCalendarEvent[] | null {
  const text = decodedText(value);
  if (!text) return null;
  const parsed = JSON.parse(text) as unknown;
  return Array.isArray(parsed) ? (parsed as GoogleCalendarEvent[]) : null;
}

function decodedText(value: string | null): string | null {
  if (!value) return null;
  if (value.startsWith("[") || value.includes("BEGIN:VCALENDAR")) return value;
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = `${normalized}${"=".repeat((4 - (normalized.length % 4)) % 4)}`;
  return atob(padded);
}

function removeConnectorKeys(params: URLSearchParams): void {
  for (const key of CONNECTOR_KEYS) params.delete(key);
}

function providerLabel(provider: CalendarProviderId): string {
  return provider === "google" ? "Google Calendar" : "Apple Calendar";
}
