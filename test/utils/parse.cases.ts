// WP2-01: the parseLatLng table. Every accepted syntax of the api.d.ts JSDoc (with `format` and URL `zoom`) and every
// rejection. `approx` cases (DMS, wrapped longitudes) compare coordinates to 6 decimals; the rest compare exactly
// (toEqual, so a stray -0 or a float-noise longitude fails).
import type { ParsedLatLng } from '../../src/utils.js';

export interface ParseCase {
  readonly input: unknown;
  readonly expected: ParsedLatLng | null;
  readonly approx?: boolean;
  readonly note?: string;
}

const at = (
  lat: number,
  lng: number,
  format: ParsedLatLng['format'],
  zoom?: number,
): ParsedLatLng => (zoom === undefined ? { lat, lng, format } : { lat, lng, format, zoom });
const decimal = (lat: number, lng: number): ParsedLatLng => at(lat, lng, 'decimal');
const dms = (lat: number, lng: number): ParsedLatLng => at(lat, lng, 'dms');
const object = (lat: number, lng: number): ParsedLatLng => at(lat, lng, 'object');

const EIFFEL_DMS = { lat: 48 + 51 / 60 + 30.2 / 3600, lng: 2 + 17 / 60 + 40.2 / 3600 };

class GoogleLikeLatLng {
  readonly #lat: number;
  readonly #lng: number;
  constructor(lat: number, lng: number) {
    this.#lat = lat;
    this.#lng = lng;
  }
  lat(): number {
    return this.#lat;
  }
  lng(): number {
    return this.#lng;
  }
}

const nullPrototype: object = Object.create(null);
const bare = Object.assign(nullPrototype, { lat: 1.5, lng: -2.5 });

export const ACCEPTED: readonly ParseCase[] = [
  // ---- decimal pairs ----
  { input: '48.8584,2.2945', expected: decimal(48.8584, 2.2945) },
  {
    input: '48.8584, 2.2945',
    expected: decimal(48.8584, 2.2945),
    note: 'the most common spelling',
  },
  { input: '48.8584 2.2945', expected: decimal(48.8584, 2.2945) },
  { input: '48.8584;2.2945', expected: decimal(48.8584, 2.2945) },
  { input: '48.8584; 2.2945', expected: decimal(48.8584, 2.2945) },
  { input: '48,8584; 2,2945', expected: decimal(48.8584, 2.2945), note: 'decimal commas, ";"' },
  { input: '48,8584 2,2945', expected: decimal(48.8584, 2.2945), note: 'decimal commas, space' },
  { input: '  48.8584 ,  2.2945  ', expected: decimal(48.8584, 2.2945) },
  { input: '48.8584\t2.2945', expected: decimal(48.8584, 2.2945) },
  { input: '48.8584\n2.2945', expected: decimal(48.8584, 2.2945) },
  { input: '-33.8688, 151.2093', expected: decimal(-33.8688, 151.2093) },
  { input: '+48.8584 +2.2945', expected: decimal(48.8584, 2.2945) },
  { input: '−33.8688, 151.2093', expected: decimal(-33.8688, 151.2093), note: 'U+2212 minus' },
  { input: '0,0', expected: decimal(0, 0) },
  { input: '-0,-0', expected: decimal(0, 0), note: 'never -0' },
  { input: '90,180', expected: decimal(90, -180), note: '180 wraps to -180' },
  { input: '-90,-180', expected: decimal(-90, -180) },
  { input: '48.8584,-540', expected: decimal(48.8584, -180) },
  { input: '48.8584,182.2945', expected: decimal(48.8584, -177.7055), approx: true },
  { input: '.5,.25', expected: decimal(0.5, 0.25) },
  {
    input: '(48.8584, 2.2945)',
    expected: decimal(48.8584, 2.2945),
    note: 'google.maps.LatLng#toString',
  },
  {
    input: '48.8584,2.2945 (Eiffel Tower)',
    expected: decimal(48.8584, 2.2945),
    note: 'trailing label',
  },
  // ---- hemisphere letters (letters decide the order) ----
  { input: '48.8584N 2.2945E', expected: decimal(48.8584, 2.2945) },
  { input: '48.8584 N, 2.2945 E', expected: decimal(48.8584, 2.2945) },
  { input: '2.2945E 48.8584N', expected: decimal(48.8584, 2.2945) },
  { input: 'S 33.86 E 151.21', expected: decimal(-33.86, 151.21) },
  { input: '33.86S 151.21E', expected: decimal(-33.86, 151.21) },
  { input: 'N48.8584 E2.2945', expected: decimal(48.8584, 2.2945) },
  { input: '40.7128 N, 74.0060 W', expected: decimal(40.7128, -74.006) },
  { input: 'W 74.006 N 40.7128', expected: decimal(40.7128, -74.006) },
  { input: '48.8584n 2.2945e', expected: decimal(48.8584, 2.2945) },
  { input: '48.8584° N, 2.2945° E', expected: decimal(48.8584, 2.2945) },
  { input: '48.8584°, 2.2945°', expected: decimal(48.8584, 2.2945) },
  // ---- DMS / DDM ----
  {
    input: `48°51'30.2"N 2°17'40.2"E`,
    expected: dms(EIFFEL_DMS.lat, EIFFEL_DMS.lng),
    approx: true,
  },
  {
    input: '48°51′30.2″N 2°17′40.2″E',
    expected: dms(EIFFEL_DMS.lat, EIFFEL_DMS.lng),
    approx: true,
  },
  {
    input: `48° 51' 30.2" N, 2° 17' 40.2" E`,
    expected: dms(EIFFEL_DMS.lat, EIFFEL_DMS.lng),
    approx: true,
  },
  {
    input: `48º51'30.2"N 2º17'40.2"E`,
    expected: dms(EIFFEL_DMS.lat, EIFFEL_DMS.lng),
    approx: true,
  },
  {
    input: `48°51'30.2''N 2°17'40.2''E`,
    expected: dms(EIFFEL_DMS.lat, EIFFEL_DMS.lng),
    approx: true,
  },
  {
    input: `N 48°51.503' E 2°17.670'`,
    expected: dms(48 + 51.503 / 60, 2 + 17.67 / 60),
    approx: true,
  },
  {
    input: `48°51.503'N 2°17.670'E`,
    expected: dms(48 + 51.503 / 60, 2 + 17.67 / 60),
    approx: true,
  },
  { input: `33°51'54"S 151°12'34"E`, expected: dms(-33.865, 151.209444), approx: true },
  { input: `40°42'46"N 74°0'22"W`, expected: dms(40.712778, -74.006111), approx: true },
  {
    input: `-48°51'30.2" 2°17'40.2"`,
    expected: dms(-EIFFEL_DMS.lat, EIFFEL_DMS.lng),
    approx: true,
  },
  { input: `48°51'N 2°17'E`, expected: dms(48.85, 2 + 17 / 60), approx: true },
  // ---- RFC 5870 geo: URIs ----
  { input: 'geo:48.8584,2.2945', expected: at(48.8584, 2.2945, 'geo-uri') },
  { input: 'geo:48.8584,2.2945;u=10?z=17', expected: at(48.8584, 2.2945, 'geo-uri', 17) },
  { input: 'geo:0,0?q=48.8584,2.2945(Label)', expected: at(48.8584, 2.2945, 'geo-uri') },
  { input: 'geo:0,0?q=48.8584,2.2945', expected: at(48.8584, 2.2945, 'geo-uri') },
  { input: 'geo:48.8584,2.2945,35', expected: at(48.8584, 2.2945, 'geo-uri'), note: 'altitude' },
  { input: 'GEO:48.8584,2.2945', expected: at(48.8584, 2.2945, 'geo-uri') },
  { input: 'geo:48.8584,2.2945;crs=wgs84;u=35', expected: at(48.8584, 2.2945, 'geo-uri') },
  { input: 'geo:-33.8688,151.2093?z=12', expected: at(-33.8688, 151.2093, 'geo-uri', 12) },
  // ---- Google Maps URLs ----
  {
    input: 'https://www.google.com/maps/@48.8584,2.2945,17z',
    expected: at(48.8584, 2.2945, 'google-maps-url', 17),
  },
  {
    input: 'https://www.google.com/maps/@48.8584,2.2945,15.5z/data=!3m1!1e3',
    expected: at(48.8584, 2.2945, 'google-maps-url', 15.5),
  },
  {
    input:
      'https://www.google.com/maps/place/Eiffel+Tower/@48.8583701,2.2919064,17z/data=!3m1!4b1!4m6!3m5!1s0x47e66e2964e34e2d:0x8ddca9ee380ef7e0!8m2!3d48.8583701!4d2.2944813!16zL20vMDJqODE',
    expected: at(48.8583701, 2.2944813, 'google-maps-url', 17),
    note: '!3d!4d (the pin) wins over the @ viewport',
  },
  {
    input: 'https://www.google.com/maps?q=48.8584,2.2945',
    expected: at(48.8584, 2.2945, 'google-maps-url'),
  },
  {
    input: 'https://maps.google.com/?q=48.8584,2.2945&z=15',
    expected: at(48.8584, 2.2945, 'google-maps-url', 15),
  },
  {
    input: 'https://www.google.com/maps/search/?api=1&query=48.8584,2.2945',
    expected: at(48.8584, 2.2945, 'google-maps-url'),
  },
  {
    input: 'https://www.google.com/maps/search/?api=1&query=48.8584%2C2.2945',
    expected: at(48.8584, 2.2945, 'google-maps-url'),
  },
  {
    input: 'https://maps.google.com/maps?ll=48.8584,2.2945&z=16',
    expected: at(48.8584, 2.2945, 'google-maps-url', 16),
  },
  {
    input: 'https://www.google.com/maps?q=Eiffel+Tower&ll=48.8584,2.2945',
    expected: at(48.8584, 2.2945, 'google-maps-url'),
  },
  {
    input: 'https://www.google.co.uk/maps/@51.5007,-0.1246,14z',
    expected: at(51.5007, -0.1246, 'google-maps-url', 14),
  },
  {
    input: 'www.google.com/maps/@48.8584,2.2945,17z',
    expected: at(48.8584, 2.2945, 'google-maps-url', 17),
    note: 'pasted without a scheme',
  },
  {
    input: 'https://www.google.com/maps/search/48.8584,+2.2945?entry=tts',
    expected: at(48.8584, 2.2945, 'google-maps-url'),
  },
  {
    input: `https://www.google.com/maps/place/48%C2%B051'30.2%22N+2%C2%B017'40.2%22E/@48.8583701,2.2919064,17z`,
    expected: at(EIFFEL_DMS.lat, EIFFEL_DMS.lng, 'google-maps-url', 17),
    approx: true,
  },
  {
    input: 'https://www.google.com/maps/@48.8584,2.2945,3a,75y,90t/data=!3m6!1e1',
    expected: at(48.8584, 2.2945, 'google-maps-url'),
    note: 'Street View: no zoom',
  },
  {
    input: 'https://www.google.com/maps/dir/?api=1&destination=48.8584,2.2945',
    expected: at(48.8584, 2.2945, 'google-maps-url'),
  },
  // ---- OpenStreetMap URLs ----
  {
    input: 'https://www.openstreetmap.org/#map=17/48.8584/2.2945',
    expected: at(48.8584, 2.2945, 'osm-url', 17),
  },
  {
    input: 'https://www.openstreetmap.org/?mlat=48.8584&mlon=2.2945#map=17/48.85/2.29',
    expected: at(48.8584, 2.2945, 'osm-url', 17),
    note: 'mlat/mlon (the marker) wins over #map',
  },
  {
    input: 'https://www.openstreetmap.org/?mlat=48.8584&mlon=2.2945',
    expected: at(48.8584, 2.2945, 'osm-url'),
  },
  {
    input: 'https://osm.org/#map=12/-33.8688/151.2093',
    expected: at(-33.8688, 151.2093, 'osm-url', 12),
  },
  {
    input: 'https://openstreetmap.org/?mlat=-33.8688&mlon=151.2093&zoom=12',
    expected: at(-33.8688, 151.2093, 'osm-url', 12),
  },
  // ---- Apple Maps URLs ----
  {
    input: 'https://maps.apple.com/?ll=48.8584,2.2945',
    expected: at(48.8584, 2.2945, 'apple-maps-url'),
  },
  {
    input: 'https://maps.apple.com/?q=48.8584,2.2945',
    expected: at(48.8584, 2.2945, 'apple-maps-url'),
  },
  {
    input: 'https://maps.apple.com/?ll=48.8584,2.2945&q=Eiffel%20Tower&z=16',
    expected: at(48.8584, 2.2945, 'apple-maps-url', 16),
  },
  {
    input: 'https://maps.apple.com/place?coordinate=48.8584,2.2945&name=Eiffel',
    expected: at(48.8584, 2.2945, 'apple-maps-url'),
  },
  // ---- objects (LatLngInput) ----
  { input: { lat: 48.8584, lng: 2.2945 }, expected: object(48.8584, 2.2945) },
  { input: { lat: 48.8584, lon: 2.2945 }, expected: object(48.8584, 2.2945) },
  { input: { latitude: 48.8584, longitude: 2.2945 }, expected: object(48.8584, 2.2945) },
  { input: { lat: () => 48.8584, lng: () => 2.2945 }, expected: object(48.8584, 2.2945) },
  {
    input: new GoogleLikeLatLng(48.8584, 2.2945),
    expected: object(48.8584, 2.2945),
    note: 'methods use this',
  },
  {
    input: { lat: '48.8584', lng: '2.2945' },
    expected: object(48.8584, 2.2945),
    note: 'numeric strings (JSON from PHP)',
  },
  { input: { lat: 0, lng: 0 }, expected: object(0, 0) },
  { input: { lat: -0, lng: -0 }, expected: object(0, 0) },
  { input: { lat: 10, lng: 190 }, expected: object(10, -170) },
  { input: bare, expected: object(1.5, -2.5), note: 'null-prototype object' },
];

const NULL_INPUTS: readonly [unknown, string][] = [
  ['', 'empty'],
  [',', 'templated empty value'],
  ['   ', 'blank'],
  [' , ', 'blank pair'],
  [[48.8584, 2.2945], 'array (GeoJSON order is ambiguous)'],
  [['48.8584', '2.2945'], 'array of strings'],
  ['120,45', '|lat| > 90 (no silent swapping)'],
  ['-91,0', '|lat| > 90'],
  [{ lat: 95, lng: 10 }, '|lat| > 90 (normalizeLatLng clamps instead)'],
  ['https://maps.app.goo.gl/AbCdEfGh1234', 'Google short link'],
  ['https://goo.gl/maps/AbCdEf', 'old Google short link'],
  ['https://maps.apple/p/AbCdEf', 'Apple short link'],
  ['8FW4V75V+8Q', 'plus code'],
  ['V75V+8Q Paris', 'short plus code'],
  ['///filled.count.soap', 'what3words'],
  ['filled.count.soap', 'what3words without slashes'],
  ['not a place', 'text'],
  ['Paris, France', 'address'],
  ['48.8584', 'one number'],
  ['48.8584,2.2945,100', 'three numbers'],
  ['48.8584,2.2945,', 'trailing comma'],
  ['48.8584N 2.2945N', 'two latitudes'],
  ['2.2945E 48.8584W', 'two longitudes'],
  [`48°75'N 2°17'E`, 'minutes >= 60'],
  [`48°51'75"N 2°17'40"E`, 'seconds >= 60'],
  ['4.8e1,2', 'exponent'],
  ['0x30,0x10', 'hex'],
  ['NaN,NaN', 'NaN'],
  ['Infinity,0', 'Infinity'],
  ['48.8584.1,2.2945', 'two decimal points'],
  ['48,8584, 2,2945', 'decimal commas with a comma separator are ambiguous'],
  ['48.8584 2.2945 extra', 'trailing text'],
  [null, 'null'],
  [undefined, 'undefined'],
  [42, 'number'],
  [true, 'boolean'],
  [{}, 'empty object'],
  [{ lat: Number.NaN, lng: 0 }, 'NaN latitude'],
  [{ lat: Number.POSITIVE_INFINITY, lng: 0 }, 'Infinity latitude'],
  [{ lat: 1 }, 'missing lng'],
  [{ lat: '0x10', lng: 2 }, 'hex string in an object'],
  [{ lat: '', lng: '' }, 'empty strings in an object'],
  ['https://example.com/?q=48.8584,2.2945', 'unknown host'],
  ['geo:0,0?q=Eiffel+Tower', 'geo: address search'],
  ['https://www.google.com/maps/place/Eiffel+Tower', 'place without coordinates'],
  ['https://www.google.com/maps/search/?api=1&query=Eiffel%20Tower', 'search without coordinates'],
  ['https://www.google.com/maps/@91,2,17z', '|lat| > 90 in a URL'],
];

export const REJECTED: readonly ParseCase[] = NULL_INPUTS.map(([input, note]) => ({
  input,
  expected: null,
  note,
}));

export const PARSE_CASES: readonly ParseCase[] = [...ACCEPTED, ...REJECTED];
