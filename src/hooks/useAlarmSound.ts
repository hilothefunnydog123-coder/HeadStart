import { useEffect, useRef } from "react";
import type { PlanPhase } from "../core/types";

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
      chime();
    }
  }, [phase, enabled]);
}

function chime(): void {
  try {
    const Ctx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const now = ctx.currentTime;
    // Three ascending notes, gentle attack/release.
    [523.25, 659.25, 783.99].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      const t = now + i * 0.22;
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(0.18, t + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.4);
    });
    window.setTimeout(() => ctx.close().catch(() => {}), 1500);
  } catch {
    // Audio unavailable — ignore.
  }
}
