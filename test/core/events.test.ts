import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { GeocodeResult, Geocoder } from '../../src/core.js';
import { LocationPicker, LocationPickerError } from '../../src/core.js';
import { parseLatLng } from '../../src/utils.js';
import { createFakeAdapter, nextFrame } from '../fixtures/fake-adapter.js';
import {
  addressDetails,
  details,
  errors,
  eventOf,
  flush,
  isLocationDetail,
  mountPicker,
  position,
  query,
  resetStore,
  spyConsole,
  stubGeolocation,
  summary,
  unstubGeolocation,
  type Logged,
} from './helpers.js';

beforeEach(() => resetStore());
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  unstubGeolocation();
});

/** §12.10: every detail is self-consistent, and every change is preceded by an input carrying the same value. */
function checkInvariants(log: readonly Logged[]): void {
  const violations: string[] = [];
  let lastInput: string | undefined;
  for (const { type, detail } of log) {
    if (!isLocationDetail(detail)) continue;
    const parsed = parseLatLng(detail.value);
    if (parsed?.lat !== detail.lat || parsed.lng !== detail.lng)
      violations.push(`inconsistent ${detail.value}`);
    if (type == 'input') lastInput = detail.value;
    else if (lastInput !== detail.value)
      violations.push(`change ${detail.value} without its input`);
  }
  expect(violations).toEqual([]);
}

describe('WP2-08 events with the fake adapter', () => {
  it('(a) a user pan gives live inputs (one per frame), a final input, then exactly one change', async () => {
    const { picker, fake, log } = mountPicker({ value: '10,10' });
    await picker.ready;
    await fake.userPan({ lat: 11, lng: 12 }, { steps: 4 });
    const inputs = details(log, 'input');
    const changes = details(log, 'change');
    expect(inputs.length).toBeGreaterThanOrEqual(2);
    expect(inputs.length).toBeLessThanOrEqual(5);
    expect(inputs.every((d) => d.source == 'user')).toBe(true);
    expect(changes).toEqual([expect.objectContaining({ value: '11,12', source: 'user' })]);
    expect(summary(log).slice(-2)).toEqual(['input:11,12:user', 'change:11,12:user']);
    expect(picker.value).toBe('11,12');
    checkInvariants(log);
  });

  it('(a) many moves within one animation frame give one live input', async () => {
    const { picker, fake, log } = mountPicker({ value: '10,10' });
    await picker.ready;
    const events = fake.ctx!.events;
    events.interactionStart();
    for (let i = 1; i <= 10; i++) events.move({ lat: 10 + i / 10, lng: 10 });
    await nextFrame();
    await nextFrame();
    expect(summary(log).filter((s) => s.startsWith('input'))).toEqual(['input:11,10:user']);
    expect(details(log, 'change')).toEqual([]);
  });

  it('(b) a zoom gesture gives no input and no change', async () => {
    const { picker, fake, log } = mountPicker({ value: '10,10' });
    await picker.ready;
    await fake.userZoom(2);
    expect(picker.zoom).toBe(17);
    expect(summary(log)).toEqual(['ready']);
  });

  it('(c) setLocation() gives input then change (api) before it returns', async () => {
    const { picker, log } = mountPicker();
    await picker.ready;
    picker.setLocation(48.8584, 2.2945);
    expect(summary(log)).toEqual([
      'ready',
      'input:48.8584,2.2945:api',
      'change:48.8584,2.2945:api',
    ]);
    checkInvariants(log);
  });

  it('(d) a property write is silent, and setLocation() to the same value then gives no change', async () => {
    const { picker, log } = mountPicker();
    await picker.ready;
    picker.value = '1,2';
    await flush();
    picker.setLocation(1, 2);
    await flush();
    expect(summary(log)).toEqual(['ready']);
    expect(picker.value).toBe('1,2');
  });

  it('(e) a locate success gives change with source geolocation and accuracy', async () => {
    stubGeolocation((success) => success(position(48.8584, 2.2945, 25)));
    const { picker, log } = mountPicker();
    await picker.ready;
    const detail = await picker.locate();
    expect(detail).toMatchObject({ value: '48.8584,2.2945', source: 'geolocation', accuracy: 25 });
    expect(details(log, 'change')).toEqual([
      expect.objectContaining({ source: 'geolocation', accuracy: 25 }),
    ]);
  });

  it('(f) input is composed, change is not; error does not bubble and is cancelable', async () => {
    spyConsole();
    const { picker, log } = mountPicker({ value: 'abc' });
    await picker.ready;
    picker.setLocation(1, 2);
    const by = (type: string): Event => eventOf(log, type);
    expect([by('input').bubbles, by('input').composed]).toEqual([true, true]);
    expect([by('change').bubbles, by('change').composed]).toEqual([true, false]);
    expect([by('error').bubbles, by('error').cancelable]).toEqual([false, true]);
    expect([by('ready').bubbles, by('ready').composed]).toEqual([false, false]);
  });

  it('(g) the §12.10 invariants hold for every detail', async () => {
    const { picker, fake, log } = mountPicker({ precision: 3 });
    await picker.ready;
    await fake.userPan({ lat: 1.23456, lng: -179.99999 });
    picker.setLocation('48.858370, 2.294481');
    await fake.userPan({ lat: 48.8, lng: 2.3 }, { steps: 6 });
    expect(details(log, 'change').map((d) => d.value)).toEqual([
      '1.235,-180',
      '48.858,2.294',
      '48.8,2.3',
    ]);
    checkInvariants(log);
  });

  it('(h) callbacks run right before their event; onLocationChange acts like onChange and runs once after ready', async () => {
    spyConsole();
    const order: string[] = [];
    const geocoder: Geocoder = { reverse: async (at) => ({ ...at, label: 'Here' }) };
    document.body.innerHTML = '<div id="map"></div>';
    const fake = createFakeAdapter();
    const picker = new LocationPicker('#map', {
      provider: fake.adapter,
      value: '1,2',
      geocoder,
      onInput: (d) => order.push(`onInput:${d.value}`),
      onChange: (d) => order.push(`onChange:${d.value}`),
      onAddressChange: (d) => order.push(`onAddressChange:${d.address}`),
      onReady: (d) => order.push(`onReady:${d.provider}`),
      onLocationChange: (d) => order.push(`onLocationChange:${d.value}:${d.source}`),
    });
    for (const type of ['input', 'change', 'addresschange', 'ready']) {
      picker.addEventListener(type, () => order.push(type));
    }
    await picker.ready;
    await flush();
    picker.setLocation(3, 4);
    await picker.lookupAddress();
    expect(order).toEqual([
      'onReady:fake',
      'ready',
      'onLocationChange:1,2:api',
      'onInput:3,4',
      'input',
      'onChange:3,4',
      'onLocationChange:3,4:api',
      'change',
      'onAddressChange:Here',
      'addresschange',
    ]);
  });

  it('(h) onError runs before the event and marks it handled; onLocationChange never runs after ready while unset', async () => {
    const log = spyConsole();
    const seen: string[] = [];
    document.body.innerHTML = '<div id="map"></div>';
    const picker = new LocationPicker('#map', {
      provider: createFakeAdapter().adapter,
      value: 'nope',
      onError: (e) => seen.push(`onError:${e.code}`),
      onLocationChange: () => seen.push('onLocationChange'),
    });
    picker.addEventListener('error', () => seen.push('error'));
    await picker.ready;
    await flush();
    expect(seen).toEqual(['onError:INVALID_VALUE', 'error']);
    expect(log.warn).not.toHaveBeenCalledWith(expect.stringContaining('not a coordinate'));
  });

  it('(i) a pan through X and back to the committed value ends with an input of the start value and no change', async () => {
    const { picker, fake, log } = mountPicker({ value: '10,10' });
    await picker.ready;
    await fake.userPath([
      { lat: 10.5, lng: 10.5 },
      { lat: 11, lng: 11 },
      { lat: 10, lng: 10 },
    ]);
    const inputs = details(log, 'input').map((d) => d.value);
    expect(inputs.length).toBeGreaterThanOrEqual(2);
    expect(inputs.at(-1)).toBe('10,10');
    expect(inputs).toContain('11,11');
    expect(details(log, 'change')).toEqual([]);
    expect(picker.value).toBe('10,10');
  });

  it('a pan that starts unset commits (leaving unset), even when it returns to the start', async () => {
    const { picker, fake, log } = mountPicker();
    await picker.ready;
    await fake.userPath([
      { lat: 21, lng: 1 },
      { lat: 20, lng: 0 },
    ]);
    expect(details(log, 'change')).toEqual([
      expect.objectContaining({ value: '20,0', source: 'user' }),
    ]);
  });

  it('engine echoes of programmatic moves never produce events', async () => {
    const { picker, fake, log } = mountPicker({ value: '5,5' });
    await picker.ready;
    picker.value = '6,6';
    picker.zoom = 9;
    fake.handle!.setView({ lat: 7, lng: 7 }, 3, { animate: false });
    await flush();
    expect(summary(log)).toEqual(['ready']);
    expect(fake.calls.setView.at(0)).toMatchObject({ center: { lat: 6, lng: 6 } });
  });

  it('a click (press without movement) does not leave a gesture open', async () => {
    const { picker, fake, log } = mountPicker({ value: '5,5' });
    await picker.ready;
    const events = fake.ctx!.events;
    events.interactionStart();
    events.interactionEnd();
    // a later engine settle is not attributed to the user
    events.moveEnd({ lat: 6, lng: 6 }, 15);
    expect(summary(log)).toEqual(['ready']);
  });

  it('readOnly: zoom works, a pan never changes the value', async () => {
    const { picker, fake, log } = mountPicker({ value: '5,5', readOnly: true });
    await picker.ready;
    expect(fake.handle!.map.interactive).toBe('zoom-only');
    await fake.userPan({ lat: 6, lng: 6 });
    expect(picker.value).toBe('5,5');
    expect(summary(log)).toEqual(['ready']);
    picker.readOnly = false;
    expect(fake.handle!.map.interactive).toBe('full');
  });

  it('setLocation() before ready is applied and dispatched right after ready', async () => {
    const { picker, log } = mountPicker({}, { sync: false, loadDelayMs: 5 });
    picker.setLocation(1, 2, { zoom: 9 });
    expect(picker.value).toBe('');
    await picker.ready;
    await flush();
    expect(summary(log)).toEqual(['ready', 'input:1,2:api', 'change:1,2:api']);
    expect(picker.zoom).toBe(9);
  });
});

describe('WP2-09 unhandled errors', () => {
  it('logs once via console[level] with [location-picker] and Fix:', async () => {
    const log = spyConsole();
    const { picker } = mountPicker({ value: 'abc' });
    await picker.ready;
    await flush();
    expect(log.warn).toHaveBeenCalledTimes(1);
    expect(log.warn.mock.calls[0]?.[0]).toMatch(/^\[location-picker\] .*Fix: /);
    expect(log.error).not.toHaveBeenCalled();
  });

  it('is not logged when a listener calls preventDefault() or an onError exists', async () => {
    const log = spyConsole();
    document.body.innerHTML = '<div id="a"></div><div id="b"></div>';
    const a = new LocationPicker('#a', { provider: createFakeAdapter().adapter, value: 'abc' });
    a.addEventListener('error', (event) => event.preventDefault());
    const b = new LocationPicker('#b', {
      provider: createFakeAdapter().adapter,
      value: 'xyz',
      onError: () => {},
    });
    await Promise.all([a.ready, b.ready]);
    await flush();
    expect(log.warn).not.toHaveBeenCalled();
  });

  it('a load failure is logged at its level (error) and ready rejects', async () => {
    const log = spyConsole();
    const { picker, log: events } = mountPicker({}, { failWith: 'ENGINE_LOAD_FAILED' });
    await expect(picker.ready).rejects.toMatchObject({ code: 'ENGINE_LOAD_FAILED' });
    await flush();
    expect(errors(events).map((e) => e.code)).toEqual(['ENGINE_LOAD_FAILED']);
    expect(log.error).toHaveBeenCalledTimes(1);
  });

  it('ABORTED is never logged', async () => {
    const log = spyConsole();
    const { picker } = mountPicker({}, { loadDelayMs: 20 });
    const ready = picker.ready;
    picker.destroy();
    await expect(ready).rejects.toMatchObject({ code: 'ABORTED' });
    await new Promise((resolve) => setTimeout(resolve, 40));
    expect([log.warn, log.error, log.info].map((spy) => spy.mock.calls.length)).toEqual([0, 0, 0]);
  });

  it('an un-awaited rejected ready produces no unhandledrejection', async () => {
    spyConsole();
    const unhandled = vi.fn<(reason: unknown) => void>();
    process.on('unhandledRejection', unhandled);
    try {
      const { picker } = mountPicker({}, { failWith: 'ENGINE_MISSING' });
      void picker.ready; // read, never handled
      await new Promise((resolve) => setTimeout(resolve, 30));
      expect(unhandled).not.toHaveBeenCalled();
    } finally {
      process.off('unhandledRejection', unhandled);
    }
  });
});

describe('WP2-11 lenient value handling', () => {
  it.each([
    ['48.8584, 2.2945', '48.8584,2.2945'],
    [{ lat: 48.8584, lng: 2.2945 }, '48.8584,2.2945'],
    ['geo:48.8584,2.2945', '48.8584,2.2945'],
  ])('value %j -> %s', async (value, expected) => {
    const { picker } = mountPicker({ value });
    expect(picker.value).toBe(expected);
    const [lat, lng] = expected.split(',').map(Number);
    expect(picker.valueAsLatLng).toEqual({ lat, lng });
  });

  it('"," is unset with no warning', async () => {
    const log = spyConsole();
    const { picker, log: events } = mountPicker({ value: ',' });
    await flush();
    expect(picker.value).toBe('');
    expect(errors(events)).toEqual([]);
    expect(log.warn).not.toHaveBeenCalled();
  });

  it.each([
    ['abc', /not a coordinate/],
    [[1, 2], /GeoJSON/],
    ['120,45', /"45,120"/],
    ['95,10', /did you swap lat and lng\? try "10,95"/],
  ])('%j leaves it unset with INVALID_VALUE (warn)', async (value, message) => {
    spyConsole();
    const options = {};
    Reflect.set(options, 'value', value); // untyped callers pass anything
    const { picker, log } = mountPicker(options);
    await flush();
    expect(picker.value).toBe('');
    expect(errors(log)).toEqual([
      expect.objectContaining({ code: 'INVALID_VALUE', level: 'warn' }),
    ]);
    expect(errors(log)[0]?.message).toMatch(message);
  });

  it('the value setter is lenient too, and "95,10" stays unset with INVALID_VALUE', async () => {
    spyConsole();
    const { picker, log } = mountPicker({ value: '1,1' });
    await picker.ready;
    picker.value = '95,10';
    expect(picker.value).toBe('');
    expect(errors(log)).toEqual([]); // never synchronously from a setter
    await flush();
    expect(errors(log).map((e) => e.code)).toEqual(['INVALID_VALUE']);
    expect(summary(log).filter((s) => s.startsWith('change'))).toEqual([]);
  });

  it('setLocation("abc") throws INVALID_VALUE', async () => {
    const { picker } = mountPicker();
    expect(() => picker.setLocation('abc')).toThrow(LocationPickerError);
    expect(() => picker.setLocation('abc')).toThrow(
      expect.objectContaining({ code: 'INVALID_VALUE' }),
    );
    expect(() => picker.setLocation('')).toThrow(
      expect.objectContaining({ code: 'INVALID_VALUE' }),
    );
  });

  it('setLocation(95, 10) commits "90,10" (api) and warns once with the swap hint', async () => {
    const log = spyConsole();
    const { picker, log: events } = mountPicker();
    await picker.ready;
    picker.setLocation(95, 10);
    picker.setLocation(95, 10);
    expect(summary(events)).toEqual(['ready', 'input:90,10:api', 'change:90,10:api']);
    expect(log.warn).toHaveBeenCalledTimes(1);
    expect(log.warn.mock.calls[0]?.[0]).toContain('(10, 95)');
  });

  it('value = {lat: -91, lng: 0} sets "-90,0" silently with one warning', async () => {
    const log = spyConsole();
    const { picker, log: events } = mountPicker();
    await picker.ready;
    picker.value = { lat: -91, lng: 0 };
    await flush();
    expect(picker.value).toBe('-90,0');
    expect(summary(events)).toEqual(['ready']);
    expect(log.warn).toHaveBeenCalledTimes(1);
  });

  it('deprecated {lat: 95, lng: 10} options start at "90,10"', async () => {
    spyConsole();
    const { picker } = mountPicker({ lat: 95, lng: 10 });
    expect(picker.value).toBe('90,10');
  });
});

describe('WP2-19 diagnostics from the class', () => {
  it('an unknown option key gives one warning listing the valid keys', () => {
    const log = spyConsole();
    const options = {};
    Reflect.set(options, 'lattitude', 1);
    mountPicker(options);
    expect(log.warn).toHaveBeenCalledTimes(1);
    expect(log.warn.mock.calls[0]?.[0]).toMatch(
      /Unknown option "lattitude".*Valid options: provider, value, center/,
    );
  });

  it('each deprecated key gives one deprecation warning', () => {
    const log = spyConsole();
    mountPicker({ lat: 1, lng: 2, setCurrentPosition: false, onLocationChange: () => {} });
    const texts = log.warn.mock.calls.map((call) => String(call[0]));
    expect(texts).toHaveLength(4);
    for (const key of ['lat option', 'lng option', 'setCurrentPosition', 'onLocationChange']) {
      expect(texts.filter((t) => t.includes(key))).toHaveLength(1);
    }
  });
});

describe('WP2-20 live region', () => {
  it('announces once, 700 ms after a commit, never during a pan, and again when the address resolves', async () => {
    vi.useFakeTimers();
    const geocoder: Geocoder = {
      reverse: async (at): Promise<GeocodeResult> => ({
        ...at,
        label: 'Champ de Mars',
        address: 'Champ de Mars, Paris',
      }),
    };
    const { picker, fake, log } = mountPicker({ value: '1,1', reverseGeocode: true, geocoder });
    await vi.advanceTimersByTimeAsync(0);
    const status = query(picker.element, '.lp-status', HTMLElement);
    const pan = fake.userPan({ lat: 48.8584, lng: 2.2945 }, { steps: 5 });
    await vi.advanceTimersByTimeAsync(70);
    expect(details(log, 'input').length).toBeGreaterThanOrEqual(3);
    expect(status.textContent).toBe('');
    await vi.advanceTimersByTimeAsync(30);
    await pan;
    expect(details(log, 'change')).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(399);
    expect(status.textContent).toBe('');
    await vi.advanceTimersByTimeAsync(10); // reverse geocode (400 ms) resolves
    expect(addressDetails(log)).toEqual([
      expect.objectContaining({ address: 'Champ de Mars, Paris' }),
    ]);
    await vi.advanceTimersByTimeAsync(280);
    expect(status.textContent).toBe('');
    await vi.advanceTimersByTimeAsync(710);
    expect(status.textContent).toBe('Location set: 48.85840, 2.29450. Champ de Mars, Paris');
  });

  it('announces the commit text 700 ms after setLocation()', async () => {
    vi.useFakeTimers();
    const { picker } = mountPicker();
    await vi.advanceTimersByTimeAsync(0);
    const status = query(picker.element, '.lp-status', HTMLElement);
    picker.setLocation(1, 2);
    await vi.advanceTimersByTimeAsync(699);
    expect(status.textContent).toBe('');
    await vi.advanceTimersByTimeAsync(1);
    expect(status.textContent).toBe('Location set: 1.00000, 2.00000');
  });
});
