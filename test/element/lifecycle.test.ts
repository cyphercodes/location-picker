// WP4-13 lifecycle, the §3.6 parser timing (WP4-10 seeding without the IIFE), reset/restore state handling and the
// §9 inert degrade, unit project (jsdom: no setFormValue/setValidity/states, no ResizeObserver).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Geocoder } from '../../src/core.js';
import { erased } from '../../src/core/providers.js';
import { createFakeAdapter } from '../fixtures/fake-adapter.js';
import {
  create,
  define,
  flush,
  part,
  record,
  render,
  resetStore,
  spyConsole,
  summary,
  texts,
} from './helpers.js';

const geocoder: Geocoder = {
  reverse: async (at) => ({ ...at, label: `near ${at.lat}`, address: `Street ${at.lat}` }),
};

let console: ReturnType<typeof spyConsole>;
beforeEach(() => {
  resetStore();
  console = spyConsole();
});
afterEach(() => {
  vi.restoreAllMocks();
  document.body.innerHTML = '';
});

const task = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

describe('WP4-13 lifecycle', () => {
  it('the overlay renders on connect; mount waits for a microtask, so properties set right after append apply first', async () => {
    const { el, fake, log } = create();
    document.body.append(el);
    expect(el.shadowRoot?.querySelector('[part="pin"]')).not.toBeNull();
    el.value = '1,2';
    el.zoom = 7;
    expect(fake.mountCount).toBe(0);
    await flush();
    expect(fake.mountCount).toBe(1);
    expect(fake.handle?.map).toMatchObject({ center: { lat: 1, lng: 2 }, zoom: 7 });
    expect(summary(log)).toEqual(['ready']);
  });

  it('remove + re-append in one task: no remount and no second ready', async () => {
    const { el, fake, log } = render('<div id="a"></div><location-picker></location-picker>');
    await flush();
    const a = document.getElementById('a')!;
    a.append(el);
    document.body.append(el);
    await task();
    expect(fake.mountCount).toBe(1);
    expect(fake.handle?.map.destroyed).toBe(false);
    expect(summary(log)).toEqual(['ready']);
  });

  it('removal tears down after a microtask', async () => {
    const { el, fake } = render('<location-picker></location-picker>');
    await flush();
    el.remove();
    expect(fake.handle?.map.destroyed).toBe(false);
    await Promise.resolve();
    expect(fake.handle?.map.destroyed).toBe(true);
    expect(el.shadowRoot?.querySelector('[part="base"]')).toBeNull();
  });

  it('a reconnect after teardown restores value, zoom, address and dirty silently, with a new ready', async () => {
    const fake = createFakeAdapter({ geocoder });
    define();
    document.body.innerHTML = '<location-picker reverse-geocode></location-picker>';
    const el = document.querySelector('location-picker')!;
    el.provider = erased(fake.adapter);
    const log = record(el);
    await flush();
    await fake.userPan({ lat: 10, lng: 20 });
    el.zoom = 9;
    await el.lookupAddress();
    expect(el.address).toBe('Street 10');
    const before = el.ready;

    el.remove();
    await task();
    expect(fake.handle?.map.destroyed).toBe(true);
    el.value = '30,40';
    el.required = true;
    expect(() => el.checkValidity()).not.toThrow();
    const events = log.length;
    document.body.append(el);
    expect(el.ready).not.toBe(before);
    await el.ready;
    expect(fake.mountCount).toBe(2);
    expect(el.value).toBe('30,40');
    expect(el.zoom).toBe(9);
    expect(fake.handle?.map).toMatchObject({ center: { lat: 30, lng: 40 }, zoom: 9 });
    expect(summary(log.slice(events))).toEqual(['ready']);
    expect(el.required).toBe(true);
    expect(() => el.checkValidity()).not.toThrow();

    // Without a write while detached, the address and the dirty flag are kept too.
    el.remove();
    await task();
    document.body.append(el);
    await el.ready;
    expect(el.value).toBe('30,40');
    el.setAttribute('value', '1,1');
    expect(el.value).toBe('30,40');
  });

  it('a reconnect keeps the address when the value did not change', async () => {
    const fake = createFakeAdapter({ geocoder });
    const { el } = create();
    el.provider = erased(fake.adapter);
    document.body.append(el);
    await flush();
    await fake.userPan({ lat: 10, lng: 20 });
    await el.lookupAddress();
    el.remove();
    await task();
    document.body.append(el);
    await el.ready;
    expect(el.address).toBe('Street 10');
  });

  it('3 remount-class attribute changes in one task give one remount; coordinates kept; ready again', async () => {
    const { el, fake, log } = render('<location-picker value="1,2"></location-picker>');
    await flush();
    const before = el.ready;
    el.setAttribute('map-style', 'https://example.test/style.json');
    expect(el.ready).not.toBe(before);
    el.setAttribute('engine-url', 'none');
    el.setAttribute('api-key', 'k');
    await el.ready;
    expect(fake.mountCount).toBe(2);
    expect(fake.handle?.map.center).toEqual({ lat: 1, lng: 2 });
    expect(summary(log)).toEqual(['ready', 'ready']);
  });

  it('el.provider = <adapter> replaces el.ready before the setter returns; the new map is ready after await', async () => {
    const { el } = render('<location-picker value="1,2"></location-picker>');
    await flush();
    const before = el.ready;
    const other = createFakeAdapter({ name: 'other' });
    el.provider = erased(other.adapter);
    expect(el.ready).not.toBe(before);
    await expect(before).resolves.toBe(el);
    expect(await el.ready).toBe(el);
    expect(el.map).toBe(other.handle?.map);
    expect(other.handle?.map.center).toEqual({ lat: 1, lng: 2 });
  });

  it('el.ready taken before the first connect settles with the first mount, through a remount', async () => {
    const { el, fake } = create();
    const ready = el.ready;
    document.body.append(el);
    await flush();
    el.setAttribute('engine-url', 'none');
    await expect(ready).resolves.toBe(el);
    expect(fake.mountCount).toBeGreaterThanOrEqual(1);
  });

  it('a provider switch clears the address silently; a remount that keeps the name keeps it', async () => {
    const fake = createFakeAdapter({ geocoder });
    const { el, log } = create();
    el.provider = erased(fake.adapter);
    document.body.append(el);
    el.setLocation(5, 6);
    await flush();
    await el.lookupAddress();
    expect(el.address).toBe('Street 5');
    el.setAttribute('map-style', 'x');
    await el.ready;
    expect(el.address).toBe('Street 5');
    const events = log.length;
    el.provider = erased(createFakeAdapter({ name: 'other' }).adapter);
    await el.ready;
    expect(el.address).toBeNull();
    expect(el.value).toBe('5,6');
    expect(summary(log.slice(events))).toEqual(['ready']);
  });

  it('methods called before the first connect apply after ready', async () => {
    const { el, log } = create();
    el.setLocation(3, 4);
    const geocoded = el.geocode('7, 8');
    document.body.append(el);
    expect(await geocoded).toEqual([{ lat: 7, lng: 8, label: '7,8' }]);
    await flush();
    expect(summary(log)).toEqual(['ready', 'input:3,4:api', 'change:3,4:api']);
  });

  it('no light-DOM or attribute mutation on the host from connect through ready (jsdom)', async () => {
    const { el } = create();
    const records: MutationRecord[] = [];
    const observer = new MutationObserver((list) => records.push(...list));
    observer.observe(el, { attributes: true, childList: true });
    document.body.append(el);
    await el.ready;
    await flush();
    observer.disconnect();
    expect(records).toEqual([]);
    expect(el.shadowRoot?.mode).toBe('open');
  });
});

describe('§3.6 parser timing (WP4-10 seeding)', () => {
  it('while the document is loading, init waits for DOMContentLoaded when a *-input is set; seeds from the inputs', async () => {
    const readyState = vi.spyOn(document, 'readyState', 'get').mockReturnValue('loading');
    const { el, fake, log } = render(
      '<location-picker lat-input="lat" lng-input="lng"></location-picker>',
    );
    // The bound inputs arrive later in the document (the element was defined before the parser reached them).
    el.insertAdjacentHTML(
      'beforeend',
      '<input id="lat" value="48.8584"><input id="lng" value="2.2945">',
    );
    await flush();
    expect(fake.mountCount).toBe(0);
    expect(part(el, 'pin')).toBeTruthy();
    readyState.mockReturnValue('interactive');
    document.dispatchEvent(new Event('DOMContentLoaded'));
    await flush();
    expect(fake.mountCount).toBe(1);
    expect(el.value).toBe('48.8584,2.2945');
    expect((document.getElementById('lat') as HTMLInputElement).value).toBe('48.8584');
    expect(summary(log)).toEqual(['ready']);
    expect(texts(console.warn).filter((t) => t.includes('no input matches'))).toEqual([]);
  });

  it('without *-input attributes, a loading document does not delay the mount', async () => {
    vi.spyOn(document, 'readyState', 'get').mockReturnValue('loading');
    const { fake } = render('<location-picker></location-picker>');
    await flush();
    expect(fake.mountCount).toBe(1);
  });
});

describe('reset and restore state (unit; the FACE callbacks are driven directly)', () => {
  it('formResetCallback returns to the value attribute silently and clears dirty and the address', async () => {
    const { el, fake, log } = render('<location-picker value="1,2"></location-picker>');
    await flush();
    await fake.userPan({ lat: 10, lng: 20 });
    const events = log.length;
    el.formResetCallback();
    expect(el.value).toBe('1,2');
    expect(fake.handle?.map.center).toEqual({ lat: 1, lng: 2 });
    expect(log.length).toBe(events);
    // Not dirty any more: the default applies again.
    el.setAttribute('value', '3,4');
    expect(el.value).toBe('3,4');
  });

  it('reset falls back to lat/lng, then the bound-input seed defaults, then unset', async () => {
    const { el, fake } = render(
      '<location-picker lat-input="lat" lng-input="lng"><input id="lat" type="hidden" value="48.8584"><input id="lng" type="hidden" value="2.2945"></location-picker>',
    );
    await flush();
    expect(el.value).toBe('48.8584,2.2945');
    await fake.userPan({ lat: 10, lng: 20 });
    const lat = document.getElementById('lat') as HTMLInputElement;
    expect(lat.getAttribute('value')).toBe('10');
    el.formResetCallback();
    expect(el.value).toBe('48.8584,2.2945');
    expect(lat.value).toBe('48.8584');

    el.setAttribute('lat', '1');
    el.setAttribute('lng', '1');
    el.value = '5,5';
    el.formResetCallback();
    expect(el.value).toBe('1,1');

    document.body.innerHTML = '';
    const plain = render('<location-picker></location-picker>');
    await flush();
    plain.el.value = '5,5';
    plain.el.formResetCallback();
    expect(plain.el.value).toBe('');
  });

  it('a reset value survives teardown: the seed defaults are kept on the element', async () => {
    const { el, fake } = render(
      '<form><location-picker lat-input="lat" lng-input="lng"></location-picker><input id="lat" type="hidden" value="1"><input id="lng" type="hidden" value="2"></form>',
    );
    await flush();
    await fake.userPan({ lat: 10, lng: 20 });
    const form = document.querySelector('form')!;
    el.remove();
    await task();
    form.prepend(el);
    await el.ready;
    el.formResetCallback();
    expect(el.value).toBe('1,2');
  });

  it("formStateRestoreCallback('restore') restores value, zoom and address silently; 'autocomplete' is ignored", async () => {
    const { el, fake, log } = render('<location-picker></location-picker>');
    await flush();
    el.formStateRestoreCallback(JSON.stringify({ v: '1,2', z: 11, a: 'Somewhere' }), 'restore');
    expect([el.value, el.zoom, el.address]).toEqual(['1,2', 11, 'Somewhere']);
    expect(fake.handle?.map).toMatchObject({ center: { lat: 1, lng: 2 }, zoom: 11 });
    el.formStateRestoreCallback(JSON.stringify({ v: '3,4', z: 1, a: null }), 'autocomplete');
    el.formStateRestoreCallback('not json', 'restore');
    expect(el.value).toBe('1,2');
    expect(summary(log)).toEqual(['ready']);
  });

  it('a restore before the core exists is applied at init, over the bound-input seed', async () => {
    define();
    const el = document.createElement('location-picker');
    el.formStateRestoreCallback(JSON.stringify({ v: '7,8', z: 6, a: null }), 'restore');
    const fake = createFakeAdapter();
    el.provider = erased(fake.adapter);
    el.setAttribute('value', '1,2');
    document.body.append(el);
    await flush();
    expect(el.value).toBe('7,8');
    expect(fake.handle?.map.zoom).toBe(6);
  });

  it('formDisabledCallback disables interaction', async () => {
    const { el, fake } = render('<location-picker></location-picker>');
    await flush();
    el.formDisabledCallback(true);
    expect(fake.handle?.map.interactive).toBe('none');
    el.formDisabledCallback(false);
    expect(fake.handle?.map.interactive).toBe('full');
    el.readOnly = true;
    expect(fake.handle?.map.interactive).toBe('zoom-only');
  });
});

describe('§9 inert degrade (jsdom has no setFormValue, setValidity or ResizeObserver)', () => {
  it('without attachInternals (happy-dom throws), construction, setters and callbacks still work', async () => {
    vi.spyOn(HTMLElement.prototype, 'attachInternals').mockImplementation(() => {
      throw new TypeError('attachInternals is not supported');
    });
    const { el, log } = render(
      '<form><location-picker name="loc" required value="1,2"></location-picker></form>',
    );
    await flush();
    expect(summary(log)).toEqual(['ready']);
    expect(() => {
      el.value = '3,4';
      el.required = false;
      el.form = 'f1';
      el.disabled = true;
      el.setCustomValidity('x');
      el.formResetCallback();
    }).not.toThrow();
    expect(el.value).toBe('1,2');
    expect(el.form).toBeNull();
    expect(el.labels).toHaveLength(0);
    expect(el.checkValidity()).toBe(false);
    expect(texts(console.warn).find((t) => t.includes('runs inert'))).toContain('ElementInternals');
  });

  it('one diagnostic names the missing APIs; value, valueAsLatLng and setLocation() still round-trip; nothing throws', async () => {
    const { el } = render('<form><location-picker name="loc" required></location-picker></form>');
    expect(texts(console.warn).filter((t) => t.includes('runs inert'))).toHaveLength(1);
    expect(texts(console.warn).find((t) => t.includes('runs inert'))).toContain('ResizeObserver');
    await flush();
    el.value = '1,2';
    expect(el.valueAsLatLng).toEqual({ lat: 1, lng: 2 });
    el.setLocation(3, 4);
    expect(el.value).toBe('3,4');
    expect(el.checkValidity()).toBe(true);
    el.value = '';
    expect(el.checkValidity()).toBe(false);
    expect(el.validity.valueMissing).toBe(true);
    el.setCustomValidity('nope');
    expect(el.validity.customError).toBe(true);
    expect(() => el.reportValidity()).not.toThrow();
    expect(el.labels).toHaveLength(0);
    expect(el.willValidate).toBe(false);
    const document2 = document.implementation.createHTMLDocument();
    expect(() => document2.adoptNode(el)).not.toThrow();
  });
});
