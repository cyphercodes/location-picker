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
  /** Centre and zoom when the gesture began. */
  readonly from: LatLng;
  readonly zoom: number;
  /** Last value emitted live during this gesture. */
  last: string;
  emitted: boolean;
  moved: boolean;
}

let uid = 0;
const noop = (): void => {};
const isThenable = <T>(value: T | PromiseLike<T> | undefined): value is PromiseLike<T> =>
  typeof Reflect.get(Object(value), 'then') == 'function';
/** Web Mercator y, in degrees. */
const mercatorY = (lat: number): number =>
  (Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360)) * 180) / Math.PI;
const isResult = (value: unknown): value is GeocodeResult | null =>
  value === null || (typeof value == 'object' && 'lat' in value);
const addressOf = (result: GeocodeResult): string => result.address ?? result.label;
/** The rounded coordinate a canonical value denotes (§12.10: parseLatLng(value) deep-equals {lat, lng}). */
const toLatLng = (value: string): LatLng => {
  const { lat = 0, lng = 0 } = parseLatLng(value) ?? {};
  return { lat, lng };
};
const asError = (
  cause: unknown,
  code: 'GEOCODER_FAILED' | 'ENGINE_LOAD_FAILED' | 'GEOLOCATION_UNAVAILABLE',
): LocationPickerError => (isLocationPickerError(cause) ? cause : createError(code, { cause }));
const keyOf = (event: Event): unknown => Reflect.get(event, 'key');
const stop = (event: Event): void => event.stopPropagation();
const isVisible = ({ width = 0, height = 0 } = {}): boolean => width > 0 && height > 0;
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
/** A provider spec's name: the string itself or the adapter's `name`. */
const nameOf = (provider: ResolvedConfig['provider']): string =>
  typeof provider == 'string' ? provider : provider.name;

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
    this.#value =
      this.#committed =
      this.#lastInput =
        config.value ? this.#canonical(config.value) : '';
    this.#center = this.#value ? toLatLng(this.#value) : normalizeLatLng(config.center);
    this.#zoom = config.zoom;
    this.#provider = nameOf(config.provider);
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
    // Before the first mount() the new config simply applies at mount.
    if (remount && this.#mounted) this.#scheduleRemount();
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
    if (!remount) {
      const [adapter, ctx] = [this.#adapter, this.#ctx];
      if (has('geocoder') && ctx && handle && adapter)
        this.#geocoder = this.#resolveGeocoder(adapter, ctx, handle);
      if (has('search', 'geocoder', 'placeholder')) {
        this.#dropSearch();
        void this.#setupSearch();
      }
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
    const { cause, address } = options;
    const reset = cause == 'reset';
    const next = value ? this.#canonical(value) : '';
    if (next != this.#value || address !== undefined) this.#setAddress(address ?? null, null);
    this.#value = this.#committed = this.#lastInput = next;
    this.#written = true;
    this.#dirty = options.dirty;
    if (reset) this.#interacted = false;
    this.#cancelReverse();
    const zoom = options.zoom ?? (reset && !next ? this.#config.zoom : undefined);
    if (next) this.#view(toLatLng(next), zoom);
    else if (reset) this.#view(normalizeLatLng(this.#config.center), zoom);
    else if (zoom !== undefined) this.setZoom(zoom);
    if (this.#mounted) this.#inputs?.write(next, this.#address, 'none');
    this.#refresh();
    this.#emitSnapshot(cause);
  }

  /** Method commit (source 'api'): emits input then change when the rounded value changed. Callers validate input first. */
  setLocation(value: LatLng, options: SetLocationOptions = {}): void {
    if (this.#dead) return;
    if (this.#phase == 'loading')
      this.#afterReady().then(() => this.setLocation(value, options), noop);
    else this.#commit(value, 'api', options);
  }

  /** Enter/Space/confirm while unset: commits the current centre (source 'user'). */
  commitCenter(): void {
    // The centre as the adapter last reported it: engines may re-derive theirs from whole pixels (Leaflet after resize).
    if (!this.#value && this.#interactive() == 'full' && !this.#dead)
      this.#commit(this.#center, 'user', { move: false });
  }

  /** Zoom around the pin; never changes the value. */
  setZoom(zoom: number): void {
    if (!Number.isFinite(zoom) || this.#dead) return;
    this.#zoom = this.#clampZoom(zoom);
    this.#quietly((handle) => handle.setZoom(this.#zoom));
    this.#emitSnapshot('zoom');
  }

  getMarkerPosition(): LatLng {
    if (!this.#value) warnOnce('unset-marker-position', UNSET_MARKER_POSITION);
    const handle = this.#handle;
    return handle ? normalizeLatLng(handle.getCenter()) : this.#at();
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
      const signal = this.#signal(options.signal);
      const { coords } = await geolocate({ ...this.#config.geolocation, ...options, signal });
      await this.#afterReady();
      return this.#commit(
        normalizeLatLng({ lat: coords.latitude, lng: coords.longitude }),
        'geolocation',
        {
          zoom: keepZoom ? undefined : Math.max(this.#zoom, 17),
          accuracy: coords.accuracy,
        },
      );
    } catch (cause) {
      const error = asError(cause, 'GEOLOCATION_UNAVAILABLE');
      if (via != 'method' && error.code != 'ABORTED' && !this.#dead) {
        this.report(error);
        // GEOLOCATION_DENIED -> messages.geolocationDenied, and so on.
        const key = error.code.toLowerCase().replace(/_(.)/g, (_, c: string) => c.toUpperCase());
        const text: unknown = Reflect.get(this.#config.messages, key);
        if (typeof text == 'string') this.showHint(text);
      }
      throw error;
    } finally {
      this.#state('locating', false);
      button.removeAttribute('aria-busy');
    }
  }

  async geocode(query: string, options: GeocodeOptions = {}): Promise<GeocodeResult[]> {
    const at = parseLatLng(query);
    if (at) {
      const { lat, lng } = at;
      return [{ lat, lng, label: formatLatLng(at, { precision: this.#config.precision }) }];
    }
    const geocoder = await this.#geocoderAfterReady();
    const search = geocoder?.search?.bind(geocoder);
    if (!search) throw createError('GEOCODER_MISSING');
    return this.#request(options.signal, true, (signal) =>
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
    const point = target;
    const geocoder = await this.#geocoderAfterReady();
    if (!geocoder?.reverse) throw createError('GEOCODER_MISSING');
    const value = this.#canonical(point);
    const result = await this.#request(options.signal, false, (signal) =>
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
    for (const control of [this.#life, this.#mount, this.#reverse]) control?.abort(aborted);
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
    if (!this.#dead)
      reportError(this.host.eventTarget, error, {
        handled: !!this.host.beforeDispatch?.('error', error),
      });
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

  /** Loads the provider, then the engine, then mounts: synchronously as far as each step allows (adapter objects). */
  #start(): void {
    this.#mount?.abort();
    this.#teardownMap();
    const { signal } = (this.#mount = new AbortController());
    this.#phase = 'loading';
    this.refs.error.hidden = this.refs.fallback.hidden = true;
    this.#refresh();
    this.#rename(nameOf(this.#config.provider));
    const fail = (cause: unknown): void => {
      if (!signal.aborted) this.#failed(asError(cause, 'ENGINE_LOAD_FAILED'));
    };
    // Runs `run`, then `next` with its result: synchronously unless it returns a promise.
    const step = <T>(run: () => T | PromiseLike<T>, next: (value: T) => void): void => {
      try {
        const value = run();
        if (isThenable(value)) value.then((v) => step(() => v, next), fail);
        else next(value);
      } catch (cause) {
        fail(cause);
      }
    };
    step(
      () => loadProvider(this.#config.provider),
      (adapter) => {
        if (signal.aborted) return;
        this.#adapter = adapter;
        this.#rename(adapter.name);
        const view = liveView(
          () => this.#at(),
          () => this.#zoom,
        );
        const ctx = (this.#ctx = createMountContext(this, signal, view));
        step(
          () => adapter.load?.(ctx),
          () =>
            step(
              () => adapter.mount(ctx),
              (handle) => this.#onMounted(adapter, ctx, handle),
            ),
        );
      },
    );
  }

  /** A new provider NAME drops the address: Google content must not stay next to a non-Google map, and vice versa (ToS §3.2.3(e); §3.2). */
  #rename(name: string): void {
    if (name == this.#provider) return;
    this.#provider = name;
    if (this.#address === null && !this.#addressResult) return;
    this.#setAddress(null, null);
    this.#inputs?.write(undefined, null, 'none');
    this.#emitSnapshot('address');
  }

  #onMounted(adapter: ProviderAdapter, ctx: MountContext, handle: MapHandle): void {
    const { signal } = ctx;
    if (signal.aborted) return handle.destroy();
    this.#handle = handle;
    // The camera may have moved on while the engine loaded (writes, zoom): re-apply it without echoes.
    const at = this.#at();
    if (
      this.#canonical(handle.getCenter()) != this.#canonical(at) ||
      handle.getZoom() != this.#zoom
    )
      this.#view(at, this.#zoom);
    // With an engine that renders its own accessible region (Google), the core only labels the container.
    const map = this.refs.map;
    if (handle.a11y == 'engine')
      for (const name of ['role', 'aria-roledescription', 'tabindex']) map.removeAttribute(name);
    else {
      map.setAttribute('role', 'application');
      map.tabIndex = 0;
    }
    this.#geocoder = this.#resolveGeocoder(adapter, ctx, handle);
    this.#phase = 'ready';
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
    this.#phase = 'error';
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
    return this.#phase == 'loading'
      ? new Promise((resolve, reject) => this.#waiting.push({ resolve, reject }))
      : Promise.resolve();
  }

  #flush(): void {
    for (const waiting of this.#waiting.splice(0)) waiting.resolve();
  }

  // ---- adapter events (MountContext.events) ------------------------------------------------------------------------

  #onStart(): void {
    if (this.#quiet || this.#dead) return;
    this.#clearTimer('announce');
    this.#state('dragging', true);
    if (this.#gesture) return;
    const start = this.#canonical(this.#center);
    const from = { ...this.#center };
    this.#gesture = { start, from, zoom: this.#zoom, last: start, emitted: false, moved: false };
  }

  #onMove(center: LatLng): void {
    this.#center = normalizeLatLng(center);
    const gesture = this.#gesture;
    if (this.#quiet || !gesture || this.#interactive() != 'full') return;
    gesture.moved = true;
    this.#cancelFrame ??= onFrame(() => {
      // One live frame of a user gesture: `input` (source user) when the rounded value changed.
      this.#cancelFrame = undefined;
      const value = this.#canonical(this.#center);
      if (value == gesture.last || (!gesture.emitted && this.#still(gesture))) return;
      gesture.last = value;
      gesture.emitted = true;
      this.#liveInput(value);
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
    if (!this.#gesture?.moved) this.#gesture = undefined;
  }

  #liveInput(value: string): void {
    this.#value = value;
    this.#dirty = true;
    this.#refresh();
    this.#emitSnapshot('live');
    this.#inputs?.write(value, undefined, 'input');
    this.#lastInput = value;
    // The address of a value the pan has not settled on yet is unknown.
    this.#emit('input', this.#detail('user', {}, null));
  }

  #endGesture(gesture: Gesture, zoomed: boolean): void {
    this.#cancelFrame?.();
    this.#cancelFrame = this.#gesture = undefined;
    this.#state('dragging', false);
    const value = this.#canonical(this.#center);
    const full = this.#interactive() == 'full';
    if (!gesture.emitted && this.#still(gesture)) {
      // Not a pan: zoom never commits (§3.3). Put the camera back on the value where the engine allows it.
      if (this.#value && value != this.#value) this.#view(toLatLng(this.#value));
    } else if (
      // Leaving unset needs an actual pan; zoom alone never commits (§3.3).
      full &&
      value != this.#committed &&
      (this.#committed || value != gesture.start || gesture.emitted)
    ) {
      this.#commit(this.#center, 'user', { move: false });
      return;
    } else if (full && gesture.emitted && value != this.#lastInput) {
      this.#liveInput(value);
      return;
    }
    if (zoomed) this.#emitSnapshot('zoom');
  }

  /**
   * Less than one screen pixel (256 px tiles, at the smaller of the two zooms) from where the gesture began: engines
   * such as Leaflet snap the centre to whole pixels while zooming, and that drift is not a pan.
   */
  #still(gesture: Gesture): boolean {
    const scale = (256 * 2 ** Math.min(gesture.zoom, this.#zoom)) / 360;
    const { lat, lng } = this.#center;
    const dLng = Math.abs(lng - gesture.from.lng) % 360;
    return (
      Math.min(dLng, 360 - dLng) * scale < 1 &&
      Math.abs(mercatorY(lat) - mercatorY(gesture.from.lat)) * scale < 1
    );
  }

  // ---- commits -----------------------------------------------------------------------------------------------------

  #commit(at: LatLng, source: ChangeSource, extra: Extra = {}): LocationDetail {
    const value = this.#canonical(at);
    const zoom = this.#zoom;
    if (extra.move !== false) this.#view(toLatLng(value), extra.zoom, extra.animate);
    const changed = value != this.#committed;
    if (changed) {
      this.#committed = value;
      this.#interacted = true;
      const known = extra.place ?? this.#cached(value);
      this.#setAddress(known ? addressOf(known) : null, known ?? null);
      this.#cancelReverse();
    }
    if (changed || value != this.#value) {
      this.#value = value;
      this.#dirty = true;
      this.#refresh();
      this.#emitSnapshot('commit');
    } else if (this.#zoom != zoom) this.#emitSnapshot('zoom');
    const detail = this.#detail(source, extra);
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

  #detail(
    source: ChangeSource,
    { accuracy, place }: Extra,
    address = this.#address,
  ): LocationDetail {
    return {
      ...toLatLng(this.#value),
      value: this.#value,
      source,
      zoom: this.#zoom,
      address,
      ...(accuracy !== undefined && { accuracy }),
      ...(place && { place }),
    };
  }

  #pick(result: GeocodeResult): void {
    if (this.#interactive() != 'full') return;
    const at = normalizeLatLng(result);
    const zoom = result.bounds ? this.#fit(result.bounds, at) : Math.max(this.#zoom, 17);
    this.#commit(at, 'search', { zoom, place: result });
  }

  /** The zoom at which `bounds` fits the map while centred on `at` (Web Mercator). */
  #fit({ north, south, east, west }: Bounds, at: LatLng): number {
    const { clientWidth: width, clientHeight: height } = this.refs.map;
    const lng = at.lng < west ? at.lng + 360 : at.lng;
    const dx = 2 * Math.max((east < west ? east + 360 : east) - lng, lng - west);
    const y = mercatorY(at.lat);
    const dy = 2 * Math.max(mercatorY(north) - y, y - mercatorY(south));
    const zoom = Math.floor(Math.log2((Math.min(width / dx, height / dy) * 360) / 256));
    return Math.max(0, Math.min(this.#config.maxZoom ?? 19, Number.isFinite(zoom) ? zoom : 17));
  }

  #typed(): void {
    const fallback = this.refs.fallback;
    const { value } = readLatLngInput(fallback.value);
    fallback.setAttribute('aria-invalid', String(!value));
    if (value && this.#interactive() == 'full') this.#commit(value, 'user');
  }

  // ---- addresses ---------------------------------------------------------------------------------------------------

  #setAddress(address: string | null, result: GeocodeResult | null): void {
    this.#address = address;
    this.#addressResult = result;
  }

  #cancelReverse(): void {
    this.#reverse?.abort();
    this.#clearTimer('reverse');
  }

  #cacheKey(at: LatLng): string {
    return `${this.#geocoderId}:${at.lat.toFixed(5)},${at.lng.toFixed(5)}`;
  }

  /** The cached reverse result for `value`, if any (only once a geocoder is known). */
  #cached(value: string): GeocodeResult | undefined {
    const result: unknown = getStore().reverseCache.get(this.#cacheKey(toLatLng(value)));
    return (this.#geocoderId && isResult(result) && result) || undefined;
  }

  async #lookup(
    geocoder: Geocoder,
    at: LatLng,
    signal: AbortSignal,
  ): Promise<GeocodeResult | null> {
    const cache = getStore().reverseCache;
    const key = this.#cacheKey(at);
    let result: unknown = cache.get(key);
    // An LRU: a hit moves to the end.
    cache.delete(key);
    if (!isResult(result))
      result =
        (await geocoder.reverse?.(at, { signal, lang: this.#config.lang, zoom: this.#zoom })) ??
        null;
    cache.set(key, result);
    if (cache.size > 200) cache.delete(cache.keys().next().value ?? key);
    return isResult(result) ? result : null;
  }

  /** Reverse-geocodes the committed value after a 400 ms debounce; a newer commit aborts the request. */
  #scheduleReverse(): void {
    this.#reverse?.abort();
    const value = this.#value;
    if (!this.#config.reverseGeocode || !value) return;
    this.#later('reverse', 400, () => {
      const signal = this.#signal((this.#reverse = new AbortController()).signal);
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
    const address = result && addressOf(result);
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
    const search = {
      ...ctx,
      handle,
      slot: this.refs.search,
      placeholder: config.placeholder,
      label: config.messages.searchLabel,
      select: (result: GeocodeResult) => this.#pick(result),
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
    const debounce = own('debounce', 300);
    return {
      // The public photon.komoot.io endpoint needs at least 300 ms between requests (§5.2).
      debounce: String(url).startsWith('https://photon.komoot.io/')
        ? Math.max(300, debounce)
        : debounce,
      minChars: own('minChars', 3),
      limit: own('limit', 5),
      messages: this.#config.messages,
      onError: (error) => this.report(error),
    };
  }

  /** Runs a geocoder request with the picker's lifetime; `searching` toggles :state(searching) around it. */
  async #request<T>(
    user: AbortSignal | undefined,
    searching: boolean,
    run: (signal: AbortSignal) => Promise<T>,
  ): Promise<T> {
    const signal = this.#signal(user);
    if (searching) this.#state('searching', true);
    try {
      if (signal.aborted) throw signal.reason;
      return await run(signal);
    } catch (cause) {
      throw signal.aborted
        ? createError('ABORTED', { cause: signal.reason })
        : asError(cause, 'GEOCODER_FAILED');
    } finally {
      if (searching) this.#state('searching', false);
    }
  }

  // ---- view, state and DOM -----------------------------------------------------------------------------------------

  #canonical(at: LatLng): string {
    return formatLatLng(normalizeLatLng(at), { precision: this.#config.precision });
  }

  /** The value as a coordinate, else (unset) the view centre. */
  #at(): LatLng {
    return this.#value ? toLatLng(this.#value) : { ...this.#center };
  }

  /** `signal` combined with the picker's lifetime (destroy aborts). */
  #signal(signal?: AbortSignal): AbortSignal {
    return signal ? AbortSignal.any([signal, this.#life.signal]) : this.#life.signal;
  }

  #interactive(): MountContext['interactive'] {
    return this.#config.disabled ? 'none' : this.#config.readOnly ? 'zoom-only' : 'full';
  }

  #clampZoom(zoom: number): number {
    return Math.max(0, Math.min(this.#config.maxZoom ?? Infinity, zoom));
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
    if (zoom !== undefined) this.#zoom = this.#clampZoom(zoom);
    this.#quietly((handle) =>
      handle.setView(center, zoom === undefined ? undefined : this.#zoom, {
        animate: animate && !globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches,
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

  /** Derived UI after any state change. */
  #refresh(): void {
    const { refs, config } = this;
    const unset = !this.#value;
    const full = this.#interactive() == 'full';
    for (const phase of ['loading', 'ready', 'error'] as const)
      this.#state(phase, phase == this.#phase);
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
    if (typeof marker == 'object' && custom?.firstChild !== marker) {
      const wrapper = refs.pin.ownerDocument.createElement('span');
      wrapper.className = 'lp-pin-custom';
      wrapper.append(marker);
      (custom ?? refs.pin.querySelector('.lp-pin-icon'))?.replaceWith(wrapper);
    }
    this.#handle?.setInteractive(this.#interactive());
    this.#refresh();
  }

  /** The map region's accessible name mirrors the host's (§3.8). */
  #label(): void {
    const host = this.host.host;
    const labels = (host as Partial<HTMLInputElement>).labels;
    this.refs.map.setAttribute(
      'aria-label',
      host.getAttribute('aria-label') ||
        labels?.[0]?.textContent?.trim() ||
        this.#config.messages.label,
    );
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
    this.host.eventTarget.dispatchEvent(
      new CustomEvent(type, {
        detail,
        bubbles: type != 'ready',
        composed: type == 'input' || type == 'addresschange',
      }),
    );
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
    const element = host.mode == 'element';
    const inputs = (this.#inputs = new BoundInputs(
      host.lookupRoot,
      this.#config.inputs,
      (key) => (element ? `${key}-input` : `${key}Input`),
      (input) => element && host.host.contains(input),
    ));
    const seed = inputs.read();
    this.seedDefault ??= seed.defaults;
    if (!this.#written && !this.#value) {
      const { value, error } = seed;
      if (value) {
        this.#value = this.#committed = this.#lastInput = this.#canonical(value);
        this.#center = toLatLng(this.#value);
        // "15 with a value": the resolved zoom is the no-value default unless one was given.
        if (!this.#config.centerGiven && this.#config.zoom == DEFAULTS.zoom) this.#zoom = 15;
        this.#refresh();
        this.#emitSnapshot('mount');
      } else if (error) queueMicrotask(() => this.report(error));
    }
    // The first write: never before the inputs were read, and never "" at init.
    if (this.#value) inputs.write(this.#value, this.#address ?? undefined, 'none');
  }

  #listen(): void {
    const { refs } = this;
    const on = (target: EventTarget, type: string, fn: (event: Event) => void): void =>
      target.addEventListener(type, fn, { signal: this.#life.signal });
    on(refs.map, 'keydown', (event) => {
      const key = keyOf(event);
      if ((key == 'Enter' || key == ' ') && event.target == refs.map && !this.#value) {
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
      stop(event);
      this.#typed();
    });
    // Inner native events never escape (retargeted to the host they would look like picker events, §3.5).
    on(refs.fallback, 'input', stop);
    on(refs.search, 'input', stop);
    on(refs.search, 'change', stop);
    on(refs.search, 'keydown', (event) => {
      if (keyOf(event) == 'Enter') event.preventDefault();
    });
  }

  /** Initialised while hidden (tabs, dialog, display:none): resize, and re-centre when the size becomes non-zero. */
  #observe(): void {
    const target = this.host.host;
    const Observer = target.ownerDocument.defaultView?.ResizeObserver;
    if (!Observer) return;
    this.#observer = new Observer(([entry]) => {
      const now = isVisible(entry?.contentRect);
      const handle = this.#handle;
      if (handle) {
        handle.resize();
        if (now && !this.#visible) this.#view(this.#at(), this.#zoom);
      }
      this.#visible = now;
    });
    // No initial observation fires for an element that is not rendered (display:none): measure now.
    this.#visible = isVisible(target.getBoundingClientRect());
    this.#observer.observe(target);
  }
}

PickerCore satisfies typeof C.PickerCore;
