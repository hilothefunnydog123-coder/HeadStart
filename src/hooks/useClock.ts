import { useEffect, useReducer, useRef } from "react";

/**
 * A clock the app can either read from the real world or *drive* — the engine
 * behind "Simulate morning". In live mode `now` is the wall clock. In sim mode
 * a virtual clock runs from a chosen start at a chosen speed (e.g. 90×), or
 * sits frozen at a scrubbed instant, so the whole UI — sky, dial, confidence,
 * phases, alarm — can be fast-forwarded on demand.
 */

export interface ClockControl {
  isSim: boolean;
  isPlaying: boolean;
  speed: number;
  /** Enter sim mode starting at `fromMs`, auto-pausing at `endMs`. */
  start: (fromMs: number, endMs: number, speed?: number) => void;
  play: () => void;
  pause: () => void;
  seek: (ms: number) => void;
  setSpeed: (speed: number) => void;
  exit: () => void;
  range: { startMs: number; endMs: number } | null;
}

type State =
  | { mode: "live" }
  | {
      mode: "sim";
      baseSim: number;
      baseReal: number;
      speed: number;
      playing: boolean;
      frozen: number;
      startMs: number;
      endMs: number;
    };

const TICK_MS = 200;

export function useClock(): { now: Date; control: ClockControl } {
  const [, force] = useReducer((x: number) => x + 1, 0);
  const ref = useRef<State>({ mode: "live" });

  useEffect(() => {
    const id = window.setInterval(force, TICK_MS);
    return () => window.clearInterval(id);
  }, []);

  const s = ref.current;
  let nowMs: number;
  if (s.mode === "live") {
    nowMs = Date.now();
  } else if (!s.playing) {
    nowMs = s.frozen;
  } else {
    nowMs = s.baseSim + (Date.now() - s.baseReal) * s.speed;
  }

  // Auto-pause at the end of the simulated window.
  useEffect(() => {
    const cur = ref.current;
    if (cur.mode === "sim" && cur.playing && nowMs >= cur.endMs) {
      ref.current = { ...cur, playing: false, frozen: cur.endMs };
      force();
    }
  }, [nowMs]);

  const control: ClockControl = {
    isSim: s.mode === "sim",
    isPlaying: s.mode === "sim" && s.playing,
    speed: s.mode === "sim" ? s.speed : 1,
    range: s.mode === "sim" ? { startMs: s.startMs, endMs: s.endMs } : null,
    start: (fromMs, endMs, speed = 90) => {
      ref.current = {
        mode: "sim",
        baseSim: fromMs,
        baseReal: Date.now(),
        speed,
        playing: true,
        frozen: fromMs,
        startMs: fromMs,
        endMs,
      };
      force();
    },
    play: () => {
      const cur = ref.current;
      if (cur.mode !== "sim") return;
      const from = cur.frozen >= cur.endMs ? cur.startMs : cur.frozen;
      ref.current = { ...cur, playing: true, baseSim: from, baseReal: Date.now() };
      force();
    },
    pause: () => {
      const cur = ref.current;
      if (cur.mode !== "sim") return;
      const at = cur.playing
        ? cur.baseSim + (Date.now() - cur.baseReal) * cur.speed
        : cur.frozen;
      ref.current = { ...cur, playing: false, frozen: at };
      force();
    },
    seek: (ms) => {
      const cur = ref.current;
      if (cur.mode !== "sim") return;
      ref.current = { ...cur, playing: false, frozen: ms };
      force();
    },
    setSpeed: (speed) => {
      const cur = ref.current;
      if (cur.mode !== "sim") return;
      const at = cur.playing
        ? cur.baseSim + (Date.now() - cur.baseReal) * cur.speed
        : cur.frozen;
      ref.current = { ...cur, speed, baseSim: at, baseReal: Date.now() };
      force();
    },
    exit: () => {
      ref.current = { mode: "live" };
      force();
    },
  };

  return { now: new Date(nowMs), control };
}
