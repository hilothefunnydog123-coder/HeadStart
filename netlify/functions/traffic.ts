const GOOGLE_ROUTES_ENDPOINT =
  "https://routes.googleapis.com/directions/v2:computeRoutes";
const CACHE_LIMIT = 500;
const cache = new Map<string, { expiresAt: number; payload: RoutePayload }>();

interface FunctionEvent {
  httpMethod: string;
  body: string | null;
  headers?: Record<string, string | undefined>;
}

interface FunctionResponse {
  statusCode: number;
  headers: Record<string, string>;
  body: string;
}

type Mode = "drive" | "transit" | "walk" | "cycle";

interface Coordinates {
  lat: number;
  lng: number;
}

interface TrafficInput {
  origin: Coordinates;
  destination: Coordinates;
  mode: Mode;
  departAt: Date;
}

interface RoutePayload extends Record<string, unknown> {
  durationSeconds: number;
  freeFlowSeconds: number;
  distanceMeters: number;
  source: string;
  cached?: boolean;
}

interface GoogleRoutesResponse {
  routes?: Array<{
    duration?: string;
    staticDuration?: string;
    distanceMeters?: number;
  }>;
  error?: { message?: string };
}

const TRAVEL_MODE: Record<Mode, string> = {
  drive: "DRIVE",
  transit: "TRANSIT",
  walk: "WALK",
  cycle: "BICYCLE",
};

export const handler = async (event: FunctionEvent): Promise<FunctionResponse> => {
  const cors = corsHeaders(event);
  const respond = (
    statusCode: number,
    payload: Record<string, unknown>,
    headers: Record<string, string> = {},
  ) => json(statusCode, payload, { ...cors, ...headers });

  if (event.httpMethod === "OPTIONS") {
    return respond(204, {});
  }
  if (!originAllowed(event)) {
    return respond(403, { error: "Origin not allowed." });
  }
  if (event.httpMethod !== "POST") {
    return respond(405, { error: "Method not allowed." }, { Allow: "POST, OPTIONS" });
  }

  const input = parseInput(event.body);
  if (!input) return respond(400, { error: "Enter a valid route and departure time." });

  const apiKey = process.env.GOOGLE_ROUTES_API_KEY?.trim();
  if (!apiKey) {
    return respond(503, {
      error: "Hosted traffic is not configured yet.",
      code: "traffic_not_configured",
    });
  }

  const key = cacheKey(input);
  const hit = cache.get(key);
  if (hit && hit.expiresAt > Date.now()) {
    return respond(200, { ...hit.payload, cached: true }, cacheHeaders(input));
  }

  try {
    const response = await fetch(GOOGLE_ROUTES_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask":
          "routes.duration,routes.staticDuration,routes.distanceMeters",
      },
      body: JSON.stringify(googleRequest(input)),
    });
    const result = (await response.json().catch(() => ({}))) as GoogleRoutesResponse;
    if (!response.ok) {
      return respond(response.status, {
        error: result.error?.message || "The routing provider rejected this request.",
      });
    }

    const route = result.routes?.[0];
    const durationSeconds = parseSeconds(route?.duration);
    if (durationSeconds === null) {
      return respond(502, { error: "The routing provider returned no usable route." });
    }
    const payload: RoutePayload = {
      durationSeconds,
      freeFlowSeconds: parseSeconds(route?.staticDuration) ?? durationSeconds,
      distanceMeters: Math.max(0, Math.round(route?.distanceMeters ?? 0)),
      source: "Departure live traffic · Google Routes",
    };
    remember(key, payload, cacheTtlMs(input));
    return respond(200, payload, cacheHeaders(input));
  } catch {
    return respond(502, { error: "Live traffic could not be reached." });
  }
};

function originAllowed(event: FunctionEvent): boolean {
  const origin = requestHeader(event, "origin");
  if (!origin) return true;
  return allowedOrigins(event).has(origin.replace(/\/$/, ""));
}

function corsHeaders(event: FunctionEvent): Record<string, string> {
  const origin = requestHeader(event, "origin")?.replace(/\/$/, "");
  const headers: Record<string, string> = {
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    Vary: "Origin",
  };
  if (origin && allowedOrigins(event).has(origin)) {
    headers["Access-Control-Allow-Origin"] = origin;
  }
  return headers;
}

function allowedOrigins(event: FunctionEvent): Set<string> {
  const allowed = new Set([
    "capacitor://localhost",
    "https://localhost",
    "http://localhost",
  ]);
  const host = requestHeader(event, "x-forwarded-host") || requestHeader(event, "host");
  if (host) {
    const protocol = requestHeader(event, "x-forwarded-proto") || "https";
    allowed.add(`${protocol}://${host}`);
  }
  for (const origin of (process.env.TRAFFIC_ALLOWED_ORIGINS || "").split(",")) {
    const normalized = origin.trim().replace(/\/$/, "");
    if (normalized) allowed.add(normalized);
  }
  return allowed;
}

function requestHeader(event: FunctionEvent, name: string): string | undefined {
  const entry = Object.entries(event.headers || {}).find(
    ([key]) => key.toLowerCase() === name.toLowerCase(),
  );
  return entry?.[1];
}

function parseInput(body: string | null): TrafficInput | null {
  try {
    const value = JSON.parse(body || "{}") as Partial<{
      origin: Partial<Coordinates>;
      destination: Partial<Coordinates>;
      mode: Mode;
      departAt: string;
    }>;
    const origin = validCoordinates(value.origin);
    const destination = validCoordinates(value.destination);
    const departAt = new Date(value.departAt || "");
    if (
      !origin ||
      !destination ||
      !value.mode ||
      !(value.mode in TRAVEL_MODE) ||
      Number.isNaN(departAt.getTime())
    ) {
      return null;
    }
    return { origin, destination, mode: value.mode, departAt };
  } catch {
    return null;
  }
}

function validCoordinates(value: Partial<Coordinates> | undefined): Coordinates | null {
  const lat = value?.lat;
  const lng = value?.lng;
  if (
    typeof lat !== "number" ||
    typeof lng !== "number" ||
    !Number.isFinite(lat) ||
    !Number.isFinite(lng) ||
    Math.abs(lat) > 90 ||
    Math.abs(lng) > 180
  ) {
    return null;
  }
  return { lat, lng };
}

function googleRequest(input: TrafficInput): Record<string, unknown> {
  const trafficAware = input.mode === "drive";
  return {
    origin: { location: { latLng: latLng(input.origin) } },
    destination: { location: { latLng: latLng(input.destination) } },
    travelMode: TRAVEL_MODE[input.mode],
    ...(trafficAware
      ? {
          routingPreference: "TRAFFIC_AWARE",
          departureTime: input.departAt.toISOString(),
        }
      : input.mode === "transit"
        ? { departureTime: input.departAt.toISOString() }
        : {}),
  };
}

function latLng(value: Coordinates): { latitude: number; longitude: number } {
  return { latitude: value.lat, longitude: value.lng };
}

function parseSeconds(value: string | undefined): number | null {
  if (!value) return null;
  const seconds = Number(value.replace(/s$/, ""));
  return Number.isFinite(seconds) && seconds > 0 ? Math.round(seconds) : null;
}

function cacheKey(input: TrafficInput): string {
  const bucketMinutes = cadenceMinutes(input.departAt);
  const bucket = Math.floor(input.departAt.getTime() / (bucketMinutes * 60_000));
  const coord = (value: Coordinates) =>
    `${value.lat.toFixed(4)},${value.lng.toFixed(4)}`;
  return `${coord(input.origin)}|${coord(input.destination)}|${input.mode}|${bucketMinutes}|${bucket}`;
}

function cadenceMinutes(departAt: Date): number {
  const minutesAway = (departAt.getTime() - Date.now()) / 60_000;
  if (minutesAway <= 30) return 1;
  if (minutesAway <= 180) return 5;
  return 15;
}

function cacheTtlMs(input: TrafficInput): number {
  return cadenceMinutes(input.departAt) * 60_000;
}

function cacheHeaders(input: TrafficInput): Record<string, string> {
  const seconds = cadenceMinutes(input.departAt) * 60;
  return { "Cache-Control": `public, max-age=${seconds}, s-maxage=${seconds}` };
}

function remember(key: string, payload: RoutePayload, ttlMs: number): void {
  if (cache.size >= CACHE_LIMIT) {
    const oldest = cache.keys().next().value as string | undefined;
    if (oldest) cache.delete(oldest);
  }
  cache.set(key, { expiresAt: Date.now() + ttlMs, payload });
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
      "X-Content-Type-Options": "nosniff",
      ...headers,
    },
    body: JSON.stringify(payload),
  };
}
