import { useRef, useState } from "react";
import {
  parseCalendarIcs,
} from "../core/calendar";
import type {
  CalendarConnection,
  CalendarProviderId,
  Commitment,
  Place,
} from "../core/types";

interface ImportMetadata {
  sourceLabel: string;
  sourceUrl?: string;
}

interface Props {
  connections: CalendarConnection[];
  fallbackDestination: Place;
  onImport: (
    provider: CalendarProviderId,
    commitments: Commitment[],
    metadata: ImportMetadata,
  ) => void;
  onDisconnect: (provider: CalendarProviderId) => void;
  onError: (provider: CalendarProviderId, message: string) => void;
}

const PROVIDERS: {
  id: CalendarProviderId;
  name: string;
  mark: string;
  urlPlaceholder: string;
}[] = [
  {
    id: "google",
    name: "Google Calendar",
    mark: "G",
    urlPlaceholder: "https://calendar.google.com/calendar/ical/...",
  },
  {
    id: "apple",
    name: "Apple Calendar",
    mark: "A",
    urlPlaceholder: "webcal://pXX-caldav.icloud.com/published/...",
  },
];

export function CalendarConnectors({
  connections,
  fallbackDestination,
  onImport,
  onDisconnect,
  onError,
}: Props) {
  const [urls, setUrls] = useState<Record<CalendarProviderId, string>>({
    google: connectionFor(connections, "google").sourceUrl ?? "",
    apple: connectionFor(connections, "apple").sourceUrl ?? "",
  });
  const [busyProvider, setBusyProvider] = useState<CalendarProviderId | null>(null);
  const fileInputs = useRef<Record<CalendarProviderId, HTMLInputElement | null>>({
    google: null,
    apple: null,
  });

  const importText = (
    provider: CalendarProviderId,
    text: string,
    metadata: ImportMetadata,
  ) => {
    const imported = parseCalendarIcs(text, provider, fallbackDestination);
    if (imported.length === 0) {
      throw new Error("No upcoming timed events were found.");
    }
    onImport(provider, imported, metadata);
  };

  const importFromUrl = async (provider: CalendarProviderId) => {
    const rawUrl = urls[provider].trim() || connectionFor(connections, provider).sourceUrl;
    if (!rawUrl) {
      onError(provider, "Enter an iCal URL first.");
      return;
    }

    const url = normalizeCalendarUrl(rawUrl);
    setBusyProvider(provider);
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`Calendar returned ${response.status}.`);
      const text = await response.text();
      importText(provider, text, {
        sourceLabel: labelFromUrl(url),
        sourceUrl: url,
      });
      setUrls((current) => ({ ...current, [provider]: url }));
    } catch (error) {
      onError(provider, errorMessage(error, "Couldn't import that calendar URL."));
    } finally {
      setBusyProvider(null);
    }
  };

  const importFromFile = async (provider: CalendarProviderId, file: File | undefined) => {
    if (!file) return;
    setBusyProvider(provider);
    try {
      const text = await file.text();
      importText(provider, text, { sourceLabel: file.name });
      setUrls((current) => ({ ...current, [provider]: "" }));
    } catch (error) {
      onError(provider, errorMessage(error, "Couldn't read that calendar file."));
    } finally {
      setBusyProvider(null);
    }
  };

  return (
    <section className="calendar-connectors" aria-label="Calendar connections">
      <div className="section-heading">
        <div>
          <h3>Calendar connectors</h3>
          <p className="muted">Imported events become editable commitments.</p>
        </div>
      </div>

      <div className="connector-grid">
        {PROVIDERS.map((provider) => {
          const connection = connectionFor(connections, provider.id);
          const busy = busyProvider === provider.id;

          return (
            <article key={provider.id} className="connector-card">
              <div className="connector-head">
                <span className="connector-mark" aria-hidden>
                  {provider.mark}
                </span>
                <div>
                  <strong>{provider.name}</strong>
                  <div className="connector-status">
                    {connection.connected
                      ? `${connection.eventCount} events synced`
                      : "Not connected"}
                  </div>
                </div>
              </div>

              <label className="field">
                <span>iCal URL</span>
                <input
                  type="url"
                  value={urls[provider.id]}
                  placeholder={provider.urlPlaceholder}
                  onChange={(event) =>
                    setUrls((current) => ({
                      ...current,
                      [provider.id]: event.target.value,
                    }))
                  }
                />
              </label>

              <div className="connector-actions">
                <button
                  type="button"
                  className="primary-button"
                  disabled={busy}
                  onClick={() => void importFromUrl(provider.id)}
                >
                  {busy ? "Syncing..." : connection.sourceUrl ? "Sync" : "Connect"}
                </button>
                <button
                  type="button"
                  className="secondary-button"
                  disabled={busy}
                  onClick={() => fileInputs.current[provider.id]?.click()}
                >
                  Upload
                </button>
                {connection.connected && (
                  <button
                    type="button"
                    className="link-button danger-link"
                    disabled={busy}
                    onClick={() => {
                      setUrls((current) => ({ ...current, [provider.id]: "" }));
                      onDisconnect(provider.id);
                    }}
                  >
                    Disconnect
                  </button>
                )}
              </div>

              <input
                ref={(node) => {
                  fileInputs.current[provider.id] = node;
                }}
                className="visually-hidden"
                type="file"
                accept=".ics,text/calendar"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  event.target.value = "";
                  void importFromFile(provider.id, file);
                }}
              />

              {connection.lastSyncedAt && (
                <p className="connector-meta">
                  {connection.sourceLabel ?? "Calendar"} ·{" "}
                  {new Date(connection.lastSyncedAt).toLocaleString()}
                </p>
              )}
              {connection.error && (
                <p className="field-error connector-error">{connection.error}</p>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}

function connectionFor(
  connections: CalendarConnection[],
  provider: CalendarProviderId,
): CalendarConnection {
  return (
    connections.find((connection) => connection.provider === provider) ?? {
      provider,
      connected: false,
      eventCount: 0,
    }
  );
}

function normalizeCalendarUrl(url: string): string {
  return url.trim().replace(/^webcal:\/\//i, "https://");
}

function labelFromUrl(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return "Calendar URL";
  }
}

function errorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}
