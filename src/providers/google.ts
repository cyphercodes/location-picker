/// <reference types="google.maps" />
// The Google Maps adapter (CONTRACT §4.4, D14). The pin is the core's CSS overlay unless `marker: 'advanced'`; zoom is
// re-anchored at the centre (wheel and double-click), so zooming never changes the value; search is
// PlaceAutocompleteElement, never the legacy places.Autocomplete; the paired geocoder is google.maps.Geocoder.
import type {
  GeocodeResult,
  GestureHandling,
  LatLng,
  MapHandle,
  MountContext,
  ProviderAdapter,
  ProviderMountOptions,
  SearchContext,
  SearchHandle,
} from '../core.js';
import { createError } from '../core/errors.js';
import { getStore } from '../core/store.js';
import { googleGeocoder } from '../geocoders/google-geocoder.js';
import { formatLatLng } from '../utils/format.js';
import { parseLatLng } from '../utils/parse.js';
import { gestureMode, type GestureMode } from './engine-css.js';
import { bootstrap, MAPS_API_URL, mapsGlobal } from './google-bootstrap.js';

/** Options for {@link googleProvider}; they win over the picker's provider options. */
export interface GoogleProviderOptions {
  /** Browser key. If google.maps is absent, Google's official inline bootstrap is injected with it. */
  apiKey?: string;
  /** Needed only for `marker: 'advanced'`. */
  mapId?: string;
  /** Bootstrap `v`. @default 'weekly' */
  version?: string;
  /** Bootstrap `language`. @default the picker's lang */
  language?: string;
  /** Bootstrap `region`. @example 'LB' */
  region?: string;
  /** Merged over the picker defaults (`clickableIcons: false`, `disableDefaultUI: true` + zoom control, `keyboardShortcuts: true`, `fullscreenControl: false`). */
  mapOptions?: google.maps.MapOptions;
  /** Passed to `new PlaceAutocompleteElement(…)`. @example { includedRegionCodes: ['lb'] } */
  searchOptions?: google.maps.places.PlaceAutocompleteElementOptions;
  /** @default globalThis.google.maps */
  engine?: typeof google.maps;
}

type Maps = Partial<typeof google.maps>;
type MarkerClass = typeof google.maps.marker.AdvancedMarkerElement;
type Interactive = MountContext['interactive'];

const COLOR_SCHEMES = { light: 'LIGHT', dark: 'DARK', auto: 'FOLLOW_SYSTEM' } as const;
const PAN_KEY = /^Arrow/;
const ZOOM_KEY = /^[-+=]$/;
const API_KEY_FIX = 'Add api-key="YOUR_KEY", or load the Google Maps JS API before the picker.';

/** Google's own `auto` is cooperative on a scrolling page or inside an iframe, greedy otherwise. */
const framed = (): boolean => {
  try {
    return globalThis.top !== globalThis.self;
  } catch {
    return true;
  }
};

/** Chains window.gm_authFailure once per page: every live Google picker hears it, then the page's own handler runs. */
function chainAuthFailure(): void {
  const store = getStore();
  if (store.googleAuthChained) return;
  store.googleAuthChained = true;
  const previous: unknown = Reflect.get(globalThis, 'gm_authFailure');
  Reflect.set(globalThis, 'gm_authFailure', () => {
    for (const listener of store.googleAuthListeners) listener();
    if (typeof previous == 'function') Reflect.apply(previous, globalThis, []);
  });
}

/**
 * Google Maps adapter: map via `importLibrary('maps')` (or a classic, already-loaded `google.maps.Map`, mounted
 * synchronously); CSS-overlay pin (no Marker, no mapId); AdvancedMarkerElement for `marker: 'advanced'`; search =
 * PlaceAutocompleteElement (`gmp-select` -> `placePrediction.toPlace()` -> `fetchFields({ fields: ['location',
 * 'formattedAddress'] })`), never legacy `places.Autocomplete`; reverse = google.maps.Geocoder (opt-in). Wheel and
 * double-click zoom are re-anchored at the centre. `window.gm_authFailure` is chained into GOOGLE_AUTH_FAILED.
 * @example new LocationPicker<google.maps.Map>('#map', { provider: googleProvider({ apiKey: 'AIza…' }), search: true })
 */
export function googleProvider(
  options: GoogleProviderOptions = {},
): ProviderAdapter<google.maps.Map> {
  const namespace = (ctx: MountContext): Maps | undefined =>
    options.engine ?? ctx.options.engine ?? mapsGlobal();
  const mapIdOf = (ctx: MountContext): string | undefined => options.mapId ?? ctx.options.mapId;
  const advanced = (ctx: MountContext): boolean =>
    ctx.options.marker == 'advanced' && !!mapIdOf(ctx);
  // What load() imported for each mount (the libraries also attach to the namespace, but a page may hold a copy).
  const loaded = new WeakMap<
    MountContext,
    { Map?: typeof google.maps.Map; Marker?: MarkerClass }
  >();

  const importing = async (ctx: MountContext, found: Maps | undefined): Promise<void> => {
    let maps = found;
    if (!maps?.importLibrary) {
      // A classic page without importLibrary: mount with what it has (the CSS pin stands in for the marker library).
      if (maps?.Map) return;
      const key = options.apiKey ?? ctx.options.apiKey;
      if (!key) throw createError('API_KEY_MISSING');
      try {
        await bootstrap(
          {
            key,
            v: options.version ?? 'weekly',
            language: options.language ?? ctx.lang,
            region: options.region,
          },
          ctx.nonce,
        );
      } catch (cause) {
        throw createError('ENGINE_LOAD_FAILED', { cause, vars: { url: MAPS_API_URL } });
      }
      maps = mapsGlobal();
    }
    const importLibrary = maps?.importLibrary;
    if (!importLibrary) throw createError('ENGINE_MISSING', { fix: API_KEY_FIX });
    const { Map } = await importLibrary('maps');
    const Marker = advanced(ctx)
      ? (await importLibrary('marker')).AdvancedMarkerElement
      : undefined;
    loaded.set(ctx, { Map, Marker });
  };

  const createSearch = async (ctx: SearchContext<google.maps.Map>): Promise<SearchHandle> => {
    const maps = namespace(ctx);
    const places = maps?.importLibrary ? await maps.importLibrary('places') : maps?.places;
    const Element = places?.PlaceAutocompleteElement;
    if (!Element)
      throw createError('GEOCODER_FAILED', {
        fix: 'Load the Maps JS API via the inline bootstrap, or add libraries=places.',
      });
    const { slot, handle, signal } = ctx;
    const element = new Element({
      ...(ctx.placeholder && { placeholder: ctx.placeholder }),
      description: ctx.label,
      ...options.searchOptions,
      requestedLanguage: options.searchOptions?.requestedLanguage ?? ctx.lang,
    });
    const own = new AbortController();
    const listening = { signal: AbortSignal.any([signal, own.signal]) };
    const choose = async (event: Event): Promise<void> => {
      try {
        const { placePrediction } = event as google.maps.places.PlacePredictionSelectEvent;
        const place = placePrediction.toPlace();
        // Essentials fields only (CONTRACT §4.4).
        await place.fetchFields({ fields: ['location', 'formattedAddress'] });
        const at = place.location;
        if (!at || listening.signal.aborted) return;
        const address = place.formattedAddress ?? undefined;
        ctx.select({
          lat: at.lat(),
          lng: at.lng(),
          label: address ?? formatLatLng({ lat: at.lat(), lng: at.lng() }),
          ...(address && { address }),
          ...(place.id && { id: place.id }),
          raw: place,
        });
      } catch (cause) {
        if (!listening.signal.aborted) ctx.report(createError('GEOCODER_FAILED', { cause }));
      }
    };
    element.addEventListener('gmp-select', (event) => void choose(event), listening);
    element.addEventListener(
      'gmp-error',
      (event) => ctx.report(createError('GEOCODER_FAILED', { cause: event })),
      listening,
    );
    // Pasted coordinates commit at once with no Places call; typed ones are left to Google.
    slot.addEventListener(
      'paste',
      (event) => {
        const text = event.clipboardData?.getData('text') ?? '';
        const at = parseLatLng(text);
        if (!at) return;
        event.preventDefault();
        const result: GeocodeResult = {
          lat: at.lat,
          lng: at.lng,
          label: formatLatLng(at, { separator: ', ' }),
        };
        ctx.select(result);
      },
      { ...listening, capture: true },
    );
    // Results lean towards what the map shows.
    const bias = (): void => {
      const bounds = handle.map.getBounds();
      if (bounds) element.locationBias = bounds;
    };
    bias();
    const idle = handle.map.addListener('idle', bias);
    slot.append(element);
    return {
      element,
      focus: () => element.focus(),
      clear: () => {
        element.value = '';
      },
      destroy: () => {
        own.abort();
        idle.remove();
        element.remove();
      },
    };
  };

  return {
    name: 'google',
    geocoder: () => googleGeocoder({ region: options.region, language: options.language }),
    createSearch,

    // Synchronous when google.maps.Map is present (classic pages), so an adapter object mounts inside the
    // constructor (§4.4 "Synchronous .map").
    load(ctx) {
      const maps = namespace(ctx);
      const present = maps?.Map && (!advanced(ctx) || maps.marker?.AdvancedMarkerElement);
      return present ? undefined : importing(ctx, maps);
    },

    mount(ctx) {
      const maps = namespace(ctx);
      const imported = loaded.get(ctx);
      const GoogleMap = imported?.Map ?? maps?.Map;
      if (!GoogleMap) throw createError('ENGINE_MISSING', { fix: API_KEY_FIX });
      const { container, view, events, signal } = ctx;
      const own: google.maps.MapOptions = { ...ctx.options.mapOptions, ...options.mapOptions };
      const mapId = mapIdOf(ctx);
      let gestures = ctx.gestureHandling;
      let mode: GestureMode = gestureMode(gestures, ctx.pageScrolls || framed());
      let interactive: Interactive = ctx.interactive;
      let wheelAt = -Infinity;
      let gmap: google.maps.Map | undefined;

      // Our listeners go on before the engine adds its own, and in the capture phase, so they run first.
      const on = <K extends keyof HTMLElementEventMap>(
        type: K,
        listener: (event: HTMLElementEventMap[K]) => void,
      ): void =>
        container.addEventListener(type, listener, { capture: true, passive: false, signal });
      const start = (): void => events.interactionStart();
      const end = (): void => events.interactionEnd();
      const zoomable = (): boolean => interactive != 'none' && mode != 'none';
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
      // D14: wheel zoom anchored at the centre, one step per burst. Where zoom is not allowed (cooperative without
      // Ctrl/⌘), the event passes through and Google shows its own hint.
      on('wheel', (event) => {
        if (!gmap || !zoomable() || !event.deltaY) return;
        if (mode != 'greedy' && !event.ctrlKey && !event.metaKey) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        if (event.timeStamp - wheelAt > 120)
          gmap.setZoom(Math.round((gmap.getZoom() ?? view.zoom) + (event.deltaY < 0 ? 1 : -1)));
        wheelAt = event.timeStamp;
      });
      on('dblclick', (event) => {
        if (!gmap || !zoomable()) return;
        event.stopImmediatePropagation();
        gmap.setZoom(Math.round((gmap.getZoom() ?? view.zoom) + 1));
      });

      // Google writes inline styles on its map div: give it one of ours that fills the container.
      const div = container.ownerDocument.createElement('div');
      div.style.cssText = 'width:100%;height:100%';
      container.append(div);
      // Interactivity the user did not configure through mapOptions follows the picker's state.
      const interactivity = (): google.maps.MapOptions => {
        const state: google.maps.MapOptions = {
          gestureHandling: interactive == 'full' ? gestures : 'none',
          keyboardShortcuts: interactive != 'none',
          zoomControl: interactive != 'none',
        };
        for (const key of Object.keys(own)) Reflect.deleteProperty(state, key);
        return state;
      };
      const map = (gmap = new GoogleMap(div, {
        center: view.center,
        zoom: view.zoom,
        ...(mapId && { mapId }),
        ...(ctx.options.maxZoom !== undefined && { maxZoom: ctx.options.maxZoom }),
        clickableIcons: false,
        disableDefaultUI: true,
        zoomControl: true,
        keyboardShortcuts: true,
        fullscreenControl: false,
        streetViewControl: false,
        mapTypeControl: false,
        disableDoubleClickZoom: true,
        colorScheme: COLOR_SCHEMES[ctx.colorScheme],
        ...interactivity(),
        ...own,
      }));

      const center = (): LatLng => {
        const at = map.getCenter();
        return at ? { lat: at.lat(), lng: at.lng() } : { ...view.center };
      };
      let marker: InstanceType<MarkerClass> | undefined;
      if (ctx.options.marker == 'advanced') {
        const Marker = imported?.Marker ?? maps?.marker?.AdvancedMarkerElement;
        // Reported after the constructor returns: no event is dispatched synchronously from it (§12.10).
        if (!mapId) queueMicrotask(() => ctx.report(createError('MAP_ID_REQUIRED')));
        else if (Marker) marker = new Marker({ map, position: view.center });
        else
          console.warn(
            '[location-picker] marker="advanced" needs the marker library; showing the CSS pin. Load the Maps JS API with the inline bootstrap.',
          );
      }
      const listeners = [
        map.addListener('center_changed', () => {
          const at = center();
          if (marker) marker.position = at;
          events.move(at);
        }),
        map.addListener('idle', () => {
          events.moveEnd(center(), map.getZoom() ?? view.zoom);
          events.interactionEnd();
        }),
        map.addListener('dragstart', start),
        map.addListener('dragend', end),
      ];

      const store = getStore();
      const authFailed = (): void => ctx.report(createError('GOOGLE_AUTH_FAILED'));
      store.googleAuthListeners.add(authFailed);
      chainAuthFailure();

      const handle: MapHandle<google.maps.Map> & {
        update(o: ProviderMountOptions, next?: GestureHandling): void;
      } = {
        map,
        drawsMarker: !!marker,
        a11y: 'engine',
        getCenter: center,
        getZoom: () => map.getZoom() ?? view.zoom,
        setView(at, zoom, { animate }) {
          if (zoom !== undefined && zoom != map.getZoom()) map.setZoom(zoom);
          if (animate) map.panTo(at);
          else map.setCenter(at);
        },
        setZoom: (zoom) => map.setZoom(zoom),
        setInteractive(next) {
          interactive = next;
          map.setOptions(interactivity());
        },
        // Google keeps its centre across container resizes; A8 still wants the current one reported.
        resize: () => events.move(center()),
        update(o, next) {
          if (next) {
            gestures = next;
            mode = gestureMode(next, ctx.pageScrolls || framed());
          }
          map.setOptions({ maxZoom: o.maxZoom ?? null, ...interactivity() });
        },
        destroy() {
          for (const listener of listeners) listener.remove();
          store.googleAuthListeners.delete(authFailed);
          if (marker) marker.map = null;
          maps?.event?.clearInstanceListeners(map);
          div.remove();
        },
      };
      return handle;
    },
  };
}
