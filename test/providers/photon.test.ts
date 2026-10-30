// WP3-16 (geocoder side): photonGeocoder() requests, cache, language, bias, reverse and formatPhotonAddress (jsdom).
// Debounce, minimum length and stale-request aborts through the search box are in test/search/combobox-photon.test.ts.
import { afterEach, describe, expect, it, vi } from 'vitest';
import type {
  GeocodeReverseOptions,
  Geocoder,
  GeocodeSearchOptions,
  LatLng,
} from '../../src/core.js';
import { PHOTON_URL, formatPhotonAddress, photonGeocoder } from '../../src/photon.js';
import { PHOTON_QUERIES, photonResponse } from '../fixtures/photon-mock.js';
import { must, stubPhoton } from './helpers.js';

const EIFFEL = { lat: 48.8584, lng: 2.2945 };
const search = (overrides: Partial<GeocodeSearchOptions> = {}): GeocodeSearchOptions => ({
  signal: new AbortController().signal,
  near: EIFFEL,
  limit: 5,
  lang: 'en',
  ...overrides,
});
const reverse = (overrides: Partial<GeocodeReverseOptions> = {}): GeocodeReverseOptions => ({
  signal: new AbortController().signal,
  lang: 'en',
  zoom: 15,
  ...overrides,
});
const find = (geocoder: Geocoder, query: string, options = search()) => {
  if (!geocoder.search) throw new Error('expected search()');
  return geocoder.search(query, options);
};
const lookup = (geocoder: Geocoder, at: LatLng, options = reverse()) => {
  if (!geocoder.reverse) throw new Error('expected reverse()');
  return geocoder.reverse(at, options);
};
const params = (url: URL | undefined): Record<string, string> =>
  Object.fromEntries(must(url, 'a request').searchParams);

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('photonGeocoder', () => {
  it('pairs with Leaflet and MapLibre and exposes what the search box reads', () => {
    const geocoder = photonGeocoder();
    expect(geocoder.pairsWith).toEqual(['leaflet', 'maplibre']);
    expect(geocoder).toMatchObject({ url: PHOTON_URL, debounce: 300, minChars: 3, limit: 5 });
    expect(PHOTON_URL).toBe('https://photon.komoot.io/api');
  });

  it('keeps the 300 ms floor on the public endpoint and honours a lower debounce elsewhere', () => {
    expect(photonGeocoder({ debounce: 50 })).toMatchObject({ debounce: 300 });
    expect(photonGeocoder({ debounce: 500 })).toMatchObject({ debounce: 500 });
    expect(photonGeocoder({ url: 'https://photon.example.org/api', debounce: 50 })).toMatchObject({
      debounce: 50,
    });
  });

  it('searches with q, limit, lang and a lat/lon bias equal to the map centre', async () => {
    const stub = stubPhoton();
    const results = await find(photonGeocoder(), 'Eiffel Tower', search());
    expect(stub.urls).toHaveLength(1);
    const url = must(stub.urls[0]);
    expect(url.origin + url.pathname).toBe(PHOTON_URL);
    expect(params(url)).toEqual({
      q: 'Eiffel Tower',
      limit: '5',
      lat: '48.8584',
      lon: '2.2945',
      lang: 'en',
    });
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      lat: 48.8582602,
      lng: 2.2944813,
      label: 'Tour Eiffel',
      address: 'Tour Eiffel, 5 Avenue Anatole France, 75007 Paris, France',
      bounds: { west: 2.2933084, north: 48.8590465, east: 2.2956897, south: 48.8574753 },
      id: 'W5013364',
    });
    expect(results[0]?.raw).toMatchObject({ type: 'Feature' });
  });

  it('sends a supported language and omits an unsupported one (local names)', async () => {
    const stub = stubPhoton();
    const geocoder = photonGeocoder();
    await find(geocoder, 'Beirut', search({ lang: 'fr-CA' }));
    await find(geocoder, 'Beirut', search({ lang: 'ar' }));
    expect(params(stub.urls[0]).lang).toBe('fr');
    expect(params(stub.urls[1])).not.toHaveProperty('lang');
    await find(
      photonGeocoder({ lang: 'it', url: 'https://photon.example.org/api' }),
      'Beirut',
      search({ lang: 'ar' }),
    );
    expect(params(stub.urls[2]).lang).toBe('it');
  });

  it('rounds the bias to 5 decimals and adds custom params', async () => {
    const stub = stubPhoton();
    await find(
      photonGeocoder({ params: { osm_tag: 'place' }, limit: 3 }),
      'Sydney',
      search({ near: { lat: -33.123456789, lng: 151.987654321 }, limit: 0 }),
    );
    expect(params(stub.urls[0])).toMatchObject({
      lat: '-33.12346',
      lon: '151.98765',
      osm_tag: 'place',
      limit: '3',
    });
  });

  it('sends nothing below the minimum length', async () => {
    const stub = stubPhoton();
    const geocoder = photonGeocoder();
    expect(await find(geocoder, 'Be', search())).toEqual([]);
    expect(await find(geocoder, '   ab  ', search())).toEqual([]);
    expect(await find(photonGeocoder({ minChars: 1 }), 'B', search())).toHaveLength(1);
    expect(stub.urls).toHaveLength(1);
  });

  it('answers a repeated query from its cache (LRU of 100)', async () => {
    const stub = stubPhoton();
    const geocoder = photonGeocoder();
    const run = (q: string, o?: GeocodeSearchOptions) => find(geocoder, q, o);
    const first = await run('Tripoli', search());
    expect(await run('Tripoli', search())).toBe(first);
    expect(stub.urls).toHaveLength(1);
    for (let i = 0; i < 100; i++) await run(`query ${i}`, search());
    await run('Tripoli', search());
    expect(stub.urls).toHaveLength(102);
  });

  it('passes the abort signal to fetch and does not cache failures', async () => {
    const stub = stubPhoton(50);
    const geocoder = photonGeocoder();
    const run = (q: string, o?: GeocodeSearchOptions) => find(geocoder, q, o);
    const controller = new AbortController();
    const pending = run('Sydney', search({ signal: controller.signal }));
    controller.abort();
    await expect(pending).rejects.toThrow('aborted');
    expect(stub.signals[0]?.aborted).toBe(true);
    await expect(run('error', search())).rejects.toThrow('500');
    await expect(run('error', search())).rejects.toThrow('500');
    expect(await run('Sydney', search())).toHaveLength(1);
    expect(stub.urls).toHaveLength(4);
  });

  it('reverse-geocodes with /reverse?lat=&lon=&limit=1&lang=', async () => {
    const stub = stubPhoton();
    const result = await lookup(photonGeocoder(), EIFFEL, reverse());
    const url = must(stub.urls[0]);
    expect(url.origin + url.pathname).toBe('https://photon.komoot.io/reverse');
    expect(params(url)).toEqual({ lat: '48.8584', lon: '2.2945', limit: '1', lang: 'en' });
    expect(result).toMatchObject({
      label: 'Tour Eiffel',
      address: 'Tour Eiffel, 5 Avenue Anatole France, 75007 Paris, France',
    });
    expect(await lookup(photonGeocoder(), { lat: 0, lng: 0 }, reverse())).toBeNull();
  });

  it('derives the reverse endpoint from a custom url, unless reverseUrl is given', async () => {
    const stub = stubPhoton();
    await lookup(photonGeocoder({ url: 'https://photon.example.org/api' }), EIFFEL, reverse());
    await lookup(
      photonGeocoder({ reverseUrl: 'https://geo.example.org/v1/reverse' }),
      EIFFEL,
      reverse(),
    );
    expect(stub.urls.map((u) => u.origin + u.pathname)).toEqual([
      'https://photon.example.org/reverse',
      'https://geo.example.org/v1/reverse',
    ]);
  });
});

describe('formatPhotonAddress', () => {
  const cases: [Record<string, unknown>, string][] = [
    [
      {
        name: 'Tour Eiffel',
        housenumber: '5',
        street: 'Avenue Anatole France',
        postcode: '75007',
        city: 'Paris',
        country: 'France',
      },
      'Tour Eiffel, 5 Avenue Anatole France, 75007 Paris, France',
    ],
    [
      {
        housenumber: '10',
        street: 'Downing Street',
        postcode: 'SW1A 2AA',
        city: 'London',
        country: 'United Kingdom',
      },
      '10 Downing Street, SW1A 2AA London, United Kingdom',
    ],
    [
      { name: 'Avenue Anatole France', postcode: '75007', city: 'Paris', country: 'France' },
      'Avenue Anatole France, 75007 Paris, France',
    ],
    [{ name: 'Beirut', country: 'Lebanon' }, 'Beirut, Lebanon'],
    [{ name: 'Lebanon', country: 'Lebanon' }, 'Lebanon'],
    [{ street: 'Rue Hamra', city: 'Beirut' }, 'Rue Hamra, Beirut'],
    [{ postcode: 2000, city: 'Sydney', country: 'Australia' }, '2000 Sydney, Australia'],
    [{ name: '  Spaced  ', city: ' ', country: null, extent: [1, 2, 3, 4] }, 'Spaced'],
    [{}, ''],
  ];
  it.each(cases)('%j -> %s', (properties, expected) => {
    expect(formatPhotonAddress(properties)).toBe(expected);
  });
});

describe('photon mock (§12.6)', () => {
  it('answers every canned query', async () => {
    const statuses = await Promise.all(
      PHOTON_QUERIES.map(async (q) => {
        const response = must(photonResponse(new URL(`${PHOTON_URL}?q=${encodeURIComponent(q)}`)));
        const body = response.ok ? ((await response.json()) as { features: unknown[] }) : null;
        return [q, response.status, body?.features.length ?? null];
      }),
    );
    expect(statuses).toEqual([
      ['Eiffel Tower', 200, 1],
      ['Beirut', 200, 1],
      ['Tripoli', 200, 2],
      ['Sydney', 200, 1],
      ['nowhere at all', 200, 0],
      ['error', 500, null],
    ]);
    expect(photonResponse(new URL('https://photon.komoot.io/other'))).toBeNull();
  });
});
