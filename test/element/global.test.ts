// WP4-15: the script build, dist/location-picker.global.js (D12), run as a classic script in jsdom. Its statics must
// equal the union of the runtime exports of every public ESM entry (minus `default`, which is the class itself), and
// every LocationPickerStatics member of api.d.ts must be there; members of an entry that is still a placeholder are
// excused until its owner lands it. The ESM copy is then imported on the same page (WP4-02: both copies coexist).
// Needs `npm run build`: skipped locally without dist/, a failure in CI.
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { spyConsole } from '../core/helpers.js';
import { placeholder, skipUnbuilt } from '../package/packed.js';

/** The public ESM entries (dist/<name>.mjs), by package subpath. */
const ENTRIES: Readonly<Record<string, string>> = {
  '.': 'index',
  './core': 'core',
  './element': 'element',
  './utils': 'utils',
  './leaflet': 'leaflet',
  './google': 'google',
  './maplibre': 'maplibre',
  './photon': 'photon',
  './webmcp': 'webmcp',
};

/** api.d.ts `LocationPickerStatics` (with `LocationPickerGoogleStatics`), by the entry each member comes from. */
const STATICS: Readonly<Record<string, readonly string[]>> = {
  '.': [
    'LocationPicker',
    'LocationPickerElement',
    'LocationPickerError',
    'defineLocationPicker',
    'parseLatLng',
    'formatLatLng',
    'normalizeLatLng',
    'isLatLng',
    'version',
  ],
  './leaflet': [
    'leafletProvider',
    'LEAFLET_VERSION',
    'LEAFLET_JS_URL',
    'LEAFLET_JS_INTEGRITY',
    'LEAFLET_CSS_URL',
    'LEAFLET_CSS_INTEGRITY',
    'OSM_TILE_URL',
    'OSM_ATTRIBUTION',
  ],
  './google': ['googleProvider', 'googleGeocoder', 'loadGoogleMaps'],
  './maplibre': ['maplibreProvider', 'OPENFREEMAP_STYLE_URL'],
  './photon': ['photonGeocoder', 'formatPhotonAddress', 'PHOTON_URL'],
  './webmcp': ['registerWebMcpTools', 'isWebMcpSupported'],
};

const FILE = 'dist/location-picker.global.js';
/** Own keys every class has, which are not statics. */
const BUILTIN = new Set(['length', 'name', 'prototype']);

describe.skipIf(skipUnbuilt)('WP4-15 the script build', () => {
  let source = '';
  let global: Record<string, unknown> &
    (new (target: string, options?: object) => { value: string; destroy(): void });
  let console$: ReturnType<typeof spyConsole>;

  beforeAll(() => {
    console$ = spyConsole();
    source = readFileSync(FILE, 'utf8');
    // A classic <script>: indirect eval runs it in the global scope of this jsdom page.
    // oxlint-disable-next-line no-eval -- that is exactly what a <script src> does with the file
    (0, eval)(source);
    global = Reflect.get(globalThis, 'LocationPicker');
  });
  afterAll(() => {
    vi.restoreAllMocks();
    Reflect.deleteProperty(globalThis, 'LocationPicker');
  });

  it('is one self-contained file: no import(), no require(), no chunk reference', () => {
    expect(source.length).toBeGreaterThan(1000);
    expect(source).not.toMatch(/\bimport\s*\(/);
    expect(source).not.toMatch(/\brequire\s*\(/);
    expect(source).not.toMatch(/_chunks/);
    expect(source).not.toMatch(/^\s*(import|export)\s/m);
  });

  it('sets globalThis.LocationPicker to the class and never the lowercase v1 global', () => {
    expect(typeof global).toBe('function');
    expect(global.LocationPicker).toBe(global);
    expect(Reflect.get(globalThis, 'locationPicker')).toBeUndefined();
    const target = document.createElement('div');
    target.id = 'm';
    document.body.append(target);
    // An engine that never loads keeps this offline (the real Leaflet path runs in the browser project).
    const offline = {
      name: 'offline',
      load: () => Promise.reject(new Error('offline')),
      mount() {},
    };
    const picker = new global('#m', { provider: offline });
    expect(picker).toBeInstanceOf(global);
    expect(picker.value).toBe('');
    expect(global.version).toMatch(/^\d+\.\d+\.\d+/);
    picker.destroy();
    target.remove();
  });

  it('defines <location-picker> as its own LocationPickerElement', () => {
    expect(customElements.get('location-picker')).toBe(global.LocationPickerElement);
    const created: unknown = document.createElement('location-picker');
    expect(Object.getPrototypeOf(created)).toBe(
      Reflect.get(Object(global.LocationPickerElement), 'prototype'),
    );
  });

  it('the statics equal the union of the runtime exports of every public ESM entry', async () => {
    const exported = new Set<string>();
    for (const name of Object.values(ENTRIES)) {
      // oxlint-disable-next-line no-await-in-loop -- one entry after another keeps the import order readable
      const entry: object = await import(`../../dist/${name}.mjs`);
      for (const key of Object.keys(entry)) if (key != 'default') exported.add(key);
    }
    const statics = Object.getOwnPropertyNames(global).filter((key) => !BUILTIN.has(key));
    expect(statics.toSorted()).toEqual([...exported].toSorted());
    // The ESM copy on the same page reuses the IIFE's definition (same version: no warning).
    expect(console$.warn.mock.calls.join(' ')).not.toMatch(/defined|version/);
  });

  it('has every LocationPickerStatics member (members of placeholder entries are excused)', () => {
    const missing: string[] = [];
    const excused: string[] = [];
    for (const [subpath, names] of Object.entries(STATICS)) {
      for (const name of names) {
        if (Object.hasOwn(global, name)) continue;
        (placeholder(subpath) ? excused : missing).push(name);
      }
    }
    expect(missing).toEqual([]);
    if (excused.length) console.info(`WP4-15: excused until WP3 lands: ${excused.join(', ')}`);
  });
});
