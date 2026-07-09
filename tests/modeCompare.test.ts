import { describe, expect, it } from "vitest";
import { compareTravelModes } from "../src/core/modeCompare";
import type { Place } from "../src/core/types";

const home: Place = { id: "h", label: "Home", lat: 37.7599, lng: -122.4148 };
const office: Place = { id: "o", label: "Office", lat: 37.7946, lng: -122.3999 };

describe("compareTravelModes", () => {
  it("returns an estimate for every travel mode", async () => {
    const estimates = await compareTravelModes(
      home,
      office,
      new Date(2026, 6, 8, 8, 0),
    );
    const modes = estimates.map((e) => e.mode).sort();
    expect(modes).toEqual(["cycle", "drive", "transit", "walk"]);
    for (const e of estimates) {
      expect(e.durationSeconds).toBeGreaterThan(0);
    }
  });

  it("orders sensibly: walking a city trip takes longer than driving", async () => {
    const estimates = await compareTravelModes(
      home,
      office,
      new Date(2026, 6, 8, 3, 0), // free-flow, no congestion noise
    );
    const byMode = new Map(estimates.map((e) => [e.mode, e.durationSeconds]));
    expect(byMode.get("walk")!).toBeGreaterThan(byMode.get("cycle")!);
    expect(byMode.get("cycle")!).toBeGreaterThan(byMode.get("drive")!);
  });

  it("is deterministic for identical inputs", async () => {
    const at = new Date(2026, 6, 8, 8, 0);
    const a = await compareTravelModes(home, office, at);
    const b = await compareTravelModes(home, office, at);
    expect(a).toEqual(b);
  });
});
