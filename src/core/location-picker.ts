// The imperative class (CONTRACT §3.1 light DOM, §4.6 lifecycle, §6 back-compat): a CoreHost in 'class' mode.
import type {
  GeocodeOptions,
  GeocodeResult,
  LocateMode,
  LocateOptions,
  LocationDetail,
  LocationPickerEventMap,
  LocationPickerOptions,
  SetLocationOptions,
} from '../core.js';
import type { LatLng, LatLngInput } from '../utils.js';
import { readLatLngInput, resolveConfig } from './config.js';
import { ZERO_HEIGHT, emitDiagnostics, warnOnce } from './diagnostics.js';
import { createError } from './errors.js';
import { PickerCore } from './picker-core.js';
import { version } from './version.js';

/** Re-constructing on the same target destroys the previous instance (§4.6). */
const instances = new WeakMap<HTMLElement, { destroy(): void }>();

/** The `on*` option called right before each event (R3). */
const CALLBACKS = {
  input: 'onInput',
  change: 'onChange',
  addresschange: 'onAddressChange',
  ready: 'onReady',
  error: 'onError',
} as const;

/** Structural, so elements of another realm (an iframe's document) qualify too. */
const isElement = (node: unknown): node is HTMLElement =>
  Reflect.get(Object(node), 'nodeType') === 1 && 'style' in Object(node);
const isRoot = (node: Node): node is Document | ShadowRoot =>
  node.nodeType == 9 || node.nodeType == 11;

function resolveTarget(target: string | HTMLElement): HTMLElement {
  let found: unknown = target;
  if (typeof target == 'string') {
    try {
      found = document.getElementById(target) ?? document.querySelector(target);
    } catch {
      found = null; // no document (SSR), or neither an id nor a selector
    }
  }
  if (!isElement(found)) {
    throw createError('TARGET_NOT_FOUND', {
      vars: { target: typeof target == 'string' ? JSON.stringify(target) : 'the given target' },
    });
  }
  if (
    found.localName == 'location-picker' ||
    typeof Reflect.get(found, 'setLocation') == 'function'
  ) {
    throw createError('INVALID_OPTION', {
      message: 'the target is already a <location-picker>',
      fix: 'Use its properties and events directly.',
    });
  }
  return found;
}

/** Runs a user callback; an exception is rethrown asynchronously so the picker's own state stays consistent. */
function call(callback: unknown, detail: unknown): void {
  try {
    if (typeof callback == 'function') Reflect.apply(callback, undefined, [detail]);
  } catch (error) {
    queueMicrotask(() => {
      throw error;
    });
  }
}

// The typed event-listener overloads of api.d.ts, merged in without runtime code (EventTarget implements them).
// oxlint-disable-next-line typescript/no-unsafe-declaration-merging
export interface LocationPicker<TMap = unknown> {
  addEventListener<K extends keyof LocationPickerEventMap<TMap>>(
    type: K,
    listener: (this: this, ev: LocationPickerEventMap<TMap>[K]) => unknown,
    options?: boolean | AddEventListenerOptions,
  ): void;
  addEventListener(
    type: string,
    listener: EventListenerOrEventListenerObject | null,
    options?: boolean | AddEventListenerOptions,
  ): void;
  removeEventListener<K extends keyof LocationPickerEventMap<TMap>>(
    type: K,
    listener: (this: this, ev: LocationPickerEventMap<TMap>[K]) => unknown,
    options?: boolean | EventListenerOptions,
  ): void;
  removeEventListener(
    type: string,
    listener: EventListenerOrEventListenerObject | null,
    options?: boolean | EventListenerOptions,
  ): void;
}

/**
 * Imperative picker. Renders into a light-DOM container YOU own: `target` keeps its children; the picker appends one
 * `div.lp-base` wrapper holding `.lp-map`, `.lp-pin.centerMarker` (v1 alias), `.lp-controls`, `.lp-status` (plus
 * `.lp-search` when `search` is on). State classes (`lp-is-unset`, `lp-is-dragging`, …) live on `.lp-base`, never on
 * `target`, so a framework that rewrites `target.className` breaks nothing. The picker also adds the class
 * `location-picker` to `target` (only for v1 CSS overrides such as `.location-picker .centerMarker{display:none}`)
 * and, when `target` computes `position: static`, an inline `position: relative`. Re-constructing on the same target
 * destroys the previous instance.
 * Not a form control: use `<location-picker>` for forms, or bind inputs with `latInput`/`lngInput`.
 * @example
 * const picker = new LocationPicker('#map', { search: true, onChange: (d) => console.log(d.value) });
 * await picker.ready;
 * const chosen = picker.valueAsLatLng; // null until the user chose a point
 */
// oxlint-disable-next-line typescript/no-unsafe-declaration-merging
export class LocationPicker<TMap = unknown> extends EventTarget {
  /** @example LocationPicker.version // "3.0.0" */
  static readonly version: string = version;
  /** The target element (v1/v2 `.element`). */
  readonly element: HTMLElement;
  readonly #core: PickerCore;
  readonly #options: LocationPickerOptions<TMap>;
  /** Undoes what the constructor added: the alias class and inline styles on `target`, the abort listener. */
  readonly #undo: (() => void)[] = [];
  #ready: [Promise<unknown>, Promise<this>] | undefined;

  /**
   * @param target an element, an id (`"map"`, tried first) or a CSS selector (`"#map"`). Throws `TARGET_NOT_FOUND`,
   *   or `INVALID_OPTION` if `target` is a `<location-picker>` (use the element directly).
   * @param options see {@link LocationPickerOptions}
   */
  constructor(target: string | HTMLElement, options?: LocationPickerOptions<TMap>);
  /**
   * @deprecated v1/v2 signature. The 3rd argument is merged into `options.mapOptions` and selects
   * `provider: 'google'` unless `options.provider` is set (logs one deprecation warning).
   */
  constructor(
    target: string | HTMLElement,
    options: LocationPickerOptions<TMap> | undefined,
    mapOptions: Record<string, unknown>,
  );
  constructor(
    target: string | HTMLElement,
    options?: LocationPickerOptions<TMap>,
    mapOptions?: Record<string, unknown>,
  ) {
    super();
    const element = (this.element = resolveTarget(target));
    instances.get(element)?.destroy();
    instances.set(element, this);
    const o = (this.#options = options ?? {});
    // TMap only types the callbacks and the adapter's map; the resolver never calls them.
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion
    const result = resolveConfig(o as LocationPickerOptions, {
      mode: 'class',
      host: element,
      ...(mapOptions && typeof mapOptions == 'object' && { thirdArg: mapOptions }),
    });
    emitDiagnostics(result.diagnostics);

    const { classList, style } = element;
    const undo = this.#undo;
    if (!classList.contains('location-picker')) {
      classList.add('location-picker');
      undo.push(() => classList.remove('location-picker'));
    }
    const position = element.ownerDocument.defaultView?.getComputedStyle(element).position;
    if (!style.position && (position ?? 'static') == 'static') {
      style.position = 'relative';
      undo.push(() => style.position == 'relative' && style.removeProperty('position'));
    }
    const root = element.getRootNode();
    const styleRoot = isRoot(root) ? root : element.ownerDocument;
    const core = (this.#core = new PickerCore(
      {
        mode: 'class',
        host: element,
        renderRoot: element,
        styleRoot,
        lookupRoot: styleRoot,
        eventTarget: this,
        // PickerCore itself mirrors every state as an `lp-is-*` class on its `.lp-base`.
        setState() {},
        beforeDispatch: (type, detail) => this.#beforeDispatch(type, detail),
      },
      result.config,
    ));
    // A target that measures 0 px tall while rendered would show nothing (§3.7).
    if (element.getClientRects().length && !element.getBoundingClientRect().height) {
      style.setProperty('min-block-size', '320px');
      undo.push(() => style.removeProperty('min-block-size'));
      warnOnce('zero-height', ZERO_HEIGHT);
    }
    for (const error of result.errors) queueMicrotask(() => core.report(error));
    core.mount();
    const signal = o.signal;
    if (signal) {
      const abort = (): void => this.destroy();
      if (signal.aborted) queueMicrotask(abort);
      signal.addEventListener('abort', abort, { once: true });
      undo.push(() => signal.removeEventListener('abort', abort));
    }
  }

  /** The map container div the picker created inside `element`. */
  get container(): HTMLElement {
    return this.#core.refs.map;
  }
  /** Resolved provider name. @example "leaflet" */
  get provider(): string {
    return this.#core.snapshot.provider;
  }
  /**
   * Engine map (L.Map, google.maps.Map, maplibregl.Map). `undefined` until `ready`, except when an adapter OBJECT is
   * passed and its engine is already present: then it is set synchronously in the constructor.
   */
  get map(): TMap | undefined {
    // The adapter is typed by the same TMap (an adapter object) or unknown (a provider name).
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion
    return this.#core.handle?.map as TMap | undefined;
  }
  /**
   * Resolves when the map is mounted and interactive; rejects with LocationPickerError. The promise itself never
   * triggers `unhandledrejection` when ignored. A promise you DERIVE from it (`await`, or `.then()` without a
   * rejection handler) rejects like any other promise: add `.catch()`, or use the `ready`/`error` events.
   * @example picker.ready.then((p) => p.map).catch((e) => console.warn(e.code));
   */
  get ready(): Promise<this> {
    const current = this.#core.ready;
    if (this.#ready?.[0] !== current) {
      const derived = current.then(() => this);
      derived.catch(() => {});
      this.#ready = [current, derived];
    }
    return this.#ready[1];
  }
  /** Committed canonical `"lat,lng"`, or `""` while unset. Setting is SILENT (no events) and accepts any LatLngInput or `""`/null to clear. A string that does not parse warns (INVALID_VALUE) and clears; an object is normalised (latitude clamped with a warning). @default "" */
  get value(): string {
    return this.#core.snapshot.value;
  }
  set value(value: LatLngInput | null) {
    this.#write(value);
  }
  /** Committed value as an object, or null while unset. Setting is silent. @default null */
  get valueAsLatLng(): LatLng | null {
    const latLng = this.#core.snapshot.latLng;
    return latLng && { ...latLng };
  }
  set valueAsLatLng(value: LatLngInput | null) {
    this.#write(value);
  }
  /** Address of the current value (search pick or reverse geocode), or null. */
  get address(): string | null {
    return this.#core.snapshot.address;
  }
  /** Live zoom. Setting zooms around the pin and never changes the value. */
  get zoom(): number {
    return this.#core.snapshot.zoom;
  }
  set zoom(zoom: number) {
    this.#core.setZoom(zoom);
  }
  /** @default false */
  get disabled(): boolean {
    return this.#core.config.disabled;
  }
  set disabled(disabled: boolean) {
    this.#core.update({ disabled });
  }
  /** @default false */
  get readOnly(): boolean {
    return this.#core.config.readOnly;
  }
  set readOnly(readOnly: boolean) {
    this.#core.update({ readOnly });
  }
  /** Locate-control mode (option `locate`). @default 'off' */
  get locateMode(): LocateMode {
    return this.#core.config.locate;
  }
  set locateMode(mode: LocateMode) {
    if (/^(off|button|auto)$/.test(mode)) this.#core.update({ locate: mode });
  }

  /**
   * v1/v2: the current map centre (the point under the pin), normalised, unrounded. Never null: before the map exists
   * it returns the value, else the centre. While the picker is UNSET this is only the view centre (e.g. the 20,0 world
   * view), not a chosen location, and the first such call logs one console warning. To read the user's choice, use
   * `valueAsLatLng` (null while unset) or `value` (`""` while unset).
   * @example const { lat, lng } = picker.getMarkerPosition();
   */
  getMarkerPosition(): LatLng {
    return this.#core.getMarkerPosition();
  }
  /**
   * Move the pin and COMMIT (fires `input` then `change` with source `"api"` when the rounded value changed).
   * Throws `INVALID_VALUE` for a string that does not parse. Numbers and objects are normalised: `setLocation(95, 10)`
   * commits `"90,10"` and logs one warning ("latitude 95 was clamped to 90; did you swap lat and lng? try (10, 95)").
   * @example picker.setLocation(48.8584, 2.2945)
   */
  setLocation(lat: number, lng: number, options?: SetLocationOptions): void;
  /** @example picker.setLocation('48.8584, 2.2945', { zoom: 17 }) */
  setLocation(position: LatLngInput, options?: SetLocationOptions): void;
  setLocation(
    position: LatLngInput | number,
    lngOrOptions?: number | SetLocationOptions,
    options?: SetLocationOptions,
  ): void {
    const numeric = typeof position == 'number';
    const { value, error, diagnostic } = readLatLngInput(
      numeric ? { lat: position, lng: lngOrOptions } : position,
    );
    if (!value) throw error ?? createError('INVALID_VALUE', { vars: { value: '""' } });
    if (diagnostic) emitDiagnostics([diagnostic]);
    this.#core.setLocation(
      value,
      numeric ? options : typeof lngOrOptions == 'object' ? lngOrOptions : undefined,
    );
  }
  /**
   * Geolocate and commit (source `"geolocation"`; zoom becomes max(current, 17)). Rejects with
   * GEOLOCATION_UNSUPPORTED | GEOLOCATION_DENIED | GEOLOCATION_UNAVAILABLE | GEOLOCATION_TIMEOUT | ABORTED; never hangs.
   * Does not fire `error` (the promise is the channel).
   * @example const { lat, lng } = await picker.locate();
   */
  locate(options?: LocateOptions): Promise<LocationDetail> {
    return this.#core.locate(options);
  }
  /** v1/v2 alias of {@link LocationPicker.locate} that keeps the current zoom (v2 only re-centred). Same promise, errors and `change` (source `"geolocation"`). */
  setCurrentPosition(options?: LocateOptions): Promise<LocationDetail> {
    return this.#core.locate(options, 'method', true);
  }
  /**
   * Forward-geocode with the paired (or custom) geocoder; results are NOT committed. A query that parses as
   * coordinates returns one offline result. Rejects GEOCODER_MISSING / GEOCODER_FAILED / ABORTED.
   * @example const [best] = await picker.geocode('Eiffel Tower');
   */
  geocode(query: string, options?: GeocodeOptions): Promise<GeocodeResult[]> {
    return this.#core.geocode(query, options);
  }
  /**
   * Reverse-geocode `at` (default: the current value); cached. When `at` is the current value, also updates
   * `address` and fires `addresschange`.
   * @example const r = await picker.lookupAddress(); console.log(r?.address);
   */
  lookupAddress(at?: LatLngInput, options?: GeocodeOptions): Promise<GeocodeResult | null> {
    return this.#core.lookupAddress(at, options);
  }
  /** Idempotent. Removes the DOM and listeners the picker created, removes the map it created, aborts pending work (pending promises reject with ABORTED). */
  destroy(): void {
    this.#core.destroy();
    if (instances.get(this.element) === this) instances.delete(this.element);
    for (const undo of this.#undo.splice(0)) undo();
  }

  #write(input: LatLngInput | null): void {
    const { value, error, diagnostic } = readLatLngInput(input);
    if (error) queueMicrotask(() => this.#core.report(error));
    if (diagnostic) emitDiagnostics([diagnostic]);
    this.#core.writeValue(value, { dirty: true, cause: 'write' });
  }

  /** onX callbacks run right before their event; `onError` marks errors as handled (§3.5). */
  #beforeDispatch<K extends keyof LocationPickerEventMap>(
    type: K,
    detail: LocationPickerEventMap[K]['detail'],
  ): boolean {
    const o = this.#options;
    call(o[CALLBACKS[type]], detail);
    if (type == 'change') call(o.onLocationChange, detail);
    // v2 called onLocationChange on its first idle; v3 does so after `ready`, only when a value is set (§4.6).
    const snapshot = this.#core?.snapshot;
    if (type == 'ready' && o.onLocationChange && snapshot?.latLng) {
      const { latLng, value, zoom, address } = snapshot;
      const now: LocationDetail = { ...latLng, value, source: 'api', zoom, address };
      queueMicrotask(() => call(o.onLocationChange, now));
    }
    return type == 'error' && !!o.onError;
  }
}
