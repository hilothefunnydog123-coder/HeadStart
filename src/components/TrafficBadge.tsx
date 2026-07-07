import type { TravelEstimate } from "../core/types";
import { formatDuration } from "../core/time";

interface Props {
  estimate: TravelEstimate;
}

function level(congestion: number): { label: string; className: string } {
  if (congestion >= 1.6) return { label: "Heavy traffic", className: "sev-high" };
  if (congestion >= 1.25) return { label: "Moderate traffic", className: "sev-med" };
  if (congestion >= 1.08) return { label: "Light traffic", className: "sev-low" };
  return { label: "Clear roads", className: "sev-clear" };
}

/** Shows current congestion and how much of the trip is delay vs free-flow. */
export function TrafficBadge({ estimate }: Props) {
  const { label, className } = level(estimate.congestion);
  const delayMin = Math.max(
    0,
    (estimate.durationSeconds - estimate.freeFlowSeconds) / 60,
  );
  const km = estimate.distanceMeters / 1000;

  return (
    <div className={`traffic-badge ${className}`}>
      <span className="traffic-dot" aria-hidden />
      <div className="traffic-text">
        <strong>{label}</strong>
        <span className="traffic-sub">
          {km.toFixed(1)} km · {formatDuration(estimate.durationSeconds / 60)}
          {delayMin >= 1 ? ` · +${formatDuration(delayMin)} delay` : " · on time"}
        </span>
      </div>
    </div>
  );
}
