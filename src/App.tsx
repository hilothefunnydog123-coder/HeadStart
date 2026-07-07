import { useEffect, useMemo, useState } from "react";
import { AlarmCard } from "./components/AlarmCard";
import { CommitmentForm } from "./components/CommitmentForm";
import { SettingsPanel } from "./components/SettingsPanel";
import { refreshPlanTiming } from "./core/departure";
import { useNow } from "./hooks/useNow";
import { usePlan } from "./hooks/usePlan";
import { useAlarmSound } from "./hooks/useAlarmSound";
import { loadState, saveState, type AppState } from "./state/store";

type Tab = "alarm" | "commitments" | "settings";

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

  return (
    <div className="app">
      <header className="app-header">
        <div className="brand">
          <span className="brand-mark" aria-hidden>
            ⏰
          </span>
          <div>
            <h1 className="brand-title">Departure</h1>
            <p className="brand-tag">Wake up exactly when you need to.</p>
          </div>
        </div>
        <nav className="tabs" aria-label="Sections">
          {(["alarm", "commitments", "settings"] as Tab[]).map((t) => (
            <button
              key={t}
              className={`tab ${tab === t ? "tab-active" : ""}`}
              onClick={() => setTab(t)}
            >
              {t === "alarm" ? "Alarm" : t === "commitments" ? "Commitments" : "Settings"}
            </button>
          ))}
        </nav>
      </header>

      <main className="app-main">
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
              <AlarmCard plan={livePlan} now={now} />
            )}
          </>
        )}

        {tab === "commitments" && (
          <div className="panel">
            <h2 className="panel-title">Your commitments</h2>
            <p className="muted panel-lead">
              The alarm plans around whichever enabled commitment comes next.
            </p>
            <CommitmentForm
              commitments={state.commitments}
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
              onChange={(settings) => setState((s) => ({ ...s, settings }))}
            />
          </div>
        )}
      </main>

      <footer className="app-footer">
        <span>
          {state.settings.trafficProvider === "google" && state.settings.apiKey
            ? "Live traffic via Google Routes"
            : "Offline traffic simulation"}
        </span>
        <span className="clock">{now.toLocaleTimeString()}</span>
      </footer>
    </div>
  );
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
      <h2>No upcoming commitments</h2>
      <p className="muted">
        Add something you need to arrive at and we'll wake you in time.
      </p>
      <button className="add-button" onClick={() => goto("commitments")}>
        Add a commitment
      </button>
    </div>
  );
}
