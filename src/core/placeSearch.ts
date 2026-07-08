import type { Place } from "./types";
import { haversineMeters } from "./geo";

const NOMINATIM_SEARCH_URL = "https://nominatim.openstreetmap.org/search";
const DEFAULT_LIMIT = 5;

export interface PlaceSearchResult extends Place {
  source: "openstreetmap";
  primaryLabel: string;
  secondaryLabel?: string;
  providerLabel: string;
  category?: string;
  type?: string;
  distanceFromBiasMeters?: number;
}

interface NominatimResult {
  place_id?: number;
  osm_type?: string;
  osm_id?: number;
  display_name?: string;
  name?: string;
  lat?: string;
  lon?: string;
  category?: string;
  type?: string;
  address?: Record<string, string | undefined>;
}

export async function searchPlaces(
  query: string,
  fetcher: typeof fetch = fetch,
  options: { bias?: Place | null; limit?: number } = {},
): Promise<PlaceSearchResult[]> {
  const trimmed = query.trim();
  if (trimmed.length < 2) return [];

  const response = await fetcher(
    placeSearchUrl(trimmed, options.limit ?? DEFAULT_LIMIT, options.bias),
    {
      headers: {
        Accept: "application/json",
      },
    },
  );
  if (!response.ok) {
    throw new Error(`Place search returned ${response.status}.`);
  }

  const payload = (await response.json()) as NominatimResult[];
  if (!Array.isArray(payload)) return [];

  const places = dedupePlaces(
    payload
      .map((result) => placeFromNominatimResult(result))
      .filter((place): place is PlaceSearchResult => place !== null),
  );
  return rankPlaces(places, options.bias);
}

export function placeSearchUrl(
  query: string,
  limit = DEFAULT_LIMIT,
  bias?: Place | null,
): string {
  const params = new URLSearchParams({
    q: query,
    format: "jsonv2",
    addressdetails: "1",
    limit: String(limit),
    dedupe: "1",
    layer: "address,poi",
  });
  if (bias) {
    const span = 0.35;
    params.set(
      "viewbox",
      [
        bias.lng - span,
        bias.lat + span,
        bias.lng + span,
        bias.lat - span,
      ].join(","),
    );
    params.set("bounded", "0");
  }
  return `${NOMINATIM_SEARCH_URL}?${params}`;
}

export function placeFromNominatimResult(
  result: NominatimResult,
): PlaceSearchResult | null {
  const lat = Number(result.lat);
  const lng = Number(result.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

  const externalId =
    result.osm_type && result.osm_id
      ? `${result.osm_type}-${result.osm_id}`
      : String(result.place_id ?? `${lat},${lng}`);

  const label = placeLabel(result);
  const secondaryLabel = placeSecondaryLabel(result);

  return {
    id: `osm-${externalId}`,
    label: secondaryLabel ? `${label}, ${secondaryLabel}` : label,
    lat,
    lng,
    source: "openstreetmap",
    primaryLabel: label,
    secondaryLabel,
    providerLabel: providerLabel(result),
    category: result.category,
    type: result.type,
  };
}

export function dedupePlaces(results: PlaceSearchResult[]): PlaceSearchResult[] {
  const seen = new Set<string>();
  const deduped: PlaceSearchResult[] = [];
  for (const result of results) {
    const key = [
      normalizeText(result.primaryLabel),
      normalizeText(result.secondaryLabel ?? ""),
      result.lat.toFixed(4),
      result.lng.toFixed(4),
    ].join("|");
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(result);
  }
  return deduped;
}

export function rankPlaces(
  results: PlaceSearchResult[],
  bias?: Place | null,
): PlaceSearchResult[] {
  if (!bias) return results;
  return results
    .map((result) => ({
      ...result,
      distanceFromBiasMeters: Math.round(haversineMeters(bias, result)),
    }))
    .sort((a, b) => {
      const aScore = placeRankScore(a);
      const bScore = placeRankScore(b);
      if (aScore !== bScore) return bScore - aScore;
      return (
        (a.distanceFromBiasMeters ?? Number.MAX_SAFE_INTEGER) -
        (b.distanceFromBiasMeters ?? Number.MAX_SAFE_INTEGER)
      );
    });
}

function placeRankScore(result: PlaceSearchResult): number {
  const kind = `${result.category ?? ""}/${result.type ?? ""}`;
  if (/school|university|college|amenity|building|office|shop|tourism/.test(kind)) {
    return 2;
  }
  if (/road|highway|company/.test(kind)) return 0;
  return 1;
}

function placeLabel(result: NominatimResult): string {
  const address = result.address ?? {};
  const primary =
    result.name ||
    address.building ||
    address.amenity ||
    address.office ||
    address.shop ||
    address.tourism ||
    address.house_number ||
    result.display_name?.split(",")[0]?.trim();

  return primary || result.display_name?.split(",")[0]?.trim() || "Search result";
}

function placeSecondaryLabel(result: NominatimResult): string | undefined {
  const address = result.address ?? {};
  const parts = [
    address.road,
    address.suburb || address.neighbourhood,
    address.city || address.town || address.village,
    address.state,
  ]
    .filter(Boolean)
    .filter((part, index, all) => all.indexOf(part) === index)
    .slice(0, 3);
  return parts.length ? parts.join(", ") : undefined;
}

function providerLabel(result: NominatimResult): string {
  const raw = result.type || result.category;
  if (!raw) return "OpenStreetMap";
  return `${titleCase(raw.replace(/_/g, " "))} · OpenStreetMap`;
}

function normalizeText(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function titleCase(value: string): string {
  return value.replace(/\b\w/g, (char) => char.toUpperCase());
}
