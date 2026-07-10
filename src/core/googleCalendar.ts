import {
  googleCalendarEventsToCommitments,
  type GoogleCalendarEvent,
} from "./calendar";
import type { Commitment, Place } from "./types";

const GOOGLE_IDENTITY_SCRIPT = "https://accounts.google.com/gsi/client";
const DEPARTURE_GOOGLE_CLIENT_ID =
  "580289782891-fqghiisltc8tmmcla9pi8vumalt6a2ff.apps.googleusercontent.com";
const GOOGLE_CALENDAR_EVENTS_URL =
  "https://www.googleapis.com/calendar/v3/calendars/primary/events";
export const GOOGLE_CALENDAR_SCOPE =
  "https://www.googleapis.com/auth/calendar.events.readonly";
export const GOOGLE_ACCOUNT_SCOPES = "openid email profile";
const GOOGLE_IMPORT_LIMIT = 50;

export interface GoogleAccountProfile {
  sub: string;
  email: string;
  name: string;
  picture?: string;
}

interface GoogleUserInfo extends Partial<GoogleAccountProfile> {
  email_verified?: boolean;
}

interface GoogleTokenResponse {
  access_token?: string;
  error?: string;
  error_description?: string;
  scope?: string;
}

interface GoogleTokenClient {
  requestAccessToken: (overrideConfig?: { prompt?: string }) => void;
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
  return meta.env?.VITE_GOOGLE_CLIENT_ID?.trim() || DEPARTURE_GOOGLE_CLIENT_ID;
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
  return requestGoogleAccessToken(clientId, GOOGLE_CALENDAR_SCOPE);
}

export async function requestGoogleAccountProfile(
  clientId: string,
): Promise<GoogleAccountProfile> {
  const accessToken = await requestGoogleAccessToken(
    clientId,
    GOOGLE_ACCOUNT_SCOPES,
  );
  const response = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) {
    throw new Error("Google could not verify this account.");
  }

  const profile = (await response.json()) as GoogleUserInfo;
  if (!profile.sub || !profile.email || profile.email_verified === false) {
    throw new Error("Google did not return an email address for this account.");
  }

  return {
    sub: profile.sub,
    email: profile.email,
    name: profile.name?.trim() || profile.email.split("@")[0] || "Departure user",
    picture: profile.picture,
  };
}

async function requestGoogleAccessToken(
  clientId: string,
  scope: string,
): Promise<string> {
  const trimmedClientId = clientId.trim();
  if (!trimmedClientId) {
    throw new Error("Google sign-in is still being configured for this site.");
  }

  await loadGoogleIdentityScript();
  const oauth2 = window.google?.accounts?.oauth2;
  if (!oauth2) throw new Error("Google sign-in is unavailable in this browser.");

  return new Promise((resolve, reject) => {
    const client = oauth2.initTokenClient({
      client_id: trimmedClientId,
      scope,
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
          oauth2.hasGrantedAllScopes?.(response, ...scope.split(" ")) ??
          (response.scope
            ? scope
                .split(" ")
                .every((requested) => response.scope?.split(" ").includes(requested))
            : true);
        if (!granted) {
          reject(new Error("The requested Google access was not granted."));
          return;
        }

        resolve(response.access_token);
      },
    });

    client.requestAccessToken({ prompt: "select_account" });
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
