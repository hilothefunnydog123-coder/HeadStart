import { useEffect, useRef, useState } from "react";
import { parseCalendarIcs } from "../core/calendar";
import {
  configuredGoogleClientId,
  importGoogleCalendarCommitments,
  loadGoogleIdentityScript,
  requestGoogleCalendarAccessToken,
  revokeGoogleCalendarAccess,
} from "../core/googleCalendar";
import type {
  CalendarConnection,
  CalendarProviderId,
  Commitment,
  Place,
} from "../core/types";

interface ImportMetadata {
  sourceLabel: string;
  sourceUrl?: string;
  authMode?: CalendarConnection["authMode"];
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
  description: string;
}[] = [
  {
    id: "google",
    name: "Google Calendar",
    mark: "G",
    description:
      "Connect privately with read-only event access. Imported events stay editable.",
  },
  {
    id: "apple",
    name: "Apple Calendar file",
    mark: "A",
    description:
      "Apple Calendar does not offer Google-style web calendar sign-in here. Import a private .ics file, or use a future CalDAV/backend connector.",
  },
];

const ENV_GOOGLE_CLIENT_ID = configuredGoogleClientId();

export function CalendarConnectors({
  connections,
  fallbackDestination,
  onImport,
  onDisconnect,
  onError,
}: Props) {
  const [googleAccessToken, setGoogleAccessToken] = useState<string | null>(null);
  const [busyProvider, setBusyProvider] = useState<CalendarProviderId | null>(null);
  const fileInputs = useRef<Record<CalendarProviderId, HTMLInputElement | null>>({
    google: null,
    apple: null,
  });

  useEffect(() => {
    if (ENV_GOOGLE_CLIENT_ID) {
      void loadGoogleIdentityScript().catch(() => undefined);
    }
  }, []);

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

  const importFromGoogle = async () => {
    if (!ENV_GOOGLE_CLIENT_ID) {
      onError("google", "Google Calendar is not configured for this build.");
      return;
    }

    setBusyProvider("google");
    try {
      const token = await requestGoogleCalendarAccessToken(ENV_GOOGLE_CLIENT_ID);
      setGoogleAccessToken(token);
      const imported = await importGoogleCalendarCommitments(
        token,
        fallbackDestination,
      );
      if (imported.length === 0) {
        throw new Error("No upcoming timed events were found.");
      }
      onImport("google", imported, {
        sourceLabel: "Google Calendar",
        authMode: "google-oauth",
      });
    } catch (error) {
      onError("google", errorMessage(error, "Couldn't connect Google Calendar."));
    } finally {
      setBusyProvider(null);
    }
  };

  const importFromFile = async (provider: CalendarProviderId, file: File | undefined) => {
    if (!file) return;
    setBusyProvider(provider);
    try {
      const text = await file.text();
      importText(provider, text, {
        sourceLabel: file.name,
        authMode: "file-upload",
      });
    } catch (error) {
      onError(provider, errorMessage(error, "Couldn't read that calendar file."));
    } finally {
      setBusyProvider(null);
    }
  };

  const disconnect = (provider: CalendarProviderId) => {
    if (provider === "google" && googleAccessToken) {
      revokeGoogleCalendarAccess(googleAccessToken);
      setGoogleAccessToken(null);
    }
    onDisconnect(provider);
  };

  return (
    <section className="calendar-connectors" aria-label="Calendar connections">
      <div className="section-heading">
        <div>
          <h3>Calendar import</h3>
          <p className="muted">Imported events become editable commitments.</p>
        </div>
      </div>

      <div className="connector-grid">
        {PROVIDERS.map((provider) => {
          const connection = connectionFor(connections, provider.id);
          const busy = busyProvider === provider.id;
          const isGoogle = provider.id === "google";
          const googleReady = Boolean(ENV_GOOGLE_CLIENT_ID);

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

              <p className="connector-description">{provider.description}</p>

              <div className="connector-actions">
                {isGoogle && (
                  <button
                    type="button"
                    className="primary-button"
                    disabled={busy || !googleReady}
                    onClick={() => void importFromGoogle()}
                  >
                    {busy
                      ? "Syncing..."
                      : connection.authMode === "google-oauth"
                        ? "Sync Google"
                        : "Connect Google"}
                  </button>
                )}
                <button
                  type="button"
                  className={isGoogle ? "secondary-button" : "primary-button"}
                  disabled={busy}
                  onClick={() => fileInputs.current[provider.id]?.click()}
                >
                  Import .ics
                </button>
                {connection.connected && (
                  <button
                    type="button"
                    className="link-button danger-link"
                    disabled={busy}
                    onClick={() => disconnect(provider.id)}
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
              {isGoogle && !googleReady && (
                <p className="field-error connector-error">
                  Google Calendar sign-in is not enabled for this build yet.
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

function errorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}
