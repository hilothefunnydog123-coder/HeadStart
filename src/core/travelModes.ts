import type { TravelMode } from "./types";

export interface TravelModeOption {
  value: TravelMode;
  label: string;
  routeLabel: string;
}

export const TRAVEL_MODE_OPTIONS: TravelModeOption[] = [
  { value: "drive", label: "Drive", routeLabel: "Driving route" },
  { value: "walk", label: "Walk", routeLabel: "Walking route" },
  { value: "cycle", label: "Bike", routeLabel: "Bike route" },
  { value: "transit", label: "Transit", routeLabel: "Transit route" },
];

const TRAVEL_MODE_BY_VALUE = new Map(
  TRAVEL_MODE_OPTIONS.map((option) => [option.value, option]),
);

export function travelModeLabel(mode: TravelMode): string {
  return TRAVEL_MODE_BY_VALUE.get(mode)?.label ?? "Drive";
}

export function travelModeRouteLabel(mode: TravelMode): string {
  return TRAVEL_MODE_BY_VALUE.get(mode)?.routeLabel ?? "Driving route";
}
