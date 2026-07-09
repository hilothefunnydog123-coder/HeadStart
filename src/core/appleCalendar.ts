export interface AppleCalendarCredentials {
  email: string;
  appSpecificPassword: string;
}

interface AppleCalendarResponse {
  ics?: string;
  sourceLabel?: string;
  error?: string;
}

const APPLE_CALENDAR_ENDPOINT = "/.netlify/functions/apple-calendar";

export async function fetchPrivateAppleCalendar(
  credentials: AppleCalendarCredentials,
): Promise<{ ics: string; sourceLabel: string }> {
  const response = await fetch(APPLE_CALENDAR_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(credentials),
  });
  const payload = (await response.json().catch(() => ({}))) as AppleCalendarResponse;

  if (!response.ok) {
    throw new Error(
      payload.error ||
        (response.status === 404
          ? "Private Apple Calendar connection is unavailable in this local preview."
          : "Apple Calendar could not be connected."),
    );
  }
  if (!payload.ics?.includes("BEGIN:VEVENT")) {
    throw new Error("No upcoming timed Apple Calendar events were found.");
  }

  return {
    ics: payload.ics,
    sourceLabel: payload.sourceLabel || "Apple Calendar",
  };
}
