import { useEffect, useMemo, useState } from "react";
import { AlarmCard } from "./components/AlarmCard";
import { CalendarConnectors } from "./components/CalendarConnectors";
import { CommitmentForm } from "./components/CommitmentForm";
import { SettingsPanel } from "./components/SettingsPanel";
import {
  mergeCalendarCommitments,
  removeCalendarCommitments,
} from "./core/calendar";
import { refreshPlanTiming } from "./core/departure";
import type {
  CalendarConnection,
  CalendarProviderId,
  Commitment,
  Place,
} from "./core/types";
import { useNow } from "./hooks/useNow";
import { usePlan } from "./hooks/usePlan";
import { useAlarmSound } from "./hooks/useAlarmSound";
import { useLiveDepartureStatus } from "./hooks/useLiveDepartureStatus";
import { useAlarmNotifications } from "./hooks/useAlarmNotifications";
import { loadState, saveState, type AppState } from "./state/store";
import { Icon } from "./components/Icon";
import {
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
  const [state, setState] = useState<AppState>(() => loadState());
  const [tab, setTab] = useState<Tab>("alarm");
  const now = useNow(1000);

  useEffect(() => {
    saveState(state);
  }, [state]);

  const planResult = usePlan(state.commitments, state.settings);

  // Keep the plan's countdown/phase live every second without refetching.
  const livePlan = useMemo(() => {
    if (planResult.status !== "ready") return null;
    return refreshPlanTiming(planResult.plan, now);
  }, [planResult, now]);

  useAlarmSound(livePlan?.phase ?? null, state.settings.soundEnabled);
  const liveDepartureStatus = useLiveDepartureStatus(livePlan, state.settings, now);
  useAlarmNotifications(livePlan, state.settings.notificationsEnabled, now);

  const nowPlaceContext = {
    weekday: now.getDay() as Weekday,
    hour: now.getHours(),
  };
  const destinationSuggestions = suggestPlaces(state.placeHistory, {
    ...nowPlaceContext,
    kind: "destination",
  });
  const homeSuggestions = suggestPlaces(state.placeHistory, {
    ...nowPlaceContext,
    kind: "home",
  });

  const rememberPlace = (place: Place, context: PlaceUsageContext) => {
    setState((s) => ({
      ...s,
      placeHistory: rememberPlaceUsage(s.placeHistory, place, context),
    }));
  };

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

  return (
    <div className="app">
      <header className="app-header">
        <div className="brand">
          <span className="brand-mark" aria-hidden>
            <Icon name="alarm" size={22} strokeWidth={1.8} />
          </span>
          <div>
            <h1 className="brand-title">Departure</h1>
            <p className="brand-tag">Wake up exactly when you need to.</p>
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
                goto={(t) => setTab(t)}
              />
            )}
            {planResult.status === "ready" && livePlan && (
              <AlarmCard
                plan={livePlan}
                now={now}
                liveStatus={liveDepartureStatus}
                onReviewLocationConsent={() => setTab("settings")}
              />
            )}
          </>
        )}

        {tab === "commitments" && (
          <div className="panel">
            <h2 className="panel-title">Your commitments</h2>
            <p className="muted panel-lead">
              The alarm plans around whichever enabled commitment comes next.
            </p>
            <CalendarConnectors
              connections={state.calendarConnections}
              fallbackDestination={CALENDAR_FALLBACK_DESTINATION}
              onImport={importCalendarCommitments}
              onDisconnect={disconnectCalendar}
              onError={setCalendarError}
            />
            <CommitmentForm
              commitments={state.commitments}
              placeSuggestions={destinationSuggestions}
              onPlaceSelected={(place, context) => rememberPlace(place, context)}
              onChange={(commitments) =>
                setState((s) => ({ ...s, commitments }))
              }
            />
          </div>
        )}

        {tab === "settings" && (
          <div className="panel">
            <h2 className="panel-title">Settings</h2>
            <SettingsPanel
              settings={state.settings}
              placeSuggestions={homeSuggestions}
              placeHistoryCount={state.placeHistory.length}
              onPlaceSelected={(place, context) => rememberPlace(place, context)}
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
