// The keyless default adapter: Leaflet + raster tiles (CONTRACT §4.2, §4.3). Only the `Map` and `TileLayer`
// constructors of the namespace are used, so Leaflet 1.9 and 2.x (no global `L`, no factories) both work.
import type {
  GestureHandling,
  LatLng,
  MapHandle,
  Messages,
  MountContext,
  ProviderAdapter,
  ProviderMountOptions,
} from '../core.js';
import { createError } from '../core/errors.js';
import { engineCss, gestureMode, prefer, type GestureMode } from './engine-css.js';

/** Minimal structural view of `L.Map`. Use `LocationPicker<L.Map>` with your own @types/leaflet for full typing. */
export interface LeafletMap {
  getCenter(): { lat: number; lng: number };
  getZoom(): number;
  getContainer(): HTMLElement;
  remove(): unknown;
}

/** Minimal structural view of the Leaflet namespace (1.9 and 2.x, constructor style). */
export interface LeafletNamespace {
  readonly version: string;
  readonly Map: new (element: HTMLElement, options?: object) => unknown;
  readonly TileLayer: new (url: string, options?: object) => unknown;
}

/** Options for {@link leafletProvider}; they win over the picker's provider options. */
export interface LeafletProviderOptions {
  /** `import * as L from 'leaflet'`. @default globalThis.L, else auto-load the pinned 1.9.4 */
  engine?: LeafletNamespace | object;
  /** @default 'https://tile.openstreetmap.org/{z}/{x}/{y}.png' */
  tileUrl?: string;
  /** @default OSM_ATTRIBUTION */
  attribution?: string;
  /** @default 19 */
  maxZoom?: number;
  /** Extra `L.tileLayer` options. @default {} */
  tileOptions?: Record<string, unknown>;
  /** @default LEAFLET_JS_URL (with LEAFLET_JS_INTEGRITY); false = never auto-load */
  engineUrl?: string | false;
  /** @default resolution order in CONTRACT.md §4.3; false = never link CSS */
  engineCssUrl?: string | false;
  /** Merged into `new L.Map(container, …)`, last. @default {} */
  mapOptions?: Record<string, unknown>;
}

export const LEAFLET_VERSION = '1.9.4';
export const LEAFLET_JS_URL = 'https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.js';
export const LEAFLET_JS_INTEGRITY = 'sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=';
export const LEAFLET_CSS_URL = 'https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.css';
export const LEAFLET_CSS_INTEGRITY = 'sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=';
export const OSM_TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
/** `'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'` */
export const OSM_ATTRIBUTION: string =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

// The instance surface used here, shared by Leaflet 1.9 and 2.x.
interface Handler {
  enable(): unknown;
  disable(): unknown;
}
interface Leaflet {
  Map: new (element: HTMLElement, options: object) => LMap;
  TileLayer: new (url: string, options: object) => object;
}
type HandlerName = 'dragging' | 'touchZoom' | 'doubleClickZoom' | 'scrollWheelZoom' | 'keyboard';
interface LMap extends LeafletMap, Partial<Record<HandlerName, Handler>> {
  options: Record<string, unknown>;
  zoomControl?: Partial<Handler>;
  on(type: string, fn: () => void): unknown;
  setView(center: [number, number], zoom: number, options: object): unknown;
  setZoom(zoom: number): unknown;
  setMaxZoom(zoom: number): unknown;
  getMinZoom(): number;
  getMaxZoom(): number;
  invalidateSize(): unknown;
  addLayer(layer: object): unknown;
  removeLayer(layer: object): unknown;
}

const PAN_KEY = /^Arrow/;
const ZOOM_KEY = /^[-+=]$/;

/**
 * Leaflet + raster tiles adapter (the keyless default). Zoom is anchored at the centre (wheel, double-click, pinch),
 * so zooming never changes the value. Paired geocoder: Photon.
 * @example
 * import * as L from 'leaflet';
 * import 'leaflet/dist/leaflet.css';
 * const picker = new LocationPicker<L.Map>('#map', { provider: leafletProvider<L.Map>({ engine: L }) });
 * picker.map; // L.Map, available synchronously
 */
export function leafletProvider<TMap = LeafletMap>(
  options: LeafletProviderOptions = {},
): ProviderAdapter<TMap> {
  const engineOf = (ctx: MountContext): Leaflet | undefined => {
    const engine: unknown = options.engine ?? ctx.options.engine ?? Reflect.get(globalThis, 'L');
    return typeof Reflect.get(Object(engine), 'Map') == 'function'
      ? (engine as Leaflet)
      : undefined;
  };
  let warned = false;
  const css = (ctx: MountContext, early?: boolean): void =>
    engineCss(
      ctx,
      {
        rules: /\.leaflet-/,
        probe: '.leaflet-pane',
        url: prefer(options.engineCssUrl, ctx.options.engineCssUrl),
        pinned: [LEAFLET_CSS_URL, LEAFLET_CSS_INTEGRITY],
        missing: () => createError('ENGINE_CSS_MISSING'),
      },
      early,
    );

  const adapter: ProviderAdapter<LMap> = {
    name: 'leaflet',
    geocoder: () => import('../photon.js').then((photon) => photon.photonGeocoder()),

    // Synchronous when the engine is present, so an adapter object mounts inside the constructor (§8g).
    load(ctx) {
      if (engineOf(ctx)) return;
      const url = prefer(options.engineUrl, ctx.options.engineUrl);
      if (url === false) throw createError('ENGINE_MISSING');
      const pinned = !url || url == LEAFLET_JS_URL;
      // §4.3 step 2: the pinned sheet goes in together with the pinned script, not after it.
      if (pinned) css(ctx, true);
      return ctx.loadScript(url || LEAFLET_JS_URL, pinned ? LEAFLET_JS_INTEGRITY : undefined);
    },

    mount(ctx) {
      const E = engineOf(ctx);
      if (!E) throw createError('ENGINE_MISSING');
      const { container, view, events, signal } = ctx;
      const own = { ...ctx.options.mapOptions, ...options.mapOptions };
      const classes = container.className;
      let mode: GestureMode = gestureMode(ctx.gestureHandling, ctx.pageScrolls);
      let interactive = ctx.interactive;
      let layer: object | undefined;
      let tiles = '';
      let wheelAt = 0;

      // Handler states for the gesture mode; the 'center' options keep every zoom anchored at the pin.
      const handlers = (): Record<HandlerName, boolean | 'center'> => {
        const on = interactive != 'none';
        const gestures = on && mode != 'none' && 'center';
        return {
          dragging: on && mode != 'none' && interactive == 'full',
          touchZoom: gestures,
          doubleClickZoom: gestures,
          scrollWheelZoom: mode == 'greedy' && gestures,
          keyboard: on,
        };
      };
      const maxZoom = (o: ProviderMountOptions): number => options.maxZoom ?? o.maxZoom ?? 19;
      const map = new E.Map(container, {
        center: [view.center.lat, view.center.lng],
        zoom: view.zoom,
        maxZoom: maxZoom(ctx.options),
        zoomControl: true,
        attributionControl: true,
        ...handlers(),
        boxZoom: false,
        ...own,
      });
      const apply = (): void => {
        for (const [name, state] of Object.entries(handlers())) {
          // mapOptions win over library defaults: a handler the user configured is left alone.
          if (name in own) continue;
          if (state) map.options[name] = state;
          map[name as HandlerName]?.[state ? 'enable' : 'disable']();
        }
        map.zoomControl?.[interactive == 'none' ? 'disable' : 'enable']?.();
      };
      const update = (o: ProviderMountOptions, gestures?: GestureHandling): void => {
        const max = maxZoom(o);
        const url = options.tileUrl ?? o.tileUrl ?? OSM_TILE_URL;
        const attribution =
          url == OSM_TILE_URL ? OSM_ATTRIBUTION : (options.attribution ?? o.attribution ?? '');
        // The core warns about the picker's own tileUrl; this covers the factory's, once.
        if (options.tileUrl && !attribution && !warned) {
          warned = true;
          console.warn(
            '[location-picker] leafletProvider: tileUrl has no attribution; credit the tile provider.',
          );
        }
        map.setMaxZoom(max);
        // A changed URL or credit swaps the layer in place: no remount (§4.2).
        if (tiles != (tiles = `${url} ${attribution} ${max}`)) {
          if (layer) map.removeLayer(layer);
          map.addLayer(
            (layer = new E.TileLayer(url, { maxZoom: max, attribution, ...options.tileOptions })),
          );
        }
        if (gestures) {
          mode = gestureMode(gestures, ctx.pageScrolls);
          apply();
        }
      };
      update(ctx.options);

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
      ): void =>
        container.addEventListener(type, listener, { capture: true, passive: false, signal });
      const start = (): void => events.interactionStart();
      const end = (): void => events.interactionEnd();
      on('pointerdown', start);
      on('pointerup', end);
      on('pointercancel', end);
      on('keydown', (event) => {
        if (PAN_KEY.test(event.key)) {
          // View-only: arrow keys must not move the map away from the value.
          if (interactive != 'full') event.stopImmediatePropagation();
          else start();
        } else if (ZOOM_KEY.test(event.key)) start();
      });
      // Cooperative gestures (§4.2): Ctrl/⌘ + wheel zooms one step per burst, a plain wheel scrolls the page and hints.
      on('wheel', (event) => {
        if (mode == 'none' || interactive == 'none' || !event.deltaY) return;
        const zoom = map.getZoom();
        const step = event.deltaY < 0 ? 1 : -1;
        const room = step > 0 ? zoom < map.getMaxZoom() : zoom > map.getMinZoom();
        if (mode == 'greedy') {
          // Leaflet zooms by itself; a wheel at the zoom limit changes nothing, so it opens no gesture.
          if (room) start();
        } else if (event.ctrlKey || event.metaKey) {
          event.preventDefault();
          if (room && event.timeStamp - wheelAt > 120) {
            start();
            map.setZoom(zoom + step);
          }
          wheelAt = event.timeStamp;
        } else {
          // The core's MountContext carries its UI strings (not part of the public MountContext type).
          const { messages } = ctx as MountContext & { messages?: Messages };
          if (messages) ctx.showHint(messages.cooperativeHint);
        }
      });

      css(ctx);
      const handle: MapHandle<LMap> & { update: typeof update } = {
        map,
        getCenter: center,
        getZoom: () => map.getZoom(),
        setView: (at, zoom, { animate }) =>
          map.setView([at.lat, at.lng], zoom ?? map.getZoom(), { animate }),
        setZoom: (zoom) => map.setZoom(zoom),
        setInteractive(next) {
          interactive = next;
          apply();
        },
        resize() {
          map.invalidateSize();
          // A8: Leaflet re-derives its centre from whole pixels even when it fires no `move`.
          events.move(center());
        },
        update,
        destroy() {
          map.remove();
          container.className = classes;
        },
      };
      return handle;
    },
  };
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- TMap is the caller's view of the engine map
  return adapter as unknown as ProviderAdapter<TMap>;
}
