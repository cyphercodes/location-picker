# Troubleshooting

Problems are reported loudly. Failures fire an `error` event whose detail is a `LocationPickerError` with a stable `code` and a one-line `fix`; if nothing handles the event, it is logged as `[location-picker] <what happened>. Fix: <fix>`. Configuration slips (unknown options, misspelled attributes, a clamped latitude) are one-time `console.warn` lines. Every error code and its fix is listed in [errors.md](errors.md).

To handle errors yourself, listen for `error` and call `preventDefault()` to stop the console log, or pass an `onError` callback to the class:

```html
<location-picker id="loc" name="location"></location-picker>
<script src="https://cdn.jsdelivr.net/npm/location-picker@3"></script>
<script>
  document.getElementById('loc').addEventListener('error', (e) => {
    e.preventDefault(); // handled here, so it is not logged
    console.warn(e.detail.code, e.detail.fix);
  });
</script>
```

Promises (`ready`, `locate()`, `geocode()`, `lookupAddress()`) reject with the same error type instead of firing `error`.

## `<location-picker>` stays empty

- **Only `location-picker/core` was imported.** `core` is the side-effect-free class. `import 'location-picker'` (or `location-picker/element`, or the script tag) defines the element.
- **The script URL is the v1 file.** `…/location-picker/dist/location-picker.min.js` without a version is the frozen v1 build, which defines the global `locationPicker` and no element. Use `https://cdn.jsdelivr.net/npm/location-picker@3`.
- **The engine failed to load** (`ENGINE_LOAD_FAILED`, `ENGINE_MISSING`, `API_KEY_MISSING`). The picker then shows an error message and a text input for typing coordinates, so the form stays usable. Put your own content in `slot="error"`.

## The map is grey, blank or unstyled

- **Leaflet's CSS did not apply** (`ENGINE_CSS_MISSING`). Load `leaflet.css` on the page, set `engine-css-url`, or allow `https://cdn.jsdelivr.net` in your CSP `style-src` ([csp.md](csp.md)).
- **Tiles are blocked.** Check the network panel and your CSP `img-src`. Tile failures leave the map interactive, and commits still work.
- **The class target has no height.** A `LocationPicker` target that measures 0 px tall gets `min-block-size: 320px` and a one-time warning. Give it a height. The element is 320px tall by default.
- **Inside tabs, a `<dialog>` or `display: none`.** Nothing to do: the picker resizes and re-centres on the value when it becomes visible.

## `locationPicker is not defined` or `LocationPicker is not defined`

The lowercase `locationPicker` global belongs to the v1 file (`dist/location-picker.min.js`). The v3 script build (`location-picker@3`) defines `LocationPicker` (capital L) and the `<location-picker>` element. Both can be on one page.

## Nothing is submitted

- Give the picker a `name` (or `lat-name`/`lng-name`), or bind existing inputs with `lat-input`/`lng-input`.
- A `disabled` picker, or one inside `<fieldset disabled>`, submits nothing, like any input.
- jQuery `.serialize()` skips custom elements. Use bound inputs or `new FormData(form)`.
- An unset picker submits an empty value (`location=`). Add `required` to make the user choose.

## The form does not submit, and the browser complains about a control that is "not focusable"

A hidden input has `required`. Remove it and put `required` on `<location-picker>`.

## The value ignores my `lat`/`lng` bindings

`lat` and `lng` set the initial value only. Once the control is dirty (any pan, commit or `value` write, including the `el.value = ''` that Vue `v-model` and Angular `writeValue` perform on mount), changing them is ignored with the warning "lat/lng only set the initial value; bind value="lat,lng" or call setLocation()". Bind `value` instead.

## The value looks swapped or clamped

- Everything is **latitude first**. `"2.2945,48.8584"` is a valid point in the Indian Ocean, not Paris; the picker cannot detect that swap.
- A string with a latitude outside [-90, 90] is rejected with `INVALID_VALUE` and a hint such as `did you swap lat and lng? try "45,120"`.
- Numbers and objects are clamped instead: `setLocation(95, 10)` commits `"90,10"` and warns "latitude 95 was clamped to 90; did you swap lat and lng? try (10, 95)".
- Arrays are rejected (`INVALID_VALUE`), because `[lat, lng]` and GeoJSON's `[lng, lat]` are ambiguous.
- A `maps.app.goo.gl` short link cannot be expanded in the browser: open it and copy the full URL.

## `getMarkerPosition()` warns or returns 20,0

While the picker is unset, `getMarkerPosition()` returns the view centre (the 20,0 world view by default), not a chosen location, and warns once. Read `value` (`""` while unset) or `valueAsLatLng` (`null` while unset).

## React: handlers or properties are ignored

- `onError`, `onAddressChange` and `onReady` never fire on the element. Use the lowercase `onerror`, `onaddresschange` and `onready`; `location-picker/jsx/react` flags the wrong spelling as a type error.
- After `hydrateRoot` (Next.js App Router, Remix), React applies neither object props (`messages`, `geocoder`, …) nor lowercase native handlers. Set them in a ref callback: see the [React hydration recipe](frameworks.md#react-19-and-nextjs).
- React 18 sets attributes rather than properties, so binding `value` needs React 19.

## Google Maps

- **The picker shows OpenStreetMap although Google is loaded.** Google is never chosen implicitly. Add `provider="google"` (or `api-key`). The console hint `google.maps is loaded but no provider was chosen` says the same.
- **`API_KEY_MISSING`.** Add `api-key="YOUR_KEY"`, or load the Google Maps JS API before the picker.
- **`GOOGLE_AUTH_FAILED`.** Check the key's HTTP-referrer restrictions, billing, and that the Maps JavaScript API is enabled.
- **`MAP_ID_REQUIRED`.** `marker="advanced"` needs `map-id`; the CSS pin is used until then.
- **Search does nothing** (`GEOCODER_FAILED`). Enable Places API (New) for the key. On old pages that load Google with a classic script tag and no `importLibrary`, add `libraries=places`.
- **A pinch zoom changed the value.** On Google Maps a pinch zooms around the fingers, so the centre moves and the new centre is committed. Wheel, double-click and the zoom buttons stay anchored at the pin.

## The wheel scrolls the page instead of zooming

With the default `gesture-handling="auto"`, a page that scrolls gets cooperative gestures, so the map does not trap the scroll inside a form. Hold Ctrl (⌘ on Apple platforms) while scrolling, use the zoom buttons, or set `gesture-handling="greedy"`.

## Geolocation

- **The locate button is missing.** It is hidden when the page is not a secure context (use HTTPS or localhost) or the browser has no geolocation. In an iframe, the frame needs `allow="geolocation"`.
- **`GEOLOCATION_DENIED`, `GEOLOCATION_UNAVAILABLE`, `GEOLOCATION_TIMEOUT`.** `locate()` rejects with these codes. It never hangs: it uses a 10 s `timeout` plus a watchdog 30 s later, which also covers an unanswered permission prompt. Adjust with the `geolocation` property (`{ timeout: 5000 }`).
- **Nothing prompted on load.** That is the default. Use `locate="button"` (prompts on click) or `locate="auto"` (also tries once on load while unset).

## Search returns nothing

- Queries need at least 3 characters. Coordinates (`48.85, 2.29`, a map URL) jump directly without a request.
- The public Photon endpoint is fair-use and throttles heavy use. For production, self-host Photon or use a commercial endpoint ([providers.md](providers.md#photon)).
- Check your CSP `connect-src` for `https://photon.komoot.io`.
- `GEOCODER_MISMATCH` means the geocoder is not allowed with this map provider (for example Photon results on a Google map). Use the provider's own geocoder or a custom one with a matching `pairsWith`.

## Two copies of the library on one page

The ESM build, the CommonJS build and the script build share one global store, so Leaflet and Google are loaded once and the element is defined once (a warning appears if the versions differ). `instanceof LocationPickerElement` can still be false across copies; check with `customElements.get('location-picker')` or duck typing.

## Component tests in jsdom or happy-dom

These environments lack form internals, `ResizeObserver` and constructable stylesheets. The element then runs inert: it logs one message naming the missing API, never throws, and `value`, `valueAsLatLng` and `setLocation()` still round-trip. Test maps and forms in a real browser.

## Still stuck?

Open an issue with the `code` and `fix` from the console, how you load the library (script tag, npm entry), the provider, and a minimal page that reproduces it: https://github.com/cyphercodes/location-picker/issues
