import type { Settings } from "../core/types";
import { listProviders } from "../core/traffic/provider";
import { PlacePicker } from "./PlacePicker";

interface Props {
  settings: Settings;
  onChange: (settings: Settings) => void;
}

export function SettingsPanel({ settings, onChange }: Props) {
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

      <label className="checkbox-row">
        <input
          type="checkbox"
          checked={settings.soundEnabled}
          onChange={(e) => set("soundEnabled", e.target.checked)}
        />
        <span>Play a sound when it's time to wake up</span>
      </label>

      <label className="checkbox-row">
        <input
          type="checkbox"
          checked={settings.locationTrackingEnabled}
          onChange={(e) => set("locationTrackingEnabled", e.target.checked)}
        />
        <span>Use live location for missed-departure alerts</span>
      </label>
    </div>
  );
}

function clampInt(raw: string, min: number, max: number): number {
  const n = Math.round(Number(raw));
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, n));
}
