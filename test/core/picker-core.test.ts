// PickerCore through a hand-made CoreHost in 'element' mode (the surface WP4 builds on): remounts, silent writes,
// snapshots, states, search and geocoding orchestration.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  GeocodeResult,
  Geocoder,
  LocationPickerOptions,
  SearchContext,
} from '../../src/core.js';
import { LocationPickerError } from '../../src/core.js';
import { resolveConfig } from '../../src/core/config.js';
import { PickerCore } from '../../src/core/picker-core.js';
import { erased, SEARCH_UI } from '../../src/core/providers.js';
import type * as C from '../../src/internal/contracts.js';
import type {
  CoreHost,
  PickerSnapshot,
  ResolvedConfig,
  SnapshotCause,
} from '../../src/internal/contracts.js';
import { createFakeAdapter, type FakeControl } from '../fixtures/fake-adapter.js';
import {
  addressDetails,
  details,
  errors,
  flush,
  inputById,
  must,
  record,
  resetStore,
  spyConsole,
  summary,
} from './helpers.js';

beforeEach(() => resetStore());
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

interface Harness {
  readonly core: PickerCore;
  readonly element: HTMLElement;
  readonly states: Set<string>;
  readonly snapshots: [SnapshotCause, PickerSnapshot][];
  readonly fake: FakeControl;
  readonly log: ReturnType<typeof record>;
}

/** An element-mode core, as WP4's element creates it (shadow root render/style root, light-DOM lookup root). */
function elementCore(
  options: LocationPickerOptions = {},
  html = '<x-picker id="el"></x-picker>',
  fake = createFakeAdapter(),
): Harness {
  document.body.innerHTML = html;
  const element = document.getElementById('el')!;
  const root = element.attachShadow({ mode: 'open' });
  const states = new Set<string>();
  const snapshots: [SnapshotCause, PickerSnapshot][] = [];
  const host: CoreHost = {
    mode: 'element',
    host: element,
    renderRoot: root,
    styleRoot: root,
    lookupRoot: document,
    eventTarget: element,
    setState: (name, on) => void (on ? states.add(name) : states.delete(name)),
    onSnapshot: (snapshot, cause) => void snapshots.push([cause, snapshot]),
  };
  const { config } = resolveConfig(
    { provider: erased(fake.adapter), ...options },
    { mode: 'element', host: element },
  );
  const log = record(element);
  const core = new PickerCore(host, config);
  return { core, element, states, snapshots, fake, log };
}

const causes = (h: Harness): SnapshotCause[] => h.snapshots.map(([cause]) => cause);
type Reverse = NonNullable<Geocoder['reverse']>;
type Search = NonNullable<Geocoder['search']>;
const result = (lat: number, lng: number, extra: Partial<GeocodeResult> = {}): GeocodeResult => ({
  lat,
  lng,
  label: 'Eiffel Tower',
  address: 'Champ de Mars, Paris',
  ...extra,
});

describe('rendering and states', () => {
  it('renders one template with parts and slots into the shadow root, synchronously, before mount()', () => {
    const { core, element, states } = elementCore();
    const root = element.shadowRoot!;
    expect(root.querySelector('[part="base"]')).toBe(core.refs.base);
    expect([...root.querySelectorAll('[part]')].map((n) => n.getAttribute('part'))).toEqual([
      'base',
      'search',
      'map',
      'pin',
      'pin-icon',
      'pin-shadow',
      'confirm-button',
      'controls',
      'locate-button',
      'hint',
      'error-message',
      'fallback',
    ]);
    expect([...root.querySelectorAll('slot')].map((s) => s.name)).toEqual([
      'marker',
      'controls',
      'error',
    ]);
    expect(core.refs.map.getAttribute('aria-describedby')).toBe(core.refs.instructions.id);
    expect(element.childNodes).toHaveLength(0);
    expect([...states].toSorted()).toEqual(['loading', 'unset']);
    expect(core.refs.base.classList.contains('lp-is-unset')).toBe(true);
    expect(core.handle).toBeUndefined();
  });

  it('mount() resolves ready with the handle and fires the ready event in a microtask', async () => {
    const { core, states, log, snapshots } = elementCore({ value: '1,2' });
    core.mount();
    expect(core.handle).toBeDefined();
    expect(log).toEqual([]);
    expect(await core.ready).toBe(core.handle);
    await flush();
    expect(summary(log)).toEqual(['ready']);
    expect([...states].toSorted()).toEqual(['ready']);
    expect(snapshots.at(-1)?.[1]).toMatchObject({
      value: '1,2',
      phase: 'ready',
      provider: 'fake',
      map: core.handle?.map,
    });
  });
});

describe('remounts (update)', () => {
  it('coalesce per microtask, replace ready synchronously, keep the coordinates and fire ready again', async () => {
    const h = elementCore({ value: '1,2' });
    h.core.mount();
    await h.core.ready;
    const before = h.core.ready;
    const second = createFakeAdapter({ name: 'fake' });
    h.core.update({ provider: erased(second.adapter) });
    expect(h.core.ready).not.toBe(before);
    const replaced = h.core.ready;
    h.core.update({ mapOptions: { a: 1 } });
    h.core.update({ engineUrl: '/leaflet.js' });
    expect(h.core.ready).toBe(replaced);
    await replaced;
    await flush();
    expect([h.fake.mountCount, second.mountCount]).toEqual([1, 1]);
    expect(h.fake.calls.destroy).toBe(1);
    expect(second.ctx?.view.center).toEqual({ lat: 1, lng: 2 });
    expect(second.ctx?.options.mapOptions).toEqual({ a: 1 });
    expect(summary(h.log)).toEqual(['ready', 'ready']);
    expect(h.core.snapshot.value).toBe('1,2');
  });

  it('a provider NAME change clears the address silently and looks it up again with the new pair', async () => {
    const google = createFakeAdapter({ name: 'google' });
    const reverse = vi.fn<Reverse>(async (at) => ({
      ...at,
      label: 'G address',
    }));
    google.adapter.geocoder = { pairsWith: ['google'], reverse };
    const h = elementCore({ value: '1,2', reverseGeocode: true }, undefined, google);
    h.core.mount();
    await h.core.ready;
    await new Promise((r) => setTimeout(r, 450));
    expect(h.core.snapshot.address).toBe('G address');
    const leaflet = createFakeAdapter({ name: 'leaflet', loadDelayMs: 30 });
    const photon = vi.fn<Reverse>(async (at) => ({
      ...at,
      label: 'OSM address',
    }));
    leaflet.adapter.geocoder = { pairsWith: ['leaflet', 'maplibre'], reverse: photon };
    h.core.update({ provider: erased(leaflet.adapter) });
    await Promise.resolve(); // the remount microtask, long before the new engine loads
    expect(h.core.snapshot.address).toBeNull();
    expect(causes(h)).toContain('address');
    expect(addressDetails(h.log).map((d) => d.address)).toEqual(['G address']);
    await new Promise((r) => setTimeout(r, 450));
    expect(photon).toHaveBeenCalledTimes(1);
    expect(addressDetails(h.log).map((d) => d.address)).toEqual(['G address', 'OSM address']);
    expect(h.core.snapshot.value).toBe('1,2');
  });

  it('a remount that keeps the provider name keeps the address', async () => {
    const h = elementCore({ value: '1,2' });
    h.core.mount();
    await h.core.ready;
    h.core.writeValue({ lat: 1, lng: 2 }, { dirty: true, cause: 'restore', address: 'Kept' });
    h.core.update({
      mapOptions: { b: 2 },
      provider: erased(createFakeAdapter({ name: 'fake' }).adapter),
    });
    await h.core.ready;
    expect(h.core.snapshot.address).toBe('Kept');
  });

  it('live provider options go through an optional handle.update instead of a remount', async () => {
    spyConsole();
    const h = elementCore();
    h.core.mount();
    await h.core.ready;
    h.core.update({
      tileUrl: 'https://tiles.example/{z}/{x}/{y}.png',
      tileUrlGiven: true,
      attribution: '© Example',
    });
    await flush();
    expect(h.fake.mountCount).toBe(1);
    expect(h.fake.calls.updates).toEqual([
      [
        expect.objectContaining({
          tileUrl: 'https://tiles.example/{z}/{x}/{y}.png',
          attribution: '© Example',
        }),
        'auto',
      ],
    ]);
  });

  it('disabled/readOnly, marker and locate apply live', async () => {
    const h = elementCore({ value: '1,2' });
    h.core.mount();
    await h.core.ready;
    h.core.update({ disabled: true });
    expect(h.fake.handle?.map.interactive).toBe('none');
    expect(h.core.refs.fallback.disabled).toBe(true);
    h.core.update({ disabled: false, readOnly: true });
    expect(h.fake.handle?.map.interactive).toBe('zoom-only');
    h.core.update({ marker: 'none' });
    expect(h.core.refs.pin.hidden).toBe(true);
    h.core.update({ marker: 'pin' });
    expect(h.core.refs.pin.hidden).toBe(false);
    expect(h.fake.mountCount).toBe(1);
  });

  it('precision re-formats the value silently', async () => {
    const h = elementCore({ value: '1.123456,2.654321' });
    h.core.mount();
    await h.core.ready;
    h.core.update({ precision: 2 });
    expect(h.core.snapshot.value).toBe('1.12,2.65');
    expect(causes(h).at(-1)).toBe('write');
    await flush();
    expect(summary(h.log)).toEqual(['ready']);
  });
});

describe('silent writes (writeValue)', () => {
  it('write, reset and restore dispatch nothing on the host or on bound inputs, and onSnapshot still runs', async () => {
    const html =
      '<x-picker id="el"><input id="lat" value="5"><input id="lng" value="6"></x-picker>';
    const h = elementCore({ latInput: 'lat', lngInput: 'lng' }, html);
    const native: string[] = [];
    for (const id of ['lat', 'lng']) {
      document.getElementById(id)!.addEventListener('input', () => native.push(id));
      document.getElementById(id)!.addEventListener('change', () => native.push(id));
    }
    h.core.mount();
    expect(h.core.snapshot.value).toBe('5,6');
    expect(h.core.seedDefault).toEqual({ lat: 5, lng: 6 });
    await h.core.ready;
    h.core.writeValue({ lat: 7, lng: 8 }, { dirty: true, cause: 'write' });
    h.core.writeValue(null, { dirty: false, cause: 'reset' });
    h.core.writeValue(
      { lat: 9, lng: 10 },
      { dirty: true, cause: 'restore', zoom: 11, address: 'Restored' },
    );
    await flush();
    expect(native).toEqual([]);
    expect(summary(h.log)).toEqual(['ready']);
    expect(causes(h).slice(-3)).toEqual(['write', 'reset', 'restore']);
    expect(h.core.snapshot).toMatchObject({
      value: '9,10',
      zoom: 11,
      address: 'Restored',
      dirty: true,
    });
    expect(inputById('lat').value).toBe('9');
  });

  it('a reset to an empty value clears interacted and returns the view to center/zoom', async () => {
    const h = elementCore({ center: '3,4', zoom: 9 });
    h.core.mount();
    await h.core.ready;
    h.core.setLocation({ lat: 1, lng: 2 }, { zoom: 14 });
    expect(h.core.snapshot.interacted).toBe(true);
    h.core.writeValue(null, { dirty: false, cause: 'reset' });
    expect(h.core.snapshot).toMatchObject({ value: '', interacted: false, dirty: false, zoom: 9 });
    expect(h.fake.handle?.map.center).toEqual({ lat: 3, lng: 4 });
    expect(h.core.refs.confirm.hidden).toBe(false);
  });

  it('nested bound inputs of an element get non-bubbling native events (D18)', async () => {
    const html = '<x-picker id="el"><input id="lat"><input id="lng"></x-picker><input id="loc">';
    const h = elementCore({ latInput: 'lat', lngInput: 'lng', valueInput: 'loc' }, html);
    const bubbled: string[] = [];
    document.addEventListener(
      'change',
      (e) => bubbled.push(e.target instanceof Element ? e.target.id : '?'),
      true,
    );
    const host: string[] = [];
    h.element.addEventListener('change', (e) =>
      host.push(e instanceof CustomEvent ? 'custom' : 'native'),
    );
    h.core.mount();
    await h.core.ready;
    h.core.setLocation({ lat: 1, lng: 2 });
    expect(bubbled).toEqual(['loc', 'lat', 'lng', 'el']);
    expect(host).toEqual(['custom']);
  });

  it('markInteracted sets the state once', () => {
    const h = elementCore();
    h.core.markInteracted();
    h.core.markInteracted();
    expect(h.states.has('interacted')).toBe(true);
    expect(causes(h)).toEqual(['write']);
  });
});

describe('engine variants', () => {
  it('an adapter that draws its marker hides the CSS pin; a11y "engine" leaves the region to the engine', async () => {
    const fake = createFakeAdapter({ drawsMarker: true });
    const mount = fake.adapter.mount.bind(fake.adapter);
    fake.adapter.mount = (ctx) => Object.assign(mount(ctx), { a11y: 'engine' as const });
    const h = elementCore({}, undefined, fake);
    h.core.mount();
    await h.core.ready;
    expect(h.core.refs.pin.hidden).toBe(true);
    expect(h.core.refs.map.hasAttribute('role')).toBe(false);
    expect(h.core.refs.map.getAttribute('aria-label')).toBe('Location picker');
  });

  it('an async adapter: loading state, the camera written meanwhile is applied at mount', async () => {
    const h = elementCore({}, undefined, createFakeAdapter({ sync: false, loadDelayMs: 10 }));
    h.core.mount();
    expect(h.states.has('loading')).toBe(true);
    h.core.writeValue({ lat: 7, lng: 8 }, { dirty: true, cause: 'write' });
    h.core.setZoom(12);
    await h.core.ready;
    expect(h.fake.ctx?.view).toMatchObject({ center: { lat: 7, lng: 8 }, zoom: 12 });
    expect(h.states.has('ready')).toBe(true);
  });
});

describe('search and geocoding orchestration', () => {
  it('a provider search UI gets a SearchContext; a pick commits (search) with the address, then addresschange', async () => {
    let search: SearchContext | undefined;
    const fake = createFakeAdapter();
    fake.adapter.createSearch = (ctx) => {
      search = ctx;
      const element = document.createElement('input');
      ctx.slot.append(element);
      return { element, focus() {}, clear() {}, destroy: () => element.remove() };
    };
    const h = elementCore({ search: true, placeholder: 'Where?' }, undefined, fake);
    h.core.mount();
    await h.core.ready;
    await flush();
    expect(search).toMatchObject({
      placeholder: 'Where?',
      label: 'Search for a place or paste coordinates',
    });
    expect(search?.slot).toBe(h.core.refs.search);
    expect(h.core.refs.search.hidden).toBe(false);
    search!.select(result(48.8584, 2.2945));
    expect(h.core.snapshot).toMatchObject({
      value: '48.8584,2.2945',
      address: 'Champ de Mars, Paris',
      zoom: 17,
    });
    await flush();
    expect(summary(h.log)).toEqual([
      'ready',
      'input:48.8584,2.2945:search',
      'change:48.8584,2.2945:search',
      'addresschange',
    ]);
    expect(details(h.log, 'change')[0]).toMatchObject({
      address: 'Champ de Mars, Paris',
      place: { label: 'Eiffel Tower' },
    });
    // fitted to bounds while centred on the point
    Object.defineProperties(h.core.refs.map, {
      clientWidth: { value: 512 },
      clientHeight: { value: 512 },
    });
    search!.select(result(0, 0, { bounds: { south: -10, west: -10, north: 10, east: 10 } }));
    // 20° must fit 512 px: 256 * 2^z * 20 / 360 <= 512 at z = 5
    expect(h.core.snapshot.zoom).toBe(5);
    // inner native events are contained; Enter never submits
    const inner = h.core.refs.search.querySelector('input')!;
    const outer: string[] = [];
    h.element.addEventListener('input', (e) => outer.push(e.type));
    inner.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
    const enter = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
    inner.dispatchEvent(enter);
    expect(outer).toEqual([]);
    expect(enter.defaultPrevented).toBe(true);
  });

  it('the built-in combobox gets the tracked geocoder and the Photon options (>= 300 ms on the public URL)', async () => {
    const createCombobox = vi.fn<typeof C.createCombobox>((ctx) => {
      const element = document.createElement('div');
      ctx.slot.append(element);
      return { element, focus() {}, clear() {}, destroy() {} };
    });
    vi.spyOn(SEARCH_UI, 'load').mockResolvedValue({ createCombobox });
    const search = vi.fn<Search>(async () => [result(1, 2)]);
    const geocoder: Geocoder = Object.assign(
      { search },
      { url: 'https://photon.komoot.io/api', debounce: 50, minChars: 2 },
    );
    const h = elementCore({ search: true, geocoder });
    h.core.mount();
    await h.core.ready;
    await flush();
    expect(createCombobox).toHaveBeenCalledTimes(1);
    const [, tracked, options] = must(createCombobox.mock.calls[0]);
    expect(options).toMatchObject({ debounce: 300, minChars: 2, limit: 5 });
    const pending = tracked.search?.('x', {
      signal: AbortSignal.timeout(1000),
      near: { lat: 0, lng: 0 },
      limit: 5,
      lang: 'en',
    });
    expect(h.states.has('searching')).toBe(true);
    await pending;
    expect(h.states.has('searching')).toBe(false);
  });

  it('without the combobox chunk, search reports GEOCODER_FAILED once', async () => {
    spyConsole();
    const h = elementCore({ search: true, geocoder: { search: async () => [] } });
    h.core.mount();
    await h.core.ready;
    await flush();
    expect(errors(h.log).map((e) => e.code)).toEqual(['GEOCODER_FAILED']);
  });

  it('a mismatched geocoder pair is refused (GEOCODER_MISMATCH) and search stays off', async () => {
    spyConsole();
    const load = vi.spyOn(SEARCH_UI, 'load');
    const h = elementCore({
      search: true,
      geocoder: { pairsWith: ['google'], search: async () => [] },
    });
    h.core.mount();
    await h.core.ready;
    await flush();
    expect(errors(h.log).map((e) => e.code)).toEqual(['GEOCODER_MISMATCH']);
    expect(load).not.toHaveBeenCalled();
    await expect(h.core.geocode('paris')).rejects.toMatchObject({ code: 'GEOCODER_MISSING' });
  });

  it('geocode(): coordinates are answered offline; failures are GEOCODER_FAILED; geocoder:false is GEOCODER_MISSING', async () => {
    const search = vi.fn<Search>(async () => {
      throw new TypeError('network');
    });
    const h = elementCore({ geocoder: { search } });
    h.core.mount();
    expect(await h.core.geocode('48.8584, 2.2945')).toEqual([
      { lat: 48.8584, lng: 2.2945, label: '48.8584,2.2945' },
    ]);
    expect(search).not.toHaveBeenCalled();
    await expect(h.core.geocode('paris')).rejects.toMatchObject({
      code: 'GEOCODER_FAILED',
      cause: expect.any(TypeError),
    });
    const off = elementCore({ geocoder: false });
    off.core.mount();
    await expect(off.core.geocode('paris')).rejects.toMatchObject({ code: 'GEOCODER_MISSING' });
    await expect(off.core.lookupAddress({ lat: 1, lng: 2 })).rejects.toMatchObject({
      code: 'GEOCODER_MISSING',
    });
  });

  it('reverse geocoding: 400 ms debounce, a newer commit aborts the older request, cache hits at 5 dp', async () => {
    vi.useFakeTimers();
    const signals: AbortSignal[] = [];
    const reverse = vi.fn<Reverse>(async (at, { signal }) => {
      signals.push(signal);
      await new Promise((r) => setTimeout(r, 100));
      return { ...at, label: `at ${at.lat}` };
    });
    const h = elementCore({ reverseGeocode: true, geocoder: { reverse } });
    h.core.mount();
    await vi.advanceTimersByTimeAsync(0);
    h.core.setLocation({ lat: 1, lng: 1 });
    await vi.advanceTimersByTimeAsync(399);
    expect(reverse).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(reverse).toHaveBeenCalledTimes(1);
    h.core.setLocation({ lat: 2, lng: 2 });
    expect(signals[0]?.aborted).toBe(true);
    await vi.advanceTimersByTimeAsync(500);
    expect(addressDetails(h.log).map((d) => d.address)).toEqual(['at 2']);
    h.core.setLocation({ lat: 1.000001, lng: 1 });
    h.core.setLocation({ lat: 2.000001, lng: 2 }); // cached at 5 dp: known at commit time
    expect(details(h.log, 'change').at(-1)?.address).toBe('at 2');
    await vi.advanceTimersByTimeAsync(1000);
    expect(reverse).toHaveBeenCalledTimes(2);
  });

  it('a failing automatic reverse lookup reports GEOCODER_FAILED (warn) and keeps the address null', async () => {
    const log = spyConsole();
    const h = elementCore({
      reverseGeocode: true,
      geocoder: {
        reverse: async () => {
          throw new Error('503');
        },
      },
    });
    h.core.mount();
    await h.core.ready;
    h.core.setLocation({ lat: 1, lng: 2 });
    await new Promise((r) => setTimeout(r, 450));
    expect(errors(h.log)).toEqual([
      expect.objectContaining({ code: 'GEOCODER_FAILED', level: 'warn' }),
    ]);
    expect(h.core.snapshot.address).toBeNull();
    expect(log.warn).toHaveBeenCalledTimes(1);
  });

  it('lookupAddress(at) for another point does not touch the address', async () => {
    const h = elementCore({
      value: '1,2',
      geocoder: { reverse: async (at) => ({ ...at, label: `${at.lat}` }) },
    });
    h.core.mount();
    expect(await h.core.lookupAddress({ lat: 3, lng: 4 })).toMatchObject({ label: '3' });
    expect(h.core.snapshot.address).toBeNull();
    expect(await h.core.lookupAddress()).toMatchObject({ label: '1' });
    expect(h.core.snapshot.address).toBe('1');
    await expect(h.core.lookupAddress('nope')).rejects.toMatchObject({ code: 'INVALID_VALUE' });
  });
});

describe('the config type stays in sync', () => {
  it('ResolvedConfig keys used by update() exist', () => {
    const { config } = resolveConfig({}, { mode: 'element', host: document.createElement('div') });
    const keys: (keyof ResolvedConfig)[] = [
      'tileUrl',
      'attribution',
      'maxZoom',
      'gestureHandling',
      'precision',
    ];
    for (const key of keys) expect(key in config).toBe(true);
  });
});

describe('the MountContext handed to adapters', () => {
  it('describes the mount: container, root, view, interactivity, options, nonce and messages', async () => {
    const h = elementCore({
      value: '1,2',
      zoom: 9,
      readOnly: true,
      nonce: 'n9',
      lang: 'fr',
      mapOptions: { a: 1 },
    });
    h.core.mount();
    await h.core.ready;
    const ctx = must(h.fake.ctx);
    expect(ctx.container).toBe(h.core.refs.map);
    expect(ctx.root).toBe(h.element.shadowRoot);
    expect(ctx.view).toEqual({ center: { lat: 1, lng: 2 }, zoom: 9 });
    expect(ctx).toMatchObject({
      interactive: 'zoom-only',
      gestureHandling: 'auto',
      lang: 'fr',
      nonce: 'n9',
    });
    expect(ctx.options).toMatchObject({
      tileUrl: undefined,
      attribution: undefined,
      mapStyle: undefined,
      marker: 'pin',
      search: false,
      mapOptions: { a: 1 },
    });
    expect(Reflect.get(ctx, 'messages')).toMatchObject({
      cooperativeHint: expect.stringContaining('scroll to zoom'),
    });
    expect(['light', 'dark', 'auto']).toContain(ctx.colorScheme);
  });

  it('showHint shows a transient hint; report dispatches an error event; both stop after a remount', async () => {
    vi.useFakeTimers();
    spyConsole();
    const h = elementCore();
    h.core.mount();
    const ctx = must(h.fake.ctx);
    ctx.showHint('Use Ctrl + scroll to zoom the map');
    expect(h.core.refs.hint).toMatchObject({
      hidden: false,
      textContent: 'Use Ctrl + scroll to zoom the map',
    });
    await vi.advanceTimersByTimeAsync(1500);
    expect(h.core.refs.hint.hidden).toBe(true);
    const auth = new LocationPickerError('GOOGLE_AUTH_FAILED');
    ctx.report(auth);
    expect(errors(h.log)).toEqual([auth]);
    h.core.update({ mapOptions: { b: 1 } });
    await vi.advanceTimersByTimeAsync(0);
    ctx.report(auth);
    ctx.events.interactionStart();
    expect(errors(h.log)).toHaveLength(1);
    expect(h.states.has('dragging')).toBe(false);
  });
});

describe('update() before the first mount()', () => {
  it('applies the new config at mount without a remount or a replaced ready', async () => {
    const h = elementCore();
    const ready = h.core.ready;
    const other = createFakeAdapter({ name: 'other' });
    h.core.update({ provider: erased(other.adapter), mapOptions: { c: 3 } });
    expect(h.core.ready).toBe(ready);
    h.core.mount();
    await ready;
    expect([h.fake.mountCount, other.mountCount]).toEqual([0, 1]);
    expect(other.ctx?.options.mapOptions).toEqual({ c: 3 });
  });
});

describe('small commit paths', () => {
  it('setLocation() to the current value with a new zoom only zooms (snapshot "zoom", no events)', async () => {
    const h = elementCore({ value: '1,2', zoom: 10 });
    h.core.mount();
    await h.core.ready;
    await flush();
    h.core.setLocation({ lat: 1, lng: 2 }, { zoom: 14 });
    expect(causes(h).at(-1)).toBe('zoom');
    expect(h.core.snapshot.zoom).toBe(14);
    expect(summary(h.log)).toEqual(['ready']);
  });
});
