import type { TravelEstimate } from "../types";
import type { EstimateRequest, TrafficProvider } from "./provider";

const ENDPOINT_PATH = "/.netlify/functions/traffic";

interface HostedTrafficResponse {
  durationSeconds?: number;
  freeFlowSeconds?: number;
  distanceMeters?: number;
  source?: string;
  error?: string;
}

export function hostedTrafficEndpoint(): string {
  const meta = import.meta as ImportMeta & {
    env?: Record<string, string | undefined>;
  };
  const base = meta.env?.VITE_DEPARTURE_API_BASE_URL?.trim().replace(/\/$/, "");
  return base ? `${base}${ENDPOINT_PATH}` : ENDPOINT_PATH;
}

export function hostedTrafficIsConfiguredForNative(): boolean {
  return /^https:\/\//.test(hostedTrafficEndpoint());
}

export const hostedProvider: TrafficProvider = {
  id: "hosted",
  label: "Departure live traffic",
  isReady: () => typeof fetch === "function",

  async estimate(request: EstimateRequest): Promise<TravelEstimate> {
    const response = await fetch(hostedTrafficEndpoint(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        origin: coordinates(request.origin),
        destination: coordinates(request.destination),
        mode: request.mode,
        departAt: request.departAt.toISOString(),
      }),
    });
    const payload = (await response.json().catch(() => ({}))) as HostedTrafficResponse;
    if (!response.ok) {
      throw new Error(payload.error || "Live traffic is temporarily unavailable.");
    }

    const durationSeconds = finitePositive(payload.durationSeconds);
    const freeFlowSeconds = finitePositive(payload.freeFlowSeconds);
    const distanceMeters = finiteNonNegative(payload.distanceMeters);
    if (durationSeconds === null || freeFlowSeconds === null || distanceMeters === null) {
      throw new Error("Live traffic returned an incomplete route.");
    }

    return {
      durationSeconds,
      freeFlowSeconds,
      distanceMeters,
      congestion: durationSeconds / Math.max(1, freeFlowSeconds),
      source: payload.source || hostedProvider.label,
    };
  },
};

function coordinates(place: EstimateRequest["origin"]): { lat: number; lng: number } {
  return { lat: place.lat, lng: place.lng };
}

function finitePositive(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? value
    : null;
}

function finiteNonNegative(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value
    : null;
}
