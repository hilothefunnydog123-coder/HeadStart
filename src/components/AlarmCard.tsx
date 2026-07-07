import type { DeparturePlan, PlanPhase } from "../core/types";
import { formatClock, formatDuration } from "../core/time";
import { TrafficBadge } from "./TrafficBadge";
import { TimelineBar } from "./TimelineBar";

interface Props {
  plan: DeparturePlan;
  now: Date;
}

interface Hero {
  eyebrow: string;
  big: string;
  sub: string;
  className: string;
}

function hero(plan: DeparturePlan): Hero {
  const phase: PlanPhase = plan.phase;
  const untilWake = formatDuration(plan.minutesUntilWake);
  const untilLeave = formatDuration(plan.minutesUntilLeave);

  switch (phase) {
    case "sleep":
      return {
        eyebrow: "Recommended wake-up",
        big: formatClock(plan.wakeBy),
        sub: `in ${untilWake} · leave by ${formatClock(plan.leaveBy)}`,
        className: "phase-sleep",
      };
    case "wake":
      return {
        eyebrow: "⏰ Time to get up",
        big: "Wake up",
        sub: `Leave by ${formatClock(plan.leaveBy)} · ${untilLeave} to go`,
        className: "phase-wake",
      };
    case "prep":
      return {
        eyebrow: "Getting ready",
        big: `Leave in ${untilLeave}`,
        sub: `Out the door by ${formatClock(plan.leaveBy)}`,
        className: "phase-prep",
      };
    case "leave": {
      const soon = plan.minutesUntilLeave <= 1;
      return {
        eyebrow: soon ? "🚦 Go" : "Almost time",
        big: soon ? "Leave now" : `Leave in ${untilLeave}`,
        sub: `Arrive by ${formatClock(plan.arriveBy)}`,
        className: "phase-leave",
      };
    }
    case "enroute":
      return {
        eyebrow: "On your way",
        big: "Safe travels",
        sub: `Arrive by ${formatClock(plan.arriveBy)}`,
        className: "phase-enroute",
      };
    default:
      return { eyebrow: "", big: "", sub: "", className: "" };
  }
}

const MODE_ICON: Record<string, string> = {
  drive: "🚗",
  transit: "🚉",
  walk: "🚶",
  cycle: "🚲",
};

export function AlarmCard({ plan, now }: Props) {
  const h = hero(plan);
  const { commitment } = plan;

  return (
    <section className={`alarm-card ${h.className}`} aria-live="polite">
      <div className="alarm-hero">
        <p className="alarm-eyebrow">{h.eyebrow}</p>
        <h1 className="alarm-big">{h.big}</h1>
        <p className="alarm-sub">{h.sub}</p>
      </div>

      <div className="alarm-commitment">
        <span className="mode-icon" aria-hidden>
          {MODE_ICON[commitment.travelMode] ?? "📍"}
        </span>
        <div>
          <div className="commitment-title">{commitment.title}</div>
          <div className="commitment-dest">
            {commitment.destination.label} · arrive {formatClock(plan.arriveBy)}
          </div>
        </div>
      </div>

      <TrafficBadge estimate={plan.estimate} />
      <TimelineBar plan={plan} now={now} />
    </section>
  );
}
