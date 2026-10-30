// CONTRACT §12.6 Google Maps mock (WP3). The parts of google.maps the adapter, the geocoder and the v1 file use, with
// recorded calls, in three loading modes:
// - 'classic': google.maps.Map and friends exist synchronously, no importLibrary (an old <script src=…/js?key> page);
// - 'importLibrary': only google.maps.importLibrary exists; each library attaches to the namespace once imported;
// - 'none': nothing until the inline bootstrap inserts its <script>; the mock takes that element instead of letting it
//   load, records its parameters, installs the 'importLibrary' API into the bootstrap's google.maps and calls back.
// The same code runs in jsdom, in the browser project and, bundled by emit-google-maps-mock.mjs, as the standalone
// e2e/fixtures/google-maps-mock.js that the route table serves for https://maps.googleapis.com/maps/api/js.
import type * as Contract from '../../src/internal/contracts.js';
import type { GoogleMapsMock, GoogleMockOptions } from '../../src/internal/contracts.js';
import type { LatLng as Point } from '../../src/utils.js';

export type { GoogleMapsMock, GoogleMockOptions };

type Handler = (...args: unknown[]) => void;
type Win = typeof globalThis;
interface Stats {
  mapInstances: MockMap[];
  placeAutocompleteCtorCalls: number;
  legacyAutocompleteCtorCalls: number;
  fetchFieldsCalls: string[][];
  geocoderRequests: Record<string, unknown>[];
  importedLibraries: string[];
  bootstrapParams: URLSearchParams[];
  setZoomCalls: number[];
}
interface State {
  readonly win: Win;
  readonly options: GoogleMockOptions;
  readonly stats: Stats;
  readonly autocompletes: HTMLElement[];
  /** The fetchFields() of the latest selection, for selectPlace() to await. */
  pending?: Promise<unknown>;
}
interface PlaceData {
  readonly lat: number;
  readonly lng: number;
  readonly formattedAddress: string;
  readonly id?: string;
}

const API = /^https:\/\/maps\.googleapis\.com\/maps\/api\/js/;
/** Known addresses for Geocoder.geocode({ address }). */
const ADDRESSES: Record<string, Point & { address: string }> = {
  'eiffel tower': {
    lat: 48.8584,
    lng: 2.2945,
    address: 'Champ de Mars, 5 Av. Anatole France, 75007 Paris, France',
  },
  beirut: { lat: 33.8938, lng: 35.5018, address: 'Beirut, Lebanon' },
};
/** What Geocoder.geocode({ location }) answers. */
export const googleAddressAt = ({ lat, lng }: Point): string =>
  `Google address at ${lat.toFixed(4)},${lng.toFixed(4)}`;

const later = (fn: () => void): void => void setTimeout(fn, 0);

class LatLng {
  readonly #lat: number;
  readonly #lng: number;
  constructor(lat: number | Point | LatLng, lng?: number) {
    if (lat instanceof LatLng) [this.#lat, this.#lng] = [lat.lat(), lat.lng()];
    else if (typeof lat == 'object') [this.#lat, this.#lng] = [Number(lat.lat), Number(lat.lng)];
    else [this.#lat, this.#lng] = [Number(lat), Number(lng)];
  }
  lat(): number {
    return this.#lat;
  }
  lng(): number {
    return this.#lng;
  }
  equals(other: LatLng | null): boolean {
    return !!other && other.lat() == this.#lat && other.lng() == this.#lng;
  }
  toJSON(): Point {
    return { lat: this.#lat, lng: this.#lng };
  }
}

class LatLngBounds {
  readonly #sw: LatLng;
  readonly #ne: LatLng;
  constructor(sw: Point | LatLng, ne: Point | LatLng) {
    this.#sw = new LatLng(sw);
    this.#ne = new LatLng(ne);
  }
  getSouthWest(): LatLng {
    return this.#sw;
  }
  getNorthEast(): LatLng {
    return this.#ne;
  }
  toJSON(): { south: number; west: number; north: number; east: number } {
    return {
      south: this.#sw.lat(),
      west: this.#sw.lng(),
      north: this.#ne.lat(),
      east: this.#ne.lng(),
    };
  }
}

const registry = new WeakMap<object, { name: string; handler: Handler }[]>();
const event = {
  addListener(instance: object, name: string, handler: Handler): { remove(): void } {
    const list = registry.get(instance) ?? [];
    registry.set(instance, list);
    const entry = { name, handler };
    list.push(entry);
    return {
      remove() {
        const at = list.indexOf(entry);
        if (at >= 0) list.splice(at, 1);
      },
    };
  },
  addListenerOnce(instance: object, name: string, handler: Handler): { remove(): void } {
    const listener = event.addListener(instance, name, (...args) => {
      listener.remove();
      handler(...args);
    });
    return listener;
  },
  removeListener(listener: { remove(): void }): void {
    listener.remove();
  },
  clearInstanceListeners(instance: object): void {
    registry.delete(instance);
  },
  trigger(instance: object, name: string, ...args: unknown[]): void {
    for (const entry of (registry.get(instance) ?? []).slice())
      if (entry.name == name) entry.handler.apply(instance, args);
  },
  /** Listeners currently registered on `instance` (tests check that destroy() removed them). */
  count(instance: object): number {
    return registry.get(instance)?.length ?? 0;
  },
};

const STATE = Symbol.for('location-picker:google-maps-mock');
const stateOf = (win: Win): State => {
  const state: State | undefined = Reflect.get(win, STATE);
  if (!state) throw new Error('[google-maps-mock] not installed');
  return state;
};

/** google.maps.Map: one inner div (like Google's), camera state, events, and a keyboard/wheel model of the engine. */
export class MockMap {
  readonly div: HTMLElement;
  /** Google's own map element inside `div`; wheel and key events that reach it are the engine's. */
  readonly inner: HTMLElement;
  /** Constructor options merged with every setOptions() call. */
  readonly options: Record<string, unknown>;
  /** Wheel events that reached the engine (D14 interception keeps this at 0 when it zooms itself). */
  wheelEvents = 0;
  #center: LatLng;
  #zoom: number;
  #idle: ReturnType<typeof setTimeout> | undefined;
  readonly #state: State;

  constructor(div: HTMLElement, options: Record<string, unknown> = {}) {
    this.#state = stateOf(div.ownerDocument.defaultView ?? globalThis);
    this.div = div;
    this.options = { ...options };
    this.#center = new LatLng((options.center as Point | undefined) ?? { lat: 0, lng: 0 });
    this.#zoom = Number(options.zoom ?? 0);
    const inner = (this.inner = div.ownerDocument.createElement('div'));
    inner.className = 'gm-style';
    inner.tabIndex = 0;
    inner.style.cssText = 'position:absolute;inset:0';
    div.append(inner);
    inner.addEventListener('wheel', (e) => this.#wheel(e));
    inner.addEventListener('keydown', (e) => this.#key(e));
    this.#state.stats.mapInstances.push(this);
    this.#scheduleIdle();
    if (this.#state.options.failAuth) later(() => this.#state.win.gm_authFailure?.());
  }

  getDiv(): HTMLElement {
    return this.div;
  }
  getCenter(): LatLng {
    return this.#center;
  }
  getZoom(): number {
    return this.#zoom;
  }
  get(key: string): unknown {
    return this.options[key];
  }
  setCenter(center: Point | LatLng): void {
    const next = new LatLng(center);
    if (next.equals(this.#center)) return;
    this.#center = next;
    event.trigger(this, 'center_changed');
    this.#scheduleIdle();
  }
  panTo(center: Point | LatLng): void {
    this.setCenter(center);
  }
  setZoom(zoom: number): void {
    this.#state.stats.setZoomCalls.push(zoom);
    if (zoom == this.#zoom) return;
    this.#zoom = zoom;
    event.trigger(this, 'zoom_changed');
    this.#scheduleIdle();
  }
  setOptions(options: Record<string, unknown>): void {
    Object.assign(this.options, options);
    if (options.center) this.setCenter(options.center as Point);
    if (typeof options.zoom == 'number') this.setZoom(options.zoom);
  }
  getBounds(): LatLngBounds {
    const { lat, lng } = this.#center.toJSON();
    const scale = (256 * 2 ** this.#zoom) / 360;
    const dLng = (this.div.clientWidth || 320) / scale / 2;
    const dLat = (this.div.clientHeight || 240) / scale / 2;
    return new LatLngBounds(
      { lat: lat - dLat, lng: lng - dLng },
      { lat: lat + dLat, lng: lng + dLng },
    );
  }
  addListener(name: string, handler: Handler): { remove(): void } {
    return event.addListener(this, name, handler);
  }

  /** dragstart, a few center_changed steps, dragend, then idle: what a user drag fires (synchronously here). */
  pan(to: Point): void {
    const from = this.#center.toJSON();
    event.trigger(this, 'dragstart');
    for (const step of [1, 2, 3]) {
      const t = step / 3;
      this.#center = new LatLng(
        from.lat + (to.lat - from.lat) * t,
        from.lng + (to.lng - from.lng) * t,
      );
      event.trigger(this, 'center_changed');
    }
    event.trigger(this, 'dragend');
    clearTimeout(this.#idle);
    event.trigger(this, 'idle');
  }

  #scheduleIdle(): void {
    clearTimeout(this.#idle);
    this.#idle = setTimeout(() => event.trigger(this, 'idle'), 0);
  }

  /** Google's own wheel zoom is anchored at the cursor, so it also moves the centre. */
  #wheel(e: WheelEvent): void {
    this.wheelEvents++;
    const gestures = this.options.gestureHandling;
    if (gestures == 'none' || (gestures != 'greedy' && !e.ctrlKey && !e.metaKey)) return;
    e.preventDefault();
    const { lat, lng } = this.#center.toJSON();
    this.setCenter({ lat: lat + 0.001, lng: lng + 0.001 });
    this.setZoom(this.#zoom + (e.deltaY < 0 ? 1 : -1));
  }

  /** keyboardShortcuts: arrows pan, +/- zoom (centre-anchored). */
  #key(e: KeyboardEvent): void {
    if (this.options.keyboardShortcuts === false) return;
    const { lat, lng } = this.#center.toJSON();
    const pan: Record<string, Point> = {
      ArrowUp: { lat: lat + 0.01, lng },
      ArrowDown: { lat: lat - 0.01, lng },
      ArrowLeft: { lat, lng: lng - 0.01 },
      ArrowRight: { lat, lng: lng + 0.01 },
    };
    const to = pan[e.key];
    if (to) this.setCenter(to);
    else if (e.key == '+' || e.key == '=') this.setZoom(this.#zoom + 1);
    else if (e.key == '-') this.setZoom(this.#zoom - 1);
  }
}

class Geocoder {
  readonly #state: State;
  constructor() {
    this.#state = stateOf(globalThis);
  }
  async geocode(request: { address?: string; location?: Point | LatLng }): Promise<{
    results: object[];
  }> {
    this.#state.stats.geocoderRequests.push({ ...request });
    await new Promise((resolve) => setTimeout(resolve, 0));
    const result = (at: Point, address: string, id: string): object => ({
      formatted_address: address,
      place_id: id,
      geometry: {
        location: new LatLng(at),
        viewport: new LatLngBounds(
          { lat: at.lat - 0.005, lng: at.lng - 0.005 },
          { lat: at.lat + 0.005, lng: at.lng + 0.005 },
        ),
      },
      address_components: [],
      types: [],
    });
    if (request.location) {
      const at = new LatLng(request.location).toJSON();
      return { results: [result(at, googleAddressAt(at), 'reverse-place-id')] };
    }
    const known = ADDRESSES[String(request.address).trim().toLowerCase()];
    // Like the promise form of the real API: ZERO_RESULTS rejects.
    if (!known) throw Object.assign(new Error('ZERO_RESULTS'), { code: 'ZERO_RESULTS' });
    return { results: [result(known, known.address, 'search-place-id')] };
  }
}

/** The places, marker and legacy classes; HTMLElement subclasses must come from the target window. */
function windowClasses(win: Win) {
  const cached: ReturnType<typeof build> | undefined = Reflect.get(win, `${String(STATE)}:classes`);
  if (cached) return cached;
  const classes = build();
  Reflect.set(win, `${String(STATE)}:classes`, classes);
  return classes;

  function build() {
    class Place {
      id: string;
      location: LatLng | null = null;
      formattedAddress: string | null = null;
      readonly #data: PlaceData | undefined;
      constructor(options: { id?: string } = {}, data?: PlaceData) {
        this.id = options.id ?? data?.id ?? 'mock-place';
        this.#data = data;
      }
      async fetchFields({ fields }: { fields: string[] }): Promise<{ place: Place }> {
        const state = stateOf(win);
        state.stats.fetchFieldsCalls.push([...fields]);
        await new Promise((resolve) => setTimeout(resolve, 0));
        if (state.options.placesFail) throw new Error('PlacesServiceStatus.REQUEST_DENIED');
        if (this.#data && fields.includes('location')) this.location = new LatLng(this.#data);
        if (this.#data && fields.includes('formattedAddress'))
          this.formattedAddress = this.#data.formattedAddress;
        return { place: this };
      }
    }

    /** <gmp-place-autocomplete>: an input in an open shadow root; options become properties. */
    class PlaceAutocompleteElement extends win.HTMLElement {
      readonly options: Record<string, unknown>;
      readonly input: HTMLInputElement;
      locationBias: unknown = null;
      constructor(options: Record<string, unknown> = {}) {
        super();
        const state = stateOf(win);
        state.stats.placeAutocompleteCtorCalls++;
        state.autocompletes.push(this);
        this.options = { ...options };
        Object.assign(this, options);
        const root = this.attachShadow({ mode: 'open' });
        this.input = win.document.createElement('input');
        this.input.setAttribute('role', 'combobox');
        this.input.setAttribute(
          'aria-label',
          typeof options.description == 'string' ? options.description : 'Search',
        );
        root.append(this.input);
      }
      get value(): string {
        return this.input.value;
      }
      set value(value: string | null) {
        this.input.value = value ?? '';
      }
      override focus(): void {
        this.input.focus();
      }
    }

    /** <gmp-advanced-marker>: shown inside the map's div while `map` is set. */
    class AdvancedMarkerElement extends win.HTMLElement {
      position: unknown;
      #map: MockMap | null = null;
      constructor(options: { map?: MockMap | null; position?: unknown } = {}) {
        super();
        this.position = options.position;
        this.map = options.map ?? null;
      }
      get map(): MockMap | null {
        return this.#map;
      }
      set map(map: MockMap | null) {
        this.#map = map;
        if (map) map.inner.append(this);
        else this.remove();
      }
    }

    /** Legacy places.Autocomplete: counted, since the adapter must never construct it. */
    class Autocomplete {
      constructor() {
        stateOf(win).stats.legacyAutocompleteCtorCalls++;
      }
    }

    for (const [tag, element] of [
      ['gmp-place-autocomplete', PlaceAutocompleteElement],
      ['gmp-advanced-marker', AdvancedMarkerElement],
    ] as const)
      if (!win.customElements.get(tag)) win.customElements.define(tag, element);
    return { Place, PlaceAutocompleteElement, AdvancedMarkerElement, Autocomplete };
  }
}

function libraries(win: Win): Record<string, Record<string, unknown>> {
  const { Place, PlaceAutocompleteElement, AdvancedMarkerElement, Autocomplete } =
    windowClasses(win);
  const ColorScheme = { LIGHT: 'LIGHT', DARK: 'DARK', FOLLOW_SYSTEM: 'FOLLOW_SYSTEM' };
  const core = { LatLng, LatLngBounds, event, ColorScheme };
  return {
    core,
    maps: { Map: MockMap },
    geocoding: { Geocoder },
    places: { Place, PlaceAutocompleteElement, Autocomplete, SearchBox: Autocomplete },
    marker: { AdvancedMarkerElement },
  };
}

type Namespace = Record<string, unknown>;
function namespaceOf(win: Win): Namespace {
  const google: { maps?: Namespace } = Reflect.get(win, 'google') ?? {};
  Reflect.set(win, 'google', google);
  return (google.maps ??= {});
}

/** Installs the API into the existing google.maps object (the bootstrap holds a reference to it). */
function installApi(win: Win, mode: 'classic' | 'importLibrary'): void {
  const maps = namespaceOf(win);
  const libs = libraries(win);
  if (mode == 'classic') {
    // A plain <script src=…/maps/api/js?key=…> page: core, maps and geocoding, no importLibrary, no places.
    Object.assign(maps, libs.core, libs.maps, libs.geocoding);
    return;
  }
  maps.importLibrary = async (name: string) => {
    stateOf(win).stats.importedLibraries.push(name);
    const library = libs[name];
    if (!library) throw new Error(`[google-maps-mock] unknown library ${name}`);
    await Promise.resolve();
    // As with the real API, an imported library's classes also appear on the namespace.
    Object.assign(maps, libs.core, library);
    if (name == 'places' || name == 'marker')
      maps[name] = { ...(maps[name] as object), ...library };
    return { ...libs.core, ...library };
  };
}

/** Calls `google.maps.__ib__`-style dotted paths on `win`, as the API does with `callback=`. */
function callBack(win: Win, path: string | null): void {
  if (!path) return;
  const names = path.split('.');
  const last = names.pop() ?? '';
  const owner = names.reduce<unknown>((at, name) => Reflect.get(Object(at), name), win);
  const fn: unknown = Reflect.get(Object(owner), last);
  if (typeof fn == 'function') Reflect.apply(fn, owner, []);
}

export function installGoogleMapsMock(win: Win, options: GoogleMockOptions): GoogleMapsMock {
  const stats: Stats = {
    mapInstances: [],
    placeAutocompleteCtorCalls: 0,
    legacyAutocompleteCtorCalls: 0,
    fetchFieldsCalls: [],
    geocoderRequests: [],
    importedLibraries: [],
    bootstrapParams: [],
    setZoomCalls: [],
  };
  const state: State = { win, options, stats, autocompletes: [] };
  Reflect.set(win, STATE, state);
  const restore: (() => void)[] = [];

  if (options.mode == 'none') {
    // Take the bootstrap's <script> instead of letting it load: no request leaves the page.
    const head = win.document.head;
    const append = head.append.bind(head);
    const appendChild = head.appendChild.bind(head);
    const take = (node: unknown): boolean => {
      if (!(node instanceof win.HTMLScriptElement) || !API.test(node.src)) return false;
      const url = new URL(node.src);
      stats.bootstrapParams.push(url.searchParams);
      later(() => {
        installApi(win, 'importLibrary');
        callBack(win, url.searchParams.get('callback'));
        node.dispatchEvent(new win.Event('load'));
      });
      return true;
    };
    head.append = (...nodes: (Node | string)[]) => append(...nodes.filter((node) => !take(node)));
    head.appendChild = <T extends Node>(node: T): T => (take(node) ? node : appendChild(node));
    restore.push(() => {
      Reflect.deleteProperty(head, 'append');
      Reflect.deleteProperty(head, 'appendChild');
    });
  } else installApi(win, options.mode);

  return {
    stats,
    simulateUserPan(map, to) {
      if (!(map instanceof MockMap)) throw new TypeError('[google-maps-mock] not a mock map');
      map.pan(to);
    },
    async selectPlace(place) {
      const element = state.autocompletes.findLast((candidate) => candidate.isConnected);
      if (!element) throw new Error('[google-maps-mock] no PlaceAutocompleteElement is connected');
      if (options.placesFail) {
        element.dispatchEvent(new win.Event('gmp-error'));
        return;
      }
      const { Place } = windowClasses(win);
      const prediction = {
        toPlace: () => {
          const found = new Place({ id: place.id ?? 'selected-place-id' }, place);
          const fetchFields = found.fetchFields.bind(found);
          found.fetchFields = (request) => (state.pending = fetchFields(request));
          return found;
        },
      };
      element.dispatchEvent(
        Object.assign(new win.Event('gmp-select'), { placePrediction: prediction }),
      );
      await state.pending?.catch(() => {});
      await new Promise((resolve) => setTimeout(resolve, 0));
    },
    triggerAuthFailure() {
      win.gm_authFailure?.();
    },
    uninstall() {
      for (const undo of restore) undo();
      Reflect.deleteProperty(win, 'google');
      Reflect.deleteProperty(win, STATE);
    },
  };
}

/**
 * The standalone script (e2e/fixtures/google-maps-mock.js): the mode comes from the route table's
 * `globalThis.__LP_GOOGLE_MOCK__` prelude, else from `?mode=` on the script URL (default 'classic'). Loaded by the
 * bootstrap (`callback=google.maps.__ib__`), it installs the importLibrary API and calls back, as Google's does.
 * Pages and tests reach the control object as `window.lpGoogleMock`.
 */
export function runStandalone(win: Win): void {
  const script = win.document.currentScript;
  const url = new URL(script instanceof win.HTMLScriptElement ? script.src : win.location.href);
  const preset: Partial<GoogleMockOptions> = Reflect.get(win, '__LP_GOOGLE_MOCK__') ?? {};
  const flag = (name: 'failAuth' | 'placesFail'): boolean =>
    preset[name] ?? url.searchParams.has(name);
  const callback = url.searchParams.get('callback');
  const mode = preset.mode ?? url.searchParams.get('mode') ?? 'classic';
  const mock = installGoogleMapsMock(win, {
    mode: mode == 'classic' && !callback?.startsWith('google.maps.') ? 'classic' : 'importLibrary',
    failAuth: flag('failAuth'),
    placesFail: flag('placesFail'),
  });
  if (API.test(url.href)) stateOf(win).stats.bootstrapParams.push(url.searchParams);
  Reflect.set(win, 'lpGoogleMock', mock);
  if (callback) later(() => callBack(win, callback));
}

// Compile-time proof that the implementation satisfies the frozen signature (CONTRACT §12.6).
installGoogleMapsMock satisfies typeof Contract.installGoogleMapsMock;

declare global {
  // oxlint-disable-next-line no-var -- the page global Google calls on a key failure
  var gm_authFailure: (() => void) | undefined;
}
