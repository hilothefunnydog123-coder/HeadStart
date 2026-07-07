import { useEffect, useMemo, useState } from "react";
import {
  delayMinutes,
  isStillAtDeparture,
  shouldCheckLateDeparture,
  updatedArrival,
} from "../core/liveDeparture";
import { getProvider } from "../core/traffic/provider";
import type {
  DeparturePlan,
  Place,
  Settings,
  TravelEstimate,
} from "../core/types";

export type LiveDepartureStatus =
  | { kind: "disabled" }
  | { kind: "requesting" }
  | { kind: "not-due" }
  | { kind: "away"; distanceFromHomeMeters: number }
  | {
      kind: "still-home";
      distanceFromHomeMeters: number;
      estimate: TravelEstimate;
      arrival: Date;
      delayMinutes: number;
    }
  | { kind: "error"; message: string };

interface TrackedLocation {
  place: Place;
  accuracyMeters: number;
}

const MS_PER_MIN = 60_000;

export function useLiveDepartureStatus(
  plan: DeparturePlan | null,
  settings: Settings,
  now: Date,
): LiveDepartureStatus {
  const location = useLiveLocation(Boolean(settings.locationTrackingEnabled));
  const trackedLocation = location.kind === "tracking" ? location : null;
  const [estimate, setEstimate] = useState<TravelEstimate | null>(null);
  const [estimateError, setEstimateError] = useState<string | null>(null);

  const estimateKey = useMemo(() => {
    if (!plan || !settings.home || !trackedLocation) return "";
    if (!shouldCheckLateDeparture(plan, now)) return "";
    if (
      !isStillAtDeparture(
        settings.home,
        trackedLocation.place,
        trackedLocation.accuracyMeters,
      )
    ) {
      return "";
    }

    return JSON.stringify({
      minute: Math.floor(now.getTime() / MS_PER_MIN),
      provider: settings.trafficProvider,
      apiKey: settings.apiKey,
      home: settings.home,
      current: {
        lat: Number(trackedLocation.place.lat.toFixed(5)),
        lng: Number(trackedLocation.place.lng.toFixed(5)),
      },
      destination: plan.commitment.destination,
      mode: plan.commitment.travelMode,
    });
  }, [now, plan, settings, trackedLocation]);

  useEffect(() => {
    if (!estimateKey || !plan || !settings.home || !trackedLocation) {
      setEstimate(null);
      setEstimateError(null);
      return;
    }

    let cancelled = false;
    const activePlan = plan;
    const activeLocation = trackedLocation;
    async function run() {
      try {
        const provider =
          (getProvider(settings.trafficProvider)?.isReady(settings.apiKey)
            ? getProvider(settings.trafficProvider)
            : undefined) ?? getProvider("simulated")!;
        const nextEstimate = await provider.estimate({
          origin: activeLocation.place,
          destination: activePlan.commitment.destination,
          mode: activePlan.commitment.travelMode,
          departAt: now,
          apiKey: settings.apiKey,
        });
        if (!cancelled) {
          setEstimate(nextEstimate);
          setEstimateError(null);
        }
      } catch (err) {
        if (!cancelled) {
          setEstimate(null);
          setEstimateError(
            err instanceof Error ? err.message : "Couldn't update arrival time.",
          );
        }
      }
    }

    void run();
    return () => {
      cancelled = true;
    };
  }, [estimateKey]);

  if (!settings.locationTrackingEnabled) return { kind: "disabled" };
  if (location.kind === "requesting") return { kind: "requesting" };
  if (location.kind === "error") return { kind: "error", message: location.message };
  if (!trackedLocation) return { kind: "requesting" };
  if (!plan || !settings.home || !shouldCheckLateDeparture(plan, now)) {
    return { kind: "not-due" };
  }

  const distanceFromHomeMeters = distanceBetween(settings.home, trackedLocation.place);
  if (
    !isStillAtDeparture(
      settings.home,
      trackedLocation.place,
      trackedLocation.accuracyMeters,
    )
  ) {
    return { kind: "away", distanceFromHomeMeters };
  }

  if (estimateError) return { kind: "error", message: estimateError };
  if (!estimate) return { kind: "requesting" };

  const arrival = updatedArrival(now, estimate);
  return {
    kind: "still-home",
    distanceFromHomeMeters,
    estimate,
    arrival,
    delayMinutes: delayMinutes(plan, arrival),
  };
}

type LiveLocation =
  | { kind: "disabled" }
  | { kind: "requesting" }
  | ({ kind: "tracking" } & TrackedLocation)
  | { kind: "error"; message: string };

function useLiveLocation(enabled: boolean): LiveLocation {
  const [location, setLocation] = useState<LiveLocation>(
    enabled ? { kind: "requesting" } : { kind: "disabled" },
  );

  useEffect(() => {
    if (!enabled) {
      setLocation({ kind: "disabled" });
      return;
    }

    if (!("geolocation" in navigator)) {
      setLocation({ kind: "error", message: "Location is not available here." });
      return;
    }

    setLocation({ kind: "requesting" });
    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        setLocation({
          kind: "tracking",
          place: {
            id: "current-location",
            label: "Current location",
            lat: Number(position.coords.latitude.toFixed(6)),
            lng: Number(position.coords.longitude.toFixed(6)),
          },
          accuracyMeters: position.coords.accuracy,
        });
      },
      (error) => {
        setLocation({
          kind: "error",
          message: error.message || "Location permission was not granted.",
        });
      },
      {
        enableHighAccuracy: false,
        maximumAge: 30_000,
        timeout: 12_000,
      },
    );

    return () => navigator.geolocation.clearWatch(watchId);
  }, [enabled]);

  return location;
}

function distanceBetween(a: Place, b: Place): number {
  const latMeters = (a.lat - b.lat) * 111_320;
  const lngMeters =
    (a.lng - b.lng) * 111_320 * Math.cos(((a.lat + b.lat) / 2) * (Math.PI / 180));
  return Math.sqrt(latMeters * latMeters + lngMeters * lngMeters);
}
