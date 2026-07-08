import { useEffect, useRef } from "react";
import type { PlanPhase } from "../core/types";
import { playAlarmChime } from "../core/alarmSound";

/**
 * Plays a short chime the moment the plan enters the "wake" phase.
 *
 * Uses the Web Audio API so there's no audio asset to ship, and only fires on
 * the sleep→wake transition (not every render). Browsers require a prior user
 * gesture before audio can play; if blocked, this fails silently.
 */
export function useAlarmSound(phase: PlanPhase | null, enabled: boolean): void {
  const prevPhase = useRef<PlanPhase | null>(null);

  useEffect(() => {
    const was = prevPhase.current;
    prevPhase.current = phase;
    if (!enabled) return;
    if (phase === "wake" && was && was !== "wake") {
      playAlarmChime();
    }
  }, [phase, enabled]);
}
