import type { Commitment, Weekday } from "./types";

export const MINUTES_PER_DAY = 24 * 60;

/** Convert "HH:MM" to minutes-from-midnight. Returns null if malformed. */
export function parseTimeToMinutes(value: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

/** Convert minutes-from-midnight to "HH:MM" (24h). */
export function minutesToTimeString(total: number): string {
  const wrapped = ((total % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  const hours = Math.floor(wrapped / 60);
  const minutes = wrapped % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

/** Format an instant as a friendly local time, e.g. "7:12 AM". */
export function formatClock(date: Date): string {
  return date.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
}

/** Format a signed minute count as a compact human duration, e.g. "1h 05m". */
export function formatDuration(totalMinutes: number): string {
  const sign = totalMinutes < 0 ? "-" : "";
  const abs = Math.abs(Math.round(totalMinutes));
  const hours = Math.floor(abs / 60);
  const minutes = abs % 60;
  if (hours === 0) return `${sign}${minutes}m`;
  return `${sign}${hours}h ${String(minutes).padStart(2, "0")}m`;
}

/** Build a Date on the same calendar day as `ref` at the given minutes. */
function atMinutesOfDay(ref: Date, minutesFromMidnight: number): Date {
  const d = new Date(ref);
  d.setHours(0, 0, 0, 0);
  d.setMinutes(minutesFromMidnight);
  return d;
}

function isoDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * The next instant this commitment is due at/after `from`.
 *
 * For recurring commitments this scans forward up to 8 days to find the next
 * matching weekday whose arrival time has not yet passed. For one-off
 * commitments it returns the single date/time if still in the future.
 * Returns null if the commitment can never fire again (past one-off).
 */
export function nextOccurrence(commitment: Commitment, from: Date): Date | null {
  if (commitment.oneOffDate && commitment.days.length === 0) {
    const [y, m, d] = commitment.oneOffDate.split("-").map(Number);
    if (!y || !m || !d) return null;
    const base = new Date(y, m - 1, d);
    const due = atMinutesOfDay(base, commitment.arriveByMinutes);
    return due.getTime() >= from.getTime() ? due : null;
  }

  if (commitment.days.length === 0) return null;

  const daySet = new Set<Weekday>(commitment.days);
  for (let offset = 0; offset <= 7; offset++) {
    const day = new Date(from);
    day.setDate(day.getDate() + offset);
    if (!daySet.has(day.getDay() as Weekday)) continue;
    const due = atMinutesOfDay(day, commitment.arriveByMinutes);
    if (due.getTime() >= from.getTime()) return due;
  }
  return null;
}

/**
 * Of all enabled commitments, the one whose next occurrence is soonest — the
 * "first commitment of the day" the alarm should plan around.
 */
export function selectNextCommitment(
  commitments: Commitment[],
  from: Date,
): { commitment: Commitment; arriveBy: Date } | null {
  let best: { commitment: Commitment; arriveBy: Date } | null = null;
  for (const commitment of commitments) {
    if (!commitment.enabled) continue;
    if (commitment.source?.needsLocationReview) continue;
    const arriveBy = nextOccurrence(commitment, from);
    if (!arriveBy) continue;
    if (!best || arriveBy.getTime() < best.arriveBy.getTime()) {
      best = { commitment, arriveBy };
    }
  }
  return best;
}

export const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export { isoDate };
