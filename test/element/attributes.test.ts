// WP4-03 (attribute table), WP4-06 (wrong guesses) and WP4-21 (framework property assignment), unit project.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CLASS_ONLY_KEYS, OPTION_KEYS } from '../../src/core/config.js';
import { erased } from '../../src/core/providers.js';
import type { LocationPickerAttributes } from '../../src/element.js';
import {
  ATTRIBUTES,
  UPGRADE_PROPERTIES,
  WRONG_GUESS_ATTRIBUTES,
} from '../../src/element/attributes.js';
import { LocationPickerElement } from '../../src/element/location-picker-element.js';
import { createFakeAdapter } from '../fixtures/fake-adapter.js';
import { position, stubGeolocation, unstubGeolocation } from '../core/helpers.js';
import { create, define, flush, part, render, resetStore, spyConsole, texts } from './helpers.js';

/** Object members that are properties only (§3.2), and the platform's own attributes. */
const PROPERTY_ONLY = ['engine', 'mapOptions', 'geocoder', 'messages', 'geolocation'];
const NATIVE = ['lang', 'nonce'];

beforeEach(() => {
  resetStore();
  define();
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  unstubGeolocation();
  document.body.innerHTML = '';
});

/** A value of the row's kind, and what the property reads back for it. */
function sample(spec: (typeof ATTRIBUTES)[number]): { attr: string; prop: unknown } {
  switch (spec.kind) {
    case 'boolean':
      return { attr: '', prop: true };
    case 'number':
      return { attr: '7', prop: 7 };
    case 'enum': {
      const value = spec.values?.[1] ?? 'x';
      return { attr: value, prop: value };
    }
    case 'latlng':
      return { attr: '1.5,2.5', prop: '1.5,2.5' };
    default:
      return { attr: `my-${spec.prop}`, prop: `my-${spec.prop}` };
  }
}

const reflected = ATTRIBUTES.filter((spec) => !NATIVE.includes(spec.attr));

describe('WP4-03 ATTRIBUTES table', () => {
  beforeEach(() => spyConsole());

  it.each(reflected.map((spec) => [spec.attr, spec] as const))(
    '%s: attribute -> property, property -> attribute when reflected',
    (_, spec) => {
      const { el } = create();
      const { attr, prop } = sample(spec);
      // lat/lng are a pair (the default-value alias): set the partner too.
      if (spec.attr == 'lat') el.setAttribute('lng', '3');
      if (spec.attr == 'lng') el.setAttribute('lat', '3');
      el.setAttribute(spec.attr, attr);
      expect(Reflect.get(el, spec.prop)).toEqual(prop);

      el.removeAttribute(spec.attr);
      Reflect.set(el, spec.prop, prop);
      expect(el.getAttribute(spec.attr)).toBe(spec.reflect ? attr : null);
    },
  );

  it('boolean properties remove their attribute (and its alias) when set to false', () => {
    const { el } = create();
    el.setAttribute('reversegeocode', '');
    expect(el.reverseGeocode).toBe(true);
    el.reverseGeocode = false;
    expect(el.hasAttribute('reversegeocode')).toBe(false);
    expect(el.reverseGeocode).toBe(false);
  });

  it.each(reflected.filter((spec) => spec.alias).map((spec) => [spec.alias, spec] as const))(
    'the hyphen-less alias %s works, and the hyphenated form wins when both are present',
    (_, spec) => {
      const { el } = create();
      const { attr, prop } = sample(spec);
      el.setAttribute(spec.alias!, attr);
      expect(Reflect.get(el, spec.prop)).toEqual(prop);
      if (spec.kind == 'boolean') return;
      const other = spec.kind == 'number' ? '9' : spec.kind == 'enum' ? spec.values![2]! : 'other';
      el.setAttribute(spec.attr, other);
      expect(String(Reflect.get(el, spec.prop))).toBe(other);
    },
  );

  it('R3: every option that is not class-only has a row or is a documented property-only member', () => {
    const rows = new Set(ATTRIBUTES.map((spec) => spec.option));
    const missing = OPTION_KEYS.filter(
      (key) => !CLASS_ONLY_KEYS.includes(key) && !rows.has(key) && !PROPERTY_ONLY.includes(key),
    );
    expect(missing).toEqual([]);
    for (const key of PROPERTY_ONLY) expect(key in LocationPickerElement.prototype).toBe(true);
  });

  it('observedAttributes holds every attribute, alias and wrong guess', () => {
    const observed = LocationPickerElement.observedAttributes;
    for (const name of ATTRIBUTES.flatMap((spec) => [spec.attr, spec.alias ?? spec.attr]))
      expect(observed).toContain(name);
    for (const guess of Object.keys(WRONG_GUESS_ATTRIBUTES)) expect(observed).toContain(guess);
  });

  it('UPGRADE_PROPERTIES covers every row property plus the accessors and objects', () => {
    for (const spec of reflected) expect(UPGRADE_PROPERTIES).toContain(spec.prop);
    for (const prop of ['locate', 'form', 'value', 'valueAsLatLng', ...PROPERTY_ONLY])
      expect(UPGRADE_PROPERTIES).toContain(prop);
  });

  it('a reflecting setter does not rewrite an attribute that already has the value', () => {
    const { el } = create();
    el.setAttribute('locate', 'button');
    const setAttribute = vi.spyOn(el, 'setAttribute');
    el.locate = 'button';
    el.locateMode = 'button';
    el.name = 'loc';
    el.name = 'loc';
    expect(setAttribute.mock.calls).toEqual([['name', 'loc']]);
  });

  it('property-only objects are never attributes', () => {
    const { el } = create();
    el.messages = { confirm: 'OK' };
    el.mapOptions = { a: 1 };
    el.geolocation = { timeout: 5 };
    expect(el.getAttributeNames()).toEqual([]);
    expect(el.messages).toEqual({ confirm: 'OK' });
    expect(el.mapOptions).toEqual({ a: 1 });
    expect(el.geolocation.timeout).toBe(5);
  });

  it('defaults: provider leaflet (google with api-key), zoom 2 (15 with a value), precision 6', () => {
    const { el } = create();
    el.provider = 'osm';
    expect(el.provider).toBe('leaflet');
    el.removeAttribute('provider');
    el.setAttribute('api-key', 'k');
    expect(el.provider).toBe('google');
    const bare = document.createElement('location-picker');
    expect(bare.zoom).toBe(2);
    expect(bare.precision).toBe(6);
    expect(bare.maxZoom).toBeNaN();
    expect(bare.locateMode).toBe('off');
    expect(bare.marker).toBe('pin');
    expect(bare.gestureHandling).toBe('auto');
    expect(bare.tileUrl).toBe('https://tile.openstreetmap.org/{z}/{x}/{y}.png');
    bare.setAttribute('value', '1,2');
    expect(bare.zoom).toBe(15);
    expect(bare.center).toBe('');
    bare.center = { lat: 95, lng: 10 } as unknown as string;
    expect(bare.getAttribute('center')).toBe('90,10');
  });
});

describe('WP4-06 wrong-guess attributes', () => {
  it.each(Object.entries(WRONG_GUESS_ATTRIBUTES))(
    '%s warns once and names the right attribute',
    (attr, text) => {
      const console = spyConsole();
      const { el } = create();
      el.setAttribute(attr, '1');
      el.setAttribute(attr, '2');
      const other = document.createElement('location-picker');
      other.setAttribute(attr, '1');
      const warnings = texts(console.warn).filter((t) => t.includes(`<location-picker ${attr}>`));
      expect(warnings).toEqual([`[location-picker] ${text}`]);
      expect(text).toMatch(/use .+/);
    },
  );

  it('locate-button and autolocate are honoured as locate="button" and locate="auto"', () => {
    spyConsole();
    const { el } = create();
    el.setAttribute('locate-button', '');
    expect(el.locateMode).toBe('button');
    el.removeAttribute('locate-button');
    el.setAttribute('autolocate', '');
    expect(el.locateMode).toBe('auto');
    el.setAttribute('locate', 'off');
    expect(el.locateMode).toBe('off');
  });
});

describe('WP4-21 framework property assignment', () => {
  beforeEach(() => spyConsole());

  it('every non-hyphenated LocationPickerAttributes key that is in the element has a setter (R5)', () => {
    const keys: (keyof LocationPickerAttributes)[] = [
      'value', 'lat', 'lng', 'center', 'zoom', 'precision', 'name', 'form', 'required', 'disabled',
      'readonly', 'provider', 'attribution', 'search', 'placeholder', 'locate', 'marker', 'webmcp',
      'presentation',
    ]; // prettier-ignore
    const { el } = create();
    const checked = keys.filter((key) => key in el);
    expect(checked).toEqual(keys.filter((key) => key != 'readonly'));
    const setter = (key: string): boolean => {
      for (let proto: object | null = el; proto; proto = Object.getPrototypeOf(proto)) {
        const descriptor = Object.getOwnPropertyDescriptor(proto, key);
        if (descriptor) return typeof descriptor.set == 'function';
      }
      return false;
    };
    expect(checked.filter((key) => !setter(key))).toEqual([]);
  });

  it('locate="button" assigned as a property sets the attribute; el.locate stays the same method', () => {
    const { el } = create();
    const method = el.locate;
    el.locate = 'button';
    expect(el.getAttribute('locate')).toBe('button');
    expect(el.locateMode).toBe('button');
    expect(el.locate).toBeTypeOf('function');
    expect(el.locate).toBe(method);
    el.locate = '';
    expect(el.getAttribute('locate')).toBe('');
    expect(el.locateMode).toBe('button');
    el.locate = true;
    expect(el.getAttribute('locate')).toBe('button');
    el.locate = false;
    expect(el.hasAttribute('locate')).toBe(false);
    el.locate = 'auto';
    el.locate = null;
    expect(el.hasAttribute('locate')).toBe(false);
  });

  it('form="f1" assigned as a property writes the attribute without a TypeError', () => {
    const { el } = create();
    expect(() => Reflect.set(el, 'form', 'f1')).not.toThrow();
    expect(el.getAttribute('form')).toBe('f1');
    el.form = '';
    expect(el.hasAttribute('form')).toBe(false);
  });

  it('the locate button is visible for locate="button" and uses el.geolocation', async () => {
    const getCurrentPosition = stubGeolocation((success) => success(position(1, 2)));
    const { el, fake } = render('<location-picker locate="button"></location-picker>');
    el.geolocation = { timeout: 1 };
    await flush();
    expect(fake.mountCount).toBe(1);
    const button = part(el, 'locate-button');
    expect(button.hidden).toBe(false);
    button.click();
    await flush();
    expect(getCurrentPosition).toHaveBeenCalledTimes(1);
    expect(getCurrentPosition.mock.calls[0]?.[2]).toMatchObject({ timeout: 1 });
    expect(el.value).toBe('1,2');
  });

  it('a property-set adapter is used and reported by the provider getter', async () => {
    const other = createFakeAdapter({ name: 'other' });
    const { el } = create();
    el.provider = erased(other.adapter);
    expect(el.provider).toBe(other.adapter);
    document.body.append(el);
    await flush();
    expect(other.mountCount).toBe(1);
  });
});
