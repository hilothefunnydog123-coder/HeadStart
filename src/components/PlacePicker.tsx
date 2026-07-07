import {
  type FormEvent,
  type KeyboardEvent,
  useEffect,
  useId,
  useState,
} from "react";
import type { PlaceSuggestion } from "../core/placeHistory";
import { searchPlaces, type PlaceSearchResult } from "../core/placeSearch";
import type { Place } from "../core/types";
import { makeId } from "../state/store";
import { Icon } from "./Icon";

interface Props {
  label: string;
  value: Place | null;
  onChange: (place: Place) => void;
  suggestions?: PlaceSuggestion[];
  onPlaceSelected?: (place: Place) => void;
}

export function PlacePicker({
  label,
  value,
  onChange,
  suggestions = [],
  onPlaceSelected,
}: Props) {
  const inputId = useId();
  const resultsId = useId();
  const [lat, setLat] = useState(value ? String(value.lat) : "");
  const [lng, setLng] = useState(value ? String(value.lng) : "");
  const [name, setName] = useState(value?.label ?? "");
  const [query, setQuery] = useState(value?.label ?? "");
  const [results, setResults] = useState<PlaceSearchResult[]>([]);
  const [activeResultIndex, setActiveResultIndex] = useState(-1);
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
    setActiveResultIndex(-1);
    setSearchError(null);
    setGeoError(null);
    onChange(selected);
    onPlaceSelected?.(selected);
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
      setActiveResultIndex(matches.length > 0 ? 0 : -1);
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
    const place = {
      id: value?.id ?? makeId("place"),
      label: name.trim() || "Custom location",
      lat: latNum,
      lng: lngNum,
    };
    onChange(place);
    onPlaceSelected?.(place);
  };

  const handleSearchKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Escape") {
      setResults([]);
      setActiveResultIndex(-1);
      return;
    }

    if (results.length === 0) return;

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveResultIndex((index) => (index + 1) % results.length);
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveResultIndex((index) =>
        index <= 0 ? results.length - 1 : index - 1,
      );
      return;
    }

    if (event.key === "Enter" && activeResultIndex >= 0) {
      event.preventDefault();
      const result = results[activeResultIndex];
      if (result) selectPlace(result);
    }
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
              id={inputId}
              type="search"
              value={query}
              placeholder="Search a building or address"
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={handleSearchKeyDown}
              aria-controls={results.length > 0 ? resultsId : undefined}
              aria-activedescendant={
                activeResultIndex >= 0 ? `${resultsId}-${activeResultIndex}` : undefined
              }
            />
            <button type="submit" className="search-button" disabled={isSearching}>
              {isSearching ? "Searching" : "Search"}
            </button>
          </div>
          <small className="muted">
            Search queries are sent to OpenStreetMap Nominatim.
          </small>
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

      {suggestions.length > 0 && (
        <div className="learned-suggestions" aria-label="Learned place suggestions">
          <div className="suggestion-heading">Suggestions from your history</div>
          <div className="suggestion-row">
            {suggestions.map((suggestion) => (
              <button
                key={`${suggestion.reason}-${suggestion.place.id}`}
                type="button"
                className="suggestion-chip"
                onClick={() => selectPlace(suggestion.place)}
              >
                <span>{suggestion.place.label}</span>
                <small>{suggestion.label}</small>
              </button>
            ))}
          </div>
        </div>
      )}

      {results.length > 0 && (
        <div
          id={resultsId}
          className="place-results"
          role="listbox"
          aria-label="Search results"
        >
          {results.map((result, index) => (
            <button
              key={result.id}
              id={`${resultsId}-${index}`}
              type="button"
              role="option"
              aria-selected={activeResultIndex === index}
              className={`place-result ${
                activeResultIndex === index ? "place-result-active" : ""
              }`}
              onClick={() => selectPlace(result)}
              onMouseEnter={() => setActiveResultIndex(index)}
            >
              <Icon name="pin" size={16} />
              <span>
                <strong>{result.primaryLabel}</strong>
                {result.secondaryLabel && <small>{result.secondaryLabel}</small>}
                <em>{result.providerLabel}</em>
              </span>
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
