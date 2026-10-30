// WP4-09 (FACE) and WP4-10 (progressive enhancement, without the IIFE head variant), browser project.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Geocoder } from '../../src/core.js';
import { erased } from '../../src/core/providers.js';
import { defineLocationPicker } from '../../src/element/define.js';
import type { LocationPickerElement } from '../../src/element/location-picker-element.js';
import { createFakeAdapter, type FakeControl } from '../fixtures/fake-adapter.js';
import { flush, part, record, render, resetStore, spyConsole, summary, texts } from './helpers.js';

const geocoder: Geocoder = {
  reverse: async (at) => ({ ...at, label: 'x', address: `Street ${at.lat}` }),
};

const frames: HTMLIFrameElement[] = [];
beforeEach(() => resetStore());
afterEach(() => {
  vi.restoreAllMocks();
  for (const frame of frames.splice(0)) frame.remove();
  document.body.innerHTML = '';
});

const form = (): HTMLFormElement => document.querySelector('form')!;
const entries = (f = form()): [string, string][] =>
  [...new FormData(f)].map(([key, value]) => [key, typeof value == 'string' ? value : value.name]);

/**
 * A REAL submission: GET into a same-origin iframe, read back from its URL. The target is a static text file, which
 * every engine renders as a document (Firefox fires no `load` for a 404 or a download).
 */
async function submit(f = form()): Promise<[string, string][]> {
  const frame = document.createElement('iframe');
  frame.name = `echo${frames.length}`;
  document.body.append(frame);
  frames.push(frame);
  f.method = 'get';
  f.action = '/site/llms.txt';
  f.target = frame.name;
  const echoed = new Promise<void>((resolve) =>
    frame.addEventListener('load', () => {
      if (frame.contentWindow?.location.pathname == '/site/llms.txt') resolve();
    }),
  );
  f.requestSubmit();
  await echoed;
  return [...new URLSearchParams(frame.contentWindow?.location.search)];
}

describe('WP4-09 form participation (ElementInternals)', () => {
  it.each([
    ['name="loc"', [['loc', '48.85837,2.294481']], [['loc', '']]],
    [
      'lat-name="lat" lng-name="lng"',
      [
        ['lat', '48.85837'],
        ['lng', '2.294481'],
      ],
      [
        ['lat', ''],
        ['lng', ''],
      ],
    ],
    [
      'name="loc" lat-name="lat" lng-name="lng"',
      [
        ['loc', '48.85837,2.294481'],
        ['lat', '48.85837'],
        ['lng', '2.294481'],
      ],
      [
        ['loc', ''],
        ['lat', ''],
        ['lng', ''],
      ],
    ],
    ['', [], []],
  ] as const)('%s: FormData and a real submit', async (attrs, set, unset) => {
    const { el } = render(`<form><location-picker ${attrs}></location-picker></form>`);
    await flush();
    expect(entries()).toEqual(unset);
    expect(await submit()).toEqual(unset);
    el.setLocation(48.85837, 2.294481);
    expect(entries()).toEqual(set);
    expect(await submit()).toEqual(set);
    expect(el.checkValidity()).toBe(true);
  });

  it('address-name: "" while unknown, then the address once it resolves', async () => {
    const fake = createFakeAdapter({ geocoder });
    document.body.innerHTML =
      '<form><location-picker address-name="addr" name="loc" reverse-geocode></location-picker></form>';
    const el = document.querySelector('location-picker')!;
    el.provider = erased(fake.adapter);
    await flush();
    expect(entries()).toEqual([
      ['loc', ''],
      ['addr', ''],
    ]);
    el.setLocation(1, 2);
    expect(entries()).toEqual([
      ['loc', '1,2'],
      ['addr', ''],
    ]);
    await el.lookupAddress();
    expect(entries()).toEqual([
      ['loc', '1,2'],
      ['addr', 'Street 1'],
    ]);
    expect(await submit()).toEqual(entries());
  });

  it('disabled, or inside <fieldset disabled>: no entries, :disabled, no interaction', async () => {
    const { el, fake } = render(
      '<form><fieldset><location-picker name="loc" value="1,2"></location-picker></fieldset></form>',
    );
    await flush();
    const fieldset = document.querySelector('fieldset')!;
    fieldset.disabled = true;
    expect(entries()).toEqual([]);
    expect(el.matches(':disabled')).toBe(true);
    expect(fake.handle?.map.interactive).toBe('none');
    expect(part(el, 'fallback')).toHaveProperty('disabled', true);
    fieldset.disabled = false;
    expect(entries()).toEqual([['loc', '1,2']]);
    expect(fake.handle?.map.interactive).toBe('full');
    el.disabled = true;
    expect(entries()).toEqual([]);
    expect(el.matches(':disabled')).toBe(true);
    expect(fake.handle?.map.interactive).toBe('none');
  });

  it('bound inputs submit themselves; the picker adds only its own *-name entries', async () => {
    const { el, fake } = render(
      '<form><input name="lat" id="lat"><input name="lng" id="lng"><location-picker lat-input="lat" lng-input="lng" name="loc"></location-picker></form>',
    );
    await flush();
    await fake.userPan({ lat: 10, lng: 20 });
    expect(entries()).toEqual([
      ['lat', '10'],
      ['lng', '20'],
      ['loc', '10,20'],
    ]);
    // Cleared by a property write: the bound inputs become "" silently.
    const events: string[] = [];
    document.getElementById('lat')!.addEventListener('input', (e) => events.push(e.type));
    el.value = '';
    expect(entries()).toEqual([
      ['lat', ''],
      ['lng', ''],
      ['loc', ''],
    ]);
    expect(events).toEqual([]);
  });

  it('reset restores the value attribute silently and re-centres; the bound inputs mirror it', async () => {
    const { el, fake, log } = render(
      '<form><location-picker name="loc" value="1,2" value-input="v"></location-picker><input id="v" type="hidden"></form>',
    );
    await flush();
    await fake.userPan({ lat: 10, lng: 20 });
    const events = log.length;
    form().reset();
    expect(el.value).toBe('1,2');
    expect(fake.handle?.map.center).toEqual({ lat: 1, lng: 2 });
    expect((document.getElementById('v') as HTMLInputElement).value).toBe('1,2');
    expect(log).toHaveLength(events);
    expect(entries()).toEqual([['loc', '1,2']]);
  });

  it('reset: else lat/lng, else unset (back to center/zoom)', async () => {
    const { el, fake } = render(
      '<form><location-picker name="loc" lat="3" lng="4"></location-picker></form>',
    );
    await flush();
    await fake.userPan({ lat: 10, lng: 20 });
    form().reset();
    expect(el.value).toBe('3,4');
    el.removeAttribute('lat');
    el.removeAttribute('lng');
    el.setAttribute('center', '5,6');
    el.value = '7,8';
    form().reset();
    expect(el.value).toBe('');
    expect(fake.handle?.map.center).toEqual({ lat: 5, lng: 6 });
    expect(el.matches(':state(unset)')).toBe(true);
  });

  it(':required / :read-write never match, :read-only always does; [required]/[readonly] follow the attributes', async () => {
    const { el } = render('<form><location-picker required readonly></location-picker></form>');
    await flush();
    expect(el.matches(':required')).toBe(false);
    expect(el.matches(':read-write')).toBe(false);
    expect(el.matches(':read-only')).toBe(true);
    expect(el.matches('[required]')).toBe(true);
    expect(el.matches('[readonly]')).toBe(true);
    el.required = false;
    el.readOnly = false;
    expect(el.matches(':required, :read-write, [required], [readonly]')).toBe(false);
    expect(el.matches(':read-only')).toBe(true);
  });

  it('readonly gives willValidate === false', async () => {
    const { el } = render('<form><location-picker required readonly></location-picker></form>');
    await flush();
    expect(el.willValidate).toBe(false);
    expect(el.checkValidity()).toBe(true);
    el.readOnly = false;
    expect(el.willValidate).toBe(true);
    expect(el.checkValidity()).toBe(false);
  });

  it('required + unset gives valueMissing with messages.valueMissing; reportValidity() focuses the map', async () => {
    const { el } = render('<form><location-picker required></location-picker></form>');
    await flush();
    expect(el.validity.valueMissing).toBe(true);
    expect(el.validationMessage).toBe('Please choose a location on the map.');
    expect(form().checkValidity()).toBe(false);
    el.messages = { valueMissing: 'Pick a spot' };
    expect(el.validationMessage).toBe('Pick a spot');
    expect(el.reportValidity()).toBe(false);
    expect(el.shadowRoot?.activeElement).toBe(part(el, 'map'));
    el.setLocation(1, 2);
    expect(el.validity.valid).toBe(true);
  });

  it('required toggled while detached, then checkValidity() after re-append, never throws', async () => {
    const { el } = render('<form><location-picker></location-picker></form>');
    await flush();
    el.remove();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(() => {
      el.required = true;
      el.setCustomValidity('x');
      el.setCustomValidity('');
    }).not.toThrow();
    form().append(el);
    expect(() => el.checkValidity()).not.toThrow();
    expect(el.checkValidity()).toBe(false);
    await el.ready;
    expect(el.validity.valueMissing).toBe(true);
  });

  it('setCustomValidity gives customError; :state(interacted) follows the first commit', async () => {
    const { el } = render('<form><location-picker value="1,2"></location-picker></form>');
    await flush();
    el.setCustomValidity('Outside the delivery area');
    expect(el.validity.customError).toBe(true);
    expect(el.validationMessage).toBe('Outside the delivery area');
    expect(el.matches(':invalid')).toBe(true);
    expect(el.matches(':state(interacted)')).toBe(false);
    el.setLocation(3, 4);
    expect(el.matches(':state(interacted)')).toBe(true);
    expect(el.matches(':state(interacted):invalid')).toBe(true);
    el.setCustomValidity('');
    expect(el.matches(':valid')).toBe(true);
    form().reset();
    expect(el.matches(':state(interacted)')).toBe(false);
  });

  it('a history restore (formStateRestoreCallback, as bfcache/back-forward do) restores value, zoom and address', async () => {
    const { el, log } = render('<form><location-picker name="loc"></location-picker></form>');
    await flush();
    el.formStateRestoreCallback(JSON.stringify({ v: '1,2', z: 12, a: 'Here' }), 'restore');
    expect([el.value, el.zoom, el.address]).toEqual(['1,2', 12, 'Here']);
    expect(entries()).toEqual([['loc', '1,2']]);
    expect(summary(log)).toEqual(['ready']);
  });

  it('a *-name equal to a bound input name in the same form warns once', async () => {
    const console = spyConsole();
    render(
      '<form><input name="lat" id="lat"><location-picker lat-name="lat" lat-input="lat"></location-picker></form>',
    );
    await flush();
    expect(texts(console.warn).filter((t) => t.includes('submitted twice'))).toEqual([
      expect.stringContaining('lat-name="lat"'),
    ]);
  });
});

/** Markup of §8b: the bound inputs are children of the element (progressive enhancement). */
const PE = (tag: string, type = 'text'): string =>
  `<form><${tag} lat-input="lat" lng-input="lng" name="loc">` +
  `<input id="lat" name="lat" type="${type}" value="48.8584"><input id="lng" name="lng" type="${type}" value="2.2945">` +
  `</${tag}></form>`;

describe('WP4-10 progressive enhancement (child bound inputs)', () => {
  let tag = 0;
  /** A fresh tag per test, so "before define" really is before define. */
  function enhance(type?: string): {
    el: LocationPickerElement;
    fake: FakeControl;
    define: () => void;
  } {
    const name = `pe-picker-${++tag}`;
    document.body.innerHTML = PE(name, type);
    const fake = createFakeAdapter();
    const node = document.querySelector(name) as LocationPickerElement;
    Object.assign(node, { provider: erased(fake.adapter) });
    return {
      el: node,
      fake,
      define: () => void defineLocationPicker(name as `${string}-${string}`),
    };
  }
  const input = (id: string): HTMLInputElement => document.getElementById(id) as HTMLInputElement;

  it('visible before define, not rendered after it, still in FormData, seeding the value', async () => {
    const { el, define } = enhance();
    expect(input('lat').checkVisibility()).toBe(true);
    define();
    await flush();
    expect(input('lat').checkVisibility()).toBe(false);
    expect(el.value).toBe('48.8584,2.2945');
    // Tree order: the element, then its child inputs.
    expect(entries()).toEqual([
      ['loc', '48.8584,2.2945'],
      ['lat', '48.8584'],
      ['lng', '2.2945'],
    ]);
  });

  it('native events on the inputs: the host only sees CustomEvents; a listener on #lat itself fires', async () => {
    const { el, fake, define } = enhance();
    define();
    await flush();
    const host: Event[] = [];
    for (const type of ['input', 'change']) el.addEventListener(type, (e) => host.push(e));
    const own: string[] = [];
    input('lat').addEventListener('input', (e) => own.push(`${e.type}:${e.bubbles}`));
    input('lat').addEventListener('change', (e) => own.push(`${e.type}:${e.bubbles}`));
    await fake.userPan({ lat: 10, lng: 20 });
    expect(host.length).toBeGreaterThan(0);
    expect(host.every((e) => e instanceof CustomEvent && e.detail)).toBe(true);
    expect(own).toContain('input:false');
    expect(own.at(-1)).toBe('change:false');
    expect(input('lat').value).toBe('10');
  });

  it('reset: server values, a pan, then form.reset(): inputs and picker are back, with no events', async () => {
    const { el, fake, define } = enhance();
    define();
    await flush();
    await fake.userPan({ lat: 10, lng: 20 });
    expect([input('lat').value, el.value]).toEqual(['10', '10,20']);
    const log = record(el);
    const native: string[] = [];
    for (const type of ['input', 'change'])
      input('lat').addEventListener(type, (e) => native.push(e.type));
    form().reset();
    expect(el.value).toBe('48.8584,2.2945');
    expect([input('lat').value, input('lng').value]).toEqual(['48.8584', '2.2945']);
    expect(native).toEqual([]);
    expect(log).toEqual([]);
  });

  it('reset with hidden bound inputs OUTSIDE the element: both are back at the server values', async () => {
    const { el, fake } = render(
      '<form><input type="hidden" id="lat" name="lat" value="48.8584"><input type="hidden" id="lng" name="lng" value="2.2945">' +
        '<location-picker lat-input="lat" lng-input="lng"></location-picker></form>',
    );
    await flush();
    expect(el.value).toBe('48.8584,2.2945');
    await fake.userPan({ lat: 10, lng: 20 });
    expect(input('lat').getAttribute('value')).toBe('10');
    form().reset();
    expect(el.value).toBe('48.8584,2.2945');
    expect([input('lat').value, input('lng').value]).toEqual(['48.8584', '2.2945']);
    expect(entries()).toEqual([
      ['lat', '48.8584'],
      ['lng', '2.2945'],
    ]);
  });
});
