// Real Leaflet 1.9.4 in Chromium, Firefox and WebKit (browser project). Leaflet comes from node_modules (importing it
// also sets window.L, as its UMD build always does); leaflet.css and the tiles come through the §12.6 route table.
// The auto-loading path (no global L) is in leaflet-autoload.browser.test.ts, a page of its own.
import * as L from 'leaflet';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { commands, userEvent } from 'vitest/browser';
import {
  LocationPicker,
  type LocationPickerOptions,
  type ProviderAdapter,
} from '../../src/core.js';
import { erased } from '../../src/core/providers.js';
import { LEAFLET_CSS_URL, leafletProvider } from '../../src/leaflet.js';
import { centreOf, touchGesture } from './gestures.js';
import {
  must,
  record,
  resetStore,
  spyConsole,
  texts,
  waitFor,
  shadowPicker,
  type ShadowPicker,
} from './helpers.js';

const EIFFEL = '48.8584,2.2945';
const pickers: { destroy(): void }[] = [];

function create(options: LocationPickerOptions<L.Map> = {}, target: string | HTMLElement = '#map') {
  const picker = new LocationPicker<L.Map>(target, {
    provider: leafletProvider<L.Map>({ engine: L }),
    value: EIFFEL,
    zoom: 12,
    ...options,
  });
  pickers.push(picker);
  return { picker, log: record(picker) };
}
function element(
  options: LocationPickerOptions<unknown> & { provider?: ProviderAdapter<unknown> } = {},
): ShadowPicker {
  const host = document.createElement('div');
  host.style.cssText = 'display:block;position:relative;width:400px;height:300px';
  document.body.append(host);
  const picker = shadowPicker(host, {
    value: EIFFEL,
    ...options,
    provider: options.provider ?? erased(leafletProvider({ engine: L })),
  });
  pickers.push(picker.core);
  return picker;
}
const position = (node: Element | null | undefined): string =>
  node ? getComputedStyle(node).position : 'none';
/** Waits until Leaflet's zoom/pan animation has finished and the picker saw the final moveend. */
async function settle(map: L.Map): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 50));
  await waitFor(
    () => !Reflect.get(map, '_animatingZoom') && !Reflect.get(map, '_panAnim')?._inProgress,
    3000,
    'the camera to settle',
  );
  await new Promise((resolve) => setTimeout(resolve, 300));
}
/**
 * A click focuses the map the way a user does. Programmatic focus() is not enough in Firefox: while its window is
 * inactive the `focus` event (which arms Leaflet's keyboard handler) is deferred.
 */
async function focusMap(container: HTMLElement): Promise<void> {
  await userEvent.click(container);
  await waitFor(
    () => container.ownerDocument.activeElement == container,
    2000,
    'the map to have focus',
  );
}
const changes = (log: ReturnType<typeof record>) =>
  log.filter((e) => e.type == 'change').map((e) => e.detail as { value: string; source: string });

beforeEach(() => {
  resetStore();
  // Each test starts without leaflet.css: a sheet left by an earlier test would satisfy §4.3 step 3 or 3'.
  for (const link of document.head.querySelectorAll('link[href*="leaflet"]')) link.remove();
  document.body.innerHTML = '<div id="map" style="width:400px;height:300px"></div>';
  scrollTo(0, 0);
});
afterEach(async () => {
  for (const picker of pickers.splice(0)) picker.destroy();
  await userEvent.cleanup();
  vi.restoreAllMocks();
});

describe('WP3-01 with a global L', () => {
  it('inserts no <script>; leaflet.css comes from the pinned URL with SRI and positions the panes (class)', async () => {
    expect(Reflect.get(window, 'L')).toBeDefined();
    const picker = new LocationPicker('#map', { value: EIFFEL });
    pickers.push(picker);
    await picker.ready;
    expect(picker.provider).toBe('leaflet');
    expect(picker.map).toBeInstanceOf(L.Map);
    expect(document.querySelectorAll('script[src*="leaflet"]')).toHaveLength(0);
    const links = document.head.querySelectorAll<HTMLLinkElement>('link[href*="leaflet"]');
    expect(links).toHaveLength(1);
    expect(links[0]).toMatchObject({
      href: 'https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.css',
      integrity: 'sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=',
      crossOrigin: 'anonymous',
    });
    await waitFor(
      () => position(document.querySelector('#map .leaflet-pane')) == 'absolute',
      4000,
      'leaflet.css',
    );
  });

  it('positions the panes in the element (shadow root) too, with the sheet linked inside the root', async () => {
    const { root, core } = element();
    await core.ready;
    expect(root.querySelectorAll('link[href*="leaflet.css"]')).toHaveLength(1);
    await waitFor(
      () => position(root.querySelector('.leaflet-pane')) == 'absolute',
      4000,
      'leaflet.css in the root',
    );
  });
});

describe('WP3-22 synchronous .map', () => {
  const sync = (target: string | HTMLElement, options: LocationPickerOptions<L.Map> = {}) => {
    const { picker, log } = create(options, target);
    const map = picker.map;
    expect(map).toBeInstanceOf(L.Map);
    expect(() =>
      L.circle(must(picker.valueAsLatLng), { radius: 200 }).addTo(must(map)),
    ).not.toThrow();
    return { picker, log };
  };

  it('in a Document, with leaflet.css absent, still loading or already present', async () => {
    spyConsole();
    // Absent: nothing on the page and nothing linked; step 5 reports it after mount.
    const absent = sync('#map', { engineCssUrl: false });
    expect(document.head.querySelector('link[href*="leaflet"]')).toBeNull();
    await waitFor(
      () =>
        absent.log.some(
          (e) => e.type == 'error' && Reflect.get(Object(e.detail), 'code') == 'ENGINE_CSS_MISSING',
        ),
      4000,
      'ENGINE_CSS_MISSING',
    );
    absent.picker.destroy();

    // Loading: a fresh URL, so the sheet cannot come from the memory cache.
    document.body.innerHTML = '<div id="map" style="width:400px;height:300px"></div>';
    const href = `${LEAFLET_CSS_URL}?wp3-22=${Date.now()}`;
    sync('#map', { engineCssUrl: href });
    const link = must(document.head.querySelector<HTMLLinkElement>(`link[href="${href}"]`));
    expect(link.sheet).toBeNull();
    expect(position(document.querySelector('#map .leaflet-pane'))).not.toBe('absolute');
    await waitFor(
      () => position(document.querySelector('#map .leaflet-pane')) == 'absolute',
      4000,
      'the panes to be styled',
    );

    // Present: the page's own leaflet.css is already applied.
    document.body.innerHTML = '<div id="map" style="width:400px;height:300px"></div>';
    sync('#map');
  });

  it("inside a user ShadowRoot, where step 3' copies the document's leaflet.css (not awaited)", async () => {
    // The page has a readable leaflet.css (as `import 'leaflet/dist/leaflet.css'` gives), for step 3' to copy.
    const page = document.createElement('link');
    page.rel = 'stylesheet';
    page.crossOrigin = 'anonymous';
    page.href = LEAFLET_CSS_URL;
    const loaded = new Promise((resolve) => page.addEventListener('load', resolve));
    document.head.append(page);
    await loaded;
    const host = must(document.querySelector<HTMLElement>('#map'));
    const root = host.attachShadow({ mode: 'open' });
    const target = document.createElement('div');
    target.style.cssText = 'width:400px;height:300px';
    root.append(target);
    const { picker } = sync(target);
    await picker.ready;
    await waitFor(
      () => position(root.querySelector('.leaflet-pane')) == 'absolute',
      4000,
      'leaflet.css in the root',
    );
    expect(root.querySelector('link')).toBeNull();
  });

  it('the element model mounts synchronously as well', () => {
    const { core } = element();
    expect(core.handle?.map).toBeInstanceOf(L.Map);
  });
});

describe('WP3-03 zoom gestures never change the value', () => {
  it('wheel (greedy), double-click and pinch zoom at the centre', async () => {
    const { picker, log } = create();
    await picker.ready;
    const map = must(picker.map);
    expect(map.options).toMatchObject({
      scrollWheelZoom: 'center',
      doubleClickZoom: 'center',
      touchZoom: 'center',
      boxZoom: false,
      keyboard: true,
      zoomControl: true,
      attributionControl: true,
      maxZoom: 19,
    });

    await userEvent.wheel(picker.container, { delta: { y: -240 } });
    await waitFor(() => picker.zoom > 12, 3000, 'the wheel zoom');
    await settle(map);
    const afterWheel = picker.zoom;

    await userEvent.dblClick(picker.container);
    await waitFor(() => picker.zoom > afterWheel, 3000, 'the double-click zoom');
    await settle(map);
    const afterDouble = picker.zoom;

    const centre = centreOf(picker.container);
    await touchGesture(
      picker.container,
      [
        { x: centre.x - 30, y: centre.y + 10 },
        { x: centre.x + 30, y: centre.y + 10 },
      ],
      [
        { x: -50, y: 0 },
        { x: 50, y: 0 },
      ],
    );
    await waitFor(() => picker.zoom > afterDouble, 3000, 'the pinch zoom');
    await settle(map);

    expect(picker.value).toBe(EIFFEL);
    expect(changes(log)).toEqual([]);
    expect(log.filter((e) => e.type == 'input')).toEqual([]);
    const { lat, lng } = map.getCenter();
    // The engine stays on the value (within a screen pixel at this zoom).
    expect(Math.abs(lat - 48.8584)).toBeLessThan(0.0001);
    expect(Math.abs(lng - 2.2945)).toBeLessThan(0.0001);
  });
});

describe('WP3-04 cooperative gestures', () => {
  it('on a scrolling page a plain wheel scrolls and hints; Ctrl + wheel zooms one step', async () => {
    document.body.insertAdjacentHTML('beforeend', '<div style="height:3000px"></div>');
    const { picker, log } = create({ gestureHandling: 'auto' });
    await picker.ready;
    const map = must(picker.map);
    expect(map.options.scrollWheelZoom).toBe(false);

    await userEvent.wheel(picker.container, { delta: { y: 200 } });
    await waitFor(() => scrollY > 0, 3000, 'the page to scroll');
    const hint = must(document.querySelector<HTMLElement>('#map .lp-hint'));
    expect(hint.hidden).toBe(false);
    expect(hint.textContent).toMatch(/^Use (Ctrl|⌘) \+ scroll to zoom the map$/);
    expect(picker.zoom).toBe(12);

    scrollTo(0, 0);
    await userEvent.keyboard('{Control>}');
    await userEvent.wheel(picker.container, { delta: { y: -100 } });
    await userEvent.keyboard('{/Control}');
    await waitFor(() => picker.zoom == 13, 3000, 'one zoom step');
    await settle(map);
    expect(scrollY).toBe(0);
    expect(picker.zoom).toBe(13);
    expect(picker.value).toBe(EIFFEL);
    expect(changes(log)).toEqual([]);
  });

  it('on a page that does not scroll, auto is greedy', async () => {
    const { picker } = create({ gestureHandling: 'auto' });
    await picker.ready;
    expect(must(picker.map).options.scrollWheelZoom).toBe('center');
    await userEvent.wheel(picker.container, { delta: { y: -240 } });
    await waitFor(() => picker.zoom > 12, 3000, 'the wheel zoom');
    expect(must(document.querySelector<HTMLElement>('#map .lp-hint')).hidden).toBe(true);
  });
});

describe('WP3-05 tiles and attribution', () => {
  it('the default tiles show a visible OpenStreetMap credit', async () => {
    const { picker } = create();
    await picker.ready;
    const credit = await waitFor(
      () => {
        const node = document.querySelector<HTMLElement>('#map .leaflet-control-attribution');
        return node && node.offsetHeight > 0 ? node : null;
      },
      4000,
      'a visible attribution',
    );
    expect(credit.textContent).toContain('OpenStreetMap');
    await waitFor(() => document.querySelector('#map img.leaflet-tile-loaded'), 4000, 'a tile');
    expect(document.querySelector<HTMLImageElement>('#map img.leaflet-tile')?.src).toMatch(
      /^https:\/\/tile\.openstreetmap\.org\/12\/\d+\/\d+\.png$/,
    );
  });

  it('a custom tileUrl without attribution warns once', async () => {
    const { warn } = spyConsole();
    const { picker } = create({ tileUrl: '/test/fixtures/tile.png?{z}/{x}/{y}' });
    await picker.ready;
    const second = create(
      { tileUrl: '/test/fixtures/tile.png?{z}/{x}/{y}' },
      document.body.appendChild(document.createElement('div')),
    );
    await second.picker.ready;
    expect(texts(warn).filter((t) => t.includes('attribution'))).toHaveLength(1);
  });

  it('a tileUrl change swaps the layer in place (no remount)', async () => {
    let mounts = 0;
    const adapter = leafletProvider({ engine: L });
    const counted = {
      ...adapter,
      mount: (ctx: Parameters<typeof adapter.mount>[0]) => (mounts++, adapter.mount(ctx)),
    };
    const { core } = element({ provider: erased(counted) });
    await core.ready;
    const map = core.handle?.map as L.Map;
    core.update({
      tileUrl: '/test/fixtures/tile.png?custom={z}/{x}/{y}',
      tileUrlGiven: true,
      attribution: '© Test tiles',
    });
    await core.ready;
    const urls: string[] = [];
    map.eachLayer((layer) => {
      if (layer instanceof L.TileLayer) urls.push(Reflect.get(layer, '_url') as string);
    });
    expect(urls).toEqual(['/test/fixtures/tile.png?custom={z}/{x}/{y}']);
    expect(mounts).toBe(1);
    expect(core.handle?.map).toBe(map);
    await waitFor(
      () =>
        map
          .getContainer()
          .querySelector('.leaflet-control-attribution')
          ?.textContent?.includes('© Test tiles'),
      2000,
      'the new credit',
    );
  });
});

describe('WP3-06 keyboard', () => {
  it('arrow keys commit (user); + and - only zoom', async () => {
    const { picker, log } = create();
    await picker.ready;
    const map = must(picker.map);
    await focusMap(picker.container);
    await userEvent.keyboard('{+}');
    await waitFor(() => picker.zoom == 13, 3000, 'zoom in');
    await settle(map);
    await userEvent.keyboard('{-}');
    await waitFor(() => picker.zoom == 12, 3000, 'zoom out');
    await settle(map);
    expect(changes(log)).toEqual([]);

    await userEvent.keyboard('{ArrowRight}');
    await waitFor(() => changes(log).length == 1, 3000, 'a change');
    await settle(map);
    expect(changes(log)).toMatchObject([{ source: 'user' }]);
    expect(picker.value).not.toBe(EIFFEL);
    const [lat, lng] = picker.value.split(',').map(Number);
    expect(lat).toBeCloseTo(48.8584, 3);
    expect(lng).toBeGreaterThan(2.2945);
  });

  it('readOnly: arrows do not move the map, + still zooms', async () => {
    const { picker, log } = create({ readOnly: true });
    await picker.ready;
    const map = must(picker.map);
    await focusMap(picker.container);
    const before = map.getCenter();
    await userEvent.keyboard('{ArrowRight}');
    await new Promise((resolve) => setTimeout(resolve, 400));
    // An arrow pans 80 px; what remains is Leaflet's whole-pixel centre (well under a pixel).
    const moved = map
      .latLngToContainerPoint(before)
      .distanceTo(map.latLngToContainerPoint(map.getCenter()));
    expect(moved).toBeLessThan(1);
    await userEvent.keyboard('{+}');
    await waitFor(() => picker.zoom == 13, 3000, 'zoom in');
    expect(changes(log)).toEqual([]);
  });
});

describe('WP3-07 a Leaflet-2-style namespace', () => {
  it('mounts, shows tiles and commits a pan with only the Map and TileLayer constructors', async () => {
    const engine = Object.freeze({ version: '2.0.0-alpha.1', Map: L.Map, TileLayer: L.TileLayer });
    const picker = new LocationPicker<L.Map>('#map', {
      provider: leafletProvider<L.Map>({ engine }),
      value: EIFFEL,
      zoom: 12,
    });
    pickers.push(picker);
    const log = record(picker);
    await picker.ready;
    expect(picker.map).toBeInstanceOf(L.Map);
    await waitFor(() => document.querySelector('#map img.leaflet-tile-loaded'), 4000, 'a tile');
    await focusMap(picker.container);
    await userEvent.keyboard('{ArrowDown}');
    await waitFor(() => changes(log).length == 1, 3000, 'a change');
    expect(changes(log)[0]?.source).toBe('user');
  });
});

describe('A8 and WP3-19', () => {
  it('resize reports the centre Leaflet re-derives, and nothing left the route table', async () => {
    const { picker } = create({ value: undefined, center: EIFFEL });
    await picker.ready;
    const target = must(document.querySelector<HTMLElement>('#map'));
    target.style.width = '401px';
    await waitFor(() => must(picker.map).getSize().x == 401, 3000, 'the resize');
    must(picker.container.ownerDocument.querySelector<HTMLElement>('#map .lp-map')).focus();
    await userEvent.keyboard('{Enter}');
    const { lat, lng } = must(picker.map).getCenter();
    expect(picker.value).toBe(`${+lat.toFixed(6)},${+lng.toFixed(6)}`);
    expect(await commands.lpTakeBlockedRequests()).toEqual([]);
  });
});
