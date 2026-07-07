import type { TravelEstimate, TravelMode } from "../types";
import type { EstimateRequest, TrafficProvider } from "./provider";

/**
 * Real, traffic-aware routing via the Google Routes API (Directions v2).
 *
 * This is a genuine implementation, gated on an API key. When a key is present
 * in Settings the app uses live traffic; otherwise it falls back to the
 * simulated provider. Kept behind the same `TrafficProvider` contract so the
 * rest of the app never knows which one produced an estimate.
 *
 * Docs: https://developers.google.com/maps/documentation/routes
 */
const ROUTES_ENDPOINT =
  "https://routes.googleapis.com/directions/v2:computeRoutes";

const TRAVEL_MODE: Record<TravelMode, string> = {
  drive: "DRIVE",
  transit: "TRANSIT",
  walk: "WALK",
  cycle: "BICYCLE",
};

interface RoutesResponse {
  routes?: Array<{
    duration?: string; // e.g. "1234s"
    staticDuration?: string; // free-flow, e.g. "1000s"
    distanceMeters?: number;
  }>;
}

function parseSeconds(value: string | undefined): number | null {
  if (!value) return null;
  const n = Number(value.replace(/s$/, ""));
  return Number.isFinite(n) ? n : null;
}

export const googleProvider: TrafficProvider = {
  id: "google",
  label: "Google Routes (live)",
  isReady: (apiKey?: string) => Boolean(apiKey && apiKey.trim().length > 0),

  async estimate(request: EstimateRequest): Promise<TravelEstimate> {
    const { origin, destination, mode, departAt, apiKey } = request;
    if (!apiKey) throw new Error("Google Routes provider requires an API key.");

    const trafficAware = mode === "drive";
    const body = {
      origin: {
        location: {
          latLng: { latitude: origin.lat, longitude: origin.lng },
        },
      },
      destination: {
        location: {
          latLng: { latitude: destination.lat, longitude: destination.lng },
        },
      },
      travelMode: TRAVEL_MODE[mode],
      ...(trafficAware
        ? {
            routingPreference: "TRAFFIC_AWARE",
            departureTime: departAt.toISOString(),
          }
        : {}),
    };

    const res = await fetch(ROUTES_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask":
          "routes.duration,routes.staticDuration,routes.distanceMeters",
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(
        `Google Routes API error ${res.status}: ${detail.slice(0, 200)}`,
      );
    }

    const data = (await res.json()) as RoutesResponse;
    const route = data.routes?.[0];
    const durationSeconds = parseSeconds(route?.duration);
    if (durationSeconds == null) {
      throw new Error("Google Routes API returned no usable route.");
    }
    const freeFlowSeconds = parseSeconds(route?.staticDuration) ?? durationSeconds;
    const distanceMeters = route?.distanceMeters ?? 0;

    return {
      durationSeconds,
      freeFlowSeconds,
      distanceMeters,
      congestion: durationSeconds / Math.max(1, freeFlowSeconds),
      source: googleProvider.label,
    };
  },
};
