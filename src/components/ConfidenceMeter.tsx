import type { Confidence } from "../core/confidence";
import { formatDuration } from "../core/time";

interface Props {
  confidence: Confidence;
}

/**
 * "How likely are you to actually make it?" — the on-time probability from the
 * Monte-Carlo model, shown as a meter plus an actionable nudge.
 */
export function ConfidenceMeter({ confidence }: Props) {
  const pct = Math.round(confidence.probability * 100);
  const cls =
    confidence.level === "high"
      ? "conf-high"
      : confidence.level === "medium"
        ? "conf-med"
        : "conf-low";

  return (
    <div className={`confidence ${cls}`}>
      <div className="confidence-top">
        <span className="confidence-label">On-time confidence</span>
        <span className="confidence-pct">{pct}%</span>
      </div>
      <div className="confidence-track">
        <div className="confidence-fill" style={{ width: `${pct}%` }} />
      </div>
      <div className="confidence-foot">
        <span>
          Typical {formatDuration(confidence.p50Minutes)} · bad day{" "}
          {formatDuration(confidence.p90Minutes)}
        </span>
        {confidence.extraMinutesForTarget > 0 ? (
          <span className="confidence-nudge">
            +{formatDuration(confidence.extraMinutesForTarget)} earlier →{" "}
            {Math.round(confidence.target * 100)}%
          </span>
        ) : (
          <span className="confidence-nudge ok">Comfortable buffer</span>
        )}
      </div>
    </div>
  );
}
