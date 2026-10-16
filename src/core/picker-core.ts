// The engine-agnostic picker shared by the class (WP2) and the element (WP4), CONTRACT §12.1: value state, rounding,
// de-duplication, source attribution, events, overlay, pin lift, geolocation, bound inputs, live region,
// search/reverse orchestration, provider loading and the MountContext callbacks.
//
// Value model (§3.3, §3.5): `#value` is the live value (it follows the pin during a user gesture, one frame at a time);
// `#committed` is the de-duplication baseline for `change` (the last commit or silent write); `#lastInput` is the last
// value emitted with `input`, so a gesture always ends with an `input` carrying the real value.
import type {
  Bounds,
  ChangeSource,
  GeocodeOptions,
  GeocodeResult,
  Geocoder,
  LocateOptions,
  LocationDetail,
  LocationPickerEventMap,
  MapEvents,
  MapHandle,
  MountContext,
  ProviderAdapter,
  SearchContext,
  SearchHandle,
  SetLocationOptions,
} from '../core.js';
import type * as C from '../internal/contracts.js';
import type {
  CoreHost,
  OverlayRefs,
  PickerSnapshot,
  PickerStateName,
  ResolvedConfig,
  SnapshotCause,
} from '../internal/contracts.js';
import type { LatLng, LatLngInput } from '../utils.js';
import { formatLatLng } from '../utils/format.js';
import { normalizeLatLng } from '../utils/normalize.js';
import { parseLatLng } from '../utils/parse.js';
import { BoundInputs } from './bind-inputs.js';
import { DEFAULTS, REMOUNT_KEYS, readLatLngInput } from './config.js';
import { UNSET_MARKER_POSITION, warnOnce } from './diagnostics.js';
import {
  createError,
  isLocationPickerError,
  reportError,
  type LocationPickerError,
} from './errors.js';
import { canGeolocate, geolocate } from './geolocation.js';
import { createMountContext, providerOptions } from './loader.js';
import { applyTexts, renderOverlay } from './overlay.js';
import { loadProvider, resolveGeocoder, SEARCH_UI } from './providers.js';
import { getStore } from './store.js';
import { adoptStyles } from './styles.js';

type Interactive = MountContext['interactive'];
type Extra = {
  readonly zoom?: number;
  readonly animate?: boolean;
  readonly accuracy?: number;
  readonly place?: GeocodeResult;
  /** false for user commits: the map is already there. */
  readonly move?: boolean;
};
interface Gesture {
  /** Rounded centre when the gesture began. */
  readonly start: string;
  /** Last value emitted live during this gesture. */
  last: string;
  emitted: boolean;
  moved: boolean;
}

let uid = 0;
const noop = (): void => {};
const isThenable = <T>(value: T | PromiseLike<T> | undefined): value is PromiseLike<T> =>
  typeof Reflect.get(Object(value), 'then') == 'function';
const reducedMotion = (): boolean =>
  typeof Reflect.get(globalThis, 'matchMedia') == 'function' &&
  matchMedia('(prefers-reduced-motion: reduce)').matches;
const keyOf = (event: Event): unknown => Reflect.get(event, 'key');
/** Web Mercator y, in degrees. */
const mercatorY = (lat: number): number =>
  (Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360)) * 180) / Math.PI;
const isResult = (value: unknown): value is GeocodeResult | null =>
  value === null || (typeof value == 'object' && 'lat' in value);
/** A camera whose reads always see the core's current state (a mount may start long after it was requested). */
const liveView = (
  center: () => LatLng,
  zoom: () => number,
): { readonly center: LatLng; readonly zoom: number } => ({
  get center() {
    return center();
  },
  get zoom() {
    return zoom();
  },
});
/** The rounded coordinate a canonical value denotes (§12.10: parseLatLng(value) deep-equals {lat, lng}). */
const toLatLng = (value: string): LatLng => {
  const { lat = 0, lng = 0 } = parseLatLng(value) ?? {};
  return { lat, lng };
};
const asError = (
  cause: unknown,
  code: 'GEOCODER_FAILED' | 'ENGINE_LOAD_FAILED',
): LocationPickerError => (isLocationPickerError(cause) ? cause : createError(code, { cause }));

type GeolocationText =
  'geolocationDenied' | 'geolocationUnavailable' | 'geolocationTimeout' | 'geolocationUnsupported';
const GEOLOCATION_TEXT: Partial<Record<LocationPickerError['code'], GeolocationText>> = {
  GEOLOCATION_DENIED: 'geolocationDenied',
  GEOLOCATION_UNAVAILABLE: 'geolocationUnavailable',
  GEOLOCATION_TIMEOUT: 'geolocationTimeout',
  GEOLOCATION_UNSUPPORTED: 'geolocationUnsupported',
};

/** Runs `fn` on the next animation frame (setTimeout 16 ms where rAF is missing, e.g. jsdom); returns a canceller. */
export function onFrame(fn: () => void): () => void {
  if (typeof requestAnimationFrame == 'function') {
    const id = requestAnimationFrame(fn);
    return () => cancelAnimationFrame(id);
  }
  const id = setTimeout(fn, 16);
  return () => clearTimeout(id);
}

/** Stable reverse-cache ids for custom geocoders (the provider name keys its paired geocoder). */
const geocoderIds = new WeakMap<Geocoder, string>();

/**
 * The engine-agnostic picker. Owns value state, rounding, de-duplication, source attribution, events, overlay, pin lift,
 * geolocation, bound inputs, live region, search/reverse orchestration, provider loading and MountContext.
 */
export class PickerCore {
  readonly host: CoreHost;
  readonly refs: OverlayRefs;
  /** Adapter callbacks, wrapped per mount by createMountContext. */
  readonly events: MapEvents;
  /**
   * The bound inputs' seed defaults (their server-rendered `value` attributes), captured when they were first read;
   * the element's form reset value when it has no `value`/`lat`/`lng` attribute (§3.3). Not part of §12.1.
   */
  seedDefault: LatLng | null = null;

  #config: ResolvedConfig;
  #snapshot!: PickerSnapshot;
  #handle: MapHandle | undefined;
  #ctx: MountContext | undefined;
  #adapter: ProviderAdapter | undefined;
  #ready!: Promise<MapHandle>;
  #settle:
    { resolve(handle: MapHandle): void; reject(error: LocationPickerError): void } | undefined;
  readonly #life = new AbortController();
  #mount: AbortController | undefined;
  #mounted = false;
  #dead = false;
  #remountQueued = false;
  #autoLocated = false;
  #phase: PickerSnapshot['phase'] = 'loading';
  #provider: string;
  #value = '';
  #committed = '';
  #lastInput = '';
  #center: LatLng;
  #zoom: number;
  #address: string | null = null;
  #addressResult: GeocodeResult | null = null;
  #dirty = false;
  #interacted = false;
  #written = false;
  #inputs: BoundInputs | undefined;
  #gesture: Gesture | undefined;
  #cancelFrame: (() => void) | undefined;
  /** > 0 while the core moves the view itself: engine echoes of setView/setZoom are not user moves. */
  #quiet = 0;
  #waiting: { resolve(): void; reject(error: unknown): void }[] = [];
  #geocoder: Promise<Geocoder | null>;
  #geocoderId = '';
  #search: SearchHandle | undefined;
  #reverse: AbortController | undefined;
  #lastDetail: LocationDetail | undefined;
  readonly #timers = new Map<string, ReturnType<typeof setTimeout>>();
  #observer: ResizeObserver | undefined;
  #visible = false;
  readonly #states = new Set<PickerStateName>();

  /** Renders and attaches the overlay synchronously; does NOT start loading (call mount()). */
  constructor(host: CoreHost, config: ResolvedConfig) {
    this.host = host;
    this.#config = config;
    this.refs = renderOverlay(host.host.ownerDocument, host.mode, config.messages, String(++uid));
    if (config.value)
      this.#value = this.#committed = this.#lastInput = this.#canonical(config.value);
    this.#center = this.#value ? toLatLng(this.#value) : normalizeLatLng(config.center);
    this.#zoom = config.zoom;
    this.#provider = typeof config.provider == 'string' ? config.provider : config.provider.name;
    this.#geocoder = Promise.resolve(config.geocoder || null);
    this.events = {
      move: (center) => this.#onMove(center),
      moveEnd: (center, zoom) => this.#onMoveEnd(center, zoom),
      interactionStart: () => this.#onStart(),
      interactionEnd: () => this.#onEnd(),
    };
    if (host.mode == 'element' || config.injectStyles)
      adoptStyles(host.styleRoot, host.mode, config.nonce);
    host.renderRoot.append(this.refs.base);
    this.#listen();
    this.#observe();
    this.#newReady();
    this.#setPhase('loading');
    this.#configure();
    this.#snapshot = this.#snap();
  }

  get config(): ResolvedConfig {
    return this.#config;
  }
  get snapshot(): PickerSnapshot {
    return this.#snapshot;
  }
  /** Current handle; undefined until mounted (set synchronously for sync adapters). */
  get handle(): MapHandle | undefined {
    return this.#handle;
  }
  /** Current mount; replaced on remount; pre-handled (never an unhandled rejection by itself). */
  get ready(): Promise<MapHandle> {
    return this.#ready;
  }

  /** Start (or restart) loading and mounting. Class: called in the constructor. Element: in the connect microtask. */
  mount(): void {
    if (this.#dead) return;
    if (!this.#mounted) {
      this.#mounted = true;
      this.#bind();
    } else if (!this.#settle) this.#newReady();
    this.#start();
  }

  /**
   * Apply runtime config changes; REMOUNT_KEYS changes coalesce into one remount per microtask, and `ready` is replaced
   * synchronously here. A remount that changes the resolved provider NAME clears `address`/`addressResult` silently.
   */
  update(patch: Partial<ResolvedConfig>): void {
    const prev = this.#config;
    const next: ResolvedConfig = { ...prev, ...patch };
    const changed = Object.keys(patch).filter(
      (key): key is C.ConfigKey =>
        key in prev && !Object.is(Reflect.get(prev, key), Reflect.get(next, key)),
    );
    if (!changed.length || this.#dead) return;
    this.#config = next;
    const has = (...keys: C.ConfigKey[]): boolean => keys.some((key) => changed.includes(key));
    const advanced = prev.marker == 'advanced' || next.marker == 'advanced';
    const remount = changed.some(
      (key) => REMOUNT_KEYS.includes(key) && (key != 'marker' || advanced),
    );
    const handle = this.#handle;
    if (remount) this.#scheduleRemount();
    else if (handle && has('tileUrl', 'attribution', 'maxZoom', 'gestureHandling')) {
      // Not in the MapHandle contract: adapters may swap layers in place through an optional `update`.
      const update: unknown = Reflect.get(handle, 'update');
      if (typeof update == 'function')
        Reflect.apply(update, handle, [providerOptions(next), next.gestureHandling]);
      else this.#scheduleRemount();
    }
    if (has('precision') && this.#value) {
      this.#value = this.#committed = this.#lastInput = this.#canonical(toLatLng(this.#value));
      this.#inputs?.write(this.#value, undefined, 'none');
      this.#emitSnapshot('write');
    }
    if (has('center') && !this.#value) this.#view(normalizeLatLng(next.center));
    if (has('zoom')) this.setZoom(next.zoom);
    if (has('inputs') && this.#mounted) this.#bind();
    if (has('geocoder') && !remount && this.#ctx && handle && this.#adapter)
      this.#geocoder = this.#resolveGeocoder(this.#adapter, this.#ctx, handle);
    if (has('search', 'geocoder', 'placeholder') && !remount) {
      this.#dropSearch();
      void this.#setupSearch();
    }
    this.#configure();
  }

  /** SILENT write (property set, reset, restore, element reconnect after teardown): no input/change events, no native events on bound inputs; onSnapshot still runs. */
  writeValue(
    value: LatLng | null,
    options: {
      readonly dirty: boolean;
      readonly cause: 'write' | 'reset' | 'restore';
      readonly zoom?: number;
      readonly address?: string | null;
    },
  ): void {
    if (this.#dead) return;
    const next = value ? this.#canonical(value) : '';
    if (next != this.#value || options.address !== undefined) {
      this.#address = options.address ?? null;
      this.#addressResult = null;
    }
    this.#value = this.#committed = this.#lastInput = next;
    this.#written = true;
    this.#dirty = options.dirty;
    if (options.cause == 'reset') this.#interacted = false;
    this.#reverse?.abort();
    this.#clearTimer('reverse');
    const zoom =
      options.zoom ?? (options.cause == 'reset' && !next ? this.#config.zoom : undefined);
    if (next) this.#view(toLatLng(next), zoom);
    else if (options.cause == 'reset') this.#view(normalizeLatLng(this.#config.center), zoom);
    else if (zoom !== undefined) this.setZoom(zoom);
    if (this.#mounted) this.#inputs?.write(next, this.#address, 'none');
    this.#refresh();
    this.#emitSnapshot(options.cause);
  }

  /** Method commit (source 'api'): emits input then change when the rounded value changed. Callers validate input first. */
  setLocation(value: LatLng, options: SetLocationOptions = {}): void {
    if (this.#dead) return;
    if (this.#phase == 'loading') {
      this.#afterReady().then(() => this.setLocation(value, options), noop);
      return;
    }
    this.#commit(value, 'api', options);
  }

  /** Enter/Space/confirm while unset: commits the current centre (source 'user'). */
  commitCenter(): void {
    if (this.#value || this.#interactive() != 'full' || this.#dead) return;
    const at = this.#handle ? normalizeLatLng(this.#handle.getCenter()) : this.#center;
    this.#commit(at, 'user', { move: false });
  }

  /** Zoom around the pin; never changes the value. */
  setZoom(zoom: number): void {
    if (!Number.isFinite(zoom) || this.#dead) return;
    const max = this.#config.maxZoom ?? Infinity;
    this.#zoom = Math.max(0, Math.min(max, zoom));
    this.#quietly((handle) => handle.setZoom(this.#zoom));
    this.#emitSnapshot('zoom');
  }

  getMarkerPosition(): LatLng {
    if (!this.#value) warnOnce('unset-marker-position', UNSET_MARKER_POSITION);
    const handle = this.#handle;
    if (handle) return normalizeLatLng(handle.getCenter());
    return this.#value ? toLatLng(this.#value) : { ...this.#center };
  }

  /**
   * `via` decides the failure channel: 'method' rejects only; 'button' | 'auto' report `error` events.
   * `keepZoom` is the v1/v2 `setCurrentPosition()` alias (not part of §12.1).
   */
  async locate(
    options: LocateOptions = {},
    via: 'method' | 'button' | 'auto' = 'method',
    keepZoom = false,
  ): Promise<LocationDetail> {
    const button = this.refs.locate;
    this.#state('locating', true);
    button.setAttribute('aria-busy', 'true');
    try {
      const signal = options.signal
        ? AbortSignal.any([options.signal, this.#life.signal])
        : this.#life.signal;
      const fix = await geolocate({ ...this.#config.geolocation, ...options, signal });
      await this.#afterReady();
      const zoom = keepZoom ? undefined : Math.max(this.#zoom, 17);
      const at = normalizeLatLng({ lat: fix.coords.latitude, lng: fix.coords.longitude });
      return this.#commit(at, 'geolocation', { zoom, accuracy: fix.coords.accuracy });
    } catch (cause) {
      const error = asError(cause, 'GEOCODER_FAILED');
      if (via != 'method' && error.code != 'ABORTED' && !this.#dead) {
        this.report(error);
        const text = GEOLOCATION_TEXT[error.code];
        if (text) this.showHint(this.#config.messages[text]);
      }
      throw error;
    } finally {
      this.#state('locating', false);
      button.removeAttribute('aria-busy');
    }
  }

  async geocode(query: string, options: GeocodeOptions = {}): Promise<GeocodeResult[]> {
    const at = parseLatLng(query);
    if (at)
      return [
        {
          lat: at.lat,
          lng: at.lng,
          label: formatLatLng(at, { precision: this.#config.precision }),
        },
      ];
    const geocoder = await this.#geocoderAfterReady();
    const search = geocoder?.search?.bind(geocoder);
    if (!search) throw createError('GEOCODER_MISSING');
    return this.#request(options.signal, 'searching', (signal) =>
      search(query, {
        signal,
        near: { ...this.#center },
        limit: options.limit ?? 5,
        lang: this.#config.lang,
      }),
    );
  }

  async lookupAddress(
    at?: LatLngInput,
    options: GeocodeOptions = {},
  ): Promise<GeocodeResult | null> {
    let target = this.#value ? toLatLng(this.#value) : null;
    if (at !== undefined) {
      const read = readLatLngInput(at);
      if (read.error) throw read.error;
      target = read.value;
    }
    if (!target) return null;
    const geocoder = await this.#geocoderAfterReady();
    if (!geocoder?.reverse) throw createError('GEOCODER_MISSING');
    const value = this.#canonical(target);
    const point = target;
    const result = await this.#request(options.signal, null, (signal) =>
      this.#lookup(geocoder, point, signal),
    );
    this.#addressResolved(value, result);
    return result;
  }

  /** Sets :state(interacted) (element: on blur after focus). */
  markInteracted(): void {
    if (this.#interacted || this.#dead) return;
    this.#interacted = true;
    this.#refresh();
    this.#emitSnapshot('write');
  }

  /** Idempotent: abort, handle.destroy(), remove overlay + lp classes, disconnect observers, reject pending with ABORTED. */
  destroy(): void {
    if (this.#dead) return;
    this.#dead = true;
    const aborted = createError('ABORTED');
    this.#life.abort(aborted);
    this.#mount?.abort(aborted);
    this.#reverse?.abort(aborted);
    this.#teardownMap();
    this.#observer?.disconnect();
    for (const timer of this.#timers.values()) clearTimeout(timer);
    this.refs.base.remove();
    this.#settle?.reject(aborted);
    for (const waiting of this.#waiting.splice(0)) waiting.reject(aborted);
  }

  /** Shows a transient hint over the map (MountContext.showHint, the locate button). */
  showHint(text: string): void {
    const hint = this.refs.hint;
    hint.textContent = text;
    hint.hidden = false;
    this.#later('hint', 1500, () => (hint.hidden = true));
  }

  /** Dispatches an `error` event (MountContext.report and every internal failure); logged unless handled. */
  report(error: LocationPickerError): void {
    if (this.#dead) return;
    const handled = !!this.host.beforeDispatch?.('error', error);
    reportError(this.host.eventTarget, error, { handled });
  }

  // ---- mounting ----------------------------------------------------------------------------------------------------

  #newReady(): void {
    this.#settle?.reject(createError('ABORTED'));
    this.#ready = new Promise<MapHandle>((resolve, reject) => {
      this.#settle = {
        resolve: (handle) => {
          this.#settle = undefined;
          resolve(handle);
        },
        reject: (error) => {
          this.#settle = undefined;
          reject(error);
        },
      };
    });
    this.#ready.catch(noop);
  }

  #scheduleRemount(): void {
    if (this.#remountQueued) return;
    this.#remountQueued = true;
    this.#newReady();
    queueMicrotask(() => {
      this.#remountQueued = false;
      if (this.#mounted && !this.#dead) this.#start();
    });
  }

  #start(): void {
    this.#mount?.abort();
    this.#teardownMap();
    const control = (this.#mount = new AbortController());
    const { signal } = control;
    this.#setPhase('loading');
    this.refs.error.hidden = this.refs.fallback.hidden = true;
    this.#refresh();
    const fail = (cause: unknown): void => {
      if (!signal.aborted) this.#failed(asError(cause, 'ENGINE_LOAD_FAILED'));
    };
    const mountWith = (adapter: ProviderAdapter): void => {
      if (signal.aborted) return;
      this.#adapter = adapter;
      if (adapter.name != this.#provider && this.#address !== null) {
        // Google content must not stay next to a non-Google map, and vice versa (ToS §3.2.3(e); §3.2).
        this.#address = null;
        this.#addressResult = null;
        this.#inputs?.write(undefined, null, 'none');
        this.#emitSnapshot('address');
      }
      this.#provider = adapter.name;
      const view = liveView(
        () => (this.#value ? toLatLng(this.#value) : { ...this.#center }),
        () => this.#zoom,
      );
      const ctx = (this.#ctx = createMountContext(this, signal, view));
      const go = (): void => {
        try {
          const handle = adapter.mount(ctx);
          if (isThenable(handle))
            handle.then((h) => this.#onMounted(adapter, ctx, h, signal), fail);
          else this.#onMounted(adapter, ctx, handle, signal);
        } catch (cause) {
          fail(cause);
        }
      };
      try {
        const loading = adapter.load?.(ctx);
        if (isThenable(loading)) loading.then(go, fail);
        else go();
      } catch (cause) {
        fail(cause);
      }
    };
    try {
      const adapter = loadProvider(this.#config.provider);
      if (isThenable(adapter)) adapter.then(mountWith, fail);
      else mountWith(adapter);
    } catch (cause) {
      fail(cause);
    }
  }

  #onMounted(
    adapter: ProviderAdapter,
    ctx: MountContext,
    handle: MapHandle,
    signal: AbortSignal,
  ): void {
    if (signal.aborted) {
      handle.destroy();
      return;
    }
    this.#handle = handle;
    // The camera may have moved on while the engine loaded (writes, zoom): re-apply it without echoes.
    const at = this.#value ? toLatLng(this.#value) : this.#center;
    if (
      this.#canonical(handle.getCenter()) != this.#canonical(at) ||
      handle.getZoom() != this.#zoom
    )
      this.#view(at, this.#zoom);
    this.#a11y(handle.a11y == 'engine');
    this.#geocoder = this.#resolveGeocoder(adapter, ctx, handle);
    this.#setPhase('ready');
    this.#configure();
    this.#emitSnapshot('mount');
    this.#settle?.resolve(handle);
    queueMicrotask(() => {
      if (signal.aborted) return;
      this.#emit('ready', { provider: adapter.name, map: handle.map });
      this.#flush();
      if (this.#config.locate == 'auto' && !this.#value && !this.#autoLocated) {
        this.#autoLocated = true;
        this.locate(undefined, 'auto').catch(noop);
      }
      if (this.#config.reverseGeocode && this.#value && this.#address === null)
        this.#scheduleReverse();
      void this.#setupSearch();
    });
  }

  #failed(error: LocationPickerError): void {
    this.#setPhase('error');
    this.refs.error.hidden = this.refs.fallback.hidden = false;
    this.#refresh();
    this.#emitSnapshot('mount');
    this.#settle?.reject(error);
    queueMicrotask(() => this.report(error));
    this.#flush();
  }

  #teardownMap(): void {
    this.#dropSearch();
    this.#cancelFrame?.();
    this.#cancelFrame = this.#gesture = this.#ctx = undefined;
    const handle = this.#handle;
    this.#handle = undefined;
    handle?.destroy();
    this.refs.map.replaceChildren();
  }

  #resolveGeocoder(
    adapter: ProviderAdapter,
    ctx: MountContext,
    handle: MapHandle,
  ): Promise<Geocoder | null> {
    const custom = this.#config.geocoder;
    if (custom && !geocoderIds.has(custom)) geocoderIds.set(custom, `custom${++uid}`);
    this.#geocoderId = custom ? (geocoderIds.get(custom) ?? '') : adapter.name;
    return resolveGeocoder(adapter, this.#config, ctx, handle).catch((cause: unknown) => {
      if (!ctx.signal.aborted) this.report(asError(cause, 'GEOCODER_FAILED'));
      return null;
    });
  }

  async #geocoderAfterReady(): Promise<Geocoder | null> {
    await this.#ready.catch(noop);
    return this.#geocoder;
  }

  /** Resolves once the current mount settled (ready or failed); rejects ABORTED on destroy. */
  #afterReady(): Promise<void> {
    if (this.#phase != 'loading') return Promise.resolve();
    return new Promise((resolve, reject) => this.#waiting.push({ resolve, reject }));
  }

  #flush(): void {
    for (const waiting of this.#waiting.splice(0)) waiting.resolve();
  }

  // ---- adapter events (MountContext.events) ------------------------------------------------------------------------

  #onStart(): void {
    if (this.#quiet || this.#dead) return;
    this.#clearTimer('announce');
    this.#state('dragging', true);
    if (!this.#gesture) {
      const start = this.#canonical(this.#center);
      this.#gesture = { start, last: start, emitted: false, moved: false };
    }
  }

  #onMove(center: LatLng): void {
    this.#center = normalizeLatLng(center);
    const gesture = this.#gesture;
    if (this.#quiet || !gesture || this.#interactive() != 'full') return;
    gesture.moved = true;
    this.#cancelFrame ??= onFrame(() => {
      this.#cancelFrame = undefined;
      this.#live();
    });
  }

  #onMoveEnd(center: LatLng, zoom: number): void {
    this.#center = normalizeLatLng(center);
    const zoomed = zoom != this.#zoom;
    this.#zoom = zoom;
    const gesture = this.#gesture;
    if (gesture && !this.#quiet) this.#endGesture(gesture, zoomed);
    else if (zoomed) this.#emitSnapshot('zoom');
  }

  #onEnd(): void {
    this.#state('dragging', false);
    // A press without any movement (a click) ends here; moves end at moveEnd (after inertia).
    if (this.#gesture && !this.#gesture.moved) this.#gesture = undefined;
  }

  /** One live frame of a user gesture: `input` (source user) when the rounded value changed. */
  #live(): void {
    const gesture = this.#gesture;
    if (!gesture) return;
    const value = this.#canonical(this.#center);
    if (value == gesture.last) return;
    gesture.last = value;
    gesture.emitted = true;
    this.#liveInput(value);
  }

  #liveInput(value: string): void {
    this.#value = value;
    this.#dirty = true;
    this.#refresh();
    this.#emitSnapshot('live');
    this.#inputs?.write(value, undefined, 'input');
    this.#lastInput = value;
    this.#emit('input', this.#detail('user', {}, null));
  }

  #endGesture(gesture: Gesture, zoomed: boolean): void {
    this.#cancelFrame?.();
    this.#cancelFrame = this.#gesture = undefined;
    this.#state('dragging', false);
    const value = this.#canonical(this.#center);
    const full = this.#interactive() == 'full';
    // Leaving unset needs an actual pan; zoom alone never commits (§3.3).
    if (
      full &&
      value != this.#committed &&
      (this.#committed || value != gesture.start || gesture.emitted)
    )
      this.#commit(this.#center, 'user', { move: false });
    else if (full && gesture.emitted && value != this.#lastInput) this.#liveInput(value);
    else if (zoomed) this.#emitSnapshot('zoom');
  }

  // ---- commits -----------------------------------------------------------------------------------------------------

  #commit(at: LatLng, source: ChangeSource, extra: Extra = {}): LocationDetail {
    const value = this.#canonical(at);
    if (extra.move !== false) this.#view(toLatLng(value), extra.zoom, extra.animate);
    const changed = value != this.#committed;
    if (changed) {
      this.#committed = value;
      this.#interacted = true;
      const known = extra.place
        ? { address: extra.place.address ?? extra.place.label, result: extra.place }
        : this.#cached(value);
      this.#address = known?.address ?? null;
      this.#addressResult = known?.result ?? null;
      this.#reverse?.abort();
      this.#clearTimer('reverse');
    }
    if (changed || value != this.#value) {
      this.#value = value;
      this.#dirty = true;
      this.#refresh();
      this.#emitSnapshot('commit');
    }
    const detail = this.#detail(source, extra, this.#address);
    if (!changed) return detail;
    this.#inputs?.write(value, this.#address, 'commit');
    this.#lastInput = value;
    this.#emit('input', detail);
    this.#emit('change', { ...detail });
    this.#lastDetail = detail;
    this.#announce(detail);
    if (this.#address !== null) queueMicrotask(() => this.#emitAddress(value));
    else this.#scheduleReverse();
    return detail;
  }

  #detail(source: ChangeSource, extra: Extra, address: string | null): LocationDetail {
    return {
      ...toLatLng(this.#value),
      value: this.#value,
      source,
      zoom: this.#zoom,
      address,
      ...(extra.accuracy !== undefined && { accuracy: extra.accuracy }),
      ...(extra.place && { place: extra.place }),
    };
  }

  #pick(result: GeocodeResult): void {
    if (this.#interactive() != 'full') return;
    const at = normalizeLatLng(result);
    const zoom = result.bounds ? this.#fit(result.bounds, at) : Math.max(this.#zoom, 17);
    this.#commit(at, 'search', { zoom, place: result });
  }

  /** The zoom at which `bounds` fits the map while centred on `at` (Web Mercator). */
  #fit(bounds: Bounds, at: LatLng): number {
    const { clientWidth: width, clientHeight: height } = this.refs.map;
    const east = bounds.east < bounds.west ? bounds.east + 360 : bounds.east;
    const lng = at.lng < bounds.west ? at.lng + 360 : at.lng;
    const dx = 2 * Math.max(east - lng, lng - bounds.west);
    const dy =
      2 *
      Math.max(
        mercatorY(bounds.north) - mercatorY(at.lat),
        mercatorY(at.lat) - mercatorY(bounds.south),
      );
    const zoom = Math.floor(Math.log2((Math.min(width / dx, height / dy) * 360) / 256));
    return Math.max(0, Math.min(this.#config.maxZoom ?? 19, Number.isFinite(zoom) ? zoom : 17));
  }

  #typed(): void {
    const fallback = this.refs.fallback;
    const read = readLatLngInput(fallback.value);
    fallback.setAttribute('aria-invalid', String(!read.value));
    if (read.value && this.#interactive() == 'full') this.#commit(read.value, 'user');
  }

  // ---- addresses ---------------------------------------------------------------------------------------------------

  #cacheKey(at: LatLng): string {
    return `${this.#geocoderId}:${at.lat.toFixed(5)},${at.lng.toFixed(5)}`;
  }

  #cached(value: string): { address: string | null; result: GeocodeResult } | undefined {
    const result: unknown = getStore().reverseCache.get(this.#cacheKey(toLatLng(value)));
    return this.#geocoderId && isResult(result) && result
      ? { address: result.address ?? result.label, result }
      : undefined;
  }

  async #lookup(
    geocoder: Geocoder,
    at: LatLng,
    signal: AbortSignal,
  ): Promise<GeocodeResult | null> {
    const cache = getStore().reverseCache;
    const key = this.#cacheKey(at);
    const hit: unknown = cache.get(key);
    if (isResult(hit)) {
      cache.delete(key);
      cache.set(key, hit);
      return hit;
    }
    const result =
      (await geocoder.reverse?.(at, { signal, lang: this.#config.lang, zoom: this.#zoom })) ?? null;
    cache.set(key, result);
    if (cache.size > 200) cache.delete(cache.keys().next().value ?? key);
    return result;
  }

  /** Reverse-geocodes the committed value after a 400 ms debounce; a newer commit aborts the request. */
  #scheduleReverse(): void {
    this.#reverse?.abort();
    if (!this.#config.reverseGeocode || !this.#value) return;
    const value = this.#value;
    this.#later('reverse', 400, () => {
      const control = (this.#reverse = new AbortController());
      const signal = AbortSignal.any([control.signal, this.#life.signal]);
      void this.#geocoder.then(async (geocoder) => {
        if (!geocoder?.reverse || signal.aborted) return;
        try {
          this.#addressResolved(value, await this.#lookup(geocoder, toLatLng(value), signal));
        } catch (cause) {
          if (!signal.aborted) this.report(asError(cause, 'GEOCODER_FAILED'));
        }
      });
    });
  }

  /** A lookup for `value` finished: stale results are dropped, an unchanged address fires nothing. */
  #addressResolved(value: string, result: GeocodeResult | null): void {
    if (value != this.#value || this.#dead) return;
    const address = result ? (result.address ?? result.label) : null;
    this.#addressResult = result;
    if (address === this.#address) return;
    this.#address = address;
    this.#emitSnapshot('address');
    this.#inputs?.write(undefined, address, 'commit');
    this.#emitAddress(value);
  }

  #emitAddress(value: string): void {
    if (value != this.#value || this.#dead) return;
    const address = this.#address;
    this.#emit('addresschange', {
      ...toLatLng(value),
      value,
      address,
      result: this.#addressResult,
    });
    if (this.#lastDetail?.value == value) this.#announce({ ...this.#lastDetail, address });
  }

  // ---- search ------------------------------------------------------------------------------------------------------

  async #setupSearch(): Promise<void> {
    const [handle, adapter, ctx, config] = [this.#handle, this.#adapter, this.#ctx, this.#config];
    if (!config.search || !handle || !adapter || !ctx || this.#search) return;
    const search: SearchContext = {
      ...ctx,
      handle,
      slot: this.refs.search,
      placeholder: config.placeholder,
      label: config.messages.searchLabel,
      select: (result) => this.#pick(result),
    };
    try {
      let ui: SearchHandle;
      if (adapter.createSearch) ui = await adapter.createSearch(search);
      else {
        const geocoder = await this.#geocoder;
        if (!geocoder?.search || ctx.signal.aborted) return;
        const { createCombobox } = await SEARCH_UI.load();
        ui = createCombobox(search, this.#tracked(geocoder), this.#comboboxOptions(geocoder));
      }
      if (ctx.signal.aborted || this.#search) ui.destroy();
      else this.#search = ui;
    } catch (cause) {
      if (!ctx.signal.aborted) this.report(asError(cause, 'GEOCODER_FAILED'));
    }
  }

  #dropSearch(): void {
    this.#search?.destroy();
    this.#search = undefined;
  }

  /** The geocoder with `:state(searching)` around each search request. */
  #tracked(geocoder: Geocoder): Geocoder {
    const search = geocoder.search?.bind(geocoder);
    if (!search) return geocoder;
    const tracked: Geocoder = Object.create(geocoder);
    tracked.search = (query, options) => {
      this.#state('searching', true);
      return search(query, options).finally(() => this.#state('searching', false));
    };
    return tracked;
  }

  /** Debounce, minimum length and limit come from the geocoder when it carries them (Photon options). */
  #comboboxOptions(geocoder: Geocoder): C.ComboboxOptions {
    const own = (key: string, fallback: number): number => {
      const value: unknown = Reflect.get(geocoder, key);
      return typeof value == 'number' && value >= 0 ? value : fallback;
    };
    const url: unknown = Reflect.get(geocoder, 'url');
    const publicPhoton = typeof url == 'string' && url.startsWith('https://photon.komoot.io/');
    return {
      debounce: publicPhoton ? Math.max(300, own('debounce', 300)) : own('debounce', 300),
      minChars: own('minChars', 3),
      limit: own('limit', 5),
      messages: this.#config.messages,
      onError: (error) => this.report(error),
    };
  }

  async #request<T>(
    user: AbortSignal | undefined,
    state: 'searching' | null,
    run: (signal: AbortSignal) => Promise<T>,
  ): Promise<T> {
    const signal = user ? AbortSignal.any([user, this.#life.signal]) : this.#life.signal;
    if (state) this.#state(state, true);
    try {
      if (signal.aborted) throw createError('ABORTED', { cause: signal.reason });
      return await run(signal);
    } catch (cause) {
      throw signal.aborted
        ? createError('ABORTED', { cause: signal.reason })
        : asError(cause, 'GEOCODER_FAILED');
    } finally {
      if (state) this.#state(state, false);
    }
  }

  // ---- view, state and DOM -----------------------------------------------------------------------------------------

  #canonical(at: LatLng): string {
    return formatLatLng(normalizeLatLng(at), { precision: this.#config.precision });
  }

  #interactive(): Interactive {
    return this.#config.disabled ? 'none' : this.#config.readOnly ? 'zoom-only' : 'full';
  }

  #quietly(fn: (handle: MapHandle) => void): void {
    const handle = this.#handle;
    if (!handle) return;
    this.#quiet++;
    try {
      fn(handle);
    } finally {
      this.#quiet--;
    }
  }

  /** Moves the camera without reporting a user interaction (engine echoes are ignored). */
  #view(center: LatLng, zoom?: number, animate = false): void {
    this.#center = center;
    if (zoom !== undefined)
      this.#zoom = Math.max(0, Math.min(this.#config.maxZoom ?? Infinity, zoom));
    this.#quietly((handle) =>
      handle.setView(center, zoom === undefined ? undefined : this.#zoom, {
        animate: animate && !reducedMotion(),
      }),
    );
  }

  #state(name: PickerStateName, on: boolean): void {
    if (this.#states.has(name) == on || (this.#dead && on)) return;
    if (on) this.#states.add(name);
    else this.#states.delete(name);
    // Both modes style through these classes on the library-owned wrapper; the host mirrors them (:state() / class).
    this.refs.base.classList.toggle(`lp-is-${name}`, on);
    this.host.setState(name, on);
  }

  #setPhase(phase: PickerSnapshot['phase']): void {
    this.#phase = phase;
    this.#state('loading', phase == 'loading');
    this.#state('ready', phase == 'ready');
    this.#state('error', phase == 'error');
  }

  /** Derived UI after any state change. */
  #refresh(): void {
    const { refs, config } = this;
    const unset = !this.#value;
    const full = this.#interactive() == 'full';
    this.#state('unset', unset);
    this.#state('interacted', this.#interacted);
    refs.pin.hidden = config.marker == 'none' || !!this.#handle?.drawsMarker;
    refs.confirm.hidden = !(unset && config.centerGiven && full && this.#phase != 'error');
    refs.locate.hidden = config.locate == 'off' || !canGeolocate();
    refs.locate.disabled = refs.fallback.disabled = !full;
    refs.search.hidden = !config.search;
  }

  /** Configuration-driven UI: texts, marker element, interactivity. */
  #configure(): void {
    const { refs, config } = this;
    applyTexts(refs, config.messages);
    this.#label();
    const marker = config.marker;
    const custom = refs.pin.querySelector('.lp-pin-custom');
    if (typeof marker == 'object') {
      if (custom?.firstChild !== marker) {
        const wrapper = refs.pin.ownerDocument.createElement('span');
        wrapper.className = 'lp-pin-custom';
        wrapper.append(marker);
        refs.pin.querySelector('.lp-pin-icon')?.replaceWith(wrapper);
        custom?.replaceWith(wrapper);
      }
    }
    this.#handle?.setInteractive(this.#interactive());
    this.#refresh();
  }

  /** The map region's accessible name mirrors the host's (§3.8). */
  #label(): void {
    const host = this.host.host;
    const labels = (host as Partial<HTMLInputElement>).labels;
    const name =
      host.getAttribute('aria-label') ||
      labels?.[0]?.textContent?.trim() ||
      this.#config.messages.label;
    this.refs.map.setAttribute('aria-label', name);
  }

  /** With an engine that renders its own accessible region (Google), the core only labels the container. */
  #a11y(engine: boolean): void {
    const map = this.refs.map;
    if (engine) {
      map.removeAttribute('role');
      map.removeAttribute('aria-roledescription');
      map.removeAttribute('tabindex');
    } else {
      map.setAttribute('role', 'application');
      map.tabIndex = 0;
      applyTexts(this.refs, this.#config.messages);
    }
  }

  #snap(): PickerSnapshot {
    return Object.freeze({
      value: this.#value,
      latLng: this.#value ? toLatLng(this.#value) : null,
      center: { ...this.#center },
      zoom: this.#zoom,
      address: this.#address,
      addressResult: this.#addressResult,
      provider: this.#provider,
      phase: this.#phase,
      dirty: this.#dirty,
      interacted: this.#interacted,
      map: this.#handle?.map,
    });
  }

  #emitSnapshot(cause: SnapshotCause): void {
    this.#snapshot = this.#snap();
    this.host.onSnapshot?.(this.#snapshot, cause);
  }

  #emit<K extends Exclude<keyof LocationPickerEventMap, 'error'>>(
    type: K,
    detail: LocationPickerEventMap[K]['detail'],
  ): void {
    if (this.#dead) return;
    this.host.beforeDispatch?.(type, detail);
    const bubbles = type != 'ready';
    const composed = type == 'input' || type == 'addresschange';
    this.host.eventTarget.dispatchEvent(new CustomEvent(type, { detail, bubbles, composed }));
  }

  /** Polite announcement 700 ms after a commit (never during a pan) and again when its address resolves. */
  #announce(detail: LocationDetail): void {
    this.#later('announce', 700, () => {
      this.refs.status.textContent = this.#config.messages.announce(detail);
    });
  }

  #later(name: string, ms: number, fn: () => void): void {
    this.#clearTimer(name);
    if (!this.#dead) this.#timers.set(name, setTimeout(fn, ms));
  }

  #clearTimer(name: string): void {
    clearTimeout(this.#timers.get(name));
    this.#timers.delete(name);
  }

  #bind(): void {
    const host = this.host;
    const inputs = (this.#inputs = new BoundInputs(
      host.lookupRoot,
      this.#config.inputs,
      (key) => (host.mode == 'class' ? `${key}Input` : `${key}-input`),
      (input) => host.mode == 'element' && host.host.contains(input),
    ));
    const seed = inputs.read();
    this.seedDefault ??= seed.defaults;
    if (!this.#written && !this.#value) {
      if (seed.value) {
        const config = this.#config;
        this.#value = this.#committed = this.#lastInput = this.#canonical(seed.value);
        this.#center = toLatLng(this.#value);
        // "15 with a value": the resolved zoom is the no-value default unless one was given.
        if (!config.centerGiven && config.zoom == DEFAULTS.zoom) this.#zoom = 15;
        this.#refresh();
        this.#emitSnapshot('mount');
      } else if (seed.error) {
        const error = seed.error;
        queueMicrotask(() => this.report(error));
      }
    }
    // The first write: never before the inputs were read, and never "" at init.
    if (this.#value) inputs.write(this.#value, this.#address ?? undefined, 'none');
  }

  #listen(): void {
    const { refs } = this;
    const signal = this.#life.signal;
    const on = (target: EventTarget, type: string, fn: (event: Event) => void): void =>
      target.addEventListener(type, fn, { signal });
    on(refs.map, 'keydown', (event) => {
      if (
        (keyOf(event) == 'Enter' || keyOf(event) == ' ') &&
        event.target == refs.map &&
        !this.#value
      ) {
        event.preventDefault();
        this.commitCenter();
      }
    });
    on(refs.map, 'focus', () => this.#label());
    on(refs.confirm, 'click', () => this.commitCenter());
    on(refs.locate, 'click', () => void this.locate(undefined, 'button').catch(noop));
    on(refs.fallback, 'keydown', (event) => {
      if (keyOf(event) != 'Enter') return;
      event.preventDefault();
      this.#typed();
    });
    on(refs.fallback, 'change', (event) => {
      event.stopPropagation();
      this.#typed();
    });
    // Inner native events never escape (retargeted to the host they would look like picker events, §3.5).
    on(refs.fallback, 'input', (event) => event.stopPropagation());
    on(refs.search, 'input', (event) => event.stopPropagation());
    on(refs.search, 'change', (event) => event.stopPropagation());
    on(refs.search, 'keydown', (event) => {
      if (keyOf(event) == 'Enter') event.preventDefault();
    });
  }

  /** Initialised while hidden (tabs, dialog, display:none): resize, and re-centre when the size becomes non-zero. */
  #observe(): void {
    const Observer = this.host.host.ownerDocument.defaultView?.ResizeObserver;
    if (!Observer) return;
    this.#observer = new Observer(([entry]) => {
      const { width = 0, height = 0 } = entry?.contentRect ?? {};
      const visible = width > 0 && height > 0;
      const handle = this.#handle;
      if (handle) {
        handle.resize();
        if (visible && !this.#visible)
          this.#view(this.#value ? toLatLng(this.#value) : this.#center, this.#zoom);
      }
      this.#visible = visible;
    });
    // No initial observation fires for an element that is not rendered (display:none): measure now.
    const { width, height } = this.host.host.getBoundingClientRect();
    this.#visible = width > 0 && height > 0;
    this.#observer.observe(this.host.host);
  }
}

PickerCore satisfies typeof C.PickerCore;
