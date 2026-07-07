import { congestionMultiplier } from "../core/traffic/simulated";
import { formatClock } from "../core/time";

interface Props {
  /** The instant the user is planned to leave — highlighted on the curve. */
  leaveBy: Date;
}

const W = 300;
const H = 64;
const PAD_X = 6;
const PAD_TOP = 8;
const PAD_BOTTOM = 16;

// Sample the congestion curve across the commute-relevant part of the day.
const START_HOUR = 5;
const END_HOUR = 11;
const SAMPLES = 72;

/**
 * A sparkline of how congested the roads are across the morning, with a marker
 * at the user's planned departure. Communicates the core idea at a glance:
 * "we watch the whole rush-hour curve and pick your moment."
 */
export function TrafficSparkline({ leaveBy }: Props) {
  const base = new Date(leaveBy);
  base.setHours(0, 0, 0, 0);

  const points: { minute: number; value: number }[] = [];
  let min = Infinity;
  let max = -Infinity;
  for (let i = 0; i <= SAMPLES; i++) {
    const minute =
      START_HOUR * 60 + ((END_HOUR - START_HOUR) * 60 * i) / SAMPLES;
    const at = new Date(base.getTime() + minute * 60_000);
    const value = congestionMultiplier(at);
    points.push({ minute, value });
    if (value < min) min = value;
    if (value > max) max = value;
  }

  const spanY = Math.max(0.001, max - min);
  const spanMin = (END_HOUR - START_HOUR) * 60;

  const x = (minute: number) =>
    PAD_X + ((minute - START_HOUR * 60) / spanMin) * (W - PAD_X * 2);
  const y = (value: number) =>
    PAD_TOP + (1 - (value - min) / spanY) * (H - PAD_TOP - PAD_BOTTOM);

  const line = points
    .map((p, i) => `${i === 0 ? "M" : "L"}${x(p.minute).toFixed(1)},${y(p.value).toFixed(1)}`)
    .join(" ");
  const area = `${line} L${x(points[points.length - 1]!.minute).toFixed(1)},${H - PAD_BOTTOM} L${x(points[0]!.minute).toFixed(1)},${H - PAD_BOTTOM} Z`;

  const leaveMinute = leaveBy.getHours() * 60 + leaveBy.getMinutes();
  const clampedLeave = Math.min(END_HOUR * 60, Math.max(START_HOUR * 60, leaveMinute));
  const leaveValue = congestionMultiplier(leaveBy);
  const leaveX = x(clampedLeave);
  const leaveY = y(leaveValue);
  const ariaLabel = `Traffic estimate from ${START_HOUR} AM to ${END_HOUR} AM. Planned departure is ${formatClock(
    leaveBy,
  )}.`;

  const hourTicks = [6, 7, 8, 9, 10];

  return (
    <div className="sparkline">
      <div className="sparkline-head">
        <span className="sparkline-title">Traffic across your morning</span>
        <span className="sparkline-leave">Leave {formatClock(leaveBy)}</span>
      </div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="sparkline-svg"
        preserveAspectRatio="none"
        role="img"
        aria-label={ariaLabel}
      >
        <defs>
          <linearGradient id="sparkFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="var(--phase)" stopOpacity="0.35" />
            <stop offset="1" stopColor="var(--phase)" stopOpacity="0" />
          </linearGradient>
        </defs>

        <path d={area} fill="url(#sparkFill)" />
        <path
          d={line}
          fill="none"
          stroke="var(--phase)"
          strokeWidth={2}
          strokeLinejoin="round"
        />

        {hourTicks.map((h) => (
          <text
            key={h}
            x={x(h * 60)}
            y={H - 3}
            className="sparkline-tick"
            textAnchor="middle"
          >
            {h}
          </text>
        ))}

        <line
          x1={leaveX}
          y1={PAD_TOP - 2}
          x2={leaveX}
          y2={H - PAD_BOTTOM}
          stroke="var(--phase-2)"
          strokeWidth={1.5}
          strokeDasharray="3 3"
        />
        <circle
          cx={leaveX}
          cy={leaveY}
          r={5}
          fill="var(--surface-2)"
          stroke="var(--phase-2)"
          strokeWidth={3}
        />
      </svg>
    </div>
  );
}
