import { describe, expect, it } from "vitest";
import {
  minutesToTimeString,
  nextOccurrence,
  parseTimeToMinutes,
  selectNextCommitment,
} from "../src/core/time";
import type { Commitment, Place } from "../src/core/types";

const dest: Place = { id: "d", label: "Office", lat: 37.79, lng: -122.4 };

function commitment(over: Partial<Commitment> = {}): Commitment {
  return {
    id: "c1",
    title: "Standup",
    destination: dest,
    travelMode: "drive",
    arriveByMinutes: 9 * 60,
    days: [1, 2, 3, 4, 5],
    enabled: true,
    ...over,
  };
}

describe("parseTimeToMinutes", () => {
  it("parses valid times", () => {
    expect(parseTimeToMinutes("09:00")).toBe(540);
    expect(parseTimeToMinutes("23:59")).toBe(1439);
    expect(parseTimeToMinutes("0:05")).toBe(5);
  });
  it("rejects malformed or out-of-range times", () => {
    expect(parseTimeToMinutes("24:00")).toBeNull();
    expect(parseTimeToMinutes("9-00")).toBeNull();
    expect(parseTimeToMinutes("aa:bb")).toBeNull();
  });
});

describe("minutesToTimeString", () => {
  it("round-trips and wraps", () => {
    expect(minutesToTimeString(540)).toBe("09:00");
    expect(minutesToTimeString(0)).toBe("00:00");
    expect(minutesToTimeString(24 * 60)).toBe("00:00");
  });
});

describe("nextOccurrence", () => {
  it("returns today's time if still upcoming on a matching day", () => {
    // Wednesday 2026-07-08, 06:00 local — standup at 09:00 is later today.
    const from = new Date(2026, 6, 8, 6, 0, 0);
    const next = nextOccurrence(commitment(), from);
    expect(next).not.toBeNull();
    expect(next!.getHours()).toBe(9);
    expect(next!.getDate()).toBe(8);
  });

  it("rolls to the next matching weekday once today's time has passed", () => {
    // Wednesday 10:00 — past 09:00, so next is Thursday.
    const from = new Date(2026, 6, 8, 10, 0, 0);
    const next = nextOccurrence(commitment(), from);
    expect(next!.getDate()).toBe(9);
    expect(next!.getDay()).toBe(4);
  });

  it("skips non-recurring weekend days", () => {
    // Saturday 2026-07-11 — weekdays-only commitment jumps to Monday.
    const from = new Date(2026, 6, 11, 8, 0, 0);
    const next = nextOccurrence(commitment(), from);
    expect(next!.getDay()).toBe(1); // Monday
  });

  it("handles one-off commitments and expires them", () => {
    const oneOff = commitment({ days: [], oneOffDate: "2026-07-10" });
    const before = new Date(2026, 6, 9, 12, 0, 0);
    const after = new Date(2026, 6, 11, 12, 0, 0);
    expect(nextOccurrence(oneOff, before)).not.toBeNull();
    expect(nextOccurrence(oneOff, after)).toBeNull();
  });
});

describe("selectNextCommitment", () => {
  it("picks the soonest enabled commitment", () => {
    const early = commitment({ id: "early", arriveByMinutes: 8 * 60 });
    const late = commitment({ id: "late", arriveByMinutes: 10 * 60 });
    const from = new Date(2026, 6, 8, 6, 0, 0);
    const pick = selectNextCommitment([late, early], from);
    expect(pick?.commitment.id).toBe("early");
  });

  it("ignores disabled commitments", () => {
    const disabled = commitment({ id: "off", arriveByMinutes: 7 * 60, enabled: false });
    const on = commitment({ id: "on", arriveByMinutes: 9 * 60 });
    const from = new Date(2026, 6, 8, 6, 0, 0);
    const pick = selectNextCommitment([disabled, on], from);
    expect(pick?.commitment.id).toBe("on");
  });

  it("returns null when nothing qualifies", () => {
    const from = new Date(2026, 6, 8, 6, 0, 0);
    expect(selectNextCommitment([], from)).toBeNull();
  });
});
