import { createDAVClient } from "tsdav";

const ICLOUD_CALDAV_URL = "https://caldav.icloud.com";
const LOOKAHEAD_DAYS = 120;
const MAX_CALENDARS = 20;
const MAX_OBJECTS = 500;

interface FunctionEvent {
  httpMethod: string;
  body: string | null;
}

interface FunctionResponse {
  statusCode: number;
  headers: Record<string, string>;
  body: string;
}

export const handler = async (event: FunctionEvent): Promise<FunctionResponse> => {
  if (event.httpMethod !== "POST") {
    return json(405, { error: "Method not allowed." }, { Allow: "POST" });
  }

  const input = parseInput(event.body);
  if (!input) {
    return json(400, {
      error: "Enter your Apple Account email and an app-specific password.",
    });
  }

  try {
    const client = await createDAVClient({
      serverUrl: ICLOUD_CALDAV_URL,
      credentials: {
        username: input.email,
        password: input.appSpecificPassword,
      },
      authMethod: "Basic",
      defaultAccountType: "caldav",
    });
    const calendars = (await client.fetchCalendars())
      .filter((calendar) => calendar.components?.includes("VEVENT") !== false)
      .slice(0, MAX_CALENDARS);
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + LOOKAHEAD_DAYS);

    const groups = await Promise.all(
      calendars.map((calendar) =>
        client.fetchCalendarObjects({
          calendar,
          timeRange: { start: start.toISOString(), end: end.toISOString() },
        }),
      ),
    );
    const objects = groups.flat().slice(0, MAX_OBJECTS);
    const ics = objects
      .map((object) => object.data)
      .filter((data): data is string => typeof data === "string")
      .join("\r\n");

    if (!ics.includes("BEGIN:VEVENT")) {
      return json(404, { error: "No upcoming timed Apple Calendar events were found." });
    }

    return json(200, { ics, sourceLabel: "Apple Calendar" });
  } catch {
    return json(401, {
      error:
        "Apple could not authorize that account. Check the email and app-specific password.",
    });
  }
};

function parseInput(body: string | null): {
  email: string;
  appSpecificPassword: string;
} | null {
  try {
    const parsed = JSON.parse(body || "{}") as Partial<{
      email: string;
      appSpecificPassword: string;
    }>;
    const email = parsed.email?.trim().toLowerCase() || "";
    const appSpecificPassword = parsed.appSpecificPassword?.trim() || "";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || appSpecificPassword.length < 8) {
      return null;
    }
    return { email, appSpecificPassword };
  } catch {
    return null;
  }
}

function json(
  statusCode: number,
  payload: Record<string, unknown>,
  headers: Record<string, string> = {},
): FunctionResponse {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      ...headers,
    },
    body: JSON.stringify(payload),
  };
}
