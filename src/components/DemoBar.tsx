import type { ClockControl } from "../hooks/useClock";
import type { DeparturePlan } from "../core/types";
import { formatClock } from "../core/time";
import { Icon } from "./Icon";

interface Props {
  control: ClockControl;
  plan: DeparturePlan;
  now: Date;
}

const SPEEDS = [30, 90, 240];
const PRE_MS = 30 * 60_000; // start 30 min before wake
const POST_MS = 6 * 60_000; // end a few min after arrival

/**
 * "Simulate morning" — the demo weapon. Fast-forwards a virtual clock across the
 * whole morning so the sky, dial, phases, confidence and alarm all animate on
 * cue. Scrub, change speed, or step out back to real time.
 */
export function DemoBar({ control, plan, now }: Props) {
  const startMs = plan.wakeBy.getTime() - PRE_MS;
  const endMs = plan.arriveBy.getTime() + POST_MS;

  if (!control.isSim) {
    return (
      <button
        type="button"
        className="demo-launch"
        onClick={() => control.start(startMs, endMs, 90)}
      >
        <Icon name="sunrise" size={17} />
        Simulate morning
      </button>
    );
  }

  const span = Math.max(1, endMs - startMs);
  const pos = Math.min(1, Math.max(0, (now.getTime() - startMs) / span));

  return (
    <div className="demo-bar">
      <div className="demo-controls">
        <button
          type="button"
          className="demo-btn primary"
          onClick={() => (control.isPlaying ? control.pause() : control.play())}
          aria-label={control.isPlaying ? "Pause" : "Play"}
        >
          {control.isPlaying ? (
            <span className="demo-pause" />
          ) : (
            <span className="demo-play" />
          )}
        </button>

        <input
          className="demo-scrub"
          type="range"
          min={startMs}
          max={endMs}
          step={30_000}
          value={now.getTime()}
          onChange={(e) => control.seek(Number(e.target.value))}
          aria-label="Scrub simulated time"
        />

        <span className="demo-time">{formatClock(now)}</span>

        <button
          type="button"
          className="demo-btn"
          onClick={control.exit}
          aria-label="Exit simulation"
        >
          <Icon name="close" size={15} />
        </button>
      </div>

      <div className="demo-meta">
        <span className="demo-tag">SIMULATING · {Math.round(pos * 100)}%</span>
        <div className="demo-speeds">
          {SPEEDS.map((s) => (
            <button
              key={s}
              type="button"
              className={`demo-speed ${control.speed === s ? "on" : ""}`}
              onClick={() => control.setSpeed(s)}
            >
              {s}×
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
