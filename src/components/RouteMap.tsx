import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { routeDistanceMeters } from "../core/geo";
import { formatClock } from "../core/time";
import { distanceLabel } from "../core/travelDisplay";
import type { DeparturePlan, Place, Settings } from "../core/types";
import { Icon } from "./Icon";

interface Props {
  plan: DeparturePlan;
  settings: Settings;
  now: Date;
  onEnableLocation: () => void;
}

type RouteLocation =
  | { kind: "disabled" }
  | { kind: "requesting" }
  | { kind: "tracking"; place: Place; accuracyMeters: number }
  | { kind: "error"; message: string };

interface Bounds {
  north: number;
  south: number;
  east: number;
  west: number;
}

export function RouteMap({ plan, settings, now, onEnableLocation }: Props) {
  const start = settings.home;
  const destination = plan.commitment.destination;
  const location = useRouteLocation(Boolean(settings.locationTrackingEnabled && start));

  const projected = useMemo(
    () => (start ? interpolatePlace(start, destination, projectedProgress(plan, now)) : null),
    [destination, now, plan, start],
  );
  const current =
    location.kind === "tracking" ? location.place : projected ?? destination;
  const bounds = useMemo(
    () => buildBounds([start, destination, current].filter(isPlace)),
    [current, destination, start],
  );

  if (!start) return null;

  const startPoint = pointStyle(start, bounds);
  const destinationPoint = pointStyle(destination, bounds);
  const currentPoint = pointStyle(current, bounds);
  const progress =
    location.kind === "tracking"
      ? progressAlongRoute(start, destination, location.place)
      : projectedProgress(plan, now);
  const progressLabel = Math.round(progress * 100);
  const live = location.kind === "tracking";
  const accuracyStyle =
    live && location.accuracyMeters > 0
      ? accuracyRingStyle(location.accuracyMeters, bounds)
      : undefined;

  return (
    <section className="route-map-card" aria-label="Live route map">
      <div className="route-map-head">
        <div>
          <span className="route-map-kicker">{live ? "Live map" : "Route map"}</span>
          <strong>{start.label} to {destination.label}</strong>
        </div>
        <span className={`route-live-chip ${live ? "on" : ""}`}>
          {live ? "Updating" : "Projected"}
        </span>
      </div>

      <div className="route-map-stage">
        <iframe
          className="route-map-frame"
          title="OpenStreetMap route area"
          src={openStreetMapEmbedUrl(bounds)}
          loading="lazy"
          referrerPolicy="no-referrer-when-downgrade"
        />
        <svg
          className="route-map-overlay"
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          <line
            className="route-map-path-underlay"
            x1={percentNumber(startPoint.left)}
            y1={percentNumber(startPoint.top)}
            x2={percentNumber(destinationPoint.left)}
            y2={percentNumber(destinationPoint.top)}
          />
          <line
            className="route-map-path"
            x1={percentNumber(startPoint.left)}
            y1={percentNumber(startPoint.top)}
            x2={percentNumber(destinationPoint.left)}
            y2={percentNumber(destinationPoint.top)}
          />
        </svg>
        {accuracyStyle && (
          <span
            className="route-map-accuracy"
            style={{ ...currentPoint, ...accuracyStyle }}
            aria-hidden="true"
          />
        )}
        <span
          className="route-map-marker route-map-marker-start"
          style={startPoint}
          aria-label={`Start: ${start.label}`}
        >
          <Icon name="pin" size={14} />
        </span>
        <span
          className="route-map-marker route-map-marker-destination"
          style={destinationPoint}
          aria-label={`Destination: ${destination.label}`}
        >
          <Icon name="route" size={14} />
        </span>
        <span
          className={`route-map-marker route-map-marker-current ${live ? "live" : "projected"}`}
          style={currentPoint}
          aria-label={live ? "Your live location" : "Projected location"}
        >
          <span />
        </span>
      </div>

      <div className="route-map-footer">
        <div>
          <strong>{progressLabel}% of route</strong>
          <span>{statusText(location, settings.locationTrackingEnabled)}</span>
        </div>
        <div>
          <strong>{formatClock(plan.leaveBy)} leave</strong>
          <span>{distanceLabel(plan.estimate.distanceMeters)} · arrive {formatClock(plan.arriveBy)}</span>
        </div>
      </div>

      <div className="route-map-actions">
        {!settings.locationTrackingEnabled && (
          <button type="button" className="mini-button" onClick={onEnableLocation}>
            Enable live dot
          </button>
        )}
        <a href={openStreetMapDirectionsUrl(start, destination)} target="_blank" rel="noreferrer">
          Open full map
        </a>
      </div>
    </section>
  );
}

function useRouteLocation(enabled: boolean): RouteLocation {
  const [location, setLocation] = useState<RouteLocation>(
    enabled ? { kind: "requesting" } : { kind: "disabled" },
  );

  useEffect(() => {
    if (!enabled) {
      setLocation({ kind: "disabled" });
      return;
    }
    if (!("geolocation" in navigator)) {
      setLocation({ kind: "error", message: "Location is not available in this browser." });
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
        enableHighAccuracy: true,
        maximumAge: 10_000,
        timeout: 12_000,
      },
    );

    return () => navigator.geolocation.clearWatch(watchId);
  }, [enabled]);

  return location;
}

function statusText(location: RouteLocation, enabled: boolean): string {
  if (!enabled) return "Enable live location checks to follow your dot.";
  if (location.kind === "requesting") return "Waiting for browser location.";
  if (location.kind === "tracking") {
    return `Live browser location · about ${Math.round(location.accuracyMeters)} m accuracy.`;
  }
  if (location.kind === "error") return location.message;
  return "Projected from your wake and leave timeline.";
}

function projectedProgress(plan: DeparturePlan, now: Date): number {
  const start = plan.leaveBy.getTime();
  const end = plan.arriveBy.getTime();
  if (now.getTime() <= start) return 0;
  if (now.getTime() >= end) return 1;
  return clamp((now.getTime() - start) / Math.max(1, end - start), 0, 1);
}

function progressAlongRoute(start: Place, destination: Place, current: Place): number {
  const ax = start.lng;
  const ay = start.lat;
  const bx = destination.lng;
  const by = destination.lat;
  const px = current.lng;
  const py = current.lat;
  const dx = bx - ax;
  const dy = by - ay;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared === 0) return 1;
  return clamp(((px - ax) * dx + (py - ay) * dy) / lengthSquared, 0, 1);
}

function interpolatePlace(start: Place, destination: Place, progress: number): Place {
  return {
    id: "projected-location",
    label: "Projected location",
    lat: start.lat + (destination.lat - start.lat) * progress,
    lng: start.lng + (destination.lng - start.lng) * progress,
  };
}

function buildBounds(points: Place[]): Bounds {
  const lats = points.map((point) => point.lat);
  const lngs = points.map((point) => point.lng);
  const north = Math.max(...lats);
  const south = Math.min(...lats);
  const east = Math.max(...lngs);
  const west = Math.min(...lngs);
  const diagonal = points.length >= 2 ? routeDistanceMeters(points[0]!, points[1]!) : 0;
  const minPad = diagonal > 50_000 ? 0.06 : diagonal > 10_000 ? 0.025 : 0.008;
  const latPad = Math.max((north - south) * 0.22, minPad);
  const lngPad = Math.max((east - west) * 0.22, minPad);
  return {
    north: clamp(north + latPad, -85, 85),
    south: clamp(south - latPad, -85, 85),
    east: clamp(east + lngPad, -180, 180),
    west: clamp(west - lngPad, -180, 180),
  };
}

function pointStyle(place: Place, bounds: Bounds): CSSProperties {
  const x = ((place.lng - bounds.west) / Math.max(0.000001, bounds.east - bounds.west)) * 100;
  const y = ((bounds.north - place.lat) / Math.max(0.000001, bounds.north - bounds.south)) * 100;
  return {
    left: `${clamp(x, 3, 97)}%`,
    top: `${clamp(y, 3, 97)}%`,
  };
}

function accuracyRingStyle(accuracyMeters: number, bounds: Bounds): CSSProperties {
  const middleLat = (bounds.north + bounds.south) / 2;
  const widthMeters =
    (bounds.east - bounds.west) * 111_320 * Math.cos((middleLat * Math.PI) / 180);
  const heightMeters = (bounds.north - bounds.south) * 111_320;
  const boxMeters = Math.max(widthMeters, heightMeters, 1);
  const diameter = clamp((accuracyMeters * 2 * 100) / boxMeters, 4, 34);
  return {
    width: `${diameter}%`,
    height: `${diameter}%`,
  };
}

function openStreetMapEmbedUrl(bounds: Bounds): string {
  const bbox = [bounds.west, bounds.south, bounds.east, bounds.north]
    .map((value) => value.toFixed(6))
    .join("%2C");
  return `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik`;
}

function openStreetMapDirectionsUrl(start: Place, destination: Place): string {
  const route = `${start.lat.toFixed(5)}%2C${start.lng.toFixed(5)}%3B${destination.lat.toFixed(5)}%2C${destination.lng.toFixed(5)}`;
  return `https://www.openstreetmap.org/directions?route=${route}`;
}

function percentNumber(value: CSSProperties["left"]): number {
  return Number(String(value).replace("%", ""));
}

function isPlace(value: Place | null | undefined): value is Place {
  return Boolean(value);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
