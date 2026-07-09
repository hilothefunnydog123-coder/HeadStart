import { useEffect, useRef, useState } from "react";
import { fetchPrivateAppleCalendar } from "../core/appleCalendar";
import { parseCalendarIcs } from "../core/calendar";
import { Icon } from "./Icon";
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
    name: "Apple Calendar",
    mark: "A",
    description:
      "Connect your private iCloud calendar with read-only access. Nothing needs to be published.",
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
  const [appleDialogOpen, setAppleDialogOpen] = useState(false);
  const [appleEmail, setAppleEmail] = useState("");
  const [applePassword, setApplePassword] = useState("");
  const [appleError, setAppleError] = useState<string | null>(null);
  const [busyProvider, setBusyProvider] = useState<CalendarProviderId | null>(null);
  const appleDialog = useRef<HTMLDialogElement | null>(null);
  const fileInputs = useRef<Record<CalendarProviderId, HTMLInputElement | null>>({
    google: null,
    apple: null,
  });

  useEffect(() => {
    if (ENV_GOOGLE_CLIENT_ID) {
      void loadGoogleIdentityScript().catch(() => undefined);
    }
  }, []);

  useEffect(() => {
    const dialog = appleDialog.current;
    if (!dialog) return;
    if (appleDialogOpen && !dialog.open) dialog.showModal();
    if (!appleDialogOpen && dialog.open) dialog.close();
  }, [appleDialogOpen]);

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

  const closeAppleDialog = () => {
    setAppleDialogOpen(false);
    setApplePassword("");
    setAppleError(null);
  };

  const importFromGoogle = async () => {
    const clientId = ENV_GOOGLE_CLIENT_ID.trim();
    if (!clientId) {
      onError(
        "google",
        "Google sign-in is still being configured for this site.",
      );
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

  const importFromApple = async () => {
    setAppleError(null);
    setBusyProvider("apple");
    try {
      const result = await fetchPrivateAppleCalendar({
        email: appleEmail,
        appSpecificPassword: applePassword,
      });
      importText("apple", result.ics, {
        sourceLabel: result.sourceLabel,
        authMode: "apple-connector",
      });
      closeAppleDialog();
    } catch (error) {
      const message = errorMessage(error, "Couldn't connect Apple Calendar.");
      setAppleError(message);
      onError("apple", message);
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
          <p className="muted">Imported events become editable commitments.</p>
        </div>
      </div>

      <div className="connector-grid">
        {PROVIDERS.map((provider) => {
          const connection = connectionFor(connections, provider.id);
          const busy = busyProvider === provider.id;
          const isGoogle = provider.id === "google";
          const isApple = provider.id === "apple";

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
                    disabled={busy}
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
                    disabled={busy}
                    onClick={() => {
                      setAppleError(null);
                      setAppleDialogOpen(true);
                    }}
                  >
                    {connection.authMode === "apple-connector"
                      ? "Reconnect Apple"
                      : "Connect Apple"}
                  </button>
                )}
                <button
                  type="button"
                  className="secondary-button"
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
              {connection.error && (
                <p className="field-error connector-error">{connection.error}</p>
              )}
            </article>
          );
        })}
      </div>

      <dialog
        ref={appleDialog}
        className="calendar-dialog"
        aria-labelledby="apple-calendar-title"
        onCancel={closeAppleDialog}
        onClose={closeAppleDialog}
      >
        <form
          className="calendar-dialog-card"
          onSubmit={(event) => {
            event.preventDefault();
            void importFromApple();
          }}
        >
          <div className="dialog-heading">
            <div>
              <h3 id="apple-calendar-title">Connect Apple Calendar</h3>
              <p>Private, read-only access through iCloud.</p>
            </div>
            <button
              type="button"
              className="dialog-close"
              aria-label="Close Apple Calendar connection"
              onClick={closeAppleDialog}
            >
              <Icon name="close" size={18} />
            </button>
          </div>

          <label className="field">
            <span>Apple Account email</span>
            <input
              type="email"
              autoComplete="username"
              value={appleEmail}
              onChange={(event) => setAppleEmail(event.target.value)}
              placeholder="you@icloud.com"
              required
            />
          </label>
          <label className="field">
            <span>App-specific password</span>
            <input
              type="password"
              autoComplete="current-password"
              value={applePassword}
              onChange={(event) => setApplePassword(event.target.value)}
              placeholder="xxxx-xxxx-xxxx-xxxx"
              required
              minLength={8}
            />
          </label>

          <p className="calendar-privacy-note">
            Sent securely for this sync and never saved by Departure. Generate a
            password in{" "}
            <a href="https://account.apple.com" target="_blank" rel="noreferrer">
              Apple Account
            </a>
            .
          </p>
          {appleError && (
            <p className="auth-error" role="alert">
              {appleError}
            </p>
          )}
          <div className="dialog-actions">
            <button
              type="button"
              className="secondary-button"
              onClick={closeAppleDialog}
            >
              Cancel
            </button>
            <button type="submit" className="primary-button" disabled={busyProvider === "apple"}>
              {busyProvider === "apple" ? "Connecting..." : "Connect calendar"}
            </button>
          </div>
        </form>
      </dialog>
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
