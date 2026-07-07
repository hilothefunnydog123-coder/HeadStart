import { useEffect, useRef, useState } from "react";
import { planNextDeparture } from "../core/departure";
import type { Commitment, DeparturePlan, PlanPhase, Settings } from "../core/types";

export type PlanResult =
  | { status: "loading" }
  | { status: "empty"; phase: Extract<PlanPhase, "no-home" | "no-commitment"> }
  | { status: "ready"; plan: DeparturePlan }
  | { status: "error"; message: string };

/**
 * Computes the departure plan and keeps it fresh.
 *
 * Every `refreshMs` (default 60s) we re-run the traffic estimate so the plan
 * tracks changing congestion — the whole point of the app. On-screen countdowns
 * stay live every second by deriving from the returned `leaveBy`/`wakeBy`
 * instants against a ticking `now` in the component, so we don't refetch just to
 * update a clock.
 */
export function usePlan(
  commitments: Commitment[],
  settings: Settings,
  refreshMs = 60_000,
): PlanResult {
  const [result, setResult] = useState<PlanResult>({ status: "loading" });
  const lastFetch = useRef(0);

  // Serialize the inputs that should trigger a refetch. `now` is intentionally
  // excluded — it changes every second and would thrash the provider.
  const inputsKey = JSON.stringify({ commitments, settings });

  useEffect(() => {
    let cancelled = false;

    async function run() {
      try {
        const outcome = await planNextDeparture(commitments, settings, new Date());
        if (cancelled) return;
        if ("commitment" in outcome) {
          setResult({ status: "ready", plan: outcome });
        } else {
          setResult({ status: "empty", phase: outcome.phase });
        }
        lastFetch.current = Date.now();
      } catch (err) {
        if (cancelled) return;
        setResult({
          status: "error",
          message: err instanceof Error ? err.message : "Failed to plan route.",
        });
      }
    }

    run();
    const id = window.setInterval(run, refreshMs);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inputsKey, refreshMs]);

  return result;
}
