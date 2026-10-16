// WP3-16 (through the search box), WP3-18 (reverse geocoding with Photon) and WP3-14 (Photon side of the pairing),
// with the real core, the real combobox and photonGeocoder over the fetch mock (jsdom; the map is the fake adapter).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LocationPicker, type Geocoder, type LocationPickerOptions } from '../../src/core.js';
import { photonGeocoder } from '../../src/photon.js';
import { createFakeAdapter, type FakeMap } from '../fixtures/fake-adapter.js';
import {
  flush,
  record,
  resetStore,
  spyConsole,
  stubPhoton,
  useCombobox,
  waitFor,
} from '../providers/helpers.js';

const EIFFEL = '48.8584,2.2945';
const pickers: LocationPicker<FakeMap>[] = [];

/** A class picker on the fake adapter (named like the real provider), with the search box mounted. */
async function create(options: LocationPickerOptions<FakeMap> = {}, name = 'leaflet') {
  document.body.innerHTML = '<form><div id="map" style="height:300px"></div></form>';
  const fake = createFakeAdapter({ name });
  const picker = new LocationPicker<FakeMap>('#map', {
    provider: fake.adapter,
    value: EIFFEL,
    search: true,
    geocoder: photonGeocoder(),
    ...options,
  });
  pickers.push(picker);
  const log = record(picker);
  await picker.ready;
  return { picker, fake, log };
}
const searchInput = (): Promise<HTMLInputElement> =>
  waitFor(
    () => document.querySelector<HTMLInputElement>('.lp-search-input'),
    2000,
    'the search box',
  );
const type = (input: HTMLInputElement, value: string): void => {
  input.value = value;
  input.dispatchEvent(new Event('input', { bubbles: true }));
};
const key = (input: HTMLInputElement, name: string): void => {
  input.dispatchEvent(new KeyboardEvent('keydown', { key: name, bubbles: true, cancelable: true }));
};
const searches = (urls: URL[]): URL[] => urls.filter((url) => url.pathname == '/api');
const reverses = (urls: URL[]): URL[] => urls.filter((url) => url.pathname == '/reverse');

beforeEach(() => {
  resetStore();
  useCombobox();
});
afterEach(() => {
  for (const picker of pickers.splice(0)) picker.destroy();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('WP3-16 Photon through the search box', () => {
  it('two keystrokes within 300 ms give one request, biased to the map centre', async () => {
    const stub = stubPhoton();
    await create();
    const input = await searchInput();
    vi.useFakeTimers();
    type(input, 'Eiff');
    await vi.advanceTimersByTimeAsync(150);
    type(input, 'Eiffel');
    await vi.advanceTimersByTimeAsync(299);
    expect(stub.urls).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(1);
    expect(stub.urls).toHaveLength(1);
    const params = Object.fromEntries(stub.urls[0]!.searchParams);
    expect(params).toMatchObject({ q: 'Eiffel', lat: '48.8584', lon: '2.2945', limit: '5' });
  });

  it('debounce: 50 stays >= 300 ms on the public endpoint and is honoured on a custom URL', async () => {
    const stub = stubPhoton();
    await create({ geocoder: photonGeocoder({ debounce: 50 }) });
    let input = await searchInput();
    vi.useFakeTimers();
    type(input, 'Beirut');
    await vi.advanceTimersByTimeAsync(299);
    expect(stub.urls).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(1);
    expect(stub.urls).toHaveLength(1);
    vi.useRealTimers();

    pickers.splice(0).forEach((p) => p.destroy());
    await create({
      geocoder: photonGeocoder({ url: 'https://photon.example.org/api', debounce: 50 }),
    });
    input = await searchInput();
    vi.useFakeTimers();
    type(input, 'Beirut');
    await vi.advanceTimersByTimeAsync(49);
    expect(stub.urls).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(stub.urls.map((u) => u.host)).toEqual(['photon.komoot.io', 'photon.example.org']);
  });

  it('fewer than 3 characters send nothing; a stale request is aborted; a cache hit sends nothing', async () => {
    const stub = stubPhoton(500);
    await create();
    const input = await searchInput();
    vi.useFakeTimers();
    type(input, 'Sy');
    await vi.advanceTimersByTimeAsync(1000);
    expect(stub.urls).toHaveLength(0);
    type(input, 'Syd');
    await vi.advanceTimersByTimeAsync(300);
    type(input, 'Sydney');
    expect(stub.signals[0]?.aborted).toBe(true);
    await vi.advanceTimersByTimeAsync(800);
    expect(stub.urls.map((u) => u.searchParams.get('q'))).toEqual(['Syd', 'Sydney']);
    type(input, 'Sydne');
    await vi.advanceTimersByTimeAsync(800);
    type(input, 'Sydney');
    await vi.advanceTimersByTimeAsync(800);
    expect(stub.urls.map((u) => u.searchParams.get('q'))).toEqual(['Syd', 'Sydney', 'Sydne']);
  });

  it('a pick commits with source "search", the place and its address, then addresschange; no reverse request', async () => {
    const stub = stubPhoton();
    const { picker, log } = await create({ value: null, reverseGeocode: true });
    const input = await searchInput();
    vi.useFakeTimers();
    type(input, 'Eiffel');
    await vi.advanceTimersByTimeAsync(350);
    key(input, 'ArrowDown');
    key(input, 'Enter');
    await vi.advanceTimersByTimeAsync(1000);
    const types = log.map((entry) => entry.type);
    expect(types).toEqual(['ready', 'input', 'change', 'addresschange']);
    const change = log[2]!.detail as {
      value: string;
      source: string;
      address: string;
      place: unknown;
      zoom: number;
    };
    expect(change).toMatchObject({
      value: '48.85826,2.294481',
      source: 'search',
      address: 'Tour Eiffel, 5 Avenue Anatole France, 75007 Paris, France',
      place: { label: 'Tour Eiffel', id: 'W5013364' },
    });
    expect(picker.address).toBe('Tour Eiffel, 5 Avenue Anatole France, 75007 Paris, France');
    expect(reverses(stub.urls)).toHaveLength(0);
    expect(searches(stub.urls)).toHaveLength(1);
  });

  it('a typed coordinate commits with zero requests', async () => {
    const stub = stubPhoton();
    const { picker, log } = await create({ value: null });
    const input = await searchInput();
    vi.useFakeTimers();
    type(input, '33.8938, 35.5018');
    key(input, 'Enter');
    await vi.advanceTimersByTimeAsync(1000);
    expect(picker.value).toBe('33.8938,35.5018');
    expect(
      log.filter((e) => e.type == 'change').map((e) => (e.detail as { source: string }).source),
    ).toEqual(['search']);
    expect(stub.urls).toHaveLength(0);
  });
});

describe('WP3-18 reverse geocoding with Photon', () => {
  it('debounces 400 ms: two quick commits give one request, then addresschange', async () => {
    const stub = stubPhoton();
    const { picker, log } = await create({ value: null, reverseGeocode: true, search: false });
    vi.useFakeTimers();
    picker.setLocation(33.9, 35.5);
    await vi.advanceTimersByTimeAsync(200);
    picker.setLocation(48.8584, 2.2945);
    await vi.advanceTimersByTimeAsync(399);
    expect(stub.urls).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(10);
    expect(
      reverses(stub.urls).map((u) => [u.searchParams.get('lat'), u.searchParams.get('lon')]),
    ).toEqual([['48.8584', '2.2945']]);
    expect(
      log
        .filter((e) => e.type == 'addresschange')
        .map((e) => (e.detail as { address: string }).address),
    ).toEqual(['Tour Eiffel, 5 Avenue Anatole France, 75007 Paris, France']);
  });

  it('a newer commit aborts the request in flight', async () => {
    const stub = stubPhoton(300);
    const { picker } = await create({ value: null, reverseGeocode: true, search: false });
    vi.useFakeTimers();
    picker.setLocation(33.8959, 35.4784);
    await vi.advanceTimersByTimeAsync(450);
    expect(stub.urls).toHaveLength(1);
    picker.setLocation(48.8584, 2.2945);
    expect(stub.signals[0]?.aborted).toBe(true);
    await vi.advanceTimersByTimeAsync(800);
    expect(picker.address).toBe('Tour Eiffel, 5 Avenue Anatole France, 75007 Paris, France');
  });

  it('hits the cache at 5 decimal places', async () => {
    const stub = stubPhoton();
    const { picker } = await create({ value: null, reverseGeocode: true, search: false });
    vi.useFakeTimers();
    picker.setLocation(48.8584, 2.2945);
    await vi.advanceTimersByTimeAsync(500);
    picker.setLocation(33.8959, 35.4784);
    await vi.advanceTimersByTimeAsync(500);
    expect(stub.urls).toHaveLength(2);
    picker.setLocation(48.858401, 2.294501);
    expect(picker.address).toBe('Tour Eiffel, 5 Avenue Anatole France, 75007 Paris, France');
    await vi.advanceTimersByTimeAsync(500);
    expect(stub.urls).toHaveLength(2);
  });

  it('a failure gives GEOCODER_FAILED (warn) and address null', async () => {
    stubPhoton(0, (url) => url.pathname == '/reverse');
    const { warn } = spyConsole();
    const { picker, log } = await create({ value: null, reverseGeocode: true, search: false });
    vi.useFakeTimers();
    picker.setLocation(48.8584, 2.2945);
    await vi.advanceTimersByTimeAsync(500);
    expect(picker.address).toBeNull();
    const errors = log
      .filter((e) => e.type == 'error')
      .map((e) => e.detail as { code: string; level: string });
    expect(errors).toMatchObject([{ code: 'GEOCODER_FAILED', level: 'warn' }]);
    expect(warn).toHaveBeenCalledTimes(1);
  });
});

describe('WP3-14 pairing (Photon side)', () => {
  it('photonGeocoder on a google map is refused: GEOCODER_MISMATCH and no search box', async () => {
    const stub = stubPhoton();
    spyConsole();
    const { picker, log } = await create({}, 'google');
    await flush();
    await flush();
    expect(
      log.filter((e) => e.type == 'error').map((e) => (e.detail as { code: string }).code),
    ).toEqual(['GEOCODER_MISMATCH']);
    expect(document.querySelector('.lp-search-input')).toBeNull();
    await expect(picker.geocode('Eiffel')).rejects.toMatchObject({ code: 'GEOCODER_MISSING' });
    expect(stub.urls).toHaveLength(0);
  });

  it('a custom geocoder without pairsWith works on google', async () => {
    const search = vi.fn<NonNullable<Geocoder['search']>>(async () => [
      { lat: 1, lng: 2, label: 'Custom place' },
    ]);
    const { picker } = await create({ geocoder: { search } }, 'google');
    const input = await searchInput();
    vi.useFakeTimers();
    type(input, 'custom');
    await vi.advanceTimersByTimeAsync(300);
    key(input, 'Enter');
    expect(picker.value).toBe('1,2');
    expect(search).toHaveBeenCalledTimes(1);
  });
});
