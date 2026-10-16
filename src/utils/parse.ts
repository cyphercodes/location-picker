import type { CoordinateFormat, ParsedLatLng } from '../utils.js';

/** Longitude into [-180, 180). In-range values are returned untouched (bit-identical). */
export const wrapLng = (lng: number): number =>
  lng >= -180 && lng < 180 ? lng : ((((lng + 180) % 360) + 360) % 360) - 180;

// One coordinate: [separator] [letter] [sign] degrees [° [minutes ' [seconds "]]] [letter]. Sticky; the first
// component must start the string, the second must follow a "," or whitespace. Unicode primes and minus included.
const COMPONENT =
  /(?:^|\s*[,\s])\s*([NSEW]?)\s*([-+−]?)([\d.]+)(?:\s*[°º˚](?:\s*([\d.]+)\s*['′’](?:\s*([\d.]+)\s*(?:["″”]|''))?)?)?(\s*[NSEW])?/iy;

/** "lat,lng" text: decimal pairs, hemisphere letters, DMS/DDM. Returns [lat, lng, isDms]. */
function parseText(text: string): [number, number, boolean] | null {
  // "(48.85, 2.29)" is google.maps.LatLng#toString; "48.85,2.29(Label)" is a geo: q= label.
  let s = text.trim().replace(/^\((.*)\)$|\s*\([^()]*\)$/, '$1');
  // Decimal commas are allowed when the pair separator is ";" or whitespace.
  if (/;|^[^.]*,[^.]*,/.test(s)) s = s.replace(/,/g, '.').replace(';', ',');
  const out: number[] = []; // value, axis (0 none, 1 N/S, 2 E/W), value, axis
  let minutes = '';
  COMPONENT.lastIndex = 0;
  for (const _ of [0, 1]) {
    const [, before, sign, deg, min = '', sec = '', after = ''] = COMPONENT.exec(s) ?? [];
    if (!deg || +min >= 60 || +sec >= 60) return null;
    // "S 33.86 E 151.21": a letter before the number leaves the next letter to the next component.
    if (before) COMPONENT.lastIndex -= after.length;
    const letter = before || after.trim();
    const value = +deg + +min / 60 + +sec / 3600;
    out.push(
      /[-−]/.test(sign!) || /[sw]/i.test(letter) ? -value : value,
      letter ? (/[ns]/i.test(letter) ? 1 : 2) : 0,
    );
    minutes += min;
  }
  const [x = NaN, a, y = NaN, b] = out;
  if (s.slice(COMPONENT.lastIndex).trim() || (a && a == b)) return null;
  // Hemisphere letters decide the order; otherwise latitude comes first.
  return a == 2 || b == 1 ? [y, x, !!minutes] : [x, y, !!minutes];
}

function make(
  lat: number,
  lng: number,
  format: CoordinateFormat,
  zoom?: number,
): ParsedLatLng | null {
  if (!Number.isFinite(lat + lng)) return null;
  const result: ParsedLatLng = { lat: lat + 0, lng: wrapLng(lng) + 0, format };
  if (zoom! >= 0) result.zoom = zoom;
  return result;
}

const FORMATS: [RegExp, CoordinateFormat][] = [
  [/^geo:$/, 'geo-uri'],
  [/[.:]google\./, 'google-maps-url'],
  [/[.:](openstreetmap|osm)\.org$/, 'osm-url'],
  [/[.:]maps\.apple\.com$/, 'apple-maps-url'],
];

/**
 * geo: URIs plus Google Maps, OpenStreetMap and Apple Maps links. Candidate "lat,lng" texts are tried in priority
 * order. Unknown hosts and short links (maps.app.goo.gl, goo.gl/maps, maps.apple/p) give null.
 */
function parseUrl(s: string): ParsedLatLng | null {
  const url = new URL(/^[a-z]+:/i.test(s) ? s : `https://${s}`);
  const { href, searchParams: params } = url;
  const format = FORMATS.find(([re]) => re.test(url.protocol + url.hostname))?.[1];
  const pair = (re: RegExp): string => (re.exec(href) ?? []).slice(1).join();
  const q = params.get('q');
  const texts =
    format == 'geo-uri' && q != null
      ? [q] // Android geo:0,0?q=lat,lng(Label); geo:0,0?q=<address> is a search, not a point
      : [
          pair(/!3d([-\d.]+)!4d([-\d.]+)/), // Google pin: wins over the viewport
          pair(/[?&]mlat=([-\d.]+)&mlon=([-\d.]+)/),
          ...params.values(),
          ...url.pathname
            .split(/[/;]/)
            .map((part) =>
              decodeURIComponent(part.replace(/\+/g, ' ')).replace(/^([^,]+,[^,]+),.*/, '$1'),
            ),
          pair(/\/@([-\d.]+),([-\d.]+)/),
          pair(/#map=[\d.]+\/([-\d.]+)\/([-\d.]+)/),
        ];
  const zoom = /,([\d.]+)z|[?&#](?:z|zoom|map)=([\d.]+)/.exec(href);
  for (const text of format ? texts : []) {
    const t = parseText(text);
    if (t) return make(t[0], t[1], format!, +(zoom?.[1] ?? zoom?.[2] ?? NaN));
  }
  return null;
}

const toNumber = (v: unknown): number =>
  typeof v == 'number' ? v : typeof v == 'string' && /^\s*[-+]?[\d.]+\s*$/.test(v) ? +v : NaN;

function readObject(o: object): [number, number] {
  const read = (key: string): unknown => {
    const v: unknown = Reflect.get(o, key);
    return typeof v == 'function' ? Reflect.apply(v, o, []) : v;
  };
  return [
    toNumber(read('lat') ?? read('latitude')),
    toNumber(read('lng') ?? read('lon') ?? read('longitude')),
  ];
}

/**
 * Internal: {@link parseLatLng} without the latitude range check (latitude raw, longitude wrapped). The picker uses
 * it to clamp numeric/object input and to build the "did you swap lat and lng?" hint. Never throws.
 */
export function parsePair(input: unknown): ParsedLatLng | null {
  try {
    if (typeof input == 'string') {
      const s = input.trim();
      if (s.length > 4096) return null;
      const t = parseText(s);
      return t ? make(t[0], t[1], t[2] ? 'dms' : 'decimal') : parseUrl(s);
    }
    if (input && typeof input == 'object' && !Array.isArray(input)) {
      return make(...readObject(input), 'object');
    }
  } catch {
    // hostile getters, malformed URLs and percent-escapes all mean "not a coordinate"
  }
  return null;
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
  const p = parsePair(input);
  return p && Math.abs(p.lat) <= 90 ? p : null;
}
