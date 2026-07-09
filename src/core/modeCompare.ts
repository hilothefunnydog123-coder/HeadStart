import { simulatedProvider } from "./traffic/simulated";
import { TRAVEL_MODE_OPTIONS } from "./travelModes";
import type { Place, TravelMode } from "./types";

export interface ModeEstimate {
  mode: TravelMode;
  durationSeconds: number;
}

/**
 * Estimate the same trip for every travel mode so the user can make an
 * informed choice ("walk 58m / bike 21m / drive 12m / transit 24m").
 *
 * Always uses the offline simulation regardless of the active provider: it's
 * free, instant and deterministic, and a comparison only needs to be honest
 * about relative magnitudes — the chosen mode still gets the real (possibly
 * live) estimate through the normal planning path.
 */
export async function compareTravelModes(
  origin: Place,
  destination: Place,
  departAt: Date,
): Promise<ModeEstimate[]> {
  return Promise.all(
    TRAVEL_MODE_OPTIONS.map(async ({ value }) => {
      const estimate = await simulatedProvider.estimate({
        origin,
        destination,
        mode: value,
        departAt,
      });
      return { mode: value, durationSeconds: estimate.durationSeconds };
    }),
  );
}
