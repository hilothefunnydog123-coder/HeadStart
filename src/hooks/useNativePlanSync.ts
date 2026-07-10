import { useEffect, useRef, useState } from "react";
import type { DeparturePlan, Settings } from "../core/types";
import {
  cancelNativePlan,
  cancelCurrentNativePlan,
  isNativeDepartureApp,
  nativePlanPayload,
  scheduleNativePlan,
} from "../native/departureNative";

export type NativePlanSyncState =
  | { status: "web" }
  | { status: "idle" }
  | { status: "scheduling" }
  | { status: "scheduled"; planId: string }
  | { status: "error"; message: string };

export function useNativePlanSync(
  plan: DeparturePlan | null,
  settings: Settings,
): NativePlanSyncState {
  const [state, setState] = useState<NativePlanSyncState>(() =>
    isNativeDepartureApp() ? { status: "idle" } : { status: "web" },
  );
  const scheduledId = useRef<string | null>(null);
  const enabled = settings.nativeAlarmsEnabled ?? true;
  const payload = plan ? nativePlanPayload(plan, settings) : null;
  const key = payload
    ? [payload.id, payload.wakeAt, payload.leaveAt, payload.trafficEndpoint].join("|")
    : "";

  useEffect(() => {
    if (!isNativeDepartureApp()) return;
    if (!enabled || !payload) {
      const previousId = scheduledId.current;
      scheduledId.current = null;
      setState({ status: "idle" });
      void (previousId
        ? cancelNativePlan(previousId)
        : cancelCurrentNativePlan()
      ).catch(() => undefined);
      return;
    }

    let cancelled = false;
    setState({ status: "scheduling" });
    const previousId = scheduledId.current;
    const replacePrevious =
      previousId && previousId !== payload.id
        ? cancelNativePlan(previousId)
        : Promise.resolve();
    void replacePrevious
      .then(() => scheduleNativePlan(payload))
      .then((scheduled) => {
        if (cancelled) return;
        if (!scheduled) {
          setState({ status: "error", message: "Native alarm permission is required." });
          return;
        }
        scheduledId.current = payload.id;
        setState({ status: "scheduled", planId: payload.id });
      })
      .catch((error) => {
        if (cancelled) return;
        setState({
          status: "error",
          message: error instanceof Error ? error.message : "Native alarm scheduling failed.",
        });
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, key]);

  return state;
}
