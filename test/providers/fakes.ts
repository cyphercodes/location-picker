// Recording stand-ins for the unit project: a MountContext and minimal Leaflet / MapLibre namespaces, so the adapters'
// decisions (loading, CSS order, constructor options, handlers, events) are checked exactly, without an engine.
import { vi, type Mock } from 'vitest';
import type { MapEvents, MountContext, ProviderMountOptions } from '../../src/core.js';

type Recorded =
  'events' | 'loadScript' | 'loadStylesheet' | 'adoptDocumentRules' | 'showHint' | 'report';
export interface FakeContext extends Omit<MountContext, Recorded> {
  readonly events: { readonly [K in keyof MapEvents]: Mock<MapEvents[K]> };
  readonly loadScript: Mock<MountContext['loadScript']>;
  readonly loadStylesheet: Mock<MountContext['loadStylesheet']>;
  readonly adoptDocumentRules: Mock<MountContext['adoptDocumentRules']>;
  readonly showHint: Mock<MountContext['showHint']>;
  readonly report: Mock<MountContext['report']>;
  readonly controller: AbortController;
}

export function fakeContext(
  overrides: Partial<Omit<MountContext, 'options'>> & {
    options?: Partial<ProviderMountOptions>;
  } = {},
): FakeContext {
  const container = document.createElement('div');
  document.body.append(container);
  const controller = new AbortController();
  const { options, ...rest } = overrides;
  const ctx = {
    container,
    root: document,
    view: { center: { lat: 48.8584, lng: 2.2945 }, zoom: 15 },
    gestureHandling: 'auto',
    pageScrolls: false,
    interactive: 'full',
    lang: 'en',
    colorScheme: 'light',
    options: { mapOptions: {}, marker: 'pin', search: false, ...options },
    signal: controller.signal,
    controller,
    events: {
      move: vi.fn<MapEvents['move']>(),
      moveEnd: vi.fn<MapEvents['moveEnd']>(),
      interactionStart: vi.fn<MapEvents['interactionStart']>(),
      interactionEnd: vi.fn<MapEvents['interactionEnd']>(),
    },
    nonce: undefined,
    loadScript: vi.fn<MountContext['loadScript']>(async () => {}),
    loadStylesheet: vi.fn<MountContext['loadStylesheet']>(async () => {}),
    adoptDocumentRules: vi.fn<MountContext['adoptDocumentRules']>(async () => 0),
    showHint: vi.fn<MountContext['showHint']>(),
    report: vi.fn<MountContext['report']>(),
    messages: { cooperativeHint: 'Use Ctrl + scroll to zoom the map' },
    ...rest,
  };
  return ctx as unknown as FakeContext;
}

export interface FakeHandler {
  enabled: boolean;
  enable(options?: object): void;
  disable(): void;
  readonly enableOptions: (object | undefined)[];
}
const handler = (enabled: boolean): FakeHandler => {
  const h: FakeHandler = {
    enabled,
    enableOptions: [],
    enable(options) {
      h.enabled = true;
      h.enableOptions.push(options);
    },
    disable() {
      h.enabled = false;
    },
  };
  return h;
};

/** The few L.Map behaviours the adapter relies on; setView/setZoom fire move + moveend synchronously. */
export class FakeLeafletMap {
  static instances: FakeLeafletMap[] = [];
  readonly options: Record<string, unknown>;
  readonly layers: FakeTileLayer[] = [];
  readonly listeners = new Map<string, (() => void)[]>();
  readonly zoomControl = { enable: vi.fn<() => void>(), disable: vi.fn<() => void>() };
  readonly dragging: FakeHandler;
  readonly touchZoom: FakeHandler;
  readonly doubleClickZoom: FakeHandler;
  readonly scrollWheelZoom: FakeHandler;
  readonly keyboard: FakeHandler;
  readonly invalidateSize = vi.fn<() => void>();
  readonly remove = vi.fn<() => void>();
  center: [number, number];
  zoom: number;
  maxZoom: number;
  constructor(
    readonly container: HTMLElement,
    options: Record<string, unknown>,
  ) {
    this.options = { ...options };
    this.center = options.center as [number, number];
    this.zoom = options.zoom as number;
    this.maxZoom = (options.maxZoom as number) ?? 18;
    this.dragging = handler(options.dragging !== false);
    this.touchZoom = handler(!!options.touchZoom);
    this.doubleClickZoom = handler(!!options.doubleClickZoom);
    this.scrollWheelZoom = handler(!!options.scrollWheelZoom);
    this.keyboard = handler(options.keyboard !== false);
    container.className += ' leaflet-container';
    const pane = document.createElement('div');
    pane.className = 'leaflet-pane';
    container.append(pane);
    FakeLeafletMap.instances.push(this);
  }
  on(type: string, fn: () => void): this {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), fn]);
    return this;
  }
  fire(type: string): void {
    for (const fn of this.listeners.get(type) ?? []) fn();
  }
  getCenter() {
    return { lat: this.center[0], lng: this.center[1] };
  }
  getZoom() {
    return this.zoom;
  }
  getContainer() {
    return this.container;
  }
  getMinZoom() {
    return 0;
  }
  getMaxZoom() {
    return this.maxZoom;
  }
  setMaxZoom(zoom: number) {
    this.maxZoom = zoom;
  }
  setView(center: [number, number], zoom: number) {
    this.center = center;
    this.zoom = Math.min(zoom, this.maxZoom);
    this.fire('move');
    this.fire('moveend');
  }
  setZoom(zoom: number) {
    this.setView(this.center, zoom);
  }
  addLayer(layer: FakeTileLayer) {
    this.layers.push(layer);
  }
  removeLayer(layer: FakeTileLayer) {
    this.layers.splice(this.layers.indexOf(layer), 1);
  }
}
export class FakeTileLayer {
  constructor(
    readonly url: string,
    readonly options: Record<string, unknown>,
  ) {}
}
/** A Leaflet-2-style namespace: nothing but the two constructors. */
export const fakeLeaflet = (): { Map: typeof FakeLeafletMap; TileLayer: typeof FakeTileLayer } => {
  FakeLeafletMap.instances = [];
  return Object.freeze({ Map: FakeLeafletMap, TileLayer: FakeTileLayer });
};

/** The few maplibregl.Map behaviours the adapter relies on. */
export class FakeMapLibreMap {
  static instances: FakeMapLibreMap[] = [];
  readonly listeners = new Map<string, (() => void)[]>();
  readonly dragPan = handler(true);
  readonly scrollZoom = handler(true);
  readonly touchZoomRotate = Object.assign(handler(true), { disableRotation: vi.fn<() => void>() });
  readonly canvas = document.createElement('canvas');
  readonly calls: [string, unknown][] = [];
  readonly remove = vi.fn<() => void>();
  center: { lng: number; lat: number };
  zoom: number;
  constructor(readonly options: Record<string, unknown>) {
    const [lng, lat] = options.center as [number, number];
    this.center = { lng, lat };
    this.zoom = options.zoom as number;
    this.canvas.className = 'maplibregl-canvas';
    this.canvas.tabIndex = 0;
    (options.container as HTMLElement).append(this.canvas);
    FakeMapLibreMap.instances.push(this);
  }
  on(type: string, fn: () => void): this {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), fn]);
    return this;
  }
  fire(type: string): void {
    for (const fn of this.listeners.get(type) ?? []) fn();
  }
  getCenter() {
    return this.center;
  }
  getZoom() {
    return this.zoom;
  }
  getContainer() {
    return this.options.container as HTMLElement;
  }
  getCanvas() {
    return this.canvas;
  }
  getMinZoom() {
    return 0;
  }
  getMaxZoom() {
    return 22;
  }
  jumpTo(camera: unknown) {
    this.calls.push(['jumpTo', camera]);
  }
  easeTo(camera: unknown) {
    this.calls.push(['easeTo', camera]);
  }
  zoomTo(zoom: number) {
    this.calls.push(['zoomTo', zoom]);
  }
  zoomIn() {
    this.calls.push(['zoomIn', undefined]);
  }
  zoomOut() {
    this.calls.push(['zoomOut', undefined]);
  }
  panBy(offset: [number, number]) {
    this.calls.push(['panBy', offset]);
  }
  resize() {
    this.calls.push(['resize', undefined]);
  }
}
export const fakeMapLibre = (version = '6.14.0') => {
  FakeMapLibreMap.instances = [];
  return { Map: FakeMapLibreMap, getVersion: () => version };
};
