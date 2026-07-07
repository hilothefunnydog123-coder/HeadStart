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
  clientId?: string;
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
}[] = [
  {
    id: "google",
    name: "Google Calendar",
    mark: "G",
  },
  {
    id: "apple",
    name: "Apple Calendar",
    mark: "A",
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
  const [googleClientId, setGoogleClientId] = useState(
    connectionFor(connections, "google").clientId ?? ENV_GOOGLE_CLIENT_ID,
  );
  const [googleAccessToken, setGoogleAccessToken] = useState<string | null>(null);
  const [busyProvider, setBusyProvider] = useState<CalendarProviderId | null>(null);
  const fileInputs = useRef<Record<CalendarProviderId, HTMLInputElement | null>>({
    google: null,
    apple: null,
  });

  useEffect(() => {
    void loadGoogleIdentityScript().catch(() => undefined);
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
    const clientId = (ENV_GOOGLE_CLIENT_ID || googleClientId).trim();
    if (!clientId) {
      onError("google", "Google sign-in needs an OAuth client ID.");
      return;
    }

    setBusyProvider("google");
    try {
      const token = await requestGoogleCalendarAccessToken(clientId);
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
        clientId: ENV_GOOGLE_CLIENT_ID ? undefined : clientId,
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
          <h3>Calendar connectors</h3>
          <p className="muted">Imported events become editable commitments.</p>
        </div>
      </div>

      <div className="connector-grid">
        {PROVIDERS.map((provider) => {
          const connection = connectionFor(connections, provider.id);
          const busy = busyProvider === provider.id;
          const isGoogle = provider.id === "google";
          const googleReady = Boolean((ENV_GOOGLE_CLIENT_ID || googleClientId).trim());

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

              {isGoogle && !ENV_GOOGLE_CLIENT_ID && (
                <label className="field connector-client-field">
                  <span>OAuth client ID</span>
                  <input
                    type="text"
                    value={googleClientId}
                    placeholder="1234567890-abc.apps.googleusercontent.com"
                    onChange={(event) => setGoogleClientId(event.target.value)}
                  />
                </label>
              )}

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
                        ? "Sync with Google"
                        : "Sign in with Google"}
                  </button>
                )}
                <button
                  type="button"
                  className={isGoogle ? "secondary-button" : "primary-button"}
                  disabled={busy}
                  onClick={() => fileInputs.current[provider.id]?.click()}
                >
                  Upload .ics
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
                  Configure Google sign-in before connecting.
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
