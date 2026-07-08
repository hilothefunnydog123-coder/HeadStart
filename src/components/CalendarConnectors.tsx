import { useEffect, useRef, useState } from "react";
import { parseCalendarIcs } from "../core/calendar";
import {
  configuredCalendarConnectorUrl,
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
    name: "Apple Calendar",
    mark: "A",
    description:
      "Apple Calendar does not offer Google-style web calendar sign-in here. Import a private .ics file, or use a future CalDAV/backend connector.",
  },
];

const ENV_GOOGLE_CLIENT_ID = configuredGoogleClientId();
const ENV_CONNECTOR_URL = configuredCalendarConnectorUrl();

export function CalendarConnectors({
  connections,
  fallbackDestination,
  onImport,
  onDisconnect,
  onError,
}: Props) {
  const [googleAccessToken, setGoogleAccessToken] = useState<string | null>(null);
  const [localGoogleClientId, setLocalGoogleClientId] = useState("");
  const [connectorUrl, setConnectorUrl] = useState(ENV_CONNECTOR_URL);
  const [busyProvider, setBusyProvider] = useState<CalendarProviderId | null>(null);
  const fileInputs = useRef<Record<CalendarProviderId, HTMLInputElement | null>>({
    google: null,
    apple: null,
  });

  useEffect(() => {
    if (ENV_GOOGLE_CLIENT_ID || localGoogleClientId) {
      void loadGoogleIdentityScript().catch(() => undefined);
    }
  }, [localGoogleClientId]);

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
    const clientId = (ENV_GOOGLE_CLIENT_ID || localGoogleClientId).trim();
    if (!clientId) {
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
      });
    } catch (error) {
      onError("google", errorMessage(error, "Couldn't connect Google Calendar."));
    } finally {
      setBusyProvider(null);
    }
  };

  const connectWithCalendarConnector = (provider: CalendarProviderId) => {
    const trimmed = connectorUrl.trim().replace(/\/$/, "");
    if (!trimmed) {
      return;
    }
    const returnTo = encodeURIComponent(window.location.href);
    window.location.href = `${trimmed}/${provider}/start?returnTo=${returnTo}`;
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
    if (!window.confirm(`Disconnect ${providerLabel(provider)} and remove imported events?`)) {
      return;
    }
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
          <p className="muted">Imported events become editable schedule items.</p>
        </div>
      </div>

      <div className="connector-grid">
        {PROVIDERS.map((provider) => {
          const connection = connectionFor(connections, provider.id);
          const busy = busyProvider === provider.id;
          const isGoogle = provider.id === "google";
          const googleReady = Boolean(ENV_GOOGLE_CLIENT_ID || localGoogleClientId.trim());
          const isApple = provider.id === "apple";
          const googleNeedsSetup = isGoogle && !googleReady;
          const appleNeedsSetup = isApple && !connectorUrl.trim();
          const visibleError = setupOnlyError(connection.error)
            ? undefined
            : connection.error;

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
                    disabled={busy || googleNeedsSetup}
                    title={
                      googleNeedsSetup
                        ? "Add a Google OAuth client ID to enable sign-in."
                        : undefined
                    }
                    onClick={() => void importFromGoogle()}
                  >
                    {busy
                      ? "Syncing..."
                      : connection.authMode === "google-oauth"
                        ? "Sync Google"
                        : "Connect Google"}
                  </button>
                )}
                {isApple && (
                  <button
                    type="button"
                    className="primary-button"
                    disabled={busy || appleNeedsSetup}
                    title={
                      appleNeedsSetup
                        ? "Add a secure connector URL to enable Apple sign-in."
                        : undefined
                    }
                    onClick={() => connectWithCalendarConnector("apple")}
                  >
                    Connect Apple
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
                aria-label={`Import ${provider.name} .ics file`}
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
                <div className="connector-setup">
                  <label className="field">
                    <span>Local Google OAuth client ID</span>
                    <input
                      type="text"
                      value={localGoogleClientId}
                      placeholder="Only needed for local testing"
                      onChange={(event) => setLocalGoogleClientId(event.target.value)}
                    />
                  </label>
                  <p className="connector-meta">
                    Add a client ID to enable Google sign-in here. Production
                    builds should set VITE_GOOGLE_CLIENT_ID so students can
                    connect without pasting setup values.
                  </p>
                </div>
              )}
              {isApple && !connectorUrl.trim() && (
                <div className="connector-setup">
                  <label className="field">
                    <span>Secure calendar connector URL</span>
                    <input
                      type="url"
                      value={connectorUrl}
                      placeholder="https://your-backend.example/calendar"
                      onChange={(event) => setConnectorUrl(event.target.value)}
                    />
                  </label>
                  <p className="connector-meta">
                    Apple does not expose Google-style web calendar OAuth to
                    static frontends. Add a secure backend connector to enable
                    sign-in, or import a private .ics file.
                  </p>
                </div>
              )}
              {visibleError && (
                <p className="field-error connector-error">{visibleError}</p>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}

function providerLabel(provider: CalendarProviderId): string {
  return provider === "google" ? "Google Calendar" : "Apple Calendar";
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

function setupOnlyError(message: string | undefined): boolean {
  return Boolean(
    message &&
      (/Google OAuth web client ID/i.test(message) ||
        /VITE_GOOGLE_CLIENT_ID/i.test(message) ||
        /secure calendar connector backend/i.test(message) ||
        /VITE_CALENDAR_CONNECTOR_URL/i.test(message)),
  );
}
