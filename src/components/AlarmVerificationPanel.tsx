import { useEffect, useMemo, useState } from "react";
import type { Settings } from "../core/types";
import type { NativeCalendarAutomationState } from "../hooks/useNativeCalendarAutomation";
import type { NativePlanSyncState } from "../hooks/useNativePlanSync";
import {
  getNativeCapabilities,
  isNativeDepartureApp,
  openNativeSystemSettings,
  requestNativeAlarmAuthorization,
  verifyNativeAlarm,
  type NativeCapabilities,
  type NativeVerificationCheck,
} from "../native/departureNative";
import { Icon } from "./Icon";

interface Props {
  settings: Settings;
  nativePlanSync: NativePlanSyncState;
  calendarAutomation: NativeCalendarAutomationState;
  onChange: (settings: Settings) => void;
}

export function AlarmVerificationPanel({
  settings,
  nativePlanSync,
  calendarAutomation,
  onChange,
}: Props) {
  const [capabilities, setCapabilities] = useState<NativeCapabilities | null>(null);
  const [checks, setChecks] = useState<NativeVerificationCheck[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const refreshCapabilities = async () => {
    const next = await getNativeCapabilities();
    setCapabilities(next);
    return next;
  };

  useEffect(() => {
    void refreshCapabilities().catch(() => undefined);
  }, []);

  const statusChecks = useMemo(
    () => capabilityChecks(capabilities, nativePlanSync),
    [capabilities, nativePlanSync],
  );

  const requestAlarmAccess = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const next = await requestNativeAlarmAuthorization();
      setCapabilities(next);
      if (next.alarmAuthorization === "authorized") {
        onChange({ ...settings, nativeAlarmsEnabled: true });
        setMessage("Native alarms are authorized. The next plan will be scheduled automatically.");
      } else {
        setMessage("Native alarm access is still required.");
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Alarm access failed.");
    } finally {
      setBusy(false);
    }
  };

  const runVerification = async () => {
    setBusy(true);
    setMessage(null);
    try {
      await requestNativeAlarmAuthorization();
      const result = await verifyNativeAlarm();
      setChecks(result.checks);
      setMessage(
        result.scheduled
          ? "A native test alarm is scheduled for about 10 seconds from now. Lock the phone to verify delivery."
          : "The native test could not be scheduled yet.",
      );
      await refreshCapabilities();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Alarm verification failed.");
    } finally {
      setBusy(false);
    }
  };

  const enableCalendar = async () => {
    onChange({ ...settings, calendarAutomationEnabled: true });
    await calendarAutomation.enable();
  };

  return (
    <section
      className="settings-card settings-verification-card"
      aria-labelledby="verification-heading"
    >
      <div className="verification-heading-row">
        <span className="verification-icon" aria-hidden>
          <Icon name="alarm" size={18} />
        </span>
        <div>
          <h3 id="verification-heading">Alarm reliability</h3>
          <p>
            Check native delivery, background updates, Lock Screen surfaces,
            calendar access, and hosted traffic before trusting an important morning.
          </p>
        </div>
      </div>

      <div className="verification-checks" aria-live="polite">
        {[...statusChecks, ...checks].map((check) => (
          <div key={check.id} className={`verification-check ${check.status}`}>
            <span className="verification-status" aria-hidden>
              {check.status === "pass" ? "✓" : check.status === "fail" ? "!" : "·"}
            </span>
            <span>
              <strong>{check.label}</strong>
              <small>{check.detail}</small>
            </span>
          </div>
        ))}
      </div>

      <div className="verification-actions">
        {isNativeDepartureApp() ? (
          <>
            <button
              type="button"
              className="primary-button"
              disabled={busy}
              onClick={() => void runVerification()}
            >
              {busy ? "Checking…" : "Run 10-second test"}
            </button>
            {capabilities?.alarmAuthorization !== "authorized" && (
              <button
                type="button"
                className="secondary-button"
                disabled={busy}
                onClick={() => void requestAlarmAccess()}
              >
                Allow native alarms
              </button>
            )}
            <button
              type="button"
              className="secondary-button"
              onClick={() => void openNativeSystemSettings()}
            >
              Open system settings
            </button>
          </>
        ) : (
          <p className="verification-web-note">
            Install the iOS or Android build to run an OS-level alarm test. Browser
            sound and notification tests remain available below.
          </p>
        )}
      </div>

      {isNativeDepartureApp() && (
        <div className="calendar-automation-row">
          <div>
            <strong>Device calendar automation</strong>
            <small>
              {calendarAutomation.status === "ready"
                ? `${calendarAutomation.importedCount} physical events synced`
                : calendarAutomation.message || "Turn calendar events into plans automatically."}
            </small>
          </div>
          <div className="permission-actions">
            {settings.calendarAutomationEnabled ? (
              <>
                <button
                  type="button"
                  className="secondary-button"
                  disabled={calendarAutomation.status === "syncing"}
                  onClick={() => void calendarAutomation.refresh()}
                >
                  {calendarAutomation.status === "syncing" ? "Syncing…" : "Sync now"}
                </button>
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() =>
                    onChange({ ...settings, calendarAutomationEnabled: false })
                  }
                >
                  Turn off
                </button>
              </>
            ) : (
              <button
                type="button"
                className="secondary-button"
                onClick={() => void enableCalendar()}
              >
                Enable calendar
              </button>
            )}
          </div>
        </div>
      )}

      {message && (
        <p className="test-message" role="status">
          {message}
        </p>
      )}
    </section>
  );
}

function capabilityChecks(
  capabilities: NativeCapabilities | null,
  nativePlanSync: NativePlanSyncState,
): NativeVerificationCheck[] {
  if (!capabilities) {
    return [
      {
        id: "loading",
        label: "Reading device capabilities",
        status: "warning",
        detail: "Checking the current app and operating-system state.",
      },
    ];
  }
  if (!capabilities.native) {
    return [
      {
        id: "native",
        label: "Native app",
        status: "warning",
        detail: "Web preview — native alarm and Lock Screen checks are unavailable.",
      },
    ];
  }
  return [
    {
      id: "alarm-permission",
      label: "Native alarm permission",
      status: capabilities.alarmAuthorization === "authorized" ? "pass" : "fail",
      detail:
        capabilities.alarmAuthorization === "authorized"
          ? "The operating system allows Departure alarms."
          : "Allow alarms before relying on Departure.",
    },
    {
      id: "exact-alarm",
      label: "Exact delivery",
      status: capabilities.exactAlarmAllowed ? "pass" : "fail",
      detail: capabilities.exactAlarmAllowed
        ? "Exact wake delivery is available."
        : "Exact alarms are blocked by system settings.",
    },
    {
      id: "notification-permission",
      label: "Wake and leave notifications",
      status:
        capabilities.notificationAuthorization === "authorized" ? "pass" : "fail",
      detail:
        capabilities.notificationAuthorization === "authorized"
          ? "Time-sensitive wake and leave notifications are enabled."
          : "Allow notifications so every leave reminder can be delivered.",
    },
    {
      id: "background",
      label: "Background rescheduling",
      status: capabilities.backgroundRefreshSupported ? "pass" : "warning",
      detail: capabilities.backgroundRefreshSupported
        ? "The app can request traffic refreshes while backgrounded."
        : "Background refresh is unavailable on this device.",
    },
    {
      id: "surfaces",
      label: "Lock Screen and widget surfaces",
      status:
        capabilities.liveActivitySupported || capabilities.widgetsSupported
          ? "pass"
          : "warning",
      detail: capabilities.liveActivitySupported
        ? "Live Activity and widget surfaces are supported."
        : capabilities.widgetsSupported
          ? "Widgets are supported; Live Activities require a newer iOS version."
          : "No native glanceable surface is available.",
    },
    {
      id: "traffic",
      label: "Hosted traffic",
      status: capabilities.hostedTrafficConfigured ? "pass" : "warning",
      detail: capabilities.hostedTrafficConfigured
        ? "Native background refresh has an HTTPS traffic endpoint."
        : "Set VITE_DEPARTURE_API_BASE_URL before shipping the native app.",
    },
    {
      id: "next-plan",
      label: "Next plan scheduled",
      status:
        nativePlanSync.status === "scheduled" ||
        (capabilities.scheduledAlarmCount ?? 0) > 0
          ? "pass"
          : "warning",
      detail:
        nativePlanSync.status === "scheduled"
          ? "Wake, leave, background refresh, and glanceable surfaces are synchronized."
          : (capabilities.scheduledAlarmCount ?? 0) > 0
            ? "The operating system reports the next Departure alarm is scheduled."
          : nativePlanSync.status === "error"
            ? nativePlanSync.message
            : "Add a complete upcoming commitment to schedule the next alarm.",
    },
  ];
}
