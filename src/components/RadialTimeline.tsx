import type { ReactNode } from "react";
import type { DeparturePlan } from "../core/types";
import { formatClock } from "../core/time";

interface Props {
  plan: DeparturePlan;
  now: Date;
  children: ReactNode;
}

const SIZE = 260;
const STROKE = 14;
const R = (SIZE - STROKE) / 2 - 8;
const CENTER = SIZE / 2;
const CIRC = 2 * Math.PI * R;

function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n));
}

function pointOnRing(fraction: number): { x: number; y: number } {
  // Start at 12 o'clock, go clockwise.
  const angle = fraction * 2 * Math.PI - Math.PI / 2;
  return {
    x: CENTER + R * Math.cos(angle),
    y: CENTER + R * Math.sin(angle),
  };
}

/**
 * The hero dial: a ring spanning the whole morning (wake → arrive) with a
 * progress arc for elapsed time, a tick where you need to leave, and a live
 * "now" marker travelling around it. The big time sits in the centre.
 */
export function RadialTimeline({ plan, now, children }: Props) {
  const start = plan.wakeBy.getTime();
  const end = plan.arriveBy.getTime();
  const span = Math.max(1, end - start);

  const progress = clamp01((now.getTime() - start) / span);
  const leaveFrac = clamp01((plan.leaveBy.getTime() - start) / span);

  const nowPt = pointOnRing(progress);
  const leavePt = pointOnRing(leaveFrac);
  const showNow = now.getTime() >= start && now.getTime() <= end;
  const ariaLabel = `Morning timeline. Wake at ${formatClock(
    plan.wakeBy,
  )}, leave at ${formatClock(plan.leaveBy)}, arrive at ${formatClock(
    plan.arriveBy,
  )}.`;

  return (
    <div className="radial" style={{ width: SIZE, height: SIZE }}>
      <svg
        width={SIZE}
        height={SIZE}
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        className="radial-svg"
        role="img"
        aria-label={ariaLabel}
      >
        <defs>
          <linearGradient id="ringGrad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="var(--phase)" />
            <stop offset="1" stopColor="var(--phase-2)" />
          </linearGradient>
        </defs>

        {/* Track */}
        <circle
          cx={CENTER}
          cy={CENTER}
          r={R}
          fill="none"
          stroke="var(--ring-track)"
          strokeWidth={STROKE}
        />

        {/* Progress arc */}
        <circle
          cx={CENTER}
          cy={CENTER}
          r={R}
          fill="none"
          stroke="url(#ringGrad)"
          strokeWidth={STROKE}
          strokeLinecap="round"
          strokeDasharray={CIRC}
          strokeDashoffset={CIRC * (1 - progress)}
          transform={`rotate(-90 ${CENTER} ${CENTER})`}
          className="radial-arc"
        />

        {/* Leave tick */}
        <circle
          cx={leavePt.x}
          cy={leavePt.y}
          r={5}
          fill="var(--surface-2)"
          stroke="var(--phase-2)"
          strokeWidth={3}
        />

        {/* Now marker */}
        {showNow && (
          <circle
            cx={nowPt.x}
            cy={nowPt.y}
            r={8}
            fill="#fff"
            stroke="var(--phase)"
            strokeWidth={4}
            className="radial-now"
          />
        )}
      </svg>
      <div className="radial-center">{children}</div>
    </div>
  );
}
