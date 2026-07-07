import { useState } from "react";
import type { Commitment, TravelMode, Weekday } from "../core/types";
import {
  WEEKDAY_LABELS,
  minutesToTimeString,
  parseTimeToMinutes,
} from "../core/time";
import { makeId } from "../state/store";
import { PlacePicker } from "./PlacePicker";

interface Props {
  commitments: Commitment[];
  onChange: (commitments: Commitment[]) => void;
}

const MODES: { value: TravelMode; label: string }[] = [
  { value: "drive", label: "🚗 Drive" },
  { value: "transit", label: "🚉 Transit" },
  { value: "cycle", label: "🚲 Cycle" },
  { value: "walk", label: "🚶 Walk" },
];

const ALL_DAYS: Weekday[] = [0, 1, 2, 3, 4, 5, 6];

function blankCommitment(): Commitment {
  return {
    id: makeId("cmt"),
    title: "New commitment",
    destination: {
      id: makeId("place"),
      label: "Financial District, SF",
      lat: 37.7946,
      lng: -122.3999,
    },
    travelMode: "drive",
    arriveByMinutes: 9 * 60,
    days: [1, 2, 3, 4, 5],
    enabled: true,
  };
}

export function CommitmentForm({ commitments, onChange }: Props) {
  const [expandedId, setExpandedId] = useState<string | null>(
    commitments[0]?.id ?? null,
  );

  const update = (id: string, patch: Partial<Commitment>) =>
    onChange(commitments.map((c) => (c.id === id ? { ...c, ...patch } : c)));

  const remove = (id: string) =>
    onChange(commitments.filter((c) => c.id !== id));

  const add = () => {
    const c = blankCommitment();
    onChange([...commitments, c]);
    setExpandedId(c.id);
  };

  const toggleDay = (c: Commitment, day: Weekday) => {
    const has = c.days.includes(day);
    update(c.id, {
      days: has ? c.days.filter((d) => d !== day) : [...c.days, day].sort(),
    });
  };

  return (
    <div className="commitments">
      {commitments.length === 0 && (
        <p className="muted">No commitments yet. Add your first one below.</p>
      )}

      {commitments.map((c) => {
        const open = expandedId === c.id;
        return (
          <div key={c.id} className={`commitment-row ${c.enabled ? "" : "disabled"}`}>
            <div className="commitment-head">
              <label className="switch" title={c.enabled ? "Enabled" : "Disabled"}>
                <input
                  type="checkbox"
                  checked={c.enabled}
                  onChange={(e) => update(c.id, { enabled: e.target.checked })}
                />
                <span className="slider" />
              </label>
              <button
                type="button"
                className="commitment-summary"
                onClick={() => setExpandedId(open ? null : c.id)}
                aria-expanded={open}
              >
                <strong>{c.title || "Untitled"}</strong>
                <span className="muted">
                  {minutesToTimeString(c.arriveByMinutes)} ·{" "}
                  {c.days.length
                    ? c.days.map((d) => WEEKDAY_LABELS[d]).join(" ")
                    : c.oneOffDate ?? "one-off"}
                </span>
              </button>
              <button
                type="button"
                className="icon-button"
                aria-label="Delete commitment"
                onClick={() => remove(c.id)}
              >
                ✕
              </button>
            </div>

            {open && (
              <div className="commitment-body">
                <div className="field-grid">
                  <label className="field">
                    <span>Title</span>
                    <input
                      type="text"
                      value={c.title}
                      onChange={(e) => update(c.id, { title: e.target.value })}
                    />
                  </label>
                  <label className="field">
                    <span>Arrive by</span>
                    <input
                      type="time"
                      value={minutesToTimeString(c.arriveByMinutes)}
                      onChange={(e) => {
                        const mins = parseTimeToMinutes(e.target.value);
                        if (mins != null) update(c.id, { arriveByMinutes: mins });
                      }}
                    />
                  </label>
                  <label className="field">
                    <span>Travel mode</span>
                    <select
                      value={c.travelMode}
                      onChange={(e) =>
                        update(c.id, { travelMode: e.target.value as TravelMode })
                      }
                    >
                      {MODES.map((m) => (
                        <option key={m.value} value={m.value}>
                          {m.label}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>

                <div className="days-row" role="group" aria-label="Repeat days">
                  {ALL_DAYS.map((d) => (
                    <button
                      key={d}
                      type="button"
                      className={`day-toggle ${c.days.includes(d) ? "on" : ""}`}
                      onClick={() => toggleDay(c, d)}
                    >
                      {WEEKDAY_LABELS[d]}
                    </button>
                  ))}
                </div>

                <PlacePicker
                  label="Destination"
                  value={c.destination}
                  onChange={(destination) => update(c.id, { destination })}
                />
              </div>
            )}
          </div>
        );
      })}

      <button type="button" className="add-button" onClick={add}>
        + Add commitment
      </button>
    </div>
  );
}
