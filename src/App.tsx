import { useEffect, useMemo, useRef, useState } from "react";
import { AlarmCard } from "./components/AlarmCard";
import { CalendarConnectors } from "./components/CalendarConnectors";
import { CommitmentForm } from "./components/CommitmentForm";
import { AuthPanel } from "./components/AuthPanel";
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
import type {
  CalendarConnection,
  CalendarProviderId,
  Commitment,
  Place,
  TravelMode,
} from "./core/types";
import { useClock } from "./hooks/useClock";
import { usePlan } from "./hooks/usePlan";
import { useAlarmSound } from "./hooks/useAlarmSound";
import { useLiveDepartureStatus } from "./hooks/useLiveDepartureStatus";
import { useAlarmNotifications } from "./hooks/useAlarmNotifications";
import { useBriefing } from "./hooks/useBriefing";
import {
  hasSavedState,
  loadState,
  saveState,
  type AppState,
} from "./state/store";
import {
  getCurrentUser,
  signOut,
  type AuthUser,
} from "./state/auth";
import { Icon } from "./components/Icon";
import {
  dismissPlaceSuggestion,
  rememberPlaceUsage,
  suggestPlaces,
} from "./core/placeHistory";
import type { PlaceUsageContext, Weekday } from "./core/types";

type Tab = "alarm" | "commitments" | "settings";

const CALENDAR_FALLBACK_DESTINATION: Place = {
  id: "calendar-fallback-office",
  label: "Office — Financial District",
  lat: 37.7946,
  lng: -122.3999,
};

export default function App() {
  const [authUser, setAuthUser] = useState<AuthUser | null>(() => getCurrentUser());

  if (!authUser) {
    return <AuthPanel onAuthenticated={setAuthUser} />;
  }

  return (
    <DepartureApp
      key={authUser.id}
      authUser={authUser}
      onSignOut={() => {
        signOut();
        setAuthUser(null);
      }}
    />
  );
}

function DepartureApp({
  authUser,
  onSignOut,
}: {
  authUser: AuthUser;
  onSignOut: () => void;
}) {
  const [state, setState] = useState<AppState>(() => loadStateForUser(authUser.id));
  const [tab, setTab] = useState<Tab>("alarm");
  const { now, control } = useClock();

  const openTab = (nextTab: Tab) => {
    setTab(nextTab);
    window.requestAnimationFrame(() => {
      window.scrollTo({
        top: 0,
        behavior: window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
          ? "auto"
          : "smooth",
      });
    });
  };

  useEffect(() => {
    saveState(state, authUser.id);
  }, [state, authUser.id]);

  const planResult = usePlan(state.commitments, state.settings, now);

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
  const importedEventCount = state.calendarConnections.reduce(
    (total, connection) => total + (connection.connected ? connection.eventCount : 0),
    0,
  );

  const nowPlaceContext = {
    weekday: now.getDay() as Weekday,
    hour: now.getHours(),
  };
  const destinationSuggestions = suggestPlaces(state.placeHistory, {
    ...nowPlaceContext,
    kind: "destination",
  });

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

  const updateCommitmentTravelMode = (
    commitmentId: string,
    travelMode: TravelMode,
  ) => {
    setState((s) => ({
      ...s,
      commitments: s.commitments.map((commitment) =>
        commitment.id === commitmentId
          ? { ...commitment, travelMode }
          : commitment,
      ),
    }));
  };

  const briefing = useBriefing();
  const onBrief = () => {
    if (livePlan && confidence) briefing.speak(buildBriefing(livePlan, confidence));
  };

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
      openTab("commitments");
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
      openTab("commitments");
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
    <div className={`app app-${tab}`}>
      <SkyScene now={now} />
      <ReplanToast message={replan} />
      <header className="app-header">
        <div className="header-top">
          <div className="brand">
            <span className="brand-mark" aria-hidden>
              <Icon name="alarm" size={22} strokeWidth={1.8} />
            </span>
            <div>
              <h1 className="brand-title">Departure</h1>
              <p className="brand-tag">Wake up exactly when you need to.</p>
            </div>
          </div>
          <div className="account-actions">
            <span className="account-chip" title={authUser.email}>
              {authUser.avatarUrl ? (
                <img src={authUser.avatarUrl} alt="" referrerPolicy="no-referrer" />
              ) : (
                <span className="account-avatar" aria-hidden>
                  {authUser.name.slice(0, 1).toUpperCase()}
                </span>
              )}
              <span className="account-chip-copy">
                <strong>{authUser.name}</strong>
                <small>{authUser.email}</small>
              </span>
            </span>
            <button
              type="button"
              className="secondary-button sign-out-button"
              onClick={onSignOut}
            >
              Sign out
            </button>
          </div>
        </div>
        <nav
          className={`tabs tabs-${tab}`}
          aria-label="Sections"
          role="tablist"
        >
          {(["alarm", "commitments", "settings"] as Tab[]).map((t) => (
            <button
              key={t}
              id={`${t}-tab`}
              role="tab"
              aria-selected={tab === t}
              aria-controls={`${t}-panel`}
              className={`tab ${tab === t ? "tab-active" : ""}`}
              onClick={() => openTab(t)}
            >
              {t === "alarm" ? "Alarm" : t === "commitments" ? "Commitments" : "Settings"}
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
                goto={openTab}
              />
            )}
            {planResult.status === "ready" && livePlan && (
              <>
                <div className="alarm-workspace">
                  <div className="alarm-primary">
                    <AlarmCard
                      plan={livePlan}
                      now={now}
                      settings={state.settings}
                      liveStatus={liveDepartureStatus}
                      onReviewLocationConsent={() => openTab("settings")}
                      onTravelModeChange={updateCommitmentTravelMode}
                      confidence={confidence}
                      briefing={{
                        supported: briefing.supported,
                        speaking: briefing.speaking,
                        onBrief: briefing.speaking ? briefing.stop : onBrief,
                      }}
                    />
                    <DemoBar control={control} plan={livePlan} now={now} />
                  </div>
                  <aside className="alarm-sidebar" aria-label="Morning setup">
                    <SetupChecklist
                      settings={state.settings}
                      commitments={state.commitments}
                      calendarConnections={state.calendarConnections}
                      goto={openTab}
                    />
                  </aside>
                </div>
              </>
            )}
          </>
        )}

        {tab === "commitments" && (
          <div className="panel panel-wide">
            <div className="panel-heading-row">
              <div>
                <span className="page-kicker">Schedule</span>
                <h2 className="panel-title">Commitments</h2>
                <p className="muted panel-lead">
                  Add where you need to be. Departure handles when to wake and leave.
                </p>
              </div>
              <span className="panel-count">
                {state.commitments.filter((commitment) => commitment.enabled).length}{" "}
                active
              </span>
            </div>
            <CommitmentForm
              commitments={state.commitments}
              placeSuggestions={destinationSuggestions}
              searchBias={state.settings.home}
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
          <div className="panel panel-wide">
            <div className="panel-heading-row">
              <div>
                <span className="page-kicker">Preferences</span>
                <h2 className="panel-title">Settings</h2>
                <p className="muted panel-lead">
                  Tune your timing, alerts, saved places, and live route checks.
                </p>
              </div>
            </div>
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
            ? "Live traffic · Google Routes"
            : "Offline traffic simulation"}
        </span>
        <span className="clock">{now.toLocaleTimeString()}</span>
      </footer>
    </div>
  );
}

function loadStateForUser(userId: string): AppState {
  if (!hasSavedState(userId) && hasSavedState()) {
    return loadState();
  }
  return loadState(userId);
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
        <h2>Where do you start your day?</h2>
        <p className="muted">Set your home location so we can measure the trip.</p>
        <button className="add-button" onClick={() => goto("settings")}>
          Set home location
        </button>
      </div>
    );
  }
  return (
    <div className="placeholder">
      <span className="placeholder-icon">
        <Icon name="sunrise" size={30} strokeWidth={1.5} />
      </span>
      <h2>No upcoming commitments</h2>
      <p className="muted">
        Add something you need to arrive at and we'll wake you in time.
      </p>
      <button className="add-button" onClick={() => goto("commitments")}>
        <Icon name="plus" size={17} />
        Add a commitment
      </button>
    </div>
  );
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
      detail: settings.home ? settings.home.label : "Set where you leave from",
      done: Boolean(settings.home),
      tab: "settings" as Tab,
    },
    {
      label: "Reviewed commitment",
      detail:
        reviewedCommitments.length > 0
          ? `${reviewedCommitments.length} ready`
          : needsReview
            ? "Calendar location needs review"
            : "Add your first place and time",
      done: reviewedCommitments.length > 0,
      tab: "commitments" as Tab,
    },
    {
      label: "Calendar source",
      detail:
        connectedCalendars.length > 0
          ? `${connectedCalendars.length} connected`
          : "Optional, but useful for real mornings",
      done: connectedCalendars.length > 0,
      tab: "commitments" as Tab,
    },
    {
      label: "Alarm tested",
      detail: settings.notificationsEnabled
        ? "Browser notifications enabled"
        : "Test sound, notification, and backup",
      done: settings.notificationsEnabled,
      tab: "settings" as Tab,
    },
    {
      label: "Leave check",
      detail: settings.locationTrackingEnabled
        ? "Location verified"
        : "Optional missed-departure safety net",
      done: settings.locationTrackingEnabled,
      tab: "settings" as Tab,
    },
  ];

  const incomplete = items.filter((item) => !item.done);
  if (incomplete.length === 0) return null;

  return (
    <section className="setup-checklist" aria-label="Setup checklist">
      <div className="setup-checklist-head">
        <div>
          <span className="page-kicker">Setup</span>
          <strong>Morning reliability</strong>
        </div>
        <span>{items.length - incomplete.length}/{items.length} ready</span>
      </div>
      <div
        className="setup-progress"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={items.length}
        aria-valuenow={items.length - incomplete.length}
        aria-label="Morning setup progress"
      >
        <span
          style={{ width: `${((items.length - incomplete.length) / items.length) * 100}%` }}
        />
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
              {item.done ? "Done" : "Next"}
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
