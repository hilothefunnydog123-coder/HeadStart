import { describe, expect, it } from "vitest";
import {
  placeFromNominatimResult,
  placeSearchUrl,
  searchPlaces,
} from "../src/core/placeSearch";

describe("place search", () => {
  it("builds a Nominatim free-form search URL", () => {
    const url = new URL(placeSearchUrl("Ferry Building San Francisco", 3));
    expect(url.origin + url.pathname).toBe("https://nominatim.openstreetmap.org/search");
    expect(url.searchParams.get("q")).toBe("Ferry Building San Francisco");
    expect(url.searchParams.get("format")).toBe("jsonv2");
    expect(url.searchParams.get("addressdetails")).toBe("1");
    expect(url.searchParams.get("limit")).toBe("3");
  });

  it("normalizes Nominatim results into places", () => {
    const place = placeFromNominatimResult({
      place_id: 123,
      osm_type: "way",
      osm_id: 456,
      name: "Ferry Building",
      lat: "37.7955",
      lon: "-122.3937",
      category: "tourism",
      type: "attraction",
      display_name: "Ferry Building, San Francisco, California, United States",
      address: {
        road: "The Embarcadero",
        city: "San Francisco",
        state: "California",
      },
    });

    expect(place).toEqual({
      id: "osm-way-456",
      label: "Ferry Building, The Embarcadero, San Francisco, California",
      lat: 37.7955,
      lng: -122.3937,
      source: "openstreetmap",
      category: "tourism",
      type: "attraction",
    });
  });

  it("uses the provided fetcher and drops malformed results", async () => {
    const fetcher = async () =>
      new Response(
        JSON.stringify([
          {
            place_id: 1,
            display_name: "Valid Place",
            lat: "37",
            lon: "-122",
          },
          {
            place_id: 2,
            display_name: "Broken Place",
            lat: "not-a-number",
            lon: "-122",
          },
        ]),
        { status: 200 },
      );

    const results = await searchPlaces("valid", fetcher as typeof fetch);

    expect(results).toHaveLength(1);
    expect(results[0]?.label).toBe("Valid Place");
  });
});
