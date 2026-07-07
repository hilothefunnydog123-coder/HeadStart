import { useState } from "react";
import type { Place } from "../core/types";
import { makeId } from "../state/store";

interface Props {
  label: string;
  value: Place | null;
  onChange: (place: Place) => void;
}

const PRESETS: Place[] = [
  { id: "p-mission", label: "Mission District, SF", lat: 37.7599, lng: -122.4148 },
  { id: "p-fidi", label: "Financial District, SF", lat: 37.7946, lng: -122.3999 },
  { id: "p-soma", label: "SoMa, SF", lat: 37.7785, lng: -122.4056 },
  { id: "p-oak", label: "Downtown Oakland", lat: 37.8044, lng: -122.2712 },
];

/**
 * Lets a user pick a place: choose a preset, use device geolocation, or enter
 * a label + coordinates by hand. Coordinates keep the app fully offline; a real
 * geocoder can be slotted in later behind the same `onChange(Place)` contract.
 */
export function PlacePicker({ label, value, onChange }: Props) {
  const [lat, setLat] = useState(value ? String(value.lat) : "");
  const [lng, setLng] = useState(value ? String(value.lng) : "");
  const [name, setName] = useState(value?.label ?? "");
  const [geoError, setGeoError] = useState<string | null>(null);

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
        setLat(String(p.lat));
        setLng(String(p.lng));
        onChange(p);
      },
      (err) => setGeoError(err.message || "Couldn't get your location."),
      { enableHighAccuracy: false, timeout: 8000 },
    );
  };

  return (
    <fieldset className="place-picker">
      <legend>{label}</legend>

      <div className="preset-row">
        {PRESETS.map((p) => (
          <button
            key={p.id}
            type="button"
            className={`chip ${value && value.lat === p.lat && value.lng === p.lng ? "chip-active" : ""}`}
            onClick={() => {
              setName(p.label);
              setLat(String(p.lat));
              setLng(String(p.lng));
              onChange({ ...p, id: value?.id ?? p.id });
            }}
          >
            {p.label}
          </button>
        ))}
      </div>

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

      <button type="button" className="link-button" onClick={useMyLocation}>
        📍 Use my current location
      </button>
      {geoError && <p className="field-error">{geoError}</p>}
    </fieldset>
  );
}
