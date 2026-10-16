// placeholder: owned by WP2 (types copied from api.d.ts so other WPs can build against them; functions throw)
function todo(name: string, ..._args: unknown[]): never {
  throw new Error(`location-picker: ${name} is not implemented yet (placeholder: owned by WP2)`);
}

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

/**
 * Lenient, offline coordinate parser. NEVER throws and NEVER calls the network. Returns `null` when the input is not
 * a coordinate, when latitude is outside [-90, 90] (no silent swapping), for arrays, and for short links.
 * The picker uses it for STRING input only (the `value`/`center` attributes, string `value`/`center`/`setLocation()`
 * arguments). Numeric and object input to the picker goes through {@link normalizeLatLng} instead, which clamps.
 *
 * Accepts:
 * - Decimal pairs with `,` `;` or whitespace between: `"48.8584,2.2945"`, `"48.8584, 2.2945"`, `"48.8584 2.2945"`;
 *   decimal commas when the pair separator is `;` or whitespace: `"48,8584; 2,2945"`.
 * - Hemisphere letters (letters decide the order): `"48.8584N 2.2945E"`, `"2.2945E 48.8584N"`, `"S 33.86 E 151.21"`.
 * - DMS / DDM: `48°51'30.2"N 2°17'40.2"E`, `N 48°51.503' E 2°17.670'`.
 * - RFC 5870 geo URIs: `"geo:48.8584,2.2945"`, `"geo:48.8584,2.2945;u=10?z=17"`, `"geo:0,0?q=48.8584,2.2945(Label)"`.
 * - Google Maps URLs: `!3dLAT!4dLNG` (wins over the viewport), `/@lat,lng,17z`, `?q=`, `?query=`, `?ll=`, `?api=1&query=`.
 * - OpenStreetMap URLs: `#map=17/lat/lng`, `?mlat=&mlon=`. Apple Maps URLs: `?ll=`, `?q=lat,lng`.
 * - Objects listed in {@link LatLngInput}.
 *
 * Rejects (returns `null`): empty strings, `","`, arrays, `|lat| > 90`, `maps.app.goo.gl` / `goo.gl/maps` short
 * links, plus codes, what3words. Longitude is wrapped into [-180, 180).
 * @example parseLatLng('48.8584, 2.2945') // { lat: 48.8584, lng: 2.2945, format: 'decimal' }
 * @example parseLatLng('https://www.google.com/maps/@48.8584,2.2945,17z') // { lat: 48.8584, lng: 2.2945, zoom: 17, format: 'google-maps-url' }
 * @example parseLatLng(`48°51'30.2"N 2°17'40.2"E`) // { lat: 48.858389, lng: 2.294500, format: 'dms' } (approx.)
 * @example parseLatLng('not a place') // null
 */
export function parseLatLng(input: unknown): ParsedLatLng | null {
  return todo('parseLatLng', input);
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

/**
 * Locale-independent formatter. The default output is the canonical form value: latitude first, dot decimal,
 * `toFixed(precision)` with trailing zeros trimmed, no exponent, never `-0`. Rounds BEFORE normalising, so
 * `179.9999996` formats as `-180`. Throws `TypeError` for input that {@link parseLatLng} would reject.
 * @example formatLatLng({ lat: 48.85837009, lng: 2.29448128 }) // "48.85837,2.294481"
 * @example formatLatLng({ lat: 48.8584, lng: 2.2945 }, { format: 'dms' }) // `48°51'30.2"N 2°17'40.2"E`
 */
export function formatLatLng(value: LatLngInput, options?: FormatLatLngOptions): string {
  return todo('formatLatLng', value, options);
}

/**
 * Wraps longitude into [-180, 180) and clamps latitude into [-90, 90] (fixes v2 issue #12; LOCKED 7). Accepts any
 * {@link LatLngInput}. Throws `TypeError` on non-finite or unparseable input. The picker applies it to every numeric
 * and object input (`setLocation(lat, lng)`, `{lat, lng}` values, the `lat`/`lng` options, attributes and
 * properties); when it clamps a latitude, the picker logs one console warning with a swap hint.
 * @example normalizeLatLng({ lat: 10, lng: 52283.36 }) // { lat: 10, lng: -36.64 } (approx.)
 * @example normalizeLatLng({ lat: 91, lng: 190 }) // { lat: 90, lng: -170 }
 */
export function normalizeLatLng(value: LatLngInput): LatLng {
  return todo('normalizeLatLng', value);
}

/**
 * Type guard: a plain object with finite numeric `lat` in [-90, 90] and `lng` in [-180, 180].
 * @example if (isLatLng(x)) map.setView([x.lat, x.lng]);
 */
export function isLatLng(value: unknown): value is LatLng {
  return todo('isLatLng', value);
}
