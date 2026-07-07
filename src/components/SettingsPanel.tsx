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
  onPlaceSelected: (place: Place, context: PlaceUsageContext) => void;
}

export function SettingsPanel({
  settings,
  onChange,
  placeSuggestions,
  onPlaceSelected,
}: Props) {
  const [permission, setPermission] =
    useState<AlarmNotificationPermission>("unsupported");

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
        label="Home (departure point)"
        value={settings.home}
        onChange={(home) => set("home", home)}
        suggestions={placeSuggestions}
        onPlaceSelected={(place) =>
          onPlaceSelected(place, currentPlaceContext("home"))
        }
      />

      <div className="field-grid">
        <label className="field">
          <span>Prep time (min)</span>
          <input
            type="number"
            min={0}
            max={240}
            value={settings.prepMinutes}
            onChange={(e) => set("prepMinutes", clampInt(e.target.value, 0, 240))}
          />
          <small className="muted">Wake → out the door.</small>
        </label>
        <label className="field">
          <span>Arrive early (min)</span>
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
          <span>Wake comfort (min)</span>
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
          <span>Traffic source</span>
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
            <span>Google Routes API key</span>
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
          <span>Play a sound when this tab is open</span>
        </label>

        <div className="permission-panel">
          <div>
            <strong>Browser notifications</strong>
            <p>
              Shows wake and leave alerts through the browser or installed PWA.
              Background delivery depends on browser support.
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
        <h3 id="location-heading">Live location checks</h3>
        <p>
          If enabled, Departure asks the browser for location only during the
          window after your leave time and before your arrival time. It compares
          your current position to your home point to detect if you have not left.
        </p>
        <p>
          The app stores only this on/off preference in local storage. Current
          coordinates stay in memory for the active page session.
        </p>
        <div className="permission-actions">
          <button
            type="button"
            className={settings.locationTrackingEnabled ? "secondary-button" : "primary-button"}
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
