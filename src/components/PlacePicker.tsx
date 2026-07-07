import { type FormEvent, useEffect, useState } from "react";
import { searchPlaces, type PlaceSearchResult } from "../core/placeSearch";
import type { Place } from "../core/types";
import { makeId } from "../state/store";
import { Icon } from "./Icon";

interface Props {
  label: string;
  value: Place | null;
  onChange: (place: Place) => void;
}

export function PlacePicker({ label, value, onChange }: Props) {
  const [lat, setLat] = useState(value ? String(value.lat) : "");
  const [lng, setLng] = useState(value ? String(value.lng) : "");
  const [name, setName] = useState(value?.label ?? "");
  const [query, setQuery] = useState(value?.label ?? "");
  const [results, setResults] = useState<PlaceSearchResult[]>([]);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [geoError, setGeoError] = useState<string | null>(null);

  useEffect(() => {
    setLat(value ? String(value.lat) : "");
    setLng(value ? String(value.lng) : "");
    setName(value?.label ?? "");
    setQuery(value?.label ?? "");
  }, [value?.id, value?.label, value?.lat, value?.lng]);

  const selectPlace = (place: Place) => {
    const selected = { ...place, id: value?.id ?? place.id };
    setName(selected.label);
    setQuery(selected.label);
    setLat(String(Number(selected.lat.toFixed(6))));
    setLng(String(Number(selected.lng.toFixed(6))));
    setResults([]);
    setSearchError(null);
    setGeoError(null);
    onChange(selected);
  };

  const runSearch = async (event: FormEvent) => {
    event.preventDefault();
    const trimmed = query.trim();
    setGeoError(null);
    setSearchError(null);

    if (trimmed.length < 2) {
      setSearchError("Enter a building, address, or place name.");
      return;
    }

    setIsSearching(true);
    try {
      const matches = await searchPlaces(trimmed);
      setResults(matches);
      if (matches.length === 0) {
        setSearchError("No matching places found.");
      }
    } catch (err) {
      setSearchError(err instanceof Error ? err.message : "Place search failed.");
    } finally {
      setIsSearching(false);
    }
  };

  const commitManual = () => {
    const latNum = Number(lat);
    const lngNum = Number(lng);
    if (!Number.isFinite(latNum) || !Number.isFinite(lngNum)) return;
    onChange({
      id: value?.id ?? makeId("place"),
      label: name.trim() || "Custom location",
      lat: latNum,
      lng: lngNum,
    });
  };

  const useMyLocation = () => {
    setGeoError(null);
    if (!("geolocation" in navigator)) {
      setGeoError("Geolocation isn't available in this browser.");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const p: Place = {
          id: value?.id ?? makeId("place"),
          label: name.trim() || "My location",
          lat: Number(pos.coords.latitude.toFixed(5)),
          lng: Number(pos.coords.longitude.toFixed(5)),
        };
        selectPlace(p);
      },
      (err) => setGeoError(err.message || "Couldn't get your location."),
      { enableHighAccuracy: false, timeout: 8000 },
    );
  };

  return (
    <fieldset className="place-picker">
      <legend>{label}</legend>

      <form className="place-search" onSubmit={(event) => void runSearch(event)}>
        <label className="field place-search-field">
          <span>Place search</span>
          <div className="search-control">
            <Icon name="search" size={17} />
            <input
              type="search"
              value={query}
              placeholder="Search a building or address"
              onChange={(event) => setQuery(event.target.value)}
            />
            <button type="submit" className="search-button" disabled={isSearching}>
              {isSearching ? "Searching" : "Search"}
            </button>
          </div>
        </label>
      </form>

      {value && (
        <div className="selected-place">
          <Icon name="pin" size={17} />
          <div>
            <strong>{value.label}</strong>
            <span>
              {value.lat.toFixed(5)}, {value.lng.toFixed(5)}
            </span>
          </div>
        </div>
      )}

      {results.length > 0 && (
        <div className="place-results" role="listbox" aria-label="Search results">
          {results.map((result) => (
            <button
              key={result.id}
              type="button"
              className="place-result"
              onClick={() => selectPlace(result)}
            >
              <Icon name="pin" size={16} />
              <span>{result.label}</span>
            </button>
          ))}
        </div>
      )}

      {searchError && <p className="field-error">{searchError}</p>}

      <button type="button" className="link-button" onClick={useMyLocation}>
        <Icon name="pin" size={15} />
        Use my current location
      </button>
      {geoError && <p className="field-error">{geoError}</p>}

      <details className="coordinate-details">
        <summary>Advanced coordinates</summary>
        <div className="field-grid">
          <label className="field">
            <span>Name</span>
            <input
              type="text"
              value={name}
              placeholder="Home"
              onChange={(e) => setName(e.target.value)}
              onBlur={commitManual}
            />
          </label>
          <label className="field">
            <span>Latitude</span>
            <input
              type="number"
              step="0.0001"
              value={lat}
              placeholder="37.7599"
              onChange={(e) => setLat(e.target.value)}
              onBlur={commitManual}
            />
          </label>
          <label className="field">
            <span>Longitude</span>
            <input
              type="number"
              step="0.0001"
              value={lng}
              placeholder="-122.4148"
              onChange={(e) => setLng(e.target.value)}
              onBlur={commitManual}
            />
          </label>
        </div>
      </details>

      <p className="place-attribution">
        Place data © OpenStreetMap contributors
      </p>
    </fieldset>
  );
}
