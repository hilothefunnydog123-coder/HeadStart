import type { Place } from "./types";

const NOMINATIM_SEARCH_URL = "https://nominatim.openstreetmap.org/search";
const DEFAULT_LIMIT = 5;

export interface PlaceSearchResult extends Place {
  source: "openstreetmap";
  category?: string;
  type?: string;
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
): Promise<PlaceSearchResult[]> {
  const trimmed = query.trim();
  if (trimmed.length < 2) return [];

  const response = await fetcher(placeSearchUrl(trimmed), {
    headers: {
      Accept: "application/json",
    },
  });
  if (!response.ok) {
    throw new Error(`Place search returned ${response.status}.`);
  }

  const payload = (await response.json()) as NominatimResult[];
  if (!Array.isArray(payload)) return [];

  return payload
    .map((result) => placeFromNominatimResult(result))
    .filter((place): place is PlaceSearchResult => place !== null);
}

export function placeSearchUrl(query: string, limit = DEFAULT_LIMIT): string {
  const params = new URLSearchParams({
    q: query,
    format: "jsonv2",
    addressdetails: "1",
    limit: String(limit),
    dedupe: "1",
    layer: "address,poi",
  });
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

  return {
    id: `osm-${externalId}`,
    label: placeLabel(result),
    lat,
    lng,
    source: "openstreetmap",
    category: result.category,
    type: result.type,
  };
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

  const locality = [
    address.road,
    address.suburb || address.neighbourhood,
    address.city || address.town || address.village,
    address.state,
  ]
    .filter(Boolean)
    .filter((part, index, parts) => parts.indexOf(part) === index)
    .slice(0, 3)
    .join(", ");

  if (primary && locality && !locality.startsWith(primary)) {
    return `${primary}, ${locality}`;
  }

  return primary || result.display_name || "Search result";
}
