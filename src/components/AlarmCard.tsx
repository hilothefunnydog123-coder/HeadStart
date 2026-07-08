import type { DeparturePlan, Place, PlanPhase } from "../core/types";
import type { Settings } from "../core/types";
import type { Confidence } from "../core/confidence";
import { formatClock, formatDuration } from "../core/time";
import {
  displayDestination,
  displayItemKind,
  isStudyItem,
  isTestItem,
} from "../core/schedule";
import { distanceLabel } from "../core/travelDisplay";
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
  settings: Settings;
  liveStatus: LiveDepartureStatus;
  onReviewLocationConsent: () => void;
  originOverride: Place | null;
  originOverrideSource: "manual" | "live" | "campus" | null;
  originMessage: string | null;
  checkingOrigin: boolean;
  onUseCurrentOrigin: () => void;
  onUseCampusOrigin?: () => void;
  onUseDestinationOrigin: () => void;
  onClearOriginOverride: () => void;
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
      eyebrow: "You are late",
      big: "Leave now",
      sub: `ETA ${formatClock(liveStatus.arrival)}`,
      className: "phase-late",
    };
  }

  const phase: PlanPhase = plan.phase;
  const untilPrep = formatDuration(plan.minutesUntilWake);
  const untilLeave = formatDuration(plan.minutesUntilLeave);
  const kind = displayItemKind(plan.commitment).toLowerCase();

  if (isStudyItem(plan.commitment)) {
    if (phase === "sleep") {
      return {
        eyebrow: "Study session",
        big: "Study in",
        sub: `${formatDuration(plan.minutesUntilArrive)} · ${studyLabel(plan)}`,
        className: "phase-sleep",
      };
    }
    if (phase === "wake" || phase === "prep") {
      return {
        eyebrow: "Study soon",
        big: "Get set",
        sub: `starts in ${formatDuration(plan.minutesUntilArrive)}`,
        className: "phase-prep",
      };
    }
    if (phase === "leave") {
      return {
        eyebrow: "Study time",
        big: "Study now",
        sub: `${studyLabel(plan)} · ${formatClock(plan.arriveBy)}`,
        className: "phase-leave",
      };
    }
  }

  switch (phase) {
    case "sleep":
      return plan.usesWake
        ? {
            eyebrow: "First class prep",
            big: formatClock(plan.wakeBy),
            sub: `start in ${untilPrep}`,
            className: "phase-sleep",
          }
        : {
            eyebrow: "Plenty of time",
            big: "Prep at",
            sub: `${formatClock(plan.wakeBy)} · ${kind} at ${formatClock(plan.arriveBy)}`,
            className: "phase-sleep",
          };
    case "wake":
      return {
        eyebrow: plan.usesWake ? "Morning prep" : "Start getting ready",
        big: plan.usesWake ? "Get up" : "Prep now",
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
        eyebrow: isStudyItem(plan.commitment)
          ? "Study time"
          : isTestItem(plan.commitment)
            ? "Test started"
            : "In class",
        big: isStudyItem(plan.commitment) ? "Focus" : "You made it",
        sub: `${displayItemKind(plan.commitment)} started ${formatClock(plan.arriveBy)}`,
        className: "phase-enroute",
      };
    default:
      return { eyebrow: "", big: "", sub: "", className: "" };
  }
}

function studyLabel(plan: DeparturePlan): string {
  return plan.commitment.courseId || plan.commitment.title.replace(/^Study\s+/i, "");
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
  settings,
  liveStatus,
  onReviewLocationConsent,
  originOverride,
  originOverrideSource,
  originMessage,
  checkingOrigin,
  onUseCurrentOrigin,
  onUseCampusOrigin,
  onUseDestinationOrigin,
  onClearOriginOverride,
  confidence,
  briefing,
}: Props) {
  const h = hero(plan, liveStatus);
  const { commitment } = plan;
  const active = activeChip[plan.phase];
  const prepMinutes =
    commitment.prepMinutesOverride ??
    (plan.usesWake ? settings.prepMinutes : settings.campusPrepMinutes ?? 5);

  const chips: { key: "wake" | "leave" | "arrive"; label: string; at: Date }[] = [
    { key: "wake", label: plan.usesWake ? "Wake" : "Prep", at: plan.wakeBy },
    { key: "leave", label: "Leave", at: plan.leaveBy },
    { key: "arrive", label: isStudyItem(commitment) ? "Study" : "Arrive", at: plan.arriveBy },
  ];

  return (
    <section className={`alarm-card ${h.className}`}>
      <div className="alarm-dial">
        <RadialTimeline plan={plan} now={now}>
          <div role="status" aria-live="polite" aria-atomic="true">
            <p className="ring-eyebrow">{h.eyebrow}</p>
            <div className="ring-big">{h.big}</div>
            <p className="ring-sub">{h.sub}</p>
          </div>
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
      <StartPointControls
        originOverride={originOverride}
        originOverrideSource={originOverrideSource}
        originMessage={originMessage}
        checkingOrigin={checkingOrigin}
        onUseCurrentOrigin={onUseCurrentOrigin}
        onUseCampusOrigin={onUseCampusOrigin}
        onUseDestinationOrigin={onUseDestinationOrigin}
        onClearOriginOverride={onClearOriginOverride}
      />
      <TransitionWarning plan={plan} />

      {confidence && <ConfidenceMeter confidence={confidence} />}

      <div className="alarm-commitment">
        <span className="mode-icon" aria-hidden>
          <Icon name={MODE_ICON[commitment.travelMode] ?? "pin"} size={22} />
        </span>
        <div className="commitment-info">
          <div className="commitment-title">{commitment.title}</div>
          <div className="commitment-dest">
            {displayItemKind(commitment)} · {displayDestination(commitment)}
          </div>
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
      <PlanDetails
        plan={plan}
        settings={settings}
        prepMinutes={prepMinutes}
        now={now}
      />
      <TrafficSparkline leaveBy={plan.leaveBy} />
      <AlarmReliabilityNotice />
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

function StartPointControls({
  originOverride,
  originOverrideSource,
  originMessage,
  checkingOrigin,
  onUseCurrentOrigin,
  onUseCampusOrigin,
  onUseDestinationOrigin,
  onClearOriginOverride,
}: {
  originOverride: Place | null;
  originOverrideSource: "manual" | "live" | "campus" | null;
  originMessage: string | null;
  checkingOrigin: boolean;
  onUseCurrentOrigin: () => void;
  onUseCampusOrigin?: () => void;
  onUseDestinationOrigin: () => void;
  onClearOriginOverride: () => void;
}) {
  const label =
    originOverrideSource === "campus"
      ? "Already on campus"
      : originOverrideSource === "live"
        ? "Live location"
        : originOverride
          ? "Current location"
          : "Start point";

  return (
    <div className="start-point-controls">
      <div>
        <strong>{label}</strong>
        <span>
          {originOverride
            ? originOverride.label
            : "Use a temporary start point if today is different."}
        </span>
        {originMessage && <small>{originMessage}</small>}
      </div>
      <div className="start-point-actions">
        <button
          type="button"
          className="secondary-button"
          disabled={checkingOrigin}
          onClick={onUseCurrentOrigin}
        >
          <Icon name="pin" size={15} />
          {checkingOrigin ? "Checking..." : "I'm leaving from here"}
        </button>
        {onUseCampusOrigin && (
          <button
            type="button"
            className="secondary-button"
            onClick={onUseCampusOrigin}
          >
            <Icon name="route" size={15} />
            Already on campus
          </button>
        )}
        <button
          type="button"
          className="secondary-button"
          onClick={onUseDestinationOrigin}
        >
          <Icon name="pin" size={15} />
          I'm already there
        </button>
        {originOverride && (
          <button
            type="button"
            className="icon-button"
            aria-label="Clear temporary start point"
            onClick={onClearOriginOverride}
          >
            <Icon name="close" size={14} />
          </button>
        )}
      </div>
    </div>
  );
}

function PlanDetails({
  plan,
  settings,
  prepMinutes,
  now,
}: {
  plan: DeparturePlan;
  settings: Settings;
  prepMinutes: number;
  now: Date;
}) {
  const sourceIsLive = !/simulated|offline/i.test(plan.estimate.source);
  return (
    <div className="plan-details" aria-label="Wake time explanation">
      <div className="plan-source-row">
        <span className={`source-badge ${sourceIsLive ? "live" : "simulated"}`}>
          {sourceIsLive ? "Live route" : "Offline simulation"}
        </span>
        <span>Updated {formatClock(now)}</span>
      </div>
      <div className="route-preview">
        <strong>{plan.originLabel}</strong>
        <span>to</span>
        <strong>{displayDestination(plan.commitment)}</strong>
      </div>
      <div className="route-meta">
        {distanceLabel(plan.estimate.distanceMeters)} · {plan.estimate.source}
      </div>
      <div className="wake-breakdown">
        <span>{isStudyItem(plan.commitment) ? "Start" : "Arrive"} {formatClock(plan.arriveBy)}</span>
        <span>- {formatDuration(settings.arrivalBufferMinutes)} buffer</span>
        <span>- {formatDuration(plan.estimate.durationSeconds / 60)} travel</span>
        <span>- {formatDuration(prepMinutes)} prep</span>
        {plan.usesWake && (
          <span>- {formatDuration(settings.wakeAheadMinutes)} wake cushion</span>
        )}
      </div>
    </div>
  );
}

function TransitionWarning({ plan }: { plan: DeparturePlan }) {
  if (plan.impossibleTransition) {
    return (
      <div className="departure-alert departure-alert-error">
        <Icon name="route" size={19} />
        <div>
          <strong>Class gap is too tight</strong>
          <span>
            {plan.gapMinutes ?? 0} min between items is not enough for this trip.
          </span>
        </div>
      </div>
    );
  }

  if (plan.gapMinutes != null && plan.previousCommitment) {
    return (
      <div className="departure-alert departure-alert-gap">
        <Icon name="route" size={19} />
        <div>
          <strong>{plan.gapMinutes} min between schedule items</strong>
          <span>Starting from {plan.previousCommitment.destination.label}.</span>
        </div>
      </div>
    );
  }

  return null;
}

function AlarmReliabilityNotice() {
  return (
    <div className="reliability-notice">
      <Icon name="alarm" size={17} />
      <div>
        <strong>Use Calendar reminders for critical classes</strong>
        <span>
          Browser alerts work best while HeadStart is open or installed as a PWA;
          calendar reminders are the system-level backup for classes and tests.
        </span>
      </div>
    </div>
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
          <strong>Still at start point</strong>
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
            if you are still at the start point.
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
