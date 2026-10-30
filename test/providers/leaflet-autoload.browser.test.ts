// WP3-01, the auto-loading half: no global L on this page (this file never imports 'leaflet'), so the default provider
// inserts the pinned Leaflet script (SRI) and its stylesheet, both answered by the §12.6 route table from node_modules.
// The failing-route case is in e2e/providers.spec.ts: the route table here is shared by every test file of a browser.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LocationPicker, type LocationPickerOptions } from '../../src/core.js';
import {
  LEAFLET_CSS_INTEGRITY,
  LEAFLET_CSS_URL,
  LEAFLET_JS_INTEGRITY,
  LEAFLET_JS_URL,
} from '../../src/leaflet.js';
import { resetStore, shadowPicker, spyConsole, waitFor, type ShadowPicker } from './helpers.js';

const EIFFEL = '48.8584,2.2945';
const pickers: { destroy(): void }[] = [];

const position = (node: Element | null | undefined): string =>
  node ? getComputedStyle(node).position : 'none';
const leafletScripts = (): HTMLScriptElement[] => [
  ...document.querySelectorAll<HTMLScriptElement>('script[src*="leaflet"]'),
];

function create(id: string, options: LocationPickerOptions = {}): LocationPicker {
  const target = document.createElement('div');
  target.id = id;
  target.style.cssText = 'width:320px;height:240px';
  document.body.append(target);
  const picker = new LocationPicker(target, { value: EIFFEL, ...options });
  pickers.push(picker);
  return picker;
}
async function element(options: LocationPickerOptions = {}): Promise<ShadowPicker> {
  const host = document.createElement('div');
  host.style.cssText = 'display:block;position:relative;width:320px;height:240px';
  document.body.append(host);
  // The element path goes through the same lazy provider import as the class.
  const { BUILTIN_PROVIDERS } = await import('../../src/core/providers.js');
  const picker = shadowPicker(host, {
    value: EIFFEL,
    ...options,
    provider: await BUILTIN_PROVIDERS.leaflet(),
  });
  pickers.push(picker.core);
  return picker;
}
const code = (cause: unknown): unknown => Reflect.get(Object(cause), 'code');

/** Forgets the engine and everything it inserted, so the next test auto-loads from scratch. */
function unload(): void {
  Reflect.deleteProperty(window, 'L');
  for (const node of document.head.querySelectorAll(
    'script[src*="leaflet"], link[href*="leaflet"]',
  ))
    node.remove();
}

beforeEach(() => {
  resetStore();
  unload();
  document.body.innerHTML = '';
});
afterEach(async () => {
  for (const picker of pickers.splice(0)) picker.destroy();
  vi.restoreAllMocks();
});

describe('WP3-01 Leaflet auto-loading', () => {
  it('engineUrl: false without an engine gives ENGINE_MISSING and inserts no script', async () => {
    spyConsole();
    const picker = create('missing', { engineUrl: false });
    const error = await picker.ready.then(
      () => null,
      (cause: unknown) => cause,
    );
    expect(code(error)).toBe('ENGINE_MISSING');
    expect(leafletScripts()).toEqual([]);
  });

  it('a custom engineUrl gets no integrity (and no early pinned sheet)', async () => {
    const url = 'https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet-src.js';
    const picker = create('custom', { engineUrl: url });
    await picker.ready;
    const [script, ...more] = leafletScripts();
    expect(more).toEqual([]);
    expect(script?.src).toBe(url);
    expect(script?.hasAttribute('integrity')).toBe(false);
    expect(script?.crossOrigin).toBe('anonymous');
  });

  it('three class pickers insert ONE script and ONE sheet, each with SRI, crossorigin and the nonce', async () => {
    const all = ['a', 'b', 'c'].map((id) => create(id, { nonce: 'lp-nonce' }));
    await Promise.all(all.map((picker) => picker.ready));
    const scripts = leafletScripts();
    expect(scripts).toHaveLength(1);
    expect(scripts[0]).toMatchObject({
      src: LEAFLET_JS_URL,
      integrity: LEAFLET_JS_INTEGRITY,
      crossOrigin: 'anonymous',
      nonce: 'lp-nonce',
    });
    const links = [...document.querySelectorAll<HTMLLinkElement>('link[href*="leaflet"]')];
    expect(links).toHaveLength(1);
    expect(links[0]?.parentNode).toBe(document.head);
    expect(links[0]).toMatchObject({
      href: LEAFLET_CSS_URL,
      integrity: LEAFLET_CSS_INTEGRITY,
      crossOrigin: 'anonymous',
      nonce: 'lp-nonce',
    });
    for (const id of ['a', 'b', 'c'])
      // oxlint-disable-next-line no-await-in-loop -- one map after the other
      await waitFor(
        () => position(document.querySelector(`#${id} .leaflet-pane`)) == 'absolute',
        4000,
        `leaflet.css on #${id}`,
      );
  });

  it('element mode: the document gets one script; each shadow root gets its own pinned sheet', async () => {
    const first = await element({ nonce: 'lp-nonce' });
    const second = await element({ nonce: 'lp-nonce' });
    await Promise.all([first.core.ready, second.core.ready]);
    expect(leafletScripts()).toHaveLength(1);
    expect(document.head.querySelectorAll('link[href*="leaflet"]')).toHaveLength(0);
    for (const { root } of [first, second]) {
      const links = root.querySelectorAll<HTMLLinkElement>('link[href*="leaflet"]');
      expect(links).toHaveLength(1);
      expect(links[0]).toMatchObject({
        href: LEAFLET_CSS_URL,
        integrity: LEAFLET_CSS_INTEGRITY,
        crossOrigin: 'anonymous',
        nonce: 'lp-nonce',
      });
      // oxlint-disable-next-line no-await-in-loop -- one root after the other
      await waitFor(
        () => position(root.querySelector('.leaflet-pane')) == 'absolute',
        4000,
        'leaflet.css in the shadow root',
      );
    }
  });
});
