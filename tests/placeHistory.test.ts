import { describe, expect, it } from "vitest";
import {
  dismissPlaceSuggestion,
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

  it("temporarily hides a dismissed suggestion without deleting history", () => {
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

    const nextHistory = dismissPlaceSuggestion(
      history,
      librarySuggestion?.historyId ?? "",
      mondayMorning,
      new Date("2026-07-06T16:00:00Z"),
    );

    expect(
      suggestPlaces(
        nextHistory,
        mondayMorning,
        4,
        new Date("2026-07-06T17:00:00Z"),
      ).map((item) => item.place.label),
    ).toEqual(["Gym"]);
    expect(nextHistory).toHaveLength(2);

    expect(
      suggestPlaces(
        nextHistory,
        { ...mondayMorning, weekday: 2 },
        4,
        new Date("2026-07-08T16:00:00Z"),
      ).map((item) => item.place.label),
    ).toContain("Main Library");
  });

  it("stops suggesting a place after dismissing it around the same time on three days", () => {
    let history: PlaceHistoryEntry[] = [];
    history = rememberPlaceUsage(history, place, mondayMorning);
    const suggestion = suggestPlaces(history, mondayMorning)[0];
    expect(suggestion).toBeDefined();

    history = dismissPlaceSuggestion(
      history,
      suggestion?.historyId ?? "",
      mondayMorning,
      new Date("2026-07-06T16:00:00Z"),
    );
    history = dismissPlaceSuggestion(
      history,
      suggestion?.historyId ?? "",
      { ...mondayMorning, weekday: 2, hour: 10 },
      new Date("2026-07-07T17:00:00Z"),
    );
    history = dismissPlaceSuggestion(
      history,
      suggestion?.historyId ?? "",
      { ...mondayMorning, weekday: 3, hour: 8 },
      new Date("2026-07-08T15:00:00Z"),
    );

    expect(
      suggestPlaces(
        history,
        { ...mondayMorning, weekday: 4, hour: 9 },
        4,
        new Date("2026-07-10T16:00:00Z"),
      ),
    ).toEqual([]);

    expect(
      suggestPlaces(
        history,
        { ...mondayMorning, weekday: 4, hour: 15 },
        4,
        new Date("2026-07-10T22:00:00Z"),
      ).map((item) => item.place.label),
    ).toEqual(["Main Library"]);
  });

  it("does not permanently suppress repeated dismissals on the same day", () => {
    let history: PlaceHistoryEntry[] = [];
    history = rememberPlaceUsage(history, place, mondayMorning);
    const suggestion = suggestPlaces(history, mondayMorning)[0];
    expect(suggestion).toBeDefined();

    history = dismissPlaceSuggestion(
      history,
      suggestion?.historyId ?? "",
      mondayMorning,
      new Date("2026-07-06T16:00:00Z"),
    );
    history = dismissPlaceSuggestion(
      history,
      suggestion?.historyId ?? "",
      { ...mondayMorning, hour: 10 },
      new Date("2026-07-06T17:00:00Z"),
    );
    history = dismissPlaceSuggestion(
      history,
      suggestion?.historyId ?? "",
      { ...mondayMorning, hour: 8 },
      new Date("2026-07-06T18:00:00Z"),
    );

    expect(
      suggestPlaces(
        history,
        { ...mondayMorning, weekday: 2, hour: 9 },
        4,
        new Date("2026-07-08T16:00:00Z"),
      ).map((item) => item.place.label),
    ).toEqual(["Main Library"]);
  });
});
