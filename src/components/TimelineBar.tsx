import type { DeparturePlan } from "../core/types";
import { formatClock } from "../core/time";

interface Props {
  plan: DeparturePlan;
  now: Date;
}

interface Marker {
  key: string;
  label: string;
  at: Date;
}

/**
 * A horizontal timeline from wake → leave → arrive with a live "now" indicator,
 * so the whole morning is visible at a glance.
 */
export function TimelineBar({ plan, now }: Props) {
  const start = plan.wakeBy.getTime();
  const end = plan.arriveBy.getTime();
  const span = Math.max(1, end - start);

  const pct = (t: number) =>
    Math.min(100, Math.max(0, ((t - start) / span) * 100));

  const markers: Marker[] = [
    { key: "wake", label: "Wake", at: plan.wakeBy },
    { key: "leave", label: "Leave", at: plan.leaveBy },
    { key: "arrive", label: "Arrive", at: plan.arriveBy },
  ];

  const nowPct = pct(now.getTime());
  const showNow = now.getTime() >= start && now.getTime() <= end;

  return (
    <div className="timeline" role="img" aria-label="Morning timeline">
      <div className="timeline-track">
        <div
          className="timeline-fill"
          style={{ width: `${showNow ? nowPct : now.getTime() < start ? 0 : 100}%` }}
        />
        {showNow && (
          <div className="timeline-now" style={{ left: `${nowPct}%` }}>
            <span className="timeline-now-dot" />
          </div>
        )}
      </div>
      <div className="timeline-marks">
        {markers.map((m) => (
          <div
            key={m.key}
            className="timeline-mark"
            style={{ left: `${pct(m.at.getTime())}%` }}
          >
            <span className="timeline-mark-label">{m.label}</span>
            <span className="timeline-mark-time">{formatClock(m.at)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
