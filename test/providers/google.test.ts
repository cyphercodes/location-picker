// The Google adapter, bootstrap and geocoder in the unit project (jsdom), against the §12.6 Google Maps mock and the
// real core: loading (WP3-08), the auth chain (WP3-09), the advanced marker (WP3-10), zoom anchoring (WP3-11),
// PlaceAutocompleteElement search (WP3-12), googleGeocoder (WP3-13) and pairing (WP3-14). The DOM-heavy halves
// (computed pin, real wheel/paste events, shadow roots) run again in google.browser.test.ts.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Geocoder, LocationPickerOptions } from '../../src/core.js';
import { LocationPicker } from '../../src/core.js';
import { erased } from '../../src/core/providers.js';
import { googleGeocoder, googleProvider, loadGoogleMaps } from '../../src/google.js';
import { photonGeocoder } from '../../src/photon.js';
import { createFakeAdapter } from '../fixtures/fake-adapter.js';
import {
  googleAddressAt,
  installGoogleMapsMock,
  MockMap,
  type GoogleMapsMock,
  type GoogleMockOptions,
} from '../fixtures/google-maps-mock.js';
import { addressDetails, details, errors, record, summary } from '../core/helpers.js';
import {
  flush,
  must,
  resetStore,
  shadowPicker,
  sleep,
  spyConsole,
  stubPhoton,
  waitFor,
} from './helpers.js';

const EIFFEL = { lat: 48.85837, lng: 2.294481 };
let mock: GoogleMapsMock | undefined;
const pickers: { destroy(): void }[] = [];

function install(options: GoogleMockOptions): GoogleMapsMock {
  return (mock = installGoogleMapsMock(globalThis, options));
}
function target(): HTMLElement {
  const element = document.createElement('div');
  element.style.cssText = 'width:320px;height:240px';
  document.body.append(element);
  return element;
}
function picker<T = unknown>(options: LocationPickerOptions<T> = {}): LocationPicker<T> {
  const created = new LocationPicker<T>(target(), options);
  created.ready.catch(() => {});
  pickers.push(created);
  return created;
}
function lastMap(): MockMap {
  const map = mock?.stats.mapInstances.at(-1);
  if (!(map instanceof MockMap)) throw new Error('expected a google.maps.Map');
  return map;
}
const codes = (log: Parameters<typeof errors>[0]): string[] => errors(log).map((e) => e.code);

beforeEach(() => {
  resetStore();
  document.head.innerHTML = '';
  document.body.innerHTML = '';
  Reflect.deleteProperty(globalThis, 'gm_authFailure');
  Reflect.deleteProperty(globalThis, 'google');
});
afterEach(() => {
  for (const created of pickers.splice(0)) created.destroy();
  mock?.uninstall();
  mock = undefined;
  Reflect.deleteProperty(globalThis, 'google');
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('WP3-08: loading', () => {
  it('importLibrary mode imports "maps" and mounts', async () => {
    const google = install({ mode: 'importLibrary' });
    const p = picker({ provider: googleProvider(), value: '48.8584,2.2945' });
    expect(p.map).toBeUndefined();
    await p.ready;
    expect(google.stats.importedLibraries).toEqual(['maps']);
    expect(p.map).toBe(lastMap());
    expect(lastMap().getCenter().toJSON()).toEqual({ lat: 48.8584, lng: 2.2945 });
  });

  it('classic mode + a googleProvider() object sets picker.map synchronously', () => {
    const google = install({ mode: 'classic' });
    const p = picker({ provider: googleProvider(), value: '48.8584,2.2945' });
    expect(p.map).toBeInstanceOf(MockMap);
    expect(google.stats.importedLibraries).toEqual([]);
  });

  it('the map gets the §4.4 options, picker mapOptions and then factory mapOptions on top', () => {
    install({ mode: 'classic' });
    picker({
      provider: googleProvider({ mapOptions: { clickableIcons: true }, mapId: 'factory-id' }),
      mapOptions: { clickableIcons: false, tilt: 0, zoomControl: false },
      mapId: 'picker-id',
      gestureHandling: 'greedy',
    });
    expect(lastMap().options).toMatchObject({
      mapId: 'factory-id',
      gestureHandling: 'greedy',
      clickableIcons: true,
      disableDefaultUI: true,
      zoomControl: false,
      keyboardShortcuts: true,
      fullscreenControl: false,
      streetViewControl: false,
      mapTypeControl: false,
      disableDoubleClickZoom: true,
      colorScheme: 'LIGHT',
      tilt: 0,
    });
    expect(lastMap().options).not.toHaveProperty('internalUsageAttributionIds');
  });

  it('none + apiKey injects exactly one bootstrap (key, v=weekly, language) for 3 pickers', async () => {
    const google = install({ mode: 'none' });
    const created = [1, 2, 3].map(() => picker({ apiKey: 'TEST_KEY', lang: 'fr' }));
    await Promise.all(created.map((p) => p.ready));
    expect(google.stats.bootstrapParams).toHaveLength(1);
    const params = must(google.stats.bootstrapParams[0]);
    expect(Object.fromEntries(params)).toEqual({
      libraries: 'maps',
      key: 'TEST_KEY',
      v: 'weekly',
      language: 'fr',
      callback: 'google.maps.__ib__',
    });
    expect(google.stats.mapInstances).toHaveLength(3);
    expect(created.map((p) => p.provider)).toEqual(['google', 'google', 'google']);
  });

  it('factory version, language and region win; the picker nonce goes on the script', async () => {
    const append = vi.spyOn(document.head, 'append');
    const p = picker({
      provider: googleProvider({ apiKey: 'K', version: 'beta', language: 'ar', region: 'LB' }),
      lang: 'fr',
      nonce: 'n0nce',
    });
    const script = await waitFor(
      () =>
        append.mock.calls
          .flat()
          .find((node): node is HTMLScriptElement => node instanceof HTMLScriptElement),
      1000,
      'the bootstrap script',
    );
    expect(script.nonce).toBe('n0nce');
    const url = new URL(script.src);
    expect(url.origin + url.pathname).toBe('https://maps.googleapis.com/maps/api/js');
    expect(Object.fromEntries(url.searchParams)).toMatchObject({
      key: 'K',
      v: 'beta',
      language: 'ar',
      region: 'LB',
    });
    // A failing script rejects with ENGINE_LOAD_FAILED and a later picker may retry.
    script.dispatchEvent(new Event('error'));
    await expect(p.ready).rejects.toMatchObject({ code: 'ENGINE_LOAD_FAILED' });
  });

  it('no key and no google.maps: API_KEY_MISSING with an api-key fix', async () => {
    spyConsole();
    const p = picker({ provider: 'google' });
    const log = record(p);
    await expect(p.ready).rejects.toMatchObject({ code: 'API_KEY_MISSING' });
    await flush();
    expect(codes(log)).toEqual(['API_KEY_MISSING']);
    expect(errors(log)[0]?.fix).toContain('api-key');
    expect(document.querySelector('.lp-fallback')).not.toBeNull();
  });

  it('loadGoogleMaps() bootstraps once and resolves to google.maps', async () => {
    const google = install({ mode: 'none' });
    const [a, b] = await Promise.all([
      loadGoogleMaps({ apiKey: 'K' }),
      loadGoogleMaps({ apiKey: 'K' }),
    ]);
    expect(a).toBe(b);
    expect(a.Map).toBe(MockMap);
    expect(google.stats.bootstrapParams).toHaveLength(1);
    expect(await loadGoogleMaps({ apiKey: 'other' })).toBe(a);
  });
});

describe('WP3-09: gm_authFailure', () => {
  it('reports GOOGLE_AUTH_FAILED on every live Google picker and still calls the page handler once', async () => {
    spyConsole();
    const google = install({ mode: 'classic' });
    const page = vi.fn<() => void>();
    globalThis.gm_authFailure = page;
    const [a, b, gone] = [
      picker({ provider: googleProvider() }),
      picker({ provider: googleProvider() }),
      picker({ provider: googleProvider() }),
    ];
    const logs = [record(must(a)), record(must(b)), record(must(gone))];
    gone?.destroy();
    google.triggerAuthFailure();
    expect(logs.map(codes)).toEqual([['GOOGLE_AUTH_FAILED'], ['GOOGLE_AUTH_FAILED'], []]);
    expect(page).toHaveBeenCalledTimes(1);
  });

  it('a failing key (mock failAuth) reaches the picker', async () => {
    spyConsole();
    install({ mode: 'classic', failAuth: true });
    const p = picker({ provider: googleProvider() });
    const log = record(p);
    await sleep(10);
    expect(codes(log)).toEqual(['GOOGLE_AUTH_FAILED']);
  });
});

describe('WP3-10: marker "advanced"', () => {
  it('with a mapId: importLibrary("marker"), an AdvancedMarkerElement that follows the centre, the CSS pin hidden', async () => {
    const google = install({ mode: 'importLibrary' });
    const p = picker({
      provider: googleProvider(),
      marker: 'advanced',
      mapId: 'DEMO_MAP_ID',
      value: '1,2',
    });
    await p.ready;
    expect(google.stats.importedLibraries).toEqual(['maps', 'marker']);
    const marker = must(document.querySelector('gmp-advanced-marker'), 'the advanced marker');
    expect(lastMap().inner.contains(marker)).toBe(true);
    expect(lastMap().options.mapId).toBe('DEMO_MAP_ID');
    expect(must(document.querySelector<HTMLElement>('.lp-pin')).hidden).toBe(true);
    lastMap().setCenter({ lat: 3, lng: 4 });
    expect(Reflect.get(marker, 'position')).toEqual({ lat: 3, lng: 4 });
    p.destroy();
    expect(marker.isConnected).toBe(false);
  });

  it('without a mapId: the CSS pin stays and MAP_ID_REQUIRED (warn) is reported after construction', async () => {
    const console = spyConsole();
    install({ mode: 'classic' });
    const p = picker({ provider: googleProvider(), marker: 'advanced' });
    const log = record(p);
    expect(log).toEqual([]);
    await p.ready;
    await flush();
    expect(codes(log)).toEqual(['MAP_ID_REQUIRED']);
    expect(errors(log)[0]?.level).toBe('warn');
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('map ID'));
    expect(document.querySelector('gmp-advanced-marker')).toBeNull();
    expect(must(document.querySelector<HTMLElement>('.lp-pin')).hidden).toBe(false);
  });
});

describe('WP3-11: zoom anchored at the centre', () => {
  const wheel = (map: MockMap, init: WheelEventInit): WheelEvent => {
    const event = new WheelEvent('wheel', { bubbles: true, cancelable: true, ...init });
    map.inner.dispatchEvent(event);
    return event;
  };

  it('greedy: the wheel never reaches the engine; setZoom(zoom ± 1); centre unchanged; no change event', async () => {
    const google = install({ mode: 'classic' });
    const p = picker({
      provider: googleProvider(),
      value: '1,2',
      zoom: 10,
      gestureHandling: 'greedy',
    });
    const log = record(p);
    await p.ready;
    const map = lastMap();
    const event = wheel(map, { deltaY: -100 });
    expect(event.defaultPrevented).toBe(true);
    expect(map.wheelEvents).toBe(0);
    expect(google.stats.setZoomCalls).toEqual([11]);
    // A burst within 120 ms is one step.
    wheel(map, { deltaY: -100 });
    expect(google.stats.setZoomCalls).toEqual([11]);
    await sleep(130);
    wheel(map, { deltaY: 100 });
    expect(google.stats.setZoomCalls).toEqual([11, 10]);
    await sleep(10);
    expect(map.getCenter().toJSON()).toEqual({ lat: 1, lng: 2 });
    expect(summary(log).filter((type) => type.startsWith('change'))).toEqual([]);
    expect(p.value).toBe('1,2');
  });

  it('cooperative without Ctrl: the event passes through untouched; Ctrl+wheel zooms at the centre', async () => {
    const google = install({ mode: 'classic' });
    const p = picker({
      provider: googleProvider(),
      value: '1,2',
      zoom: 10,
      gestureHandling: 'cooperative',
    });
    await p.ready;
    const map = lastMap();
    const plain = wheel(map, { deltaY: -100 });
    expect(plain.defaultPrevented).toBe(false);
    expect(map.wheelEvents).toBe(1);
    expect(google.stats.setZoomCalls).toEqual([]);
    const ctrl = wheel(map, { deltaY: -100, ctrlKey: true });
    expect(ctrl.defaultPrevented).toBe(true);
    expect(map.wheelEvents).toBe(1);
    expect(google.stats.setZoomCalls).toEqual([11]);
  });

  it('dblclick calls setZoom(zoom + 1); double-click zoom of the engine is off', async () => {
    const google = install({ mode: 'classic' });
    const p = picker({ provider: googleProvider(), value: '1,2', zoom: 10 });
    await p.ready;
    lastMap().inner.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    expect(google.stats.setZoomCalls).toEqual([11]);
    expect(lastMap().options.disableDoubleClickZoom).toBe(true);
  });

  it('a user drag commits once (source user); arrow keys pan only while interactive', async () => {
    const google = install({ mode: 'classic' });
    const p = picker({ provider: googleProvider(), value: '1,2', zoom: 10 });
    const log = record(p);
    await p.ready;
    google.simulateUserPan(lastMap(), { lat: 1.5, lng: 2.5 });
    await sleep(30);
    expect(details(log, 'change').map((d) => `${d.value}:${d.source}`)).toEqual(['1.5,2.5:user']);
    p.readOnly = true;
    lastMap().inner.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }));
    await sleep(10);
    expect(lastMap().getCenter().toJSON()).toEqual({ lat: 1.5, lng: 2.5 });
    expect(lastMap().options.gestureHandling).toBe('none');
    p.readOnly = false;
    expect(lastMap().options.gestureHandling).toBe('auto');
    lastMap().inner.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }));
    await sleep(10);
    expect(details(log, 'change').map((d) => `${d.value}:${d.source}`)).toEqual([
      '1.5,2.5:user',
      '1.51,2.5:user',
    ]);
  });

  it('disabled: no gestures, keys or zoom control, and the wheel is left alone', async () => {
    const google = install({ mode: 'classic' });
    const p = picker({
      provider: googleProvider(),
      value: '1,2',
      gestureHandling: 'greedy',
      disabled: true,
    });
    await p.ready;
    expect(lastMap().options).toMatchObject({
      gestureHandling: 'none',
      keyboardShortcuts: false,
      zoomControl: false,
    });
    lastMap().inner.dispatchEvent(
      new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: -100 }),
    );
    lastMap().inner.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    expect(google.stats.setZoomCalls).toEqual([]);
    p.disabled = false;
    expect(lastMap().options).toMatchObject({
      gestureHandling: 'greedy',
      keyboardShortcuts: true,
      zoomControl: true,
    });
  });

  it('gestureHandling and maxZoom change in place (no remount); a dark host asks for the DARK scheme', async () => {
    install({ mode: 'classic' });
    const element = target();
    const { core } = shadowPicker(element, { provider: erased(googleProvider()), maxZoom: 18 });
    await core.ready;
    expect(lastMap().options).toMatchObject({ maxZoom: 18, gestureHandling: 'auto' });
    core.update({ gestureHandling: 'cooperative', maxZoom: 16 });
    expect(lastMap().options).toMatchObject({ maxZoom: 16, gestureHandling: 'cooperative' });
    expect(mock?.stats.mapInstances).toHaveLength(1);
    core.destroy();
    const dark = target();
    dark.style.colorScheme = 'dark';
    picker({ provider: googleProvider() });
    expect(lastMap().options.colorScheme).toBe('LIGHT');
    const night = new LocationPicker(dark, { provider: googleProvider() });
    pickers.push(night);
    expect(lastMap().options.colorScheme).toBe('DARK');
  });

  it('destroy() removes the engine listeners, the map div and the auth listener', async () => {
    install({ mode: 'classic' });
    const p = picker({ provider: googleProvider() });
    await p.ready;
    const map = lastMap();
    p.destroy();
    expect(map.inner.isConnected).toBe(false);
    expect(Symbol.for('location-picker') in globalThis).toBe(true);
    const store = Reflect.get(globalThis, Symbol.for('location-picker')) as {
      googleAuthListeners: Set<unknown>;
    };
    expect(store.googleAuthListeners.size).toBe(0);
  });
});

describe('WP3-12: PlaceAutocompleteElement search', () => {
  const box = async (): Promise<
    HTMLElement & { options: Record<string, unknown>; input: HTMLInputElement }
  > =>
    waitFor(
      () => document.querySelector('gmp-place-autocomplete'),
      2000,
      'the search box',
    ) as never;

  it('one element with requestedLanguage; a pick fetches only location + formattedAddress and commits (search)', async () => {
    const google = install({ mode: 'importLibrary' });
    const p = picker({ provider: googleProvider(), search: true, lang: 'fr', placeholder: 'Find' });
    const log = record(p);
    await p.ready;
    const element = await box();
    expect(google.stats.placeAutocompleteCtorCalls).toBe(1);
    expect(google.stats.legacyAutocompleteCtorCalls).toBe(0);
    expect(google.stats.importedLibraries).toContain('places');
    expect(element.options).toMatchObject({ requestedLanguage: 'fr', placeholder: 'Find' });
    expect(element.closest('.lp-search')).not.toBeNull();
    await google.selectPlace({ ...EIFFEL, formattedAddress: 'Eiffel Tower, Paris', id: 'p1' });
    expect(google.stats.fetchFieldsCalls).toEqual([['location', 'formattedAddress']]);
    expect(summary(log)).toEqual([
      'ready',
      'input:48.85837,2.294481:search',
      'change:48.85837,2.294481:search',
      'addresschange',
    ]);
    expect(details(log, 'change')[0]?.address).toBe('Eiffel Tower, Paris');
    expect(p.address).toBe('Eiffel Tower, Paris');
    expect(google.stats.legacyAutocompleteCtorCalls).toBe(0);
  });

  it('pasting coordinates commits at once with no Places call', async () => {
    const google = install({ mode: 'importLibrary' });
    const p = picker({ provider: googleProvider(), search: true });
    const log = record(p);
    await p.ready;
    const element = await box();
    const paste = Object.assign(
      new Event('paste', { bubbles: true, composed: true, cancelable: true }),
      {
        clipboardData: { getData: () => ' 48.85, 2.29 ' },
      },
    );
    element.input.dispatchEvent(paste);
    expect(paste.defaultPrevented).toBe(true);
    expect(summary(log).slice(1)).toEqual(['input:48.85,2.29:search', 'change:48.85,2.29:search']);
    expect(google.stats.fetchFieldsCalls).toEqual([]);
    expect(google.stats.geocoderRequests).toEqual([]);
    // Text that is not a coordinate is Google's.
    const text = Object.assign(
      new Event('paste', { bubbles: true, composed: true, cancelable: true }),
      {
        clipboardData: { getData: () => 'Eiffel Tower' },
      },
    );
    element.input.dispatchEvent(text);
    expect(text.defaultPrevented).toBe(false);
  });

  it('gmp-error reports GEOCODER_FAILED', async () => {
    spyConsole();
    const google = install({ mode: 'importLibrary', placesFail: true });
    const p = picker({ provider: googleProvider(), search: true });
    const log = record(p);
    await p.ready;
    await box();
    await google.selectPlace({ ...EIFFEL, formattedAddress: 'x' });
    expect(codes(log)).toEqual(['GEOCODER_FAILED']);
    expect(p.value).toBe('');
  });

  it('a classic page without places: GEOCODER_FAILED with a libraries=places fix', async () => {
    spyConsole();
    install({ mode: 'classic' });
    const p = picker({ provider: googleProvider(), search: true });
    const log = record(p);
    await p.ready;
    await waitFor(() => errors(log).length, 1000, 'an error');
    expect(codes(log)).toEqual(['GEOCODER_FAILED']);
    expect(errors(log)[0]?.fix).toContain('libraries=places');
  });

  it('the search box goes away with the picker', async () => {
    install({ mode: 'importLibrary' });
    const p = picker({ provider: googleProvider(), search: true });
    await p.ready;
    const element = await box();
    p.destroy();
    expect(element.isConnected).toBe(false);
  });
});

describe('WP3-13: googleGeocoder', () => {
  it('pairsWith is ["google"]', () => {
    expect(googleGeocoder().pairsWith).toEqual(['google']);
  });

  it('reverse uses Geocoder.geocode({ location }) and fires addresschange', async () => {
    const google = install({ mode: 'classic' });
    const p = picker({
      provider: googleProvider(),
      value: '48.8584,2.2945',
      reverseGeocode: true,
      lang: 'de',
    });
    const log = record(p);
    await p.ready;
    await waitFor(() => addressDetails(log).length, 2000, 'addresschange');
    expect(google.stats.geocoderRequests).toEqual([
      { location: { lat: 48.8584, lng: 2.2945 }, language: 'de' },
    ]);
    expect(p.address).toBe(googleAddressAt({ lat: 48.8584, lng: 2.2945 }));
    expect(addressDetails(log)[0]?.result?.id).toBe('reverse-place-id');
  });

  it("geocode('x') uses { address }, through importLibrary('geocoding') on bootstrap pages", async () => {
    const google = install({ mode: 'importLibrary' });
    const p = picker({ provider: googleProvider({ region: 'FR' }), lang: 'en' });
    await p.ready;
    const [best] = await p.geocode('Eiffel Tower');
    expect(google.stats.importedLibraries).toContain('geocoding');
    expect(google.stats.geocoderRequests).toEqual([
      { address: 'Eiffel Tower', language: 'en', region: 'FR' },
    ]);
    expect(best).toMatchObject({ lat: 48.8584, lng: 2.2945, id: 'search-place-id' });
    expect(best?.bounds?.north).toBeGreaterThan(48.8584);
    expect(await p.geocode('nowhere at all')).toEqual([]);
  });

  it('a failing geocode rejects GEOCODER_FAILED', async () => {
    install({ mode: 'classic' });
    const geocoder = googleGeocoder();
    vi.spyOn(
      Object.getPrototypeOf(new (must(globalThis.google?.maps.Geocoder))()),
      'geocode',
    ).mockRejectedValue(new Error('REQUEST_DENIED'));
    const p = picker({ provider: googleProvider(), geocoder });
    await p.ready;
    await expect(p.geocode('Eiffel Tower')).rejects.toMatchObject({ code: 'GEOCODER_FAILED' });
  });
});

describe('WP3-14: pairing', () => {
  it('photonGeocoder on google: GEOCODER_MISMATCH and no search box', async () => {
    spyConsole();
    const google = install({ mode: 'importLibrary' });
    const p = picker({ provider: googleProvider(), geocoder: photonGeocoder(), search: true });
    const log = record(p);
    await p.ready;
    await sleep(20);
    expect(codes(log)).toEqual(['GEOCODER_MISMATCH']);
    expect(document.querySelector('gmp-place-autocomplete')).toBeNull();
    expect(google.stats.placeAutocompleteCtorCalls).toBe(0);
  });

  it('googleGeocoder on leaflet: GEOCODER_MISMATCH', async () => {
    spyConsole();
    const leaflet = createFakeAdapter({ name: 'leaflet' });
    const p = picker({ provider: leaflet.adapter, geocoder: googleGeocoder(), search: true });
    const log = record(p);
    await p.ready;
    await sleep(20);
    expect(codes(log)).toEqual(['GEOCODER_MISMATCH']);
    await expect(p.geocode('x')).rejects.toMatchObject({ code: 'GEOCODER_MISSING' });
  });

  it('a custom geocoder without pairsWith works on google', async () => {
    install({ mode: 'importLibrary' });
    const search = vi.fn<Geocoder['search'] & {}>(async () => [{ lat: 1, lng: 2, label: 'Mine' }]);
    const p = picker({ provider: googleProvider(), geocoder: { search }, search: true });
    const log = record(p);
    await p.ready;
    expect(await p.geocode('x')).toEqual([{ lat: 1, lng: 2, label: 'Mine' }]);
    await waitFor(() => document.querySelector('gmp-place-autocomplete'), 2000, 'the search box');
    expect(codes(log)).toEqual([]);
  });

  it('a switch inside the 700 ms announce window cancels the pending Google announcement', async () => {
    const google = install({ mode: 'importLibrary' });
    const element = target();
    const { core, root } = shadowPicker(element, {
      provider: erased(googleProvider()),
      search: true,
    });
    await core.ready;
    await waitFor(() => root.querySelector('gmp-place-autocomplete'), 2000, 'search');
    await google.selectPlace({ ...EIFFEL, formattedAddress: 'Eiffel Tower, Paris' });
    core.update({ provider: erased(createFakeAdapter({ name: 'leaflet' }).adapter) });
    await sleep(750);
    expect(must(root.querySelector('[aria-live="polite"]')).textContent).not.toContain('Eiffel');
    core.destroy();
  });

  it('provider switch google -> leaflet clears the Google address; Photon looks it up after ready, and back', async () => {
    const google = install({ mode: 'importLibrary' });
    const photon = stubPhoton();
    const leaflet = createFakeAdapter({ name: 'leaflet' });
    leaflet.adapter.geocoder = photonGeocoder();
    const element = document.createElement('div');
    element.style.cssText = 'display:block;width:320px;height:240px';
    const addressInput = document.createElement('input');
    document.body.append(element, addressInput);
    const { core, root } = shadowPicker(element, {
      provider: erased(googleProvider()),
      search: true,
      reverseGeocode: true,
      addressInput,
    });
    const log = record(element);
    const live = (): string => must(root.querySelector('[aria-live="polite"]')).textContent ?? '';
    await core.ready;
    await waitFor(
      () => element.shadowRoot?.querySelector('gmp-place-autocomplete'),
      2000,
      'search',
    );
    await google.selectPlace({ ...EIFFEL, formattedAddress: 'Eiffel Tower, Paris' });
    expect(core.snapshot.address).toBe('Eiffel Tower, Paris');
    expect(addressInput.value).toBe('Eiffel Tower, Paris');
    await sleep(750);
    expect(live()).toContain('Eiffel Tower, Paris');
    core.update({ provider: erased(leaflet.adapter) });
    await Promise.resolve();
    expect(core.snapshot.address).toBeNull();
    expect(core.snapshot.value).toBe('48.85837,2.294481');
    // No Google content stays next to a non-Google map: not in the bound input, not in the live region.
    expect(addressInput.value).toBe('');
    expect(live()).not.toContain('Eiffel Tower, Paris');
    await core.ready;
    await waitFor(() => photon.urls.length, 2000, 'a Photon reverse request');
    expect(photon.urls.map((url) => url.pathname)).toEqual(['/reverse']);
    await waitFor(() => addressDetails(log).length == 2, 2000, 'the Photon addresschange');
    const osm = core.snapshot.address;
    expect(osm).not.toContain('Eiffel Tower, Paris');
    expect(osm).toBeTruthy();
    // And back: the Photon address goes, the Google Geocoder answers.
    core.update({ provider: erased(googleProvider()) });
    await Promise.resolve();
    expect(core.snapshot.address).toBeNull();
    await core.ready;
    await waitFor(() => addressDetails(log).length == 3, 2000, 'the Google addresschange');
    expect(core.snapshot.address).toBe(googleAddressAt(EIFFEL));
    expect(google.stats.geocoderRequests).toHaveLength(1);
    core.destroy();
  });
});
