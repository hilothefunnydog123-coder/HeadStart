import { useCallback, useEffect, useRef, useState } from "react";
import type {
  CalendarProviderId,
  Commitment,
  PlaceUsageContext,
  Weekday,
} from "../core/types";
import type { PlaceSuggestion } from "../core/placeHistory";
import {
  WEEKDAY_LABELS,
  isoDate,
  minutesToTimeString,
  parseTimeToMinutes,
} from "../core/time";
import { DEFAULT_BOARDING_BUFFER_MIN } from "../core/departure";
import { makeId } from "../state/store";
import { PlacePicker } from "./PlacePicker";
import { Icon, MODE_ICON } from "./Icon";
import { TRAVEL_MODE_OPTIONS } from "../core/travelModes";

interface Props {
  commitments: Commitment[];
  createRequest?: number;
  onChange: (commitments: Commitment[]) => void;
  placeSuggestions: PlaceSuggestion[];
  searchBias: Commitment["destination"] | null;
  onPlaceSelected: (place: Commitment["destination"], context: PlaceUsageContext) => void;
  onDismissPlaceSuggestion: (
    historyId: string,
    context: PlaceUsageContext,
  ) => void;
}

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
  createRequest = 0,
  onChange,
  placeSuggestions,
  searchBias,
  onPlaceSelected,
  onDismissPlaceSuggestion,
}: Props) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [stepById, setStepById] = useState<Record<string, CommitmentStep>>({});
  const handledCreateRequest = useRef(0);

  const update = (id: string, patch: Partial<Commitment>) =>
    onChange(commitments.map((c) => (c.id === id ? { ...c, ...patch } : c)));

  const remove = (id: string) => {
    const commitment = commitments.find((c) => c.id === id);
    const name = commitment?.title || "this commitment";
    if (window.confirm(`Delete ${name}?`)) {
      onChange(commitments.filter((c) => c.id !== id));
    }
  };

  const add = useCallback(() => {
    const draft = commitments.find((c) => isIncompleteDraft(c));
    if (draft) {
      setExpandedId(draft.id);
      setStepById((steps) => ({ ...steps, [draft.id]: "when" }));
      return;
    }
    const c = blankCommitment();
    onChange([...commitments, c]);
    setExpandedId(c.id);
    setStepById((steps) => ({ ...steps, [c.id]: "when" }));
  }, [commitments, onChange]);

  useEffect(() => {
    if (createRequest <= handledCreateRequest.current) return;
    handledCreateRequest.current = createRequest;
    add();
  }, [add, createRequest]);

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

  const visibleCommitments = commitments.filter(
    (c) => !isIncompleteDraft(c) || c.id === expandedId,
  );
  const hiddenDrafts = commitments.filter(
    (c) => isIncompleteDraft(c) && c.id !== expandedId,
  );

  return (
    <div className="commitments">
      {commitments.length === 0 && (
        <div className="commitments-empty">
          <span className="commitments-empty-icon" aria-hidden>
            <Icon name="alarm" size={20} />
          </span>
          <div>
            <strong>Your schedule is clear</strong>
            <p>Add the first place you need to be and when you need to arrive.</p>
          </div>
        </div>
      )}

      {visibleCommitments.map((c) => {
        const open = expandedId === c.id;
        const step = stepById[c.id] ?? "when";
        const needsDestination = isDraftDestination(c);
        const isOneOff = c.days.length === 0;
        const isCatch = c.kind === "catch";
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
                  {isCatch ? "departs " : ""}
                  {minutesToTimeString(c.arriveByMinutes)} ·{" "}
                  {needsDestination
                    ? isCatch
                      ? "add the stop"
                      : "add destination"
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
                    <div className="field">
                      <span className="field-label">Kind of deadline</span>
                      <div
                        className="segmented compact"
                        role="group"
                        aria-label="Kind of deadline"
                      >
                        <button
                          type="button"
                          className={`segment ${!isCatch ? "on" : ""}`}
                          onClick={() => update(c.id, { kind: "arrive" })}
                          aria-pressed={!isCatch}
                        >
                          <Icon name="pin" size={16} />
                          <span>Be somewhere</span>
                        </button>
                        <button
                          type="button"
                          className={`segment ${isCatch ? "on" : ""}`}
                          onClick={() => update(c.id, { kind: "catch" })}
                          aria-pressed={isCatch}
                        >
                          <Icon name="transit" size={16} />
                          <span>Catch a bus / train</span>
                        </button>
                      </div>
                      {isCatch && (
                        <small className="muted">
                          It leaves on its schedule, not yours — we'll get you to
                          the stop with time to spare.
                        </small>
                      )}
                    </div>

                    <div className="field-grid">
                      <label className="field">
                        <span>What is it?</span>
                        <input
                          type="text"
                          value={c.title}
                          placeholder={
                            isCatch
                              ? "Bus 38R, the 8:12 train..."
                              : "Class, practice, meeting..."
                          }
                          onChange={(e) => update(c.id, { title: e.target.value })}
                        />
                      </label>
                      <label className="field">
                        <span>{isCatch ? "It departs at" : "Arrive by"}</span>
                        <input
                          type="time"
                          value={minutesToTimeString(c.arriveByMinutes)}
                          onChange={(e) => {
                            const mins = parseTimeToMinutes(e.target.value);
                            if (mins != null) update(c.id, { arriveByMinutes: mins });
                          }}
                        />
                      </label>
                      {isCatch && (
                        <label className="field">
                          <span>At the stop early (min)</span>
                          <input
                            type="number"
                            min={0}
                            max={30}
                            value={
                              c.boardingBufferMinutes ?? DEFAULT_BOARDING_BUFFER_MIN
                            }
                            onChange={(e) => {
                              const n = Math.round(Number(e.target.value));
                              if (Number.isFinite(n)) {
                                update(c.id, {
                                  boardingBufferMinutes: Math.min(30, Math.max(0, n)),
                                });
                              }
                            }}
                          />
                        </label>
                      )}
                    </div>
                    <StepActions onNext={() => setStep(c.id, "where")} />
                  </div>
                )}

                {step === "where" && (
                  <div className="step-panel">
                    <PlacePicker
                      label={isCatch ? "Stop or station" : "Destination"}
                      value={
                        needsDestination
                          ? null
                          : c.destination
                      }
                      suggestions={placeSuggestions}
                      searchBias={searchBias}
                      onChange={(destination) => updateDestination(c, destination)}
                      onDismissSuggestion={(historyId) =>
                        onDismissPlaceSuggestion(historyId, currentPlaceContext(c))
                      }
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
                        {TRAVEL_MODE_OPTIONS.map((m) => (
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
                      <div className="segmented compact" role="group" aria-label="Schedule type">
                        <button
                          type="button"
                          className={`segment ${!isOneOff ? "on" : ""}`}
                          onClick={() =>
                            update(c.id, {
                              days: c.days.length > 0 ? c.days : [1, 2, 3, 4, 5],
                              oneOffDate: undefined,
                            })
                          }
                          aria-pressed={!isOneOff}
                        >
                          Weekly
                        </button>
                        <button
                          type="button"
                          className={`segment ${isOneOff ? "on" : ""}`}
                          onClick={() =>
                            update(c.id, {
                              days: [],
                              oneOffDate: c.oneOffDate ?? defaultOneOffDate(),
                            })
                          }
                          aria-pressed={isOneOff}
                        >
                          One day
                        </button>
                      </div>
                      {!isOneOff ? (
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
                      ) : (
                        <label className="field one-off-date-field">
                          <span>Date</span>
                          <input
                            type="date"
                            value={c.oneOffDate ?? defaultOneOffDate()}
                            onChange={(e) =>
                              update(c.id, {
                                days: [],
                                oneOffDate: e.target.value || defaultOneOffDate(),
                              })
                            }
                          />
                        </label>
                      )}
                    </div>
                    <StepActions
                      onBack={() => setStep(c.id, "where")}
                      onNext={() => setExpandedId(null)}
                      nextLabel="Done"
                      nextDisabled={
                        (!isOneOff && c.days.length === 0) ||
                        (isOneOff && !c.oneOffDate)
                      }
                    />
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}

      {hiddenDrafts.length > 0 && (
        <div className="draft-cleanup">
          <span>
            {hiddenDrafts.length} incomplete{" "}
            {hiddenDrafts.length === 1 ? "draft" : "drafts"} hidden
          </span>
          <div>
            <button
              type="button"
              className="link-button"
              onClick={() => {
                const latest = hiddenDrafts[hiddenDrafts.length - 1];
                if (latest) {
                  setExpandedId(latest.id);
                  setStepById((steps) => ({ ...steps, [latest.id]: "when" }));
                }
              }}
            >
              Resume
            </button>
            <button
              type="button"
              className="link-button danger-link"
              onClick={() => {
                if (window.confirm("Discard incomplete draft commitments?")) {
                  onChange(commitments.filter((c) => !isIncompleteDraft(c)));
                }
              }}
            >
              Discard
            </button>
          </div>
        </div>
      )}

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
  { id: "travel", label: "Travel & repeats", index: "3" },
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

function isIncompleteDraft(commitment: Commitment): boolean {
  return !commitment.enabled && isDraftDestination(commitment);
}

function defaultOneOffDate(): string {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  return isoDate(tomorrow);
}

function providerLabel(provider: CalendarProviderId): string {
  if (provider === "google") return "Google Calendar";
  if (provider === "apple") return "Apple Calendar";
  return "Device Calendar";
}
