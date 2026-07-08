import { useEffect, useState } from "react";
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

interface Props {
  settings: Settings;
  testPlan: DeparturePlan | null;
  onChange: (settings: Settings) => void;
  placeHistoryCount: number;
  onClearPlaceHistory: () => void;
}

type SavedPlaceKind = "home" | "campus" | "work";

const SAVED_PLACES: Array<{
  kind: SavedPlaceKind;
  label: string;
  empty: string;
}> = [
  {
    kind: "home",
    label: "Home/Dorm",
    empty: "Not set. Used before your first class.",
  },
  {
    kind: "campus",
    label: "School/Campus",
    empty: "Optional anchor for building search and quick starts.",
  },
  {
    kind: "work",
    label: "Work",
    empty: "Optional off-campus destination.",
  },
];

export function SettingsPanel({
  settings,
  testPlan,
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
  const [editingFavorite, setEditingFavorite] = useState(false);

  useEffect(() => {
    setPermission(notificationPermission());
  }, []);

  const set = <K extends keyof Settings>(key: K, value: Settings[K]) =>
    onChange({ ...settings, [key]: value });

  const setSemester = (patch: Partial<NonNullable<Settings["semester"]>>) => {
    onChange({
      ...settings,
      semester: {
        ...(settings.semester ?? {}),
        ...patch,
      },
    });
  };

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

  const addFavoriteBuilding = (place: Place) => {
    const favorite = {
      ...place,
      id: place.id || favoriteBuildingId(place),
    };
    const withoutDuplicate = (settings.favoriteBuildings ?? []).filter(
      (item) => favoriteBuildingId(item) !== favoriteBuildingId(favorite),
    );
    onChange({
      ...settings,
      favoriteBuildings: [...withoutDuplicate, favorite],
    });
    setEditingFavorite(false);
  };

  const removeFavoriteBuilding = (place: Place) => {
    onChange({
      ...settings,
      favoriteBuildings: (settings.favoriteBuildings ?? []).filter(
        (item) => favoriteBuildingId(item) !== favoriteBuildingId(place),
      ),
    });
  };

  const providers = listProviders();
  const googleSelected = settings.trafficProvider === "google";

  return (
    <div className="settings">
      <section className="settings-card saved-places-card" aria-labelledby="saved-places-heading">
        <h3 id="saved-places-heading">Saved places</h3>
        <p>
          HeadStart will not guess your dorm or campus from location permission.
          Save starts and anchors only when you choose them.
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
              searchBias={editingPlace === "home" ? settings.campus : settings.home}
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

      <section className="settings-card saved-places-card" aria-labelledby="favorite-buildings-heading">
        <h3 id="favorite-buildings-heading">Favorite buildings</h3>
        <p>
          Save common class buildings for faster Schedule entry. These are
          separate from current location and are never inferred automatically.
        </p>
        {(settings.favoriteBuildings ?? []).length > 0 ? (
          <div className="saved-place-list">
            {(settings.favoriteBuildings ?? []).map((place) => (
              <div key={favoriteBuildingId(place)} className="saved-place-row">
                <span className="saved-place-icon">
                  <Icon name="pin" size={17} />
                </span>
                <div className="saved-place-copy">
                  <strong>{place.label}</strong>
                  <small>
                    {place.lat.toFixed(5)}, {place.lng.toFixed(5)}
                  </small>
                </div>
                <div className="saved-place-actions">
                  <button
                    type="button"
                    className="icon-button saved-place-remove"
                    aria-label={`Remove ${place.label}`}
                    onClick={() => removeFavoriteBuilding(place)}
                  >
                    <Icon name="close" size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="muted">No favorite buildings yet.</p>
        )}
        {editingFavorite ? (
          <div className="saved-place-editor">
            <PlacePicker
              label="Add favorite building"
              value={null}
              onChange={addFavoriteBuilding}
              searchBias={settings.campus ?? settings.home}
            />
            <button
              type="button"
              className="secondary-button"
              onClick={() => setEditingFavorite(false)}
            >
              Cancel
            </button>
          </div>
        ) : (
          <button
            type="button"
            className="secondary-button"
            onClick={() => setEditingFavorite(true)}
          >
            <Icon name="plus" size={15} />
            Add favorite building
          </button>
        )}
      </section>

      <div className="field-grid">
        <label className="field">
          <span>First-class prep (min)</span>
          <input
            type="number"
            min={0}
            max={240}
            value={settings.prepMinutes}
            onChange={(e) => set("prepMinutes", clampInt(e.target.value, 0, 240))}
          />
          <small className="muted">Time from waking up to leaving for first class.</small>
        </label>
        <label className="field">
          <span>Campus prep (min)</span>
          <input
            type="number"
            min={0}
            max={60}
            value={settings.campusPrepMinutes ?? 5}
            onChange={(e) => set("campusPrepMinutes", clampInt(e.target.value, 0, 60))}
          />
          <small className="muted">Time to pack up before moving between classes.</small>
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
          <small className="muted">Safety buffer before class, study, or a test.</small>
        </label>
        <label className="field">
          <span>Walking buffer (min)</span>
          <input
            type="number"
            min={0}
            max={60}
            value={settings.campusWalkingBufferMinutes ?? 5}
            onChange={(e) =>
              set("campusWalkingBufferMinutes", clampInt(e.target.value, 0, 60))
            }
          />
          <small className="muted">Extra cushion for campus walking routes.</small>
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
          <small className="muted">Only used before the first morning class.</small>
        </label>
      </div>

      <section className="settings-card" aria-labelledby="study-defaults-heading">
        <h3 id="study-defaults-heading">Study planning</h3>
        <div className="field-grid">
          <label className="field">
            <span>Default study time (min)</span>
            <input
              type="number"
              min={30}
              max={1200}
              value={settings.defaultStudyMinutes ?? 180}
              onChange={(e) =>
                set("defaultStudyMinutes", clampInt(e.target.value, 30, 1200))
              }
            />
          </label>
          <label className="field">
            <span>Max study block (min)</span>
            <input
              type="number"
              min={25}
              max={180}
              value={settings.maxStudySessionMinutes ?? 60}
              onChange={(e) =>
                set("maxStudySessionMinutes", clampInt(e.target.value, 25, 180))
              }
            />
          </label>
          <label className="field">
            <span>Study sessions per test</span>
            <input
              type="number"
              min={1}
              max={14}
              value={settings.targetStudySessions ?? 3}
              onChange={(e) =>
                set("targetStudySessions", clampInt(e.target.value, 1, 14))
              }
            />
          </label>
          <label className="field">
            <span>Avoid study after</span>
            <input
              type="time"
              value={minutesToTime(settings.avoidStudyAfterMinutes ?? 21 * 60)}
              onChange={(e) => {
                const parsed = timeToMinutes(e.target.value);
                if (parsed != null) {
                  set("avoidStudyAfterMinutes", parsed);
                }
              }}
            />
          </label>
        </div>
      </section>

      <section className="settings-card" aria-labelledby="semester-heading">
        <h3 id="semester-heading">Semester calendar</h3>
        <p>
          Weekly classes follow these dates. Holidays and finals week pause
          normal class repeats, while tests and study blocks stay on their saved dates.
        </p>
        <div className="field-grid">
          <label className="field">
            <span>Semester start</span>
            <input
              type="date"
              value={settings.semester?.startDate ?? ""}
              onChange={(e) =>
                setSemester({ startDate: e.target.value || undefined })
              }
            />
          </label>
          <label className="field">
            <span>Semester end</span>
            <input
              type="date"
              value={settings.semester?.endDate ?? ""}
              onChange={(e) =>
                setSemester({ endDate: e.target.value || undefined })
              }
            />
          </label>
          <label className="field">
            <span>Finals start</span>
            <input
              type="date"
              value={settings.semester?.finalsStartDate ?? ""}
              onChange={(e) =>
                setSemester({ finalsStartDate: e.target.value || undefined })
              }
            />
          </label>
          <label className="field">
            <span>Finals end</span>
            <input
              type="date"
              value={settings.semester?.finalsEndDate ?? ""}
              onChange={(e) =>
                setSemester({ finalsEndDate: e.target.value || undefined })
              }
            />
          </label>
          <label className="field field-wide">
            <span>Holidays</span>
            <input
              type="text"
              placeholder="2026-09-07, 2026-11-26"
              value={(settings.semester?.holidays ?? []).join(", ")}
              onChange={(e) =>
                setSemester({ holidays: parseDateList(e.target.value) })
              }
            />
            <small className="muted">
              Enter dates as YYYY-MM-DD, separated by commas or spaces.
            </small>
          </label>
        </div>
      </section>

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
              Prep, leave, and study alerts can appear outside the page when your
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
          <strong>Test alerts</strong>
          <p>
            Verify sound, browser notification, and calendar-reminder backup
            before relying on HeadStart for an important class or test.
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
                    : "Add a reviewed class, test, or study session first, then download backup reminders.",
                );
              }}
            >
              Download backup
            </button>
          </div>
          {alarmTestMessage && <p className="test-message">{alarmTestMessage}</p>}
        </div>
      </section>

      <section className="settings-card" aria-labelledby="location-heading">
        <h3 id="location-heading">Late-departure check</h3>
        <p>
          HeadStart verifies browser location when you turn this on, then checks
          again during the window after your leave time and before your class,
          test, or study session starts.
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
              leave window, and HeadStart does not save my coordinates.
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
        {locationMessage && <p className="test-message">{locationMessage}</p>}
      </section>

      <section className="settings-card" aria-labelledby="history-heading">
        <h3 id="history-heading">Building suggestions</h3>
        <p>
          Suggestions are built only from buildings you select in this browser.
          Clear them whenever you want a fresh start.
        </p>
        <div className="permission-actions settings-actions-row">
          <span className="muted">
            {placeHistoryCount === 0
              ? "No learned buildings yet"
              : `${placeHistoryCount} learned ${
                  placeHistoryCount === 1 ? "building" : "buildings"
                }`}
          </span>
          <button
            type="button"
            className="secondary-button"
            disabled={placeHistoryCount === 0}
            onClick={() => {
              if (
                window.confirm(
                  "Forget learned building suggestions from this browser?",
                )
              ) {
                onClearPlaceHistory();
              }
            }}
          >
            Forget buildings
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

function minutesToTime(total: number): string {
  const hours = Math.floor(total / 60) % 24;
  const minutes = total % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

function timeToMinutes(value: string): number | null {
  const [hours, minutes] = value.split(":").map(Number);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
  return Number(hours) * 60 + Number(minutes);
}

function parseDateList(value: string): string[] {
  return [
    ...new Set(
      value
        .split(/[\s,]+/)
        .map((item) => item.trim())
        .filter((item) => /^\d{4}-\d{2}-\d{2}$/.test(item)),
    ),
  ].sort();
}

function placeLabel(kind: SavedPlaceKind): string {
  return SAVED_PLACES.find((item) => item.kind === kind)?.label ?? "place";
}

function favoriteBuildingId(place: Place): string {
  return `${place.label.toLowerCase()}-${place.lat.toFixed(5)}-${place.lng.toFixed(5)}`;
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
    title: "HeadStart notifications are on",
    body: "Prep, leave, and study reminders can now show through your browser.",
    tag: "headstart-test",
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
    setLocationMessage("Live late-departure checks are off.");
    return;
  }

  setCheckingLocation(true);
  try {
    const sample = await requestLocationSample();
    set("locationTrackingEnabled", true);
    setLocationMessage(
      `Location verified now with about ${Math.round(
        sample.accuracyMeters,
      )} m accuracy. HeadStart will check again only during your leave window.`,
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
