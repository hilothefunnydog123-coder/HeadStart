import { useState } from "react";
import type {
  CalendarProviderId,
  Commitment,
  PlaceUsageContext,
  Settings,
  TestDifficulty,
  TravelMode,
  Weekday,
} from "../core/types";
import type { PlaceSuggestion } from "../core/placeHistory";
import {
  createStudySessionsForTest,
  createTestAndStudyItems,
  displayDestination,
  displayItemKind,
  isClassItem,
  isStudyItem,
  isTestItem,
  itemType,
  rescheduleStudySession,
} from "../core/schedule";
import {
  WEEKDAY_LABELS,
  isoDate,
  minutesToTimeString,
  parseTimeToMinutes,
} from "../core/time";
import { makeId } from "../state/store";
import { PlacePicker } from "./PlacePicker";
import { Icon, MODE_ICON } from "./Icon";

interface Props {
  commitments: Commitment[];
  onChange: (commitments: Commitment[]) => void;
  settings: Settings;
  placeSuggestions: PlaceSuggestion[];
  searchBias: Commitment["destination"] | null;
  onPlaceSelected: (place: Commitment["destination"], context: PlaceUsageContext) => void;
  onDismissPlaceSuggestion: (
    historyId: string,
    context: PlaceUsageContext,
  ) => void;
}

const MODES: { value: TravelMode; label: string }[] = [
  { value: "walk", label: "Walk" },
  { value: "drive", label: "Drive" },
  { value: "transit", label: "Transit" },
  { value: "cycle", label: "Cycle" },
];
const ITEM_TYPES: Array<{ value: NonNullable<Commitment["itemType"]>; label: string }> = [
  { value: "class", label: "Class" },
  { value: "event", label: "Event" },
  { value: "test", label: "Test" },
  { value: "study", label: "Study" },
];
const DIFFICULTIES: Array<{ value: TestDifficulty; label: string; minutes: number }> = [
  { value: "light", label: "Light", minutes: 90 },
  { value: "standard", label: "Standard", minutes: 180 },
  { value: "heavy", label: "Heavy", minutes: 360 },
];

const ALL_DAYS: Weekday[] = [0, 1, 2, 3, 4, 5, 6];
type CommitmentStep = "when" | "where" | "travel";

function blankCommitment(): Commitment {
  return {
    id: makeId("cmt"),
    title: "",
    itemType: "class",
    destination: {
      id: makeId("place"),
      label: "Choose a building",
      lat: 0,
      lng: 0,
    },
    travelMode: "walk",
    arriveByMinutes: 9 * 60,
    days: [1, 2, 3, 4, 5],
    enabled: false,
    originStrategy: "previous",
  };
}

export function CommitmentForm({
  commitments,
  onChange,
  settings,
  placeSuggestions,
  searchBias,
  onPlaceSelected,
  onDismissPlaceSuggestion,
}: Props) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [stepById, setStepById] = useState<Record<string, CommitmentStep>>({});
  const [plannerClassId, setPlannerClassId] = useState<string>("");

  const update = (id: string, patch: Partial<Commitment>) =>
    onChange(commitments.map((c) => (c.id === id ? { ...c, ...patch } : c)));

  const remove = (id: string) => {
    const commitment = commitments.find((c) => c.id === id);
    const name = commitment?.title || "this schedule item";
    if (window.confirm(`Delete ${name}?`)) {
      onChange(commitments.filter((c) => c.id !== id));
    }
  };

  const add = () => {
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
      buildingName: c.buildingName || destination.label.split(",")[0]?.trim(),
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
        <p className="muted">No classes yet. Add your first one below.</p>
      )}

      <TestPlanner
        commitments={commitments}
        settings={settings}
        selectedClassId={plannerClassId}
        onSelectedClassChange={setPlannerClassId}
        onChange={onChange}
      />
      <StudyWarnings commitments={commitments} />
      <ConflictWarnings commitments={commitments} />

      {visibleCommitments.map((c) => {
        const open = expandedId === c.id;
        const step = stepById[c.id] ?? "when";
        const needsDestination = isDraftDestination(c);
        const isOneOff = c.days.length === 0;
        const relatedStudySessions = commitments.filter(
          (item) => isStudyItem(item) && item.study?.relatedTestId === c.id,
        );
        return (
          <div
            key={c.id}
            className={`commitment-row schedule-type-${itemType(c)} ${
              c.enabled ? "" : "disabled"
            } ${open ? "expanded" : ""}`}
          >
            <div className="commitment-head">
              <label className="switch" title={c.enabled ? "Enabled" : "Disabled"}>
                <input
                  type="checkbox"
                  aria-label={`${c.enabled ? "Disable" : "Enable"} ${
                    c.title || "draft schedule item"
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
                <strong>{c.title || "New class"}</strong>
                <span className="muted">
                  <span className="type-badge">{displayItemKind(c)}</span>
                  {c.enabled ? "" : " Draft · "}
                  {minutesToTimeString(c.arriveByMinutes)} ·{" "}
                  {needsDestination
                    ? "add building"
                    : displayDestination(c)}
                </span>
                {c.source?.kind === "calendar" && (
                  <span
                    className={`source-pill ${
                      c.source.needsLocationReview ? "source-pill-warn" : ""
                    }`}
                  >
                    {providerLabel(c.source.provider)}
                    {c.source.needsLocationReview ? " · Needs building review" : ""}
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
                  aria-label="Delete schedule item"
                  onClick={() => remove(c.id)}
                >
                  <Icon name="close" size={16} />
                </button>
              )}
            </div>

            {open && (
              <div className="commitment-body">
                {isClassItem(c) && !needsDestination && (
                  <button
                    type="button"
                    className="link-button"
                    onClick={() => setPlannerClassId(c.id)}
                  >
                    Plan a test for this class
                  </button>
                )}
                {isTestItem(c) && (
                  <button
                    type="button"
                    className="link-button"
                    onClick={() =>
                      onChange(
                        createStudySessionsForTest(
                          commitments,
                          settings,
                          c,
                          makeId,
                        ),
                      )
                    }
                  >
                    {relatedStudySessions.length > 0
                      ? "Fill remaining study gaps"
                      : "Plan study sessions for this test"}
                  </button>
                )}
                {isStudyItem(c) && (
                  <StudyStatusControls
                    commitment={c}
                    update={update}
                    onReschedule={() =>
                      onChange(
                        commitments.map((item) =>
                          item.id === c.id
                            ? rescheduleStudySession(commitments, settings, c)
                            : item,
                        ),
                      )
                    }
                  />
                )}
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
                        <span>Name</span>
                        <input
                          type="text"
                          value={c.title}
                          placeholder="Biology, practice, review session..."
                          onChange={(e) => update(c.id, { title: e.target.value })}
                        />
                      </label>
                      <label className="field">
                        <span>Starts at</span>
                        <input
                          type="time"
                          value={minutesToTimeString(c.arriveByMinutes)}
                          onChange={(e) => {
                            const mins = parseTimeToMinutes(e.target.value);
                            if (mins != null) update(c.id, { arriveByMinutes: mins });
                          }}
                        />
                      </label>
                      <label className="field">
                        <span>Course</span>
                        <input
                          type="text"
                          value={c.courseId ?? ""}
                          placeholder="BIO 101"
                          onChange={(e) => update(c.id, { courseId: e.target.value })}
                        />
                      </label>
                    </div>
                    <div className="field">
                      <span className="field-label">Type</span>
                      <div className="segmented compact" role="group" aria-label="Schedule item type">
                        {ITEM_TYPES.map((item) => (
                          <button
                            key={item.value}
                            type="button"
                            className={`segment ${(c.itemType ?? "class") === item.value ? "on" : ""}`}
                            onClick={() => update(c.id, { itemType: item.value })}
                            aria-pressed={(c.itemType ?? "class") === item.value}
                          >
                            {item.label}
                          </button>
                        ))}
                      </div>
                    </div>
                    <StepActions onNext={() => setStep(c.id, "where")} />
                  </div>
                )}

                {step === "where" && (
                  <div className="step-panel">
                    <PlacePicker
                      label="Building"
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
                    <div className="field-grid">
                      <label className="field">
                        <span>Building name</span>
                        <input
                          type="text"
                          value={c.buildingName ?? ""}
                          placeholder="Science Hall"
                          onChange={(e) => update(c.id, { buildingName: e.target.value })}
                        />
                      </label>
                      <label className="field">
                        <span>Room</span>
                        <input
                          type="text"
                          value={c.room ?? ""}
                          placeholder="204"
                          onChange={(e) => update(c.id, { room: e.target.value })}
                        />
                      </label>
                    </div>
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
                if (window.confirm("Discard incomplete draft schedule items?")) {
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
        Add class or event
      </button>
    </div>
  );
}

function TestPlanner({
  commitments,
  settings,
  selectedClassId,
  onSelectedClassChange,
  onChange,
}: {
  commitments: Commitment[];
  settings: Settings;
  selectedClassId: string;
  onSelectedClassChange: (id: string) => void;
  onChange: (commitments: Commitment[]) => void;
}) {
  const classes = commitments.filter((item) => isClassItem(item) && item.enabled);
  const [title, setTitle] = useState("");
  const [testDate, setTestDate] = useState(defaultOneOffDate());
  const [testTime, setTestTime] = useState("09:00");
  const [difficulty, setDifficulty] = useState<TestDifficulty>("standard");
  const selectedDifficulty =
    DIFFICULTIES.find((item) => item.value === difficulty) ?? {
      value: "standard" as TestDifficulty,
      label: "Standard",
      minutes: 180,
    };
  const [targetHours, setTargetHours] = useState(
    String((settings.defaultStudyMinutes ?? selectedDifficulty.minutes) / 60),
  );

  const addPlan = () => {
    const testTimeMinutes = parseTimeToMinutes(testTime) ?? 9 * 60;
    const targetStudyMinutes = Math.max(30, Math.round(Number(targetHours) * 60));
    onChange(
      createTestAndStudyItems(
        commitments,
        settings,
        {
          relatedClassId: selectedClassId || undefined,
          title,
          testDate,
          testTimeMinutes,
          targetStudyMinutes,
          difficulty,
        },
        makeId,
      ),
    );
    setTitle("");
  };

  return (
    <section className="study-planner" aria-labelledby="study-planner-heading">
      <div>
        <h3 id="study-planner-heading">Tests & study</h3>
        <p className="muted">
          Add a test date and HeadStart will create study sessions in open gaps.
        </p>
      </div>
      <div className="field-grid">
        <label className="field">
          <span>Class</span>
          <select
            value={selectedClassId}
            onChange={(event) => onSelectedClassChange(event.target.value)}
          >
            <option value="">General test</option>
            {classes.map((item) => (
              <option key={item.id} value={item.id}>
                {item.courseId ? `${item.courseId} · ` : ""}
                {item.title || "Untitled class"}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Test name</span>
          <input
            type="text"
            value={title}
            placeholder="Bio midterm"
            onChange={(event) => setTitle(event.target.value)}
          />
        </label>
        <label className="field">
          <span>Date</span>
          <input
            type="date"
            value={testDate}
            onChange={(event) => setTestDate(event.target.value || defaultOneOffDate())}
          />
        </label>
        <label className="field">
          <span>Time (optional)</span>
          <input
            type="time"
            value={testTime}
            onChange={(event) => setTestTime(event.target.value)}
          />
        </label>
        <label className="field">
          <span>Study hours</span>
          <input
            type="number"
            min={0.5}
            step={0.5}
            value={targetHours}
            onChange={(event) => setTargetHours(event.target.value)}
          />
        </label>
      </div>
      <div className="segmented compact" role="group" aria-label="Test difficulty">
        {DIFFICULTIES.map((item) => (
          <button
            key={item.value}
            type="button"
            className={`segment ${difficulty === item.value ? "on" : ""}`}
            onClick={() => {
              setDifficulty(item.value);
              setTargetHours(String(item.minutes / 60));
            }}
            aria-pressed={difficulty === item.value}
          >
            {item.label}
          </button>
        ))}
      </div>
      <button type="button" className="secondary-button" onClick={addPlan}>
        Add test + study plan
      </button>
    </section>
  );
}

function StudyWarnings({ commitments }: { commitments: Commitment[] }) {
  const warnings = commitments
    .filter((item) => isTestItem(item) && item.enabled && item.test)
    .flatMap((test) => studyWarningsForTest(test, commitments));

  if (warnings.length === 0) return null;

  return (
    <section className="study-warning-list" aria-label="Study warnings">
      {warnings.map((warning) => (
        <div key={warning} className="study-warning">
          <Icon name="alarm" size={16} />
          <span>{warning}</span>
        </div>
      ))}
    </section>
  );
}

function ConflictWarnings({ commitments }: { commitments: Commitment[] }) {
  const conflicts = scheduleConflicts(commitments);
  if (conflicts.length === 0) return null;
  return (
    <section className="study-warning-list" aria-label="Schedule conflicts">
      {conflicts.slice(0, 4).map((conflict) => (
        <div key={conflict} className="study-warning schedule-conflict-warning">
          <Icon name="route" size={16} />
          <span>{conflict}</span>
        </div>
      ))}
    </section>
  );
}

function scheduleConflicts(commitments: Commitment[]): string[] {
  const active = commitments.filter(
    (item) => item.enabled && !item.source?.needsLocationReview,
  );
  const warnings: string[] = [];
  for (let i = 0; i < active.length; i++) {
    for (let j = i + 1; j < active.length; j++) {
      const first = active[i]!;
      const second = active[j]!;
      const dayLabel = sharedScheduleDay(first, second);
      if (!dayLabel) continue;
      if (!overlaps(first, second)) continue;
      warnings.push(
        `${first.title || displayItemKind(first)} overlaps ${
          second.title || displayItemKind(second)
        } on ${dayLabel}.`,
      );
    }
  }
  return warnings;
}

function sharedScheduleDay(first: Commitment, second: Commitment): string | null {
  if (first.oneOffDate && second.oneOffDate) {
    return first.oneOffDate === second.oneOffDate ? shortDate(first.oneOffDate) : null;
  }
  if (first.oneOffDate) {
    const day = weekdayForIso(first.oneOffDate);
    return day != null && second.days.includes(day) ? shortDate(first.oneOffDate) : null;
  }
  if (second.oneOffDate) {
    const day = weekdayForIso(second.oneOffDate);
    return day != null && first.days.includes(day) ? shortDate(second.oneOffDate) : null;
  }
  const shared = first.days.find((day) => second.days.includes(day));
  return shared == null ? null : WEEKDAY_LABELS[shared] ?? null;
}

function overlaps(first: Commitment, second: Commitment): boolean {
  const firstStart = first.arriveByMinutes;
  const firstEnd = firstStart + scheduleDuration(first);
  const secondStart = second.arriveByMinutes;
  const secondEnd = secondStart + scheduleDuration(second);
  return firstStart < secondEnd && secondStart < firstEnd;
}

function scheduleDuration(commitment: Commitment): number {
  if (isStudyItem(commitment)) return commitment.study?.plannedMinutes ?? 45;
  if (isTestItem(commitment)) return 90;
  return 55;
}

function weekdayForIso(iso: string): Weekday | null {
  const [year, month, day] = iso.split("-").map(Number);
  if (!year || !month || !day) return null;
  return new Date(year, month - 1, day).getDay() as Weekday;
}

function studyWarningsForTest(
  test: Commitment,
  commitments: Commitment[],
): string[] {
  const target = test.test?.targetStudyMinutes ?? 0;
  const sessions = commitments.filter(
    (item) => isStudyItem(item) && item.study?.relatedTestId === test.id,
  );
  const activeSessions = sessions.filter(
    (item) => (item.study?.status ?? "planned") === "planned",
  );
  const doneMinutes = sessions
    .filter((item) => item.study?.status === "done")
    .reduce((total, item) => total + (item.study?.plannedMinutes ?? 0), 0);
  const activeMinutes = activeSessions.reduce(
    (total, item) => total + (item.study?.plannedMinutes ?? 0),
    0,
  );
  const remaining = Math.max(0, target - doneMinutes - activeMinutes);
  const warnings: string[] = [];
  const testLabel = test.title || "test";
  const testDay = test.oneOffDate ? shortDate(test.oneOffDate) : "the test";

  if (activeSessions.length > 0 && activeSessions.length < 2 && target > 90) {
    warnings.push(
      `Only ${activeSessions.length} study block before ${testLabel} on ${testDay}.`,
    );
  }
  if (remaining > 0) {
    warnings.push(
      `${formatStudyMinutes(remaining)} of study still unplanned before ${testLabel}.`,
    );
  }
  return warnings;
}

function shortDate(iso: string): string {
  const [year, month, day] = iso.split("-").map(Number);
  if (!year || !month || !day) return iso;
  return new Date(year, month - 1, day).toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function formatStudyMinutes(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return remainder === 0 ? `${hours} hr` : `${hours} hr ${remainder} min`;
}

function StudyStatusControls({
  commitment,
  update,
  onReschedule,
}: {
  commitment: Commitment;
  update: (id: string, patch: Partial<Commitment>) => void;
  onReschedule: () => void;
}) {
  const status = commitment.study?.status ?? "planned";
  const setStatus = (next: "planned" | "done" | "skipped") => {
    update(commitment.id, {
      study: commitment.study
        ? { ...commitment.study, status: next }
        : commitment.study,
    });
  };
  return (
    <div className="study-status-row">
      <span>Study status: {status}</span>
      <button type="button" className="secondary-button" onClick={() => setStatus("done")}>
        Done
      </button>
      <button type="button" className="secondary-button" onClick={() => setStatus("skipped")}>
        Skipped
      </button>
      <button type="button" className="secondary-button" onClick={onReschedule}>
        Reschedule later
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
  { id: "where", label: "Building", index: "2" },
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
  return commitment.destination.label === "Choose a building";
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
  return provider === "google" ? "Google Calendar" : "Apple Calendar";
}
