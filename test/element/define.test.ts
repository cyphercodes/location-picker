// WP4-02 definition (unit project; the IIFE + ESM pair on one real page is covered by the browser and e2e suites).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getStore } from '../../src/core/store.js';
import { version } from '../../src/core/version.js';
import { defineLocationPicker } from '../../src/element/define.js';
import { LocationPickerElement } from '../../src/element/location-picker-element.js';
import * as root from '../../src/index.js';
import { resetStore, spyConsole, texts } from './helpers.js';

beforeEach(() => resetStore());
afterEach(() => vi.restoreAllMocks());

describe('WP4-02 defineLocationPicker', () => {
  it('importing the root entry defines <location-picker> as LocationPickerElement', () => {
    expect(root.LocationPickerElement).toBe(LocationPickerElement);
    expect(customElements.get('location-picker')).toBe(LocationPickerElement);
    expect(document.createElement('location-picker')).toBeInstanceOf(LocationPickerElement);
    expect(LocationPickerElement.version).toBe(version);
    expect(LocationPickerElement.formAssociated).toBe(true);
  });

  it('a repeat call returns the same constructor without a warning', () => {
    const console = spyConsole();
    expect(defineLocationPicker()).toBe(LocationPickerElement);
    expect(defineLocationPicker('location-picker')).toBe(LocationPickerElement);
    expect(texts(console.warn)).toEqual([]);
  });

  it('a tag defined by another copy is reused; a different version warns once', () => {
    const console = spyConsole();
    getStore().defined.set('location-picker', '2.9.0');
    expect(defineLocationPicker()).toBe(LocationPickerElement);
    expect(defineLocationPicker()).toBe(LocationPickerElement);
    expect(texts(console.warn)).toEqual([
      `[location-picker] <location-picker> is already defined by location-picker 2.9.0; this copy (${version}) reuses it.`,
    ]);
    class Other extends HTMLElement {}
    customElements.define('copy-picker', Other);
    expect(() => defineLocationPicker('copy-picker')).not.toThrow();
    expect(defineLocationPicker('copy-picker')).toBe(Other);
  });

  it('another tag registers a subclass; a repeat call returns that same constructor', () => {
    const geo = defineLocationPicker('geo-picker');
    expect(geo).not.toBe(LocationPickerElement);
    expect(geo?.prototype).toBeInstanceOf(LocationPickerElement);
    expect(defineLocationPicker('geo-picker')).toBe(geo);
    const el = document.createElement('geo-picker');
    expect(el).toBeInstanceOf(LocationPickerElement);
    expect((el as LocationPickerElement).type).toBe('location-picker');
    expect(getStore().defined.get('geo-picker')).toBe(version);
  });

  it('returns undefined where customElements is missing', () => {
    vi.stubGlobal('customElements', undefined);
    expect(defineLocationPicker()).toBeUndefined();
    vi.unstubAllGlobals();
  });
});
