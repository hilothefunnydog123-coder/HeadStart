import { useCallback, useEffect, useState } from "react";
import { App } from "@capacitor/app";
import type { Commitment, Place } from "../core/types";
import { nativeCalendarEventsToCommitments } from "../core/nativeCalendar";
import {
  getNativeCapabilities,
  isNativeDepartureApp,
  readNativeCalendarEvents,
  requestNativeCalendarAuthorization,
  type NativeCapabilities,
} from "../native/departureNative";

export interface NativeCalendarAutomationState {
  status: "web" | "idle" | "permission-required" | "syncing" | "ready" | "error";
  importedCount: number;
  message?: string;
  capabilities: NativeCapabilities | null;
  enable(): Promise<void>;
  refresh(): Promise<void>;
}

export function useNativeCalendarAutomation(options: {
  enabled: boolean;
  fallbackDestination: Place;
  onImport: (commitments: Commitment[]) => void;
}): NativeCalendarAutomationState {
  const { enabled, fallbackDestination, onImport } = options;
  const [status, setStatus] = useState<NativeCalendarAutomationState["status"]>(
    isNativeDepartureApp() ? "idle" : "web",
  );
  const [importedCount, setImportedCount] = useState(0);
  const [message, setMessage] = useState<string | undefined>();
  const [capabilities, setCapabilities] = useState<NativeCapabilities | null>(null);

  const refresh = useCallback(async () => {
    if (!isNativeDepartureApp()) return;
    setStatus("syncing");
    setMessage(undefined);
    try {
      const nextCapabilities = await getNativeCapabilities();
      setCapabilities(nextCapabilities);
      if (nextCapabilities.calendarAuthorization !== "authorized") {
        setStatus("permission-required");
        return;
      }
      const start = new Date();
      const end = new Date(start.getTime() + 14 * 24 * 60 * 60_000);
      const events = await readNativeCalendarEvents(start, end);
      const commitments = nativeCalendarEventsToCommitments(
        events,
        fallbackDestination,
        start,
      );
      onImport(commitments);
      setImportedCount(commitments.length);
      setStatus("ready");
    } catch (error) {
      setStatus("error");
      setMessage(
        error instanceof Error ? error.message : "Device calendar sync failed.",
      );
    }
  }, [fallbackDestination, onImport]);

  const enable = useCallback(async () => {
    if (!isNativeDepartureApp()) return;
    try {
      const nextCapabilities = await requestNativeCalendarAuthorization();
      setCapabilities(nextCapabilities);
      if (nextCapabilities.calendarAuthorization !== "authorized") {
        setStatus("permission-required");
        return;
      }
      await refresh();
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "Calendar permission failed.");
    }
  }, [refresh]);

  useEffect(() => {
    if (!enabled || !isNativeDepartureApp()) return;
    void refresh();
    let disposed = false;
    let removeListener: (() => Promise<void>) | undefined;
    void App.addListener("appStateChange", ({ isActive }) => {
      if (isActive) void refresh();
    }).then((handle) => {
      if (disposed) {
        void handle.remove();
      } else {
        removeListener = () => handle.remove();
      }
    });
    return () => {
      disposed = true;
      void removeListener?.();
    };
  }, [enabled, refresh]);

  return { status, importedCount, message, capabilities, enable, refresh };
}
