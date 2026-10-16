import { afterEach, beforeEach, describe, expect, expectTypeOf, it, vi } from 'vitest';
import type {
  LocationPickerOptions,
  MapHandle,
  MountContext,
  ProviderAdapter,
} from '../../src/core.js';
import type * as C from '../../src/internal/contracts.js';
import {
  CLASS_ONLY_KEYS,
  DEFAULTS,
  OPTION_KEYS,
  REMOUNT_KEYS,
  normalizeProviderName,
  readLatLngInput,
  resolveConfig,
} from '../../src/core/config.js';
import { emitDiagnostics } from '../../src/core/diagnostics.js';
import { LocationPickerError } from '../../src/core/errors.js';

// Takes `unknown` on purpose: the element and untyped JS callers hand over anything.
const resolve = (
  options: unknown,
  mode: 'class' | 'element' = 'class',
  thirdArg?: Record<string, unknown>,
): C.ResolveResult => {
  const result: C.ResolveResult = Reflect.apply(resolveConfig, undefined, [
    options,
    { mode, host: document.createElement('div'), thirdArg },
  ]);
  return result;
};
const noSearchResults = async (): Promise<never[]> => [];
const messagesOf = (r: C.ResolveResult): string[] => r.diagnostics.map((d) => d.message);
const codesOf = (r: C.ResolveResult): string[] => r.errors.map((e) => `${e.code}:${e.level}`);

beforeEach(() => {
  Reflect.deleteProperty(globalThis, Symbol.for('location-picker'));
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('contract shape (§12.1)', () => {
  it('matches the declared types', () => {
    expectTypeOf(resolveConfig).toEqualTypeOf<typeof C.resolveConfig>();
    expectTypeOf(DEFAULTS).toEqualTypeOf<typeof C.DEFAULTS>();
    expectTypeOf(OPTION_KEYS).toEqualTypeOf<typeof C.OPTION_KEYS>();
    expectTypeOf(CLASS_ONLY_KEYS).toEqualTypeOf<typeof C.CLASS_ONLY_KEYS>();
    expectTypeOf(REMOUNT_KEYS).toEqualTypeOf<typeof C.REMOUNT_KEYS>();
    expectTypeOf(normalizeProviderName).toEqualTypeOf<typeof C.normalizeProviderName>();
  });

  it('OPTION_KEYS lists every LocationPickerOptions key exactly once', () => {
    // `satisfies` fails the typecheck when a key is missing or unknown.
    const every = {
      provider: 1, value: 1, center: 1, zoom: 1, maxZoom: 1, precision: 1, disabled: 1, readOnly: 1,
      marker: 1, gestureHandling: 1, locate: 1, geolocation: 1, search: 1, placeholder: 1,
      reverseGeocode: 1, geocoder: 1, latInput: 1, lngInput: 1, valueInput: 1, addressInput: 1,
      messages: 1, lang: 1, injectStyles: 1, nonce: 1, webmcp: 1, signal: 1, apiKey: 1, mapId: 1,
      tileUrl: 1, attribution: 1, mapStyle: 1, engine: 1, engineUrl: 1, engineCssUrl: 1, mapOptions: 1,
      onInput: 1, onChange: 1, onAddressChange: 1, onReady: 1, onError: 1, onLocationChange: 1, lat: 1,
      lng: 1, setCurrentPosition: 1, useAdvancedMarker: 1,
    } satisfies Record<keyof LocationPickerOptions, 1>; // prettier-ignore
    expect([...OPTION_KEYS].toSorted()).toEqual(Object.keys(every).toSorted());
    expect(new Set(OPTION_KEYS).size).toBe(OPTION_KEYS.length);
  });

  it('CLASS_ONLY_KEYS are option keys; REMOUNT_KEYS are config keys', () => {
    for (const key of CLASS_ONLY_KEYS) expect(OPTION_KEYS).toContain(key);
    for (const key of REMOUNT_KEYS) expect(Object.keys(DEFAULTS)).toContain(key);
    expect([...REMOUNT_KEYS].toSorted()).toEqual([
      'apiKey',
      'engine',
      'engineCssUrl',
      'engineUrl',
      'mapId',
      'mapOptions',
      'mapStyle',
      'marker',
      'provider',
    ]);
  });

  it('DEFAULTS are the §7 defaults', () => {
    expect(DEFAULTS).toMatchObject({
      provider: 'leaflet',
      value: null,
      center: { lat: 20, lng: 0 },
      zoom: 2,
      precision: 6,
      locate: 'off',
      geolocation: { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 },
      gestureHandling: 'auto',
      marker: 'pin',
      search: false,
      reverseGeocode: false,
      injectStyles: true,
      webmcp: false,
      tileUrl: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
      mapStyle: 'https://tiles.openfreemap.org/styles/liberty',
      placeholder: 'Search or paste coordinates',
    });
    expect(DEFAULTS.attribution).toContain('OpenStreetMap');
    expect(DEFAULTS.messages.goTo('1, 2')).toBe('Go to 1, 2');
  });

  it('resolving {} gives the defaults', () => {
    const { config, errors, diagnostics } = resolve({});
    expect(errors).toEqual([]);
    expect(diagnostics).toEqual([]);
    const { messages, lang, ...rest } = config;
    const { messages: defaultMessages, lang: defaultLang, ...defaults } = DEFAULTS;
    expect(rest).toEqual(defaults);
    expect(typeof lang).toBe('string');
    expect(messages).toEqual(defaultMessages);
    expect(defaultLang).toBe('en');
  });
});

// WP2-07 at the config level; the picker-level half (error event, `ready` rejects) needs PickerCore (part 2).
describe('provider resolution (D5, §4.1)', () => {
  const handle: MapHandle = {
    map: null,
    getCenter: () => ({ lat: 0, lng: 0 }),
    getZoom: () => 0,
    setView: () => {},
    setZoom: () => {},
    setInteractive: () => {},
    resize: () => {},
    destroy: () => {},
  };
  const adapter: ProviderAdapter = { name: 'fake', mount: () => handle };

  it.each([
    [{}, 'leaflet', 'default'],
    [{ apiKey: 'AIza' }, 'google', 'google-signal'],
    [{ mapId: 'abc' }, 'google', 'google-signal'],
    [{ marker: 'advanced' }, 'google', 'google-signal'],
    [{ useAdvancedMarker: true }, 'google', 'google-signal'],
    [{ provider: 'leaflet', apiKey: 'AIza' }, 'leaflet', 'explicit'],
    [{ lat: 1, lng: 2 }, 'leaflet', 'default'],
    [{ provider: 'Leaflet' }, 'leaflet', 'explicit'],
    [{ provider: 'maplibre' }, 'maplibre', 'explicit'],
    [{ provider: 'google' }, 'google', 'explicit'],
  ] as const)('%j -> %s (%s)', (options, provider, source) => {
    const { config, diagnostics } = resolve(options);
    expect([config.provider, config.providerSource]).toEqual([provider, source]);
    expect(diagnostics.filter((d) => d.key.startsWith('provider:'))).toEqual([]);
  });

  it('a 3rd constructor argument selects google, merges into mapOptions and warns once', () => {
    const { config, diagnostics } = resolve({}, 'class', { zoom: 3 });
    expect([config.provider, config.providerSource]).toEqual(['google', 'google-signal']);
    expect(config.mapOptions).toEqual({ zoom: 3 });
    expect(diagnostics.filter((d) => d.key.startsWith('deprecated:'))).toHaveLength(1);
    expect(messagesOf(resolve({}, 'class', { zoom: 3 })).at(0)).toContain('provider: "google"');
  });

  it('explicit mapOptions win over the 3rd argument', () => {
    const { config } = resolve({ mapOptions: { zoom: 5, a: 1 } }, 'class', { zoom: 3, b: 2 });
    expect(config.mapOptions).toEqual({ zoom: 5, a: 1, b: 2 });
  });

  it.each([
    ['osm', 'leaflet'],
    ['OpenStreetMap', 'leaflet'],
    ['googlemaps', 'google'],
    ['Google-Maps', 'google'],
  ] as const)('alias %s -> %s with one warning', (name, provider) => {
    const { config, diagnostics } = resolve({ provider: name });
    expect(config.provider).toBe(provider);
    expect(diagnostics).toEqual([
      {
        level: 'warn',
        key: `provider:${name.toLowerCase()}`,
        message: `provider "${name}" is an alias; use provider: "${provider}".`,
      },
    ]);
  });

  it('an adapter object is used as-is', () => {
    expect(resolve({ provider: adapter }).config.provider).toBe(adapter);
  });

  it('an unknown name becomes an adapter that fails with INVALID_OPTION (no silent fallback)', async () => {
    const { config, errors } = resolve({ provider: 'bing' });
    expect(errors).toEqual([]);
    const failing = config.provider;
    if (typeof failing == 'string') throw new Error('expected a failing adapter');
    expect(failing.name).toBe('bing');
    const expected = {
      code: 'INVALID_OPTION',
      level: 'error',
      message: expect.stringContaining('unknown provider "bing"'),
    };
    const ctx: MountContext = Object.create(null);
    const loading = failing.load?.(ctx);
    await expect(loading).rejects.toBeInstanceOf(LocationPickerError);
    await expect(loading).rejects.toMatchObject(expected);
    expect(() => failing.mount(ctx)).toThrow(LocationPickerError);
  });

  it('a loaded google.maps never selects google; three pickers log exactly one console.info', () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => {});
    vi.stubGlobal('google', { maps: {} });
    for (let i = 0; i < 3; i++) {
      const { config, diagnostics } = resolve({});
      expect(config.provider).toBe('leaflet');
      emitDiagnostics(diagnostics);
    }
    expect(info).toHaveBeenCalledTimes(1);
    expect(info.mock.calls.at(0)?.[0]).toBe(
      '[location-picker] google.maps is loaded but no provider was chosen; using OpenStreetMap. Set provider="google" (or api-key) to use Google Maps.',
    );
    expect(resolve({ apiKey: 'k' }).diagnostics).toEqual([]);
  });

  it('normalizeProviderName maps aliases and rejects the rest (including Object.prototype keys)', () => {
    expect(normalizeProviderName(' OSM ')).toBe('leaflet');
    expect(normalizeProviderName('constructor')).toBeNull();
    expect(normalizeProviderName('bing')).toBeNull();
  });
});

// WP2-19
describe('unknown and deprecated keys', () => {
  it('an unknown key gives one warning that lists the valid keys', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const options = { search: true, serach: true };
    for (let i = 0; i < 2; i++) emitDiagnostics(resolve(options).diagnostics);
    expect(warn).toHaveBeenCalledTimes(1);
    const line = String(warn.mock.calls.at(0)?.[0]);
    expect(line).toMatch(/^\[location-picker\] Unknown option "serach"\. Valid options: /);
    for (const key of OPTION_KEYS) expect(line).toContain(key);
  });

  it('suggests the right spelling of a near miss', () => {
    const r = resolve({ apikey: 'k' });
    expect(messagesOf(r).at(0)).toContain('(did you mean "apiKey"?)');
  });

  it('each deprecated key gives one deprecation warning', () => {
    const options: LocationPickerOptions = {
      lat: 1,
      lng: 2,
      setCurrentPosition: true,
      useAdvancedMarker: true,
      onLocationChange: () => {},
    };
    const deprecations = resolve(options, 'class', { zoom: 3 }).diagnostics.filter((d) =>
      d.key.startsWith('deprecated:'),
    );
    expect(deprecations.map((d) => d.key).toSorted()).toEqual([
      'deprecated:lat',
      'deprecated:lng',
      'deprecated:mapOptionsArgument',
      'deprecated:onLocationChange',
      'deprecated:setCurrentPosition',
      'deprecated:useAdvancedMarker',
    ]);
    expect(deprecations.find((d) => d.key == 'deprecated:useAdvancedMarker')?.message).toContain(
      'marker: "advanced"',
    );
  });

  it('the element maps its lat/lng attributes onto lat/lng without a deprecation', () => {
    const r = resolve({ lat: '48.8584', lng: '2.2945' }, 'element');
    expect(r.diagnostics).toEqual([]);
    expect(r.config.value).toEqual({ lat: 48.8584, lng: 2.2945 });
  });
});

describe('value and center (D4, D19)', () => {
  it('parses lenient strings and starts at zoom 15', () => {
    const { config, errors } = resolve({ value: '48.8584, 2.2945' });
    expect(config.value).toEqual({ lat: 48.8584, lng: 2.2945 });
    expect(config.zoom).toBe(15);
    expect(errors).toEqual([]);
  });

  it('"," and "" are unset without a warning', () => {
    for (const value of [',', '', ' , ', null]) {
      const r = resolve({ value });
      expect([r.config.value, r.errors, r.diagnostics]).toEqual([null, [], []]);
    }
  });

  it('"abc" is unset plus INVALID_VALUE (warn)', () => {
    const r = resolve({ value: 'abc' });
    expect(r.config.value).toBeNull();
    expect(codesOf(r)).toEqual(['INVALID_VALUE:warn']);
    expect(r.errors.at(0)?.message).toBe(
      '[location-picker] "abc" is not a coordinate. Fix: Pass "lat,lng" (latitude first), e.g. "48.8584,2.2945", or {lat, lng}.',
    );
  });

  it('arrays are INVALID_VALUE with the GeoJSON hint', () => {
    const r = resolve({ value: [48.8, 2.3] });
    expect(r.config.value).toBeNull();
    expect(r.errors.at(0)?.message).toContain('GeoJSON');
  });

  it('a string latitude out of range is rejected with the swap hint', () => {
    const r = resolve({ value: '120,45' });
    expect(r.config.value).toBeNull();
    expect(codesOf(r)).toEqual(['INVALID_VALUE:warn']);
    expect(r.errors.at(0)?.message).toContain('"45,120"');
    expect(resolve({ value: '95,10' }).config.value).toBeNull();
  });

  it('short links are explained', () => {
    const r = resolve({ value: 'https://maps.app.goo.gl/AbC123' });
    expect(r.errors.at(0)?.message).toContain("short link, which can't be expanded in the browser");
    expect(r.errors.at(0)?.fix).toContain('copy the full URL');
  });

  it('objects are clamped with one warning carrying the swap hint', () => {
    const r = resolve({ value: { lat: -91, lng: 0 } });
    expect(r.config.value).toEqual({ lat: -90, lng: 0 });
    expect(r.errors).toEqual([]);
    expect(messagesOf(r)).toEqual([
      'latitude -91 was clamped to -90; did you swap lat and lng? try (0, -91)',
    ]);
  });

  it('deprecated {lat: 95, lng: 10} options start at 90,10 and warn with "(10, 95)"', () => {
    const r = resolve({ lat: 95, lng: 10 });
    expect(r.config.value).toEqual({ lat: 90, lng: 10 });
    expect(messagesOf(r)).toContain(
      'latitude 95 was clamped to 90; did you swap lat and lng? try (10, 95)',
    );
  });

  it('lat without lng is INVALID_OPTION at level warn; 0 is a valid coordinate', () => {
    expect(codesOf(resolve({ lat: 10 }))).toEqual(['INVALID_OPTION:warn']);
    expect(codesOf(resolve({ lat: 10, lng: Number.NaN }))).toEqual(['INVALID_OPTION:warn']);
    expect(resolve({ lat: 0, lng: 0 }).config.value).toEqual({ lat: 0, lng: 0 });
  });

  it('value wins over lat/lng', () => {
    const r = resolve({ value: '1,2', lat: 3, lng: 4 });
    expect(r.config.value).toEqual({ lat: 1, lng: 2 });
  });

  it('center: given -> zoom 15 and centerGiven; invalid -> INVALID_VALUE and the world view', () => {
    const r = resolve({ center: '33.8938,35.5018' });
    expect([r.config.center, r.config.centerGiven, r.config.zoom, r.config.value]).toEqual([
      { lat: 33.8938, lng: 35.5018 },
      true,
      15,
      null,
    ]);
    const bad = resolve({ center: 'nowhere' });
    expect([bad.config.center, bad.config.centerGiven, bad.config.zoom]).toEqual([
      { lat: 20, lng: 0 },
      false,
      2,
    ]);
    expect(codesOf(bad)).toEqual(['INVALID_VALUE:warn']);
    expect(resolve({ center: { lat: 1, lng: 2 }, zoom: 7 }).config.zoom).toBe(7);
  });

  it('readLatLngInput reports what each input means', () => {
    expect(readLatLngInput(undefined)).toEqual({ value: null });
    expect(readLatLngInput({ latitude: 1, longitude: 190 })).toEqual({
      value: { lat: 1, lng: -170 },
    });
    expect(readLatLngInput('geo:1,2?z=3')).toEqual({ value: { lat: 1, lng: 2 } });
    expect(readLatLngInput(42).error?.message).toContain('42 is not a coordinate');
    expect(readLatLngInput({}).error?.message).toContain('this object is not a coordinate');
  });
});

describe('other options', () => {
  it('normalises locate, setCurrentPosition, enums and markers', () => {
    expect(resolve({ locate: true }).config.locate).toBe('button');
    expect(resolve({ locate: '' }).config.locate).toBe('button');
    expect(resolve({ locate: false }).config.locate).toBe('off');
    expect(resolve({ setCurrentPosition: true }).config.locate).toBe('auto');
    expect(resolve({ setCurrentPosition: false }).config.locate).toBe('off');
    expect(resolve({ locate: 'button', setCurrentPosition: true }).config.locate).toBe('button');
    expect(resolve({ useAdvancedMarker: true }).config.marker).toBe('advanced');
    const element = document.createElement('img');
    expect(resolve({ marker: element }).config.marker).toBe(element);
    const r = resolve({ gestureHandling: 'sometimes' });
    expect(r.config.gestureHandling).toBe('auto');
    expect(messagesOf(r)).toEqual([
      'gestureHandling: "sometimes" is not one of auto, cooperative, greedy, none; using "auto".',
    ]);
  });

  it('normalises engine URLs, the geocoder shorthand and webmcp', () => {
    expect(resolve({ engineUrl: 'none', engineCssUrl: '' }).config).toMatchObject({
      engineUrl: false,
      engineCssUrl: undefined,
    });
    expect(resolve({ engineUrl: false, engineCssUrl: '/l.css' }).config).toMatchObject({
      engineUrl: false,
      engineCssUrl: '/l.css',
    });
    expect(resolve({ geocoder: noSearchResults }).config.geocoder).toEqual({
      search: noSearchResults,
    });
    expect(resolve({ geocoder: false }).config.geocoder).toBe(false);
    expect(resolve({ webmcp: true }).config.webmcp).toEqual({});
  });

  it('merges geolocation, messages and the placeholder over the defaults', () => {
    const { config } = resolve({
      geolocation: { timeout: 5000 },
      messages: { searchPlaceholder: 'Chercher', locate: 'Ma position' },
    });
    expect(config.geolocation).toEqual({
      enableHighAccuracy: true,
      timeout: 5000,
      maximumAge: 30000,
    });
    expect(config.messages.locate).toBe('Ma position');
    expect(config.messages.confirm).toBe('Use this location');
    expect(config.placeholder).toBe('Chercher');
    expect(resolve({ placeholder: 'Where?' }).config.placeholder).toBe('Where?');
  });

  it('uses ⌘ in the cooperative hint on Apple platforms unless overridden', () => {
    vi.stubGlobal('navigator', {
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 15_0)',
      language: 'fr',
    });
    expect(resolve({}).config.messages.cooperativeHint).toBe('Use ⌘ + scroll to zoom the map');
    expect(
      resolve({ messages: { cooperativeHint: 'Zoom!' } }).config.messages.cooperativeHint,
    ).toBe('Zoom!');
  });

  it('forces the OSM credit on the default tiles; warns for custom tiles without attribution', () => {
    const osm = resolve({ attribution: 'mine' }).config;
    expect([osm.tileUrlGiven, osm.attribution]).toEqual([false, DEFAULTS.attribution]);
    const custom = resolve({ tileUrl: 'https://tiles.example/{z}/{x}/{y}.png' });
    expect([custom.config.tileUrlGiven, custom.config.attribution]).toEqual([true, '']);
    expect(custom.diagnostics.map((d) => d.key)).toEqual(['tile-attribution']);
    expect(
      resolve({ tileUrl: 'https://t/{z}/{x}/{y}.png', attribution: '© T' }).diagnostics,
    ).toEqual([]);
  });

  it('keeps only the bound inputs that were given', () => {
    expect(resolve({ latInput: 'lat', lngInput: '#lng', valueInput: '' }).config.inputs).toEqual({
      lat: 'lat',
      lng: '#lng',
    });
  });

  it('clamps precision to 0–10 and reads numeric attribute strings', () => {
    expect(resolve({ precision: 14 }).config.precision).toBe(10);
    expect(resolve({ precision: -1 }).config.precision).toBe(0);
    expect(resolve({ precision: '5', zoom: '12', maxZoom: '18' }).config).toMatchObject({
      precision: 5,
      zoom: 12,
      maxZoom: 18,
    });
  });

  it('resolves lang (option, closest [lang], navigator) and the nonce (option, first script[nonce])', () => {
    const section = document.createElement('section');
    section.lang = 'ar';
    const host = section.appendChild(document.createElement('div'));
    expect(resolveConfig({}, { mode: 'class', host }).config.lang).toBe('ar');
    expect(resolveConfig({ lang: 'de' }, { mode: 'class', host }).config.lang).toBe('de');

    const script = document.head.appendChild(document.createElement('script'));
    script.setAttribute('nonce', 'r4nd0m');
    try {
      expect(resolve({}).config.nonce).toBe('r4nd0m');
      expect(resolve({ nonce: 'mine' }).config.nonce).toBe('mine');
    } finally {
      script.remove();
    }
    expect(resolve({}).config.nonce).toBeUndefined();
  });

  it('never throws on odd input', () => {
    const odd: unknown[] = [
      null,
      undefined,
      { value: Symbol('x'), center: 5, zoom: 'x', marker: Symbol('m'), locate: {}, provider: 7 },
      { messages: 'nope', geolocation: null, mapOptions: null, geocoder: null, engine: null },
    ];
    for (const options of odd) expect(() => resolve(options)).not.toThrow();
  });
});
