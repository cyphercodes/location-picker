// Adapter decisions in the unit project (jsdom), against recording fakes of the engines and the MountContext:
// engine resolution and loading (WP3-01, WP3-15), §4.3 CSS order (WP3-02), §4.2/§4.5 constructor options (WP3-03,
// WP3-15), cooperative wheel (WP3-04), tiles (WP3-05), key mapping (WP3-06), the Leaflet-2 namespace (WP3-07) and
// the synchronous mount (WP3-22). Real engines run in the *.browser.test.ts files.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MapHandle, ProviderAdapter } from '../../src/core.js';
import {
  LEAFLET_CSS_INTEGRITY,
  LEAFLET_CSS_URL,
  LEAFLET_JS_INTEGRITY,
  LEAFLET_JS_URL,
  LEAFLET_VERSION,
  OSM_ATTRIBUTION,
  OSM_TILE_URL,
  leafletProvider,
} from '../../src/leaflet.js';
import { OPENFREEMAP_STYLE_URL, maplibreProvider } from '../../src/maplibre.js';
import {
  FakeLeafletMap,
  FakeMapLibreMap,
  fakeContext,
  fakeLeaflet,
  fakeMapLibre,
  type FakeContext,
} from './fakes.js';
import { flush, must, resetStore, spyConsole } from './helpers.js';

const CSS_LOADED = '<style>.leaflet-pane,.maplibregl-canvas{position:absolute}</style>';

/** mount() must return synchronously here (engine present). */
function mountSync<T>(adapter: ProviderAdapter<T>, ctx: FakeContext): MapHandle<T> {
  const handle = adapter.mount(ctx);
  if (handle instanceof Promise) throw new Error('mount() returned a promise');
  return handle;
}
const leafletMap = (): FakeLeafletMap => must(FakeLeafletMap.instances.at(-1), 'an L.Map');
const maplibreMap = (): FakeMapLibreMap =>
  must(FakeMapLibreMap.instances.at(-1), 'a maplibregl.Map');
const reported = (ctx: FakeContext): string[] =>
  ctx.report.mock.calls.map(([error]) => (error as { code: string }).code);
const wheel = (target: HTMLElement, init: WheelEventInit): WheelEvent => {
  const event = new WheelEvent('wheel', { bubbles: true, cancelable: true, ...init });
  target.dispatchEvent(event);
  return event;
};
const keydown = (target: HTMLElement, key: string): KeyboardEvent => {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
  target.dispatchEvent(event);
  return event;
};

beforeEach(() => {
  resetStore();
  document.head.innerHTML = '';
  document.body.innerHTML = '';
});
afterEach(() => {
  Reflect.deleteProperty(globalThis, 'L');
  Reflect.deleteProperty(globalThis, 'maplibregl');
  vi.restoreAllMocks();
});

describe('leafletProvider: constants', () => {
  it('pins Leaflet 1.9.4 on jsDelivr with SRI, and OSM tiles with their credit', () => {
    expect(LEAFLET_VERSION).toBe('1.9.4');
    expect(LEAFLET_JS_URL).toBe('https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.js');
    expect(LEAFLET_JS_INTEGRITY).toBe('sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=');
    expect(LEAFLET_CSS_URL).toBe('https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.css');
    expect(LEAFLET_CSS_INTEGRITY).toBe('sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=');
    expect(OSM_TILE_URL).toBe('https://tile.openstreetmap.org/{z}/{x}/{y}.png');
    expect(OSM_ATTRIBUTION).toBe(
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    );
  });

  it('pairs with Photon', async () => {
    const adapter = leafletProvider();
    expect(adapter.name).toBe('leaflet');
    const factory = adapter.geocoder;
    if (typeof factory != 'function') throw new Error('expected a geocoder factory');
    const geocoder = await factory(fakeContext(), {} as never);
    expect(geocoder.pairsWith).toEqual(['leaflet', 'maplibre']);
  });
});

describe('WP3-01 leafletProvider: engine resolution and loading', () => {
  it('an engine option or a global L mounts with no load at all (synchronous)', () => {
    for (const setup of [
      () => leafletProvider({ engine: fakeLeaflet() }),
      () => {
        Reflect.set(globalThis, 'L', fakeLeaflet());
        return leafletProvider();
      },
    ]) {
      const adapter = setup();
      const ctx = fakeContext();
      expect(adapter.load?.(ctx)).toBeUndefined();
      expect(ctx.loadScript).not.toHaveBeenCalled();
      expect(ctx.loadStylesheet).not.toHaveBeenCalled();
      expect(mountSync(adapter, ctx).map).toBe(leafletMap());
    }
  });

  it('the picker engine option is used when the factory has none', () => {
    const ctx = fakeContext({ options: { engine: fakeLeaflet() } });
    expect(leafletProvider().load?.(ctx)).toBeUndefined();
    expect(mountSync(leafletProvider(), ctx).map).toBe(leafletMap());
  });

  it('auto-loads the pinned script with SRI, inserting the pinned sheet together with it', async () => {
    const ctx = fakeContext({ nonce: 'n0nce' });
    const order: string[] = [];
    ctx.loadStylesheet.mockImplementation(async (href: string) => void order.push(`css ${href}`));
    ctx.loadScript.mockImplementation(async (src: string) => void order.push(`js ${src}`));
    const loading = leafletProvider().load?.(ctx);
    expect(loading).toBeInstanceOf(Promise);
    await loading;
    expect(ctx.loadScript.mock.calls).toEqual([[LEAFLET_JS_URL, LEAFLET_JS_INTEGRITY]]);
    expect(ctx.loadStylesheet.mock.calls).toEqual([[LEAFLET_CSS_URL, LEAFLET_CSS_INTEGRITY]]);
    expect(order).toEqual([`css ${LEAFLET_CSS_URL}`, `js ${LEAFLET_JS_URL}`]);
  });

  it('a custom engineUrl gets no integrity and no early sheet; the factory wins over the picker', async () => {
    const ctx = fakeContext({ options: { engineUrl: '/picker/leaflet.js' } });
    await leafletProvider({ engineUrl: '/vendor/leaflet.js' }).load?.(ctx);
    expect(ctx.loadScript.mock.calls).toEqual([['/vendor/leaflet.js', undefined]]);
    expect(ctx.loadStylesheet).not.toHaveBeenCalled();
    const picker = fakeContext({ options: { engineUrl: '/picker/leaflet.js' } });
    await leafletProvider().load?.(picker);
    expect(picker.loadScript.mock.calls).toEqual([['/picker/leaflet.js', undefined]]);
  });

  it('engineUrl: false without an engine gives ENGINE_MISSING and loads nothing', () => {
    for (const [factory, picker] of [
      [{ engineUrl: false }, {}],
      [{}, { engineUrl: false }],
    ] as const) {
      const ctx = fakeContext({ options: picker });
      const adapter = leafletProvider(factory);
      expect(() => adapter.load?.(ctx)).toThrow(
        expect.objectContaining({ code: 'ENGINE_MISSING' }),
      );
      expect(() => adapter.mount(ctx)).toThrow(expect.objectContaining({ code: 'ENGINE_MISSING' }));
      expect(ctx.loadScript).not.toHaveBeenCalled();
      expect(ctx.loadStylesheet).not.toHaveBeenCalled();
    }
    const error = (() => {
      try {
        void leafletProvider({ engineUrl: false }).load?.(fakeContext());
      } catch (cause) {
        return cause as { fix: string; level: string };
      }
    })();
    expect(error).toMatchObject({ level: 'error' });
    expect(error?.fix).toContain('engine');
  });
});

describe('WP3-02 engine CSS order (§4.3)', () => {
  it('step 1: an explicit engineCssUrl is linked as given (SRI only for the pinned URL)', async () => {
    const ctx = fakeContext({ options: { engineCssUrl: '/vendor/leaflet.css' } });
    await leafletProvider().load?.(ctx);
    Reflect.set(globalThis, 'L', fakeLeaflet());
    mountSync(leafletProvider(), ctx);
    expect(ctx.loadStylesheet.mock.calls).toEqual([['/vendor/leaflet.css', undefined]]);
    const pinned = fakeContext({
      options: { engineCssUrl: LEAFLET_CSS_URL, engine: fakeLeaflet() },
    });
    mountSync(leafletProvider(), pinned);
    expect(pinned.loadStylesheet.mock.calls).toEqual([[LEAFLET_CSS_URL, LEAFLET_CSS_INTEGRITY]]);
  });

  it('step 2 happens once per mount: mount after an auto-load adds no second sheet', async () => {
    const ctx = fakeContext();
    const adapter = leafletProvider();
    await adapter.load?.(ctx);
    Reflect.set(globalThis, 'L', fakeLeaflet());
    mountSync(adapter, ctx);
    await flush();
    expect(ctx.loadStylesheet).toHaveBeenCalledTimes(1);
  });

  it('step 3: a Document that already styles .leaflet-pane links nothing and reports nothing', async () => {
    document.head.innerHTML = CSS_LOADED;
    const ctx = fakeContext({ options: { engine: fakeLeaflet() } });
    mountSync(leafletProvider(), ctx);
    await flush();
    expect(ctx.adoptDocumentRules).toHaveBeenCalledTimes(0);
    expect(ctx.loadStylesheet).not.toHaveBeenCalled();
    expect(ctx.report).not.toHaveBeenCalled();
  });

  it("step 3': a ShadowRoot copies readable document rules instead of linking", async () => {
    const host = document.createElement('div');
    document.body.append(host);
    const root = host.attachShadow({ mode: 'open' });
    const ctx = fakeContext({ root, options: { engine: fakeLeaflet() } });
    root.append(ctx.container);
    ctx.adoptDocumentRules.mockImplementation(async () => {
      root.append(document.createRange().createContextualFragment(CSS_LOADED));
      return 3;
    });
    mountSync(leafletProvider(), ctx);
    await flush();
    expect(ctx.adoptDocumentRules.mock.calls).toEqual([[/\.leaflet-/]]);
    expect(ctx.loadStylesheet).not.toHaveBeenCalled();
    expect(ctx.report).not.toHaveBeenCalled();
  });

  it('step 4: nothing readable, so the pinned sheet is linked with SRI; step 5 reports when it never applies', async () => {
    const ctx = fakeContext({ options: { engine: fakeLeaflet() } });
    mountSync(leafletProvider(), ctx);
    await flush();
    expect(ctx.loadStylesheet.mock.calls).toEqual([[LEAFLET_CSS_URL, LEAFLET_CSS_INTEGRITY]]);
    expect(reported(ctx)).toEqual(['ENGINE_CSS_MISSING']);
    expect(ctx.report.mock.calls[0]?.[0]).toMatchObject({ level: 'warn' });
  });

  it('step 5 waits for the pending sheet (load, error or timeout) and passes once it applies', async () => {
    let settle: () => void = () => {};
    const ctx = fakeContext({ options: { engine: fakeLeaflet() } });
    ctx.loadStylesheet.mockImplementation(() => new Promise<void>((resolve) => (settle = resolve)));
    const handle = mountSync(leafletProvider(), ctx);
    expect(handle.map).toBe(leafletMap());
    await flush();
    expect(ctx.report).not.toHaveBeenCalled();
    document.head.innerHTML = CSS_LOADED;
    settle();
    await flush();
    expect(ctx.report).not.toHaveBeenCalled();
  });

  it("engineCssUrl: false skips steps 1, 2 and 4 (no link), keeps 3' and still verifies", async () => {
    const ctx = fakeContext({ options: { engineCssUrl: false } });
    await leafletProvider().load?.(ctx);
    Reflect.set(globalThis, 'L', fakeLeaflet());
    mountSync(leafletProvider({ engineCssUrl: false }), ctx);
    await flush();
    expect(ctx.loadStylesheet).not.toHaveBeenCalled();
    expect(ctx.adoptDocumentRules).toHaveBeenCalledTimes(1);
    expect(reported(ctx)).toEqual(['ENGINE_CSS_MISSING']);
  });

  it('a destroyed mount reports nothing', async () => {
    const ctx = fakeContext({ options: { engine: fakeLeaflet() } });
    mountSync(leafletProvider(), ctx);
    ctx.controller.abort();
    await flush();
    expect(ctx.report).not.toHaveBeenCalled();
  });
});

describe('WP3-03 / WP3-04 Leaflet map options and gestures', () => {
  it('constructs per §4.2 (greedy on a page that does not scroll); mapOptions go last, the factory winning', () => {
    const ctx = fakeContext({ options: { mapOptions: { zoomSnap: 0.5, keyboard: false } } });
    mountSync(leafletProvider({ engine: fakeLeaflet(), mapOptions: { zoomSnap: 0.25 } }), ctx);
    expect(leafletMap().options).toEqual({
      center: [48.8584, 2.2945],
      zoom: 15,
      maxZoom: 19,
      zoomControl: true,
      attributionControl: true,
      dragging: true,
      scrollWheelZoom: 'center',
      doubleClickZoom: 'center',
      touchZoom: 'center',
      boxZoom: false,
      keyboard: false,
      zoomSnap: 0.25,
    });
  });

  it('auto on a scrolling page and cooperative turn the wheel handler off; none turns every gesture off', () => {
    for (const [gestureHandling, pageScrolls] of [
      ['auto', true],
      ['cooperative', false],
    ] as const) {
      mountSync(
        leafletProvider({ engine: fakeLeaflet() }),
        fakeContext({ gestureHandling, pageScrolls }),
      );
      expect(leafletMap().options).toMatchObject({
        scrollWheelZoom: false,
        touchZoom: 'center',
        dragging: true,
      });
    }
    mountSync(leafletProvider({ engine: fakeLeaflet() }), fakeContext({ gestureHandling: 'none' }));
    expect(leafletMap().options).toMatchObject({
      scrollWheelZoom: false,
      touchZoom: false,
      doubleClickZoom: false,
      dragging: false,
      keyboard: true,
    });
  });

  it('greedy: a wheel opens a gesture unless the zoom is at its limit', () => {
    const ctx = fakeContext();
    mountSync(leafletProvider({ engine: fakeLeaflet() }), ctx);
    expect(wheel(ctx.container, { deltaY: -100 }).defaultPrevented).toBe(false);
    expect(ctx.events.interactionStart).toHaveBeenCalledTimes(1);
    leafletMap().zoom = 19;
    wheel(ctx.container, { deltaY: -100 });
    expect(ctx.events.interactionStart).toHaveBeenCalledTimes(1);
    wheel(ctx.container, { deltaY: 100 });
    expect(ctx.events.interactionStart).toHaveBeenCalledTimes(2);
    expect(ctx.showHint).not.toHaveBeenCalled();
  });

  it('cooperative: a plain wheel hints and scrolls; Ctrl/⌘ + wheel zooms one centred step per burst', () => {
    const ctx = fakeContext({ gestureHandling: 'cooperative' });
    mountSync(leafletProvider({ engine: fakeLeaflet() }), ctx);
    const plain = wheel(ctx.container, { deltaY: 100 });
    expect(plain.defaultPrevented).toBe(false);
    expect(ctx.showHint.mock.calls).toEqual([['Use Ctrl + scroll to zoom the map']]);
    expect(ctx.events.interactionStart).not.toHaveBeenCalled();

    const ctrl = wheel(ctx.container, { deltaY: -100, ctrlKey: true });
    expect(ctrl.defaultPrevented).toBe(true);
    expect(leafletMap().zoom).toBe(16);
    expect(leafletMap().center).toEqual([48.8584, 2.2945]);
    expect(ctx.events.interactionStart).toHaveBeenCalledTimes(1);
    // the rest of the same burst (a trackpad pinch sends dozens) is swallowed
    expect(wheel(ctx.container, { deltaY: -100, ctrlKey: true }).defaultPrevented).toBe(true);
    expect(leafletMap().zoom).toBe(16);
    expect(wheel(ctx.container, { deltaY: 100, metaKey: true }).defaultPrevented).toBe(true);
    expect(ctx.showHint).toHaveBeenCalledTimes(1);
  });

  it('none: the wheel is left to the page, without a hint', () => {
    const ctx = fakeContext({ gestureHandling: 'none' });
    mountSync(leafletProvider({ engine: fakeLeaflet() }), ctx);
    expect(wheel(ctx.container, { deltaY: 100, ctrlKey: true }).defaultPrevented).toBe(false);
    expect(ctx.showHint).not.toHaveBeenCalled();
    expect(ctx.events.interactionStart).not.toHaveBeenCalled();
  });

  it('setInteractive: zoom-only stops panning (drag and arrows), none disables every handler and the zoom control', () => {
    const ctx = fakeContext();
    const handle = mountSync(leafletProvider({ engine: fakeLeaflet() }), ctx);
    const map = leafletMap();
    const afterAdapter = vi.fn<() => void>();
    ctx.container.addEventListener('keydown', afterAdapter);

    handle.setInteractive('zoom-only');
    expect([
      map.dragging.enabled,
      map.scrollWheelZoom.enabled,
      map.touchZoom.enabled,
      map.keyboard.enabled,
    ]).toEqual([false, true, true, true]);
    keydown(ctx.container, 'ArrowLeft');
    keydown(ctx.container, '+');
    expect(afterAdapter).toHaveBeenCalledTimes(1);
    expect(ctx.events.interactionStart).toHaveBeenCalledTimes(1);

    handle.setInteractive('none');
    expect(
      [map.dragging, map.scrollWheelZoom, map.touchZoom, map.doubleClickZoom, map.keyboard].map(
        (h) => h.enabled,
      ),
    ).toEqual([false, false, false, false, false]);
    expect(map.zoomControl.disable).toHaveBeenCalled();

    handle.setInteractive('full');
    expect(
      [map.dragging, map.scrollWheelZoom, map.touchZoom, map.doubleClickZoom, map.keyboard].map(
        (h) => h.enabled,
      ),
    ).toEqual([true, true, true, true, true]);
    expect(map.options.scrollWheelZoom).toBe('center');
    expect(map.zoomControl.enable).toHaveBeenCalled();
  });

  it('a handler set in mapOptions is left alone', () => {
    const ctx = fakeContext({ options: { mapOptions: { dragging: false } } });
    const handle = mountSync(leafletProvider({ engine: fakeLeaflet() }), ctx);
    handle.setInteractive('full');
    expect(leafletMap().dragging.enabled).toBe(false);
  });
});

describe('WP3-05 Leaflet tiles', () => {
  it('the OSM default always carries the OSM credit', () => {
    mountSync(
      leafletProvider({
        engine: fakeLeaflet(),
        attribution: 'mine',
        tileOptions: { detectRetina: true },
      }),
      fakeContext(),
    );
    const [layer] = leafletMap().layers;
    expect(layer).toMatchObject({
      url: OSM_TILE_URL,
      options: { maxZoom: 19, attribution: OSM_ATTRIBUTION, detectRetina: true },
    });
  });

  it('a custom tileUrl uses its attribution; a factory tileUrl without one warns once', () => {
    const { warn } = spyConsole();
    mountSync(
      leafletProvider({ engine: fakeLeaflet() }),
      fakeContext({
        options: { tileUrl: '/tiles/{z}/{x}/{y}.png', attribution: '© Me', maxZoom: 20 },
      }),
    );
    expect(leafletMap().layers[0]).toMatchObject({
      url: '/tiles/{z}/{x}/{y}.png',
      options: { attribution: '© Me', maxZoom: 20 },
    });
    expect(warn).not.toHaveBeenCalled();
    const adapter = leafletProvider({ engine: fakeLeaflet(), tileUrl: '/x/{z}/{x}/{y}.png' });
    mountSync(adapter, fakeContext());
    mountSync(adapter, fakeContext());
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0]?.[0])).toMatch(/^\[location-picker\] .*attribution/);
  });

  it('update() swaps the layer in place and applies a new gesture mode; an unchanged layer stays', () => {
    const ctx = fakeContext();
    const handle = mountSync(leafletProvider({ engine: fakeLeaflet() }), ctx) as MapHandle & {
      update(options: FakeContext['options'], gestures?: string): void;
    };
    const map = leafletMap();
    const first = map.layers[0];
    handle.update(ctx.options, 'auto');
    expect(map.layers).toEqual([first]);
    handle.update(
      { ...ctx.options, tileUrl: '/tiles/{z}/{x}/{y}.png', attribution: '© Me' },
      'cooperative',
    );
    expect(map.layers).toHaveLength(1);
    expect(map.layers[0]).toMatchObject({
      url: '/tiles/{z}/{x}/{y}.png',
      options: { attribution: '© Me' },
    });
    expect(map.scrollWheelZoom.enabled).toBe(false);
    expect(FakeLeafletMap.instances).toHaveLength(1);
    handle.update({ ...ctx.options, maxZoom: 12 });
    expect(map.maxZoom).toBe(12);
  });
});

describe('WP3-06 and A8 Leaflet events', () => {
  it('maps move, moveend, pointers and pan/zoom keys onto MapEvents', () => {
    const ctx = fakeContext();
    const handle = mountSync(leafletProvider({ engine: fakeLeaflet() }), ctx);
    const map = leafletMap();
    map.center = [10, 20];
    map.fire('move');
    expect(ctx.events.move).toHaveBeenLastCalledWith({ lat: 10, lng: 20 });
    map.fire('moveend');
    expect(ctx.events.moveEnd).toHaveBeenLastCalledWith({ lat: 10, lng: 20 }, 15);
    expect(ctx.events.interactionEnd).toHaveBeenCalledTimes(1);

    ctx.container.dispatchEvent(new Event('pointerdown'));
    ctx.container.dispatchEvent(new Event('pointerup'));
    ctx.container.dispatchEvent(new Event('pointercancel'));
    for (const key of [
      'ArrowUp',
      'ArrowDown',
      'ArrowLeft',
      'ArrowRight',
      '+',
      '-',
      '=',
      'a',
      'Enter',
    ])
      keydown(ctx.container, key);
    expect(ctx.events.interactionStart).toHaveBeenCalledTimes(1 + 7);
    expect(ctx.events.interactionEnd).toHaveBeenCalledTimes(3);

    handle.resize();
    expect(map.invalidateSize).toHaveBeenCalled();
    expect(ctx.events.move).toHaveBeenLastCalledWith({ lat: 10, lng: 20 });
  });

  it('setView, setZoom, getCenter and getZoom drive the engine; destroy removes it and its classes', () => {
    const ctx = fakeContext();
    ctx.container.className = 'lp-map';
    const handle = mountSync(leafletProvider({ engine: fakeLeaflet() }), ctx);
    const map = leafletMap();
    expect(ctx.container.className).toContain('leaflet-container');
    handle.setView({ lat: 1, lng: 2 }, undefined, { animate: false });
    expect([map.center, map.zoom]).toEqual([[1, 2], 15]);
    handle.setView({ lat: 3, lng: 4 }, 12, { animate: true });
    handle.setZoom(13);
    expect(handle.getCenter()).toEqual({ lat: 3, lng: 4 });
    expect(handle.getZoom()).toBe(13);
    handle.destroy();
    expect(map.remove).toHaveBeenCalledTimes(1);
    expect(ctx.container.className).toBe('lp-map');
  });
});

describe('WP3-07 a Leaflet-2-style namespace', () => {
  it('uses nothing but new Map and new TileLayer', () => {
    const touched = new Set<PropertyKey>();
    const engine = new Proxy(fakeLeaflet(), {
      get(target, key, receiver) {
        touched.add(key);
        return Reflect.get(target, key, receiver);
      },
    });
    const ctx = fakeContext();
    const adapter = leafletProvider({ engine });
    expect(adapter.load?.(ctx)).toBeUndefined();
    mountSync(adapter, ctx);
    expect([...touched].map(String).sort((a, b) => a.localeCompare(b))).toEqual([
      'Map',
      'TileLayer',
    ]);
  });
});

describe('WP3-15 maplibreProvider: loading', () => {
  it('without an engine or engineUrl: ENGINE_MISSING with the +esm fix, and nothing is loaded', () => {
    const ctx = fakeContext();
    const adapter = maplibreProvider();
    let thrown: unknown;
    try {
      void adapter.load?.(ctx);
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toMatchObject({ code: 'ENGINE_MISSING', level: 'error' });
    expect((thrown as { fix: string }).fix).toContain(
      'https://cdn.jsdelivr.net/npm/maplibre-gl@6/+esm',
    );
    expect((thrown as { fix: string }).fix).toContain('engine-css-url');
    expect(() => adapter.mount(ctx)).toThrow(expect.objectContaining({ code: 'ENGINE_MISSING' }));
    expect(ctx.loadScript).not.toHaveBeenCalled();
    expect(ctx.loadStylesheet).not.toHaveBeenCalled();
    expect(document.querySelectorAll('script, link')).toHaveLength(0);
  });

  it('uses the engine option or a global maplibregl synchronously', () => {
    expect(maplibreProvider({ engine: fakeMapLibre() }).load?.(fakeContext())).toBeUndefined();
    Reflect.set(globalThis, 'maplibregl', fakeMapLibre());
    const ctx = fakeContext();
    const adapter = maplibreProvider();
    expect(adapter.load?.(ctx)).toBeUndefined();
    expect(mountSync(adapter, ctx).map).toBe(maplibreMap());
  });

  it('imports an opt-in engineUrl; a failed import is ENGINE_LOAD_FAILED', async () => {
    const source = `export class Map { constructor(o) { this.o = o; } } export const getVersion = () => '6.0.0';`;
    const url = `data:text/javascript,${encodeURIComponent(source)}`;
    const ctx = fakeContext();
    const adapter = maplibreProvider({ engineUrl: url });
    await adapter.load?.(ctx);
    // The imported module is now the engine: the next mount loads nothing.
    expect(adapter.load?.(fakeContext())).toBeUndefined();

    const broken = `data:text/javascript,${encodeURIComponent('throw new Error("nope")')}`;
    await expect(
      maplibreProvider({ engineUrl: broken }).load?.(fakeContext()),
    ).rejects.toMatchObject({
      code: 'ENGINE_LOAD_FAILED',
    });
  });
});

describe('WP3-15 maplibreProvider: the map', () => {
  it('constructs per §4.5: [lng, lat], OpenFreeMap liberty, rotation off; mapOptions last', () => {
    const ctx = fakeContext({ options: { mapOptions: { hash: true } } });
    mountSync(maplibreProvider({ engine: fakeMapLibre(), mapOptions: { fadeDuration: 0 } }), ctx);
    const map = maplibreMap();
    expect(OPENFREEMAP_STYLE_URL).toBe('https://tiles.openfreemap.org/styles/liberty');
    expect(map.options).toEqual({
      container: ctx.container,
      style: OPENFREEMAP_STYLE_URL,
      center: [2.2945, 48.8584],
      zoom: 15,
      dragRotate: false,
      pitchWithRotate: false,
      touchPitch: false,
      boxZoom: false,
      doubleClickZoom: false,
      keyboard: false,
      cooperativeGestures: false,
      attributionControl: { compact: false },
      hash: true,
      fadeDuration: 0,
    });
    expect(map.scrollZoom.enableOptions).toContainEqual({ around: 'center' });
    expect(map.touchZoomRotate.enableOptions).toContainEqual({ around: 'center' });
    expect(map.touchZoomRotate.disableRotation).toHaveBeenCalled();
    expect(map.canvas.tabIndex).toBe(-1);
  });

  it('maxZoom only when set; cooperativeGestures for cooperative and for auto on a scrolling page', () => {
    mountSync(
      maplibreProvider({ engine: fakeMapLibre() }),
      fakeContext({ options: { maxZoom: 18 }, pageScrolls: true }),
    );
    expect(maplibreMap().options).toMatchObject({ maxZoom: 18, cooperativeGestures: true });
    mountSync(
      maplibreProvider({ engine: fakeMapLibre() }),
      fakeContext({ gestureHandling: 'cooperative' }),
    );
    expect(maplibreMap().options).toMatchObject({ cooperativeGestures: true });
    expect(maplibreMap().options).not.toHaveProperty('maxZoom');
  });

  it('style: the factory mapStyle, then the picker mapStyle, then a raster wrapper for a custom tileUrl', () => {
    mountSync(
      maplibreProvider({ engine: fakeMapLibre(), mapStyle: '/factory.json' }),
      fakeContext({ options: { mapStyle: '/picker.json', tileUrl: '/t/{z}/{x}/{y}.png' } }),
    );
    expect(maplibreMap().options.style).toBe('/factory.json');
    mountSync(
      maplibreProvider({ engine: fakeMapLibre() }),
      fakeContext({ options: { mapStyle: '/picker.json' } }),
    );
    expect(maplibreMap().options.style).toBe('/picker.json');
    mountSync(
      maplibreProvider({ engine: fakeMapLibre() }),
      fakeContext({ options: { tileUrl: '/t/{z}/{x}/{y}.png', attribution: '© Me' } }),
    );
    expect(maplibreMap().options.style).toEqual({
      version: 8,
      sources: {
        t: { type: 'raster', tiles: ['/t/{z}/{x}/{y}.png'], tileSize: 256, attribution: '© Me' },
      },
      layers: [{ id: 't', type: 'raster', source: 't' }],
    });
  });

  it('events, keys, double-click and the handle', () => {
    const ctx = fakeContext({ gestureHandling: 'cooperative' });
    const handle = mountSync(maplibreProvider({ engine: fakeMapLibre() }), ctx);
    const map = maplibreMap();
    map.center = { lng: 20, lat: 10 };
    map.fire('move');
    map.fire('moveend');
    expect(ctx.events.move).toHaveBeenLastCalledWith({ lat: 10, lng: 20 });
    expect(ctx.events.moveEnd).toHaveBeenLastCalledWith({ lat: 10, lng: 20 }, 15);
    expect(ctx.events.interactionEnd).toHaveBeenCalledTimes(1);

    wheel(ctx.container, { deltaY: 100 });
    expect(ctx.events.interactionStart).not.toHaveBeenCalled();
    wheel(ctx.container, { deltaY: 100, ctrlKey: true });
    expect(ctx.events.interactionStart).toHaveBeenCalledTimes(1);

    expect(keydown(ctx.container, 'ArrowRight').defaultPrevented).toBe(true);
    keydown(ctx.container, '+');
    keydown(ctx.container, '-');
    keydown(ctx.container, 'a');
    ctx.container.dispatchEvent(new MouseEvent('dblclick'));
    expect(map.calls).toEqual([
      ['panBy', [100, 0]],
      ['zoomIn', undefined],
      ['zoomOut', undefined],
      ['zoomIn', undefined],
    ]);

    handle.setInteractive('zoom-only');
    expect([map.dragPan.enabled, map.scrollZoom.enabled]).toEqual([false, true]);
    expect(keydown(ctx.container, 'ArrowLeft').defaultPrevented).toBe(false);
    handle.setInteractive('none');
    expect([map.dragPan.enabled, map.scrollZoom.enabled, map.touchZoomRotate.enabled]).toEqual([
      false,
      false,
      false,
    ]);
    expect(keydown(ctx.container, '+').defaultPrevented).toBe(false);

    map.calls.length = 0;
    handle.setView({ lat: 1, lng: 2 }, undefined, { animate: false });
    handle.setView({ lat: 3, lng: 4 }, 9, { animate: true });
    handle.setZoom(7);
    handle.resize();
    expect(map.calls).toEqual([
      ['jumpTo', { center: [2, 1] }],
      ['easeTo', { center: [4, 3], zoom: 9 }],
      ['zoomTo', 7],
      ['resize', undefined],
    ]);
    handle.destroy();
    expect(map.remove).toHaveBeenCalledTimes(1);
  });

  it('CSS: nothing fetched by default; ENGINE_CSS_MISSING carries the version-pinned fix', async () => {
    const ctx = fakeContext();
    mountSync(maplibreProvider({ engine: fakeMapLibre('6.14.0') }), ctx);
    await flush();
    expect(ctx.loadStylesheet).not.toHaveBeenCalled();
    expect(reported(ctx)).toEqual(['ENGINE_CSS_MISSING']);
    const { fix } = must(ctx.report.mock.calls[0], 'a report')[0];
    expect(fix).toContain("import 'maplibre-gl/dist/maplibre-gl.css'");
    expect(fix).toContain(
      'engine-css-url="https://cdn.jsdelivr.net/npm/maplibre-gl@6.14.0/dist/maplibre-gl.css"',
    );
  });

  it('CSS: an engineCssUrl is linked as given (no SRI); readable document CSS needs nothing', async () => {
    const ctx = fakeContext({ options: { engineCssUrl: '/maplibre.css' } });
    mountSync(maplibreProvider({ engine: fakeMapLibre() }), ctx);
    expect(ctx.loadStylesheet.mock.calls).toEqual([['/maplibre.css', undefined]]);
    document.head.innerHTML = CSS_LOADED;
    const styled = fakeContext();
    mountSync(maplibreProvider({ engine: fakeMapLibre() }), styled);
    await flush();
    expect(styled.loadStylesheet).not.toHaveBeenCalled();
    expect(styled.report).not.toHaveBeenCalled();
  });

  it('pairs with Photon', async () => {
    const factory = maplibreProvider().geocoder;
    if (typeof factory != 'function') throw new Error('expected a geocoder factory');
    expect((await factory(fakeContext(), {} as never)).pairsWith).toContain('maplibre');
  });
});
