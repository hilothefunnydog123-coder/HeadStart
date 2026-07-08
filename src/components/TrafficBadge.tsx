import type { TravelEstimate } from "../core/types";
import { trafficDisplay } from "../core/travelDisplay";

interface Props {
  estimate: TravelEstimate;
}

/** Shows current congestion and how much of the trip is delay vs free-flow. */
export function TrafficBadge({ estimate }: Props) {
  const display = trafficDisplay(estimate);

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
