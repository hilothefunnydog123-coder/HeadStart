import { useEffect, useRef, useState } from "react";
import {
  planNextDeparture,
  type OriginOverrideSource,
} from "../core/departure";
import type {
  Commitment,
  DeparturePlan,
  Place,
  PlanPhase,
  Settings,
} from "../core/types";

export type PlanResult =
  | { status: "loading" }
  | { status: "empty"; phase: Extract<PlanPhase, "no-home" | "no-commitment"> }
  | { status: "ready"; plan: DeparturePlan }
  | { status: "error"; message: string };

/**
 * Computes the departure plan and keeps it fresh against the supplied clock.
 *
 * We re-run the traffic estimate whenever the inputs change or the clock rolls
 * to a new minute — so the plan tracks changing congestion in real time, and
 * follows a fast-forwarded clock during "Simulate morning". On-screen countdowns
 * stay live sub-minute by deriving from the returned instants in the component.
 */
export function usePlan(
  commitments: Commitment[],
  settings: Settings,
  now: Date,
  originOverride: Place | null = null,
  originOverrideSource: OriginOverrideSource | null = null,
): PlanResult {
  const [result, setResult] = useState<PlanResult>({ status: "loading" });

  const inputsKey = JSON.stringify({
    commitments,
    settings,
    originOverride,
    originOverrideSource,
  });
  const minuteBucket = Math.floor(now.getTime() / 60_000);

  // Keep the freshest `now` available to the async fetch without making it a
  // dependency (which would refetch every render).
  const nowRef = useRef(now);
  nowRef.current = now;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const outcome = await planNextDeparture(
          commitments,
          settings,
          nowRef.current,
          originOverride,
          originOverrideSource ?? "manual",
        );
        if (cancelled) return;
        if ("commitment" in outcome) {
          setResult({ status: "ready", plan: outcome });
        } else {
          setResult({ status: "empty", phase: outcome.phase });
        }
      } catch (err) {
        if (cancelled) return;
        setResult({
          status: "error",
          message: err instanceof Error ? err.message : "Failed to plan route.",
        });
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inputsKey, minuteBucket, originOverride, originOverrideSource]);

  return result;
}
