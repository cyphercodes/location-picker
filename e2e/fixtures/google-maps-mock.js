// GENERATED from test/fixtures/google-maps-mock.ts by test/fixtures/emit-google-maps-mock.mts. Do not edit.
/* oxlint-disable */
(() => {
  // test/fixtures/google-maps-mock.ts
  var API = /^https:\/\/maps\.googleapis\.com\/maps\/api\/js/;
  var ADDRESSES = {
    'eiffel tower': {
      lat: 48.8584,
      lng: 2.2945,
      address: 'Champ de Mars, 5 Av. Anatole France, 75007 Paris, France',
    },
    beirut: { lat: 33.8938, lng: 35.5018, address: 'Beirut, Lebanon' },
  };
  var googleAddressAt = ({ lat, lng }) => `Google address at ${lat.toFixed(4)},${lng.toFixed(4)}`;
  var later = (fn) => void setTimeout(fn, 0);
  var LatLng = class _LatLng {
    #lat;
    #lng;
    constructor(lat, lng) {
      if (lat instanceof _LatLng) [this.#lat, this.#lng] = [lat.lat(), lat.lng()];
      else if (typeof lat == 'object') [this.#lat, this.#lng] = [Number(lat.lat), Number(lat.lng)];
      else [this.#lat, this.#lng] = [Number(lat), Number(lng)];
    }
    lat() {
      return this.#lat;
    }
    lng() {
      return this.#lng;
    }
    equals(other) {
      return !!other && other.lat() == this.#lat && other.lng() == this.#lng;
    }
    toJSON() {
      return { lat: this.#lat, lng: this.#lng };
    }
  };
  var LatLngBounds = class {
    #sw;
    #ne;
    constructor(sw, ne) {
      this.#sw = new LatLng(sw);
      this.#ne = new LatLng(ne);
    }
    getSouthWest() {
      return this.#sw;
    }
    getNorthEast() {
      return this.#ne;
    }
    toJSON() {
      return {
        south: this.#sw.lat(),
        west: this.#sw.lng(),
        north: this.#ne.lat(),
        east: this.#ne.lng(),
      };
    }
  };
  var registry = /* @__PURE__ */ new WeakMap();
  var event = {
    addListener(instance, name, handler) {
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
    addListenerOnce(instance, name, handler) {
      const listener = event.addListener(instance, name, (...args) => {
        listener.remove();
        handler(...args);
      });
      return listener;
    },
    removeListener(listener) {
      listener.remove();
    },
    clearInstanceListeners(instance) {
      registry.delete(instance);
    },
    trigger(instance, name, ...args) {
      for (const entry of (registry.get(instance) ?? []).slice())
        if (entry.name == name) entry.handler.apply(instance, args);
    },
    /** Listeners currently registered on `instance` (tests check that destroy() removed them). */
    count(instance) {
      return registry.get(instance)?.length ?? 0;
    },
  };
  var STATE = /* @__PURE__ */ Symbol.for('location-picker:google-maps-mock');
  var stateOf = (win) => {
    const state = Reflect.get(win, STATE);
    if (!state) throw new Error('[google-maps-mock] not installed');
    return state;
  };
  var MockMap = class {
    div;
    /** Google's own map element inside `div`; wheel and key events that reach it are the engine's. */
    inner;
    /** Constructor options merged with every setOptions() call. */
    options;
    /** Wheel events that reached the engine (D14 interception keeps this at 0 when it zooms itself). */
    wheelEvents = 0;
    #center;
    #zoom;
    #idle;
    #state;
    constructor(div, options = {}) {
      this.#state = stateOf(div.ownerDocument.defaultView ?? globalThis);
      this.div = div;
      this.options = { ...options };
      this.#center = new LatLng(options.center ?? { lat: 0, lng: 0 });
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
    getDiv() {
      return this.div;
    }
    getCenter() {
      return this.#center;
    }
    getZoom() {
      return this.#zoom;
    }
    get(key) {
      return this.options[key];
    }
    setCenter(center) {
      const next = new LatLng(center);
      if (next.equals(this.#center)) return;
      this.#center = next;
      event.trigger(this, 'center_changed');
      this.#scheduleIdle();
    }
    panTo(center) {
      this.setCenter(center);
    }
    setZoom(zoom) {
      this.#state.stats.setZoomCalls.push(zoom);
      if (zoom == this.#zoom) return;
      this.#zoom = zoom;
      event.trigger(this, 'zoom_changed');
      this.#scheduleIdle();
    }
    setOptions(options) {
      Object.assign(this.options, options);
      if (options.center) this.setCenter(options.center);
      if (typeof options.zoom == 'number') this.setZoom(options.zoom);
    }
    getBounds() {
      const { lat, lng } = this.#center.toJSON();
      const scale = (256 * 2 ** this.#zoom) / 360;
      const dLng = (this.div.clientWidth || 320) / scale / 2;
      const dLat = (this.div.clientHeight || 240) / scale / 2;
      return new LatLngBounds(
        { lat: lat - dLat, lng: lng - dLng },
        { lat: lat + dLat, lng: lng + dLng },
      );
    }
    addListener(name, handler) {
      return event.addListener(this, name, handler);
    }
    /** dragstart, a few center_changed steps, dragend, then idle: what a user drag fires (synchronously here). */
    pan(to) {
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
    #scheduleIdle() {
      clearTimeout(this.#idle);
      this.#idle = setTimeout(() => event.trigger(this, 'idle'), 0);
    }
    /** Google's own wheel zoom is anchored at the cursor, so it also moves the centre. */
    #wheel(e) {
      this.wheelEvents++;
      const gestures = this.options.gestureHandling;
      if (gestures == 'none' || (gestures != 'greedy' && !e.ctrlKey && !e.metaKey)) return;
      e.preventDefault();
      const { lat, lng } = this.#center.toJSON();
      this.setCenter({ lat: lat + 1e-3, lng: lng + 1e-3 });
      this.setZoom(this.#zoom + (e.deltaY < 0 ? 1 : -1));
    }
    /** keyboardShortcuts: arrows pan, +/- zoom (centre-anchored). */
    #key(e) {
      if (this.options.keyboardShortcuts === false) return;
      const { lat, lng } = this.#center.toJSON();
      const pan = {
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
  };
  var Geocoder = class {
    #state;
    constructor() {
      this.#state = stateOf(globalThis);
    }
    async geocode(request) {
      this.#state.stats.geocoderRequests.push({ ...request });
      await new Promise((resolve) => setTimeout(resolve, 0));
      const result = (at, address, id) => ({
        formatted_address: address,
        place_id: id,
        geometry: {
          location: new LatLng(at),
          viewport: new LatLngBounds(
            { lat: at.lat - 5e-3, lng: at.lng - 5e-3 },
            { lat: at.lat + 5e-3, lng: at.lng + 5e-3 },
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
      if (!known) throw Object.assign(new Error('ZERO_RESULTS'), { code: 'ZERO_RESULTS' });
      return { results: [result(known, known.address, 'search-place-id')] };
    }
  };
  function windowClasses(win) {
    const cached = Reflect.get(win, `${String(STATE)}:classes`);
    if (cached) return cached;
    const classes = build();
    Reflect.set(win, `${String(STATE)}:classes`, classes);
    return classes;
    function build() {
      class Place {
        id;
        location = null;
        formattedAddress = null;
        #data;
        constructor(options = {}, data) {
          this.id = options.id ?? data?.id ?? 'mock-place';
          this.#data = data;
        }
        async fetchFields({ fields }) {
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
      class PlaceAutocompleteElement extends win.HTMLElement {
        options;
        input;
        locationBias = null;
        constructor(options = {}) {
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
        get value() {
          return this.input.value;
        }
        set value(value) {
          this.input.value = value ?? '';
        }
        focus() {
          this.input.focus();
        }
      }
      class AdvancedMarkerElement extends win.HTMLElement {
        position;
        #map = null;
        constructor(options = {}) {
          super();
          this.position = options.position;
          this.map = options.map ?? null;
        }
        get map() {
          return this.#map;
        }
        set map(map) {
          this.#map = map;
          if (map) map.inner.append(this);
          else this.remove();
        }
      }
      class Autocomplete {
        constructor() {
          stateOf(win).stats.legacyAutocompleteCtorCalls++;
        }
      }
      for (const [tag, element] of [
        ['gmp-place-autocomplete', PlaceAutocompleteElement],
        ['gmp-advanced-marker', AdvancedMarkerElement],
      ])
        if (!win.customElements.get(tag)) win.customElements.define(tag, element);
      return { Place, PlaceAutocompleteElement, AdvancedMarkerElement, Autocomplete };
    }
  }
  function libraries(win) {
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
  function namespaceOf(win) {
    const google = Reflect.get(win, 'google') ?? {};
    Reflect.set(win, 'google', google);
    return (google.maps ??= {});
  }
  function installApi(win, mode) {
    const maps = namespaceOf(win);
    const libs = libraries(win);
    if (mode == 'classic') {
      Object.assign(maps, libs.core, libs.maps, libs.geocoding);
      return;
    }
    maps.importLibrary = async (name) => {
      stateOf(win).stats.importedLibraries.push(name);
      const library = libs[name];
      if (!library) throw new Error(`[google-maps-mock] unknown library ${name}`);
      await Promise.resolve();
      Object.assign(maps, libs.core, library);
      if (name == 'places' || name == 'marker') maps[name] = { ...maps[name], ...library };
      return { ...libs.core, ...library };
    };
  }
  function callBack(win, path) {
    if (!path) return;
    const names = path.split('.');
    const last = names.pop() ?? '';
    const owner = names.reduce((at, name) => Reflect.get(Object(at), name), win);
    const fn = Reflect.get(Object(owner), last);
    if (typeof fn == 'function') Reflect.apply(fn, owner, []);
  }
  function installGoogleMapsMock(win, options) {
    const stats = {
      mapInstances: [],
      placeAutocompleteCtorCalls: 0,
      legacyAutocompleteCtorCalls: 0,
      fetchFieldsCalls: [],
      geocoderRequests: [],
      importedLibraries: [],
      bootstrapParams: [],
      setZoomCalls: [],
    };
    const state = { win, options, stats, autocompletes: [] };
    Reflect.set(win, STATE, state);
    const restore = [];
    if (options.mode == 'none') {
      const head = win.document.head;
      const append = head.append.bind(head);
      const appendChild = head.appendChild.bind(head);
      const take = (node) => {
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
      head.append = (...nodes) => append(...nodes.filter((node) => !take(node)));
      head.appendChild = (node) => (take(node) ? node : appendChild(node));
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
        if (!element)
          throw new Error('[google-maps-mock] no PlaceAutocompleteElement is connected');
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
  function runStandalone(win) {
    const script = win.document.currentScript;
    const url = new URL(script instanceof win.HTMLScriptElement ? script.src : win.location.href);
    const preset = Reflect.get(win, '__LP_GOOGLE_MOCK__') ?? {};
    const flag = (name) => preset[name] ?? url.searchParams.has(name);
    const callback = url.searchParams.get('callback');
    const mode = preset.mode ?? url.searchParams.get('mode') ?? 'classic';
    const mock = installGoogleMapsMock(win, {
      mode:
        mode == 'classic' && !callback?.startsWith('google.maps.') ? 'classic' : 'importLibrary',
      failAuth: flag('failAuth'),
      placesFail: flag('placesFail'),
    });
    if (API.test(url.href)) stateOf(win).stats.bootstrapParams.push(url.searchParams);
    Reflect.set(win, 'lpGoogleMock', mock);
    if (callback) later(() => callBack(win, callback));
  }

  // test/fixtures/google-maps-mock.standalone.ts
  runStandalone(globalThis);
})();
