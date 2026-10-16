// MapLibre GL adapter (CONTRACT §4.5): bring your own engine; neither its JS nor its CSS is fetched by default (R2).
// The public API stays latitude-first; MapLibre takes [lng, lat].
import type { LatLng, MapHandle, MountContext, ProviderAdapter } from '../core.js';
import { createError } from '../core/errors.js';
import { engineCss, gestureMode, prefer } from './engine-css.js';

/** Minimal structural view of `maplibregl.Map`. */
export interface MapLibreMap {
  getCenter(): { lng: number; lat: number };
  getZoom(): number;
  getContainer(): HTMLElement;
  remove(): void;
}

/** Options for {@link maplibreProvider}. */
export interface MapLibreProviderOptions {
  /** `import * as maplibregl from 'maplibre-gl'`. @default globalThis.maplibregl; otherwise ENGINE_MISSING */
  engine?: object;
  /** @default OPENFREEMAP_STYLE_URL */
  mapStyle?: string | object;
  /** Opt-in ESM URL loaded with import() (no SRI possible). @default undefined (never loaded) */
  engineUrl?: string;
  /**
   * MapLibre CSS URL to load (opt-in; no SRI unless it is your own pinned file). By default nothing is fetched: readable
   * document CSS is used (copied into shadow roots), else ENGINE_CSS_MISSING (warn) is reported with a fix that shows
   * `import 'maplibre-gl/dist/maplibre-gl.css'` and the exact `engine-css-url` for the running `maplibregl.getVersion()`.
   * @default undefined (no fetch; `false` is equivalent)
   */
  engineCssUrl?: string | false;
  /** Merged into `new maplibregl.Map(…)`, last. @default {} */
  mapOptions?: Record<string, unknown>;
}

export const OPENFREEMAP_STYLE_URL = 'https://tiles.openfreemap.org/styles/liberty';

interface Handler {
  enable(options?: object): unknown;
  disable(): unknown;
}
interface MapLibre {
  Map: new (options: object) => MLMap;
  getVersion?(): string;
}
type HandlerName = 'dragPan' | 'scrollZoom' | 'touchZoomRotate';
interface MLMap extends MapLibreMap, Record<HandlerName, Handler> {
  touchZoomRotate: Handler & { disableRotation(): unknown };
  on(type: string, fn: () => void): unknown;
  jumpTo(camera: object): unknown;
  easeTo(camera: object): unknown;
  zoomTo(zoom: number): unknown;
  zoomIn(): unknown;
  zoomOut(): unknown;
  panBy(offset: [number, number]): unknown;
  getMinZoom(): number;
  getMaxZoom(): number;
  getCanvas(): HTMLElement;
  resize(): unknown;
}

const CDN = 'https://cdn.jsdelivr.net/npm/maplibre-gl@';
const PAN: Record<string, [number, number]> = {
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
};
const ZOOM: Record<string, 1 | -1> = { '+': 1, '=': 1, '-': -1 };

const missing = () =>
  createError('ENGINE_MISSING', {
    fix: `Pass engine: maplibregl (import * as maplibregl from 'maplibre-gl'). Without a bundler: import * as maplibregl from '${CDN}6/+esm', set el.engine = maplibregl, and add engine-css-url="${CDN}6/dist/maplibre-gl.css".`,
  });

/**
 * MapLibre GL adapter (v5/v6). Zoom around the centre; rotation off; `cooperative` maps to `cooperativeGestures`.
 * Paired geocoder: Photon. The public API stays lat-first; the adapter converts to [lng, lat].
 * @example
 * import * as maplibregl from 'maplibre-gl';
 * import 'maplibre-gl/dist/maplibre-gl.css';
 * new LocationPicker('#map', { provider: maplibreProvider({ engine: maplibregl }) });
 */
export function maplibreProvider<TMap = MapLibreMap>(
  options: MapLibreProviderOptions = {},
): ProviderAdapter<TMap> {
  let imported: unknown;
  const engineOf = (ctx: MountContext): MapLibre | undefined => {
    const engine: unknown =
      options.engine ?? ctx.options.engine ?? imported ?? Reflect.get(globalThis, 'maplibregl');
    return typeof Reflect.get(Object(engine), 'Map') == 'function'
      ? (engine as MapLibre)
      : undefined;
  };

  const adapter: ProviderAdapter<MLMap> = {
    name: 'maplibre',
    geocoder: () => import('../photon.js').then((photon) => photon.photonGeocoder()),

    load(ctx) {
      if (engineOf(ctx)) return;
      const url = prefer(options.engineUrl, ctx.options.engineUrl);
      if (!url) throw missing();
      // Opt-in only: an ES module cannot carry SRI.
      return import(/* @vite-ignore */ url).then(
        (module: { default?: unknown }) => {
          imported = Reflect.get(Object(module.default), 'Map') ? module.default : module;
        },
        (cause: unknown) => {
          throw createError('ENGINE_LOAD_FAILED', { cause, vars: { url } });
        },
      );
    },

    mount(ctx) {
      const M = engineOf(ctx);
      if (!M) throw missing();
      const { container, view, events, signal } = ctx;
      const o = ctx.options;
      const own = { ...o.mapOptions, ...options.mapOptions };
      const mode = gestureMode(ctx.gestureHandling, ctx.pageScrolls);
      let interactive = ctx.interactive;
      const style =
        options.mapStyle ??
        o.mapStyle ??
        (o.tileUrl && {
          version: 8,
          sources: {
            t: { type: 'raster', tiles: [o.tileUrl], tileSize: 256, attribution: o.attribution },
          },
          layers: [{ id: 't', type: 'raster', source: 't' }],
        }) ??
        OPENFREEMAP_STYLE_URL;
      const map = new M.Map({
        container,
        style,
        center: [view.center.lng, view.center.lat],
        zoom: view.zoom,
        ...(o.maxZoom === undefined ? {} : { maxZoom: o.maxZoom }),
        dragRotate: false,
        pitchWithRotate: false,
        touchPitch: false,
        boxZoom: false,
        doubleClickZoom: false,
        // The container is the focus target (role=application), so its keys are handled below.
        keyboard: false,
        cooperativeGestures: mode == 'cooperative',
        attributionControl: { compact: false },
        ...own,
      });
      map.getCanvas().tabIndex = -1;
      map.touchZoomRotate.disableRotation();
      const zooms = (): boolean => interactive != 'none' && mode != 'none';
      const apply = (): void => {
        const states: Record<HandlerName, boolean> = {
          dragPan: zooms() && interactive == 'full',
          scrollZoom: zooms(),
          touchZoomRotate: zooms(),
        };
        for (const [name, on] of Object.entries(states)) {
          // mapOptions win over library defaults: a handler the user configured is left alone.
          if (!(name in own))
            map[name as HandlerName][on ? 'enable' : 'disable']({ around: 'center' });
        }
      };
      apply();

      const center = (): LatLng => {
        const { lat, lng } = map.getCenter();
        return { lat, lng };
      };
      map.on('move', () => events.move(center()));
      map.on('moveend', () => {
        events.moveEnd(center(), map.getZoom());
        events.interactionEnd();
      });

      const on = <K extends keyof HTMLElementEventMap>(
        type: K,
        listener: (event: HTMLElementEventMap[K]) => void,
      ): void => container.addEventListener(type, listener, { capture: true, signal });
      const start = (): void => events.interactionStart();
      const end = (): void => events.interactionEnd();
      on('pointerdown', start);
      on('pointerup', end);
      on('pointercancel', end);
      on('wheel', (event) => {
        const zoom = map.getZoom();
        if (
          zooms() &&
          (mode == 'greedy' || event.ctrlKey || event.metaKey) &&
          (event.deltaY < 0 ? zoom < map.getMaxZoom() : zoom > map.getMinZoom())
        )
          start();
      });
      on('dblclick', () => {
        if (zooms()) void map.zoomIn();
      });
      on('keydown', (event) => {
        if (event.target != container || event.ctrlKey || event.metaKey || event.altKey) return;
        // View-only (readOnly) keeps the zoom keys; arrows would move the map away from the value.
        const pan = interactive == 'full' && PAN[event.key];
        const step = interactive != 'none' && ZOOM[event.key];
        if (!pan && !step) return;
        event.preventDefault();
        start();
        if (pan) map.panBy([pan[0] * 100, pan[1] * 100]);
        else void (step == 1 ? map.zoomIn() : map.zoomOut());
      });

      engineCss(ctx, {
        rules: /\.maplibregl-/,
        // `.maplibregl-canvas` is the one engine element maplibre-gl.css positions absolutely on its own.
        probe: '.maplibregl-canvas',
        url: prefer(options.engineCssUrl, o.engineCssUrl),
        missing: () => {
          const version = M.getVersion?.() ?? '6';
          return createError('ENGINE_CSS_MISSING', {
            fix: `import 'maplibre-gl/dist/maplibre-gl.css' in your bundle, or set engine-css-url="${CDN}${version}/dist/maplibre-gl.css".`,
          });
        },
      });

      const handle: MapHandle<MLMap> = {
        map,
        getCenter: center,
        getZoom: () => map.getZoom(),
        setView(at, zoom, { animate }) {
          const camera = { center: [at.lng, at.lat], ...(zoom === undefined ? {} : { zoom }) };
          void (animate ? map.easeTo(camera) : map.jumpTo(camera));
        },
        setZoom: (zoom) => void map.zoomTo(zoom),
        setInteractive(next) {
          interactive = next;
          apply();
        },
        resize() {
          map.resize();
          events.move(center());
        },
        destroy: () => map.remove(),
      };
      return handle;
    },
  };
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- TMap is the caller's view of the engine map
  return adapter as unknown as ProviderAdapter<TMap>;
}
