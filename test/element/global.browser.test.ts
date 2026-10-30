// WP4-15 in a real browser: the documented `<script src="https://cdn.jsdelivr.net/npm/location-picker@3">` (the
// route table serves the local dist IIFE for it, byte for byte; Vite's own server would rewrite the file) in a fresh
// frame gives the class as `LocationPicker`, `new LocationPicker('#m')` works, the element is defined, the lowercase
// v1 global is untouched, and the page requests no chunk. Needs `npm run build` (CI builds before this project).
import { afterEach, describe, expect, it } from 'vitest';

const CDN = 'https://cdn.jsdelivr.net/npm/location-picker@3';
const frames: HTMLIFrameElement[] = [];
const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));
interface Mounted {
  readonly value: string;
  readonly provider: string;
  readonly map: unknown;
  readonly ready: Promise<unknown>;
  destroy(): void;
}
afterEach(() => {
  for (const frame of frames.splice(0)) frame.remove();
});

async function page(body: string): Promise<Window & Record<string, unknown>> {
  const frame = document.createElement('iframe');
  frames.push(frame);
  frame.srcdoc = `<!doctype html><script src="${CDN}"></script>${body}`;
  const loaded = new Promise((resolve) => frame.addEventListener('load', resolve, { once: true }));
  document.body.append(frame);
  await loaded;
  const win = frame.contentWindow;
  if (!win) throw new Error('the frame has no window');
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the frame's globals are read by name
  return win as Window & Record<string, unknown>;
}

describe('WP4-15 the script build in a page', () => {
  it('is served (run `npm run build` first)', async () => {
    const response = await fetch(CDN);
    expect(response.ok).toBe(true);
    // import() appears only for a page-given engine URL (MapLibre's opt-in engineUrl), never with a chunk path.
    expect(await response.text()).not.toMatch(/\bimport\s*\(\s*(?:\/\*[^]*?\*\/\s*)?["'`]/);
  });

  it('sets the class global, defines the element, mounts Leaflet, makes no chunk request', async () => {
    const win = await page(
      '<div id="m" style="height:200px"></div><location-picker search></location-picker>',
    );
    const LocationPicker = win.LocationPicker;
    expect(typeof LocationPicker).toBe('function');
    expect(win.locationPicker).toBeUndefined();
    expect(Reflect.get(Object(LocationPicker), 'LocationPicker')).toBe(LocationPicker);
    expect(win.customElements.get('location-picker')).toBe(
      Reflect.get(Object(LocationPicker), 'LocationPickerElement'),
    );
    const element = win.document.querySelector('location-picker');
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the global's constructor signature
    const Ctor = LocationPicker as new (target: string) => Mounted;
    const picker = new Ctor('#m');
    // Both go through the bundled loaders: the engine, the paired Photon geocoder and the search combobox.
    await picker.ready;
    await Reflect.get(Object(element), 'ready');
    expect(picker.provider).toBe('leaflet');
    expect(picker.map).toBeTruthy();
    const search = element?.shadowRoot?.querySelector('[part~="search"]');
    // oxlint-disable-next-line no-await-in-loop -- polls until the combobox rendered
    for (let i = 0; i < 50 && !search?.querySelector('[role="combobox"]'); i++) await sleep(10);
    expect(search?.querySelector('[role="combobox"]')).toBeTruthy();
    picker.destroy();
    const requested = win.performance.getEntriesByType('resource').map((entry) => entry.name);
    expect(requested.filter((url) => url.includes('location-picker'))).toEqual([CDN]);
    expect(requested.filter((url) => /\.mjs\b|_chunks/.test(url))).toEqual([]);
  });
});
