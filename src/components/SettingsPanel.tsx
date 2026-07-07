import { useEffect, useState } from "react";
import type { PlaceSuggestion } from "../core/placeHistory";
import type { Place, PlaceUsageContext, Settings } from "../core/types";
import {
  notificationPermission,
  requestAlarmNotificationPermission,
  showAlarmNotification,
  type AlarmNotificationPermission,
} from "../core/notifications";
import { listProviders } from "../core/traffic/provider";
import { PlacePicker } from "./PlacePicker";

interface Props {
  settings: Settings;
  onChange: (settings: Settings) => void;
  placeSuggestions: PlaceSuggestion[];
  placeHistoryCount: number;
  onPlaceSelected: (place: Place, context: PlaceUsageContext) => void;
  onDismissPlaceSuggestion: (
    historyId: string,
    context: PlaceUsageContext,
  ) => void;
  onClearPlaceHistory: () => void;
}

export function SettingsPanel({
  settings,
  onChange,
  placeSuggestions,
  placeHistoryCount,
  onPlaceSelected,
  onDismissPlaceSuggestion,
  onClearPlaceHistory,
}: Props) {
  const [permission, setPermission] =
    useState<AlarmNotificationPermission>("unsupported");
  const [locationConsentChecked, setLocationConsentChecked] = useState(
    settings.locationTrackingEnabled,
  );

  useEffect(() => {
    setPermission(notificationPermission());
  }, []);

  const set = <K extends keyof Settings>(key: K, value: Settings[K]) =>
    onChange({ ...settings, [key]: value });

  const providers = listProviders();
  const googleSelected = settings.trafficProvider === "google";

  return (
    <div className="settings">
      <PlacePicker
        label="Start from"
        value={settings.home}
        onChange={(home) => set("home", home)}
        suggestions={placeSuggestions}
        onPlaceSelected={(place) =>
          onPlaceSelected(place, currentPlaceContext("home"))
        }
        onDismissSuggestion={(historyId) =>
          onDismissPlaceSuggestion(historyId, currentPlaceContext("home"))
        }
      />

      <div className="field-grid">
        <label className="field">
          <span>Get ready (min)</span>
          <input
            type="number"
            min={0}
            max={240}
            value={settings.prepMinutes}
            onChange={(e) => set("prepMinutes", clampInt(e.target.value, 0, 240))}
          />
          <small className="muted">Time from waking up to walking out.</small>
        </label>
        <label className="field">
          <span>Arrival cushion (min)</span>
          <input
            type="number"
            min={0}
            max={120}
            value={settings.arrivalBufferMinutes}
            onChange={(e) =>
              set("arrivalBufferMinutes", clampInt(e.target.value, 0, 120))
            }
          />
          <small className="muted">Safety buffer before the meeting.</small>
        </label>
        <label className="field">
          <span>Wake cushion (min)</span>
          <input
            type="number"
            min={0}
            max={60}
            value={settings.wakeAheadMinutes}
            onChange={(e) =>
              set("wakeAheadMinutes", clampInt(e.target.value, 0, 60))
            }
          />
          <small className="muted">Extra cushion before the strict wake time.</small>
        </label>
      </div>

      <div className="field-grid">
        <label className="field">
          <span>Traffic</span>
          <select
            value={settings.trafficProvider}
            onChange={(e) => set("trafficProvider", e.target.value)}
          >
            {providers.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
        </label>
        {googleSelected && (
          <label className="field field-wide">
            <span>Google Routes key</span>
            <input
              type="password"
              value={settings.apiKey ?? ""}
              placeholder="Paste key to enable live traffic"
              onChange={(e) => set("apiKey", e.target.value)}
            />
            <small className="muted">
              Stored only in your browser. Without a key the app uses the offline
              simulation.
            </small>
          </label>
        )}
      </div>

      <section className="settings-card" aria-labelledby="alerts-heading">
        <h3 id="alerts-heading">Alerts</h3>
        <label className="checkbox-row">
          <input
            type="checkbox"
            checked={settings.soundEnabled}
            onChange={(e) => set("soundEnabled", e.target.checked)}
          />
          <span>Sound in browser</span>
        </label>

        <div className="permission-panel">
          <div>
            <strong>Browser notifications</strong>
            <p>
              Wake and leave alerts can appear outside the page when your
              browser supports it.
            </p>
            <small className="muted">Permission: {permissionLabel(permission)}</small>
          </div>
          <div className="permission-actions">
            <button
              type="button"
              className="secondary-button"
              disabled={permission === "unsupported" || permission === "denied"}
              onClick={() => void requestNotifications(setPermission, set)}
            >
              {permission === "denied" ? "Blocked in browser" : "Enable notifications"}
            </button>
            <button
              type="button"
              className="secondary-button"
              disabled={permission !== "granted"}
              onClick={() => void sendTestNotification()}
            >
              Test
            </button>
          </div>
        </div>
      </section>

      <section className="settings-card" aria-labelledby="location-heading">
        <h3 id="location-heading">Missed-departure check</h3>
        <p>
          If enabled, Departure asks the browser for location during the window
          after your leave time and before your arrival time. It compares your
          current position to your home point to detect if you have not left.
        </p>
        <p>
          The app stores only this on/off preference in local storage. Current
          coordinates stay in memory for the active page session.
        </p>
        {!settings.locationTrackingEnabled && (
          <label className="checkbox-row consent-row">
            <input
              type="checkbox"
              checked={locationConsentChecked}
              onChange={(e) => setLocationConsentChecked(e.target.checked)}
            />
            <span>
              I understand the browser may ask for location access during the
              leave window, and Departure does not save my coordinates.
            </span>
          </label>
        )}
        <div className="permission-actions">
          <button
            type="button"
            className={settings.locationTrackingEnabled ? "secondary-button" : "primary-button"}
            disabled={!settings.locationTrackingEnabled && !locationConsentChecked}
            onClick={() =>
              set("locationTrackingEnabled", !settings.locationTrackingEnabled)
            }
          >
            {settings.locationTrackingEnabled
              ? "Turn off live checks"
              : "Enable live checks"}
          </button>
        </div>
      </section>

      <section className="settings-card" aria-labelledby="history-heading">
        <h3 id="history-heading">Place suggestions</h3>
        <p>
          Suggestions are built only from places you select in this browser. Clear
          them whenever you want a fresh start.
        </p>
        <div className="permission-actions settings-actions-row">
          <span className="muted">
            {placeHistoryCount === 0
              ? "No learned places yet"
              : `${placeHistoryCount} learned ${
                  placeHistoryCount === 1 ? "place" : "places"
                }`}
          </span>
          <button
            type="button"
            className="secondary-button"
            disabled={placeHistoryCount === 0}
            onClick={onClearPlaceHistory}
          >
            Forget suggestions
          </button>
        </div>
      </section>
    </div>
  );
}

function clampInt(raw: string, min: number, max: number): number {
  const n = Math.round(Number(raw));
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, n));
}

function currentPlaceContext(kind: PlaceUsageContext["kind"]): PlaceUsageContext {
  const now = new Date();
  return {
    kind,
    weekday: now.getDay() as PlaceUsageContext["weekday"],
    hour: now.getHours(),
  };
}

function permissionLabel(permission: AlarmNotificationPermission): string {
  if (permission === "unsupported") return "not supported";
  if (permission === "default") return "not requested";
  return permission;
}

async function requestNotifications(
  setPermission: (permission: AlarmNotificationPermission) => void,
  setSetting: <K extends keyof Settings>(key: K, value: Settings[K]) => void,
) {
  const result = await requestAlarmNotificationPermission();
  setPermission(result);
  setSetting("notificationsEnabled", result === "granted");
}

async function sendTestNotification() {
  await showAlarmNotification({
    title: "Departure notifications are on",
    body: "Wake and leave reminders can now show through your browser.",
    tag: "departure-test",
  });
}
