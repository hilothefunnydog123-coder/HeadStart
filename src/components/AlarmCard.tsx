import { useEffect, useState } from "react";
import type { DeparturePlan, PlanPhase, TravelMode } from "../core/types";
import type { Settings } from "../core/types";
import type { Confidence } from "../core/confidence";
import { arrivalBufferMinutesFor } from "../core/departure";
import { compareTravelModes } from "../core/modeCompare";
import { formatClock, formatDuration } from "../core/time";
import { distanceLabel } from "../core/travelDisplay";
import {
  TRAVEL_MODE_OPTIONS,
  travelModeLabel,
} from "../core/travelModes";
import { TrafficBadge } from "./TrafficBadge";
import { TrafficSparkline } from "./TrafficSparkline";
import { RadialTimeline } from "./RadialTimeline";
import { ConfidenceMeter } from "./ConfidenceMeter";
import { Icon, MODE_ICON } from "./Icon";
import { RouteMap } from "./RouteMap";
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
  onTravelModeChange: (commitmentId: string, mode: TravelMode) => void;
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
  const isCatch = plan.commitment.kind === "catch";

  if (liveStatus.kind === "still-home") {
    return {
      eyebrow: "Still at home",
      big: "Leave now",
      sub: isCatch
        ? `it leaves at ${formatClock(plan.arriveBy)}`
        : `ETA ${formatClock(liveStatus.arrival)}`,
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
        sub: isCatch
          ? `to catch the ${formatClock(plan.arriveBy)}`
          : `in ${untilWake}`,
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
        sub: soon
          ? isCatch
            ? `catch it at ${formatClock(plan.arriveBy)}`
            : `arrive ${formatClock(plan.arriveBy)}`
          : untilLeave,
        className: "phase-leave",
      };
    }
    case "enroute":
      return {
        eyebrow: "On your way",
        big: "Safe travels",
        sub: isCatch
          ? `it departs ${formatClock(plan.arriveBy)}`
          : `arrive ${formatClock(plan.arriveBy)}`,
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
  settings,
  liveStatus,
  onReviewLocationConsent,
  onTravelModeChange,
  confidence,
  briefing,
}: Props) {
  const h = hero(plan, liveStatus);
  const { commitment } = plan;
  const isCatch = commitment.kind === "catch";
  const active = activeChip[plan.phase];
  const prepMinutes = commitment.prepMinutesOverride ?? settings.prepMinutes;

  const chips: { key: "wake" | "leave" | "arrive"; label: string; at: Date }[] = [
    { key: "wake", label: "Wake", at: plan.wakeBy },
    { key: "leave", label: "Leave", at: plan.leaveBy },
    { key: "arrive", label: isCatch ? "Catch" : "Arrive", at: plan.arriveBy },
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
      <RouteMap
        plan={plan}
        settings={settings}
        now={now}
        onEnableLocation={onReviewLocationConsent}
      />

      {confidence && <ConfidenceMeter confidence={confidence} />}

      <div className="alarm-commitment">
        <span className="mode-icon" aria-hidden>
          <Icon name={MODE_ICON[commitment.travelMode] ?? "pin"} size={22} />
        </span>
        <div className="commitment-info">
          <div className="commitment-title">{commitment.title}</div>
          <div className="commitment-dest">
            {isCatch
              ? `Departs ${formatClock(plan.arriveBy)} · ${commitment.destination.label}`
              : commitment.destination.label}
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

      <TrafficBadge
        estimate={plan.estimate}
        mode={plan.commitment.travelMode}
      />
      <PlanDetails
        plan={plan}
        settings={settings}
        prepMinutes={prepMinutes}
        now={now}
        onTravelModeChange={onTravelModeChange}
      />
      <TrafficSparkline
        leaveBy={plan.leaveBy}
        mode={plan.commitment.travelMode}
      />
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

function PlanDetails({
  plan,
  settings,
  prepMinutes,
  now,
  onTravelModeChange,
}: {
  plan: DeparturePlan;
  settings: Settings;
  prepMinutes: number;
  now: Date;
  onTravelModeChange: (commitmentId: string, mode: TravelMode) => void;
}) {
  const sourceIsLive = !/simulated|offline/i.test(plan.estimate.source);
  const currentMode = plan.commitment.travelMode;

  // Estimate every mode for this trip so switching is an informed choice.
  const [modeSeconds, setModeSeconds] = useState<Map<TravelMode, number> | null>(
    null,
  );
  const origin = settings.home;
  const destination = plan.commitment.destination;
  const leaveMinuteBucket = Math.floor(plan.leaveBy.getTime() / 60_000);
  useEffect(() => {
    if (!origin) return;
    let cancelled = false;
    compareTravelModes(origin, destination, new Date(leaveMinuteBucket * 60_000))
      .then((estimates) => {
        if (cancelled) return;
        setModeSeconds(
          new Map(estimates.map((e) => [e.mode, e.durationSeconds])),
        );
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [origin?.lat, origin?.lng, destination.lat, destination.lng, leaveMinuteBucket]);

  return (
    <div className="plan-details" aria-label="Wake time explanation">
      <div className="plan-source-row">
        <span className={`source-badge ${sourceIsLive ? "live" : "simulated"}`}>
          {sourceIsLive ? "Live route" : "Offline simulation"}
        </span>
        <span>Updated {formatClock(now)}</span>
      </div>
      <div className="route-preview">
        <strong>{settings.home?.label ?? "Start"}</strong>
        <span>to</span>
        <strong>{plan.commitment.destination.label}</strong>
      </div>
      <div className="route-meta">
        {travelModeLabel(currentMode)} · {distanceLabel(plan.estimate.distanceMeters)} ·{" "}
        {plan.estimate.source}
      </div>
      <div className="travel-mode-control">
        <span className="field-label">Travel mode</span>
        <div
          className="segmented compact travel-mode-segments"
          role="group"
          aria-label="Travel mode"
        >
          {TRAVEL_MODE_OPTIONS.map((mode) => {
            const seconds = modeSeconds?.get(mode.value);
            return (
              <button
                key={mode.value}
                type="button"
                className={`segment ${currentMode === mode.value ? "on" : ""}`}
                onClick={() => onTravelModeChange(plan.commitment.id, mode.value)}
                aria-pressed={currentMode === mode.value}
                aria-label={`Use ${mode.label}`}
                title={
                  seconds != null
                    ? `About ${formatDuration(seconds / 60)} by ${mode.label.toLowerCase()}`
                    : undefined
                }
              >
                <Icon name={MODE_ICON[mode.value] ?? "pin"} size={18} />
                <span>{mode.label}</span>
                <span className="segment-eta">
                  {seconds != null ? `~${formatDuration(seconds / 60)}` : "…"}
                </span>
              </button>
            );
          })}
        </div>
      </div>
      <div className="wake-breakdown">
        <span>
          {plan.commitment.kind === "catch" ? "Departs" : "Arrive"}{" "}
          {formatClock(plan.arriveBy)}
        </span>
        <span>
          - {formatDuration(arrivalBufferMinutesFor(plan.commitment, settings))}{" "}
          {plan.commitment.kind === "catch" ? "at the stop" : "buffer"}
        </span>
        <span>- {formatDuration(plan.estimate.durationSeconds / 60)} travel</span>
        <span>- {formatDuration(prepMinutes)} prep</span>
        <span>- {formatDuration(settings.wakeAheadMinutes)} wake cushion</span>
      </div>
    </div>
  );
}

function AlarmReliabilityNotice() {
  return (
    <div className="reliability-notice">
      <Icon name="alarm" size={17} />
      <div>
        <strong>Use Calendar reminders for critical mornings</strong>
        <span>
          Browser alerts work best while Departure is open or installed as a PWA;
          calendar reminders are the system-level backup.
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
