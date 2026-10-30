// Photon (komoot) geocoder, the keyless pair of Leaflet and MapLibre (CONTRACT §5.1-5.3). It imports nothing from
// the core: failures reject with plain errors, which the core reports as GEOCODER_FAILED. The search box reads
// `url`, `debounce`, `minChars` and `limit` off the returned object.
import type { Bounds, GeocodeResult, Geocoder } from '../core.js';

/** Options for {@link photonGeocoder}. */
export interface PhotonOptions {
  /** Search endpoint. Production apps should self-host Photon or use a commercial endpoint (the public one is fair-use, no SLA). @default 'https://photon.komoot.io/api' */
  url?: string;
  /** @default 'https://photon.komoot.io/reverse' */
  reverseUrl?: string;
  /** Sent only when the endpoint supports it (public Photon: en, de, fr); otherwise omitted, giving local names. @default the picker's lang when supported */
  lang?: string;
  /** @default 5 */
  limit?: number;
  /** Debounce for typed queries, ms. Values below 300 are raised to 300 on the public endpoint. @default 300 */
  debounce?: number;
  /** @default 3 */
  minChars?: number;
  /** Extra query params (e.g. `{ osm_tag: 'place' }`). @default {} */
  params?: Record<string, string>;
}

export const PHOTON_URL = 'https://photon.komoot.io/api';

/** Languages the public endpoint serves; any other is omitted so Photon answers with local names. */
const LANGS = ['en', 'de', 'fr'];

type Properties = Record<string, unknown>;
interface Feature {
  geometry: { coordinates: [number, number] };
  properties: Properties;
}

const text = (properties: Properties, key: string): string => {
  const value = properties[key];
  return typeof value == 'string' || typeof value == 'number' ? String(value).trim() : '';
};

/** Builds "name, housenumber street, postcode city, country" from Photon GeoJSON `properties`. */
export function formatPhotonAddress(properties: Record<string, unknown>): string {
  const parts: string[] = [];
  for (const part of [
    text(properties, 'name'),
    `${text(properties, 'housenumber')} ${text(properties, 'street')}`.trim(),
    `${text(properties, 'postcode')} ${text(properties, 'city')}`.trim(),
    text(properties, 'country'),
  ])
    if (part && !parts.includes(part)) parts.push(part);
  return parts.join(', ');
}

function toResult(feature: Feature): GeocodeResult {
  const [lng, lat] = feature.geometry.coordinates;
  const p = feature.properties;
  const address = formatPhotonAddress(p);
  // Photon's extent is [west, north, east, south].
  const [west, north, east, south] = Array.isArray(p.extent) ? (p.extent as number[]) : [];
  const bounds: Bounds | undefined =
    south === undefined ? undefined : { south, west: west!, north: north!, east: east! };
  const id = text(p, 'osm_id');
  return {
    lat,
    lng,
    label: text(p, 'name') || address,
    address,
    ...(bounds && { bounds }),
    ...(id && { id: text(p, 'osm_type') + id }),
    raw: feature,
  };
}

/**
 * Photon (komoot) geocoder: typeahead search biased to the map centre, reverse lookup, LRU-cached, stale requests
 * aborted. `pairsWith: ['leaflet', 'maplibre']`. Nominatim is never a default; see docs for a custom geocoder recipe.
 * @example new LocationPicker('#map', { search: true, geocoder: photonGeocoder({ url: 'https://photon.example.org/api' }) })
 */
export function photonGeocoder(options: PhotonOptions = {}): Geocoder {
  const url = options.url ?? PHOTON_URL;
  const reverseUrl = options.reverseUrl ?? url.replace(/\/api\/?$/, '/reverse');
  const limit = options.limit ?? 5;
  const minChars = options.minChars ?? 3;
  const debounce = options.debounce ?? 300;
  // LRU of 100 answers, keyed by the request URL.
  const cache = new Map<string, GeocodeResult[]>();

  const get = async (
    base: string,
    params: Record<string, string | number>,
    lang: string,
    signal: AbortSignal,
  ): Promise<GeocodeResult[]> => {
    const request = new URL(base);
    const code = (options.lang ?? lang).toLowerCase().split('-')[0] ?? '';
    for (const [key, value] of Object.entries({
      ...params,
      ...(options.lang || LANGS.includes(code) ? { lang: code } : {}),
      ...options.params,
    }))
      request.searchParams.set(key, String(value));
    const href = request.href;
    let results = cache.get(href);
    if (!results) {
      const response = await fetch(href, { signal });
      if (!response.ok) throw new Error(`Photon answered ${response.status}`);
      const body = (await response.json()) as { features?: Feature[] };
      results = (body.features ?? []).map(toResult);
    }
    cache.delete(href);
    cache.set(href, results);
    if (cache.size > 100) cache.delete(cache.keys().next().value!);
    return results;
  };

  const geocoder: Geocoder &
    Required<Pick<PhotonOptions, 'url' | 'debounce' | 'minChars' | 'limit'>> = {
    pairsWith: ['leaflet', 'maplibre'],
    url,
    // The public endpoint's fair-use floor applies even when a lower debounce is asked for.
    debounce: url.startsWith('https://photon.komoot.io/') ? Math.max(300, debounce) : debounce,
    minChars,
    limit,
    search: async (query, { signal, near, limit: wanted, lang }) => {
      const q = query.trim();
      if (q.length < minChars) return [];
      return get(
        url,
        { q, limit: wanted || limit, lat: +near.lat.toFixed(5), lon: +near.lng.toFixed(5) },
        lang,
        signal,
      );
    },
    reverse: async (at, { signal, lang }) =>
      (await get(reverseUrl, { lat: at.lat, lon: at.lng, limit: 1 }, lang, signal))[0] ?? null,
  };
  return geocoder;
}
