import type { TravelEstimate, TravelMode } from "./types";
import { formatDuration } from "./time";
import { travelModeRouteLabel } from "./travelModes";

const VERY_CLOSE_METERS = 250;

export interface TrafficDisplay {
  label: string;
  className: string;
  detail: string;
}

export function trafficDisplay(
  estimate: TravelEstimate,
  mode: TravelMode = "drive",
): TrafficDisplay {
  const duration = formatDuration(estimate.durationSeconds / 60);

  if (estimate.distanceMeters < VERY_CLOSE_METERS) {
    return {
      label: "Very close",
      className: "sev-clear",
      detail: `${distanceLabel(estimate.distanceMeters)} · ${duration} estimate`,
    };
  }

  const { label, className } = trafficLevel(estimate.congestion);
  const delayMin = Math.max(
    0,
    (estimate.durationSeconds - estimate.freeFlowSeconds) / 60,
  );

  if (mode !== "drive") {
    return {
      label: travelModeRouteLabel(mode),
      className: estimate.congestion >= 1.25 ? "sev-med" : "sev-clear",
      detail: `${distanceLabel(estimate.distanceMeters)} · ${duration} estimate${
        delayMin >= 1 && mode === "transit"
          ? ` · +${formatDuration(delayMin)} delay`
          : ""
      }`,
    };
  }

  return {
    label,
    className,
    detail: `${distanceLabel(estimate.distanceMeters)} · ${duration}${
      delayMin >= 1 ? ` · +${formatDuration(delayMin)} delay` : " · on time"
    }`,
  };
}

export function distanceLabel(distanceMeters: number): string {
  if (distanceMeters < 1000) return `${Math.round(distanceMeters)} m`;
  return `${(distanceMeters / 1000).toFixed(1)} km`;
}

export function confidenceDisplayLabel(probability: number): string {
  if (probability >= 0.995) return "Very likely";
  return `${Math.round(probability * 100)}%`;
}

function trafficLevel(congestion: number): { label: string; className: string } {
  if (congestion >= 1.6) return { label: "Heavy traffic", className: "sev-high" };
  if (congestion >= 1.25) return { label: "Moderate traffic", className: "sev-med" };
  if (congestion >= 1.08) return { label: "Light traffic", className: "sev-low" };
  return { label: "Clear roads", className: "sev-clear" };
}
