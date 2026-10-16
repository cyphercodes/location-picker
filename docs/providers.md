# Providers, geocoders and usage policies

A provider is the map engine: `leaflet` (the default, OpenStreetMap, no key), `google` or `maplibre`. Each provider has a paired geocoder for the search box and for reverse geocoding.

| Provider   | Engine                              | Loaded how                                               | Search and reverse geocoding                |
| ---------- | ----------------------------------- | -------------------------------------------------------- | ------------------------------------------- |
| `leaflet`  | Leaflet 1.9.4 + OpenStreetMap tiles | `window.L`, or auto-loaded from jsDelivr with SRI        | Photon                                      |
| `google`   | Google Maps JavaScript API          | already on the page, or Google's bootstrap with your key | `PlaceAutocompleteElement`, Google Geocoder |
| `maplibre` | `maplibre-gl` + OpenFreeMap style   | bring your own (never auto-loaded)                       | Photon                                      |

## How the provider is chosen

1. An explicit `provider` wins: a name (`provider="google"`) or an adapter object (`provider: leafletProvider({ … })`). The aliases `osm` and `openstreetmap` (for `leaflet`) and `googlemaps` and `google-maps` (for `google`) work with a warning. Any other name is an `INVALID_OPTION` error: no map is created and `ready` rejects.
2. Otherwise a Google-only signal selects `google`: `api-key`, `map-id`, `marker="advanced"`, the deprecated `useAdvancedMarker`, or a 3rd constructor argument.
3. Otherwise `leaflet`. A `google.maps` global already on the page is never used by accident; it only triggers a one-time console hint.

MapLibre is never inferred: ask for it with `provider="maplibre"`. `lat`/`lng` are not a Google signal.

String providers are loaded lazily as separate chunks (the script build bundles all three). Adapter objects are imported statically and let `picker.map` exist synchronously. Options passed to the adapter factory win over the picker's own options.

## Leaflet and OpenStreetMap (default)

**Engine.** The adapter uses, in order: the `engine` option (`import * as L from 'leaflet'`), then `window.L`, then auto-loads `https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.js` with Subresource Integrity (`crossorigin="anonymous"` and your CSP nonce), once per page. `engine-url` points the auto-load somewhere else (no integrity check for custom URLs); `engine-url="none"` never loads anything and reports `ENGINE_MISSING` when `L` is absent. Leaflet 2 works through `engine`; the auto-load stays on 1.9.4.

RequireJS or AMD pages must load Leaflet before RequireJS, or pass `engine`, because Leaflet's UMD build calls an anonymous `define()`.

**Leaflet's CSS** is resolved without a forced download when your page already has it:

1. `engine-css-url` set to a URL: that stylesheet is linked.
2. The adapter auto-loaded Leaflet: the pinned `leaflet.css` is linked with integrity.
3. Readable `leaflet.css` rules on the page (for example `import 'leaflet/dist/leaflet.css'` in a bundle) are used; for the element they are copied into its shadow root.
4. Otherwise the pinned `leaflet.css` is linked from jsDelivr (skipped with `engine-css-url="none"`).
5. After mounting, the picker checks that the CSS applied, and reports `ENGINE_CSS_MISSING` (a warning) with a fix if not.

The map never waits for the CSS, so a bundled `L` gives you `picker.map` synchronously.

**Tiles.** The default is `https://tile.openstreetmap.org/{z}/{x}/{y}.png`, maximum zoom 19, with the "© OpenStreetMap contributors" credit always visible (the attribution is forced while the default tiles are used). OpenStreetMap's tiles are a shared community service with a [tile usage policy](https://operations.osmfoundation.org/policies/tiles/): keep the attribution visible, do not bulk-download, and expect best-effort availability with no SLA. For production traffic, use your own or a commercial tile server:

```ts
import { LocationPicker } from 'location-picker';

const picker = new LocationPicker('#map', {
  tileUrl: 'https://tiles.example.com/{z}/{x}/{y}.png',
  attribution: '&copy; Example Maps &copy; OpenStreetMap contributors',
  maxZoom: 20,
});
```

On the element that is `tile-url="…" attribution="…" max-zoom="20"`. Changing `tile-url` swaps the layer without rebuilding the map. A custom `tile-url` without `attribution` logs a warning.

**Self-hosted Leaflet** (no CDN, for strict CSP):

<!-- prettier-ignore-start -->
<!-- doctest:skip "needs your own /vendor/leaflet files" -->
```html
<location-picker name="location" engine-url="/vendor/leaflet/leaflet.js"
  engine-css-url="/vendor/leaflet/leaflet.css" style="height: 360px"></location-picker>
<script src="/vendor/location-picker/location-picker.global.js"></script>
```
<!-- prettier-ignore-end -->

**Gestures.** Zoom is anchored at the pin (wheel, double-click and pinch), so zooming never changes the value. With `gesture-handling="auto"` (the default), a page that scrolls gets cooperative gestures: a plain wheel scrolls the page and shows "Use Ctrl + scroll to zoom the map" (⌘ on Apple platforms); one finger still pans the map. `greedy` always zooms, `none` disables gestures (buttons and keys only).

## Google Maps

Google is used only when you ask: `provider="google"`, or a key, a map ID or `marker="advanced"`.

**Loading.** The adapter uses, in order: the `engine` option (a `google.maps` namespace); a `google.maps.Map` already on the page (a classic `<script src="https://maps.googleapis.com/…">` page, mounted immediately); `google.maps.importLibrary`; and finally, when `api-key` is set, Google's official inline bootstrap, injected once per page with your key, `v=weekly`, the page language and your CSP nonce. With none of these you get `API_KEY_MISSING`.

**Your key.** Create a browser key, restrict it by HTTP referrer, and enable the Maps JavaScript API, Places API (New) for `search`, and the Geocoding API only for `reverse-geocode` or `lookupAddress()`. A rejected key (referrer restrictions, billing, a disabled API) is reported as `GOOGLE_AUTH_FAILED` on every Google picker on the page; an existing `window.gm_authFailure` handler is still called.

```ts
import { LocationPicker } from 'location-picker/core';
import { googleProvider } from 'location-picker/google';

const picker = new LocationPicker<google.maps.Map>('#map', {
  provider: googleProvider({
    apiKey: 'YOUR_BROWSER_KEY',
    region: 'LB',
    mapOptions: { mapTypeId: 'hybrid' },
  }),
  search: true,
  locate: 'button',
});
const map = (await picker.ready).map;
```

To control loading yourself, `loadGoogleMaps({ apiKey })` injects the same bootstrap and resolves with the `google.maps` namespace.

**The pin** is a CSS overlay, so no Marker and no map ID are needed. `marker="advanced"` draws an `AdvancedMarkerElement` instead; it needs `map-id`, and without one the CSS pin stays and `MAP_ID_REQUIRED` is reported.

**Zoom.** Wheel, double-click and the zoom control are re-anchored at the pin, so they never change the value. A pinch on Google Maps zooms around the fingers, so the centre moves and the new centre is committed (source `user`).

**Search** uses Google's `PlaceAutocompleteElement` (never the legacy `places.Autocomplete`). A picked place moves the map and commits with its formatted address. Pasting coordinates (`48.85, 2.29`, a Google Maps URL) into the box jumps there without a Places request.

**Terms.** The [Google Maps Platform Terms of Service](https://cloud.google.com/maps-platform/terms) do not allow Google Maps content, such as Places results or Geocoding addresses, on or next to a non-Google map. The picker therefore pairs geocoders with providers and refuses a mismatch (`GEOCODER_MISMATCH`), and when an element switches between Google and another provider it clears the address. If you write a custom geocoder for a Google map, its results must come from Google.

**Colours.** Google's `colorScheme` follows the element's computed `color-scheme` at mount.

## MapLibre

MapLibre GL is bring-your-own: the library never downloads `maplibre-gl` or its CSS by default. The default style is OpenFreeMap's keyless `https://tiles.openfreemap.org/styles/liberty` ([OpenFreeMap](https://openfreemap.org/)).

<!-- prettier-ignore-start -->
<!-- doctest:skip "maplibre-gl is not installed in the doc-test consumer project" -->
```ts
import * as maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { LocationPicker } from 'location-picker/core';
import { maplibreProvider } from 'location-picker/maplibre';

const picker = new LocationPicker('#map', { provider: maplibreProvider({ engine: maplibregl }), search: true });
```
<!-- prettier-ignore-end -->

Without a bundler, load the engine yourself and give it to the element:

<!-- prettier-ignore-start -->
<!-- doctest:skip "loads maplibre-gl from a CDN that the doc-test routes do not serve" -->
```html
<location-picker provider="maplibre" name="location" style="height: 360px"
  engine-css-url="https://cdn.jsdelivr.net/npm/maplibre-gl@6/dist/maplibre-gl.css"></location-picker>
<script src="https://cdn.jsdelivr.net/npm/location-picker@3"></script>
<script type="module">
  import * as maplibregl from 'https://cdn.jsdelivr.net/npm/maplibre-gl@6/+esm';
  document.querySelector('location-picker').engine = maplibregl;
</script>
```
<!-- prettier-ignore-end -->

- **CSS:** readable MapLibre CSS on the page is used (and copied into the element's shadow root). Otherwise nothing is fetched and `ENGINE_CSS_MISSING` (a warning) tells you to `import 'maplibre-gl/dist/maplibre-gl.css'` or set `engine-css-url`.
- **Engine URL:** `engine-url` set to an ES module URL is loaded with `import()`. That is opt-in and cannot use Subresource Integrity.
- **Style:** `map-style` takes a style URL; the `mapStyle` property also takes a style object. Setting only `tile-url` wraps an XYZ raster template into a style.
- Rotation and pitch are off and zoom is anchored at the pin. `cooperative` maps to MapLibre's `cooperativeGestures`.
- MapLibre's worker needs `worker-src blob:` under a Content Security Policy ([csp.md](csp.md)).

## Geocoders

| Provider              | Paired geocoder                                 | `pairsWith`               |
| --------------------- | ----------------------------------------------- | ------------------------- |
| `leaflet`, `maplibre` | `photonGeocoder()`                              | `['leaflet', 'maplibre']` |
| `google`              | `googleGeocoder()` + `PlaceAutocompleteElement` | `['google']`              |

Search and reverse geocoding are off until you set `search` or `reverse-geocode` (or call `geocode()` / `lookupAddress()`). Coordinates never need a geocoder: in the built-in search box (Leaflet and MapLibre), typed or pasted coordinates show one offline "Go to …" option, and on Google a pasted coordinate jumps directly.

### Photon

[Photon](https://photon.komoot.io/) (by komoot) is a keyless OpenStreetMap geocoder that supports search-as-you-type. The public endpoint is free under fair use, with no SLA, and heavy use is throttled. The picker is gentle with it: queries need 3 characters, are debounced by at least 300 ms on the public endpoint, cancel the previous request, are cached (100 searches, 200 reverse lookups) and return 5 results biased to the map centre. Reverse lookups run 400 ms after a commit.

For production, self-host Photon or use a commercial Photon endpoint:

```ts
import { LocationPicker } from 'location-picker';
import { photonGeocoder } from 'location-picker/photon';

new LocationPicker('#map', {
  search: true,
  reverseGeocode: true,
  geocoder: photonGeocoder({
    url: 'https://photon.example.org/api',
    reverseUrl: 'https://photon.example.org/reverse',
    params: { osm_tag: 'place' },
  }),
});
```

On the element, set the property: `el.geocoder = photonGeocoder({ url })`. With the script build, the factory is `LocationPicker.photonGeocoder`.

### Custom geocoders

A geocoder is an object with `search` and/or `reverse` (a bare function acts as `search`). Declare `pairsWith` so it is only used with maps it may appear on:

```ts
import { LocationPicker, type Geocoder, type GeocodeResult } from 'location-picker';

// For example, your own server-side endpoint in front of a commercial geocoder.
const myGeocoder: Geocoder = {
  pairsWith: ['leaflet', 'maplibre'],
  async search(query, { signal, near, limit, lang }) {
    const params = new URLSearchParams({
      q: query,
      lat: String(near.lat),
      lng: String(near.lng),
      limit: String(limit),
      lang,
    });
    const response = await fetch(`/api/geocode?${params}`, { signal });
    return (await response.json()) as GeocodeResult[];
  },
  async reverse({ lat, lng }, { signal, lang }) {
    const response = await fetch(`/api/reverse?lat=${lat}&lng=${lng}&lang=${lang}`, { signal });
    return (await response.json()) as GeocodeResult | null;
  },
};

new LocationPicker('#map', { search: true, reverseGeocode: true, geocoder: myGeocoder });
```

A geocoder without `pairsWith` works with every provider; then you are responsible for its terms, and non-Google results must never appear on a Google map. `geocoder: false` turns geocoding off (`geocode()` and `lookupAddress()` then reject with `GEOCODER_MISSING`).

Nominatim is never a default here and has no example in these docs. Its usage policy, https://operations.osmfoundation.org/policies/nominatim/, forbids client-side autocomplete, allows at most one request per second and requires caching; read it before writing a custom geocoder that calls Nominatim, and do not use it for the search box.

## Switching providers on the element

Setting `provider`, `api-key`, `map-id`, `map-style`, `engine-url`, `engine-css-url`, `marker="advanced"`, `engine` or `mapOptions` rebuilds the map (several changes in one task rebuild once). The coordinates are kept, `el.ready` is replaced immediately, and `ready` fires again:

```ts
const el = document.querySelector('location-picker')!;
el.provider = 'google';
el.apiKey = 'YOUR_BROWSER_KEY';
const ready = await el.ready;
console.log(ready.map);
```

When the provider name changes (for example from `google` to `leaflet`), the address is cleared silently, so Google text never stays next to an OpenStreetMap map. With `reverse-geocode` on, the new provider's geocoder looks the address up again.

## Your own engine

Any map library can be plugged in through the public `ProviderAdapter` contract. An OpenLayers adapter in about 20 lines:

<!-- prettier-ignore-start -->
<!-- doctest:skip "ol (OpenLayers) is not installed in the doc-test consumer project" -->
```ts
import { LocationPicker, type ProviderAdapter } from 'location-picker/core';
import OlMap from 'ol/Map'; import View from 'ol/View'; import TileLayer from 'ol/layer/Tile'; import OSM from 'ol/source/OSM';
import { fromLonLat, toLonLat } from 'ol/proj';

const openlayers: ProviderAdapter<OlMap> = {
  name: 'openlayers',
  mount({ container, view, events, signal }) {
    const map = new OlMap({ target: container, layers: [new TileLayer({ source: new OSM() })],
      view: new View({ center: fromLonLat([view.center.lng, view.center.lat]), zoom: view.zoom }) });
    const center = () => { const [lng, lat] = toLonLat(map.getView().getCenter()!); return { lat, lng }; };
    map.getView().on('change:center', () => events.move(center()));
    map.on('moveend', () => { events.moveEnd(center(), map.getView().getZoom()!); events.interactionEnd(); });
    container.addEventListener('pointerdown', () => events.interactionStart(), { capture: true, signal });
    return {
      map, getCenter: center, getZoom: () => map.getView().getZoom()!,
      setView: (c, z, { animate }) => map.getView().animate({ center: fromLonLat([c.lng, c.lat]), zoom: z, duration: animate ? 250 : 0 }),
      setZoom: (z) => map.getView().setZoom(z),
      setInteractive: (m) => map.getInteractions().forEach((i) => i.setActive(m === 'full')),
      resize: () => map.updateSize(), destroy: () => map.setTarget(undefined),
    };
  },
};
new LocationPicker('#map', { provider: openlayers, value: '48.8584,2.2945' });
```
<!-- prettier-ignore-end -->

The adapter creates its map inside `container` only, reports camera changes through `events`, and the core does rounding, de-duplication and event sources. The member reference is in [api.md](api.md#provideradapter).
