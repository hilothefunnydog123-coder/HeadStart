import type { Place } from "./types";

export interface LocationSample {
  place: Place;
  accuracyMeters: number;
}

export function requestLocationSample(): Promise<LocationSample> {
  if (!("geolocation" in navigator)) {
    return Promise.reject(new Error("Location is not available in this browser."));
  }

  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          place: {
            id: "current-location",
            label: "Current location",
            lat: Number(position.coords.latitude.toFixed(6)),
            lng: Number(position.coords.longitude.toFixed(6)),
          },
          accuracyMeters: position.coords.accuracy,
        });
      },
      (error) => {
        reject(new Error(error.message || "Location permission was not granted."));
      },
      {
        enableHighAccuracy: false,
        maximumAge: 30_000,
        timeout: 12_000,
      },
    );
  });
}
