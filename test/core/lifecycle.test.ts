import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ProviderAdapter, ProviderName } from '../../src/core.js';
import { LocationPicker } from '../../src/core.js';
import { BUILTIN_PROVIDERS, erased } from '../../src/core/providers.js';
import { createFakeAdapter, type FakeControl } from '../fixtures/fake-adapter.js';
import {
  byId,
  details,
  errors,
  flush,
  mountPicker,
  position,
  positionError,
  query,
  record,
  resetStore,
  spyConsole,
  stubGeolocation,
  summary,
  unstubGeolocation,
} from './helpers.js';

beforeEach(() => resetStore());
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  unstubGeolocation();
  Reflect.deleteProperty(globalThis, 'google');
});

const provider = (): ProviderAdapter => erased(createFakeAdapter().adapter);

/** Constructs with options built at runtime (untyped callers pass anything). */
async function resolvedProvider(
  options: object,
  mapOptions?: Record<string, unknown>,
): Promise<string> {
  const picker: LocationPicker = Reflect.construct(LocationPicker, [
    '#map',
    options,
    ...(mapOptions ? [mapOptions] : []),
  ]);
  await picker.ready;
  return picker.provider;
}

describe('WP2-05 target resolution', () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="map"></div><section class="box"></section>';
  });

  it('accepts an id, a #selector, any selector and an element', () => {
    const map = byId('map');
    expect(new LocationPicker('map', { provider: provider() }).element).toBe(map);
    expect(new LocationPicker('#map', { provider: provider() }).element).toBe(map);
    expect(new LocationPicker('section.box', { provider: provider() }).element).toBe(
      document.querySelector('section'),
    );
    expect(new LocationPicker(map, { provider: provider() }).element).toBe(map);
  });

  it('a missing target throws TARGET_NOT_FOUND with a fix', () => {
    for (const target of ['nope', '#nope', '[[bad', null]) {
      expect(() => Reflect.construct(LocationPicker, [target])).toThrow(
        expect.objectContaining({
          code: 'TARGET_NOT_FOUND',
          fix: expect.stringMatching(/id .*selector/),
        }),
      );
    }
  });

  it('a <location-picker> target throws INVALID_OPTION', () => {
    const element = document.createElement('location-picker');
    document.body.append(element);
    expect(() => new LocationPicker(element)).toThrow(
      expect.objectContaining({
        code: 'INVALID_OPTION',
        message: expect.stringContaining('Use its properties and events'),
      }),
    );
  });
});

describe('WP2-06 re-construct guard', () => {
  it('destroys the previous instance on the same target', () => {
    const { picker, fake, target } = mountPicker();
    const second = new LocationPicker(target, { provider: createFakeAdapter().adapter });
    expect(fake.calls.destroy).toBe(1);
    expect(target.querySelectorAll('.lp-base')).toHaveLength(1);
    expect(second.container.isConnected).toBe(true);
    expect(picker.container.isConnected).toBe(false);
    picker.destroy();
    expect(fake.calls.destroy).toBe(1);
    expect(target.querySelectorAll('.lp-base')).toHaveLength(1);
  });
});

describe('WP2-07 provider resolution (fakes injected into BUILTIN_PROVIDERS)', () => {
  let fakes: Record<ProviderName, FakeControl>;
  beforeEach(() => {
    document.body.innerHTML = '<div id="map"></div>';
    fakes = {
      leaflet: createFakeAdapter({ name: 'leaflet' }),
      google: createFakeAdapter({ name: 'google' }),
      maplibre: createFakeAdapter({ name: 'maplibre' }),
    };
    for (const name of ['leaflet', 'google', 'maplibre'] as const) {
      vi.spyOn(BUILTIN_PROVIDERS, name).mockImplementation(async () => erased(fakes[name].adapter));
    }
  });
  const resolved = resolvedProvider;

  it.each<[object, ProviderName]>([
    [{}, 'leaflet'],
    [{ apiKey: 'k' }, 'google'],
    [{ mapId: 'm' }, 'google'],
    [{ marker: 'advanced' }, 'google'],
    [{ useAdvancedMarker: true }, 'google'],
    [{ provider: 'leaflet', apiKey: 'k' }, 'leaflet'],
    [{ lat: 1, lng: 2 }, 'leaflet'],
    [{ provider: 'maplibre' }, 'maplibre'],
  ])('%j -> %s', async (options, name) => {
    spyConsole();
    expect(await resolved(options)).toBe(name);
    expect(fakes[name].mountCount).toBe(1);
  });

  it('a 3rd constructor argument selects google with one deprecation warning', async () => {
    const log = spyConsole();
    expect(await resolved({}, { zoom: 3 })).toBe('google');
    expect(log.warn).toHaveBeenCalledTimes(1);
    expect(log.warn.mock.calls[0]?.[0]).toContain('3rd constructor argument is deprecated');
    expect(fakes.google.ctx?.options.mapOptions).toEqual({ zoom: 3 });
  });

  it('{provider: "osm"} -> leaflet with a warning', async () => {
    const log = spyConsole();
    expect(await resolved({ provider: 'osm' })).toBe('leaflet');
    expect(log.warn).toHaveBeenCalledWith(expect.stringContaining('provider "osm" is an alias'));
  });

  it('{provider: "bing"} -> INVALID_OPTION error event, ready rejects, no map', async () => {
    const log = spyConsole();
    const picker: LocationPicker = Reflect.construct(LocationPicker, [
      '#map',
      { provider: 'bing' },
    ]);
    const events = record(picker);
    await expect(picker.ready).rejects.toMatchObject({ code: 'INVALID_OPTION', level: 'error' });
    await flush();
    expect(errors(events).map((e) => e.code)).toEqual(['INVALID_OPTION']);
    expect(picker.map).toBeUndefined();
    expect(log.error).toHaveBeenCalledTimes(1);
    expect(Object.values(fakes).map((f) => f.mountCount)).toEqual([0, 0, 0]);
  });

  it('a loaded google.maps with 3 pickers -> leaflet and exactly one console.info', async () => {
    const log = spyConsole();
    vi.stubGlobal('google', { maps: {} });
    document.body.innerHTML = '<div id="a"></div><div id="b"></div><div id="c"></div>';
    const pickers = ['#a', '#b', '#c'].map((id) => new LocationPicker(id));
    await Promise.all(pickers.map((p) => p.ready));
    expect(pickers.map((p) => p.provider)).toEqual(['leaflet', 'leaflet', 'leaflet']);
    expect(log.info).toHaveBeenCalledTimes(1);
    expect(log.info.mock.calls[0]?.[0]).toContain(
      'google.maps is loaded but no provider was chosen',
    );
  });

  it('a failing lazy import becomes ENGINE_LOAD_FAILED', async () => {
    spyConsole();
    vi.spyOn(BUILTIN_PROVIDERS, 'leaflet').mockRejectedValue(
      new TypeError('Failed to fetch dynamically imported module'),
    );
    const picker = new LocationPicker('#map');
    await expect(picker.ready).rejects.toMatchObject({
      code: 'ENGINE_LOAD_FAILED',
      cause: expect.any(TypeError),
    });
  });
});

describe('WP2-10 unset model', () => {
  it('starts unset on the library-owned wrapper, never on the target', () => {
    const { picker, target } = mountPicker();
    expect(picker.value).toBe('');
    expect(picker.valueAsLatLng).toBeNull();
    expect(target.querySelector('.lp-base')!.classList.contains('lp-is-unset')).toBe(true);
    expect([...target.classList]).toEqual(['location-picker']);
  });

  it('getMarkerPosition() while unset returns the view centre and warns once; none once set', async () => {
    const log = spyConsole();
    const { picker } = mountPicker();
    await picker.ready;
    expect(picker.getMarkerPosition()).toEqual({ lat: 20, lng: 0 });
    picker.getMarkerPosition();
    picker.getMarkerPosition();
    expect(log.warn).toHaveBeenCalledTimes(1);
    expect(log.warn.mock.calls[0]?.[0]).toContain('read valueAsLatLng');
    picker.setLocation(1, 2);
    expect(picker.getMarkerPosition()).toEqual({ lat: 1, lng: 2 });
    resetStore();
    picker.getMarkerPosition();
    expect(log.warn).toHaveBeenCalledTimes(1);
  });

  it('Enter (or Space) on the map region commits the centre (user)', async () => {
    const { picker, fake, log } = mountPicker({ center: '33.8938,35.5018' });
    await picker.ready;
    // The centre as last reported: an engine that re-derives its own from whole pixels (Leaflet after a resize,
    // found by e2e/core.spec.ts) without moving does not shift the commit.
    fake.handle!.map.center = { lat: 33.893809, lng: 35.501812 };
    picker.container.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }),
    );
    expect(summary(log)).toEqual([
      'ready',
      'input:33.8938,35.5018:user',
      'change:33.8938,35.5018:user',
    ]);
    picker.container.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
    expect(details(log, 'change')).toHaveLength(1);
  });

  it('the confirm button shows only while unset with a given center, and hides after the commit', async () => {
    const plain = mountPicker();
    expect(query(plain.target, '.lp-confirm', HTMLButtonElement).hidden).toBe(true);
    const { picker, target, log } = mountPicker({ center: '33.8938,35.5018' });
    await picker.ready;
    const confirm = query(target, '.lp-confirm', HTMLButtonElement);
    expect(confirm.hidden).toBe(false);
    expect(confirm.textContent).toBe('Use this location');
    confirm.click();
    expect(details(log, 'change')).toEqual([
      expect.objectContaining({ value: '33.8938,35.5018', source: 'user' }),
    ]);
    expect(confirm.hidden).toBe(true);
  });

  it('zoom never leaves unset', async () => {
    const { picker, fake, log } = mountPicker({ center: '1,1' });
    await picker.ready;
    await fake.userZoom(3);
    picker.zoom = 4;
    await flush();
    expect(picker.value).toBe('');
    expect(picker.zoom).toBe(4);
    expect(summary(log)).toEqual(['ready']);
    expect(picker.element.querySelector('.lp-is-unset')).not.toBeNull();
  });
});

describe('WP2-12 geolocation (stubbed)', () => {
  it('success commits at max(current, 17); setCurrentPosition() keeps the zoom', async () => {
    stubGeolocation((success) => success(position(48.8584, 2.2945)));
    const { picker, log } = mountPicker({ zoom: 5 });
    await picker.ready;
    await picker.locate();
    expect(picker.zoom).toBe(17);
    picker.zoom = 19;
    stubGeolocation((success) => success(position(1, 2)));
    await picker.locate();
    expect(picker.zoom).toBe(19);
    picker.zoom = 6;
    stubGeolocation((success) => success(position(3, 4)));
    const detail = await picker.setCurrentPosition();
    expect(detail).toMatchObject({ value: '3,4', source: 'geolocation', zoom: 6 });
    expect(details(log, 'change').map((d) => d.source)).toEqual([
      'geolocation',
      'geolocation',
      'geolocation',
    ]);
  });

  it.each([
    [1, 'GEOLOCATION_DENIED'],
    [2, 'GEOLOCATION_UNAVAILABLE'],
    [3, 'GEOLOCATION_TIMEOUT'],
  ])('error code %i -> %s with the stub as cause', async (code, expected) => {
    const failure = positionError(code);
    stubGeolocation((_, fail) => fail?.(failure));
    const { picker } = mountPicker();
    const error: unknown = await picker.locate().catch((e: unknown) => e);
    expect(error).toMatchObject({ code: expected, cause: failure });
    expect(failure instanceof Error).toBe(false);
  });

  it('a callback that never fires rejects GEOLOCATION_TIMEOUT at timeout + 30000 ms', async () => {
    vi.useFakeTimers();
    stubGeolocation(() => {});
    const { picker } = mountPicker({ geolocation: { timeout: 5000 } });
    const settled = vi.fn<(value: unknown) => void>();
    picker.locate().then(settled, settled);
    await vi.advanceTimersByTimeAsync(34_999);
    expect(settled).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(settled).toHaveBeenCalledWith(expect.objectContaining({ code: 'GEOLOCATION_TIMEOUT' }));
  });

  it('isSecureContext=false gives UNSUPPORTED without calling the API', async () => {
    const api = stubGeolocation((success) => success(position(1, 1)));
    vi.stubGlobal('isSecureContext', false);
    const { picker } = mountPicker({ locate: 'button' });
    await expect(picker.locate()).rejects.toMatchObject({ code: 'GEOLOCATION_UNSUPPORTED' });
    expect(api).not.toHaveBeenCalled();
    expect(query(picker.element, '.lp-locate', HTMLButtonElement).hidden).toBe(true);
  });

  it('abort gives ABORTED and leaves the value unchanged', async () => {
    stubGeolocation(() => {});
    const { picker, log } = mountPicker({ value: '1,1' });
    const control = new AbortController();
    const pending = picker.locate({ signal: control.signal });
    control.abort();
    await expect(pending).rejects.toMatchObject({ code: 'ABORTED' });
    expect(picker.value).toBe('1,1');
    expect(errors(log)).toEqual([]);
  });

  it('a locate BUTTON failure fires an error event; a locate() method failure only rejects', async () => {
    const log = spyConsole();
    stubGeolocation((_, fail) => fail?.(positionError(1)));
    const { picker, target, log: events } = mountPicker({ locate: 'button' });
    await picker.ready;
    await expect(picker.locate()).rejects.toMatchObject({ code: 'GEOLOCATION_DENIED' });
    await flush();
    expect(errors(events)).toEqual([]);
    const button = query(target, '.lp-locate', HTMLButtonElement);
    expect(button.hidden).toBe(false);
    button.click();
    await flush();
    expect(errors(events).map((e) => e.code)).toEqual(['GEOLOCATION_DENIED']);
    expect(log.warn).toHaveBeenCalledTimes(1);
    expect(target.querySelector('.lp-hint')!.textContent).toBe('Location permission was denied.');
  });

  it('locate: "auto" tries once after ready when no value is set', async () => {
    const api = stubGeolocation((success) => success(position(5, 6)));
    const { picker, log } = mountPicker({ locate: 'auto' });
    await picker.ready;
    await flush();
    expect(api).toHaveBeenCalledTimes(1);
    expect(details(log, 'change')).toEqual([
      expect.objectContaining({ value: '5,6', source: 'geolocation' }),
    ]);
    const set = mountPicker({ locate: 'auto', value: '1,1' });
    await set.picker.ready;
    await flush();
    expect(api).toHaveBeenCalledTimes(1);
  });
});

describe('WP2-13 destroy()', () => {
  it('removes what the picker created and nothing of the user', async () => {
    const { picker, target } = mountPicker(
      {},
      {},
      '<div id="map" class="user" style="color: red"><p id="child">mine</p></div>',
    );
    expect(target.style.position).toBe('relative');
    expect(target.classList.contains('location-picker')).toBe(true);
    picker.destroy();
    expect(target.querySelector('.lp-base')).toBeNull();
    expect(target.className).toBe('user');
    expect(target.getAttribute('style')).toBe('color: red;');
    expect(target.querySelector('#child')?.textContent).toBe('mine');
  });

  it('keeps a user position and an existing location-picker class', () => {
    const { picker, target } = mountPicker(
      {},
      {},
      '<div id="map" class="location-picker" style="position: absolute"></div>',
    );
    expect(target.style.position).toBe('absolute');
    picker.destroy();
    expect(target.style.position).toBe('absolute');
    expect(target.classList.contains('location-picker')).toBe(true);
  });

  it('destroys the handle once, disconnects the ResizeObserver, rejects a pending locate() with ABORTED', async () => {
    const disconnect = vi.fn<() => void>();
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe(): void {}
        disconnect = disconnect;
      },
    );
    stubGeolocation(() => {});
    const { picker, fake } = mountPicker();
    await picker.ready;
    const pending = picker.locate();
    picker.destroy();
    picker.destroy();
    await expect(pending).rejects.toMatchObject({ code: 'ABORTED' });
    expect(fake.calls.destroy).toBe(1);
    expect(fake.handle!.map.destroyed).toBe(true);
    expect(disconnect).toHaveBeenCalledTimes(1);
  });

  it('aborting options.signal destroys', async () => {
    const control = new AbortController();
    const { picker, fake, target } = mountPicker({ signal: control.signal });
    await picker.ready;
    control.abort();
    expect(target.querySelector('.lp-base')).toBeNull();
    expect(fake.calls.destroy).toBe(1);
  });

  it('an already-aborted signal destroys right after construction', async () => {
    const { target } = mountPicker({ signal: AbortSignal.abort() });
    await flush();
    expect(target.querySelector('.lp-base')).toBeNull();
  });
});

describe('WP2-18 fallback coordinate input', () => {
  it('shows after a load failure and commits typed coordinates (user)', async () => {
    spyConsole();
    const { picker, target, log } = mountPicker({}, { failWith: 'ENGINE_LOAD_FAILED' });
    await picker.ready.catch(() => {});
    await flush();
    const fallback = query(target, '.lp-fallback', HTMLInputElement);
    const error = query(target, '.lp-error', HTMLElement);
    expect([fallback.hidden, error.hidden]).toEqual([false, false]);
    expect(error.textContent).toBe('The map could not be loaded. Type coordinates instead.');
    expect(fallback.getAttribute('aria-label')).toBe('Latitude, longitude');
    expect(target.querySelector('.lp-is-error')).not.toBeNull();
    fallback.value = '48.85, 2.29';
    fallback.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }),
    );
    fallback.dispatchEvent(new Event('change', { bubbles: true }));
    expect(picker.value).toBe('48.85,2.29');
    expect(details(log, 'change')).toEqual([
      expect.objectContaining({ value: '48.85,2.29', source: 'user' }),
    ]);
  });
});

describe('geolocation failures that are not GeolocationPositionErrors', () => {
  it('map to GEOLOCATION_UNAVAILABLE, never a geocoder code', async () => {
    stubGeolocation(() => {
      throw new TypeError('the API threw');
    });
    const { picker } = mountPicker();
    await expect(picker.locate()).rejects.toMatchObject({
      code: 'GEOLOCATION_UNAVAILABLE',
      cause: expect.any(TypeError),
    });
  });
});
