// The <location-picker> attribute table (CONTRACT §3.2, §12.9): one row per attribute, read by the element for
// observedAttributes, the generated reflecting accessors and the options it hands to resolveConfig.
import type * as C from '../internal/contracts.js';
import type { AttributeSpec } from '../internal/contracts.js';
import { WRONG_GUESSES, wrongGuess } from '../core/diagnostics.js';

export type { AttributeSpec };

/** A row; a hyphenated attribute also answers to its hyphen-less spelling (React 19 SSR serialises camelCase props). */
const row = (
  attr: string,
  prop: string,
  kind: AttributeSpec['kind'],
  effect: AttributeSpec['effect'],
  option?: AttributeSpec['option'],
  values?: readonly string[],
  reflect = true,
): AttributeSpec => ({
  attr,
  ...(attr.includes('-') && { alias: attr.replaceAll('-', '') }),
  prop,
  kind,
  ...(values && { values }),
  ...(option && { option }),
  reflect,
  effect,
});

export const ATTRIBUTES: typeof C.ATTRIBUTES = [
  row('value', 'defaultValue', 'latlng', 'default-value', 'value'),
  row('lat', 'lat', 'number', 'default-value', 'lat'),
  row('lng', 'lng', 'number', 'default-value', 'lng'),
  row('center', 'center', 'latlng', 'live', 'center'),
  // The attribute is the initial zoom; the property is the live zoom (never reflected).
  row('zoom', 'zoom', 'number', 'live', 'zoom', undefined, false),
  row('max-zoom', 'maxZoom', 'number', 'live', 'maxZoom'),
  row('precision', 'precision', 'number', 'live', 'precision'),
  row('name', 'name', 'string', 'form'),
  row('lat-name', 'latName', 'string', 'form'),
  row('lng-name', 'lngName', 'string', 'form'),
  row('address-name', 'addressName', 'string', 'form'),
  row('value-input', 'valueInput', 'string', 'live', 'valueInput'),
  row('lat-input', 'latInput', 'string', 'live', 'latInput'),
  row('lng-input', 'lngInput', 'string', 'live', 'lngInput'),
  row('address-input', 'addressInput', 'string', 'live', 'addressInput'),
  row('required', 'required', 'boolean', 'form'),
  row('disabled', 'disabled', 'boolean', 'live', 'disabled'),
  row('readonly', 'readOnly', 'boolean', 'live', 'readOnly'),
  row('provider', 'provider', 'enum', 'remount', 'provider', ['leaflet', 'google', 'maplibre']),
  row('api-key', 'apiKey', 'string', 'remount', 'apiKey'),
  row('map-id', 'mapId', 'string', 'remount', 'mapId'),
  row('tile-url', 'tileUrl', 'string', 'live', 'tileUrl'),
  row('attribution', 'attribution', 'string', 'live', 'attribution'),
  row('map-style', 'mapStyle', 'string', 'remount', 'mapStyle'),
  row('engine-url', 'engineUrl', 'string', 'remount', 'engineUrl'),
  row('engine-css-url', 'engineCssUrl', 'string', 'remount', 'engineCssUrl'),
  row('search', 'search', 'boolean', 'live', 'search'),
  row('placeholder', 'placeholder', 'string', 'live', 'placeholder'),
  row('reverse-geocode', 'reverseGeocode', 'boolean', 'live', 'reverseGeocode'),
  // The one R3 exception (D9): the readable mode property is `locateMode`, because `locate` is the method.
  row('locate', 'locateMode', 'enum', 'live', 'locate', ['off', 'button', 'auto']),
  row('marker', 'marker', 'enum', 'live', 'marker', ['pin', 'none', 'advanced']),
  row('gesture-handling', 'gestureHandling', 'enum', 'live', 'gestureHandling', [
    'auto',
    'cooperative',
    'greedy',
    'none',
  ]),
  row('webmcp', 'webmcp', 'boolean', 'live', 'webmcp'),
  // Native HTMLElement attributes the picker also reads (their properties stay the platform's own).
  row('lang', 'lang', 'string', 'live', 'lang'),
  row('nonce', 'nonce', 'string', 'connect-only', 'nonce'),
];

/** Near-miss attribute -> warning text naming the right one (§3.11). The text lives in core/diagnostics.ts. */
export const WRONG_GUESS_ATTRIBUTES: Readonly<Record<string, string>> = /* @__PURE__ */ (() =>
  Object.fromEntries(Object.keys(WRONG_GUESSES).map((attr) => [attr, wrongGuess(attr)])))();

/** Properties re-applied on upgrade (§3.2 property upgrade), including the `locate` and `form` accessors. */
export const UPGRADE_PROPERTIES: typeof C.UPGRADE_PROPERTIES = [
  ...ATTRIBUTES.map((spec) => spec.prop).filter((prop) => prop != 'lang' && prop != 'nonce'),
  'locate',
  'form',
  'engine',
  'mapOptions',
  'geocoder',
  'messages',
  'geolocation',
  // Last, so a value set before upgrade is formatted with the final precision and wins over the attributes.
  'valueAsLatLng',
  'value',
];
