import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Geocoder } from '../../src/core.js';
import { LocationPicker } from '../../src/core.js';
import { createFakeAdapter } from '../fixtures/fake-adapter.js';
import {
  flush,
  inputById,
  isLocationDetail,
  must,
  query,
  record,
  resetStore,
  spyConsole,
  summary,
  texts,
} from './helpers.js';

beforeEach(() => resetStore());
afterEach(() => vi.restoreAllMocks());

const FORM = `
  <form id="form">
    <div id="map"></div>
    <input id="lat" name="lat"><input id="lng" name="lng">
    <input id="loc" name="loc"><textarea id="addr" name="addr"></textarea>
  </form>`;

const fieldValue = (target: EventTarget | null): string =>
  target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement ? target.value : '?';
const value = (id: string): string => fieldValue(document.getElementById(id));
const detailValue = (event: Event): string =>
  event instanceof CustomEvent && isLocationDetail(event.detail) ? event.detail.value : '?';

/** A class picker bound to #lat/#lng/#loc/#addr, with one log for the inputs' native events and the picker's. */
function bound(options: object = {}, html = FORM) {
  document.body.innerHTML = html;
  const fake = createFakeAdapter();
  const log: string[] = [];
  for (const id of ['lat', 'lng', 'loc', 'addr']) {
    const input = document.getElementById(id);
    for (const type of ['input', 'change'])
      input?.addEventListener(type, (e) => log.push(`#${id}:${e.type}:${fieldValue(e.target)}`));
  }
  const picker = new LocationPicker('#map', {
    provider: fake.adapter,
    latInput: 'lat',
    lngInput: '#lng',
    valueInput: 'loc',
    addressInput: 'addr',
    ...options,
  });
  for (const type of ['input', 'change'])
    picker.addEventListener(type, (e) => log.push(`picker:${type}:${detailValue(e)}`));
  return { picker, fake, log };
}

describe('WP2-17 bound inputs (D18)', () => {
  it('receive the rounded values', async () => {
    const { picker } = bound({ precision: 4 });
    await picker.ready;
    picker.setLocation(48.858370123, 2.294481);
    expect([value('lat'), value('lng'), value('loc')]).toEqual([
      '48.8584',
      '2.2945',
      '48.8584,2.2945',
    ]);
  });

  it('a pan gives a native input per live frame and ONE change at the commit, before the picker events', async () => {
    const { picker, fake, log } = bound({ value: '10,10' });
    await picker.ready;
    log.length = 0;
    await fake.userPan({ lat: 11, lng: 12 }, { steps: 3 });
    const lat = log.filter((l) => l.startsWith('#lat'));
    expect(lat.filter((l) => l.includes(':change:'))).toEqual(['#lat:change:11']);
    expect(lat.filter((l) => l.includes(':input:')).length).toBeGreaterThanOrEqual(2);
    // the commit: every input's input + change, then the picker's input + change
    expect(log.slice(-10)).toEqual([
      '#loc:input:11,12',
      '#loc:change:11,12',
      '#lat:input:11',
      '#lat:change:11',
      '#lng:input:12',
      '#lng:change:12',
      '#addr:input:',
      '#addr:change:',
      'picker:input:11,12',
      'picker:change:11,12',
    ]);
    const live = log.indexOf('#lat:input:10.333333');
    expect(live).toBeGreaterThanOrEqual(0);
    expect(log[live + 2]).toBe('picker:input:10.333333,10.666667');
  });

  it('setLocation() gives input + change; property writes give none', async () => {
    const { picker, log } = bound();
    await picker.ready;
    picker.setLocation(1, 2);
    expect(log).toEqual([
      '#loc:input:1,2',
      '#loc:change:1,2',
      '#lat:input:1',
      '#lat:change:1',
      '#lng:input:2',
      '#lng:change:2',
      '#addr:input:',
      '#addr:change:',
      'picker:input:1,2',
      'picker:change:1,2',
    ]);
    log.length = 0;
    picker.value = '3,4';
    picker.valueAsLatLng = null;
    await flush();
    expect(log).toEqual([]);
    expect([value('lat'), value('lng'), value('loc')]).toEqual(['', '', '']);
  });

  it('class mode: the events bubble, also from inputs inside the target; listeners on the input fire', async () => {
    const html = '<div id="map"><input id="lat"><input id="lng"></div>';
    const { picker, log } = bound({ valueInput: undefined, addressInput: undefined }, html);
    await picker.ready;
    const bubbled: string[] = [];
    document.addEventListener('change', (e) =>
      bubbled.push(e.target instanceof Element ? e.target.id : '?'),
    );
    picker.setLocation(1, 2);
    expect(bubbled).toEqual(['lat', 'lng']);
    expect(log).toContain('#lat:change:1');
  });

  it('seed the initial value when there is no value, and are read before anything is written', async () => {
    document.body.innerHTML =
      '<div id="map"></div><input id="lat" value="48.8584"><input id="lng" value="2.2945">';
    const order: string[] = [];
    for (const id of ['lat', 'lng']) {
      const input = inputById(id);
      const descriptor = must(Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value'));
      Object.defineProperty(input, 'value', {
        configurable: true,
        get(): string {
          order.push(`read:${id}`);
          const current: unknown = descriptor.get?.call(this);
          return String(current);
        },
        set(text: string) {
          order.push(`write:${id}`);
          descriptor.set?.call(this, text);
        },
      });
    }
    const picker = new LocationPicker('#map', {
      provider: createFakeAdapter().adapter,
      latInput: 'lat',
      lngInput: 'lng',
    });
    expect(picker.value).toBe('48.8584,2.2945');
    expect(picker.zoom).toBe(15);
    const firstWrite = order.findIndex((o) => o.startsWith('write'));
    expect(order.slice(0, firstWrite)).toEqual(expect.arrayContaining(['read:lat', 'read:lng']));
    expect(order.indexOf('read:lat')).toBeLessThan(firstWrite);
  });

  it('a value option wins over the inputs, which then mirror it', () => {
    document.body.innerHTML =
      '<div id="map"></div><input id="lat" value="1"><input id="lng" value="2">';
    const picker = new LocationPicker('#map', {
      provider: createFakeAdapter().adapter,
      value: '3,4',
      latInput: 'lat',
      lngInput: 'lng',
    });
    expect(picker.value).toBe('3,4');
    expect(value('lat')).toBe('3');
  });

  it('empty inputs are never written "" at init; invalid ones report INVALID_VALUE', async () => {
    spyConsole();
    document.body.innerHTML =
      '<div id="map"></div><input id="lat" value="abc"><input id="lng" value="2">';
    const picker = new LocationPicker('#map', {
      provider: createFakeAdapter().adapter,
      latInput: 'lat',
      lngInput: 'lng',
    });
    const events = record(picker);
    await flush();
    expect(picker.value).toBe('');
    expect(value('lat')).toBe('abc');
    expect(summary(events)).toContain('error:INVALID_VALUE');
  });

  it('an id is tried before a selector', async () => {
    document.body.innerHTML = '<div id="map"></div><input class="first"><input id="input">';
    const picker = new LocationPicker('#map', {
      provider: createFakeAdapter().adapter,
      valueInput: 'input',
    });
    await picker.ready;
    picker.setLocation(1, 2);
    expect(value('input')).toBe('1,2');
    expect(query(document, '.first', HTMLInputElement).value).toBe('');
  });

  it('warns once for a reference that resolves to nothing, and for required hidden inputs', () => {
    const log = spyConsole();
    document.body.innerHTML = '<div id="map"></div><input type="hidden" id="lat" required>';
    expect(
      () =>
        new LocationPicker('#map', {
          provider: createFakeAdapter().adapter,
          latInput: 'lat',
          lngInput: '#nope',
        }),
    ).not.toThrow();
    expect(texts(log.warn)).toEqual([
      expect.stringContaining('put required on <location-picker>'),
      expect.stringContaining('lngInput: no input matches "#nope"'),
    ]);
  });

  it('the address input follows search picks and reverse lookups with input + change', async () => {
    const reverse = vi.fn<NonNullable<Geocoder['reverse']>>(async (at) => ({
      ...at,
      label: 'Somewhere',
    }));
    const { picker, log } = bound({ value: '1,2', geocoder: { reverse } });
    await picker.ready;
    log.length = 0;
    await picker.lookupAddress();
    expect(value('addr')).toBe('Somewhere');
    expect(log).toEqual(['#addr:input:Somewhere', '#addr:change:Somewhere']);
    expect(picker.address).toBe('Somewhere');
  });
});
