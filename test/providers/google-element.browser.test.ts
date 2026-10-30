// WP3-14, element half: a provider switch on the real <location-picker> drops the paired geocoder's address from
// everything the form sees (FormData, the bound address input, the live region) and looks it up again with the new
// pair. Google comes from the in-page §12.6 mock; Leaflet, its CSS and Photon come from the shared route table.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  googleAddressAt,
  installGoogleMapsMock,
  type GoogleMapsMock,
} from '../fixtures/google-maps-mock.js';
import { addressDetails } from '../core/helpers.js';
import { define, must, picker, record, resetStore } from '../element/helpers.js';
import { waitFor } from './helpers.js';

const EIFFEL = { lat: 48.85837, lng: 2.294481 };
const GOOGLE_ADDRESS = 'Eiffel Tower, Paris';
let mock: GoogleMapsMock | undefined;

beforeEach(() => resetStore());
afterEach(() => {
  document.body.innerHTML = '';
  mock?.uninstall();
  mock = undefined;
  vi.restoreAllMocks();
});

const formEntry = (form: HTMLFormElement, name: string): FormDataEntryValue | null =>
  new FormData(form).get(name);
const photonReverse = (spy: { mock: { calls: unknown[][] } }): string[] =>
  spy.mock.calls
    .map(([input]) => String(input instanceof Request ? input.url : input))
    .filter((url) => url.startsWith('https://photon.komoot.io/reverse'));

describe('WP3-14: provider switch on the element', () => {
  it('google -> leaflet clears the Google address everywhere, then Photon looks it up; and back to google', async () => {
    const google = (mock = installGoogleMapsMock(window, { mode: 'importLibrary' }));
    define();
    document.body.innerHTML =
      '<form><location-picker provider="google" search reverse-geocode name="loc" address-name="addr" ' +
      'address-input="#addr-input" style="display:block;width:320px;height:240px"></location-picker>' +
      '<input id="addr-input"></form>';
    const form = must(document.querySelector('form'));
    const input = must(document.querySelector<HTMLInputElement>('#addr-input'));
    const el = picker();
    const log = record(el);
    const live = (): string =>
      must(el.shadowRoot?.querySelector('[aria-live="polite"]')).textContent ?? '';
    const noGoogle = (): void => {
      expect(el.address).toBeNull();
      expect(formEntry(form, 'addr')).toBe('');
      expect(input.value).toBe('');
      expect(
        [...new FormData(form).values()].filter((entry) => typeof entry == 'string').join(' '),
      ).not.toContain(GOOGLE_ADDRESS);
      expect(live()).not.toContain(GOOGLE_ADDRESS);
      expect(el.value).toBe('48.85837,2.294481');
    };

    await el.ready;
    await waitFor(() => el.shadowRoot?.querySelector('gmp-place-autocomplete'), 4000, 'search');
    await google.selectPlace({ ...EIFFEL, formattedAddress: GOOGLE_ADDRESS });
    expect(el.address).toBe(GOOGLE_ADDRESS);
    expect(formEntry(form, 'addr')).toBe(GOOGLE_ADDRESS);
    expect(input.value).toBe(GOOGLE_ADDRESS);

    const fetches = vi.spyOn(window, 'fetch');
    el.provider = 'leaflet';
    await Promise.resolve();
    noGoogle();
    await el.ready;
    noGoogle();
    await waitFor(() => addressDetails(log).length == 2, 8000, 'the Photon addresschange');
    expect(photonReverse(fetches)).toHaveLength(1);
    expect(el.address).toBeTruthy();
    expect(el.address).not.toContain(GOOGLE_ADDRESS);
    expect(formEntry(form, 'addr')).toBe(el.address);

    // And back: the Photon address goes; the Google Geocoder mock answers.
    const osm = must(el.address);
    el.provider = 'google';
    await Promise.resolve();
    expect(el.address).toBeNull();
    expect(formEntry(form, 'addr')).toBe('');
    expect(input.value).toBe('');
    expect(live()).not.toContain(osm);
    await el.ready;
    await waitFor(() => addressDetails(log).length == 3, 4000, 'the Google addresschange');
    expect(el.address).toBe(googleAddressAt(EIFFEL));
    expect(google.stats.geocoderRequests).toHaveLength(1);
    expect(photonReverse(fetches)).toHaveLength(1);
  });
});
