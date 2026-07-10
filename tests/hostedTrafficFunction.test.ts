import { afterEach, describe, expect, it, vi } from "vitest";
import { handler } from "../netlify/functions/traffic";

const originalKey = process.env.GOOGLE_ROUTES_API_KEY;

afterEach(() => {
  if (originalKey === undefined) delete process.env.GOOGLE_ROUTES_API_KEY;
  else process.env.GOOGLE_ROUTES_API_KEY = originalKey;
  vi.unstubAllGlobals();
});

function event(overrides: Record<string, unknown> = {}) {
  return {
    httpMethod: "POST",
    body: JSON.stringify({
      origin: { lat: 37.7601, lng: -122.4201 },
      destination: { lat: 37.7901, lng: -122.4001 },
      mode: "drive",
      departAt: "2026-07-10T15:00:00.000Z",
      ...overrides,
    }),
  };
}

describe("hosted traffic function", () => {
  it("allows the native Capacitor origins and rejects unrelated browsers", async () => {
    const preflight = await handler({
      httpMethod: "OPTIONS",
      body: null,
      headers: { origin: "capacitor://localhost" },
    });
    expect(preflight.statusCode).toBe(204);
    expect(preflight.headers["Access-Control-Allow-Origin"]).toBe(
      "capacitor://localhost",
    );

    const rejected = await handler({
      ...event(),
      headers: { origin: "https://unrelated.example" },
    });
    expect(rejected.statusCode).toBe(403);
  });

  it("keeps the provider key server-side and requests traffic-aware routing", async () => {
    process.env.GOOGLE_ROUTES_API_KEY = "server-secret";
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        routes: [{ duration: "1920s", staticDuration: "1600s", distanceMeters: 9500 }],
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const response = await handler(event());
    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toMatchObject({
      durationSeconds: 1920,
      freeFlowSeconds: 1600,
      distanceMeters: 9500,
      source: "Departure live traffic · Google Routes",
    });
    const request = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect((request.headers as Record<string, string>)["X-Goog-Api-Key"]).toBe(
      "server-secret",
    );
    expect(JSON.parse(String(request.body))).toMatchObject({
      travelMode: "DRIVE",
      routingPreference: "TRAFFIC_AWARE",
    });
  });

  it("rejects malformed coordinates before calling the provider", async () => {
    process.env.GOOGLE_ROUTES_API_KEY = "server-secret";
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const response = await handler(event({ origin: { lat: 999, lng: 0 } }));
    expect(response.statusCode).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("reports missing hosted configuration without exposing a key", async () => {
    delete process.env.GOOGLE_ROUTES_API_KEY;
    const response = await handler(event({ destination: { lat: 37.7903, lng: -122.4003 } }));
    expect(response.statusCode).toBe(503);
    expect(JSON.parse(response.body)).toMatchObject({ code: "traffic_not_configured" });
  });
});
