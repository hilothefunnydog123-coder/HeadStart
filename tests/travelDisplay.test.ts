import { describe, expect, it } from "vitest";
import {
  confidenceDisplayLabel,
  trafficDisplay,
} from "../src/core/travelDisplay";

describe("travel display helpers", () => {
  it("does not label very short trips as heavy traffic", () => {
    const display = trafficDisplay({
      durationSeconds: 6 * 60,
      freeFlowSeconds: 3 * 60,
      distanceMeters: 0,
      congestion: 2,
      source: "test",
    });

    expect(display.label).toBe("Very close");
    expect(display.detail).toContain("0 m");
    expect(display.detail).not.toContain("delay");
  });

  it("uses route language for bike and walking modes", () => {
    const display = trafficDisplay(
      {
        durationSeconds: 18 * 60,
        freeFlowSeconds: 16 * 60,
        distanceMeters: 4_200,
        congestion: 1.2,
        source: "test",
      },
      "cycle",
    );

    expect(display.label).toBe("Bike route");
    expect(display.detail).toContain("18m estimate");
    expect(display.label).not.toContain("traffic");
  });

  it("uses qualified language instead of an absolute 100%", () => {
    expect(confidenceDisplayLabel(1)).toBe("Very likely");
    expect(confidenceDisplayLabel(0.92)).toBe("92%");
  });
});
