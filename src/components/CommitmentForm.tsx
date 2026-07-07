import { useState } from "react";
import type {
  CalendarProviderId,
  Commitment,
  PlaceUsageContext,
  TravelMode,
  Weekday,
} from "../core/types";
import type { PlaceSuggestion } from "../core/placeHistory";
import {
  WEEKDAY_LABELS,
  minutesToTimeString,
  parseTimeToMinutes,
} from "../core/time";
import { makeId } from "../state/store";
import { PlacePicker } from "./PlacePicker";
import { Icon, MODE_ICON } from "./Icon";

interface Props {
  commitments: Commitment[];
  onChange: (commitments: Commitment[]) => void;
  placeSuggestions: PlaceSuggestion[];
  onPlaceSelected: (place: Commitment["destination"], context: PlaceUsageContext) => void;
}

const MODES: { value: TravelMode; label: string }[] = [
  { value: "drive", label: "Drive" },
  { value: "transit", label: "Transit" },
  { value: "cycle", label: "Cycle" },
  { value: "walk", label: "Walk" },
];

const ALL_DAYS: Weekday[] = [0, 1, 2, 3, 4, 5, 6];
type CommitmentStep = "when" | "where" | "travel";

function blankCommitment(): Commitment {
  return {
    id: makeId("cmt"),
    title: "",
    destination: {
      id: makeId("place"),
      label: "Choose a destination",
      lat: 0,
      lng: 0,
    },
    travelMode: "drive",
    arriveByMinutes: 9 * 60,
    days: [1, 2, 3, 4, 5],
    enabled: false,
  };
}

export function CommitmentForm({
  commitments,
  onChange,
  placeSuggestions,
  onPlaceSelected,
}: Props) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [stepById, setStepById] = useState<Record<string, CommitmentStep>>({});

  const update = (id: string, patch: Partial<Commitment>) =>
    onChange(commitments.map((c) => (c.id === id ? { ...c, ...patch } : c)));

  const remove = (id: string) =>
    onChange(commitments.filter((c) => c.id !== id));

  const add = () => {
    const c = blankCommitment();
    onChange([...commitments, c]);
    setExpandedId(c.id);
    setStepById((steps) => ({ ...steps, [c.id]: "when" }));
  };

  const toggleDay = (c: Commitment, day: Weekday) => {
    const has = c.days.includes(day);
    update(c.id, {
      days: has ? c.days.filter((d) => d !== day) : [...c.days, day].sort(),
    });
  };

  const updateDestination = (
    c: Commitment,
    destination: Commitment["destination"],
  ) => {
    update(c.id, {
      destination,
      enabled: true,
      source: c.source
        ? { ...c.source, needsLocationReview: false }
        : c.source,
    });
    setStep(c.id, "travel");
  };

  const setStep = (id: string, step: CommitmentStep) => {
    setStepById((steps) => ({ ...steps, [id]: step }));
  };

  return (
    <div className="commitments">
      {commitments.length === 0 && (
        <p className="muted">No commitments yet. Add your first one below.</p>
      )}

      {commitments.map((c) => {
        const open = expandedId === c.id;
        const step = stepById[c.id] ?? "when";
        const needsDestination = isDraftDestination(c);
        return (
          <div
            key={c.id}
            className={`commitment-row ${c.enabled ? "" : "disabled"} ${
              open ? "expanded" : ""
            }`}
          >
            <div className="commitment-head">
              <label className="switch" title={c.enabled ? "Enabled" : "Disabled"}>
                <input
                  type="checkbox"
                  aria-label={`${c.enabled ? "Disable" : "Enable"} ${
                    c.title || "draft commitment"
                  }`}
                  checked={c.enabled}
                  disabled={needsDestination}
                  onChange={(e) => update(c.id, { enabled: e.target.checked })}
                />
                <span className="slider" />
              </label>
              <span className="commitment-mode" aria-hidden>
                <Icon name={MODE_ICON[c.travelMode] ?? "pin"} size={18} />
              </span>
              <button
                type="button"
                className="commitment-summary"
                onClick={() => setExpandedId(open ? null : c.id)}
                aria-expanded={open}
              >
                <strong>{c.title || "New commitment"}</strong>
                <span className="muted">
                  {c.enabled ? "" : "Draft · "}
                  {minutesToTimeString(c.arriveByMinutes)} ·{" "}
                  {needsDestination
                    ? "add destination"
                    : c.destination.label}
                </span>
                {c.source?.kind === "calendar" && (
                  <span
                    className={`source-pill ${
                      c.source.needsLocationReview ? "source-pill-warn" : ""
                    }`}
                  >
                    {providerLabel(c.source.provider)}
                    {c.source.needsLocationReview ? " · review location" : ""}
                  </span>
                )}
              </button>
              <span
                className={`commitment-chevron ${open ? "open" : ""}`}
                aria-hidden
              >
                <Icon name="chevron" size={16} />
              </span>
              {open && (
                <button
                  type="button"
                  className="icon-button"
                  aria-label="Delete commitment"
                  onClick={() => remove(c.id)}
                >
                  <Icon name="close" size={16} />
                </button>
              )}
            </div>

            {open && (
              <div className="commitment-body">
                <div className="commitment-stepper" role="tablist" aria-label="Commitment steps">
                  {COMMITMENT_STEPS.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      role="tab"
                      aria-selected={step === item.id}
                      className={`step-tab ${step === item.id ? "step-tab-active" : ""}`}
                      onClick={() => setStep(c.id, item.id)}
                    >
                      <span>{item.index}</span>
                      {item.label}
                    </button>
                  ))}
                </div>

                {step === "when" && (
                  <div className="step-panel">
                    <div className="field-grid">
                      <label className="field">
                        <span>What is it?</span>
                        <input
                          type="text"
                          value={c.title}
                          placeholder="Class, practice, meeting..."
                          onChange={(e) => update(c.id, { title: e.target.value })}
                        />
                      </label>
                      <label className="field">
                        <span>Arrive by</span>
                        <input
                          type="time"
                          value={minutesToTimeString(c.arriveByMinutes)}
                          onChange={(e) => {
                            const mins = parseTimeToMinutes(e.target.value);
                            if (mins != null) update(c.id, { arriveByMinutes: mins });
                          }}
                        />
                      </label>
                    </div>
                    <StepActions onNext={() => setStep(c.id, "where")} />
                  </div>
                )}

                {step === "where" && (
                  <div className="step-panel">
                    <PlacePicker
                      label="Destination"
                      value={
                        needsDestination
                          ? null
                          : c.destination
                      }
                      suggestions={placeSuggestions}
                      onChange={(destination) => updateDestination(c, destination)}
                      onPlaceSelected={(place) =>
                        onPlaceSelected(place, currentPlaceContext(c))
                      }
                    />
                    <StepActions
                      onBack={() => setStep(c.id, "when")}
                      onNext={() => setStep(c.id, "travel")}
                      nextDisabled={needsDestination}
                    />
                  </div>
                )}

                {step === "travel" && (
                  <div className="step-panel">
                    <div className="field">
                      <span className="field-label">Travel mode</span>
                      <div className="segmented" role="group" aria-label="Travel mode">
                        {MODES.map((m) => (
                          <button
                            key={m.value}
                            type="button"
                            className={`segment ${c.travelMode === m.value ? "on" : ""}`}
                            onClick={() => update(c.id, { travelMode: m.value })}
                            aria-pressed={c.travelMode === m.value}
                          >
                            <Icon name={MODE_ICON[m.value] ?? "pin"} size={18} />
                            <span>{m.label}</span>
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="field">
                      <span className="field-label">Repeats</span>
                      <div className="days-row" role="group" aria-label="Repeat days">
                        {ALL_DAYS.map((d) => (
                          <button
                            key={d}
                            type="button"
                            className={`day-toggle ${c.days.includes(d) ? "on" : ""}`}
                            onClick={() => toggleDay(c, d)}
                            aria-pressed={c.days.includes(d)}
                          >
                            {WEEKDAY_LABELS[d]}
                          </button>
                        ))}
                      </div>
                    </div>
                    <StepActions
                      onBack={() => setStep(c.id, "where")}
                      onNext={() => setExpandedId(null)}
                      nextLabel="Done"
                    />
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}

      <button type="button" className="add-button" onClick={add}>
        <Icon name="plus" size={17} />
        New commitment
      </button>
    </div>
  );
}

const COMMITMENT_STEPS: {
  id: CommitmentStep;
  label: string;
  index: string;
}[] = [
  { id: "when", label: "What & when", index: "1" },
  { id: "where", label: "Where", index: "2" },
  { id: "travel", label: "How often", index: "3" },
];

function StepActions({
  onBack,
  onNext,
  nextLabel = "Next",
  nextDisabled = false,
}: {
  onBack?: () => void;
  onNext?: () => void;
  nextLabel?: string;
  nextDisabled?: boolean;
}) {
  return (
    <div className="step-actions">
      {onBack && (
        <button type="button" className="secondary-button" onClick={onBack}>
          Back
        </button>
      )}
      {onNext && (
        <button
          type="button"
          className="primary-button"
          disabled={nextDisabled}
          onClick={onNext}
        >
          {nextLabel}
        </button>
      )}
    </div>
  );
}

function currentPlaceContext(commitment: Commitment): PlaceUsageContext {
  const now = new Date();
  return {
    kind: "destination",
    weekday: now.getDay() as Weekday,
    hour: now.getHours(),
    travelMode: commitment.travelMode,
  };
}

function isDraftDestination(commitment: Commitment): boolean {
  return commitment.destination.label === "Choose a destination";
}

function providerLabel(provider: CalendarProviderId): string {
  return provider === "google" ? "Google Calendar" : "Apple Calendar";
}
