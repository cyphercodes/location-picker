// WP4-11: WP2-08's event assertions on the element, and inner search events contained (unit project).
import { parseLatLng } from '../../src/utils/parse.js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { position, stubGeolocation, unstubGeolocation } from '../core/helpers.js';
import {
  details,
  errors,
  flush,
  part,
  render,
  resetStore,
  spyConsole,
  summary,
} from './helpers.js';

beforeEach(() => {
  resetStore();
  spyConsole();
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  unstubGeolocation();
  document.body.innerHTML = '';
});

describe('WP4-11 events on the element', () => {
  it('a user pan gives live inputs, a final input, then exactly one change (source user)', async () => {
    const { el, fake, log } = render('<location-picker value="1,2"></location-picker>');
    await flush();
    await fake.userPath([
      { lat: 3, lng: 4 },
      { lat: 5, lng: 6 },
    ]);
    expect(summary(log)).toEqual([
      'ready',
      'input:3,4:user',
      'input:5,6:user',
      'input:5,6:user',
      'change:5,6:user',
    ]);
    expect(el.value).toBe('5,6');
  });

  it('a zoom gesture gives no input and no change', async () => {
    const { fake, log } = render('<location-picker value="1,2"></location-picker>');
    await flush();
    await fake.userZoom(2);
    expect(summary(log)).toEqual(['ready']);
  });

  it('setLocation() gives input then change (api) before it returns; a property write is silent', async () => {
    const { el, log } = render('<location-picker></location-picker>');
    await flush();
    el.setLocation(1, 2);
    expect(summary(log)).toEqual(['ready', 'input:1,2:api', 'change:1,2:api']);
    el.value = '3,4';
    el.setLocation(3, 4);
    expect(summary(log)).toHaveLength(3);
  });

  it('a locate result gives change with source geolocation and accuracy', async () => {
    stubGeolocation((success) => success(position(7, 8, 30)));
    const { el, log } = render('<location-picker></location-picker>');
    await flush();
    const detail = await el.locate();
    expect(detail).toMatchObject({ lat: 7, lng: 8, source: 'geolocation', accuracy: 30 });
    expect(summary(log).slice(-1)).toEqual(['change:7,8:geolocation']);
    await el.setCurrentPosition();
  });

  it('input is composed and bubbles, change bubbles and is not composed; error does not bubble and is cancelable', async () => {
    const { el, log } = render('<location-picker value="abc"></location-picker>');
    await flush();
    el.setLocation(1, 2);
    const event = (type: string): Event => log.find((entry) => entry.type == type)!.event;
    expect([event('input').bubbles, event('input').composed]).toEqual([true, true]);
    expect([event('change').bubbles, event('change').composed]).toEqual([true, false]);
    expect([event('ready').bubbles, event('ready').composed]).toEqual([false, false]);
    expect([event('error').bubbles, event('error').cancelable]).toEqual([false, true]);
    expect(errors(log).map((e) => e.code)).toEqual(['INVALID_VALUE']);
  });

  it('every detail satisfies the §12.10 invariants', async () => {
    const { el, fake, log } = render('<location-picker precision="3"></location-picker>');
    await flush();
    await fake.userPan({ lat: 10.123456, lng: 20.654321 });
    el.setLocation(-33.8688, 151.2093);
    for (const detail of [...details(log, 'input'), ...details(log, 'change')]) {
      expect(parseLatLng(detail.value)).toMatchObject({ lat: detail.lat, lng: detail.lng });
    }
    expect(el.value).toBe('-33.869,151.209');
  });

  it('a host listener never sees inner native input/change events; Enter in the search box is prevented', async () => {
    const { el, log } = render(
      '<form><location-picker search value="1,2"></location-picker></form>',
    );
    await flush();
    const search = part(el, 'search');
    const input = document.createElement('input');
    search.append(input);
    const seen: Event[] = [];
    for (const type of ['input', 'change']) el.addEventListener(type, (e) => seen.push(e));
    input.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
    input.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
    expect(seen).toEqual([]);
    const enter = new KeyboardEvent('keydown', {
      key: 'Enter',
      bubbles: true,
      composed: true,
      cancelable: true,
    });
    input.dispatchEvent(enter);
    expect(enter.defaultPrevented).toBe(true);
    expect(errors(log)).toEqual([]);
  });
});
