// THE options resolver for both surfaces (CONTRACT §4.1, §7, §12.1, D4, D5, D19). Defaults live only in DEFAULTS.
// resolveConfig never logs and never throws: it returns `errors` (dispatched by the caller as `error` events) and
// `diagnostics` (logged once each through emitDiagnostics).
import type {
  InputRef,
  LocationPickerOptions,
  MarkerMode,
  Messages,
  ProviderAdapter,
  ProviderName,
} from '../core.js';
import type * as C from '../internal/contracts.js';
import type { ResolveContext, ResolveResult, ResolvedConfig } from '../internal/contracts.js';
import type { LatLng } from '../utils.js';
import { parsePair, toNumber } from '../utils/parse.js';
import {
  DEPRECATED,
  GOOGLE_HINT,
  TILE_ATTRIBUTION,
  badChoice,
  clampedLatitude,
  providerAlias,
  unknownOption,
  type Diagnostic,
} from './diagnostics.js';
import { createError, type LocationPickerError } from './errors.js';
import { MESSAGES } from './messages.js';

// Duplicated from the WP3 entries on purpose: the core must not import adapters (lazy chunks, size budget).
const OSM_TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const OSM_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';
const OPENFREEMAP_STYLE_URL = 'https://tiles.openfreemap.org/styles/liberty';

export const DEFAULTS: typeof C.DEFAULTS = {
  provider: 'leaflet',
  providerSource: 'default',
  value: null,
  center: { lat: 20, lng: 0 },
  centerGiven: false,
  zoom: 2,
  maxZoom: undefined,
  precision: 6,
  disabled: false,
  readOnly: false,
  marker: 'pin',
  gestureHandling: 'auto',
  locate: 'off',
  geolocation: { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 },
  search: false,
  placeholder: MESSAGES.searchPlaceholder,
  reverseGeocode: false,
  geocoder: undefined,
  inputs: {},
  messages: MESSAGES,
  lang: 'en',
  nonce: undefined,
  injectStyles: true,
  webmcp: false,
  apiKey: undefined,
  mapId: undefined,
  tileUrl: OSM_TILE_URL,
  tileUrlGiven: false,
  attribution: OSM_ATTRIBUTION,
  mapStyle: OPENFREEMAP_STYLE_URL,
  engine: undefined,
  engineUrl: undefined,
  engineCssUrl: undefined,
  mapOptions: {},
};

/** Every public option key (api.d.ts `LocationPickerOptions`; a test keeps the list exhaustive). */
export const OPTION_KEYS: readonly (keyof LocationPickerOptions)[] = [
  'provider', 'value', 'center', 'zoom', 'maxZoom', 'precision', 'disabled', 'readOnly', 'marker',
  'gestureHandling', 'locate', 'geolocation', 'search', 'placeholder', 'reverseGeocode', 'geocoder',
  'latInput', 'lngInput', 'valueInput', 'addressInput', 'messages', 'lang', 'injectStyles', 'nonce',
  'webmcp', 'signal', 'apiKey', 'mapId', 'tileUrl', 'attribution', 'mapStyle', 'engine', 'engineUrl',
  'engineCssUrl', 'mapOptions', 'onInput', 'onChange', 'onAddressChange', 'onReady', 'onError',
  'onLocationChange', 'lat', 'lng', 'setCurrentPosition', 'useAdvancedMarker',
]; // prettier-ignore

/** Keys with no element attribute or property (R3): callbacks, injectStyles, signal and the class-only v1/v2 keys. */
export const CLASS_ONLY_KEYS: readonly (keyof LocationPickerOptions)[] = [
  'injectStyles', 'signal', 'onInput', 'onChange', 'onAddressChange', 'onReady', 'onError',
  'onLocationChange', 'setCurrentPosition', 'useAdvancedMarker',
]; // prettier-ignore

/** Runtime changes of these keys remount (coalesced per microtask); `marker` only to or from 'advanced'. */
export const REMOUNT_KEYS: readonly C.ConfigKey[] = [
  'provider', 'apiKey', 'mapId', 'mapStyle', 'engine', 'engineUrl', 'engineCssUrl', 'mapOptions', 'marker',
]; // prettier-ignore

const PROVIDER_NAMES: Readonly<Record<string, ProviderName>> = {
  leaflet: 'leaflet',
  osm: 'leaflet',
  openstreetmap: 'leaflet',
  google: 'google',
  googlemaps: 'google',
  'google-maps': 'google',
  maplibre: 'maplibre',
};

/** Lower-cases and maps aliases (osm, openstreetmap, googlemaps, google-maps); null for unknown (§12.4). */
export function normalizeProviderName(name: string): ProviderName | null {
  const key = name.trim().toLowerCase();
  return Object.hasOwn(PROVIDER_NAMES, key) ? PROVIDER_NAMES[key]! : null;
}

export interface ProviderSpec {
  readonly provider: ProviderName | ProviderAdapter;
  readonly source: ResolvedConfig['providerSource'];
  readonly diagnostics: readonly Diagnostic[];
}

/**
 * An unknown provider name becomes an adapter that fails to load with INVALID_OPTION (level error), so the normal
 * mount-failure path applies: `error` event, `ready` rejects, no map, never a silent fallback (§4.1).
 */
function unknownProvider(name: string): ProviderAdapter {
  const error = (): LocationPickerError =>
    createError('INVALID_OPTION', {
      message: `unknown provider "${name}"`,
      fix: 'Use provider="leaflet", "google" or "maplibre", or pass an adapter object.',
    });
  return {
    name,
    load: () => Promise.reject(error()),
    mount: () => {
      throw error();
    },
  };
}

/**
 * Provider selection (D5): an explicit `provider` wins (adapter objects as-is, names lower-cased and alias-mapped),
 * then any Google-only signal (apiKey, mapId, marker 'advanced', useAdvancedMarker, a 3rd constructor argument)
 * selects 'google', otherwise 'leaflet'. A loaded google.maps is never sniffed; it only adds a one-time info hint.
 */
export function resolveProviderSpec(
  options: LocationPickerOptions,
  thirdArg?: Record<string, unknown>,
): ProviderSpec {
  const { provider } = options;
  if (provider && typeof provider == 'object') {
    return { provider, source: 'explicit', diagnostics: [] };
  }
  if (typeof provider == 'string' && provider.trim()) {
    const name = normalizeProviderName(provider);
    if (!name) return { provider: unknownProvider(provider), source: 'explicit', diagnostics: [] };
    const given = provider.trim().toLowerCase();
    const diagnostics: Diagnostic[] =
      given == name
        ? []
        : [{ level: 'warn', key: `provider:${given}`, message: providerAlias(provider, name) }];
    return { provider: name, source: 'explicit', diagnostics };
  }
  if (
    options.apiKey ||
    options.mapId ||
    options.marker === 'advanced' ||
    options.useAdvancedMarker ||
    thirdArg
  ) {
    return { provider: 'google', source: 'google-signal', diagnostics: [] };
  }
  const google: unknown = Reflect.get(globalThis, 'google');
  const loaded = typeof google == 'object' && google != null && Reflect.get(google, 'maps') != null;
  return {
    provider: 'leaflet',
    source: 'default',
    diagnostics: loaded ? [{ level: 'info', key: 'google-hint', message: GOOGLE_HINT }] : [],
  };
}

export interface LatLngRead {
  /** null = unset (also for rejected input). */
  readonly value: LatLng | null;
  /** INVALID_VALUE (level warn) for rejected input. */
  readonly error?: LocationPickerError;
  /** The D19 clamp warning for numeric/object input. */
  readonly diagnostic?: Diagnostic;
}

const quote = (s: string): string => JSON.stringify(s.length > 60 ? `${s.slice(0, 57)}...` : s);

/**
 * Lenient position input (D4, D19), shared by options, attributes, property setters and setLocation():
 * - null, undefined, "" and "," mean unset, silently;
 * - STRINGS are parsed (parseLatLng); a failure is INVALID_VALUE with a reason (swap hint, short link);
 * - arrays are INVALID_VALUE ("GeoJSON" order is ambiguous);
 * - NUMERIC/OBJECT input is normalised: longitude wraps, latitude clamps with a warning carrying the swap hint.
 */
export function readLatLngInput(input: unknown): LatLngRead {
  if (input == null || (typeof input == 'string' && /^\s*,?\s*$/.test(input)))
    return { value: null };
  if (Array.isArray(input)) {
    return {
      value: null,
      error: createError('INVALID_VALUE', {
        message: 'arrays are ambiguous ([lng,lat] in GeoJSON)',
        fix: 'Pass "lat,lng" or {lat, lng}.',
      }),
    };
  }
  const raw = parsePair(input);
  if (typeof input == 'string') {
    if (raw && Math.abs(raw.lat) <= 90) return { value: { lat: raw.lat, lng: raw.lng } };
    if (/goo\.gl\/|maps\.apple\/p\//.test(input)) {
      return {
        value: null,
        error: createError('INVALID_VALUE', {
          message: `${quote(input)} is a short link, which can't be expanded in the browser`,
          fix: 'Open the link and copy the full URL (or the coordinates) from the address bar.',
        }),
      };
    }
    const swap =
      raw && Math.abs(raw.lng) <= 90
        ? `; did you swap lat and lng? try "${raw.lng},${raw.lat}"`
        : '';
    return {
      value: null,
      error: createError('INVALID_VALUE', {
        message: raw ? `latitude ${raw.lat} in ${quote(input)} is out of range${swap}` : undefined,
        vars: { value: quote(input) },
      }),
    };
  }
  if (!raw) {
    const what = typeof input == 'number' ? String(input) : `this ${typeof input}`;
    return { value: null, error: createError('INVALID_VALUE', { vars: { value: what } }) };
  }
  const lat = Math.min(90, Math.max(-90, raw.lat));
  const value = { lat, lng: raw.lng };
  if (lat == raw.lat) return { value };
  const message = clampedLatitude(raw.lat, raw.lng);
  return { value, diagnostic: { level: 'warn', key: message, message } };
}

const text = (v: unknown): string | undefined => (typeof v == 'string' && v ? v : undefined);
const number = (v: unknown): number | undefined => {
  const n = toNumber(v);
  return Number.isFinite(n) ? n : undefined;
};
const given = (v: unknown): boolean => v != null && v !== '';
/** Safe display of arbitrary input (String() can throw on symbols' templates and hostile toString). */
const show = (v: unknown): string => (typeof v == 'string' ? v : typeof v);
/** "none" or false = never load; "" = the default. */
const url = (v: unknown): string | false | undefined =>
  v === false || v === 'none' ? false : text(v);
const isElement = (v: unknown): v is HTMLElement =>
  typeof v == 'object' && v != null && Reflect.get(v, 'nodeType') === 1;

/** nonce of the document's first script[nonce] (the property: browsers hide the attribute after parsing). */
export function detectNonce(doc?: Document): string | undefined {
  const script = doc?.querySelector<HTMLScriptElement>('script[nonce]');
  return script?.nonce || script?.getAttribute('nonce') || undefined;
}

const isApple = (): boolean =>
  typeof navigator != 'undefined' && /Mac|iPhone|iPad|iPod/.test(navigator.userAgent);

/** THE defaults resolver for both surfaces. The element first builds a `LocationPickerOptions` object from ATTRIBUTES + properties. */
export function resolveConfig(
  options: LocationPickerOptions,
  context: ResolveContext,
): ResolveResult {
  const o: LocationPickerOptions = options ?? {};
  const errors: LocationPickerError[] = [];
  const diagnostics: Diagnostic[] = [];
  const warn = (key: string, message: string): void => {
    diagnostics.push({ level: 'warn', key, message });
  };
  const read = (input: unknown): LatLng | null => {
    const r = readLatLngInput(input);
    if (r.error) errors.push(r.error);
    if (r.diagnostic) diagnostics.push(r.diagnostic);
    return r.value;
  };
  const choose = <T extends string>(key: string, value: unknown, allowed: readonly T[]): T => {
    const found = allowed.find((a) => a === value);
    if (!found && given(value)) warn(`${key}:${show(value)}`, badChoice(key, show(value), allowed));
    return found ?? allowed[0]!;
  };

  const known = new Set<string>(OPTION_KEYS);
  for (const key of Object.keys(o)) {
    if (!known.has(key)) warn(`option:${key}`, unknownOption(key, OPTION_KEYS));
  }
  // The element maps its lat/lng attributes onto these keys; only class users get the deprecation.
  const deprecated = ['setCurrentPosition', 'useAdvancedMarker', 'onLocationChange'] as const;
  for (const key of context.mode == 'class'
    ? (['lat', 'lng', ...deprecated] as const)
    : deprecated) {
    if (o[key] !== undefined) warn(`deprecated:${key}`, DEPRECATED[key]!);
  }
  if (context.thirdArg) warn('deprecated:mapOptionsArgument', DEPRECATED.mapOptionsArgument!);

  const spec = resolveProviderSpec(o, context.thirdArg);
  diagnostics.push(...spec.diagnostics);

  // `value` wins over the lat/lng default-value alias (deprecated options; the element's lat/lng attributes).
  let value: LatLng | null = null;
  if (given(o.value)) value = read(o.value);
  else if (given(o.lat) || given(o.lng)) {
    const lat = number(o.lat);
    const lng = number(o.lng);
    if (lat === undefined || lng === undefined) {
      errors.push(
        createError('INVALID_OPTION', {
          message: 'lat and lng must be given together, as numbers',
          fix: 'Pass both lat and lng, or value="lat,lng".',
          level: 'warn',
        }),
      );
    } else value = read({ lat, lng });
  }
  const center = o.center == null ? null : read(o.center);

  const messages: Messages = { ...MESSAGES };
  if (isApple()) messages.cooperativeHint = MESSAGES.cooperativeHint.replace('Ctrl', '⌘');
  for (const [key, custom] of Object.entries(o.messages ?? {})) {
    if (custom !== undefined && Object.hasOwn(MESSAGES, key)) Reflect.set(messages, key, custom);
  }

  const provider = spec.provider;
  const tileUrl = text(o.tileUrl);
  const attribution = tileUrl ? (text(o.attribution) ?? '') : OSM_ATTRIBUTION;
  const providerName = typeof provider == 'string' ? provider : provider.name;
  if (tileUrl && !attribution && providerName != 'google')
    warn('tile-attribution', TILE_ATTRIBUTION);

  const locate: unknown =
    o.locate ?? (o.setCurrentPosition === undefined ? undefined : o.setCurrentPosition && 'auto');
  const precision = number(o.precision);
  const geolocation = o.geolocation ?? {};
  const fallbackGeolocation = DEFAULTS.geolocation;
  const host = context.host;
  const inputs: { value?: InputRef; lat?: InputRef; lng?: InputRef; address?: InputRef } = {
    ...(o.valueInput ? { value: o.valueInput } : {}),
    ...(o.latInput ? { lat: o.latInput } : {}),
    ...(o.lngInput ? { lng: o.lngInput } : {}),
    ...(o.addressInput ? { address: o.addressInput } : {}),
  };

  const config: ResolvedConfig = {
    provider,
    providerSource: spec.source,
    value,
    center: center ?? { ...DEFAULTS.center },
    centerGiven: !!center,
    zoom: number(o.zoom) ?? (value || center ? 15 : DEFAULTS.zoom),
    maxZoom: number(o.maxZoom),
    precision:
      precision === undefined
        ? DEFAULTS.precision
        : Math.min(10, Math.max(0, Math.round(precision))),
    disabled: !!o.disabled,
    readOnly: !!o.readOnly,
    marker: isElement(o.marker)
      ? o.marker
      : choose<MarkerMode>('marker', o.marker ?? (o.useAdvancedMarker ? 'advanced' : undefined), [
          'pin',
          'none',
          'advanced',
        ]),
    gestureHandling: choose('gestureHandling', o.gestureHandling, [
      'auto',
      'cooperative',
      'greedy',
      'none',
    ]),
    locate: choose(
      'locate',
      locate === true || locate === '' ? 'button' : locate === false ? 'off' : locate,
      ['off', 'button', 'auto'],
    ),
    geolocation: {
      enableHighAccuracy: geolocation.enableHighAccuracy ?? fallbackGeolocation.enableHighAccuracy,
      timeout: geolocation.timeout ?? fallbackGeolocation.timeout,
      maximumAge: geolocation.maximumAge ?? fallbackGeolocation.maximumAge,
    },
    search: !!o.search,
    placeholder: text(o.placeholder) ?? messages.searchPlaceholder,
    reverseGeocode: !!o.reverseGeocode,
    geocoder:
      typeof o.geocoder == 'function'
        ? { search: o.geocoder }
        : o.geocoder === false
          ? false
          : (o.geocoder ?? undefined),
    inputs,
    messages,
    lang:
      text(o.lang) ??
      (host.closest?.('[lang]:not([lang=""])')?.getAttribute('lang') ||
        (typeof navigator != 'undefined' && navigator.language) ||
        DEFAULTS.lang),
    nonce: text(o.nonce) ?? detectNonce(host.ownerDocument),
    injectStyles: o.injectStyles !== false,
    webmcp: o.webmcp ? {} : false,
    apiKey: text(o.apiKey),
    mapId: text(o.mapId),
    tileUrl: tileUrl ?? OSM_TILE_URL,
    tileUrlGiven: !!tileUrl,
    attribution,
    mapStyle:
      o.mapStyle && typeof o.mapStyle == 'object'
        ? o.mapStyle
        : (text(o.mapStyle) ?? OPENFREEMAP_STYLE_URL),
    engine: o.engine || undefined,
    engineUrl: url(o.engineUrl),
    engineCssUrl: url(o.engineCssUrl),
    mapOptions: { ...context.thirdArg, ...o.mapOptions },
  };
  return { config, errors, diagnostics };
}
