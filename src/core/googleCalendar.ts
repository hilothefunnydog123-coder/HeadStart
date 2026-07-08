import {
  googleCalendarEventsToCommitments,
  type GoogleCalendarEvent,
} from "./calendar";
import type { Commitment, Place } from "./types";

const GOOGLE_IDENTITY_SCRIPT = "https://accounts.google.com/gsi/client";
const GOOGLE_CALENDAR_EVENTS_URL =
  "https://www.googleapis.com/calendar/v3/calendars/primary/events";
export const GOOGLE_CALENDAR_SCOPE =
  "https://www.googleapis.com/auth/calendar.events.readonly";
const GOOGLE_IMPORT_LIMIT = 50;

interface GoogleTokenResponse {
  access_token?: string;
  error?: string;
  error_description?: string;
  scope?: string;
}

interface GoogleTokenClient {
  requestAccessToken: () => void;
}

interface GoogleIdentityApi {
  accounts: {
    oauth2: {
      initTokenClient: (config: {
        client_id: string;
        scope: string;
        callback: (response: GoogleTokenResponse) => void;
      }) => GoogleTokenClient;
      hasGrantedAllScopes?: (
        response: GoogleTokenResponse,
        ...scopes: string[]
      ) => boolean;
      revoke?: (accessToken: string, done: () => void) => void;
    };
  };
}

declare global {
  interface Window {
    google?: GoogleIdentityApi;
  }
}

let scriptLoadPromise: Promise<void> | null = null;

export function configuredGoogleClientId(): string {
  const meta = import.meta as ImportMeta & {
    env?: Record<string, string | undefined>;
  };
  return meta.env?.VITE_GOOGLE_CLIENT_ID?.trim() ?? "";
}

export function configuredCalendarConnectorUrl(): string {
  const meta = import.meta as ImportMeta & {
    env?: Record<string, string | undefined>;
  };
  return meta.env?.VITE_CALENDAR_CONNECTOR_URL?.trim() ?? "";
}

export function loadGoogleIdentityScript(): Promise<void> {
  if (window.google?.accounts?.oauth2) return Promise.resolve();
  if (scriptLoadPromise) return scriptLoadPromise;

  scriptLoadPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(
      `script[src="${GOOGLE_IDENTITY_SCRIPT}"]`,
    );
    if (existing) {
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener(
        "error",
        () => reject(new Error("Google sign-in script failed to load.")),
        { once: true },
      );
      return;
    }

    const script = document.createElement("script");
    script.src = GOOGLE_IDENTITY_SCRIPT;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Google sign-in script failed to load."));
    document.head.appendChild(script);
  });

  return scriptLoadPromise;
}

export async function requestGoogleCalendarAccessToken(
  clientId: string,
): Promise<string> {
  const trimmedClientId = clientId.trim();
  if (!trimmedClientId) {
    throw new Error("Google sign-in is not configured yet.");
  }

  await loadGoogleIdentityScript();
  const oauth2 = window.google?.accounts?.oauth2;
  if (!oauth2) throw new Error("Google sign-in is unavailable in this browser.");

  return new Promise((resolve, reject) => {
    const client = oauth2.initTokenClient({
      client_id: trimmedClientId,
      scope: GOOGLE_CALENDAR_SCOPE,
      callback: (response) => {
        if (response.error) {
          reject(new Error(response.error_description || response.error));
          return;
        }

        if (!response.access_token) {
          reject(new Error("Google did not return an access token."));
          return;
        }

        const granted =
          oauth2.hasGrantedAllScopes?.(response, GOOGLE_CALENDAR_SCOPE) ??
          response.scope?.split(" ").includes(GOOGLE_CALENDAR_SCOPE) ??
          true;
        if (!granted) {
          reject(new Error("Calendar read access was not granted."));
          return;
        }

        resolve(response.access_token);
      },
    });

    client.requestAccessToken();
  });
}

export async function importGoogleCalendarCommitments(
  accessToken: string,
  fallbackDestination: Place,
  now = new Date(),
): Promise<Commitment[]> {
  const params = new URLSearchParams({
    timeMin: now.toISOString(),
    maxResults: String(GOOGLE_IMPORT_LIMIT),
    singleEvents: "true",
    orderBy: "startTime",
    showDeleted: "false",
    eventTypes: "default",
  });

  const response = await fetch(`${GOOGLE_CALENDAR_EVENTS_URL}?${params}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    throw new Error(await googleCalendarErrorMessage(response));
  }

  const payload = (await response.json()) as { items?: GoogleCalendarEvent[] };
  return googleCalendarEventsToCommitments(
    Array.isArray(payload.items) ? payload.items : [],
    fallbackDestination,
    now,
  );
}

export function revokeGoogleCalendarAccess(accessToken: string): void {
  window.google?.accounts?.oauth2.revoke?.(accessToken, () => undefined);
}

async function googleCalendarErrorMessage(response: Response): Promise<string> {
  try {
    const payload = (await response.json()) as {
      error?: { message?: string };
    };
    return payload.error?.message || `Google Calendar returned ${response.status}.`;
  } catch {
    return `Google Calendar returned ${response.status}.`;
  }
}
