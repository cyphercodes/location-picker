// CONTRACT §12 (frozen; type-only): the internal interfaces shared by WP2, WP3, WP4 and WP5, converted verbatim from
// the ambient `declare module` blocks of design/check/internal.d.ts. Each section names the file that implements it.
// Values are `declare`d, so this module emits no JavaScript: import from it with `import type` only, and let
// implementations check themselves against it (e.g. `export const getStore: typeof C.getStore = ...`).
// Changing any signature here is a contract amendment.
import type { LatLng, LatLngInput } from '../utils.js';
import type {
  GeocodeOptions,
  Geocoder,
  GeocodeResult,
  GestureHandling,
  InputRef,
  LocateMode,
  LocateOptions,
  LocationDetail,
  LocationPickerError,
  LocationPickerErrorCode,
  LocationPickerEventMap,
  LocationPickerOptions,
  MapHandle,
  MarkerMode,
  Messages,
  MountContext,
  ProviderAdapter,
  ProviderName,
  SearchContext,
  SearchHandle,
  SetLocationOptions,
} from '../core.js';
import type { WebMcpOptions } from '../webmcp.js';

// §12.1  src/internal/contracts.ts  (WP2; type-only; frozen). Shared by the class (WP2) and the element (WP4).
// module lp-internal/contracts -> src/internal/contracts.ts (this section is the module itself)

/** Fully resolved configuration (defaults applied). Defaults live ONLY in `DEFAULTS` (core/config.ts). */
export interface ResolvedConfig {
  readonly provider: ProviderName | ProviderAdapter;
  /** Why this provider was chosen (§4.1); drives the google.maps console hint. */
  readonly providerSource: 'explicit' | 'google-signal' | 'default';
  /** Initial value after option/attribute parsing (bound-input seeding is applied by PickerCore at mount). */
  readonly value: LatLng | null;
  readonly center: LatLng;
  /** True when `center` was given explicitly: shows the confirm button while unset. */
  readonly centerGiven: boolean;
  readonly zoom: number;
  readonly maxZoom: number | undefined;
  readonly precision: number;
  readonly disabled: boolean;
  readonly readOnly: boolean;
  readonly marker: MarkerMode | HTMLElement;
  readonly gestureHandling: GestureHandling;
  readonly locate: LocateMode;
  readonly geolocation: {
    readonly enableHighAccuracy: boolean;
    readonly timeout: number;
    readonly maximumAge: number;
  };
  readonly search: boolean;
  readonly placeholder: string;
  readonly reverseGeocode: boolean;
  /** `GeocodeFn` is normalised to `{ search }`; `undefined` = provider pair; `false` = disabled. */
  readonly geocoder: Geocoder | false | undefined;
  readonly inputs: {
    readonly value?: InputRef;
    readonly lat?: InputRef;
    readonly lng?: InputRef;
    readonly address?: InputRef;
  };
  readonly messages: Messages;
  readonly lang: string;
  readonly nonce: string | undefined;
  readonly injectStyles: boolean;
  readonly webmcp: false | WebMcpOptions;
  readonly apiKey: string | undefined;
  readonly mapId: string | undefined;
  readonly tileUrl: string;
  /** True when the user set `tileUrl` (MapLibre raster wrapping; attribution warning). */
  readonly tileUrlGiven: boolean;
  readonly attribution: string;
  readonly mapStyle: string | object;
  readonly engine: object | undefined;
  readonly engineUrl: string | false | undefined;
  readonly engineCssUrl: string | false | undefined;
  readonly mapOptions: Readonly<Record<string, unknown>>;
}
export type ConfigKey = keyof ResolvedConfig;

export interface ResolveContext {
  readonly mode: 'class' | 'element';
  readonly host: HTMLElement;
  /** v1/v2 third constructor argument (class only): merged into mapOptions; a Google signal. */
  readonly thirdArg?: Record<string, unknown>;
}
export interface ResolveResult {
  readonly config: ResolvedConfig;
  /** Dispatched by PickerCore as `error` events in a microtask (INVALID_VALUE, INVALID_OPTION). */
  readonly errors: readonly LocationPickerError[];
  /** Logged once each via warnOnce/infoOnce (unknown keys, aliases, deprecations, google.maps hint). */
  readonly diagnostics: readonly {
    readonly level: 'warn' | 'info';
    readonly key: string;
    readonly message: string;
  }[];
}
/** THE defaults resolver for both surfaces. The element first builds a `LocationPickerOptions` object from ATTRIBUTES + properties. */
export declare function resolveConfig(
  options: LocationPickerOptions<unknown>,
  context: ResolveContext,
): ResolveResult;
export declare const DEFAULTS: Readonly<Omit<ResolvedConfig, 'messages'>> & {
  readonly messages: Messages;
};
/** Every public option key: unknown-key diagnostics, plus the R3 test (each has an ATTRIBUTES row or is class-only). */
export declare const OPTION_KEYS: readonly (keyof LocationPickerOptions<unknown>)[];
export declare const CLASS_ONLY_KEYS: readonly (keyof LocationPickerOptions<unknown>)[];
/** Runtime changes of these keys remount (coalesced per microtask). `marker` only when it changes to or from 'advanced'. */
export declare const REMOUNT_KEYS: readonly ConfigKey[];

export type PickerStateName =
  'unset' | 'loading' | 'ready' | 'error' | 'dragging' | 'locating' | 'searching' | 'interacted';
export type SnapshotCause =
  'mount' | 'live' | 'commit' | 'write' | 'reset' | 'restore' | 'address' | 'zoom';

/** Immutable view of picker state; a new object per change. */
export interface PickerSnapshot {
  /** Canonical "lat,lng" or "". */
  readonly value: string;
  readonly latLng: LatLng | null;
  /** Live, normalised centre (equals latLng once set). */
  readonly center: LatLng;
  readonly zoom: number;
  readonly address: string | null;
  readonly addressResult: GeocodeResult | null;
  /** Resolved provider name, '' until resolved. */
  readonly provider: string;
  readonly phase: 'loading' | 'ready' | 'error';
  readonly dirty: boolean;
  readonly interacted: boolean;
  readonly map: unknown;
}

/** What PickerCore needs from its owner: implemented by `LocationPicker` (WP2) and `LocationPickerElement` (WP4). */
export interface CoreHost {
  readonly mode: 'class' | 'element';
  /** Class: the target. Element: the element. Observed by ResizeObserver; source of lang/dir/color-scheme. */
  readonly host: HTMLElement;
  /** Where the overlay is appended. Class: the target. Element: its ShadowRoot. */
  readonly renderRoot: HTMLElement | ShadowRoot;
  /** Where picker and engine CSS go. Class: target.getRootNode(). Element: its ShadowRoot. */
  readonly styleRoot: Document | ShadowRoot;
  /** Where InputRef ids/selectors resolve: host.getRootNode() (light DOM; children of the element included). */
  readonly lookupRoot: Document | ShadowRoot;
  /** Receives public events. Class: the LocationPicker instance. Element: the element. */
  readonly eventTarget: EventTarget;
  /** Element: internals.states (feature-detected, try/catch). Class: refs.base.classList.toggle(`lp-is-${name}`) on the library-owned `.lp-base`, never on the user's target. */
  setState(name: PickerStateName, on: boolean): void;
  /** Called synchronously after EVERY state change, including silent ones. The element updates setFormValue + validity here. */
  onSnapshot?(snapshot: PickerSnapshot, cause: SnapshotCause): void;
  /** Called right before a public event is dispatched. The class invokes onX callbacks here; return true when an `onError` handled the error. */
  beforeDispatch?<K extends keyof LocationPickerEventMap>(
    type: K,
    detail: LocationPickerEventMap[K]['detail'],
  ): boolean | void;
}

/** Nodes created by renderOverlay (same template in both modes; parts in the element, lp-* classes in the class). */
export interface OverlayRefs {
  readonly base: HTMLElement;
  readonly search: HTMLElement;
  readonly map: HTMLElement;
  readonly pin: HTMLElement;
  readonly confirm: HTMLButtonElement;
  readonly controls: HTMLElement;
  readonly locate: HTMLButtonElement;
  readonly hint: HTMLElement;
  readonly error: HTMLElement;
  readonly fallback: HTMLInputElement;
  readonly instructions: HTMLElement;
  readonly status: HTMLElement;
}
/** Builds the overlay (not yet attached). `uid` makes ids unique per instance. */
export declare function renderOverlay(
  doc: Document,
  mode: 'class' | 'element',
  messages: Messages,
  uid: string,
): OverlayRefs;

/**
 * The engine-agnostic picker. Owns value state, rounding, de-duplication, source attribution, events, overlay, pin lift,
 * geolocation, bound inputs, live region, search/reverse orchestration, provider loading and MountContext.
 */
export declare class PickerCore {
  /** Renders and attaches the overlay synchronously; does NOT start loading (call mount()). */
  constructor(host: CoreHost, config: ResolvedConfig);
  readonly config: ResolvedConfig;
  readonly snapshot: PickerSnapshot;
  readonly refs: OverlayRefs;
  /** Current handle; undefined until mounted (set synchronously for sync adapters). */
  readonly handle: MapHandle | undefined;
  /** Current mount; replaced on remount; pre-handled (never an unhandled rejection by itself). */
  readonly ready: Promise<MapHandle>;
  /** Start (or restart) loading and mounting. Class: called in the constructor. Element: in the connect microtask. */
  mount(): void;
  /**
   * Apply runtime config changes; REMOUNT_KEYS changes coalesce into one remount per microtask, and `ready` is replaced
   * synchronously here. A remount that changes the resolved provider NAME clears `address`/`addressResult` silently
   * (onSnapshot cause 'address'), then re-runs the reverse lookup with the new pair after mount when reverseGeocode is on.
   */
  update(patch: Partial<ResolvedConfig>): void;
  /** SILENT write (property set, reset, restore, element reconnect after teardown): no input/change events, no native events on bound inputs; onSnapshot still runs. */
  writeValue(
    value: LatLng | null,
    options: {
      readonly dirty: boolean;
      readonly cause: 'write' | 'reset' | 'restore';
      readonly zoom?: number;
      readonly address?: string | null;
    },
  ): void;
  /** Method commit (source 'api'): emits input then change when the rounded value changed. Callers validate input first. */
  setLocation(value: LatLng, options?: SetLocationOptions): void;
  /** Enter/Space/confirm while unset: commits the current centre (source 'user'). */
  commitCenter(): void;
  /** Zoom around the pin; never changes the value. */
  setZoom(zoom: number): void;
  getMarkerPosition(): LatLng;
  /** `via` decides the failure channel: 'method' rejects only; 'button' | 'auto' report `error` events. */
  locate(options?: LocateOptions, via?: 'method' | 'button' | 'auto'): Promise<LocationDetail>;
  geocode(query: string, options?: GeocodeOptions): Promise<GeocodeResult[]>;
  lookupAddress(at?: LatLngInput, options?: GeocodeOptions): Promise<GeocodeResult | null>;
  /** Sets :state(interacted) (element: on blur after focus). */
  markInteracted(): void;
  /** Idempotent: abort, handle.destroy(), remove overlay + lp classes, disconnect observers, reject pending with ABORTED. */
  destroy(): void;
}

// §12.2  src/core/errors.ts + src/core/diagnostics.ts  (WP2)
// module lp-internal/errors -> src/core/errors.ts + src/core/diagnostics.ts
export interface ErrorSpec {
  /** Default human text; `{name}` placeholders are filled from `vars`. */
  readonly message: string;
  /** Default one-line fix. */
  readonly fix: string;
  readonly level: 'error' | 'warn' | 'silent';
}
/** Source of truth for messages, fixes and DEFAULT levels (per-case overrides go through createError's `level`, e.g. INVALID_OPTION 'warn' for lat-only); docs/errors.md is generated from it (WP7). */
export declare const ERROR_TABLE: Readonly<Record<LocationPickerErrorCode, ErrorSpec>>;
export declare function createError(
  code: LocationPickerErrorCode,
  details?: {
    readonly message?: string;
    readonly fix?: string;
    readonly cause?: unknown;
    readonly vars?: Readonly<Record<string, string>>;
    readonly level?: 'error' | 'warn' | 'silent';
  },
): LocationPickerError;
/** Dispatches a cancelable, non-bubbling `error` event on `target`; logs `console[level]` unless prevented or handled. */
export declare function reportError(
  target: EventTarget,
  error: LocationPickerError,
  options?: { readonly handled?: boolean; readonly async?: boolean },
): void;
/** Diagnostics channel (never events): once per key per page, via the store's `warned` set. */
export declare function warnOnce(key: string, message: string): void;
export declare function infoOnce(key: string, message: string): void;

// §12.3  src/core/store.ts, loader.ts, styles.ts  (WP2)
// module lp-internal/runtime -> src/core/store.ts, src/core/loader.ts, src/core/styles.ts

/**
 * globalThis[Symbol.for('location-picker')]. Shared by ESM, CJS and IIFE copies (any version on the page).
 * Schema is APPEND-ONLY across versions: never rename or retype a field; readers tolerate missing fields.
 */
export interface GlobalStore {
  readonly schema: 1;
  /** In-flight or finished script loads by absolute URL. */
  readonly scripts: Map<string, Promise<void>>;
  /** Stylesheet loads per root, by absolute URL. */
  readonly stylesheets: WeakMap<Document | ShadowRoot, Map<string, Promise<void>>>;
  /** Constructed picker sheets by `${version}:${'element' | 'class'}`. */
  readonly sheets: Map<string, CSSStyleSheet>;
  /** Google inline-bootstrap promise (one per page, whichever copy injects it first). */
  googleBootstrap?: Promise<void>;
  /** Callbacks for live Google pickers; the chained window.gm_authFailure calls each, then the previous handler. */
  readonly googleAuthListeners: Set<() => void>;
  googleAuthChained: boolean;
  /** tagName -> version, for the duplicate-definition warning. */
  readonly defined: Map<string, string>;
  /** warnOnce/infoOnce keys already emitted. */
  readonly warned: Set<string>;
  /** Reverse-geocode LRU shared by pickers with the same geocoder id: key `${geocoderId}:${lat5},${lng5}`. */
  readonly reverseCache: Map<string, unknown>;
}
export declare function getStore(): GlobalStore;

/** Classic <script> into document.head, deduped by URL; nonce + crossorigin="anonymous" + optional SRI. Rejects ENGINE_LOAD_FAILED. */
export declare function loadScript(
  src: string,
  options?: { readonly integrity?: string; readonly nonce?: string; readonly signal?: AbortSignal },
): Promise<void>;
/** <link rel=stylesheet> into `root` (document.head for a Document), deduped per root; nonce; crossorigin="anonymous" whenever `integrity` is set (SRI needs CORS). Never rejects: resolves on load, on error, or after timeoutMs (default 3000). */
export declare function loadStylesheet(
  root: Document | ShadowRoot,
  href: string,
  options?: { readonly integrity?: string; readonly nonce?: string; readonly timeoutMs?: number },
): Promise<void>;
/** §4.3 step 3': copy matching rules from readable document sheets into one constructed sheet adopted by a ShadowRoot. Returns the count. */
export declare function adoptDocumentRules(
  root: Document | ShadowRoot,
  selectorTest: RegExp,
): Promise<number>;
/** Adopt the picker sheet ('element' into a ShadowRoot, 'class' into a Document/ShadowRoot); fallback <style nonce>. Idempotent per root. */
export declare function adoptStyles(
  root: Document | ShadowRoot,
  which: 'element' | 'class',
  nonce?: string,
): void;
/** nonce of the document's first script[nonce] (via HTMLElement.nonce), if any. */
export declare function detectNonce(doc?: Document): string | undefined;
/** Builds the MountContext handed to adapters (§4); `events` feed back into `core`. */
export declare function createMountContext(
  core: PickerCore,
  signal: AbortSignal,
  view: { readonly center: LatLng; readonly zoom: number },
): MountContext;

// §12.4  src/core/providers.ts  (WP2; the lazy targets are WP3 entries)
// module lp-internal/providers -> src/core/providers.ts
/** ESM/CJS: dynamic import() of the WP3 entry, calling its factory with no args. IIFE: global.ts pre-registers eager loaders. */
export declare const BUILTIN_PROVIDERS: Readonly<
  Record<ProviderName, () => Promise<ProviderAdapter>>
>;
/** Lower-cases, maps aliases (osm, openstreetmap, googlemaps, google-maps); null for unknown. */
export declare function normalizeProviderName(name: string): ProviderName | null;
/** Adapter objects are returned synchronously (enables sync mount); names load lazily. */
export declare function loadProvider(
  spec: ProviderName | ProviderAdapter,
): ProviderAdapter | Promise<ProviderAdapter>;
/** GEOCODER_MISMATCH when `geocoder.pairsWith` excludes `providerName`; else null. */
export declare function checkPairing(
  geocoder: Geocoder,
  providerName: string,
): LocationPickerError | null;
/** config.geocoder (false -> null) ?? adapter.geocoder (object, or factory called once per mount). Pairing is checked here. */
export declare function resolveGeocoder(
  adapter: ProviderAdapter,
  config: ResolvedConfig,
  ctx: MountContext,
  handle: MapHandle,
): Promise<Geocoder | null>;

// §12.5  src/search/combobox.ts  (WP3; lazy chunk loaded by PickerCore when search is on and the adapter has no createSearch)
// module lp-internal/search -> src/search/combobox.ts
export interface ComboboxOptions {
  /** Effective debounce (PickerCore enforces >= 300 for photon.komoot.io). */
  readonly debounce: number;
  readonly minChars: number;
  readonly limit: number;
  readonly messages: Messages;
  /** Called once per failure burst with GEOCODER_FAILED. */
  readonly onError: (error: LocationPickerError) => void;
}
/** Renders the WAI-ARIA combobox into ctx.slot; coordinate text -> offline "Go to …" option; ctx.select() on pick. Contains its own input/change events. */
export declare function createCombobox(
  ctx: SearchContext,
  geocoder: Geocoder,
  options: ComboboxOptions,
): SearchHandle;

// §12.6  Test fixtures (owners: fake-adapter WP2; google/photon mocks WP3; routes WP5)
// module lp-test/fake-adapter -> test/fixtures/fake-adapter.ts
export interface FakeMap {
  center: LatLng;
  zoom: number;
  interactive: 'full' | 'zoom-only' | 'none';
  destroyed: boolean;
  readonly container: HTMLElement;
}
export interface FakeAdapterOptions {
  /** Mount synchronously (no load step). @default true */
  readonly sync?: boolean;
  readonly loadDelayMs?: number;
  /** Make load() reject with this code. */
  readonly failWith?: LocationPickerErrorCode;
  readonly drawsMarker?: boolean;
  readonly geocoder?: Geocoder;
  /** @default 'fake' */
  readonly name?: string;
}
export interface FakeAdapterControl {
  readonly adapter: ProviderAdapter<FakeMap>;
  readonly handle: MapHandle<FakeMap> | undefined;
  readonly mountCount: number;
  /** interactionStart, `steps` move() calls (one per animation frame), moveEnd, interactionEnd. */
  userPan(to: LatLng, options?: { readonly steps?: number }): Promise<void>;
  /** Zoom gesture: centre unchanged; moveEnd fires. */
  userZoom(delta: number): Promise<void>;
}
export declare function createFakeAdapter(options?: FakeAdapterOptions): FakeAdapterControl;
// module lp-test/google-maps-mock -> test/fixtures/google-maps-mock.ts
export interface GoogleMockOptions {
  /** 'classic' = google.maps.Map present synchronously (v1 pages); 'importLibrary' = bootstrap-style; 'none' = nothing installed until the inline bootstrap URL is requested. */
  readonly mode: 'classic' | 'importLibrary' | 'none';
  readonly failAuth?: boolean;
  readonly placesFail?: boolean;
}
export interface GoogleMapsMock {
  readonly stats: {
    readonly mapInstances: readonly unknown[];
    readonly placeAutocompleteCtorCalls: number;
    /** MUST stay 0: legacy places.Autocomplete is never used. */
    readonly legacyAutocompleteCtorCalls: number;
    readonly fetchFieldsCalls: readonly (readonly string[])[];
    readonly geocoderRequests: readonly unknown[];
    readonly importedLibraries: readonly string[];
    readonly bootstrapParams: readonly URLSearchParams[];
    readonly setZoomCalls: readonly number[];
  };
  /** Fires dragstart, center_changed…, dragend, idle as a real user drag would. */
  simulateUserPan(map: unknown, to: LatLng): void;
  /** Dispatches gmp-select on the live PlaceAutocompleteElement. */
  selectPlace(place: {
    readonly lat: number;
    readonly lng: number;
    readonly formattedAddress: string;
    readonly id?: string;
  }): Promise<void>;
  triggerAuthFailure(): void;
  uninstall(): void;
}
/** Also built as a standalone script (e2e/fixtures/google-maps-mock.js?mode=classic) for Playwright pages and v1 fixtures. */
export declare function installGoogleMapsMock(
  win: typeof globalThis,
  options: GoogleMockOptions,
): GoogleMapsMock;
// module lp-test/photon-mock -> test/fixtures/photon-mock.ts
/** Canned Photon GeoJSON for /api?q= and /reverse?lat=&lon= (Eiffel Tower, Beirut, Tripoli, Sydney, an empty result, an error). */
export declare function photonResponse(url: URL): Response | null;
export declare const PHOTON_QUERIES: readonly string[];
// module lp-test/routes -> test/fixtures/routes.ts
/** Structural subset of Playwright Page/BrowserContext and the vitest-browser equivalent. */
export interface RouteTarget {
  route(
    url: string | RegExp,
    handler: (route: {
      fulfill(r: {
        status?: number;
        body?: string | Uint8Array;
        contentType?: string;
        path?: string;
      }): Promise<void>;
      abort(reason?: string): Promise<void>;
      request(): { url(): string };
    }) => unknown,
  ): Promise<void>;
}
export interface RouteOptions {
  readonly leaflet?: 'ok' | 'fail' | 'slow';
  readonly tiles?: 'ok' | 'fail';
  readonly photon?: 'ok' | 'fail' | 'slow';
  readonly google?: 'classic' | 'importLibrary' | 'none';
  /** What https://cdn.jsdelivr.net/npm/location-picker@3 serves: the local dist IIFE. */
  readonly library?: 'iife';
}
/**
 * jsDelivr leaflet@1.9.4/* -> node_modules/leaflet/dist (bytes match SRI; served with `Access-Control-Allow-Origin: *`
 * like the real CDN, so SRI + crossorigin pass); tile.openstreetmap.org -> tile.png;
 * photon.komoot.io -> photon-mock; maps.googleapis.com -> google mock script; location-picker@3 -> dist IIFE;
 * EVERY other non-localhost request is aborted and recorded as a test failure.
 */
export declare function installRoutes(target: RouteTarget, options?: RouteOptions): Promise<void>;
export declare const ALLOWED_EXTERNAL_PATTERNS: readonly RegExp[];

// §12.8  compat.json (WP5 writes; WP6 renders; WP7 links)
// module lp-internal/compat-report -> compat/compat.json, validated by scripts/compat-report.mjs
export interface CompatEnvironment {
  /** Stable id, e.g. "webkit-iphone15-390x844-dpr3-touch". */
  readonly id: string;
  readonly browser: 'chromium' | 'firefox' | 'webkit';
  readonly browserVersion: string;
  readonly device: string | null;
  readonly viewport: { readonly width: number; readonly height: number };
  readonly dpr: 1 | 2 | 3;
  readonly input: 'mouse' | 'touch' | 'keyboard';
  readonly emulated: true;
}
export interface CompatScenario {
  /** e.g. "form-submit", "hidden-then-shown", "strict-csp", "geolocation-denied". */
  readonly id: string;
  readonly title: string;
  readonly tags: readonly string[];
  readonly ownerWp: 'WP1' | 'WP2' | 'WP3' | 'WP4' | 'WP6';
}
export interface CompatResult {
  readonly env: string;
  readonly scenario: string;
  readonly status: 'pass' | 'fail' | 'skip';
  readonly durationMs: number;
  readonly screenshot?: string;
  readonly note?: string;
}
export interface CompatReport {
  readonly schema: 1;
  readonly generatedAt: string;
  readonly packageVersion: string;
  readonly commit: string;
  readonly tools: { readonly playwright: string; readonly node: string };
  readonly environments: readonly CompatEnvironment[];
  readonly scenarios: readonly CompatScenario[];
  readonly results: readonly CompatResult[];
  /** Always includes "Real iOS/Android hardware (emulation only)". */
  readonly notCovered: readonly string[];
}

// §12.9  src/element/attributes.ts  (WP4)
// module lp-internal/attributes -> src/element/attributes.ts
export interface AttributeSpec {
  /** kebab-case attribute. */
  readonly attr: string;
  /** hyphen-less alias, when attr has a hyphen. */
  readonly alias?: string;
  /** Element property (R3; `locate` -> `locateMode` is the single exception). */
  readonly prop: string;
  readonly kind: 'string' | 'boolean' | 'number' | 'enum' | 'latlng';
  readonly values?: readonly string[];
  /** The class option this maps to; undefined for element-only (name, lat-name, required, …). */
  readonly option?: keyof LocationPickerOptions<unknown>;
  readonly reflect: boolean;
  readonly effect: 'live' | 'remount' | 'connect-only' | 'form' | 'default-value';
}
export declare const ATTRIBUTES: readonly AttributeSpec[];
/** Near-miss attribute -> warning text naming the right one (§3.11). */
export declare const WRONG_GUESS_ATTRIBUTES: Readonly<Record<string, string>>;
/** Properties re-applied on upgrade (§3.2 property upgrade), including the `locate` and `form` accessors. */
export declare const UPGRADE_PROPERTIES: readonly string[];
