// The console diagnostics channel (CONTRACT §3.5, §3.11): warnings and hints that are never `error` events. All of
// their text lives here, so this module can become the lazy "warnings" chunk of the §9 overflow plan. It depends on
// the global store only.
import type { ResolveResult } from '../internal/contracts.js';
import { getStore } from './store.js';

export type Diagnostic = ResolveResult['diagnostics'][number];

const once = (method: 'warn' | 'info', key: string, message: string): void => {
  const { warned } = getStore();
  if (warned.has(key)) return;
  warned.add(key);
  console[method](`[location-picker] ${message}`);
};

/** console.warn once per key per page (shared by every library copy through the store). Adds the prefix. */
export function warnOnce(key: string, message: string): void {
  once('warn', key, message);
}

/** console.info once per key per page. Adds the prefix. */
export function infoOnce(key: string, message: string): void {
  once('info', key, message);
}

/** Logs a resolveConfig result's diagnostics, each once per page. */
export function emitDiagnostics(list: readonly Diagnostic[]): void {
  for (const d of list) once(d.level, d.key, d.message);
}

const loose = (s: string): string => s.toLowerCase().replace(/[-_]/g, '');

/** Unknown option key; suggests a case/hyphen-insensitive match ("apikey", "api_key" -> "apiKey"). */
export function unknownOption(key: string, valid: readonly string[]): string {
  const match = valid.find((k) => loose(k) == loose(key));
  return `Unknown option "${key}"${match ? ` (did you mean "${match}"?)` : ''}. Valid options: ${valid.join(', ')}.`;
}

/** Deprecated v1/v2 option keys (and the v1/v2 third constructor argument) -> the v3 spelling. */
export const DEPRECATED: Readonly<Record<string, string>> = {
  lat: 'The lat option is deprecated; use value: "lat,lng" or value: {lat, lng}.',
  lng: 'The lng option is deprecated; use value: "lat,lng" or value: {lat, lng}.',
  setCurrentPosition:
    'setCurrentPosition is deprecated; use locate: "auto" (asks for permission on load) or locate: "button".',
  useAdvancedMarker: 'useAdvancedMarker is deprecated; use marker: "advanced" (needs mapId).',
  onLocationChange: 'onLocationChange is deprecated; use onChange.',
  mapOptionsArgument:
    'The 3rd constructor argument is deprecated; use new LocationPicker(target, { provider: "google", mapOptions: {…} }).',
};

export const providerAlias = (name: string, to: string): string =>
  `provider "${name}" is an alias; use provider: "${to}".`;

export const badChoice = (key: string, value: string, allowed: readonly string[]): string =>
  `${key}: "${value}" is not one of ${allowed.join(', ')}; using "${allowed[0]}".`;

export const GOOGLE_HINT =
  'google.maps is loaded but no provider was chosen; using OpenStreetMap. Set provider="google" (or api-key) to use Google Maps.';

export const TILE_ATTRIBUTION =
  'A custom tileUrl has no attribution; set attribution to credit the tile provider (it stays visible on the map).';

/** D19: a numeric/object latitude outside [-90, 90] was clamped. */
export function clampedLatitude(lat: number, lng: number): string {
  const to = lat > 0 ? 90 : -90;
  const swap = Math.abs(lng) <= 90 ? `; did you swap lat and lng? try (${lng}, ${lat})` : '';
  return `latitude ${lat} was clamped to ${to}${swap}`;
}

/** D10: a lat/lng attribute or property change was ignored because the control is dirty. */
export const LAT_LNG_IGNORED =
  'lat/lng only set the initial value; bind value="lat,lng" or call setLocation()';

export const UNSET_MARKER_POSITION =
  'getMarkerPosition() returns the view centre, not a chosen location, while the picker is unset; read valueAsLatLng (null while unset) or value.';

export const ZERO_HEIGHT =
  'The target has 0 height, so it got min-block-size: 320px. Give it a height in your CSS.';

export const nameCollision = (attr: string, name: string): string =>
  `${attr}="${name}" matches a bound input's name, so the value would be submitted twice; use either ${attr} or the *-input binding.`;

export const REQUIRED_ON_HIDDEN =
  'A hidden bound input is required, which blocks form submission; put required on <location-picker> instead.';

export const inputNotFound = (attr: string, ref: string): string =>
  `${attr}: no input matches "${ref}" (an id is tried first, then a selector).`;

export const inert = (api: string): string =>
  `${api} is not supported here, so <location-picker> runs inert: no form participation or resize handling.`;

export const duplicateDefinition = (tag: string, defined: string, version: string): string =>
  `<${tag}> is already defined by location-picker ${defined}; this copy (${version}) reuses it.`;

/** §3.11 near-miss attributes -> the right spelling. `autolocate` and `locate-button` are also honoured (WP4). */
export const WRONG_GUESSES: Readonly<Record<string, string>> = {
  latitude: 'value="lat,lng" (or lat + lng)',
  longitude: 'value="lat,lng" (or lat + lng)',
  lon: 'lng',
  location: 'value="lat,lng"',
  coordinates: 'value="lat,lng"',
  key: 'api-key',
  api_key: 'api-key',
  tiles: 'tile-url',
  pin: 'marker',
  controls: 'locate="button"',
  autolocate: 'locate="auto"',
  'locate-button': 'locate="button"',
};

/** Warning text for a near-miss attribute; WP4 builds WRONG_GUESS_ATTRIBUTES (§12.9) from it. */
export const wrongGuess = (attr: string): string =>
  `<location-picker ${attr}> is not an attribute; use ${Object.hasOwn(WRONG_GUESSES, attr) ? WRONG_GUESSES[attr] : 'the documented attributes'}.`;
