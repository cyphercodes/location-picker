// <location-picker> (CONTRACT §3): a form-associated custom element over PickerCore. The class is module-level over an
// SSR-safe stub base, so importing it never touches the DOM. It has NO private members: the ESM and CJS declaration
// files each declare it, and the one HTMLElementTagNameMap entry (types/globals.d.ts) must stay assignable to both, so
// all state lives in a module-level Controller looked up through a WeakMap.
import type {
  AddressDetail,
  ChangeSource,
  GeocodeFn,
  GeocodeOptions,
  GeocodeResult,
  Geocoder,
  GestureHandling,
  LocateMode,
  LocateOptions,
  LocationDetail,
  LocationPickerOptions,
  MarkerMode,
  Messages,
  ProviderAdapter,
  ProviderName,
  ReadyDetail,
  SetLocationOptions,
} from '../core.js';
import type { LocationPickerError } from '../core/errors.js';
import type { CoreHost, PickerSnapshot, ResolvedConfig } from '../internal/contracts.js';
import type { LatLng, LatLngInput } from '../utils.js';
import { readLatLngInput, resolveConfig } from '../core/config.js';
import {
  LAT_LNG_IGNORED,
  WRONG_GUESSES,
  emitDiagnostics,
  inert,
  warnOnce,
  wrongGuess,
} from '../core/diagnostics.js';
import { createError, reportError } from '../core/errors.js';
import { PickerCore } from '../core/picker-core.js';
import { version } from '../core/version.js';
import { formatLatLng } from '../utils/format.js';
import { parseLatLng } from '../utils/parse.js';
import { ATTRIBUTES, UPGRADE_PROPERTIES, type AttributeSpec } from './attributes.js';
import {
  parseFormState,
  submitValue,
  updateValidity,
  warnNameCollisions,
  type FormState,
} from './form.js';

/** Element event map: native HTMLElement events with `input`/`change`/`error` replaced by the picker's CustomEvents. */
export type LocationPickerElementEventMap = Omit<
  HTMLElementEventMap,
  'input' | 'change' | 'error'
> & {
  input: CustomEvent<LocationDetail>;
  change: CustomEvent<LocationDetail>;
  addresschange: CustomEvent<AddressDetail>;
  ready: CustomEvent<ReadyDetail>;
  error: CustomEvent<LocationPickerError>;
};

/**
 * Attribute-spelled props for JSX/templates (kebab-case is SSR-correct; hyphen-less spellings are also accepted at
 * runtime). React 19, Vue 3 and Preact assign a non-hyphenated prop as a PROPERTY when `key in el`; every such key
 * here (`value`, `lat`, `lng`, `center`, `zoom`, `precision`, `name`, `form`, `required`, `disabled`, `provider`,
 * `attribution`, `search`, `placeholder`, `locate`, `marker`, `webmcp`) has a setter with the attribute's meaning.
 */
export interface LocationPickerAttributes {
  value?: string;
  lat?: number | string;
  lng?: number | string;
  center?: string;
  zoom?: number | string;
  'max-zoom'?: number | string;
  precision?: number | string;
  name?: string;
  'lat-name'?: string;
  'lng-name'?: string;
  'address-name'?: string;
  'value-input'?: string;
  'lat-input'?: string;
  'lng-input'?: string;
  'address-input'?: string;
  form?: string;
  required?: boolean;
  disabled?: boolean;
  readonly?: boolean;
  provider?: ProviderName;
  'api-key'?: string;
  'map-id'?: string;
  'tile-url'?: string;
  attribution?: string;
  'map-style'?: string;
  'engine-url'?: string;
  'engine-css-url'?: string;
  search?: boolean;
  placeholder?: string;
  'reverse-geocode'?: boolean;
  locate?: LocateMode | '';
  marker?: MarkerMode;
  'gesture-handling'?: GestureHandling;
  webmcp?: boolean;
}

/** Re-exported for JSX typings convenience. */
export type { ChangeSource };

// The base class: HTMLElement in browsers, an inert stub on the server (§3.9).
const Base: typeof HTMLElement =
  typeof HTMLElement == 'undefined'
    ? // oxlint-disable-next-line typescript/no-unsafe-type-assertion, typescript/no-extraneous-class -- never constructed: customElements is missing too
      (class {} as unknown as typeof HTMLElement)
    : HTMLElement;

const noop = (): void => {};
/** The live state the element owns across teardown and reconnect (§3.6). */
interface State {
  /** Canonical "lat,lng" or "". */
  value: string;
  /** Live zoom; undefined until the first mount or a property write. */
  zoom: number | undefined;
  address: string | null;
  addressResult: GeocodeResult | null;
  dirty: boolean;
  interacted: boolean;
}
type WriteOptions = Parameters<PickerCore['writeValue']>[1];
/** The property-only (object) configuration. */
type Objects = Pick<
  LocationPickerOptions,
  'engine' | 'mapOptions' | 'geocoder' | 'messages' | 'geolocation'
>;

const latLngOf = (value: string): LatLng | null => {
  const at = parseLatLng(value);
  return at && { lat: at.lat, lng: at.lng };
};
const isPlain = (value: unknown): value is Record<string, unknown> =>
  typeof value == 'object' &&
  value !== null &&
  [Object.prototype, null].includes(Object.getPrototypeOf(value));
/** Equal, or plain objects with identical own values: a re-resolved config only patches what really changed. */
const same = (a: unknown, b: unknown): boolean =>
  Object.is(a, b) ||
  (isPlain(a) &&
    isPlain(b) &&
    Object.keys(a).length == Object.keys(b).length &&
    Object.keys(a).every((key) => Object.is(a[key], b[key])));
const rawKey = (value: LatLng | null): string => (value ? `${value.lat},${value.lng}` : '');
const isRoot = (node: Node): node is Document | ShadowRoot =>
  node.nodeType == 9 || node.nodeType == 11;
const specOf = (name: string): AttributeSpec | undefined =>
  ATTRIBUTES.find((spec) => spec.attr == name || spec.alias == name);

/** All per-element state and behaviour; the element class only forwards to it. */
class Controller {
  readonly el: LocationPickerElement;
  readonly root: ShadowRoot;
  readonly internals: ElementInternals | undefined;
  core: PickerCore | undefined;
  /** Resolved from the current attributes and properties; `value` is the DEFAULT value (attributes). */
  config: ResolvedConfig;
  readonly state: State = {
    value: '',
    zoom: undefined,
    address: null,
    addressResult: null,
    dirty: false,
    interacted: false,
  };
  /** A value property write happened before the first init (precedence step 1, §3.3). */
  written = false;
  initialized = false;
  mounted = false;
  /** The bound inputs' seed defaults, captured at the first mount that bound any (§3.3 reset value). */
  seedDefault: LatLng | null = null;
  seeded = false;
  custom = '';
  formDisabled = false;
  adapter: ProviderAdapter | undefined;
  readonly objects: Objects = {};
  /** A history restore that arrived before the core existed. */
  restored: FormState | undefined;
  /** Method calls made before the core existed. */
  readonly pending: ((core: PickerCore) => void)[] = [];
  /** Error messages already dispatched (each distinct problem fires once). */
  readonly reported = new Set<string>();
  reportQueued = false;
  readonly locate: (options?: LocateOptions) => Promise<LocationDetail>;
  /** `el.ready` before the first core: settles with the first mount, through coalesced remounts. */
  readonly first: { promise: Promise<void>; resolve(): void; reject(error: unknown): void };
  lastReady: Promise<unknown> | undefined;
  derived: [Promise<unknown>, Promise<LocationPickerElement>] | undefined;

  constructor(el: LocationPickerElement) {
    this.el = el;
    this.root = el.shadowRoot ?? el.attachShadow({ mode: 'open', delegatesFocus: true });
    let internals: ElementInternals | undefined;
    try {
      internals = el.attachInternals();
      internals.role = 'group';
    } catch {
      // happy-dom has no attachInternals (§9 degrade)
    }
    this.internals = internals;
    const missing = [
      typeof internals?.setFormValue != 'function' && 'ElementInternals',
      typeof ResizeObserver == 'undefined' && 'ResizeObserver',
    ].filter(Boolean);
    if (missing.length) warnOnce('inert', inert(missing.join(' and ')));
    this.config = this.resolve().config;
    this.locate = (options) => this.withCore((core) => core.locate(options));
    let settle!: Pick<Controller['first'], 'resolve' | 'reject'>;
    const promise = new Promise<void>((resolve, reject) => (settle = { resolve, reject }));
    promise.catch(noop);
    this.first = { promise, ...settle };
    el.addEventListener('blur', () => this.core?.markInteracted());
  }

  // ---- configuration ---------------------------------------------------------------------------------------------

  attr(spec: AttributeSpec): string | null {
    const { el } = this;
    return el.getAttribute(spec.attr) ?? (spec.alias ? el.getAttribute(spec.alias) : null);
  }

  /** Class options from ATTRIBUTES and the object properties. `value` overrides the default-value attributes. */
  options(value?: LatLng | null): LocationPickerOptions {
    const { el } = this;
    const o: Record<string, unknown> = { ...this.objects };
    for (const spec of ATTRIBUTES) {
      const raw = this.attr(spec);
      if (raw !== null && spec.option) o[spec.option] = spec.kind == 'boolean' ? true : raw;
    }
    // The nonce attribute is blanked once connected; the IDL property keeps it.
    o.nonce = el.nonce || o.nonce;
    o.disabled = !!o.disabled || this.formDisabled;
    o.locate ??= el.hasAttribute('locate-button')
      ? 'button'
      : el.hasAttribute('autolocate')
        ? 'auto'
        : undefined;
    if (this.adapter) o.provider = this.adapter;
    if (value !== undefined) {
      o.value = value;
      delete o.lat;
      delete o.lng;
    }
    return o;
  }

  resolve(value?: LatLng | null): ReturnType<typeof resolveConfig> {
    return resolveConfig(this.options(value), { mode: 'element', host: this.el });
  }

  /** Re-resolves after an attribute or object property changed and patches the core with what actually differs. */
  sync(name?: string): void {
    const prev = this.config;
    const next = (this.config = this.resolve().config);
    const { core, state } = this;
    if (core) {
      const patch: Partial<ResolvedConfig> = {};
      for (const [key, value] of Object.entries(next)) {
        // value and zoom are live state; their attributes are handled below and by the zoom setter.
        if (key != 'value' && key != 'zoom' && !same(Reflect.get(core.config, key), value))
          Reflect.set(patch, key, value);
      }
      core.update(patch);
      if (this.mounted && patch.inputs) this.captureSeed(core);
      this.queueReport();
    } else if (state.value && prev.precision != next.precision) {
      state.value = this.canonical(latLngOf(state.value));
    }
    // The validity message comes from `messages`, the form value's zoom from the config.
    if (rawKey(prev.value) == rawKey(next.value)) return this.updateForm();
    if (!state.dirty) this.write(next.value, { dirty: false, cause: 'write' });
    // D10: only lat/lng changes warn; a value attribute change while dirty is silent (native parity).
    else if (name == 'lat' || name == 'lng') warnOnce('lat-lng-ignored', LAT_LNG_IGNORED);
  }

  /** Dispatches the current configuration errors (each distinct one once) and logs its diagnostics, in a microtask. */
  queueReport(): void {
    if (this.reportQueued) return;
    this.reportQueued = true;
    queueMicrotask(() => {
      this.reportQueued = false;
      if (!this.core) return;
      const { errors, diagnostics } = this.resolve();
      emitDiagnostics(diagnostics);
      for (const error of errors) this.report(error);
    });
  }

  report(error: LocationPickerError): void {
    if (this.reported.has(error.message)) return;
    this.reported.add(error.message);
    reportError(this.el, error);
  }

  canonical(value: LatLng | null): string {
    return value ? formatLatLng(value, { precision: this.config.precision }) : '';
  }

  // ---- value -----------------------------------------------------------------------------------------------------

  /** A silent write: through the core when it exists, else straight into the kept state (§3.6). */
  write(value: LatLng | null, options: WriteOptions): void {
    const { core, state } = this;
    if (core) return core.writeValue(value, options);
    const next = this.canonical(value);
    if (next != state.value || options.address !== undefined) {
      state.address = options.address ?? null;
      state.addressResult = null;
    }
    state.value = next;
    state.dirty = options.dirty;
    if (options.cause == 'reset') state.interacted = false;
    if (options.zoom !== undefined) state.zoom = options.zoom;
    if (options.dirty && !this.initialized) this.written = true;
    this.updateForm();
  }

  /** The `value`/`valueAsLatLng` setters: lenient (D4), silent, dirty. */
  setValue(input: unknown): void {
    const { value, error, diagnostic } = readLatLngInput(input);
    if (error) queueMicrotask(() => this.report(error));
    if (diagnostic) emitDiagnostics([diagnostic]);
    this.write(value, { dirty: true, cause: 'write' });
  }

  mirror(snapshot: PickerSnapshot): void {
    const { value, zoom, address, addressResult, dirty, interacted } = snapshot;
    Object.assign(this.state, { value, zoom, address, addressResult, dirty, interacted });
    this.updateForm();
  }

  withCore<T>(run: (core: PickerCore) => T | Promise<T>): Promise<T> {
    const { core } = this;
    if (core) return Promise.resolve(run(core));
    return new Promise((resolve) => this.pending.push((ready) => resolve(run(ready))));
  }

  // ---- forms -----------------------------------------------------------------------------------------------------

  names(): [attr: string, name: string][] {
    return ATTRIBUTES.filter((spec) => spec.attr.endsWith('name')).map((spec) => [
      spec.attr,
      this.attr(spec) ?? '',
    ]);
  }

  updateForm(): void {
    const { internals, state, el } = this;
    const [name, latName, lngName, addressName] = this.names().map(([, n]) => n);
    submitValue(
      internals,
      {
        name: name ?? '',
        latName: latName ?? '',
        lngName: lngName ?? '',
        addressName: addressName ?? '',
      },
      { value: state.value, zoom: state.zoom ?? this.config.zoom, address: state.address },
    );
    const missing =
      el.hasAttribute('required') && !state.value && this.config.messages.valueMissing;
    updateValidity(internals, missing, this.custom, this.core?.refs.map);
  }

  checkNames(): void {
    if (!this.mounted) return;
    const inputs = this.config.inputs;
    warnNameCollisions(
      this.lookupRoot(),
      this.internals?.form ?? null,
      this.names().filter(([, name]) => name),
      [inputs.value, inputs.lat, inputs.lng, inputs.address],
    );
  }

  captureSeed(core: PickerCore): void {
    if (this.seeded || !Object.keys(core.config.inputs).length) return;
    this.seeded = true;
    this.seedDefault = core.seedDefault;
  }

  /** §3.4 formResetCallback: the value attribute, else lat/lng, else the bound-input seed defaults, else unset. */
  reset(): void {
    this.write(this.config.value ?? this.seedDefault, {
      dirty: false,
      cause: 'reset',
      address: null,
    });
  }

  restore(state: unknown, mode: string): void {
    const restored = mode == 'restore' ? parseFormState(state) : null;
    if (!restored) return;
    if (!this.initialized) this.restored = restored;
    else this.write(latLngOf(restored.value), this.restoreOptions(restored));
  }

  restoreOptions({ zoom, address }: FormState): WriteOptions {
    return {
      dirty: true,
      cause: 'restore',
      address,
      ...(Number.isFinite(zoom) && { zoom }),
    };
  }

  // ---- lifecycle -------------------------------------------------------------------------------------------------

  lookupRoot(): Document | ShadowRoot {
    const root = this.el.getRootNode();
    return isRoot(root) ? root : this.el.ownerDocument;
  }

  connected(): void {
    const el: object = this.el;
    // §3.2 property upgrade: values set before define shadow the accessors; route them through the setters.
    for (const prop of UPGRADE_PROPERTIES) {
      if (!Object.hasOwn(el, prop)) continue;
      const value: unknown = Reflect.get(el, prop);
      Reflect.deleteProperty(el, prop);
      Reflect.set(el, prop, value);
    }
    if (!this.core) this.createCore();
  }

  disconnected(): void {
    // A move (remove + append in one task) cancels the teardown: no remount, no second `ready`.
    queueMicrotask(() => {
      if (!this.el.isConnected) this.teardown();
    });
  }

  createCore(): void {
    const { el, state } = this;
    const restoring = this.initialized;
    const init = this.resolve(restoring || this.written ? latLngOf(state.value) : undefined).config;
    let core: PickerCore | undefined;
    const host: CoreHost = {
      mode: 'element',
      host: el,
      renderRoot: this.root,
      styleRoot: this.root,
      lookupRoot: this.lookupRoot(),
      eventTarget: el,
      setState: (name, on) => {
        const states = this.internals?.states;
        try {
          if (on) states?.add(name);
          else states?.delete(name);
        } catch {
          // CustomStateSet missing or refusing undashed names (older engines)
        }
      },
      onSnapshot: (snapshot) => {
        if (core && this.core == core) this.mirror(snapshot);
      },
    };
    core = this.core = new PickerCore(host, { ...init, zoom: state.zoom ?? init.zoom });
    const latLng = latLngOf(state.value);
    if (restoring) {
      // A reconnect after teardown restores the kept state silently; it never re-runs the initial-value precedence.
      core.writeValue(latLng, {
        dirty: state.dirty,
        cause: 'restore',
        address: state.address,
        ...(state.zoom !== undefined && { zoom: state.zoom }),
      });
      if (state.interacted) core.markInteracted();
    } else if (this.written) core.writeValue(latLng, { dirty: state.dirty, cause: 'write' });
    const restored = this.restored;
    this.restored = undefined;
    if (restored) core.writeValue(latLngOf(restored.value), this.restoreOptions(restored));
    this.mirror(core.snapshot);
    for (const call of this.pending.splice(0)) call(core);
    if (!restoring) this.followFirstReady(core, core.ready);
    this.initialized = true;
    this.queueReport();

    const start = (): void => {
      if (this.core != core || !el.isConnected) return;
      core.mount();
      this.mounted = true;
      this.captureSeed(core);
      this.checkNames();
    };
    // §3.6 parser timing: defined before the parser reached the bound inputs; never write one before reading it.
    const doc = el.ownerDocument;
    if (doc.readyState == 'loading' && Object.keys(init.inputs).length)
      doc.addEventListener('DOMContentLoaded', start, { once: true });
    else queueMicrotask(start);
  }

  followFirstReady(core: PickerCore, ready: Promise<unknown>): void {
    ready.then(
      () => this.first.resolve(),
      (error: unknown) => {
        // A coalesced remount replaced the promise: follow the new one.
        if (this.core == core && core.ready != ready) this.followFirstReady(core, core.ready);
        else this.first.reject(error);
      },
    );
  }

  teardown(): void {
    const { core } = this;
    if (!core) return;
    this.lastReady = core.ready;
    this.core = undefined;
    this.mounted = false;
    core.destroy();
    try {
      this.internals?.states?.clear();
    } catch {
      // no CustomStateSet
    }
    this.updateForm();
  }

  ready(): Promise<LocationPickerElement> {
    const source = this.core?.ready ?? this.lastReady ?? this.first.promise;
    if (this.derived?.[0] !== source) {
      const derived = source.then(() => this.el);
      derived.catch(noop);
      this.derived = [source, derived];
    }
    return this.derived[1];
  }

  attributeChanged(name: string, old: string | null, value: string | null): void {
    if (old === value) return;
    if (Object.hasOwn(WRONG_GUESSES, name)) {
      if (value !== null) warnOnce(`attribute:${name}`, wrongGuess(name));
      // `locate-button` and `autolocate` are also honoured (§3.11).
      if (/locate/.test(name)) this.sync(name);
      return;
    }
    const spec = specOf(name);
    if (!spec) return;
    if (spec.effect == 'form') {
      this.updateForm();
      this.checkNames();
      return;
    }
    // The latest provider write wins: a name written after an adapter replaces it.
    if (spec.attr == 'provider' && value !== null) this.adapter = undefined;
    this.sync(spec.attr);
    if (spec.prop == 'zoom' && this.core) {
      const zoom = Number(value ?? NaN);
      if (Number.isFinite(zoom)) this.core.setZoom(zoom);
    }
    if (spec.prop.endsWith('Input')) this.checkNames();
  }
}

const controllers = new WeakMap<object, Controller>();
// oxlint-disable-next-line typescript/no-non-null-assertion -- every instance registers itself in its constructor
const of = (el: object): Controller => controllers.get(el)!;

/** Writes (or, for null/undefined, removes) an attribute, skipping a same-value write (it would still be a mutation). */
function setAttr(el: Element, name: string, value: unknown, alias?: string): void {
  if (value == null) {
    el.removeAttribute(name);
    if (alias) el.removeAttribute(alias);
    return;
  }
  // oxlint-disable-next-line typescript/no-base-to-string -- attribute reflection stringifies like the platform does
  const text = String(value);
  if (el.getAttribute(name) !== text) el.setAttribute(name, text);
}

/**
 * `<location-picker>`: a form-associated custom element (ElementInternals) that renders into an open shadow root
 * (`delegatesFocus: true`). On the server it extends an inert stub, so importing it never throws; it is only
 * defined where `customElements` exists.
 *
 * Value model: unset (`value === ""`, `:state(unset)`) until the user pans, presses Enter/confirm, picks a search
 * result or locates, or until `value` is set. The `value` ATTRIBUTE is the default value (applies while not dirty).
 * Form reset returns to the first of: the `value` attribute, the `lat` + `lng` attributes, the bound inputs' seed
 * defaults (their server-rendered `value` attributes, captured when the picker first read them; re-reading is not
 * possible because writing an `<input type="hidden">` rewrites its attribute), unset, and then writes that value into
 * the bound inputs silently. Live state (`value`, `zoom`, `address`) is
 * never reflected to attributes. Live state survives a disconnect and reconnect (e.g. Vue `<KeepAlive>`).
 *
 * In SSR-hydrated React (`hydrateRoot`, e.g. Next.js), React does not apply custom-element PROPERTIES or native
 * `on*` listeners during hydration: set `messages`, `mapOptions`, `engine`, `geocoder`, `geolocation` and
 * `addresschange`/`ready`/`error` listeners in a ref callback. Attributes, `value` and `onChange`/`onInput` work.
 *
 * @example
 * <form method="post">
 *   <label for="loc">Store location</label>
 *   <location-picker id="loc" name="location" lat-name="lat" lng-name="lng" required search></location-picker>
 * </form>
 *
 * @tagname location-picker
 *
 * @attr value - Default value, lenient ("48.8584, 2.2945", DMS, geo:, map URLs). "," or empty = unset.
 * @attr lat - Default-value alias, needs `lng` too. `value` wins.
 * @attr lng - Default-value alias, needs `lat` too.
 * @attr center - View centre while unset ("lat,lng").
 * @attr zoom - Initial zoom.
 * @attr max-zoom
 * @attr precision
 * @attr name
 * @attr lat-name
 * @attr lng-name
 * @attr address-name
 * @attr value-input
 * @attr lat-input
 * @attr lng-input
 * @attr address-input
 * @attr required
 * @attr disabled
 * @attr readonly
 * @attr provider - leaflet | google | maplibre.
 * @attr api-key
 * @attr map-id
 * @attr tile-url
 * @attr attribution
 * @attr map-style
 * @attr engine-url - URL, or "none" to never auto-load.
 * @attr engine-css-url - URL, or "none".
 * @attr search
 * @attr placeholder
 * @attr reverse-geocode
 * @attr locate - off | button | auto ("" = button). Writing the `locate` PROPERTY (as React 19/Vue 3/Preact do for this attribute) also sets it; reading it returns the method.
 * @attr marker - pin | none | advanced.
 * @attr gesture-handling
 * @attr webmcp
 *
 * @fires input - CustomEvent<LocationDetail>: live user changes, and the final value before every change and at the end of every gesture.
 * @fires change - CustomEvent<LocationDetail>: committed (user gesture or method call), de-duplicated.
 * @fires addresschange - CustomEvent<AddressDetail>.
 * @fires ready - CustomEvent<ReadyDetail>.
 * @fires error - CustomEvent<LocationPickerError> (cancelable; logged when not canceled).
 *
 * @csspart base
 * @csspart search
 * @csspart search-input
 * @csspart search-listbox
 * @csspart search-option
 * @csspart map
 * @csspart pin
 * @csspart pin-icon
 * @csspart pin-shadow
 * @csspart confirm-button
 * @csspart controls
 * @csspart locate-button
 * @csspart hint
 * @csspart error-message
 * @csspart fallback
 *
 * @slot marker - Custom pin graphic, anchored by its bottom-centre at the map centre.
 * @slot controls - Extra buttons placed with the built-in controls.
 * @slot error - Content shown when the map fails to load.
 *
 * @cssstate unset
 * @cssstate loading
 * @cssstate ready
 * @cssstate error
 * @cssstate dragging
 * @cssstate locating
 * @cssstate searching
 * @cssstate interacted
 *
 * @cssprop [--lp-pin-color=#e11d48]
 * @cssprop [--lp-pin-inner=#fff]
 * @cssprop [--lp-pin-size=44px] - height; width is size × 28/44
 * @cssprop [--lp-pin-lift=10px]
 * @cssprop [--lp-pin-shadow=rgb(0 0 0 / .35)]
 * @cssprop [--lp-unset-opacity=.6]
 * @cssprop [--lp-accent=light-dark(#1d4ed8, #93c5fd)]
 * @cssprop [--lp-surface=light-dark(#fff, #1f1f1f)]
 * @cssprop [--lp-on-surface=light-dark(#1f2937, #f3f4f6)]
 * @cssprop [--lp-radius=8px]
 * @cssprop [--lp-control-size=44px]
 * @cssprop [--lp-font=inherit]
 * @cssprop [--lp-tile-filter=none]
 * @cssprop [--lp-transition=160ms ease-out]
 */
// oxlint-disable-next-line typescript/no-unsafe-declaration-merging -- typed listener overloads, no runtime code
export class LocationPickerElement extends Base {
  static readonly formAssociated: true = true;
  static readonly observedAttributes: readonly string[] = [
    ...ATTRIBUTES.flatMap((spec) => (spec.alias ? [spec.attr, spec.alias] : [spec.attr])),
    ...Object.keys(WRONG_GUESSES),
  ];
  /** @example customElements.get('location-picker').version // "3.0.0" */
  static readonly version: string = version;

  static {
    // The reflecting accessors of the ATTRIBUTES rows declared (`declare`) below, and not defined by the platform
    // (lang, nonce): R5, every one has a setter with the attribute's meaning.
    for (const spec of ATTRIBUTES) {
      if (spec.prop in this.prototype || spec.prop == 'lang' || spec.prop == 'nonce') continue;
      Object.defineProperty(this.prototype, spec.prop, {
        configurable: true,
        get(this: LocationPickerElement): unknown {
          const ctl = of(this);
          if (spec.kind == 'boolean') return ctl.attr(spec) !== null;
          const resolved: unknown = spec.option && Reflect.get(ctl.config, spec.option);
          if (spec.kind == 'number') return resolved ?? NaN;
          if (spec.kind == 'enum') return resolved;
          return ctl.attr(spec) ?? (typeof resolved == 'string' ? resolved : '');
        },
        set(this: LocationPickerElement, value: unknown): void {
          setAttr(this, spec.attr, spec.kind != 'boolean' ? value : value ? '' : null, spec.alias);
        },
      });
    }
  }

  constructor() {
    super();
    controllers.set(this, new Controller(this));
  }

  /** @internal */
  connectedCallback(): void {
    of(this).connected();
  }
  /** @internal */
  disconnectedCallback(): void {
    of(this).disconnected();
  }
  /** @internal `moveBefore()` keeps the map alive: no disconnect, no teardown. */
  connectedMoveCallback(): void {}
  /** @internal */
  attributeChangedCallback(name: string, old: string | null, value: string | null): void {
    of(this).attributeChanged(name, old, value);
  }
  /** @internal */
  formResetCallback(): void {
    of(this).reset();
  }
  /** @internal */
  formStateRestoreCallback(state: unknown, mode: string): void {
    of(this).restore(state, mode);
  }
  /** @internal */
  formDisabledCallback(disabled: boolean): void {
    const ctl = of(this);
    ctl.formDisabled = disabled;
    ctl.sync();
  }

  // ---------------- native-control parity ----------------
  /** Live value: canonical `"lat,lng"` or `""` (unset). Setting is SILENT, marks the control dirty, accepts any LatLngInput or `""`/null. A string that does not parse warns (INVALID_VALUE) and clears; an object is normalised (latitude clamped with a warning). Never reflected. @default defaultValue */
  get value(): string {
    return of(this).state.value;
  }
  set value(value: LatLngInput | null) {
    of(this).setValue(value);
  }
  /** Reflects the `value` attribute. Applies while not dirty. Form reset returns to it when it is non-empty (otherwise to the `lat`/`lng` attributes, then the bound-input seed defaults; see the class JSDoc). @default "" */
  declare defaultValue: string;
  /** Live value as an object, or null. Setting is silent. @default null */
  get valueAsLatLng(): LatLng | null {
    return latLngOf(of(this).state.value);
  }
  set valueAsLatLng(value: LatLngInput | null) {
    of(this).setValue(value);
  }
  /**
   * Live latitude, or null while unset. SETTING writes the `lat` attribute, which sets the INITIAL value only (like
   * `defaultValue`; latitude clamped with a warning): it applies while the control is not dirty. Once dirty (any pan,
   * commit or `value` write, including the `el.value = ''` that Vue `v-model` and Angular `writeValue` do on mount),
   * a changed `lat`/`lng` is ignored and logs one warning: "lat/lng only set the initial value; bind value="lat,lng"
   * or call setLocation()". To control the position, bind `value`.
   * @default null
   */
  get lat(): number | null {
    return this.valueAsLatLng?.lat ?? null;
  }
  set lat(value: number | string | null) {
    setAttr(this, 'lat', value);
  }
  /** Live longitude, or null while unset. SETTING writes the `lng` attribute: initial value only (see `lat`). @default null */
  get lng(): number | null {
    return this.valueAsLatLng?.lng ?? null;
  }
  set lng(value: number | string | null) {
    setAttr(this, 'lng', value);
  }
  /** FormData entry `name=lat,lng` (the library appends it itself; the UA ignores host `name` for FormData values). @default "" */
  declare name: string;
  /** Separate FormData entry for latitude. @default "" @example el.latName = 'lat' */
  declare latName: string;
  /** Separate FormData entry for longitude. @default "" */
  declare lngName: string;
  /** FormData entry for the address (`""` while unknown). @default "" */
  declare addressName: string;
  /** Id or selector of an existing input that receives `"lat,lng"` (native events as for `latInput`). @default "" */
  declare valueInput: string;
  /** Id or selector of an existing input that receives the latitude; also seeds the initial value. Native events: `input` live, `input` + `change` on commits, none for silent writes; non-bubbling when the input is inside the element (see `LocationPickerOptions.latInput`). @default "" @example el.latInput = 'lat' */
  declare latInput: string;
  /** Same as `latInput`, for longitude. @default "" */
  declare lngInput: string;
  /** Id or selector of an existing input that receives the address. @default "" */
  declare addressInput: string;
  /** The form owner (`internals.form`). */
  get form(): HTMLFormElement | null {
    return of(this).internals?.form ?? null;
  }
  /** Writes the `form` content attribute (a form id); `null` or `""` removes it. Lets React 19 render `form="f1"` without a TypeError. */
  set form(value: string | null) {
    setAttr(this, 'form', value || null);
  }
  get labels(): NodeListOf<HTMLLabelElement> {
    const labels = of(this).internals?.labels;
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- a form-associated element's labels are labels
    if (labels) return labels as NodeListOf<HTMLLabelElement>;
    return this.ownerDocument.createDocumentFragment().querySelectorAll('label');
  }
  /** Always "location-picker". */
  get type(): 'location-picker' {
    return 'location-picker';
  }
  /** @default false */
  declare required: boolean;
  /** @default false */
  declare disabled: boolean;
  /** View-only (zoom allowed); barred from constraint validation. Attribute `readonly`. @default false */
  declare readOnly: boolean;
  get validity(): ValidityState {
    const ctl = of(this);
    if (typeof ctl.internals?.setValidity == 'function') return ctl.internals.validity;
    const valueMissing = this.required && !this.value;
    const customError = !!ctl.custom;
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the inert fallback carries the flags it can know
    return { valid: !valueMissing && !customError, valueMissing, customError } as ValidityState;
  }
  get validationMessage(): string {
    return of(this).internals?.validationMessage ?? '';
  }
  get willValidate(): boolean {
    return of(this).internals?.willValidate ?? false;
  }
  checkValidity(): boolean {
    const internals = of(this).internals;
    return typeof internals?.setValidity == 'function'
      ? internals.checkValidity()
      : this.validity.valid;
  }
  /** Focuses the map region and shows the validation bubble there. */
  reportValidity(): boolean {
    const ctl = of(this);
    if (typeof ctl.internals?.setValidity != 'function') return this.checkValidity();
    const valid = ctl.internals.reportValidity();
    if (!valid) ctl.core?.refs.map.focus();
    return valid;
  }
  setCustomValidity(message: string): void {
    const ctl = of(this);
    // oxlint-disable-next-line typescript/no-unnecessary-type-conversion -- untyped callers pass anything
    ctl.custom = message == null ? '' : String(message);
    ctl.updateForm();
  }

  // ---------------- map configuration (attribute-backed, reflected) ----------------
  /** View centre while unset, as canonical "lat,lng" ("" = world view 20,0). Setting accepts any LatLngInput (strings parsed, objects normalised). @default "" */
  get center(): string {
    const { config } = of(this);
    return config.centerGiven ? of(this).canonical(config.center) : '';
  }
  set center(value: LatLngInput | null) {
    const ctl = of(this);
    if (value == null || typeof value == 'string') {
      setAttr(this, 'center', value || null);
      return;
    }
    const { value: at, error } = readLatLngInput(value);
    if (error) queueMicrotask(() => ctl.report(error));
    setAttr(this, 'center', at && formatLatLng(at, { precision: ctl.config.precision }));
  }
  /** Live zoom; the attribute is the initial zoom. @default 15 with value/center, else 2 */
  get zoom(): number {
    const ctl = of(this);
    return ctl.state.zoom ?? ctl.config.zoom;
  }
  set zoom(zoom: number) {
    const ctl = of(this);
    // oxlint-disable-next-line typescript/no-unnecessary-type-conversion -- frameworks may bind a string
    const value = Number(zoom);
    if (!Number.isFinite(value)) return;
    if (ctl.core) ctl.core.setZoom(value);
    else ctl.state.zoom = value;
  }
  /** @default 19 for OSM tiles; engine maximum otherwise (NaN when unset) */
  declare maxZoom: number;
  /** Decimal places of the value (0–10). @default 6 */
  declare precision: number;
  /**
   * Provider name (reflected) or adapter object (property only). Changing it remounts and keeps the coordinates. When
   * the resolved provider NAME changes (e.g. google -> leaflet), the address is cleared silently (`address`, the
   * `address-name` entry, `address-input`), because Google content must not appear next to a non-Google map (ToS
   * §3.2.3(e)) and vice versa; with `reverse-geocode` on, the new provider's paired geocoder looks it up again after `ready`.
   * @default 'leaflet' ('google' when api-key or map-id is set)
   */
  get provider(): ProviderName | ProviderAdapter {
    const ctl = of(this);
    const provider = ctl.config.provider;
    if (typeof provider == 'string' || ctl.adapter) return ctl.adapter ?? provider;
    // An unknown name resolves to an adapter that fails to load; report the name as written.
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the getter echoes what the page wrote
    return provider.name as ProviderName;
  }
  // oxlint-disable-next-line typescript/no-redundant-type-constituents -- the api.d.ts signature (names are documented)
  set provider(value: ProviderName | ProviderAdapter | string) {
    const ctl = of(this);
    const previous = ctl.adapter;
    if (typeof value == 'object' && value !== null) {
      if (value == previous) return;
      // Set first, so the sync triggered by removing the attribute already sees the adapter.
      ctl.adapter = value;
      this.removeAttribute('provider');
    } else {
      ctl.adapter = undefined;
      setAttr(this, 'provider', value || null);
    }
    // No attribute change happened (none to remove, or the same name): sync the adapter change itself.
    if (previous != ctl.adapter) ctl.sync('provider');
  }
  /** @default "" */
  declare apiKey: string;
  /** @default "" */
  declare mapId: string;
  /** @default "https://tile.openstreetmap.org/{z}/{x}/{y}.png" */
  declare tileUrl: string;
  /** @default OSM credit */
  declare attribution: string;
  /** @default "https://tiles.openfreemap.org/styles/liberty" */
  declare mapStyle: string;
  /** Engine JS URL; "none" = never auto-load; "" = default (pinned jsDelivr Leaflet). @default "" */
  declare engineUrl: string;
  /** Engine CSS URL; "none" = you provide it (copied from readable document CSS); "" = default order. @default "" */
  declare engineCssUrl: string;
  /** Engine namespace (`L`, `maplibregl`, `google.maps`). Property only. @default null */
  get engine(): object | null {
    return of(this).objects.engine ?? null;
  }
  set engine(engine: object | null) {
    setObject(this, 'engine', engine ?? undefined);
  }
  /** Passed to the engine map constructor. Property only. Changing it remounts. @default {} */
  get mapOptions(): Record<string, unknown> {
    return of(this).objects.mapOptions ?? {};
  }
  set mapOptions(mapOptions: Record<string, unknown>) {
    setObject(this, 'mapOptions', mapOptions ?? undefined);
  }
  /** @default false */
  declare search: boolean;
  /** @default messages.searchPlaceholder */
  declare placeholder: string;
  /** @default false */
  declare reverseGeocode: boolean;
  /** Custom geocoder; false disables geocoding. Property only. @default null (provider pair) */
  get geocoder(): Geocoder | GeocodeFn | false | null {
    return of(this).objects.geocoder ?? null;
  }
  set geocoder(geocoder: Geocoder | GeocodeFn | false | null) {
    setObject(this, 'geocoder', geocoder ?? undefined);
  }
  /** Locate-control mode; ATTRIBUTE `locate` (the one R3 exception, because `locate()` is the method). Reflects to `locate`. @default 'off' */
  declare locateMode: LocateMode;
  /** Passed to navigator.geolocation by the locate button and `locate()`. Property only (object). @default { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 } */
  get geolocation(): PositionOptions {
    return { ...of(this).config.geolocation };
  }
  set geolocation(geolocation: PositionOptions) {
    setObject(this, 'geolocation', geolocation ?? undefined);
  }
  /** Pin mode; a custom graphic goes in `slot="marker"`. @default 'pin' */
  declare marker: MarkerMode;
  /** @default 'auto' */
  declare gestureHandling: GestureHandling;
  /** Register WebMCP tools (prefix from id, then name). For options use `registerWebMcpTools()`. @default false */
  declare webmcp: boolean;
  /** UI text overrides. Property only. @default {} */
  get messages(): Partial<Messages> {
    return of(this).objects.messages ?? {};
  }
  set messages(messages: Partial<Messages>) {
    setObject(this, 'messages', messages ?? undefined);
  }

  // ---------------- live state ----------------
  /** Address of the current value, or null. */
  get address(): string | null {
    return of(this).state.address;
  }
  /** Engine map instance; undefined until ready. */
  get map(): unknown {
    return of(this).core?.handle?.map;
  }
  /**
   * Resolves when the current mount is ready. Replaced SYNCHRONOUSLY by any setter that schedules a remount (and on
   * reconnect after a teardown), so `el.provider = 'google'; await el.ready; el.map` sees the new map. The promise
   * itself never triggers `unhandledrejection`; a promise derived from it (`await`, `.then()` without a rejection
   * handler) does: add `.catch()`, or use the `ready`/`error` events.
   */
  get ready(): Promise<this> {
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- it resolves to this very element
    return of(this).ready() as Promise<this>;
  }

  // ---------------- methods (same semantics as the class) ----------------
  /** @see LocationPicker.getMarkerPosition (warns once when called while unset; read `valueAsLatLng` instead) */
  getMarkerPosition(): LatLng {
    const ctl = of(this);
    return ctl.core?.getMarkerPosition() ?? this.valueAsLatLng ?? { ...ctl.config.center };
  }
  /** Commit (source "api"; fires input then change). Throws INVALID_VALUE for a string that does not parse; numbers/objects are normalised (see the class). @example el.setLocation(48.8584, 2.2945) */
  setLocation(lat: number, lng: number, options?: SetLocationOptions): void;
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
    const opts = numeric ? options : typeof lngOrOptions == 'object' ? lngOrOptions : undefined;
    const ctl = of(this);
    if (ctl.core) ctl.core.setLocation(value, opts);
    else ctl.pending.push((core) => core.setLocation(value, opts));
  }
  /**
   * Reading returns the locate METHOD (bound to this element; same function every time), so `el.locate()` works as on
   * the class (@see LocationPicker.locate). WRITING sets the locate-control mode: `'off' | 'button' | 'auto' | ''`
   * (`''` and `true` = `'button'`; `false`/`null` remove the `locate` attribute). It exists because React 19, Vue 3 and
   * Preact assign `locate="button"` as a property (`'locate' in el` is true); without the setter they would overwrite
   * the method with a string. Read the mode from `locateMode`.
   * @example const { lat, lng } = await el.locate();
   */
  get locate(): (options?: LocateOptions) => Promise<LocationDetail> {
    return of(this).locate;
  }
  set locate(value: LocateMode | '' | boolean | null) {
    setAttr(this, 'locate', value === true ? 'button' : value === false ? null : value);
  }
  /** v1/v2 alias of `locate()` that keeps the current zoom (v2 only re-centred). */
  setCurrentPosition(options?: LocateOptions): Promise<LocationDetail> {
    return of(this).withCore((core) => core.locate(options, 'method', true));
  }
  /** @see LocationPicker.geocode */
  geocode(query: string, options?: GeocodeOptions): Promise<GeocodeResult[]> {
    return of(this).withCore((core) => core.geocode(query, options));
  }
  /** @see LocationPicker.lookupAddress */
  lookupAddress(at?: LatLngInput, options?: GeocodeOptions): Promise<GeocodeResult | null> {
    return of(this).withCore((core) => core.lookupAddress(at, options));
  }
}

// oxlint-disable-next-line typescript/no-unsafe-declaration-merging -- typed listener overloads, no runtime code
export interface LocationPickerElement {
  addEventListener<K extends keyof LocationPickerElementEventMap>(
    type: K,
    listener: (this: LocationPickerElement, ev: LocationPickerElementEventMap[K]) => unknown,
    options?: boolean | AddEventListenerOptions,
  ): void;
  addEventListener(
    type: string,
    listener: EventListenerOrEventListenerObject,
    options?: boolean | AddEventListenerOptions,
  ): void;
  removeEventListener<K extends keyof LocationPickerElementEventMap>(
    type: K,
    listener: (this: LocationPickerElement, ev: LocationPickerElementEventMap[K]) => unknown,
    options?: boolean | EventListenerOptions,
  ): void;
  removeEventListener(
    type: string,
    listener: EventListenerOrEventListenerObject,
    options?: boolean | EventListenerOptions,
  ): void;
}

/** Object properties: stored on the controller, then re-resolved (mapOptions and engine remount). */
function setObject<K extends keyof Objects>(
  el: LocationPickerElement,
  key: K,
  value: Objects[K],
): void {
  const ctl = of(el);
  if (Object.is(ctl.objects[key], value)) return;
  if (value === undefined) delete ctl.objects[key];
  else ctl.objects[key] = value;
  ctl.sync(key);
}
