// The Google adapter in real browsers (Chromium, Firefox and WebKit in CI), against the §12.6 mock installed in the
// page: the computed pin with and without the advanced marker (WP3-10), real wheel and double-click events in the
// capture phase, also through a shadow root (WP3-11), and element-mode search with a real paste event (WP3-12).
// The mock takes every Google request in-page, so the shared route table is never touched.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { LocationPickerOptions } from '../../src/core.js';
import { LocationPicker } from '../../src/core.js';
import { erased } from '../../src/core/providers.js';
import { googleProvider } from '../../src/google.js';
import {
  installGoogleMapsMock,
  MockMap,
  type GoogleMapsMock,
  type GoogleMockOptions,
} from '../fixtures/google-maps-mock.js';
import { details, record, summary } from '../core/helpers.js';
import { must, resetStore, shadowPicker, sleep, waitFor } from './helpers.js';

let mock: GoogleMapsMock | undefined;
const cleanup: (() => void)[] = [];

const install = (options: GoogleMockOptions): GoogleMapsMock =>
  (mock = installGoogleMapsMock(window, options));
function lastMap(): MockMap {
  const map = mock?.stats.mapInstances.at(-1);
  if (!(map instanceof MockMap)) throw new Error('expected a google.maps.Map');
  return map;
}
function box(): HTMLElement {
  const element = document.createElement('div');
  element.style.cssText = 'display:block;width:320px;height:240px';
  document.body.append(element);
  cleanup.push(() => element.remove());
  return element;
}
function picker<T>(options: LocationPickerOptions<T>): LocationPicker<T> {
  const created = new LocationPicker<T>(box(), options);
  created.ready.catch(() => {});
  cleanup.push(() => created.destroy());
  return created;
}
const wheel = (target: Element, init: WheelEventInit): WheelEvent => {
  const event = new WheelEvent('wheel', {
    bubbles: true,
    cancelable: true,
    composed: true,
    ...init,
  });
  target.dispatchEvent(event);
  return event;
};
function paste(target: Element, text: string): Event {
  const data = new DataTransfer();
  data.setData('text/plain', text);
  const event = new ClipboardEvent('paste', {
    clipboardData: data,
    bubbles: true,
    cancelable: true,
    composed: true,
  });
  // Some engines ignore clipboardData in the constructor.
  if (!event.clipboardData) Object.defineProperty(event, 'clipboardData', { value: data });
  target.dispatchEvent(event);
  return event;
}

beforeEach(() => {
  resetStore();
  Reflect.deleteProperty(window, 'gm_authFailure');
});
afterEach(() => {
  for (const undo of cleanup.splice(0)) undo();
  mock?.uninstall();
  mock = undefined;
});

describe('WP3-10: the pin in a real engine', () => {
  it('marker "advanced" + mapId: the AdvancedMarkerElement is in the map and the CSS pin computes display:none', async () => {
    install({ mode: 'importLibrary' });
    const p = picker({ provider: googleProvider(), marker: 'advanced', mapId: 'DEMO_MAP_ID' });
    await p.ready;
    expect(lastMap().inner.querySelector('gmp-advanced-marker')).not.toBeNull();
    const pin = must(document.querySelector('.lp-pin'));
    expect(getComputedStyle(pin).display).toBe('none');
  });

  it('without the advanced marker the CSS pin is shown; the map region is the engine’s (no role=application)', async () => {
    install({ mode: 'classic' });
    const p = picker({ provider: googleProvider(), value: '1,2' });
    await p.ready;
    const pin = must(document.querySelector('.lp-pin'));
    expect(getComputedStyle(pin).display).not.toBe('none');
    expect(pin.getBoundingClientRect().height).toBeGreaterThan(0);
    const region = must(document.querySelector('.lp-map'));
    expect(region.hasAttribute('role')).toBe(false);
    expect(lastMap().inner.getBoundingClientRect().height).toBe(240);
  });
});

describe('WP3-11: zoom anchored at the centre, real events', () => {
  it('greedy wheel and dblclick zoom at the centre; nothing reaches the engine; the value stays', async () => {
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
    expect(wheel(map.inner, { deltaY: -120 }).defaultPrevented).toBe(true);
    await sleep(150);
    map.inner.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true }));
    await sleep(30);
    expect(map.wheelEvents).toBe(0);
    expect(google.stats.setZoomCalls).toEqual([11, 12]);
    expect(map.getCenter().toJSON()).toEqual({ lat: 1, lng: 2 });
    expect(summary(log).filter((entry) => !entry.startsWith('ready'))).toEqual([]);
  });

  it('cooperative: a plain wheel reaches the engine untouched; Ctrl+wheel is ours (inside a shadow root)', async () => {
    const google = install({ mode: 'classic' });
    const element = box();
    const { core } = shadowPicker(element, {
      provider: erased(googleProvider()),
      value: '1,2',
      zoom: 10,
      gestureHandling: 'cooperative',
    });
    cleanup.push(() => core.destroy());
    await core.ready;
    const map = lastMap();
    expect(element.shadowRoot?.contains(map.inner)).toBe(true);
    expect(wheel(map.inner, { deltaY: -120 }).defaultPrevented).toBe(false);
    expect(map.wheelEvents).toBe(1);
    expect(google.stats.setZoomCalls).toEqual([]);
    expect(wheel(map.inner, { deltaY: -120, ctrlKey: true }).defaultPrevented).toBe(true);
    expect(map.wheelEvents).toBe(1);
    expect(google.stats.setZoomCalls).toEqual([11]);
    expect(core.snapshot.value).toBe('1,2');
  });
});

describe('WP3-12: search in a shadow root', () => {
  it('PlaceAutocompleteElement renders in the search part; a real paste commits with no Places call; a pick commits', async () => {
    const google = install({ mode: 'importLibrary' });
    const element = box();
    const { core, root } = shadowPicker(element, {
      provider: erased(googleProvider()),
      search: true,
      lang: 'de',
    });
    cleanup.push(() => core.destroy());
    const log = record(element);
    await core.ready;
    const search = await waitFor(
      () => root.querySelector('gmp-place-autocomplete'),
      3000,
      'the search box',
    );
    expect(search.closest('[part~="search"], .lp-search')).not.toBeNull();
    expect(google.stats.placeAutocompleteCtorCalls).toBe(1);
    const input = must(search.shadowRoot?.querySelector('input'));
    const event = paste(input, '48.85, 2.29');
    expect(event.defaultPrevented).toBe(true);
    expect(details(log, 'change').map((d) => `${d.value}:${d.source}`)).toEqual([
      '48.85,2.29:search',
    ]);
    expect(google.stats.fetchFieldsCalls).toEqual([]);
    expect(paste(input, 'Brandenburger Tor').defaultPrevented).toBe(false);
    await google.selectPlace({
      lat: 52.516275,
      lng: 13.377704,
      formattedAddress: 'Pariser Platz, Berlin',
    });
    expect(google.stats.fetchFieldsCalls).toEqual([['location', 'formattedAddress']]);
    expect(core.snapshot).toMatchObject({
      value: '52.516275,13.377704',
      address: 'Pariser Platz, Berlin',
    });
    expect(google.stats.legacyAutocompleteCtorCalls).toBe(0);
  });
});
