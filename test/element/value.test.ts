// WP4-04 (lat/lng default-value alias, D10, D19) and WP4-05 (lenient value attribute, D4), unit project.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { errors, flush, render, resetStore, spyConsole, summary, texts } from './helpers.js';

let console: ReturnType<typeof spyConsole>;
beforeEach(() => {
  resetStore();
  console = spyConsole();
});
afterEach(() => {
  vi.restoreAllMocks();
  document.body.innerHTML = '';
});

const warnings = (part: string): string[] => texts(console.warn).filter((t) => t.includes(part));

describe('WP4-04 lat + lng', () => {
  it('both attributes set the default value', async () => {
    const { el, fake, log } = render('<location-picker lat="48.8" lng="2.3"></location-picker>');
    expect(el.value).toBe('48.8,2.3');
    expect(el.defaultValue).toBe('');
    await flush();
    expect(fake.handle?.map.center).toEqual({ lat: 48.8, lng: 2.3 });
    expect(fake.handle?.map.zoom).toBe(15);
    expect(errors(log)).toEqual([]);
  });

  it('only one of them gives an INVALID_OPTION error event at level warn (console.warn, never console.error)', async () => {
    const { el, log } = render('<location-picker lat="48.8"></location-picker>');
    await flush();
    const [error] = errors(log);
    expect(error).toMatchObject({ code: 'INVALID_OPTION', level: 'warn' });
    expect(el.value).toBe('');
    expect(warnings('lat and lng must be given together')).toHaveLength(1);
    expect(texts(console.error)).toEqual([]);
  });

  it('value wins over lat/lng', async () => {
    const { el } = render('<location-picker value="1,2" lat="3" lng="4"></location-picker>');
    expect(el.value).toBe('1,2');
    await flush();
    expect(el.value).toBe('1,2');
  });

  it('el.lat = 1; el.lng = 2 writes the attributes, with no lat-only error; the getters are live', async () => {
    const { el, fake, log } = render('<location-picker></location-picker>');
    await flush();
    el.lat = 1;
    el.lng = 2;
    expect(el.getAttribute('lat')).toBe('1');
    expect(el.getAttribute('lng')).toBe('2');
    expect([el.lat, el.lng]).toEqual([1, 2]);
    await flush();
    expect(errors(log)).toEqual([]);
    expect(summary(log)).toEqual(['ready']);
    await fake.userPan({ lat: 5, lng: 6 });
    expect([el.lat, el.lng]).toEqual([5, 6]);
    el.value = '';
    expect([el.lat, el.lng]).toEqual([null, null]);
  });

  it('lat="95" lng="10" starts at "90,10" with one clamp warning', async () => {
    const { el } = render('<location-picker lat="95" lng="10"></location-picker>');
    expect(el.value).toBe('90,10');
    await flush();
    expect(warnings('latitude 95 was clamped to 90')).toHaveLength(1);
    expect(warnings('did you swap lat and lng? try (10, 95)')).toHaveLength(1);
  });

  it('once dirty by a pan, lat/lng changes do not move the map and warn exactly once', async () => {
    const { el, fake, log } = render('<location-picker lat="1" lng="2"></location-picker>');
    await flush();
    await fake.userPan({ lat: 10, lng: 20 });
    const events = log.length;
    el.setAttribute('lat', '30');
    el.lng = 40;
    el.lat = 50;
    await flush();
    expect(el.value).toBe('10,20');
    expect(fake.handle?.map.center).toEqual({ lat: 10, lng: 20 });
    expect(log).toHaveLength(events);
    expect(warnings('bind value=')).toEqual([
      '[location-picker] lat/lng only set the initial value; bind value="lat,lng" or call setLocation()',
    ]);
  });

  it("once dirty by el.value = '' (as v-model does), a lat/lng change is ignored with the warning", async () => {
    const { el } = render('<location-picker></location-picker>');
    el.value = '';
    await flush();
    el.lat = 1;
    el.lng = 2;
    expect(el.value).toBe('');
    expect(warnings('bind value=')).toHaveLength(1);
  });

  it('a dirty-free lat/lng change applies silently', async () => {
    const { el, fake, log } = render('<location-picker lat="1" lng="2"></location-picker>');
    await flush();
    el.lat = 3;
    expect(el.value).toBe('3,2');
    expect(fake.handle?.map.center).toEqual({ lat: 3, lng: 2 });
    expect(summary(log)).toEqual(['ready']);
  });
});

describe('WP4-05 lenient value attribute', () => {
  it.each([
    ['48.8584, 2.2945', '48.8584,2.2945'],
    ['geo:48.8584,2.2945', '48.8584,2.2945'],
    ['48°51\'30.2"N 2°17\'40.2"E', '48.858389,2.2945'],
  ])('%s parses to %s', (input, expected) => {
    const { el } = render(`<location-picker></location-picker>`);
    el.setAttribute('value', input);
    expect(el.value).toBe(expected);
    expect(el.defaultValue).toBe(input);
  });

  it('"," means unset with no warning and no error', async () => {
    const { el, log } = render('<location-picker value=","></location-picker>');
    await flush();
    expect(el.value).toBe('');
    expect(errors(log)).toEqual([]);
    expect(texts(console.warn).filter((t) => !t.includes('inert'))).toEqual([]);
  });

  it('invalid input gives an INVALID_VALUE event (warn) and unset', async () => {
    const { el, log } = render('<location-picker value="120,45"></location-picker>');
    await flush();
    expect(el.value).toBe('');
    const [error] = errors(log);
    expect(error).toMatchObject({ code: 'INVALID_VALUE', level: 'warn' });
    expect(error?.message).toContain('did you swap lat and lng? try "45,120"');
    expect(warnings('INVALID_VALUE'.toLowerCase())).toEqual([]);
  });

  it('a changed value attribute applies while not dirty, silently', async () => {
    const { el, fake, log } = render('<location-picker value="1,2"></location-picker>');
    await flush();
    el.setAttribute('value', '3,4');
    expect(el.value).toBe('3,4');
    expect(fake.handle?.map.center).toEqual({ lat: 3, lng: 4 });
    el.defaultValue = '5,6';
    expect(el.getAttribute('value')).toBe('5,6');
    expect(el.value).toBe('5,6');
    expect(summary(log)).toEqual(['ready']);
  });

  it('while dirty it only updates defaultValue, with no warning', async () => {
    const { el } = render('<location-picker value="1,2"></location-picker>');
    await flush();
    el.value = '7,8';
    el.setAttribute('value', '3,4');
    expect(el.value).toBe('7,8');
    expect(el.defaultValue).toBe('3,4');
    expect(warnings('bind value=')).toEqual([]);
  });

  it('the value property is lenient and silent; an invalid string clears with INVALID_VALUE in a microtask', async () => {
    const { el, log } = render('<location-picker value="1,2"></location-picker>');
    await flush();
    el.value = '48.8584, 2.2945';
    expect(el.value).toBe('48.8584,2.2945');
    el.valueAsLatLng = { lat: -91, lng: 0 };
    expect(el.value).toBe('-90,0');
    expect(warnings('latitude -91 was clamped to -90')).toHaveLength(1);
    el.value = 'abc';
    expect(errors(log)).toEqual([]);
    expect(el.value).toBe('');
    await flush();
    expect(errors(log).map((e) => e.code)).toEqual(['INVALID_VALUE']);
    expect(summary(log).filter((t) => /^(input|change)/.test(t))).toEqual([]);
  });

  it('setLocation() commits (api) and throws INVALID_VALUE for a string that does not parse', async () => {
    const { el, log } = render('<location-picker></location-picker>');
    el.setLocation(1, 2);
    expect(() => el.setLocation('abc')).toThrow(expect.objectContaining({ code: 'INVALID_VALUE' }));
    await flush();
    expect(summary(log)).toEqual(['ready', 'input:1,2:api', 'change:1,2:api']);
    el.setLocation('3, 4', { zoom: 9 });
    expect(el.zoom).toBe(9);
    expect(summary(log).slice(-2)).toEqual(['input:3,4:api', 'change:3,4:api']);
  });

  it('precision re-formats the value silently', async () => {
    const { el, log } = render('<location-picker value="1.123456,2.654321"></location-picker>');
    await flush();
    el.precision = 2;
    expect(el.value).toBe('1.12,2.65');
    expect(summary(log)).toEqual(['ready']);
  });
});
