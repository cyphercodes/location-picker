// WP4-15 in a real browser: `<script src=".../location-picker.global.js">` in a fresh frame gives the class as
// `LocationPicker`, `new LocationPicker('#m')` works, the element is defined, the lowercase v1 global is untouched,
// and the page requests no chunk. Needs `npm run build` (CI builds before the browser project).
import { afterEach, describe, expect, it } from 'vitest';

const FILE = '/dist/location-picker.global.js';
const frames: HTMLIFrameElement[] = [];
afterEach(() => {
  for (const frame of frames.splice(0)) frame.remove();
});

async function page(body: string): Promise<Window & Record<string, unknown>> {
  const frame = document.createElement('iframe');
  frames.push(frame);
  frame.srcdoc = `<!doctype html><script src="${FILE}"></script>${body}`;
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
    const response = await fetch(FILE);
    expect(response.ok).toBe(true);
    expect(await response.text()).not.toMatch(/\bimport\s*\(/);
  });

  it('sets the class global, defines the element, makes no chunk request', async () => {
    const win = await page(
      '<div id="m" style="height:200px"></div><location-picker></location-picker>',
    );
    const LocationPicker = win.LocationPicker;
    expect(typeof LocationPicker).toBe('function');
    expect(win.locationPicker).toBeUndefined();
    expect(Reflect.get(Object(LocationPicker), 'LocationPicker')).toBe(LocationPicker);
    const element = win.document.querySelector('location-picker');
    expect(win.customElements.get('location-picker')).toBe(
      Reflect.get(Object(LocationPicker), 'LocationPickerElement'),
    );
    expect(element?.shadowRoot).toBeTruthy();
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the global's constructor signature
    const Ctor = LocationPicker as new (target: string) => { value: string; destroy(): void };
    const picker = new Ctor('#m');
    expect(picker.value).toBe('');
    picker.destroy();
    const requested = win.performance
      .getEntriesByType('resource')
      .map((entry) => new URL(entry.name).pathname)
      .filter((path) => path.startsWith('/dist/'));
    expect(requested).toEqual([FILE]);
  });
});
