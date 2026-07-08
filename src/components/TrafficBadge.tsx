import type { TravelEstimate, TravelMode } from "../core/types";
import { trafficDisplay } from "../core/travelDisplay";

interface Props {
  estimate: TravelEstimate;
  mode: TravelMode;
}

/** Shows current congestion and how much of the trip is delay vs free-flow. */
export function TrafficBadge({ estimate, mode }: Props) {
  const display = trafficDisplay(estimate, mode);

  return (
    <div className={`traffic-badge ${display.className}`}>
      <span className="traffic-dot" aria-hidden />
      <div className="traffic-text">
        <strong>{display.label}</strong>
        <span className="traffic-sub">{display.detail}</span>
      </div>
    </div>
  );
}
