// location-picker/core: the side-effect-free class entry (CONTRACT §2). The public types live here, verbatim from
// api.d.ts; the implementations live in ./core/. Values come from the implementation modules, never through another
// public entry (AMENDMENTS A9), so every built entry exports exactly the api.d.ts names.
export type {
  CoordinateFormat,
  FormatLatLngOptions,
  LatLng,
  LatLngInput,
  ParsedLatLng,
} from './utils.js';
export { parseLatLng } from './utils/parse.js';
export { formatLatLng } from './utils/format.js';
export { isLatLng, normalizeLatLng } from './utils/normalize.js';
import type { LatLng, LatLngInput } from './utils.js';

export { version } from './core/version.js';
export { LocationPicker, LocationPicker as default } from './core/location-picker.js';

/** Built-in map providers. Aliases `"osm"`/`"openstreetmap"` -> `leaflet`, `"googlemaps"`/`"google-maps"` -> `google` are accepted with a warning. */
export type ProviderName = 'leaflet' | 'google' | 'maplibre';
/** What caused a committed change. Method calls (`setLocation()`) and WebMCP report `"api"`. */
export type ChangeSource = 'user' | 'api' | 'geolocation' | 'search';
/** Locate-me control. `"button"`: a button that prompts only on click (hidden without a secure context). `"auto"`: also try once on load when no value is set (PROMPTS for permission). */
export type LocateMode = 'off' | 'button' | 'auto';
/** Centre marker. `"none"` hides it (issue #9). `"advanced"` = Google AdvancedMarkerElement (Google only; needs `mapId`). */
export type MarkerMode = 'pin' | 'none' | 'advanced';
/**
 * Gesture policy. `"auto"`: Google's own auto; on Leaflet/MapLibre it is `"cooperative"` (Ctrl/⌘ + wheel to zoom,
 * with a hint) when the page itself scrolls at mount time, otherwise `"greedy"`. `"none"`: no gestures (buttons/keys only).
 */
export type GestureHandling = 'auto' | 'cooperative' | 'greedy' | 'none';
/** An input to write into: an element, an id (tried first) or a CSS selector, resolved in the picker's root node. */
export type InputRef = string | HTMLInputElement | HTMLTextAreaElement;

/** Axis-aligned bounds, lat-first. `west > east` means the box crosses the antimeridian. */
export interface Bounds {
  south: number;
  west: number;
  north: number;
  east: number;
}

/**
 * Detail of `input` and `change`. `lat`, `lng` and `value` are always consistent:
 * `parseLatLng(value)` deep-equals `{ lat, lng }` (all rounded to `precision`).
 * @example picker.addEventListener('change', (e) => save(e.detail.lat, e.detail.lng, e.detail.address));
 */
export interface LocationDetail extends LatLng {
  /** Canonical form value. @example "48.85837,2.294481" */
  value: string;
  /** What caused the change. @example "user" */
  source: ChangeSource;
  /** Zoom at the time of the event. @example 15 */
  zoom: number;
  /** Address when known at commit time (search pick, cached reverse result); otherwise null. See `addresschange`. @default null */
  address: string | null;
  /** Metres; present only for `source === "geolocation"`. @default undefined */
  accuracy?: number;
  /** The search result that produced this value; present only for `source === "search"`. @default undefined */
  place?: GeocodeResult;
}

/** Detail of `addresschange`: the address for the CURRENT value resolved (stale results are dropped). */
export interface AddressDetail extends LatLng {
  /** The value the address belongs to. @example "48.85837,2.294481" */
  value: string;
  /** null when the lookup failed or found nothing. @example "Champ de Mars, 75007 Paris, France" */
  address: string | null;
  /** The raw result, or null. */
  result: GeocodeResult | null;
}

/** Detail of `ready`. */
export interface ReadyDetail<TMap = unknown> {
  /** Resolved provider name. @example "leaflet" */
  provider: string;
  /** The engine map instance (L.Map, google.maps.Map, maplibregl.Map). */
  map: TMap;
}

/**
 * Events dispatched by `LocationPicker` (on the instance) and `<location-picker>` (on the element).
 * | event | bubbles | composed | cancelable | fires |
 * |---|---|---|---|---|
 * | input | yes | yes | no | live during a user gesture (at most once per animation frame, source "user"); once with the final value right before EVERY `change`; and at the end of a gesture whenever the final value differs from the last emitted `input`, even when `change` is de-duplicated away |
 * | change | yes | no | no | committed: end of a user pan/keyboard move, Enter/confirm, search pick, geolocation, and METHOD calls (`setLocation`, `locate`, WebMCP). Never for property writes, form reset or restore. De-duplicated on the rounded value. |
 * | addresschange | yes | yes | no | address for the current value resolved (reverse geocode or search pick) |
 * | ready | no | no | no | engine map mounted (again after each remount); always async |
 * | error | no | no | YES | async failure; if no listener calls `preventDefault()` (and no `onError`), it is logged with its fix |
 */
export interface LocationPickerEventMap<TMap = unknown> {
  input: CustomEvent<LocationDetail>;
  change: CustomEvent<LocationDetail>;
  addresschange: CustomEvent<AddressDetail>;
  ready: CustomEvent<ReadyDetail<TMap>>;
  error: CustomEvent<LocationPickerError>;
}

// ---------------------------------------------------------------------------------------------------------------
// Geocoding
// ---------------------------------------------------------------------------------------------------------------

/** One geocoder result. @example { lat: 48.8584, lng: 2.2945, label: 'Eiffel Tower', address: 'Avenue Anatole France, 75007 Paris, France' } */
export interface GeocodeResult extends LatLng {
  /** Display text for the result list. @example "Eiffel Tower" */
  label: string;
  /** Postal-style one-line address when known. @default undefined */
  address?: string;
  /** Extent to fit when picked (areas); the pin still lands on `lat`/`lng`. @default undefined */
  bounds?: Bounds;
  /** Provider id (Photon osm_id, Google place id). @default undefined */
  id?: string;
  /** Untouched provider payload (Photon GeoJSON Feature, google.maps.places.Place, google.maps.GeocoderResult). */
  raw?: unknown;
}

/** Context passed to {@link Geocoder.search}. */
export interface GeocodeSearchOptions {
  /** Aborted when a newer query starts or the picker is destroyed. */
  signal: AbortSignal;
  /** Current map centre, for result bias. */
  near: LatLng;
  /** Maximum results wanted. @default 5 */
  limit: number;
  /** BCP 47 language tag. @example "fr" */
  lang: string;
}

/** Context passed to {@link Geocoder.reverse}. */
export interface GeocodeReverseOptions {
  signal: AbortSignal;
  lang: string;
  /** Current zoom (lets a geocoder pick street vs city granularity). */
  zoom: number;
}

/**
 * A geocoder. Implement either method or both; a missing method disables that feature.
 * Pairing rule (Google Maps Platform ToS §3.2.3(e)): a geocoder whose `pairsWith` excludes the active provider is
 * refused with `GEOCODER_MISMATCH` and search is disabled. A custom geocoder without `pairsWith` works with every
 * provider; YOU are responsible for its terms (never show non-Google results on a Google map).
 * @example const geocoder: Geocoder = { search: async (q, { signal }) => (await fetch(`/geo?q=${encodeURIComponent(q)}`, { signal })).json() };
 */
export interface Geocoder {
  /** Providers whose maps may display these results. @default undefined (any) @example ['leaflet', 'maplibre'] */
  readonly pairsWith?: readonly string[];
  /** Forward geocoding for the search box and `geocode()`. */
  search?(query: string, options: GeocodeSearchOptions): Promise<GeocodeResult[]>;
  /** Reverse geocoding for `reverseGeocode` and `lookupAddress()`. */
  reverse?(at: LatLng, options: GeocodeReverseOptions): Promise<GeocodeResult | null>;
  /** Extra attribution HTML appended to the map attribution while this geocoder is active. @default undefined */
  readonly attribution?: string;
}

/** Shorthand: a bare function acts as {@link Geocoder.search}. @example geocoder: (q, { signal }) => myApi.search(q, signal) */
export type GeocodeFn = (query: string, options: GeocodeSearchOptions) => Promise<GeocodeResult[]>;

// ---------------------------------------------------------------------------------------------------------------
// UI text
// ---------------------------------------------------------------------------------------------------------------

/** UI strings. English is built in; override any subset with `messages`. Form values are never localised. */
export interface Messages {
  /** Accessible name when no `<label>`/`aria-label` exists. @default "Location picker" */
  label: string;
  /** @default "map" */
  roleDescription: string;
  /** Screen-reader help for the map region. @default "Drag the map or use the arrow keys to move the pin; plus and minus zoom. Press Enter to choose the point under the pin." */
  instructions: string;
  /** Confirm button shown while unset when a `center` was given; in field mode, the sheet's Confirm button. @default "Use this location" */
  confirm: string;
  /** Locate button label. @default "Use my location" */
  locate: string;
  /** @default "Finding your location…" */
  locating: string;
  /** Accessible label of the search box. @default "Search for a place or paste coordinates" */
  searchLabel: string;
  /** @default "Search or paste coordinates" */
  searchPlaceholder: string;
  /** @default "No results" */
  noResults: string;
  /** Offline option shown when the query parses as coordinates. @default (coords) => `Go to ${coords}` */
  goTo: (coords: string) => string;
  /** Live-region text after a commit (polite, 700 ms debounce; never during panning). @default (d) => `Location set: ${d.lat.toFixed(5)}, ${d.lng.toFixed(5)}${d.address ? '. ' + d.address : ''}` */
  announce: (detail: LocationDetail) => string;
  /** Validation message for `required`. @default "Please choose a location on the map." */
  valueMissing: string;
  /** @default "Location permission was denied." */
  geolocationDenied: string;
  /** @default "Your location is unavailable." */
  geolocationUnavailable: string;
  /** @default "Finding your location took too long." */
  geolocationTimeout: string;
  /** @default "Location needs HTTPS and a browser that supports it." */
  geolocationUnsupported: string;
  /** Cooperative-gesture hint. @default "Use Ctrl + scroll to zoom the map" ("⌘ + scroll" on Apple platforms) */
  cooperativeHint: string;
  /** Shown when the engine fails to load. @default "The map could not be loaded. Type coordinates instead." */
  loadError: string;
  /** Label of the fallback coordinate input shown after a load failure. @default "Latitude, longitude" */
  fallbackLabel: string;
  /** Field mode: the button that opens the map sheet. @default "Choose on map" */
  chooseOnMap: string;
  /** Field mode: the field text while no location is chosen. @default "No location selected" */
  fieldPlaceholder: string;
  /** Field mode: the sheet's Cancel button. @default "Cancel" */
  cancel: string;
}

// ---------------------------------------------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------------------------------------------

export { LocationPickerError, type LocationPickerErrorCode } from './core/errors.js';
import type { LocationPickerError } from './core/errors.js';

// ---------------------------------------------------------------------------------------------------------------
// Class options and methods
// ---------------------------------------------------------------------------------------------------------------

/** Options for {@link LocationPicker.setLocation}. */
export interface SetLocationOptions {
  /** Also set the zoom. @default current zoom */
  zoom?: number;
  /** Animate the move. Ignored under prefers-reduced-motion. @default false */
  animate?: boolean;
}

/** Options for {@link LocationPicker.locate}. Defaults merge over the picker's `geolocation` option. */
export interface LocateOptions extends PositionOptions {
  /** Aborting rejects with `ABORTED` and leaves the value unchanged. */
  signal?: AbortSignal;
}

/** Options for {@link LocationPicker.geocode} and {@link LocationPicker.lookupAddress}. */
export interface GeocodeOptions {
  signal?: AbortSignal;
  /** @default 5 */
  limit?: number;
}

/**
 * Options for `new LocationPicker(target, options)`. Every key also exists on `<location-picker>` as a property and
 * (for primitives) a kebab-case attribute, except: callbacks, `injectStyles`, `signal`, deprecated keys.
 * Unknown keys log a warning that lists the valid keys.
 */
export interface LocationPickerOptions<TMap = unknown> {
  /**
   * Map provider: a built-in name (its adapter is lazy-loaded) or an adapter object from
   * `location-picker/leaflet` | `/google` | `/maplibre` (statically imported; enables synchronous `.map`).
   * Resolution when omitted: `apiKey`, `mapId`, `marker: 'advanced'`, `useAdvancedMarker` or a 3rd constructor
   * argument select `'google'`; otherwise `'leaflet'`. A loaded `google.maps` global is NEVER sniffed (it only
   * triggers a one-time console.info hint).
   * @default 'leaflet'
   * @example { provider: 'google', apiKey: 'AIza…' }
   */
  provider?: ProviderName | ProviderAdapter<TMap>;
  /**
   * Initial committed value. `null` = unset (form value ""). Lenient: any {@link LatLngInput}. A string that does not
   * parse logs `INVALID_VALUE` and leaves the value unset; an object is normalised (latitude clamped with a warning).
   * @default null
   * @example { value: '48.8584,2.2945' }
   */
  value?: LatLngInput | null;
  /** Where the view starts while the value is unset. Never becomes the value by itself. @default { lat: 20, lng: 0 } (world view) @example { center: '33.8938,35.5018' } */
  center?: LatLngInput;
  /** Initial zoom. @default 15 when `value` or `center` is given, else 2 @example { zoom: 12 } */
  zoom?: number;
  /** Maximum zoom. @default 19 (OSM tiles); the engine's own maximum for Google/MapLibre */
  maxZoom?: number;
  /** Decimal places of the committed value (6 is about 0.11 m). @default 6 @example { precision: 5 } */
  precision?: number;
  /** No interaction at all; controls disabled. @default false */
  disabled?: boolean;
  /** View-only: zoom allowed, the value cannot change (no pan, search or locate). @default false */
  readOnly?: boolean;
  /** Centre marker; an element replaces the SVG (anchored by its bottom-centre). @default 'pin' @example { marker: 'none' } */
  marker?: MarkerMode | HTMLElement;
  /** @default 'auto' @example { gestureHandling: 'greedy' } */
  gestureHandling?: GestureHandling;
  /** Locate-me control. `true` = `"button"`, `false` = `"off"`. Never prompts on load unless `"auto"`. @default 'off' @example { locate: 'button' } */
  locate?: LocateMode | boolean;
  /** Passed to navigator.geolocation. A watchdog also rejects with GEOLOCATION_TIMEOUT after `timeout + 30000` ms (covers an unanswered permission prompt). @default { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 } */
  geolocation?: PositionOptions;
  /** Search box (Photon for Leaflet/MapLibre, Google PlaceAutocompleteElement for Google). Typed or pasted coordinates jump directly with no network call. @default false @example { search: true } */
  search?: boolean;
  /** Search box placeholder. @default messages.searchPlaceholder */
  placeholder?: string;
  /** Reverse-geocode each committed value (debounced 400 ms, cached), firing `addresschange`. @default false */
  reverseGeocode?: boolean;
  /** Replace the provider's paired geocoder; `false` disables geocoding entirely. @default the provider's pair (Photon / Google) @example { geocoder: photonGeocoder({ url: 'https://photon.example.org/api' }) } */
  geocoder?: Geocoder | GeocodeFn | false;
  /**
   * Existing input that receives the rounded latitude and seeds the initial value. It mirrors the picker's events:
   * native `input` for live changes, `input` + `change` on commits, nothing for silent writes (property writes,
   * reset, restore). Its events are dispatched BEFORE the picker's own `input`/`change`. They bubble, except on an
   * input inside a `<location-picker>` ELEMENT (progressive enhancement), where they are non-bubbling so the host only
   * ever sees its own CustomEvents (class mode always bubbles: its events go to the instance, not the DOM). Listeners on the input itself (Livewire `wire:model`, Alpine `x-model`, jQuery) still fire.
   * @example { latInput: '#lat' }
   */
  latInput?: InputRef;
  /** Same as `latInput`, for longitude. @example { lngInput: '#lng' } */
  lngInput?: InputRef;
  /** Receives the canonical `"lat,lng"` string. @example { valueInput: '#location' } */
  valueInput?: InputRef;
  /** Receives the address ("" while unknown). Needs `search` or `reverseGeocode`. @example { addressInput: '#address' } */
  addressInput?: InputRef;
  /** UI text overrides. @default English @example { messages: { locate: 'Ma position' } } */
  messages?: Partial<Messages>;
  /** BCP 47 language for UI, Photon `lang` (when supported) and Google `language`. @default closest [lang], then navigator.language */
  lang?: string;
  /** Adopt the picker CSS into the target's root node (adoptedStyleSheets; `<style nonce>` fallback). `false` + `import 'location-picker/style.css'` for strict CSP. @default true */
  injectStyles?: boolean;
  /** CSP nonce for any `<script>`, `<link>` or `<style>` the library inserts. @default nonce of the document's first `script[nonce]` */
  nonce?: string;
  /**
   * Register WebMCP tools (experimental; no-op when unsupported). In 3.0 the `LocationPicker` class does not act on it yet
   * (planned for 3.1): call `registerWebMcpTools(picker)` from `location-picker/webmcp`. The element's `webmcp` attribute
   * works. @default false
   */
  webmcp?: boolean;
  /** Aborting it calls `destroy()`. */
  signal?: AbortSignal;

  // ---- provider options (string providers; adapter factories accept the same keys and win over these) ----
  /** Google browser key (restrict by HTTP referrer). Injects Google's official inline bootstrap if google.maps is absent. Selects `provider: 'google'` when `provider` is omitted. */
  apiKey?: string;
  /** Google map ID; needed only for `marker: 'advanced'`. Selects `'google'` when `provider` is omitted. */
  mapId?: string;
  /** Leaflet raster tile URL template, or (MapLibre) an XYZ template wrapped into a raster style. Use your own/commercial tiles in production. @default 'https://tile.openstreetmap.org/{z}/{x}/{y}.png' */
  tileUrl?: string;
  /** Attribution HTML, always visible. Forced to the OSM credit while `tileUrl` is the default; a custom `tileUrl` without it logs a warning. @default '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' */
  attribution?: string;
  /** MapLibre style URL or object. @default 'https://tiles.openfreemap.org/styles/liberty' */
  mapStyle?: string | object;
  /** Engine namespace you already have (`L` from 'leaflet', `maplibregl`, `google.maps`). @default globalThis.L / globalThis.maplibregl / globalThis.google.maps */
  engine?: object;
  /** Engine JS to auto-load when the engine is absent; `false` = never load (ENGINE_MISSING instead). SRI is applied only to the pinned default. MapLibre: an ESM URL loaded with import(), opt-in, no default. Ignored by Google. @default pinned jsDelivr leaflet@1.9.4 (Leaflet); none (MapLibre) */
  engineUrl?: string | false;
  /** Engine CSS URL; `false` = you provide it (document CSS is copied into shadow roots when readable). MapLibre never fetches CSS unless this is a URL. @default see CONTRACT.md §4.3 resolution order */
  engineCssUrl?: string | false;
  /** Passed to the engine's map constructor; wins over library defaults. @default {} @example { mapOptions: { mapTypeId: 'hybrid' } } */
  mapOptions?: Record<string, unknown>;

  // ---- callbacks: on + EventName; each receives the event detail ----
  /** Same as `addEventListener('input')`, receives `detail`. */
  onInput?: (detail: LocationDetail) => void;
  /** Same as `addEventListener('change')`, receives `detail`. @example { onChange: ({ lat, lng, source }) => save(lat, lng) } */
  onChange?: (detail: LocationDetail) => void;
  /** Same as `addEventListener('addresschange')`. */
  onAddressChange?: (detail: AddressDetail) => void;
  /** Same as `addEventListener('ready')`. (A method signature, so a picker typed for one map engine stays assignable to `LocationPicker`.) */
  onReady?(detail: ReadyDetail<TMap>): void;
  /** Same as `addEventListener('error')`. Its presence marks errors as handled (they are not logged). */
  onError?: (error: LocationPickerError) => void;

  // ---- deprecated v1/v2 keys (still honoured) ----
  /**
   * @deprecated v2. Called like `onChange` (de-duplicated; the detail is a superset of LatLng). Like v2, it is also
   * called ONCE after `ready` with the current value (source `"api"`), but only when a value is set: an unset picker
   * has no position to report.
   */
  onLocationChange?: (detail: LocationDetail) => void;
  /** @deprecated v1/v2. Use `value`. Used only when both `lat` and `lng` are finite; 0 is valid; latitude is clamped into [-90, 90] with a warning. NOT a provider signal. */
  lat?: number;
  /** @deprecated v1/v2. Use `value`. */
  lng?: number;
  /** @deprecated v1/v2. `true` -> `locate: 'auto'`. The v1 default was true; v3 default is `'off'`. */
  setCurrentPosition?: boolean;
  /** @deprecated v2. -> `marker: 'advanced'` (Google only; needs `mapId`). Selects `'google'` when `provider` is omitted. */
  useAdvancedMarker?: boolean;
}

// ---------------------------------------------------------------------------------------------------------------
// Provider adapter contract (public: lets anyone plug in another engine, e.g. OpenLayers)
// ---------------------------------------------------------------------------------------------------------------

/** Engine -> core notifications. Adapters MUST call these from engine events; the core does rounding, normalisation, de-duplication and source attribution. */
export interface MapEvents {
  /** Centre moved for any reason (Leaflet/MapLibre `move`, Google `center_changed`). Raw centre is fine. */
  move(center: LatLng): void;
  /** Camera settled (Leaflet/MapLibre `moveend`, Google `idle`). */
  moveEnd(center: LatLng, zoom: number): void;
  /** A user gesture began (pointerdown, wheel, key). Marks the next commit as source "user". */
  interactionStart(): void;
  /** The gesture ended (drives `:state(dragging)` and the pin lift). */
  interactionEnd(): void;
}

/** Resolved provider-relevant options handed to adapters (factory options win over these). */
export interface ProviderMountOptions {
  readonly apiKey?: string;
  readonly mapId?: string;
  readonly tileUrl?: string;
  readonly attribution?: string;
  readonly mapStyle?: string | object;
  readonly engine?: object;
  readonly engineUrl?: string | false;
  readonly engineCssUrl?: string | false;
  readonly mapOptions: Readonly<Record<string, unknown>>;
  readonly maxZoom?: number;
  readonly marker: MarkerMode | 'element';
  readonly search: boolean;
}

/** Everything an adapter may use. Adapters never write outside `container` (LOCKED 5). */
export interface MountContext {
  /** Empty div owned by location-picker and sized by the host. Create the map inside it; never touch its siblings. */
  readonly container: HTMLElement;
  /** Where engine CSS must go: the Document (class) or the element's ShadowRoot. */
  readonly root: Document | ShadowRoot;
  /** Initial camera. */
  readonly view: { readonly center: LatLng; readonly zoom: number };
  /** As configured. Leaflet/MapLibre resolve `"auto"` with `pageScrolls`; Google passes it through natively. */
  readonly gestureHandling: GestureHandling;
  /** True when the document itself scrolls at mount time (`auto` then means cooperative on Leaflet/MapLibre). */
  readonly pageScrolls: boolean;
  /** `"full"` pan+zoom, `"zoom-only"` (readOnly), `"none"` (disabled). */
  readonly interactive: 'full' | 'zoom-only' | 'none';
  /** BCP 47. */
  readonly lang: string;
  /** From the host's computed CSS `color-scheme`. */
  readonly colorScheme: 'light' | 'dark' | 'auto';
  readonly options: ProviderMountOptions;
  /** Aborted on destroy or remount. */
  readonly signal: AbortSignal;
  readonly events: MapEvents;
  /** CSP nonce to put on inserted elements, if any. */
  readonly nonce: string | undefined;
  /** Inserts a classic `<script>` once per URL per document (nonce, crossorigin="anonymous", optional SRI); resolves on load, rejects with ENGINE_LOAD_FAILED. */
  loadScript(src: string, integrity?: string): Promise<void>;
  /**
   * Adds `<link rel=stylesheet>` to `root` once per URL, with the nonce, and with `crossorigin="anonymous"` whenever
   * `integrity` is given (SRI requires CORS; without it the browser blocks the sheet). A custom URL without
   * `integrity` gets no `crossorigin`, so CDNs that send no CORS headers still work. Never rejects: resolves on
   * `load`, on `error` or after 3000 ms; the caller then verifies the engine CSS (ENGINE_CSS_MISSING). Mount never
   * waits for it.
   */
  loadStylesheet(href: string, integrity?: string): Promise<void>;
  /**
   * Copies rules whose selectors match `selectorTest` from readable document stylesheets into a constructed sheet
   * adopted by `root` (no-op for a Document root). Resolves to the number of rules copied (0 if none/unreadable).
   */
  adoptDocumentRules(selectorTest: RegExp): Promise<number>;
  /** Shows a transient hint over the map (cooperative gestures). */
  showHint(text: string): void;
  /** Reports a non-fatal or post-mount failure (e.g. Google auth failure) through the `error` event. */
  report(error: LocationPickerError): void;
}

/** Live handle to a mounted map. */
export interface MapHandle<TMap = unknown> {
  readonly map: TMap;
  /** Raw centre; the core normalises. */
  getCenter(): LatLng;
  getZoom(): number;
  /** Must not report a user interaction. */
  setView(center: LatLng, zoom: number | undefined, options: { animate: boolean }): void;
  /** Zoom anchored at the centre (never moves the centre). */
  setZoom(zoom: number): void;
  setInteractive(mode: 'full' | 'zoom-only' | 'none'): void;
  /** Called by the core's ResizeObserver (also after initialising while hidden). */
  resize(): void;
  /** True when the adapter draws the marker itself (Google AdvancedMarkerElement); the core then hides its CSS pin. @default false */
  readonly drawsMarker?: boolean;
  /** `"core"`: the core labels the container `role=application`. `"engine"`: the engine renders its own accessible region (Google). @default 'core' */
  readonly a11y?: 'core' | 'engine';
  /** Release everything the adapter created (listeners, map). */
  destroy(): void;
}

/** Context for a provider-rendered search UI (Google). */
export interface SearchContext<TMap = unknown> extends MountContext {
  readonly handle: MapHandle<TMap>;
  /** Element to render into (part="search" / `.lp-search`). */
  readonly slot: HTMLElement;
  readonly placeholder: string;
  readonly label: string;
  /** Commit a result (source "search"; fires `input` then `change`). */
  select(result: GeocodeResult): void;
}

/** A mounted search UI. */
export interface SearchHandle {
  readonly element: HTMLElement;
  focus(): void;
  clear(): void;
  destroy(): void;
}

/**
 * A map engine adapter. Built-ins: `leafletProvider()`, `googleProvider()`, `maplibreProvider()`.
 * @example
 * // OpenLayers in ~20 lines (see CONTRACT.md §4.5)
 * const openlayers: ProviderAdapter<OlMap> = { name: 'openlayers', mount(ctx) { ...; return handle; } };
 * new LocationPicker('#map', { provider: openlayers });
 */
export interface ProviderAdapter<TMap = unknown> {
  /** Unique id; also the geocoder pairing key and `picker.provider`. @example "leaflet" */
  readonly name: string;
  /** Load the engine (idempotent, shared across pickers). Omit when the engine is always present. */
  load?(ctx: MountContext): Promise<void> | void;
  /** Create the map inside `ctx.container`. A synchronous return (engine present) makes `picker.map` available synchronously. */
  mount(ctx: MountContext): MapHandle<TMap> | Promise<MapHandle<TMap>>;
  /** Paired geocoder for `search`, `reverseGeocode`, `geocode()`, `lookupAddress()`. @default undefined (no geocoding unless `geocoder` is set) */
  // The factory is typed through a method signature so it is bivariant in TMap: a ProviderAdapter<LeafletMap> held in a
  // variable must stay assignable to ProviderAdapter<unknown> (options, `el.provider`, `LocationPicker` fields).
  geocoder?:
    | Geocoder
    | {
        factory(ctx: MountContext, handle: MapHandle<TMap>): Geocoder | Promise<Geocoder>;
      }['factory'];
  /** Provider-rendered search UI. Without it the built-in combobox over `geocoder.search` is used. */
  createSearch?(ctx: SearchContext<TMap>): SearchHandle | Promise<SearchHandle>;
}
