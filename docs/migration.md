# Migrating to v3

v3 keeps every v1 and v2 entry point working, but the new API is built around a form field: `<location-picker>` plus an imperative `LocationPicker` class, on OpenStreetMap by default. This page lists every v1 and v2 API, what happens to it, and the one-line fixes.

## Which path are you on?

| You use                                                                                      | What to do                                                                                                                      |
| -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `<script src="https://unpkg.com/location-picker/dist/location-picker.min.js">` (unpinned v1) | Nothing. Since 2.1.0 that path serves a frozen copy of v1 again. To get v3, follow [v1 script tag to v3](#v1-script-tag-to-v3). |
| npm 1.x: `import locationPicker from 'location-picker'`                                      | Change the import to `location-picker/v1`. Behaviour is identical.                                                              |
| npm 1.x CommonJS: `new (require('location-picker'))(…)`                                      | `require('location-picker/v1')`.                                                                                                |
| npm 2.x: `import { LocationPicker } from 'location-picker'` with Google Maps                 | Pass `provider: googleProvider()` (or an `apiKey`). See [v2 to v3](#v2-to-v3).                                                  |
| A vendored copy of the v1 file                                                               | Nothing; it keeps working. v1 and v3 can run on the same page.                                                                  |

The frozen v1 file shares no code with v3. It only gained three bug fixes: longitude is wrapped into [-180, 180), latitude is clamped (#12), and `0` is a valid `lat`/`lng` (#11). The pin is an SVG with the same 28×44 footprint and anchor as the old PNG.

## Every v1 and v2 API

<!-- prettier-ignore-start -->
| v1 (1.1.1) / v2 (2.0.0) API | v3 | Status |
|---|---|---|
| `<script src=…/location-picker/dist/location-picker.min.js>`; global `locationPicker`; AMD | The same path serves the **frozen v1 file** (standalone source) | **Kept forever.** The 42 unpinned unpkg sites work again from 2.1.0 (D17) |
| `new locationPicker(el, {setCurrentPosition, lat, lng}, mapOptions)`; sync Google `.map`; `.element`; auto CSS; `.location-picker .centerMarker` 28×44; Tripoli; zoom 15 | Frozen v1 file. npm users: `import locationPicker from 'location-picker/v1'` | Kept. The only fixes are lng wrap/lat clamp (#12) and 0 as a valid lat/lng (#11) |
| `google.maps.event.addListener(lp.map,'idle',…)` | v1 file: unchanged. v3: `change` events (or `idle` on `picker.map` with `provider: googleProvider()`) | Kept / superseded |
| `new (require('location-picker'))()` (v1 CJS) | `require('location-picker/v1')` | Alias (one-line change) |
| `import LocationPicker from 'location-picker'` / `{ LocationPicker }` (v2) | Same names; `default` = v3 class | Kept |
| `require('location-picker')` → `{ LocationPicker, default }` (v2) | Same shape | Kept |
| v2 ctor `(element, options, mapOptions)` | Same signature. The 3rd argument merges into `mapOptions` and selects `google` (deprecation warning) | Kept |
| `getMarkerPosition()` | Same. Normalised, never a fake `{0,0}`. While unset it returns the view centre and warns once (read `valueAsLatLng`) | Kept (bug fixed) |
| `setLocation(lat, lng)` | Same, plus a `LatLngInput` overload; now commits (`change`, source `api`). Out-of-range latitude is clamped with a warning, as Google clamped it in v2 (D19) | Kept |
| `setCurrentPosition()` (v1 void / v2 Promise) | Alias of `locate()` that keeps the current zoom, like v2 (`locate()` itself zooms to max(current, 17)): `Promise<LocationDetail>` (⊇ LatLng). Rejects `LocationPickerError` with `.code`; never hangs | Kept (v2 shape) |
| Option `setCurrentPosition` (default **true**) | `locate: 'auto'` when `true`. The default is now `'off'` | **Default changed** (LOCKED 7) |
| Options `lat`, `lng` | Deprecated aliases of `value` (both required; 0 valid; latitude clamped with a warning, D19; NOT a provider signal) | Alias |
| `onLocationChange(pos)` | Called like `onChange` (de-duplicated; the detail is a superset of LatLng). Like v2's first `idle`, also called ONCE after `ready` with the current value (source `api`), but only when a value is set: v2 always had a position (Tripoli or geolocation), while an unset v3 picker has none, and reporting the 20,0 world view would fill hidden inputs with a fake location | **Changed** (not called after `ready` while unset) |
| `useAdvancedMarker` | `marker: 'advanced'` (Google; needs `mapId`, else `MAP_ID_REQUIRED` + CSS pin); also selects `google` | Alias |
| `destroy()` | Removes the created map, every listener and every node | Kept (bug fixed) |
| `import 'location-picker/style.css'` | Still exported (now optional: auto-adopt is the default), with a types stub | Kept |
| `.map` (sync `google.maps.Map`, v1/v2) | `undefined` until `ready`; SYNC with `provider: googleProvider()` on a page with classic Google loaded | **Break** (one-line fix) |
| Implicit Google provider (v2) | Google is selected by `apiKey`/`mapId`/`useAdvancedMarker`/3rd argument. Otherwise OSM, with a console hint | **Break** (zero public v2 users found) |
| Tripoli fallback | World view (20, 0) at zoom 2, unset | Removed (#7); kept in the v1 file |
| `.centerMarker` / PNG pin | Class mode: `.lp-pin.centerMarker` (alias kept). Element: `::part(pin)`. SVG + CSS variables | Changed (the v1 file keeps the PNG/SVG v1 look) |
| v2 d.ts (global `google`, CSS import, extensionless specifiers) | Fixed per LOCKED 10 | Fixed (#2) |
| `"type": "module"`, `engines.node >= 18` | `"type": "commonjs"` with `.mjs`/`.cjs`; no `engines` | Changed (deep `.mjs`/`.cjs` paths kept) |
| GPL `LICENSE` text | MIT; the README/CHANGELOG grant MIT for all prior versions too | Fixed (LOCKED 1) |
<!-- prettier-ignore-end -->

(D17, D19, LOCKED 1, 7 and 10 refer to decisions in the v3 design record; the table is copied from it unchanged.)

## Breaks, changed defaults and changed behaviour

- **`.map` is `undefined` until `ready`** (Break). v1 and v2 created the Google map synchronously in the constructor. In v3 the engine loads first. Wait for `await picker.ready`, use the `ready` event, or pass an adapter object on a page that already loaded Google Maps with a classic script tag: then `picker.map` is set before the constructor returns.
- **Google is no longer implicit** (Break). Without `provider: 'google'`, `apiKey`, `mapId`, `useAdvancedMarker` or a 3rd constructor argument, v3 uses OpenStreetMap. A loaded `google.maps` global is never sniffed; it only triggers a one-time console hint.
- **No location prompt on load** (Default changed). The `setCurrentPosition` option defaulted to `true` in v1 and v2. In v3 the locate control defaults to `'off'`; `setCurrentPosition: true` still maps to `locate: 'auto'`. Prefer `locate: 'button'`, which prompts only when clicked.
- **`onLocationChange`** (Changed) is called like `onChange`, plus once after `ready` when a value is set. An unset picker does not report the world view as a position.
- **The pin** (Changed) is an SVG themed with `--lp-pin-color`, `--lp-pin-size` and friends. In class mode it keeps the `centerMarker` class, so `.location-picker .centerMarker { display: none }` still hides it. On the element, use `location-picker::part(pin)`.
- **Package format** (Changed): `"type": "commonjs"` with `.mjs`/`.cjs` files and no `engines` field. `import` and `require` resolve as before.
- **The Tripoli fallback is gone** (Removed). With no `value` and no `center`, v3 shows a world view and stays unset.
- **`setLocation()` commits**: it fires `input` and `change` (source `api`).
- **`getMarkerPosition()` while unset** returns the view centre and warns once. Read the user's choice from `value` (`""` while unset) or `valueAsLatLng` (`null` while unset).

## v1 script tag to v3

v1 pages typically created the picker, listened for Google's `idle` event and copied the position into hidden inputs:

<!-- prettier-ignore-start -->
<!-- doctest:skip "v1 code shown for comparison; it needs the real Google Maps JavaScript API" -->
```html
<div id="map" style="height: 400px"></div>
<input type="hidden" name="lat" id="lat" /><input type="hidden" name="lng" id="lng" />
<script src="https://maps.googleapis.com/maps/api/js?key=YOUR_BROWSER_KEY"></script>
<script src="https://unpkg.com/location-picker/dist/location-picker.min.js"></script>
<script>
  var lp = new locationPicker('map', { setCurrentPosition: true }, { zoom: 15 });
  google.maps.event.addListener(lp.map, 'idle', function () {
    var p = lp.getMarkerPosition();
    document.getElementById('lat').value = p.lat;
    document.getElementById('lng').value = p.lng;
  });
</script>
```
<!-- prettier-ignore-end -->

In v3 the element fills the same inputs itself, on OpenStreetMap with no key, and the locate button replaces the automatic prompt:

```html
<form method="post" action="/places">
  <location-picker
    lat-input="lat"
    lng-input="lng"
    locate="button"
    required
    style="height: 400px"
  ></location-picker>
  <input type="hidden" name="lat" id="lat" /><input type="hidden" name="lng" id="lng" />
  <button>Save</button>
</form>
<script src="https://cdn.jsdelivr.net/npm/location-picker@3"></script>
```

To stay on Google Maps, add `provider="google" api-key="YOUR_BROWSER_KEY"` (see [providers.md](providers.md#google-maps)).

## v2 to v3

The class keeps its v2 name, constructor signature and methods. Map the options:

| v2                                       | v3                                                                       |
| ---------------------------------------- | ------------------------------------------------------------------------ |
| `setCurrentPosition: true` (the default) | `locate: 'auto'`, or better `locate: 'button'`                           |
| `lat: 45.5, lng: -73.56`                 | `value: { lat: 45.5, lng: -73.56 }` or `value: '45.5,-73.56'`            |
| `onLocationChange: (p) => …`             | `onChange: (detail) => …` (`detail` has `lat`, `lng`, `value`, `source`) |
| `useAdvancedMarker: true`                | `marker: 'advanced'` with `mapId` (Google only)                          |
| 3rd argument `{ zoom: 3, … }`            | `zoom: 3` and `mapOptions: { … }`, with `provider: 'google'`             |
| implicit Google                          | `provider: googleProvider()` or `apiKey`                                 |
| `import 'location-picker/style.css'`     | optional; styles are adopted automatically                               |

A v2 Google picker that needs `picker.map` right away:

```ts
import { LocationPicker } from 'location-picker/core';
import { googleProvider } from 'location-picker/google';

const picker = new LocationPicker<google.maps.Map>('map', {
  provider: googleProvider(),
  value: { lat: 45.5, lng: -73.56 },
  locate: 'button',
  onChange: (d) => console.log(d.source, d.lat, d.lng),
});
picker.map?.setOptions({ mapTypeId: 'hybrid' }); // set synchronously when Google Maps is already loaded
```

The same picker on OpenStreetMap, without a key:

```ts
import { LocationPicker } from 'location-picker';

const picker = new LocationPicker('#map', {
  value: '45.5,-73.56',
  locate: 'button',
  onChange: (d) => console.log(d.value),
});
await picker.ready;
```

`setCurrentPosition()` still returns a promise, now with a `LocationDetail`. It rejects with a `LocationPickerError` whose `code` is `GEOLOCATION_DENIED`, `GEOLOCATION_UNAVAILABLE`, `GEOLOCATION_TIMEOUT`, `GEOLOCATION_UNSUPPORTED` or `ABORTED`, and it never hangs.

## v1 and v3 on the same page

The frozen v1 file defines the lowercase global `locationPicker`; the v3 script build defines `LocationPicker` and `<location-picker>`. Both can be loaded on one page, so a site can migrate one form at a time.

## License

From 2.1.0 the package ships the MIT License text, and the author grants the MIT License for all prior versions of location-picker as well.
