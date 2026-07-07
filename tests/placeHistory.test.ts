import { describe, expect, it } from "vitest";
import {
  forgetPlaceHistoryEntry,
  rememberPlaceUsage,
  suggestPlaces,
} from "../src/core/placeHistory";
import type { Place, PlaceHistoryEntry, PlaceUsageContext } from "../src/core/types";

const place: Place = {
  id: "library",
  label: "Main Library",
  lat: 37.78,
  lng: -122.41,
};

const mondayMorning: PlaceUsageContext = {
  kind: "destination",
  weekday: 1,
  hour: 9,
  travelMode: "drive",
};

describe("place history", () => {
  it("does not suggest places until the user has selected something", () => {
    expect(suggestPlaces([], mondayMorning)).toEqual([]);
  });

  it("records recent places from user selections", () => {
    const history = rememberPlaceUsage([], place, mondayMorning);
    const suggestions = suggestPlaces(history, mondayMorning);

    expect(suggestions).toHaveLength(1);
    expect(suggestions[0]?.reason).toBe("recent");
    expect(suggestions[0]?.place.label).toBe("Main Library");
  });

  it("keeps home and destination suggestions separate", () => {
    const history = rememberPlaceUsage([], place, mondayMorning);

    expect(
      suggestPlaces(history, {
        kind: "home",
        weekday: 1,
        hour: 9,
      }),
    ).toEqual([]);
  });

  it("promotes repeated same-time selections into usual suggestions", () => {
    let history: PlaceHistoryEntry[] = [];
    history = rememberPlaceUsage(history, place, mondayMorning, new Date("2026-07-01T16:00:00Z"));
    history = rememberPlaceUsage(history, place, mondayMorning, new Date("2026-07-08T16:00:00Z"));
    history = rememberPlaceUsage(history, place, mondayMorning, new Date("2026-07-15T16:00:00Z"));

    const suggestions = suggestPlaces(history, mondayMorning);

    expect(suggestions[0]?.reason).toBe("usual");
    expect(suggestions[0]?.label).toBe("Usually around now");
  });

  it("forgets one suggested place without clearing the rest of history", () => {
    const otherPlace: Place = {
      id: "gym",
      label: "Gym",
      lat: 37.79,
      lng: -122.42,
    };
    let history: PlaceHistoryEntry[] = [];
    history = rememberPlaceUsage(history, place, mondayMorning);
    history = rememberPlaceUsage(history, otherPlace, mondayMorning);

    const librarySuggestion = suggestPlaces(history, mondayMorning).find(
      (suggestion) => suggestion.place.label === "Main Library",
    );
    expect(librarySuggestion).toBeDefined();

    const nextHistory = forgetPlaceHistoryEntry(
      history,
      librarySuggestion?.historyId ?? "",
    );

    expect(suggestPlaces(nextHistory, mondayMorning).map((item) => item.place.label))
      .toEqual(["Gym"]);
  });
});
