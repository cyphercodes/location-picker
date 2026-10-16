// location-picker/utils: pure and DOM-free (safe in Node, Workers and SSR). Implementations live in ./utils/.
/**
 * A WGS84 coordinate in decimal degrees, LATITUDE FIRST. Every value the library emits is normalised:
 * `lat` in [-90, 90] and `lng` in [-180, 180).
 * @example const eiffel: LatLng = { lat: 48.8584, lng: 2.2945 };
 */
export interface LatLng {
  /** Degrees north, in [-90, 90]. @example 48.8584 */
  lat: number;
  /** Degrees east, in [-180, 180). @example 2.2945 */
  lng: number;
}

/**
 * Anything accepted where a position is expected (`value`, `center`, `setLocation()`, `parseLatLng()`).
 * - Strings are parsed with {@link parseLatLng} (lenient: "lat, lng", DMS, geo: URIs, map URLs).
 * - Objects: `{lat, lng}`, `{lat, lon}`, `{latitude, longitude}`, or any object with `lat()`/`lng()` methods
 *   (google.maps.LatLng, structurally).
 * - ARRAYS ARE REJECTED on purpose: `[lat, lng]` vs GeoJSON `[lng, lat]` is ambiguous. Passing one logs
 *   `INVALID_VALUE` with the fix "pass "lat,lng" or {lat, lng}".
 * @example "48.8584,2.2945"
 * @example { lat: 48.8584, lng: 2.2945 }
 * @example { latitude: 48.8584, longitude: 2.2945 }
 */
export type LatLngInput =
  | string
  | LatLng
  | { lat: number; lon: number }
  | { latitude: number; longitude: number }
  | { lat(): number; lng(): number };

/** Which input syntax {@link parseLatLng} recognised. */
export type CoordinateFormat =
  'decimal' | 'dms' | 'geo-uri' | 'google-maps-url' | 'osm-url' | 'apple-maps-url' | 'object';

/** Result of {@link parseLatLng}: a normalised coordinate plus what was recognised. */
export interface ParsedLatLng extends LatLng {
  /** Zoom carried by the source (`@lat,lng,17z`, `#map=17/…`, `geo:…?z=17`), when present. @default undefined */
  zoom?: number;
  /** The syntax that matched. @example "google-maps-url" */
  format: CoordinateFormat;
}

/** Options for {@link formatLatLng}. */
export interface FormatLatLngOptions {
  /** Output syntax. @default 'decimal' @example { format: 'dms' } */
  format?: 'decimal' | 'dms';
  /** Decimal places (decimal: of degrees; dms: of seconds). @default 6 for decimal, 1 for dms @example { precision: 5 } */
  precision?: number;
  /** Separator between lat and lng for `decimal`. @default ',' @example { separator: ', ' } */
  separator?: string;
}

export { parseLatLng } from './utils/parse.js';
export { formatLatLng } from './utils/format.js';
export { isLatLng, normalizeLatLng } from './utils/normalize.js';
