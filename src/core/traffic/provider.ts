import type { Place, TravelEstimate, TravelMode } from "../types";

export interface EstimateRequest {
  origin: Place;
  destination: Place;
  mode: TravelMode;
  /** When the trip would start. Traffic depends heavily on time of day. */
  departAt: Date;
  /** Optional API key for providers that need one. */
  apiKey?: string;
}

/**
 * A source of travel-time estimates. The app is provider-agnostic: the
 * simulated provider ships by default and works fully offline, while real
 * providers (Google, Mapbox, ...) can be dropped in behind the same contract.
 */
export interface TrafficProvider {
  readonly id: string;
  readonly label: string;
  /** True when the provider can run right now (e.g. has its API key). */
  isReady(apiKey?: string): boolean;
  estimate(request: EstimateRequest): Promise<TravelEstimate>;
}

const registry = new Map<string, TrafficProvider>();

export function registerProvider(provider: TrafficProvider): void {
  registry.set(provider.id, provider);
}

export function getProvider(id: string): TrafficProvider | undefined {
  return registry.get(id);
}

export function listProviders(): TrafficProvider[] {
  return [...registry.values()];
}
