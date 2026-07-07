import type { DeparturePlan, PlanPhase } from "../core/types";
import type { Confidence } from "../core/confidence";
import { formatClock, formatDuration } from "../core/time";
import { TrafficBadge } from "./TrafficBadge";
import { TrafficSparkline } from "./TrafficSparkline";
import { RadialTimeline } from "./RadialTimeline";
import { ConfidenceMeter } from "./ConfidenceMeter";
import { Icon, MODE_ICON } from "./Icon";
import type { LiveDepartureStatus } from "../hooks/useLiveDepartureStatus";
import {
  systemReminderCalendar,
  systemReminderFileName,
} from "../core/systemReminders";

interface BriefingControl {
  supported: boolean;
  speaking: boolean;
  onBrief: () => void;
}

interface Props {
  plan: DeparturePlan;
  now: Date;
  liveStatus: LiveDepartureStatus;
  onReviewLocationConsent: () => void;
  confidence: Confidence | null;
  briefing: BriefingControl;
}

interface Hero {
  eyebrow: string;
  big: string;
  sub: string;
  className: string;
}

function hero(plan: DeparturePlan, liveStatus: LiveDepartureStatus): Hero {
  if (liveStatus.kind === "still-home") {
    return {
      eyebrow: "Still at home",
      big: "Leave now",
      sub: `ETA ${formatClock(liveStatus.arrival)}`,
      className: "phase-late",
    };
  }

  const phase: PlanPhase = plan.phase;
  const untilWake = formatDuration(plan.minutesUntilWake);
  const untilLeave = formatDuration(plan.minutesUntilLeave);

  switch (phase) {
    case "sleep":
      return {
        eyebrow: "Wake up at",
        big: formatClock(plan.wakeBy),
        sub: `in ${untilWake}`,
        className: "phase-sleep",
      };
    case "wake":
      return {
        eyebrow: "Rise & shine",
        big: "Wake up",
        sub: `leave in ${untilLeave}`,
        className: "phase-wake",
      };
    case "prep":
      return {
        eyebrow: "Get ready",
        big: `Leave in`,
        sub: untilLeave,
        className: "phase-prep",
      };
    case "leave": {
      const soon = plan.minutesUntilLeave <= 1;
      return {
        eyebrow: soon ? "Time to go" : "Almost time",
        big: soon ? "Leave now" : "Leave in",
        sub: soon ? `arrive ${formatClock(plan.arriveBy)}` : untilLeave,
        className: "phase-leave",
      };
    }
    case "enroute":
      return {
        eyebrow: "On your way",
        big: "Safe travels",
        sub: `arrive ${formatClock(plan.arriveBy)}`,
        className: "phase-enroute",
      };
    default:
      return { eyebrow: "", big: "", sub: "", className: "" };
  }
}

const activeChip: Record<PlanPhase, "wake" | "leave" | "arrive" | null> = {
  sleep: "wake",
  wake: "wake",
  prep: "leave",
  leave: "leave",
  enroute: "arrive",
  "no-home": null,
  "no-commitment": null,
};

export function AlarmCard({
  plan,
  now,
  liveStatus,
  onReviewLocationConsent,
  confidence,
  briefing,
}: Props) {
  const h = hero(plan, liveStatus);
  const { commitment } = plan;
  const active = activeChip[plan.phase];

  const chips: { key: "wake" | "leave" | "arrive"; label: string; at: Date }[] = [
    { key: "wake", label: "Wake", at: plan.wakeBy },
    { key: "leave", label: "Leave", at: plan.leaveBy },
    { key: "arrive", label: "Arrive", at: plan.arriveBy },
  ];

  return (
    <section className={`alarm-card ${h.className}`} aria-live="polite">
      <div className="alarm-dial">
        <RadialTimeline plan={plan} now={now}>
          <p className="ring-eyebrow">{h.eyebrow}</p>
          <div className="ring-big">{h.big}</div>
          <p className="ring-sub">{h.sub}</p>
        </RadialTimeline>
      </div>

      <div className="alarm-chips">
        {chips.map((c) => (
          <div
            key={c.key}
            className={`chip-stat ${active === c.key ? "chip-stat-active" : ""}`}
          >
            <span className="chip-stat-label">{c.label}</span>
            <span className="chip-stat-time">{formatClock(c.at)}</span>
          </div>
        ))}
      </div>

      <LiveDeparturePanel
        status={liveStatus}
        showEnablePrompt={plan.phase === "prep" || plan.phase === "leave"}
        onReviewLocationConsent={onReviewLocationConsent}
      />

      {confidence && <ConfidenceMeter confidence={confidence} />}

      <div className="alarm-commitment">
        <span className="mode-icon" aria-hidden>
          <Icon name={MODE_ICON[commitment.travelMode] ?? "pin"} size={22} />
        </span>
        <div className="commitment-info">
          <div className="commitment-title">{commitment.title}</div>
          <div className="commitment-dest">{commitment.destination.label}</div>
        </div>
        {briefing.supported && (
          <button
            type="button"
            className={`brief-btn ${briefing.speaking ? "on" : ""}`}
            onClick={briefing.onBrief}
            aria-label={briefing.speaking ? "Stop briefing" : "Play morning briefing"}
          >
            <Icon name="sound" size={17} />
            {briefing.speaking ? "Stop" : "Brief me"}
          </button>
        )}
      </div>

      <TrafficBadge estimate={plan.estimate} />
      <TrafficSparkline leaveBy={plan.leaveBy} />
      <div className="alarm-actions">
        <button
          type="button"
          className="secondary-button alarm-action-button"
          onClick={() => downloadSystemReminders(plan)}
        >
          <Icon name="alarm" size={16} />
          Add reminders to Calendar
        </button>
      </div>
    </section>
  );
}

function LiveDeparturePanel({
  status,
  showEnablePrompt,
  onReviewLocationConsent,
}: {
  status: LiveDepartureStatus;
  showEnablePrompt: boolean;
  onReviewLocationConsent: () => void;
}) {
  if (status.kind === "still-home") {
    return (
      <div className="departure-alert departure-alert-late">
        <Icon name="route" size={19} />
        <div>
          <strong>Still at departure point</strong>
          <span>
            Updated arrival {formatClock(status.arrival)}
            {status.delayMinutes > 0 ? ` · ${status.delayMinutes}m late` : ""}
          </span>
        </div>
      </div>
    );
  }

  if (status.kind === "disabled" && showEnablePrompt) {
    return (
      <div className="departure-alert">
        <Icon name="pin" size={19} />
        <div>
          <strong>Live missed-departure checks are off</strong>
          <span>
            Enable browser location checks during your leave window to update ETA
            if you are still at home.
          </span>
        </div>
        <button
          type="button"
          className="mini-button"
          onClick={onReviewLocationConsent}
        >
          Review
        </button>
      </div>
    );
  }

  if (status.kind === "error") {
    return (
      <div className="departure-alert departure-alert-error">
        <Icon name="pin" size={19} />
        <div>
          <strong>Location unavailable</strong>
          <span>{status.message}</span>
        </div>
      </div>
    );
  }

  return null;
}

function downloadSystemReminders(plan: DeparturePlan): void {
  const blob = new Blob([systemReminderCalendar(plan)], {
    type: "text/calendar;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = systemReminderFileName(plan);
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}
