import { useEffect, useMemo, useRef, useState } from "react";
import { AlarmCard } from "./components/AlarmCard";
import { CalendarConnectors } from "./components/CalendarConnectors";
import { CommitmentForm } from "./components/CommitmentForm";
import { SettingsPanel } from "./components/SettingsPanel";
import { SkyScene } from "./components/SkyScene";
import { DemoBar } from "./components/DemoBar";
import { ReplanToast, type ReplanMessage } from "./components/ReplanToast";
import {
  mergeCalendarCommitments,
  removeCalendarCommitments,
} from "./core/calendar";
import {
  calendarConnectorCleanUrl,
  readCalendarConnectorReturn,
} from "./core/calendarConnector";
import { refreshPlanTiming } from "./core/departure";
import { buildBriefing, computeConfidence } from "./core/confidence";
import { formatClock } from "./core/time";
import {
  displayDestination,
  displayItemKind,
  isStudyItem,
  isTestItem,
  occurrencesOnDate,
  type ScheduleOccurrence,
} from "./core/schedule";
import type {
  CalendarConnection,
  CalendarProviderId,
  Commitment,
  Place,
} from "./core/types";
import { useClock } from "./hooks/useClock";
import { usePlan } from "./hooks/usePlan";
import { useAlarmSound } from "./hooks/useAlarmSound";
import { useLiveDepartureStatus } from "./hooks/useLiveDepartureStatus";
import { useAlarmNotifications } from "./hooks/useAlarmNotifications";
import { useBriefing } from "./hooks/useBriefing";
import { requestLocationSample } from "./core/location";
import {
  notificationPermission,
  showAlarmNotification,
} from "./core/notifications";
import { loadState, saveState, type AppState } from "./state/store";
import { Icon } from "./components/Icon";
import {
  dismissPlaceSuggestion,
  rememberPlaceUsage,
  suggestPlaces,
  type PlaceSuggestion,
} from "./core/placeHistory";
import type { PlaceUsageContext, Weekday } from "./core/types";

type Tab = "alarm" | "commitments" | "settings";

const CALENDAR_FALLBACK_DESTINATION: Place = {
  id: "calendar-fallback-campus",
  label: "Campus building",
  lat: 37.4275,
  lng: -122.1697,
};

export default function App() {
  const [state, setState] = useState<AppState>(() => loadState());
  const [tab, setTab] = useState<Tab>("alarm");
  const [originOverride, setOriginOverride] = useState<Place | null>(null);
  const [originOverrideSource, setOriginOverrideSource] = useState<
    "manual" | "live" | "campus" | null
  >(null);
  const [checkingOrigin, setCheckingOrigin] = useState(false);
  const [originMessage, setOriginMessage] = useState<string | null>(null);
  const { now, control } = useClock();

  useEffect(() => {
    saveState(state);
  }, [state]);

  const planResult = usePlan(
    state.commitments,
    state.settings,
    now,
    originOverride,
    originOverrideSource,
  );

  // Keep the plan's countdown/phase live every tick without refetching.
  const livePlan = useMemo(() => {
    if (planResult.status !== "ready") return null;
    return refreshPlanTiming(planResult.plan, now);
  }, [planResult, now]);

  // On-time probability from the Monte-Carlo model.
  const confidence = useMemo(
    () => (livePlan ? computeConfidence(livePlan, state.settings) : null),
    [livePlan, state.settings],
  );

  useAlarmSound(livePlan?.phase ?? null, state.settings.soundEnabled);
  const liveDepartureStatus = useLiveDepartureStatus(livePlan, state.settings, now);
  useAlarmNotifications(livePlan, state.settings.notificationsEnabled, now);
  const lateAlertRef = useRef<string | null>(null);
  const importedEventCount = state.calendarConnections.reduce(
    (total, connection) => total + (connection.connected ? connection.eventCount : 0),
    0,
  );

  const nowPlaceContext = {
    weekday: now.getDay() as Weekday,
    hour: now.getHours(),
  };
  const destinationContext = {
    ...nowPlaceContext,
    kind: "destination" as const,
  };
  const destinationSuggestions = [
    ...favoriteBuildingSuggestions(state.settings.favoriteBuildings ?? []),
    ...suggestPlaces(state.placeHistory, destinationContext),
  ];
  const todayOccurrences = useMemo(
    () => occurrencesOnDate(state.commitments, now, state.settings),
    [state.commitments, state.settings, now.toDateString()],
  );

  const rememberPlace = (place: Place, context: PlaceUsageContext) => {
    setState((s) => ({
      ...s,
      placeHistory: rememberPlaceUsage(s.placeHistory, place, context),
    }));
  };

  const hidePlaceSuggestion = (
    historyId: string,
    context: PlaceUsageContext,
  ) => {
    setState((s) => ({
      ...s,
      placeHistory: dismissPlaceSuggestion(s.placeHistory, historyId, context),
    }));
  };

  const briefing = useBriefing();
  const onBrief = () => {
    if (livePlan && confidence) briefing.speak(buildBriefing(livePlan, confidence));
  };

  const useCurrentOrigin = async (source: "manual" | "live" = "manual") => {
    setCheckingOrigin(true);
    try {
      const sample = await requestLocationSample();
      setOriginOverride(sample.place);
      setOriginOverrideSource(source);
      setOriginMessage(
        `Planning from current location, accurate to about ${Math.round(
          sample.accuracyMeters,
        )} m.`,
      );
    } catch (error) {
      setOriginMessage(
        error instanceof Error
          ? error.message
          : "Could not read current location.",
      );
    } finally {
      setCheckingOrigin(false);
    }
  };

  const useCampusOrigin = () => {
    if (!state.settings.campus) return;
    setOriginOverride(state.settings.campus);
    setOriginOverrideSource("campus");
    setOriginMessage(`Planning as if you are already at ${state.settings.campus.label}.`);
  };

  const useDestinationOrigin = () => {
    if (!livePlan) return;
    setOriginOverride(livePlan.commitment.destination);
    setOriginOverrideSource("manual");
    setOriginMessage(
      `Planning as if you are already at ${displayDestination(livePlan.commitment)}.`,
    );
  };

  const clearOriginOverride = () => {
    setOriginOverride(null);
    setOriginOverrideSource(null);
    setOriginMessage(null);
  };

  useEffect(() => {
    if (!state.settings.locationTrackingEnabled) {
      if (originOverrideSource === "live") clearOriginOverride();
      return;
    }

    let cancelled = false;
    const refresh = async () => {
      try {
        const sample = await requestLocationSample();
        if (cancelled) return;
        setOriginOverride(sample.place);
        setOriginOverrideSource("live");
        setOriginMessage(
          `Live checks are planning from current location, accurate to about ${Math.round(
            sample.accuracyMeters,
          )} m.`,
        );
      } catch (error) {
        if (cancelled) return;
        setOriginMessage(
          error instanceof Error
            ? error.message
            : "Could not refresh current location.",
        );
      }
    };
    void refresh();
    const id = window.setInterval(refresh, 5 * 60 * 1000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.settings.locationTrackingEnabled]);

  // Speak the briefing automatically the moment the wake phase begins.
  const briefedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!livePlan || !confidence) return;
    if (livePlan.phase !== "wake") return;
    const key = livePlan.wakeBy.toISOString();
    if (briefedRef.current === key) return;
    briefedRef.current = key;
    if (state.settings.soundEnabled && briefing.supported) {
      briefing.speak(buildBriefing(livePlan, confidence));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [livePlan?.phase, livePlan?.wakeBy.getTime()]);

  // Detect when the recommended departure meaningfully shifts (live re-plan).
  const [replan, setReplan] = useState<ReplanMessage | null>(null);
  const prevPlanRef = useRef<{ key: string; leaveMs: number } | null>(null);
  const replanIdRef = useRef(0);
  useEffect(() => {
    if (!livePlan) return;
    const key = `${livePlan.commitment.id}@${livePlan.arriveBy.getTime()}`;
    const leaveMs = livePlan.leaveBy.getTime();
    const prev = prevPlanRef.current;
    prevPlanRef.current = { key, leaveMs };
    if (!prev || prev.key !== key) return;
    const deltaMin = Math.round((prev.leaveMs - leaveMs) / 60_000);
    if (Math.abs(deltaMin) >= 2) {
      setReplan({
        id: ++replanIdRef.current,
        direction: deltaMin > 0 ? "earlier" : "later",
        minutes: Math.abs(deltaMin),
        leaveBy: formatClock(livePlan.leaveBy),
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [livePlan?.leaveBy.getTime()]);

  useEffect(() => {
    if (!replan) return;
    const id = window.setTimeout(() => setReplan(null), 5200);
    return () => window.clearTimeout(id);
  }, [replan]);

  useEffect(() => {
    if (
      !state.settings.notificationsEnabled ||
      notificationPermission() !== "granted" ||
      !livePlan ||
      liveDepartureStatus.kind !== "still-home"
    ) {
      return;
    }
    const key = `${livePlan.commitment.id}:${livePlan.arriveBy.toISOString()}:late`;
    if (lateAlertRef.current === key) return;
    lateAlertRef.current = key;
    void showAlarmNotification({
      title: `You have not left. ETA ${formatClock(liveDepartureStatus.arrival)}`,
      body: `${livePlan.commitment.title} starts at ${formatClock(livePlan.arriveBy)}.`,
      tag: `headstart-late-${livePlan.commitment.id}-${livePlan.arriveBy.getTime()}`,
    });
  }, [
    state.settings.notificationsEnabled,
    liveDepartureStatus,
    livePlan,
  ]);

  const importCalendarCommitments = (
    provider: CalendarProviderId,
    imported: Commitment[],
    metadata: {
      sourceLabel: string;
      sourceUrl?: string;
      authMode?: CalendarConnection["authMode"];
    },
  ) => {
    setState((s) => ({
      ...s,
      commitments: mergeCalendarCommitments(s.commitments, imported, provider),
      calendarConnections: updateCalendarConnection(s.calendarConnections, provider, {
        connected: true,
        eventCount: imported.length,
        lastSyncedAt: new Date().toISOString(),
        sourceLabel: metadata.sourceLabel,
        sourceUrl: metadata.sourceUrl,
        authMode: metadata.authMode,
        error: undefined,
      }),
    }));
  };

  const disconnectCalendar = (provider: CalendarProviderId) => {
    setState((s) => ({
      ...s,
      commitments: removeCalendarCommitments(s.commitments, provider),
      calendarConnections: updateCalendarConnection(s.calendarConnections, provider, {
        connected: false,
        eventCount: 0,
        lastSyncedAt: undefined,
        sourceLabel: undefined,
        sourceUrl: undefined,
        authMode: undefined,
        error: undefined,
      }),
    }));
  };

  const setCalendarError = (provider: CalendarProviderId, message: string) => {
    setState((s) => ({
      ...s,
      calendarConnections: updateCalendarConnection(s.calendarConnections, provider, {
        error: message,
      }),
    }));
  };

  useEffect(() => {
    let cancelled = false;
    async function finishConnectorReturn() {
      const result = await readCalendarConnectorReturn({
        url: window.location.href,
        fallbackDestination: CALENDAR_FALLBACK_DESTINATION,
      });
      if (!result || cancelled) return;

      if ("message" in result) {
        setCalendarError(result.provider, result.message);
      } else {
        importCalendarCommitments(
          result.provider,
          result.commitments,
          result.metadata,
        );
      }
      setTab("commitments");
      window.history.replaceState(
        {},
        "",
        calendarConnectorCleanUrl(window.location.href),
      );
    }

    void finishConnectorReturn().catch((error) => {
      const resultProvider = new URLSearchParams(window.location.search).get(
        "calendarProvider",
      );
      const provider =
        resultProvider === "apple" || resultProvider === "google"
          ? resultProvider
          : "apple";
      setCalendarError(
        provider,
        error instanceof Error
          ? error.message
          : "Calendar connector could not finish.",
      );
      setTab("commitments");
      window.history.replaceState(
        {},
        "",
        calendarConnectorCleanUrl(window.location.href),
      );
    });
    return () => {
      cancelled = true;
    };
    // This runs once on startup to consume a backend connector redirect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="app">
      <SkyScene now={now} />
      <ReplanToast message={replan} />
      <header className="app-header">
        <div className="brand">
          <span className="brand-mark" aria-hidden>
            <Icon name="alarm" size={22} strokeWidth={1.8} />
          </span>
          <div>
            <h1 className="brand-title">HeadStart</h1>
            <p className="brand-tag">Know where to go next.</p>
          </div>
        </div>
        <nav className="tabs" aria-label="Sections" role="tablist">
          {(["alarm", "commitments", "settings"] as Tab[]).map((t) => (
            <button
              key={t}
              id={`${t}-tab`}
              role="tab"
              aria-selected={tab === t}
              aria-controls={`${t}-panel`}
              className={`tab ${tab === t ? "tab-active" : ""}`}
              onClick={() => setTab(t)}
            >
              {t === "alarm" ? "Now" : t === "commitments" ? "Schedule" : "Settings"}
            </button>
          ))}
        </nav>
      </header>

      <main
        className="app-main"
        id={`${tab}-panel`}
        role="tabpanel"
        aria-labelledby={`${tab}-tab`}
      >
        {tab === "alarm" && (
          <>
            {planResult.status === "loading" && (
              <div className="placeholder">Reading the roads…</div>
            )}
            {planResult.status === "error" && (
              <div className="placeholder error">
                <p>Couldn't build a plan.</p>
                <p className="muted">{planResult.message}</p>
              </div>
            )}
            {planResult.status === "empty" && (
              <EmptyState
                phase={planResult.phase}
                goto={(t) => setTab(t)}
              />
            )}
            {planResult.status === "ready" && livePlan && (
              <>
                <SetupChecklist
                  settings={state.settings}
                  commitments={state.commitments}
                  calendarConnections={state.calendarConnections}
                  goto={(t) => setTab(t)}
                />
                <AlarmCard
                  plan={livePlan}
                  now={now}
                  settings={state.settings}
                  liveStatus={liveDepartureStatus}
                  onReviewLocationConsent={() => setTab("settings")}
                  originOverride={originOverride}
                  originOverrideSource={originOverrideSource}
                  originMessage={originMessage}
                  checkingOrigin={checkingOrigin}
                  onUseCurrentOrigin={() => void useCurrentOrigin("manual")}
                  onUseCampusOrigin={state.settings.campus ? useCampusOrigin : undefined}
                  onUseDestinationOrigin={useDestinationOrigin}
                  onClearOriginOverride={clearOriginOverride}
                  confidence={confidence}
                  briefing={{
                    supported: briefing.supported,
                    speaking: briefing.speaking,
                    onBrief: briefing.speaking ? briefing.stop : onBrief,
                  }}
                />
                <TodayStrip
                  occurrences={todayOccurrences}
                  activeId={livePlan.commitment.id}
                />
                <DemoBar control={control} plan={livePlan} now={now} />
              </>
            )}
          </>
        )}

        {tab === "commitments" && (
          <div className="panel">
            <h2 className="panel-title">Schedule</h2>
            <p className="muted panel-lead">
              Add classes, tests, events, and study sessions. HeadStart handles
              prep, campus travel, and when to leave.
            </p>
            <CommitmentForm
              commitments={state.commitments}
              settings={state.settings}
              placeSuggestions={destinationSuggestions}
              searchBias={state.settings.campus ?? state.settings.home}
              onPlaceSelected={(place, context) => rememberPlace(place, context)}
              onDismissPlaceSuggestion={hidePlaceSuggestion}
              onChange={(commitments) =>
                setState((s) => ({ ...s, commitments }))
              }
            />
            <details className="import-calendar-details">
              <summary>
                <span>Calendar import</span>
                <small>
                  {importedEventCount > 0
                    ? `${importedEventCount} imported ${
                        importedEventCount === 1 ? "event" : "events"
                      }`
                    : "Google Calendar or .ics files"}
                </small>
              </summary>
              <CalendarConnectors
                connections={state.calendarConnections}
                fallbackDestination={CALENDAR_FALLBACK_DESTINATION}
                onImport={importCalendarCommitments}
                onDisconnect={disconnectCalendar}
                onError={setCalendarError}
              />
            </details>
          </div>
        )}

        {tab === "settings" && (
          <div className="panel">
            <h2 className="panel-title">Settings</h2>
            <SettingsPanel
              settings={state.settings}
              testPlan={livePlan}
              placeHistoryCount={state.placeHistory.length}
              onChange={(settings) => setState((s) => ({ ...s, settings }))}
              onClearPlaceHistory={() =>
                setState((s) => ({ ...s, placeHistory: [] }))
              }
            />
          </div>
        )}
      </main>

      <footer className="app-footer">
        <span className="footer-source">
          <Icon name="route" size={14} />
          {state.settings.trafficProvider === "google" && state.settings.apiKey
            ? "Live routing · Google Routes"
            : "Campus routing simulation"}
        </span>
        <span className="clock">{now.toLocaleTimeString()}</span>
      </footer>
    </div>
  );
}

function updateCalendarConnection(
  connections: CalendarConnection[],
  provider: CalendarProviderId,
  patch: Partial<CalendarConnection>,
): CalendarConnection[] {
  const seen = new Set<CalendarProviderId>();
  const updated = connections.map((connection) => {
    if (connection.provider !== provider) return connection;
    seen.add(provider);
    return { ...connection, ...patch, provider };
  });

  if (!seen.has(provider)) {
    updated.push({
      provider,
      connected: false,
      eventCount: 0,
      ...patch,
    });
  }

  return updated;
}

function favoriteBuildingSuggestions(favorites: Place[]): PlaceSuggestion[] {
  const now = new Date().toISOString();
  return favorites.map((place) => ({
    historyId: `favorite-${place.id}`,
    place,
    reason: "favorite",
    label: "Favorite",
    useCount: Number.MAX_SAFE_INTEGER,
    lastUsedAt: now,
    dismissible: false,
  }));
}

function EmptyState({
  phase,
  goto,
}: {
  phase: "no-home" | "no-commitment";
  goto: (t: Tab) => void;
}) {
  if (phase === "no-home") {
    return (
      <div className="placeholder">
        <span className="placeholder-icon">
          <Icon name="pin" size={30} strokeWidth={1.5} />
        </span>
        <h2>Where do you start before first class?</h2>
        <p className="muted">
          Add your dorm/home or campus so we can measure the first trip.
        </p>
        <button className="add-button" onClick={() => goto("settings")}>
          Add home/dorm or campus
        </button>
      </div>
    );
  }
  return (
    <div className="placeholder">
      <span className="placeholder-icon">
        <Icon name="sunrise" size={30} strokeWidth={1.5} />
      </span>
      <h2>Add your first class</h2>
      <p className="muted">
        Build your class schedule, then HeadStart will show where to go next.
      </p>
      <button className="add-button" onClick={() => goto("commitments")}>
        <Icon name="plus" size={17} />
        Add class or event
      </button>
    </div>
  );
}

function TodayStrip({
  occurrences,
  activeId,
}: {
  occurrences: ScheduleOccurrence[];
  activeId: string;
}) {
  if (occurrences.length === 0) return null;
  return (
    <section className="today-strip" aria-label="Today at a glance">
      <div className="today-strip-head">
        <strong>Today</strong>
        <span>{occurrences.length} schedule item{occurrences.length === 1 ? "" : "s"}</span>
      </div>
      <div className="today-strip-row">
        {occurrences.slice(0, 6).flatMap(({ commitment, arriveBy }, index, list) => {
          const active = commitment.id === activeId;
          const kind = displayItemKind(commitment);
          const next = list[index + 1];
          const gapMinutes = next
            ? Math.round(
                (next.arriveBy.getTime() -
                  (arriveBy.getTime() + todayItemDuration(commitment) * 60_000)) /
                  60_000,
              )
            : 0;
          const item = (
            <div
              key={`${commitment.id}-${arriveBy.toISOString()}`}
              className={`today-pill ${active ? "today-pill-active" : ""} ${
                isStudyItem(commitment) ? "today-pill-study" : ""
              } ${isTestItem(commitment) ? "today-pill-test" : ""}`}
            >
              <span>{formatClock(arriveBy)}</span>
              <strong>{commitment.title || kind}</strong>
              <small>{displayDestination(commitment)}</small>
            </div>
          );
          if (gapMinutes < 30 || !next) return [item];
          return [
            item,
            <div
              key={`gap-${commitment.id}-${next.commitment.id}-${arriveBy.toISOString()}`}
              className="today-pill today-pill-gap"
            >
              <span>Gap</span>
              <strong>{formatGap(gapMinutes)}</strong>
              <small>Free time</small>
            </div>,
          ];
        })}
      </div>
    </section>
  );
}

function todayItemDuration(commitment: Commitment): number {
  if (isStudyItem(commitment)) return commitment.study?.plannedMinutes ?? 45;
  if (isTestItem(commitment)) return 90;
  return 55;
}

function formatGap(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return remainder === 0 ? `${hours}h` : `${hours}h ${remainder}m`;
}

function SetupChecklist({
  settings,
  commitments,
  calendarConnections,
  goto,
}: {
  settings: AppState["settings"];
  commitments: AppState["commitments"];
  calendarConnections: AppState["calendarConnections"];
  goto: (t: Tab) => void;
}) {
  const reviewedCommitments = commitments.filter(
    (commitment) => commitment.enabled && !commitment.source?.needsLocationReview,
  );
  const needsReview = commitments.some(
    (commitment) => commitment.source?.needsLocationReview,
  );
  const connectedCalendars = calendarConnections.filter(
    (connection) => connection.connected,
  );
  const items = [
    {
      label: "Start location",
      detail:
        settings.home?.label ??
        settings.campus?.label ??
        "Set dorm/home or campus",
      done: Boolean(settings.home || settings.campus),
      tab: "settings" as Tab,
    },
    {
      label: "Class schedule",
      detail:
        reviewedCommitments.length > 0
          ? `${reviewedCommitments.length} ready`
          : needsReview
            ? "Calendar building needs review"
            : "Add your first class or event",
      done: reviewedCommitments.length > 0,
      tab: "commitments" as Tab,
    },
    {
      label: "Calendar source",
      detail:
        connectedCalendars.length > 0
          ? `${connectedCalendars.length} connected`
          : "Optional, useful for school calendars",
      done: connectedCalendars.length > 0,
      tab: "commitments" as Tab,
    },
    {
      label: "Alerts tested",
      detail: settings.notificationsEnabled
        ? "Browser notifications enabled"
        : "Test sound, notification, and calendar backup",
      done: settings.notificationsEnabled,
      tab: "settings" as Tab,
    },
    {
      label: "Late check",
      detail: settings.locationTrackingEnabled
        ? "Location verified"
        : "Optional still-at-start ETA updates",
      done: settings.locationTrackingEnabled,
      tab: "settings" as Tab,
    },
  ];

  const incomplete = items.filter((item) => !item.done);
  if (incomplete.length === 0) return null;

  return (
    <section className="setup-checklist" aria-label="Setup checklist">
      <div className="setup-checklist-head">
        <strong>Morning reliability checklist</strong>
        <span>{items.length - incomplete.length}/{items.length} ready</span>
      </div>
      <div className="setup-items">
        {items.map((item) => (
          <button
            key={item.label}
            type="button"
            className={`setup-item ${item.done ? "done" : ""}`}
            onClick={() => goto(item.tab)}
          >
            <span className="setup-check" aria-hidden>
              {item.done ? "OK" : "!"}
            </span>
            <span>
              <strong>{item.label}</strong>
              <small>{item.detail}</small>
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}
