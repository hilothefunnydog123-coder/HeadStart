import { useEffect, useRef, useState } from "react";
import type { Place, Settings } from "../core/types";
import {
  notificationPermission,
  requestAlarmNotificationPermission,
  showAlarmNotification,
  type AlarmNotificationPermission,
} from "../core/notifications";
import { playAlarmChime } from "../core/alarmSound";
import { requestLocationSample } from "../core/location";
import {
  systemReminderCalendar,
  systemReminderFileName,
} from "../core/systemReminders";
import { listProviders } from "../core/traffic/provider";
import { Icon } from "./Icon";
import { PlacePicker } from "./PlacePicker";
import type { DeparturePlan } from "../core/types";
import { AlarmVerificationPanel } from "./AlarmVerificationPanel";
import type { NativeCalendarAutomationState } from "../hooks/useNativeCalendarAutomation";
import type { NativePlanSyncState } from "../hooks/useNativePlanSync";

interface Props {
  settings: Settings;
  testPlan: DeparturePlan | null;
  focusRequest?: SettingsFocusRequest | null;
  nativePlanSync?: NativePlanSyncState;
  calendarAutomation?: NativeCalendarAutomationState;
  onChange: (settings: Settings) => void;
  placeHistoryCount: number;
  onClearPlaceHistory: () => void;
}

export type SettingsFocusTarget = "home" | "alerts" | "location";

export interface SettingsFocusRequest {
  id: number;
  target: SettingsFocusTarget;
}

type SavedPlaceKind = "home" | "work" | "school";

const SAVED_PLACES: Array<{
  kind: SavedPlaceKind;
  label: string;
  empty: string;
}> = [
  {
    kind: "home",
    label: "Home",
    empty: "Not set. Used as your starting point.",
  },
  {
    kind: "work",
    label: "Work",
    empty: "Optional saved destination.",
  },
  {
    kind: "school",
    label: "School",
    empty: "Optional saved destination.",
  },
];

export function SettingsPanel({
  settings,
  testPlan,
  focusRequest = null,
  nativePlanSync = { status: "web" },
  calendarAutomation = EMPTY_CALENDAR_AUTOMATION,
  onChange,
  placeHistoryCount,
  onClearPlaceHistory,
}: Props) {
  const [permission, setPermission] =
    useState<AlarmNotificationPermission>("unsupported");
  const [locationConsentChecked, setLocationConsentChecked] = useState(
    settings.locationTrackingEnabled,
  );
  const [alarmTestMessage, setAlarmTestMessage] = useState<string | null>(null);
  const [locationMessage, setLocationMessage] = useState<string | null>(null);
  const [checkingLocation, setCheckingLocation] = useState(false);
  const [editingPlace, setEditingPlace] = useState<SavedPlaceKind | null>(null);
  const savedPlacesRef = useRef<HTMLElement | null>(null);
  const alertsRef = useRef<HTMLElement | null>(null);
  const locationRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    setPermission(notificationPermission());
  }, []);

  useEffect(() => {
    if (!focusRequest) return;
    if (focusRequest.target === "home") setEditingPlace("home");

    let nestedFrame = 0;
    const frame = window.requestAnimationFrame(() => {
      nestedFrame = window.requestAnimationFrame(() => {
        const section =
          focusRequest.target === "home"
            ? savedPlacesRef.current
            : focusRequest.target === "alerts"
              ? alertsRef.current
              : locationRef.current;
        if (!section) return;
        section.scrollIntoView?.({ block: "start", behavior: "smooth" });
        if (focusRequest.target === "home") {
          section.querySelector<HTMLInputElement>('input[type="search"]')?.focus();
        } else {
          section.focus({ preventScroll: true });
        }
      });
    });

    return () => {
      window.cancelAnimationFrame(frame);
      if (nestedFrame) window.cancelAnimationFrame(nestedFrame);
    };
  }, [focusRequest?.id, focusRequest?.target]);

  const set = <K extends keyof Settings>(key: K, value: Settings[K]) =>
    onChange({ ...settings, [key]: value });

  const setSavedPlace = (kind: SavedPlaceKind, place: Place) => {
    onChange({
      ...settings,
      [kind]: {
        ...place,
        id: kind,
      },
    });
    setEditingPlace(null);
  };

  const removeSavedPlace = (kind: SavedPlaceKind) => {
    onChange({ ...settings, [kind]: null });
    if (editingPlace === kind) setEditingPlace(null);
  };

  const providers = listProviders().sort((left, right) =>
    left.id === "hosted" ? -1 : right.id === "hosted" ? 1 : 0,
  );
  const googleSelected = settings.trafficProvider === "google";

  return (
    <div className="settings">
      <section
        ref={savedPlacesRef}
        className="settings-card saved-places-card settings-saved-card"
        aria-labelledby="saved-places-heading"
      >
        <h3 id="saved-places-heading">Saved places</h3>
        <p>
          Home is your starting point. Work and School are optional shortcuts you
          choose yourself.
        </p>
        <div className="saved-place-list">
          {SAVED_PLACES.map((item) => {
            const place = settings[item.kind] ?? null;
            const isEditing = editingPlace === item.kind;
            return (
              <div
                key={item.kind}
                className={`saved-place-row ${isEditing ? "saved-place-row-active" : ""}`}
              >
                <span className="saved-place-icon">
                  <Icon name={item.kind === "home" ? "pin" : "route"} size={17} />
                </span>
                <div className="saved-place-copy">
                  <strong>{item.label}</strong>
                  <small>{place ? place.label : item.empty}</small>
                </div>
                <div className="saved-place-actions">
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={() => setEditingPlace(isEditing ? null : item.kind)}
                  >
                    {place ? "Change" : `Add ${item.label.toLowerCase()}`}
                  </button>
                  {place && (
                    <button
                      type="button"
                      className="icon-button saved-place-remove"
                      aria-label={`Remove ${item.label}`}
                      onClick={() => removeSavedPlace(item.kind)}
                    >
                      <Icon name="close" size={14} />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
        {editingPlace && (
          <div className="saved-place-editor">
            <PlacePicker
              label={`Set ${placeLabel(editingPlace)}`}
              value={settings[editingPlace] ?? null}
              onChange={(place) => setSavedPlace(editingPlace, place)}
              searchBias={editingPlace === "home" ? null : settings.home}
            />
            <button
              type="button"
              className="secondary-button"
              onClick={() => setEditingPlace(null)}
            >
              Cancel
            </button>
          </div>
        )}
      </section>

      <section
        className="settings-card settings-timing-card"
        aria-labelledby="timing-heading"
      >
        <h3 id="timing-heading">Morning timing</h3>
        <p>Set the buffers Departure uses to work backward from arrival.</p>
        <div className="field-grid timing-field-grid">
          <label className="field">
            <span>Get ready</span>
            <div className="number-field">
              <input
                type="number"
                min={0}
                max={240}
                value={settings.prepMinutes}
                onChange={(e) => set("prepMinutes", clampInt(e.target.value, 0, 240))}
              />
              <span>min</span>
            </div>
            <small className="muted">Wake up to walking out.</small>
          </label>
          <label className="field">
            <span>Arrive early</span>
            <div className="number-field">
              <input
                type="number"
                min={0}
                max={120}
                value={settings.arrivalBufferMinutes}
                onChange={(e) =>
                  set("arrivalBufferMinutes", clampInt(e.target.value, 0, 120))
                }
              />
              <span>min</span>
            </div>
            <small className="muted">Safety before the event.</small>
          </label>
          <label className="field">
            <span>Wake cushion</span>
            <div className="number-field">
              <input
                type="number"
                min={0}
                max={60}
                value={settings.wakeAheadMinutes}
                onChange={(e) =>
                  set("wakeAheadMinutes", clampInt(e.target.value, 0, 60))
                }
              />
              <span>min</span>
            </div>
            <small className="muted">Extra time before the strict wake time.</small>
          </label>
        </div>
      </section>

      <section
        className="settings-card settings-routing-card"
        aria-labelledby="routing-heading"
      >
        <h3 id="routing-heading">Route estimates</h3>
        <p>
          Departure live traffic uses a hosted key and falls back safely to the
          private offline estimate. A personal Google key remains available for
          development.
        </p>
        <div className="field-grid routing-field-grid">
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
              <span>Google Routes key</span>
              <input
                type="password"
                value={settings.apiKey ?? ""}
                placeholder="Paste key to enable live traffic"
                onChange={(e) => set("apiKey", e.target.value)}
              />
              <small className="muted">
                Stored only in this browser. Without a key, Departure uses the
                offline estimate.
              </small>
            </label>
          )}
        </div>
      </section>

      <AlarmVerificationPanel
        settings={settings}
        nativePlanSync={nativePlanSync}
        calendarAutomation={calendarAutomation}
        onChange={onChange}
      />

      <section
        ref={alertsRef}
        tabIndex={-1}
        className="settings-card settings-alerts-card"
        aria-labelledby="alerts-heading"
      >
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
            {permission === "denied" && (
              <small className="field-error">
                Notifications are blocked. Re-enable them from this browser's
                site settings, then return here and test again.
              </small>
            )}
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
              onClick={() =>
                void sendTestNotification(setPermission, set, setAlarmTestMessage)
              }
            >
              Test
            </button>
          </div>
        </div>
        <div className="test-flow" aria-live="polite">
          <strong>Test my alarm</strong>
          <p>
            Verify sound, browser notification, and calendar-reminder backup
            before relying on Departure for an important morning.
          </p>
          <div className="permission-actions">
            <button
              type="button"
              className="secondary-button"
              onClick={() => {
                setAlarmTestMessage(
                  playAlarmChime()
                    ? "Sound played. If you did not hear it, check volume and browser audio permissions."
                    : "Sound could not play in this browser yet.",
                );
              }}
            >
              Test sound
            </button>
            <button
              type="button"
              className="secondary-button"
              disabled={permission === "unsupported" || permission === "denied"}
              onClick={() =>
                void sendTestNotification(setPermission, set, setAlarmTestMessage)
              }
            >
              Test notification
            </button>
            <button
              type="button"
              className="secondary-button"
              disabled={!testPlan}
              onClick={() => {
                if (testPlan) downloadTestReminders(testPlan);
                setAlarmTestMessage(
                  testPlan
                    ? "Calendar reminder file downloaded. Add it to your calendar as the system-level backup."
                    : "Add a reviewed commitment first, then download backup reminders.",
                );
              }}
            >
              Download backup
            </button>
          </div>
          {alarmTestMessage && (
            <p className="test-message" role="status">
              {alarmTestMessage}
            </p>
          )}
        </div>
      </section>

      <section
        ref={locationRef}
        tabIndex={-1}
        className="settings-card settings-location-card"
        aria-labelledby="location-heading"
      >
        <h3 id="location-heading">Missed-departure check</h3>
        <p>
          Departure verifies browser location when you turn this on, then checks
          again during the window after your leave time and before your arrival
          time.
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
            disabled={
              checkingLocation ||
              (!settings.locationTrackingEnabled && !locationConsentChecked)
            }
            onClick={() =>
              void toggleLocationTracking({
                enabled: settings.locationTrackingEnabled,
                set,
                setCheckingLocation,
                setLocationMessage,
              })
            }
          >
            {settings.locationTrackingEnabled
              ? "Turn off live checks"
              : checkingLocation
                ? "Checking location..."
                : "Enable live checks"}
          </button>
          <button
            type="button"
            className="secondary-button"
            disabled={checkingLocation}
            onClick={() =>
              void testLocationCheck(setCheckingLocation, setLocationMessage)
            }
          >
            Test location check
          </button>
        </div>
        {locationMessage && (
          <p className="test-message" role="status">
            {locationMessage}
          </p>
        )}
      </section>

      <section
        className="settings-card settings-history-card"
        aria-labelledby="history-heading"
      >
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
            onClick={() => {
              if (
                window.confirm(
                  "Forget learned place suggestions from this browser?",
                )
              ) {
                onClearPlaceHistory();
              }
            }}
          >
            Forget suggestions
          </button>
        </div>
      </section>
    </div>
  );
}

const EMPTY_CALENDAR_AUTOMATION: NativeCalendarAutomationState = {
  status: "web",
  importedCount: 0,
  capabilities: null,
  enable: async () => undefined,
  refresh: async () => undefined,
};

function clampInt(raw: string, min: number, max: number): number {
  const n = Math.round(Number(raw));
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, n));
}

function placeLabel(kind: SavedPlaceKind): string {
  return SAVED_PLACES.find((item) => item.kind === kind)?.label ?? "place";
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

async function sendTestNotification(
  setPermission: (permission: AlarmNotificationPermission) => void,
  setSetting: <K extends keyof Settings>(key: K, value: Settings[K]) => void,
  setMessage: (message: string) => void,
) {
  let permission = notificationPermission();
  if (permission === "default") {
    permission = await requestAlarmNotificationPermission();
    setPermission(permission);
    setSetting("notificationsEnabled", permission === "granted");
  }

  if (permission !== "granted") {
    setMessage(
      permission === "denied"
        ? "Notifications are blocked in browser settings."
        : "Notifications are not available in this browser.",
    );
    return;
  }

  const shown = await showAlarmNotification({
    title: "Departure notifications are on",
    body: "Wake and leave reminders can now show through your browser.",
    tag: "departure-test",
  });
  setMessage(
    shown
      ? "Test notification sent."
      : "Notification permission is granted, but this browser did not show the alert.",
  );
}

async function testLocationCheck(
  setChecking: (checking: boolean) => void,
  setMessage: (message: string) => void,
) {
  setChecking(true);
  try {
    const sample = await requestLocationSample();
    setMessage(
      `Location check worked within about ${Math.round(
        sample.accuracyMeters,
      )} m accuracy.`,
    );
  } catch (error) {
    setMessage(error instanceof Error ? error.message : "Location check failed.");
  } finally {
    setChecking(false);
  }
}

async function toggleLocationTracking({
  enabled,
  set,
  setCheckingLocation,
  setLocationMessage,
}: {
  enabled: boolean;
  set: <K extends keyof Settings>(key: K, value: Settings[K]) => void;
  setCheckingLocation: (checking: boolean) => void;
  setLocationMessage: (message: string) => void;
}) {
  if (enabled) {
    set("locationTrackingEnabled", false);
    setLocationMessage("Live missed-departure checks are off.");
    return;
  }

  setCheckingLocation(true);
  try {
    const sample = await requestLocationSample();
    set("locationTrackingEnabled", true);
    setLocationMessage(
      `Location verified now with about ${Math.round(
        sample.accuracyMeters,
      )} m accuracy. Departure will check again only during your leave window.`,
    );
  } catch (error) {
    set("locationTrackingEnabled", false);
    setLocationMessage(
      error instanceof Error
        ? error.message
        : "Location permission could not be verified.",
    );
  } finally {
    setCheckingLocation(false);
  }
}

function downloadTestReminders(plan: DeparturePlan): void {
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
