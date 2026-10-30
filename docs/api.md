# API reference

Every public export of `location-picker`, entry point by entry point. The descriptions quote the JSDoc that ships
in the package's `.d.ts` files, so your editor shows the same text on hover.

**Conventions**

- Latitude first, always. A value string is the canonical `"lat,lng"`: dot decimal, no spaces, `precision`
  decimals, trailing zeros trimmed, never `-0` (for example `"48.85837,2.294481"`).
- One name per concept: class option `fooBar` = element property `fooBar` = attribute `foo-bar` (the hyphen-less
  `foobar` is accepted too). Event `x` = class callback `onX`. The one exception is the locate control: option and
  attribute `locate`, readable property `locateMode`, because `locate()` is the method.
- Property writes are silent, like a native `<input>`. User gestures and method calls emit `input` (final value),
  then `change`, with `detail.source`.

**Entry points**

| Import                                                | Side effect                      | Section                                             |
| ----------------------------------------------------- | -------------------------------- | --------------------------------------------------- |
| `location-picker`                                     | defines `<location-picker>`      | [root](#location-picker)                            |
| `location-picker/element`                             | defines `<location-picker>`      | [element](#location-pickerelement)                  |
| `location-picker/core`                                | none                             | [core](#location-pickercore)                        |
| `location-picker/utils`                               | none (DOM-free)                  | [utils](#location-pickerutils)                      |
| `location-picker/leaflet`                             | none                             | [leaflet](#location-pickerleaflet)                  |
| `location-picker/google`                              | none                             | [google](#location-pickergoogle)                    |
| `location-picker/maplibre`                            | none                             | [maplibre](#location-pickermaplibre)                |
| `location-picker/photon`                              | none                             | [photon](#location-pickerphoton)                    |
| `location-picker/webmcp`                              | none                             | [webmcp](#location-pickerwebmcp)                    |
| `location-picker/global`                              | runs the IIFE (`<script>` build) | [global](#location-pickerglobal)                    |
| `location-picker/style.css`                           | CSS                              | [style.css](#location-pickerstylecss)               |
| `location-picker/v1`                                  | v1 CSS injection                 | [v1](#location-pickerv1)                            |
| `location-picker/dist/location-picker.min.js`         | v1 CSS injection                 | [v1 file](#location-pickerdistlocation-pickerminjs) |
| `location-picker/jsx/{react,preact,solid,vue,svelte}` | none (types only)                | [jsx](#location-pickerjsxreact)                     |

Error codes and their fixes: [errors.md](errors.md). Behaviour in forms: [forms.md](forms.md).

## `location-picker`

The root entry. `import 'location-picker'`, `import { LocationPicker } from 'location-picker'` and the jsDelivr
`+esm` build all define `<location-picker>` as a side effect (no-op on the server). For a side-effect-free,
class-only import use `location-picker/core`.
CJS: `require('location-picker')` returns `{ LocationPicker, default: LocationPicker, LocationPickerElement, ... }`
(the v2 shape). The v1 shape `new (require(...))()` lives at `require('location-picker/v1')`.

- `export * from 'location-picker/core'`
- `export * from 'location-picker/element'`
- `export { default } from 'location-picker/core'`

## `location-picker/element`

- `export type { ChangeSource }`

### `LocationPickerElementEventMap`

Type: `type LocationPickerElementEventMap = Omit<HTMLElementEventMap, 'input' | 'change' | 'error'> & { input: CustomEvent<LocationDetail>; change: CustomEvent<LocationDetail>; addresschange: CustomEvent<AddressDetail>; ready: CustomEvent<ReadyDetail<unknown>>; error: CustomEvent<LocationPickerError>; }`

Element event map: native HTMLElement events with `input`/`change`/`error` replaced by the picker's CustomEvents.

### `LocationPickerElement`

Class (`extends HTMLElement`).

`<location-picker>`: a form-associated custom element (ElementInternals) that renders into an open shadow root
(`delegatesFocus: true`). On the server it extends an inert stub, so importing it never throws; it is only
defined where `customElements` exists.

Value model: unset (`value === ""`, `:state(unset)`) until the user pans, presses Enter/confirm, picks a search
result or locates, or until `value` is set. The `value` ATTRIBUTE is the default value (applies while not dirty).
Form reset returns to the first of: the `value` attribute, the `lat` + `lng` attributes, the bound inputs' seed
defaults (their server-rendered `value` attributes, captured when the picker first read them; re-reading is not
possible because writing an `<input type="hidden">` rewrites its attribute), unset, and then writes that value into
the bound inputs silently. Live state (`value`, `zoom`, `address`) is
never reflected to attributes. Live state survives a disconnect and reconnect (e.g. Vue `<KeepAlive>`).

In SSR-hydrated React (`hydrateRoot`, e.g. Next.js), React does not apply custom-element PROPERTIES or native
`on*` listeners during hydration: set `messages`, `mapOptions`, `engine`, `geocoder`, `geolocation` and
`addresschange`/`ready`/`error` listeners in a ref callback. Attributes, `value` and `onChange`/`onInput` work.

Field mode (`presentation="field"`, or `"auto"` on phones): a compact control shows the address or coordinates and a
"Choose on map" button; the map opens in a full-screen modal sheet and the value changes only on Confirm. The engine
loads on first open, so `ready` resolves then.

**Attributes:**

- `value`: Default value, lenient ("48.8584, 2.2945", DMS, geo:, map URLs). "," or empty = unset.
- `lat`: Default-value alias, needs `lng` too. `value` wins.
- `lng`: Default-value alias, needs `lat` too.
- `center`: View centre while unset ("lat,lng").
- `zoom`: Initial zoom.
- `max-zoom`
- `precision`
- `name`
- `lat-name`
- `lng-name`
- `address-name`
- `value-input`
- `lat-input`
- `lng-input`
- `address-input`
- `required`
- `disabled`
- `readonly`
- `provider`: leaflet | google | maplibre.
- `api-key`
- `map-id`
- `tile-url`
- `attribution`
- `map-style`
- `engine-url`: URL, or "none" to never auto-load.
- `engine-css-url`: URL, or "none".
- `search`
- `placeholder`
- `reverse-geocode`
- `locate`: off | button | auto ("" = button). Writing the `locate` PROPERTY (as React 19/Vue 3/Preact do for this attribute) also sets it; reading it returns the method.
- `marker`: pin | none | advanced.
- `gesture-handling`
- `webmcp`
- `presentation`: inline | field | auto (field where `(pointer: coarse) and (max-width: 640px)` matches).

**Events:**

- `input`: CustomEvent<LocationDetail>: live user changes, and the final value before every change and at the end of every gesture.
- `change`: CustomEvent<LocationDetail>: committed (user gesture or method call), de-duplicated.
- `addresschange`: CustomEvent<AddressDetail>.
- `ready`: CustomEvent<ReadyDetail>.
- `error`: CustomEvent<LocationPickerError> (cancelable; logged when not canceled).
- `toggle`: ToggleEvent: the field-mode sheet opened (`newState` "open") or closed ("closed").

**CSS parts:** `base`, `search`, `search-input`, `search-listbox`, `search-option`, `map`, `pin`, `pin-icon`, `pin-shadow`, `confirm-button`, `controls`, `locate-button`, `hint`, `error-message`, `fallback`.

Field mode adds `field` (the compact control), `field-value` (the address, the coordinates or the placeholder), `field-button` (opens the sheet), `sheet` (the full-screen `<dialog>` holding the map), `sheet-header` (its title bar with Cancel and Confirm; Confirm is a `confirm-button`) and `cancel-button` (closes the sheet without changing the value).

**Slots:**

- `marker`: Custom pin graphic, anchored by its bottom-centre at the map centre.
- `controls`: Extra buttons placed with the built-in controls.
- `error`: Content shown when the map fails to load.

**Custom states (`:state(…)`):** `unset`, `loading`, `ready`, `error`, `dragging`, `locating`, `searching`, `interacted`, `open` (field mode: the sheet is open).

**CSS custom properties (`name=default`):**

- `--lp-pin-color=#e11d48`
- `--lp-pin-inner=#fff`
- `--lp-pin-size=44px`: height; width is size × 28/44
- `--lp-pin-lift=10px`
- `--lp-pin-shadow=rgb(0 0 0 / .35)`
- `--lp-unset-opacity=.6`
- `--lp-accent=light-dark(#1d4ed8, #93c5fd)`
- `--lp-surface=light-dark(#fff, #1f1f1f)`
- `--lp-on-surface=light-dark(#1f2937, #f3f4f6)`
- `--lp-radius=8px`
- `--lp-control-size=44px`
- `--lp-font=inherit`
- `--lp-tile-filter=none`
- `--lp-transition=160ms ease-out`

<!-- prettier-ignore-start -->
<!-- doctest:skip "JSDoc fragment quoted from api.d.ts" -->
```html
<form method="post">
  <label for="loc">Store location</label>
  <location-picker id="loc" name="location" lat-name="lat" lng-name="lng" required search></location-picker>
</form>
```
<!-- prettier-ignore-end -->

**Members:**

- `formAssociated` (static, read-only): `true`.
- `observedAttributes` (static, read-only): `readonly string[]`.
- `version` (static, read-only): `string`. Example: `customElements.get('location-picker').version // "3.0.0"`
- `value`: get `string`, set `LatLngInput | null`. Live value: canonical `"lat,lng"` or `""` (unset). Setting is SILENT, marks the control dirty, accepts any LatLngInput or `""`/null. A string that does not parse warns (INVALID_VALUE) and clears; an object is normalised (latitude clamped with a warning). Never reflected. Default: `defaultValue`.
- `defaultValue`: `string`. Reflects the `value` attribute. Applies while not dirty. Form reset returns to it when it is non-empty (otherwise to the `lat`/`lng` attributes, then the bound-input seed defaults; see the class JSDoc). Default: `""`.
- `valueAsLatLng`: get `LatLng | null`, set `LatLngInput | null`. Live value as an object, or null. Setting is silent. Default: `null`.
- `lat`: get `number | null`, set `number | string | null`. Live latitude, or null while unset. SETTING writes the `lat` attribute, which sets the INITIAL value only (like `defaultValue`; latitude clamped with a warning): it applies while the control is not dirty. Once dirty (any pan, commit or `value` write, including the `el.value = ''` that Vue `v-model` and Angular `writeValue` do on mount), a changed `lat`/`lng` is ignored and logs one warning: "lat/lng only set the initial value; bind value="lat,lng" or call setLocation()". To control the position, bind `value`. Default: `null`.
- `lng`: get `number | null`, set `number | string | null`. Live longitude, or null while unset. SETTING writes the `lng` attribute: initial value only (see `lat`). Default: `null`.
- `name`: `string`. FormData entry `name=lat,lng` (the library appends it itself; the UA ignores host `name` for FormData values). Default: `""`.
- `latName`: `string`. Separate FormData entry for latitude. Default: `""`. Example: `el.latName = 'lat'`
- `lngName`: `string`. Separate FormData entry for longitude. Default: `""`.
- `addressName`: `string`. FormData entry for the address (`""` while unknown). Default: `""`.
- `valueInput`: `string`. Id or selector of an existing input that receives `"lat,lng"` (native events as for `latInput`). Default: `""`.
- `latInput`: `string`. Id or selector of an existing input that receives the latitude; also seeds the initial value. Native events: `input` live, `input` + `change` on commits, none for silent writes; non-bubbling when the input is inside the element (see `LocationPickerOptions.latInput`). Default: `""`. Example: `el.latInput = 'lat'`
- `lngInput`: `string`. Same as `latInput`, for longitude. Default: `""`.
- `addressInput`: `string`. Id or selector of an existing input that receives the address. Default: `""`.
- `form`: get `HTMLFormElement | null`, set `string | null`. The form owner (`internals.form`). Writes the `form` content attribute (a form id); `null` or `""` removes it. Lets React 19 render `form="f1"` without a TypeError.
- `labels` (read-only): `NodeListOf<HTMLLabelElement>`.
- `type` (read-only): `'location-picker'`. Always "location-picker".
- `required`: `boolean`. Default: `false`.
- `disabled`: `boolean`. Default: `false`.
- `readOnly`: `boolean`. View-only (zoom allowed); barred from constraint validation. Attribute `readonly`. Default: `false`.
- `validity` (read-only): `ValidityState`.
- `validationMessage` (read-only): `string`.
- `willValidate` (read-only): `boolean`.
- `checkValidity`: `(): boolean`.
- `reportValidity`: `(): boolean`. Focuses the map region and shows the validation bubble there.
- `setCustomValidity`: `(message: string): void`.
- `center`: get `string`, set `LatLngInput | null`. View centre while unset, as canonical "lat,lng" ("" = world view 20,0). Setting accepts any LatLngInput (strings parsed, objects normalised). Default: `""`.
- `zoom`: `number`. Live zoom; the attribute is the initial zoom. Default: 15 with value/center, else 2.
- `maxZoom`: `number`. Default: 19 for OSM tiles; engine maximum otherwise (NaN when unset).
- `precision`: `number`. Decimal places of the value (0–10). Default: `6`.
- `provider`: get `ProviderName | ProviderAdapter`, set `ProviderName | ProviderAdapter | string`. Provider name (reflected) or adapter object (property only). Changing it remounts and keeps the coordinates. When the resolved provider NAME changes (e.g. google -> leaflet), the address is cleared silently (`address`, the `address-name` entry, `address-input`), because Google content must not appear next to a non-Google map (ToS §3.2.3(e)) and vice versa; with `reverse-geocode` on, the new provider's paired geocoder looks it up again after `ready`. Default: 'leaflet' ('google' when api-key or map-id is set).
- `apiKey`: `string`. Default: `""`.
- `mapId`: `string`. Default: `""`.
- `tileUrl`: `string`. Default: `"https://tile.openstreetmap.org/{z}/{x}/{y}.png"`.
- `attribution`: `string`. Default: OSM credit.
- `mapStyle`: `string`. Default: `"https://tiles.openfreemap.org/styles/liberty"`.
- `engineUrl`: `string`. Engine JS URL; "none" = never auto-load; "" = default (pinned jsDelivr Leaflet). Default: `""`.
- `engineCssUrl`: `string`. Engine CSS URL; "none" = you provide it (copied from readable document CSS); "" = default order. Default: `""`.
- `engine`: `object | null`. Engine namespace (`L`, `maplibregl`, `google.maps`). Property only. Default: `null`.
- `mapOptions`: `Record<string, unknown>`. Passed to the engine map constructor. Property only. Changing it remounts. Default: `{}`.
- `search`: `boolean`. Default: `false`.
- `placeholder`: `string`. Default: `messages.searchPlaceholder`.
- `reverseGeocode`: `boolean`. Default: `false`.
- `geocoder`: `Geocoder | GeocodeFn | false | null`. Custom geocoder; false disables geocoding. Property only. Default: null (provider pair).
- `locateMode`: `LocateMode`. Locate-control mode; ATTRIBUTE `locate` (the one R3 exception, because `locate()` is the method). Reflects to `locate`. Default: `'off'`.
- `geolocation`: `PositionOptions`. Passed to navigator.geolocation by the locate button and `locate()`. Property only (object). Default: `{ enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 }`.
- `marker`: `MarkerMode`. Pin mode; a custom graphic goes in `slot="marker"`. Default: `'pin'`.
- `gestureHandling`: `GestureHandling`. Default: `'auto'`.
- `webmcp`: `boolean`. Register WebMCP tools (prefix from id, then name). For options use `registerWebMcpTools()`. Default: `false`.
- `presentation`: get `'inline' | 'field' | 'auto'`, set `'inline' | 'field' | 'auto' | null`. `inline`: the map in the page. `field`: a compact control (the address or coordinates, and a "Choose on map" button) that opens the map in a full-screen modal sheet; the value changes only on Confirm, and the engine loads on first open. `auto`: `field` while `(pointer: coarse) and (max-width: 640px)` matches, else `inline` (re-evaluated when it changes, never while the sheet is open). Form participation, names and events are the same in every mode. Reflects to `presentation`. Default: `'inline'`. Example: `<location-picker presentation="auto" name="location" search locate="button" required></location-picker>`
- `messages`: `Partial<Messages>`. UI text overrides. Property only. Default: `{}`.
- `address` (read-only): `string | null`. Address of the current value, or null.
- `map` (read-only): `unknown`. Engine map instance; undefined until ready.
- `ready` (read-only): `Promise<this>`. Resolves when the current mount is ready. Replaced SYNCHRONOUSLY by any setter that schedules a remount (and on reconnect after a teardown), so `el.provider = 'google'; await el.ready; el.map` sees the new map. The promise itself never triggers `unhandledrejection`; a promise derived from it (`await`, `.then()` without a rejection handler) does: add `.catch()`, or use the `ready`/`error` events.
- `getMarkerPosition`: `(): LatLng`. See `LocationPicker.getMarkerPosition` (warns once when called while unset; read `valueAsLatLng` instead).
- `setLocation`: `(lat: number, lng: number, options?: SetLocationOptions): void`. Commit (source "api"; fires input then change). Throws INVALID_VALUE for a string that does not parse; numbers/objects are normalised (see the class). Example: `el.setLocation(48.8584, 2.2945)`
- `setLocation`: `(position: LatLngInput, options?: SetLocationOptions): void`.
- `locate`: get `(options?: LocateOptions) => Promise<LocationDetail>`, set `LocateMode | '' | boolean | null`. Reading returns the locate METHOD (bound to this element; same function every time), so `el.locate()` works as on the class (@see LocationPicker.locate). WRITING sets the locate-control mode: `'off' | 'button' | 'auto' | ''` (`''` and `true` = `'button'`; `false`/`null` remove the `locate` attribute). It exists because React 19, Vue 3 and Preact assign `locate="button"` as a property (`'locate' in el` is true); without the setter they would overwrite the method with a string. Read the mode from `locateMode`. Example: `const { lat, lng } = await el.locate();`
- `setCurrentPosition`: `(options?: LocateOptions): Promise<LocationDetail>`. v1/v2 alias of `locate()` that keeps the current zoom (v2 only re-centred).
- `geocode`: `(query: string, options?: GeocodeOptions): Promise<GeocodeResult[]>`. See `LocationPicker.geocode`.
- `lookupAddress`: `(at?: LatLngInput, options?: GeocodeOptions): Promise<GeocodeResult | null>`. See `LocationPicker.lookupAddress`.
- `showPicker`: `(): void`. Field mode: opens the map sheet (a modal `<dialog>`; fires `toggle`). The map shows the value, or `center`, and nothing changes until Confirm. In inline mode it does nothing and warns once. Example: `el.showPicker()`
- `close`: `(): void`. Field mode: closes the sheet as Cancel does (the value stays as it was; fires `toggle`, no `input`/`change`).
- `addEventListener`: `<K extends keyof LocationPickerElementEventMap>(type: K, listener: (this: LocationPickerElement, ev: LocationPickerElementEventMap[K]) => unknown, options?: boolean | AddEventListenerOptions): void`.
- `addEventListener`: `(type: string, listener: EventListenerOrEventListenerObject, options?: boolean | AddEventListenerOptions): void`.
- `removeEventListener`: `<K extends keyof LocationPickerElementEventMap>(type: K, listener: (this: LocationPickerElement, ev: LocationPickerElementEventMap[K]) => unknown, options?: boolean | EventListenerOptions): void`.
- `removeEventListener`: `(type: string, listener: EventListenerOrEventListenerObject, options?: boolean | EventListenerOptions): void`.

### `defineLocationPicker`

Function: ``defineLocationPicker(tagName?: `${string}-${string}`): typeof LocationPickerElement | undefined``

Defines the element. Idempotent: returns the existing constructor when the tag is taken by ANY copy of this
library (warns once if versions differ). Returns undefined where `customElements` does not exist (server).
Other tag names register a trivial subclass. Importing `location-picker` or `location-picker/element` already
calls this with the default tag.

Default: tagName 'location-picker'. Example: `defineLocationPicker('geo-picker')`

### `LocationPickerAttributes`

Interface.

Attribute-spelled props for JSX/templates (kebab-case is SSR-correct; hyphen-less spellings are also accepted at
runtime). React 19, Vue 3 and Preact assign a non-hyphenated prop as a PROPERTY when `key in el`; every such key
here (`value`, `lat`, `lng`, `center`, `zoom`, `precision`, `name`, `form`, `required`, `disabled`, `provider`,
`attribution`, `search`, `placeholder`, `locate`, `marker`, `webmcp`, `presentation`) has a setter with the
attribute's meaning.

**Members:**

- `value`: `string` (optional).
- `lat`: `number | string` (optional).
- `lng`: `number | string` (optional).
- `center`: `string` (optional).
- `zoom`: `number | string` (optional).
- `max-zoom`: `number | string` (optional).
- `precision`: `number | string` (optional).
- `name`: `string` (optional).
- `lat-name`: `string` (optional).
- `lng-name`: `string` (optional).
- `address-name`: `string` (optional).
- `value-input`: `string` (optional).
- `lat-input`: `string` (optional).
- `lng-input`: `string` (optional).
- `address-input`: `string` (optional).
- `form`: `string` (optional).
- `required`: `boolean` (optional).
- `disabled`: `boolean` (optional).
- `readonly`: `boolean` (optional).
- `provider`: `ProviderName` (optional).
- `api-key`: `string` (optional).
- `map-id`: `string` (optional).
- `tile-url`: `string` (optional).
- `attribution`: `string` (optional).
- `map-style`: `string` (optional).
- `engine-url`: `string` (optional).
- `engine-css-url`: `string` (optional).
- `search`: `boolean` (optional).
- `placeholder`: `string` (optional).
- `reverse-geocode`: `boolean` (optional).
- `locate`: `LocateMode | ''` (optional).
- `marker`: `MarkerMode` (optional).
- `gesture-handling`: `GestureHandling` (optional).
- `webmcp`: `boolean` (optional).
- `presentation`: `'inline' | 'field' | 'auto'` (optional).

### `HTMLElementTagNameMap`

Global augmentation (`declare global`).

**Members:**

- `location-picker`: `LocationPickerElement`.

## `location-picker/core`

- `export * from 'location-picker/utils'`
- `export default LocationPicker`

### `version`

Constant: `version: string`

Library version.

Example: `version // "3.0.0"`

### `ProviderName`

Type: `type ProviderName = 'leaflet' | 'google' | 'maplibre'`

Built-in map providers. Aliases `"osm"`/`"openstreetmap"` -> `leaflet`, `"googlemaps"`/`"google-maps"` -> `google` are accepted with a warning.

### `ChangeSource`

Type: `type ChangeSource = 'user' | 'api' | 'geolocation' | 'search'`

What caused a committed change. Method calls (`setLocation()`) and WebMCP report `"api"`.

### `LocateMode`

Type: `type LocateMode = 'off' | 'button' | 'auto'`

Locate-me control. `"button"`: a button that prompts only on click (hidden without a secure context). `"auto"`: also try once on load when no value is set (PROMPTS for permission).

### `MarkerMode`

Type: `type MarkerMode = 'pin' | 'none' | 'advanced'`

Centre marker. `"none"` hides it (issue #9). `"advanced"` = Google AdvancedMarkerElement (Google only; needs `mapId`).

### `GestureHandling`

Type: `type GestureHandling = 'auto' | 'cooperative' | 'greedy' | 'none'`

Gesture policy. `"auto"`: Google's own auto; on Leaflet/MapLibre it is `"cooperative"` (Ctrl/⌘ + wheel to zoom,
with a hint) when the page itself scrolls at mount time, otherwise `"greedy"`. `"none"`: no gestures (buttons/keys only).

### `InputRef`

Type: `type InputRef = string | HTMLInputElement | HTMLTextAreaElement`

An input to write into: an element, an id (tried first) or a CSS selector, resolved in the picker's root node.

### `Bounds`

Interface.

Axis-aligned bounds, lat-first. `west > east` means the box crosses the antimeridian.

**Members:**

- `south`: `number`.
- `west`: `number`.
- `north`: `number`.
- `east`: `number`.

### `LocationDetail`

Interface (`extends LatLng`).

Detail of `input` and `change`. `lat`, `lng` and `value` are always consistent:
`parseLatLng(value)` deep-equals `{ lat, lng }` (all rounded to `precision`).

Example: `picker.addEventListener('change', (e) => save(e.detail.lat, e.detail.lng, e.detail.address));`

**Members:**

- `value`: `string`. Canonical form value. Example: `"48.85837,2.294481"`
- `source`: `ChangeSource`. What caused the change. Example: `"user"`
- `zoom`: `number`. Zoom at the time of the event. Example: `15`
- `address`: `string | null`. Address when known at commit time (search pick, cached reverse result); otherwise null. See `addresschange`. Default: `null`.
- `accuracy`: `number` (optional). Metres; present only for `source === "geolocation"`. Default: `undefined`.
- `place`: `GeocodeResult` (optional). The search result that produced this value; present only for `source === "search"`. Default: `undefined`.

### `AddressDetail`

Interface (`extends LatLng`).

Detail of `addresschange`: the address for the CURRENT value resolved (stale results are dropped).

**Members:**

- `value`: `string`. The value the address belongs to. Example: `"48.85837,2.294481"`
- `address`: `string | null`. null when the lookup failed or found nothing. Example: `"Champ de Mars, 75007 Paris, France"`
- `result`: `GeocodeResult | null`. The raw result, or null.

### `ReadyDetail`

Interface.

Detail of `ready`.

**Members:**

- `provider`: `string`. Resolved provider name. Example: `"leaflet"`
- `map`: `TMap`. The engine map instance (L.Map, google.maps.Map, maplibregl.Map).

### `LocationPickerEventMap`

Interface.

Events dispatched by `LocationPicker` (on the instance) and `<location-picker>` (on the element).

| event         | bubbles | composed | cancelable | fires                                                                                                                                                                                                                                                                     |
| ------------- | ------- | -------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| input         | yes     | yes      | no         | live during a user gesture (at most once per animation frame, source "user"); once with the final value right before EVERY `change`; and at the end of a gesture whenever the final value differs from the last emitted `input`, even when `change` is de-duplicated away |
| change        | yes     | no       | no         | committed: end of a user pan/keyboard move, Enter/confirm, search pick, geolocation, and METHOD calls (`setLocation`, `locate`, WebMCP). Never for property writes, form reset or restore. De-duplicated on the rounded value.                                            |
| addresschange | yes     | yes      | no         | address for the current value resolved (reverse geocode or search pick)                                                                                                                                                                                                   |
| ready         | no      | no       | no         | engine map mounted (again after each remount); always async                                                                                                                                                                                                               |
| error         | no      | no       | YES        | async failure; if no listener calls `preventDefault()` (and no `onError`), it is logged with its fix                                                                                                                                                                      |

**Members:**

- `input`: `CustomEvent<LocationDetail>`.
- `change`: `CustomEvent<LocationDetail>`.
- `addresschange`: `CustomEvent<AddressDetail>`.
- `ready`: `CustomEvent<ReadyDetail<TMap>>`.
- `error`: `CustomEvent<LocationPickerError>`.

### `GeocodeResult`

Interface (`extends LatLng`).

One geocoder result.

Example: `{ lat: 48.8584, lng: 2.2945, label: 'Eiffel Tower', address: 'Avenue Anatole France, 75007 Paris, France' }`

**Members:**

- `label`: `string`. Display text for the result list. Example: `"Eiffel Tower"`
- `address`: `string` (optional). Postal-style one-line address when known. Default: `undefined`.
- `bounds`: `Bounds` (optional). Extent to fit when picked (areas); the pin still lands on `lat`/`lng`. Default: `undefined`.
- `id`: `string` (optional). Provider id (Photon osm_id, Google place id). Default: `undefined`.
- `raw`: `unknown` (optional). Untouched provider payload (Photon GeoJSON Feature, google.maps.places.Place, google.maps.GeocoderResult).

### `GeocodeSearchOptions`

Interface.

Context passed to `Geocoder.search`.

**Members:**

- `signal`: `AbortSignal`. Aborted when a newer query starts or the picker is destroyed.
- `near`: `LatLng`. Current map centre, for result bias.
- `limit`: `number`. Maximum results wanted. Default: `5`.
- `lang`: `string`. BCP 47 language tag. Example: `"fr"`

### `GeocodeReverseOptions`

Interface.

Context passed to `Geocoder.reverse`.

**Members:**

- `signal`: `AbortSignal`.
- `lang`: `string`.
- `zoom`: `number`. Current zoom (lets a geocoder pick street vs city granularity).

### `Geocoder`

Interface.

A geocoder. Implement either method or both; a missing method disables that feature.
Pairing rule (Google Maps Platform ToS §3.2.3(e)): a geocoder whose `pairsWith` excludes the active provider is
refused with `GEOCODER_MISMATCH` and search is disabled. A custom geocoder without `pairsWith` works with every
provider; YOU are responsible for its terms (never show non-Google results on a Google map).

Example: ``const geocoder: Geocoder = { search: async (q, { signal }) => (await fetch(`/geo?q=${encodeURIComponent(q)}`, { signal })).json() };``

**Members:**

- `pairsWith` (read-only): `readonly string[]` (optional). Providers whose maps may display these results. Default: undefined (any). Example: `['leaflet', 'maplibre']`
- `search`: `(query: string, options: GeocodeSearchOptions): Promise<GeocodeResult[]>`. Forward geocoding for the search box and `geocode()`.
- `reverse`: `(at: LatLng, options: GeocodeReverseOptions): Promise<GeocodeResult | null>`. Reverse geocoding for `reverseGeocode` and `lookupAddress()`.
- `attribution` (read-only): `string` (optional). Extra attribution HTML appended to the map attribution while this geocoder is active. Default: `undefined`.

### `GeocodeFn`

Type: `type GeocodeFn = (query: string, options: GeocodeSearchOptions) => Promise<GeocodeResult[]>`

Shorthand: a bare function acts as `Geocoder.search`.

Example: `geocoder: (q, { signal }) => myApi.search(q, signal)`

### `Messages`

Interface.

UI strings. English is built in; override any subset with `messages`. Form values are never localised.

**Members:**

- `label`: `string`. Accessible name when no `<label>`/`aria-label` exists. Default: `"Location picker"`.
- `roleDescription`: `string`. Default: `"map"`.
- `instructions`: `string`. Screen-reader help for the map region. Default: `"Drag the map or use the arrow keys to move the pin; plus and minus zoom. Press Enter to choose the point under the pin."`.
- `confirm`: `string`. Confirm button shown while unset when a `center` was given; in field mode, the sheet's Confirm button. Default: `"Use this location"`.
- `locate`: `string`. Locate button label. Default: `"Use my location"`.
- `locating`: `string`. Default: `"Finding your location…"`.
- `searchLabel`: `string`. Accessible label of the search box. Default: `"Search for a place or paste coordinates"`.
- `searchPlaceholder`: `string`. Default: `"Search or paste coordinates"`.
- `noResults`: `string`. Default: `"No results"`.
- `goTo`: `(coords: string) => string`. Offline option shown when the query parses as coordinates. Default: (coords) => `Go to ${coords}`.
- `announce`: `(detail: LocationDetail) => string`. Live-region text after a commit (polite, 700 ms debounce; never during panning). Default: (d) => `Location set: ${d.lat.toFixed(5)}, ${d.lng.toFixed(5)}${d.address ? '. ' + d.address : ''}`.
- `valueMissing`: `string`. Validation message for `required`. Default: `"Please choose a location on the map."`.
- `geolocationDenied`: `string`. Default: `"Location permission was denied."`.
- `geolocationUnavailable`: `string`. Default: `"Your location is unavailable."`.
- `geolocationTimeout`: `string`. Default: `"Finding your location took too long."`.
- `geolocationUnsupported`: `string`. Default: `"Location needs HTTPS and a browser that supports it."`.
- `cooperativeHint`: `string`. Cooperative-gesture hint. Default: "Use Ctrl + scroll to zoom the map" ("⌘ + scroll" on Apple platforms).
- `loadError`: `string`. Shown when the engine fails to load. Default: `"The map could not be loaded. Type coordinates instead."`.
- `fallbackLabel`: `string`. Label of the fallback coordinate input shown after a load failure. Default: `"Latitude, longitude"`.
- `chooseOnMap`: `string`. Field mode: the button that opens the map sheet. Default: `"Choose on map"`.
- `fieldPlaceholder`: `string`. Field mode: the field text while no location is chosen. Default: `"No location selected"`.
- `cancel`: `string`. Field mode: the sheet's Cancel button. Default: `"Cancel"`.

### `LocationPickerErrorCode`

Type: `type LocationPickerErrorCode = | 'TARGET_NOT_FOUND' | 'INVALID_VALUE' | 'INVALID_OPTION' | 'ENGINE_MISSING' | 'ENGINE_LOAD_FAILED' | 'ENGINE_CSS_MISSING' | 'API_KEY_MISSING' | 'GOOGLE_AUTH_FAILED' | 'MAP_ID_REQUIRED' | 'GEOCODER_MISMATCH' | 'GEOCODER_MISSING' | 'GEOCODER_FAILED' | 'GEOLOCATION_UNSUPPORTED' | 'GEOLOCATION_DENIED' | 'GEOLOCATION_UNAVAILABLE' | 'GEOLOCATION_TIMEOUT' | 'ABORTED'`

Stable error codes. `level` (see `LocationPickerError.level`) decides how an unhandled `error` event is logged.
Default level per code (the `ERROR_TABLE`); the only per-case override is listed in the last column:

| level                                                                                                                | codes                                                                                                                                                          | per-case override                                            |
| -------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| `error` (console.error)                                                                                              | TARGET_NOT_FOUND, INVALID_OPTION, ENGINE_MISSING, ENGINE_LOAD_FAILED, API_KEY_MISSING, GOOGLE_AUTH_FAILED, GEOCODER_MISMATCH, GEOCODER_MISSING                 | INVALID_OPTION for "only one of `lat`/`lng` given" is `warn` |
| `warn` (console.warn)                                                                                                | INVALID_VALUE, ENGINE_CSS_MISSING, MAP_ID_REQUIRED, GEOCODER_FAILED, GEOLOCATION_UNSUPPORTED, GEOLOCATION_DENIED, GEOLOCATION_UNAVAILABLE, GEOLOCATION_TIMEOUT | –                                                            |
| `silent` (never logged)                                                                                              | ABORTED                                                                                                                                                        | –                                                            |
| Unknown provider names are INVALID_OPTION at `error`. Console diagnostics (unknown keys, wrong-guess attributes,     |
| name/bound-input collisions, a 0-height target, a clamped latitude) are separate `console.warn` lines, never events. |

### `LocationPickerError`

Class (`extends Error`).

Every thrown error, every promise rejection and every `error` event detail.
`message` format: `"[location-picker] <what happened>. Fix: <fix>"`.
Geolocation codes come from the numeric `GeolocationPositionError.code` (which is NOT an `Error` instance; it is
kept as `cause`).

<!-- prettier-ignore-start -->
<!-- doctest:skip "JSDoc fragment quoted from api.d.ts" -->
```ts
try { await picker.locate(); } catch (e) {
  if (e instanceof LocationPickerError && e.code === 'GEOLOCATION_DENIED') showHelp(e.fix);
}
```
<!-- prettier-ignore-end -->

**Members:**

- `constructor`: `(code: LocationPickerErrorCode, message?: string, options?: { fix?: string; cause?: unknown })`. Parameter `code`: stable code. Parameter `message`: human text; the built-in text for `code` when omitted. Parameter `options`: `fix` (one-line remedy; built-in when omitted) and `cause`.
- `name` (read-only): `'LocationPickerError'`.
- `code` (read-only): `LocationPickerErrorCode`. Stable, documented code. Example: `"GEOLOCATION_DENIED"`
- `fix` (read-only): `string`. One-line, machine-readable remedy for humans and agents. Example: `'Add api-key="YOUR_KEY", or load the Google Maps JS API before the picker.'`
- `level` (read-only): `'error' | 'warn' | 'silent'`. How an unhandled `error` event with this error is logged.
- `cause` (read-only): `unknown` (optional). Underlying failure (GeolocationPositionError, script `error` Event, fetch error, AbortSignal reason).

### `SetLocationOptions`

Interface.

Options for `LocationPicker.setLocation`.

**Members:**

- `zoom`: `number` (optional). Also set the zoom. Default: current zoom.
- `animate`: `boolean` (optional). Animate the move. Ignored under prefers-reduced-motion. Default: `false`.

### `LocateOptions`

Interface (`extends PositionOptions`).

Options for `LocationPicker.locate`. Defaults merge over the picker's `geolocation` option.

**Members:**

- `signal`: `AbortSignal` (optional). Aborting rejects with `ABORTED` and leaves the value unchanged.

### `GeocodeOptions`

Interface.

Options for `LocationPicker.geocode` and `LocationPicker.lookupAddress`.

**Members:**

- `signal`: `AbortSignal` (optional).
- `limit`: `number` (optional). Default: `5`.

### `LocationPickerOptions`

Interface.

Options for `new LocationPicker(target, options)`. Every key also exists on `<location-picker>` as a property and
(for primitives) a kebab-case attribute, except: callbacks, `injectStyles`, `signal`, deprecated keys.
Unknown keys log a warning that lists the valid keys.

**Members:**

- `provider`: `ProviderName | ProviderAdapter<TMap>` (optional). Map provider: a built-in name (its adapter is lazy-loaded) or an adapter object from `location-picker/leaflet` | `/google` | `/maplibre` (statically imported; enables synchronous `.map`). Resolution when omitted: `apiKey`, `mapId`, `marker: 'advanced'`, `useAdvancedMarker` or a 3rd constructor argument select `'google'`; otherwise `'leaflet'`. A loaded `google.maps` global is NEVER sniffed (it only triggers a one-time console.info hint). Default: `'leaflet'`. Example: `{ provider: 'google', apiKey: 'AIza…' }`
- `value`: `LatLngInput | null` (optional). Initial committed value. `null` = unset (form value ""). Lenient: any `LatLngInput`. A string that does not parse logs `INVALID_VALUE` and leaves the value unset; an object is normalised (latitude clamped with a warning). Default: `null`. Example: `{ value: '48.8584,2.2945' }`
- `center`: `LatLngInput` (optional). Where the view starts while the value is unset. Never becomes the value by itself. Default: { lat: 20, lng: 0 } (world view). Example: `{ center: '33.8938,35.5018' }`
- `zoom`: `number` (optional). Initial zoom. Default: 15 when `value` or `center` is given, else 2. Example: `{ zoom: 12 }`
- `maxZoom`: `number` (optional). Maximum zoom. Default: 19 (OSM tiles); the engine's own maximum for Google/MapLibre.
- `precision`: `number` (optional). Decimal places of the committed value (6 is about 0.11 m). Default: `6`. Example: `{ precision: 5 }`
- `disabled`: `boolean` (optional). No interaction at all; controls disabled. Default: `false`.
- `readOnly`: `boolean` (optional). View-only: zoom allowed, the value cannot change (no pan, search or locate). Default: `false`.
- `marker`: `MarkerMode | HTMLElement` (optional). Centre marker; an element replaces the SVG (anchored by its bottom-centre). Default: `'pin'`. Example: `{ marker: 'none' }`
- `gestureHandling`: `GestureHandling` (optional). Default: `'auto'`. Example: `{ gestureHandling: 'greedy' }`
- `locate`: `LocateMode | boolean` (optional). Locate-me control. `true` = `"button"`, `false` = `"off"`. Never prompts on load unless `"auto"`. Default: `'off'`. Example: `{ locate: 'button' }`
- `geolocation`: `PositionOptions` (optional). Passed to navigator.geolocation. A watchdog also rejects with GEOLOCATION_TIMEOUT after `timeout + 30000` ms (covers an unanswered permission prompt). Default: `{ enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 }`.
- `search`: `boolean` (optional). Search box (Photon for Leaflet/MapLibre, Google PlaceAutocompleteElement for Google). Typed or pasted coordinates jump directly with no network call. Default: `false`. Example: `{ search: true }`
- `placeholder`: `string` (optional). Search box placeholder. Default: `messages.searchPlaceholder`.
- `reverseGeocode`: `boolean` (optional). Reverse-geocode each committed value (debounced 400 ms, cached), firing `addresschange`. Default: `false`.
- `geocoder`: `Geocoder | GeocodeFn | false` (optional). Replace the provider's paired geocoder; `false` disables geocoding entirely. Default: the provider's pair (Photon / Google). Example: `{ geocoder: photonGeocoder({ url: 'https://photon.example.org/api' }) }`
- `latInput`: `InputRef` (optional). Existing input that receives the rounded latitude and seeds the initial value. It mirrors the picker's events: native `input` for live changes, `input` + `change` on commits, nothing for silent writes (property writes, reset, restore). Its events are dispatched BEFORE the picker's own `input`/`change`. They bubble, except on an input inside a `<location-picker>` ELEMENT (progressive enhancement), where they are non-bubbling so the host only ever sees its own CustomEvents (class mode always bubbles: its events go to the instance, not the DOM). Listeners on the input itself (Livewire `wire:model`, Alpine `x-model`, jQuery) still fire. Example: `{ latInput: '#lat' }`
- `lngInput`: `InputRef` (optional). Same as `latInput`, for longitude. Example: `{ lngInput: '#lng' }`
- `valueInput`: `InputRef` (optional). Receives the canonical `"lat,lng"` string. Example: `{ valueInput: '#location' }`
- `addressInput`: `InputRef` (optional). Receives the address ("" while unknown). Needs `search` or `reverseGeocode`. Example: `{ addressInput: '#address' }`
- `messages`: `Partial<Messages>` (optional). UI text overrides. Default: `English`. Example: `{ messages: { locate: 'Ma position' } }`
- `lang`: `string` (optional). BCP 47 language for UI, Photon `lang` (when supported) and Google `language`. Default: closest [lang], then navigator.language.
- `injectStyles`: `boolean` (optional). Adopt the picker CSS into the target's root node (adoptedStyleSheets; `<style nonce>` fallback). `false` + `import 'location-picker/style.css'` for strict CSP. Default: `true`.
- `nonce`: `string` (optional). CSP nonce for any `<script>`, `<link>` or `<style>` the library inserts. Default: nonce of the document's first `script[nonce]`.
- `webmcp`: `boolean` (optional). Register WebMCP tools (experimental; no-op when unsupported). Lazy-loads `location-picker/webmcp`. Default: `false`. **3.0:** on the class this option does not register tools yet (it arrives in 3.1); call `registerWebMcpTools(picker)` instead. The element's `webmcp` attribute works.
- `signal`: `AbortSignal` (optional). Aborting it calls `destroy()`.
- `apiKey`: `string` (optional). Google browser key (restrict by HTTP referrer). Injects Google's official inline bootstrap if google.maps is absent. Selects `provider: 'google'` when `provider` is omitted.
- `mapId`: `string` (optional). Google map ID; needed only for `marker: 'advanced'`. Selects `'google'` when `provider` is omitted.
- `tileUrl`: `string` (optional). Leaflet raster tile URL template, or (MapLibre) an XYZ template wrapped into a raster style. Use your own/commercial tiles in production. Default: `'https://tile.openstreetmap.org/{z}/{x}/{y}.png'`.
- `attribution`: `string` (optional). Attribution HTML, always visible. Forced to the OSM credit while `tileUrl` is the default; a custom `tileUrl` without it logs a warning. Default: `'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'`.
- `mapStyle`: `string | object` (optional). MapLibre style URL or object. Default: `'https://tiles.openfreemap.org/styles/liberty'`.
- `engine`: `object` (optional). Engine namespace you already have (`L` from 'leaflet', `maplibregl`, `google.maps`). Default: globalThis.L / globalThis.maplibregl / globalThis.google.maps.
- `engineUrl`: `string | false` (optional). Engine JS to auto-load when the engine is absent; `false` = never load (ENGINE_MISSING instead). SRI is applied only to the pinned default. MapLibre: an ESM URL loaded with import(), opt-in, no default. Ignored by Google. Default: pinned jsDelivr leaflet@1.9.4 (Leaflet); none (MapLibre).
- `engineCssUrl`: `string | false` (optional). Engine CSS URL; `false` = you provide it (document CSS is copied into shadow roots when readable). MapLibre never fetches CSS unless this is a URL. Default: see CONTRACT.md §4.3 resolution order.
- `mapOptions`: `Record<string, unknown>` (optional). Passed to the engine's map constructor; wins over library defaults. Default: `{}`. Example: `{ mapOptions: { mapTypeId: 'hybrid' } }`
- `onInput`: `(detail: LocationDetail) => void` (optional). Same as `addEventListener('input')`, receives `detail`.
- `onChange`: `(detail: LocationDetail) => void` (optional). Same as `addEventListener('change')`, receives `detail`. Example: `{ onChange: ({ lat, lng, source }) => save(lat, lng) }`
- `onAddressChange`: `(detail: AddressDetail) => void` (optional). Same as `addEventListener('addresschange')`.
- `onReady`: `(detail: ReadyDetail<TMap>) => void` (optional). Same as `addEventListener('ready')`.
- `onError`: `(error: LocationPickerError) => void` (optional). Same as `addEventListener('error')`. Its presence marks errors as handled (they are not logged).
- `onLocationChange`: `(detail: LocationDetail) => void` (optional). **Deprecated.** v2. Called like `onChange` (de-duplicated; the detail is a superset of LatLng). Like v2, it is also
  called ONCE after `ready` with the current value (source `"api"`), but only when a value is set: an unset picker
  has no position to report.
- `lat`: `number` (optional). **Deprecated.** v1/v2. Use `value`. Used only when both `lat` and `lng` are finite; 0 is valid; latitude is clamped into [-90, 90] with a warning. NOT a provider signal.
- `lng`: `number` (optional). **Deprecated.** v1/v2. Use `value`.
- `setCurrentPosition`: `boolean` (optional). **Deprecated.** v1/v2. `true` -> `locate: 'auto'`. The v1 default was true; v3 default is `'off'`.
- `useAdvancedMarker`: `boolean` (optional). **Deprecated.** v2. -> `marker: 'advanced'` (Google only; needs `mapId`). Selects `'google'` when `provider` is omitted.

### `LocationPicker`

Class (`extends EventTarget`).

Imperative picker. Renders into a light-DOM container YOU own: `target` keeps its children; the picker appends one
`div.lp-base` wrapper holding `.lp-map`, `.lp-pin.centerMarker` (v1 alias), `.lp-controls`, `.lp-status` (plus
`.lp-search` when `search` is on). State classes (`lp-is-unset`, `lp-is-dragging`, …) live on `.lp-base`, never on
`target`, so a framework that rewrites `target.className` breaks nothing. The picker also adds the class
`location-picker` to `target` (only for v1 CSS overrides such as `.location-picker .centerMarker{display:none}`)
and, when `target` computes `position: static`, an inline `position: relative`. Re-constructing on the same target
destroys the previous instance.
Not a form control: use `<location-picker>` for forms, or bind inputs with `latInput`/`lngInput`.

<!-- prettier-ignore-start -->
<!-- doctest:skip "JSDoc fragment quoted from api.d.ts" -->
```ts
const picker = new LocationPicker('#map', { search: true, onChange: (d) => console.log(d.value) });
await picker.ready;
const chosen = picker.valueAsLatLng; // null until the user chose a point
```
<!-- prettier-ignore-end -->

**Members:**

- `constructor`: `(target: string | HTMLElement, options?: LocationPickerOptions<TMap>)`. Parameter `target`: an element, an id (`"map"`, tried first) or a CSS selector (`"#map"`). Throws `TARGET_NOT_FOUND`,
  or `INVALID_OPTION` if `target` is a `<location-picker>` (use the element directly).. Parameter `options`: see `LocationPickerOptions`.
- `constructor`: `(target: string | HTMLElement, options: LocationPickerOptions<TMap> | undefined, mapOptions: Record<string, unknown>)`. **Deprecated.** v1/v2 signature. The 3rd argument is merged into `options.mapOptions` and selects
  `provider: 'google'` unless `options.provider` is set (logs one deprecation warning).
- `version` (static, read-only): `string`. Example: `LocationPicker.version // "3.0.0"`
- `element` (read-only): `HTMLElement`. The target element (v1/v2 `.element`).
- `container` (read-only): `HTMLElement`. The map container div the picker created inside `element`.
- `provider` (read-only): `string`. Resolved provider name. Example: `"leaflet"`
- `map` (read-only): `TMap | undefined`. Engine map (L.Map, google.maps.Map, maplibregl.Map). `undefined` until `ready`, except when an adapter OBJECT is passed and its engine is already present: then it is set synchronously in the constructor.
- `ready` (read-only): `Promise<this>`. Resolves when the map is mounted and interactive; rejects with LocationPickerError. The promise itself never triggers `unhandledrejection` when ignored. A promise you DERIVE from it (`await`, or `.then()` without a rejection handler) rejects like any other promise: add `.catch()`, or use the `ready`/`error` events. Example: `picker.ready.then((p) => p.map).catch((e) => console.warn(e.code));`
- `value`: get `string`, set `LatLngInput | null`. Committed canonical `"lat,lng"`, or `""` while unset. Setting is SILENT (no events) and accepts any LatLngInput or `""`/null to clear. A string that does not parse warns (INVALID_VALUE) and clears; an object is normalised (latitude clamped with a warning). Default: `""`.
- `valueAsLatLng`: get `LatLng | null`, set `LatLngInput | null`. Committed value as an object, or null while unset. Setting is silent. Default: `null`.
- `address` (read-only): `string | null`. Address of the current value (search pick or reverse geocode), or null.
- `zoom`: `number`. Live zoom. Setting zooms around the pin and never changes the value.
- `disabled`: `boolean`. Default: `false`.
- `readOnly`: `boolean`. Default: `false`.
- `locateMode`: `LocateMode`. Locate-control mode (option `locate`). Default: `'off'`.
- `getMarkerPosition`: `(): LatLng`. v1/v2: the current map centre (the point under the pin), normalised, unrounded. Never null: before the map exists it returns the value, else the centre. While the picker is UNSET this is only the view centre (e.g. the 20,0 world view), not a chosen location, and the first such call logs one console warning. To read the user's choice, use `valueAsLatLng` (null while unset) or `value` (`""` while unset). Example: `const { lat, lng } = picker.getMarkerPosition();`
- `setLocation`: `(lat: number, lng: number, options?: SetLocationOptions): void`. Move the pin and COMMIT (fires `input` then `change` with source `"api"` when the rounded value changed). Throws `INVALID_VALUE` for a string that does not parse. Numbers and objects are normalised: `setLocation(95, 10)` commits `"90,10"` and logs one warning ("latitude 95 was clamped to 90; did you swap lat and lng? try (10, 95)"). Example: `picker.setLocation(48.8584, 2.2945)`
- `setLocation`: `(position: LatLngInput, options?: SetLocationOptions): void`. Example: `picker.setLocation('48.8584, 2.2945', { zoom: 17 })`
- `locate`: `(options?: LocateOptions): Promise<LocationDetail>`. Geolocate and commit (source `"geolocation"`; zoom becomes max(current, 17)). Rejects with GEOLOCATION_UNSUPPORTED | GEOLOCATION_DENIED | GEOLOCATION_UNAVAILABLE | GEOLOCATION_TIMEOUT | ABORTED; never hangs. Does not fire `error` (the promise is the channel). Example: `const { lat, lng } = await picker.locate();`
- `setCurrentPosition`: `(options?: LocateOptions): Promise<LocationDetail>`. v1/v2 alias of `LocationPicker.locate` that keeps the current zoom (v2 only re-centred). Same promise, errors and `change` (source `"geolocation"`).
- `geocode`: `(query: string, options?: GeocodeOptions): Promise<GeocodeResult[]>`. Forward-geocode with the paired (or custom) geocoder; results are NOT committed. A query that parses as coordinates returns one offline result. Rejects GEOCODER_MISSING / GEOCODER_FAILED / ABORTED. Example: `const [best] = await picker.geocode('Eiffel Tower');`
- `lookupAddress`: `(at?: LatLngInput, options?: GeocodeOptions): Promise<GeocodeResult | null>`. Reverse-geocode `at` (default: the current value); cached. When `at` is the current value, also updates `address` and fires `addresschange`. Example: `const r = await picker.lookupAddress(); console.log(r?.address);`
- `destroy`: `(): void`. Idempotent. Removes the DOM and listeners the picker created, removes the map it created, aborts pending work (pending promises reject with ABORTED).
- `addEventListener`: `<K extends keyof LocationPickerEventMap<TMap>>(type: K, listener: (this: this, ev: LocationPickerEventMap<TMap>[K]) => unknown, options?: boolean | AddEventListenerOptions): void`.
- `addEventListener`: `(type: string, listener: EventListenerOrEventListenerObject | null, options?: boolean | AddEventListenerOptions): void`.
- `removeEventListener`: `<K extends keyof LocationPickerEventMap<TMap>>(type: K, listener: (this: this, ev: LocationPickerEventMap<TMap>[K]) => unknown, options?: boolean | EventListenerOptions): void`.
- `removeEventListener`: `(type: string, listener: EventListenerOrEventListenerObject | null, options?: boolean | EventListenerOptions): void`.

### `MapEvents`

Interface.

Engine -> core notifications. Adapters MUST call these from engine events; the core does rounding, normalisation, de-duplication and source attribution.

**Members:**

- `move`: `(center: LatLng): void`. Centre moved for any reason (Leaflet/MapLibre `move`, Google `center_changed`). Raw centre is fine.
- `moveEnd`: `(center: LatLng, zoom: number): void`. Camera settled (Leaflet/MapLibre `moveend`, Google `idle`).
- `interactionStart`: `(): void`. A user gesture began (pointerdown, wheel, key). Marks the next commit as source "user".
- `interactionEnd`: `(): void`. The gesture ended (drives `:state(dragging)` and the pin lift).

### `ProviderMountOptions`

Interface.

Resolved provider-relevant options handed to adapters (factory options win over these).

**Members:**

- `apiKey` (read-only): `string` (optional).
- `mapId` (read-only): `string` (optional).
- `tileUrl` (read-only): `string` (optional).
- `attribution` (read-only): `string` (optional).
- `mapStyle` (read-only): `string | object` (optional).
- `engine` (read-only): `object` (optional).
- `engineUrl` (read-only): `string | false` (optional).
- `engineCssUrl` (read-only): `string | false` (optional).
- `mapOptions` (read-only): `Readonly<Record<string, unknown>>`.
- `maxZoom` (read-only): `number` (optional).
- `marker` (read-only): `MarkerMode | 'element'`.
- `search` (read-only): `boolean`.

### `MountContext`

Interface.

Everything an adapter may use. Adapters never write outside `container` (LOCKED 5).

**Members:**

- `container` (read-only): `HTMLElement`. Empty div owned by location-picker and sized by the host. Create the map inside it; never touch its siblings.
- `root` (read-only): `Document | ShadowRoot`. Where engine CSS must go: the Document (class) or the element's ShadowRoot.
- `view` (read-only): `{ readonly center: LatLng; readonly zoom: number }`. Initial camera.
- `gestureHandling` (read-only): `GestureHandling`. As configured. Leaflet/MapLibre resolve `"auto"` with `pageScrolls`; Google passes it through natively.
- `pageScrolls` (read-only): `boolean`. True when the document itself scrolls at mount time (`auto` then means cooperative on Leaflet/MapLibre).
- `interactive` (read-only): `'full' | 'zoom-only' | 'none'`. `"full"` pan+zoom, `"zoom-only"` (readOnly), `"none"` (disabled).
- `lang` (read-only): `string`. BCP 47.
- `colorScheme` (read-only): `'light' | 'dark' | 'auto'`. From the host's computed CSS `color-scheme`.
- `options` (read-only): `ProviderMountOptions`.
- `signal` (read-only): `AbortSignal`. Aborted on destroy or remount.
- `events` (read-only): `MapEvents`.
- `nonce` (read-only): `string | undefined`. CSP nonce to put on inserted elements, if any.
- `loadScript`: `(src: string, integrity?: string): Promise<void>`. Inserts a classic `<script>` once per URL per document (nonce, crossorigin="anonymous", optional SRI); resolves on load, rejects with ENGINE_LOAD_FAILED.
- `loadStylesheet`: `(href: string, integrity?: string): Promise<void>`. Adds `<link rel=stylesheet>` to `root` once per URL, with the nonce, and with `crossorigin="anonymous"` whenever `integrity` is given (SRI requires CORS; without it the browser blocks the sheet). A custom URL without `integrity` gets no `crossorigin`, so CDNs that send no CORS headers still work. Never rejects: resolves on `load`, on `error` or after 3000 ms; the caller then verifies the engine CSS (ENGINE_CSS_MISSING). Mount never waits for it.
- `adoptDocumentRules`: `(selectorTest: RegExp): Promise<number>`. Copies rules whose selectors match `selectorTest` from readable document stylesheets into a constructed sheet adopted by `root` (no-op for a Document root). Resolves to the number of rules copied (0 if none/unreadable).
- `showHint`: `(text: string): void`. Shows a transient hint over the map (cooperative gestures).
- `report`: `(error: LocationPickerError): void`. Reports a non-fatal or post-mount failure (e.g. Google auth failure) through the `error` event.

### `MapHandle`

Interface.

Live handle to a mounted map.

**Members:**

- `map` (read-only): `TMap`.
- `getCenter`: `(): LatLng`. Raw centre; the core normalises.
- `getZoom`: `(): number`.
- `setView`: `(center: LatLng, zoom: number | undefined, options: { animate: boolean }): void`. Must not report a user interaction.
- `setZoom`: `(zoom: number): void`. Zoom anchored at the centre (never moves the centre).
- `setInteractive`: `(mode: 'full' | 'zoom-only' | 'none'): void`.
- `resize`: `(): void`. Called by the core's ResizeObserver (also after initialising while hidden).
- `drawsMarker` (read-only): `boolean` (optional). True when the adapter draws the marker itself (Google AdvancedMarkerElement); the core then hides its CSS pin. Default: `false`.
- `a11y` (read-only): `'core' | 'engine'` (optional). `"core"`: the core labels the container `role=application`. `"engine"`: the engine renders its own accessible region (Google). Default: `'core'`.
- `destroy`: `(): void`. Release everything the adapter created (listeners, map).

### `SearchContext`

Interface (`extends MountContext`).

Context for a provider-rendered search UI (Google).

**Members:**

- `handle` (read-only): `MapHandle<TMap>`.
- `slot` (read-only): `HTMLElement`. Element to render into (part="search" / `.lp-search`).
- `placeholder` (read-only): `string`.
- `label` (read-only): `string`.
- `select`: `(result: GeocodeResult): void`. Commit a result (source "search"; fires `input` then `change`).

### `SearchHandle`

Interface.

A mounted search UI.

**Members:**

- `element` (read-only): `HTMLElement`.
- `focus`: `(): void`.
- `clear`: `(): void`.
- `destroy`: `(): void`.

### `ProviderAdapter`

Interface.

A map engine adapter. Built-ins: `leafletProvider()`, `googleProvider()`, `maplibreProvider()`.

<!-- prettier-ignore-start -->
<!-- doctest:skip "JSDoc fragment quoted from api.d.ts" -->
```ts
// OpenLayers in ~20 lines (see CONTRACT.md §4.5)
const openlayers: ProviderAdapter<OlMap> = { name: 'openlayers', mount(ctx) { ...; return handle; } };
new LocationPicker('#map', { provider: openlayers });
```
<!-- prettier-ignore-end -->

**Members:**

- `name` (read-only): `string`. Unique id; also the geocoder pairing key and `picker.provider`. Example: `"leaflet"`
- `load`: `(ctx: MountContext): Promise<void> | void`. Load the engine (idempotent, shared across pickers). Omit when the engine is always present.
- `mount`: `(ctx: MountContext): MapHandle<TMap> | Promise<MapHandle<TMap>>`. Create the map inside `ctx.container`. A synchronous return (engine present) makes `picker.map` available synchronously.
- `geocoder`: `Geocoder | ((ctx: MountContext, handle: MapHandle<TMap>) => Geocoder | Promise<Geocoder>)` (optional). Paired geocoder for `search`, `reverseGeocode`, `geocode()`, `lookupAddress()`. Default: undefined (no geocoding unless `geocoder` is set).
- `createSearch`: `(ctx: SearchContext<TMap>): SearchHandle | Promise<SearchHandle>`. Provider-rendered search UI. Without it the built-in combobox over `geocoder.search` is used.

## `location-picker/utils`

location-picker v3: NORMATIVE public declaration surface (FROZEN contract, 2026-10-16).

This single file declares every public entry point of the npm package as an ambient module block. The shipped
package splits the blocks into per-entry `.d.mts` / `.d.cts` files (see CONTRACT.md section 1). Where CONTRACT.md
prose and this file disagree, THIS FILE WINS for names, signatures, defaults and event shapes.

Packaging notes that this single-file form cannot express:

- The `/// <reference types="google.maps" />` directive below exists only so that this file type-checks as one unit.
  In the shipped package it appears ONLY in `dist/google.d.mts` and `dist/google.d.cts` (LOCKED 10). No other
  declaration file references google.maps; `@types/google.maps` is an OPTIONAL peer dependency.

- Relative specifiers in the shipped d.ts files use explicit extensions (`./core.mjs` in `.d.mts`, `./core.cjs` in
  `.d.cts`). This is the spike-verified layout (`"type": "commonjs"`, tsdown `fixedExtension`), and it satisfies
  the intent of LOCKED 10 ("explicit extensions, nodenext-safe").

- No declaration file imports CSS. `location-picker/style.css` has a stub (`export {};`).
- `HTMLElementTagNameMap` is augmented from ONE shared declaration file that both `element.d.mts` and `element.d.cts`
  re-export, so a program that sees both ESM and CJS types never hits TS2717.

- The v1 module additionally ships `export as namespace locationPicker;` (UMD global); that statement is not legal
  inside an ambient module block, so it appears here as a comment.

- JSX augmentations (`declare module 'react' { ... }` etc.) cannot be nested in ambient module blocks; each
  `location-picker/jsx/*` block below documents the exact augmentation in an `@example`.

Conventions used everywhere:

- Latitude first, always. A value string is the canonical `"lat,lng"` (dot decimal, no spaces, `precision` decimals,
  trailing zeros trimmed, never `-0`), e.g. `"48.85837,2.294481"`.

- Naming rule R3: class option `fooBar` == element property `fooBar` == element attribute `foo-bar` (hyphen-less
  `foobar` also accepted). Event `x` == class callback `onX`. The ONE exception: the locate-control mode is the
  option `locate` / attribute `locate`, but the readable PROPERTY is `locateMode`, because `locate()` is the method.
  On the element, `locate` is an accessor: reading it returns the method; WRITING it (what React 19, Vue 3 and
  Preact do for `locate="button"`, because `'locate' in el`) sets the `locate` attribute.

- Every non-hyphenated key of `LocationPickerAttributes` that exists on the element prototype has a setter, so
  frameworks that assign properties when `key in el` never throw or clobber a method.

- Property writes are silent (no events), like native `<input>`. User gestures and METHOD calls emit `input` (final
  value) then `change`, with `detail.source`.

### `LatLng`

Interface.

A WGS84 coordinate in decimal degrees, LATITUDE FIRST. Every value the library emits is normalised:
`lat` in [-90, 90] and `lng` in [-180, 180).

Example: `const eiffel: LatLng = { lat: 48.8584, lng: 2.2945 };`

**Members:**

- `lat`: `number`. Degrees north, in [-90, 90]. Example: `48.8584`
- `lng`: `number`. Degrees east, in [-180, 180). Example: `2.2945`

### `LatLngInput`

Type: `type LatLngInput = | string | LatLng | { lat: number; lon: number } | { latitude: number; longitude: number } | { lat(): number; lng(): number }`

Anything accepted where a position is expected (`value`, `center`, `setLocation()`, `parseLatLng()`).

- Strings are parsed with `parseLatLng` (lenient: "lat, lng", DMS, geo: URIs, map URLs).
- Objects: `{lat, lng}`, `{lat, lon}`, `{latitude, longitude}`, or any object with `lat()`/`lng()` methods
  (google.maps.LatLng, structurally).

- ARRAYS ARE REJECTED on purpose: `[lat, lng]` vs GeoJSON `[lng, lat]` is ambiguous. Passing one logs
  `INVALID_VALUE` with the fix "pass "lat,lng" or {lat, lng}".

Example: `"48.8584,2.2945"` Example: `{ lat: 48.8584, lng: 2.2945 }` Example: `{ latitude: 48.8584, longitude: 2.2945 }`

### `CoordinateFormat`

Type: `type CoordinateFormat = | 'decimal' | 'dms' | 'geo-uri' | 'google-maps-url' | 'osm-url' | 'apple-maps-url' | 'object'`

Which input syntax `parseLatLng` recognised.

### `ParsedLatLng`

Interface (`extends LatLng`).

Result of `parseLatLng`: a normalised coordinate plus what was recognised.

**Members:**

- `zoom`: `number` (optional). Zoom carried by the source (`@lat,lng,17z`, `#map=17/…`, `geo:…?z=17`), when present. Default: `undefined`.
- `format`: `CoordinateFormat`. The syntax that matched. Example: `"google-maps-url"`

### `parseLatLng`

Function: `parseLatLng(input: unknown): ParsedLatLng | null`

Lenient, offline coordinate parser. NEVER throws and NEVER calls the network. Returns `null` when the input is not
a coordinate, when latitude is outside [-90, 90] (no silent swapping), for arrays, and for short links.
The picker uses it for STRING input only (the `value`/`center` attributes, string `value`/`center`/`setLocation()`
arguments). Numeric and object input to the picker goes through `normalizeLatLng` instead, which clamps.

Accepts:

- Decimal pairs with `,` `;` or whitespace between: `"48.8584,2.2945"`, `"48.8584, 2.2945"`, `"48.8584 2.2945"`;
  decimal commas when the pair separator is `;` or whitespace: `"48,8584; 2,2945"`.

- Hemisphere letters (letters decide the order): `"48.8584N 2.2945E"`, `"2.2945E 48.8584N"`, `"S 33.86 E 151.21"`.
- DMS / DDM: `48°51'30.2"N 2°17'40.2"E`, `N 48°51.503' E 2°17.670'`.
- RFC 5870 geo URIs: `"geo:48.8584,2.2945"`, `"geo:48.8584,2.2945;u=10?z=17"`, `"geo:0,0?q=48.8584,2.2945(Label)"`.
- Google Maps URLs: `!3dLAT!4dLNG` (wins over the viewport), `/@lat,lng,17z`, `?q=`, `?query=`, `?ll=`, `?api=1&query=`.
- OpenStreetMap URLs: `#map=17/lat/lng`, `?mlat=&mlon=`. Apple Maps URLs: `?ll=`, `?q=lat,lng`.
- Objects listed in `LatLngInput`.

Rejects (returns `null`): empty strings, `","`, arrays, `|lat| > 90`, `maps.app.goo.gl` / `goo.gl/maps` short
links, plus codes, what3words. Longitude is wrapped into [-180, 180).

Example: `parseLatLng('48.8584, 2.2945') // { lat: 48.8584, lng: 2.2945, format: 'decimal' }` Example: `parseLatLng('https://www.google.com/maps/@48.8584,2.2945,17z') // { lat: 48.8584, lng: 2.2945, zoom: 17, format: 'google-maps-url' }` Example: ``parseLatLng(`48°51'30.2"N 2°17'40.2"E`) // { lat: 48.858389, lng: 2.294500, format: 'dms' } (approx.)`` Example: `parseLatLng('not a place') // null`

### `FormatLatLngOptions`

Interface.

Options for `formatLatLng`.

**Members:**

- `format`: `'decimal' | 'dms'` (optional). Output syntax. Default: `'decimal'`. Example: `{ format: 'dms' }`
- `precision`: `number` (optional). Decimal places (decimal: of degrees; dms: of seconds). Default: 6 for decimal, 1 for dms. Example: `{ precision: 5 }`
- `separator`: `string` (optional). Separator between lat and lng for `decimal`. Default: `','`. Example: `{ separator: ', ' }`

### `formatLatLng`

Function: `formatLatLng(value: LatLngInput, options?: FormatLatLngOptions): string`

Locale-independent formatter. The default output is the canonical form value: latitude first, dot decimal,
`toFixed(precision)` with trailing zeros trimmed, no exponent, never `-0`. Rounds BEFORE normalising, so
`179.9999996` formats as `-180`. Throws `TypeError` for input that `parseLatLng` would reject.

Example: `formatLatLng({ lat: 48.85837009, lng: 2.29448128 }) // "48.85837,2.294481"` Example: `` formatLatLng({ lat: 48.8584, lng: 2.2945 }, { format: 'dms' }) // `48°51'30.2"N 2°17'40.2"E` ``

### `normalizeLatLng`

Function: `normalizeLatLng(value: LatLngInput): LatLng`

Wraps longitude into [-180, 180) and clamps latitude into [-90, 90] (fixes v2 issue #12; LOCKED 7). Accepts any
`LatLngInput`. Throws `TypeError` on non-finite or unparseable input. The picker applies it to every numeric
and object input (`setLocation(lat, lng)`, `{lat, lng}` values, the `lat`/`lng` options, attributes and
properties); when it clamps a latitude, the picker logs one console warning with a swap hint.

Example: `normalizeLatLng({ lat: 10, lng: 52283.36 }) // { lat: 10, lng: -36.64 } (approx.)` Example: `normalizeLatLng({ lat: 91, lng: 190 }) // { lat: 90, lng: -170 }`

### `isLatLng`

Function: `isLatLng(value: unknown): value is LatLng`

Type guard: a plain object with finite numeric `lat` in [-90, 90] and `lng` in [-180, 180].

Example: `if (isLatLng(x)) map.setView([x.lat, x.lng]);`

## `location-picker/leaflet`

### `LeafletMap`

Interface.

Minimal structural view of `L.Map`. Use `LocationPicker<L.Map>` with your own @types/leaflet for full typing.

**Members:**

- `getCenter`: `(): { lat: number; lng: number }`.
- `getZoom`: `(): number`.
- `getContainer`: `(): HTMLElement`.
- `remove`: `(): unknown`.

### `LeafletNamespace`

Interface.

Minimal structural view of the Leaflet namespace (1.9 and 2.x, constructor style).

**Members:**

- `version` (read-only): `string`.
- `Map` (read-only): `new (element: HTMLElement, options?: object) => unknown`.
- `TileLayer` (read-only): `new (url: string, options?: object) => unknown`.

### `LeafletProviderOptions`

Interface.

Options for `leafletProvider`; they win over the picker's provider options.

**Members:**

- `engine`: `LeafletNamespace | object` (optional). `import * as L from 'leaflet'`. Default: globalThis.L, else auto-load the pinned 1.9.4.
- `tileUrl`: `string` (optional). Default: `'https://tile.openstreetmap.org/{z}/{x}/{y}.png'`.
- `attribution`: `string` (optional). Default: `OSM_ATTRIBUTION`.
- `maxZoom`: `number` (optional). Default: `19`.
- `tileOptions`: `Record<string, unknown>` (optional). Extra `L.tileLayer` options. Default: `{}`.
- `engineUrl`: `string | false` (optional). Default: LEAFLET_JS_URL (with LEAFLET_JS_INTEGRITY); false = never auto-load.
- `engineCssUrl`: `string | false` (optional). Default: resolution order in CONTRACT.md §4.3; false = never link CSS.
- `mapOptions`: `Record<string, unknown>` (optional). Merged into `new L.Map(container, …)`, last. Default: `{}`.

### `LEAFLET_VERSION`

Constant: `LEAFLET_VERSION: '1.9.4'`

### `LEAFLET_JS_URL`

Constant: `LEAFLET_JS_URL: 'https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.js'`

### `LEAFLET_JS_INTEGRITY`

Constant: `LEAFLET_JS_INTEGRITY: 'sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo='`

### `LEAFLET_CSS_URL`

Constant: `LEAFLET_CSS_URL: 'https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.css'`

### `LEAFLET_CSS_INTEGRITY`

Constant: `LEAFLET_CSS_INTEGRITY: 'sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY='`

### `OSM_TILE_URL`

Constant: `OSM_TILE_URL: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png'`

### `OSM_ATTRIBUTION`

Constant: `OSM_ATTRIBUTION: string`

`'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'`

### `leafletProvider`

Function: `leafletProvider<TMap = LeafletMap>(options?: LeafletProviderOptions): ProviderAdapter<TMap>`

Leaflet + raster tiles adapter (the keyless default). Zoom is anchored at the centre (wheel, double-click, pinch),
so zooming never changes the value. Paired geocoder: Photon.

<!-- prettier-ignore-start -->
<!-- doctest:skip "JSDoc fragment quoted from api.d.ts" -->
```ts
import * as L from 'leaflet';
import 'leaflet/dist/leaflet.css';
const picker = new LocationPicker<L.Map>('#map', { provider: leafletProvider<L.Map>({ engine: L }) });
picker.map; // L.Map, available synchronously
```
<!-- prettier-ignore-end -->

## `location-picker/google`

### `GoogleProviderOptions`

Interface.

Options for `googleProvider`; they win over the picker's provider options.

**Members:**

- `apiKey`: `string` (optional). Browser key. If google.maps is absent, Google's official inline bootstrap is injected with it.
- `mapId`: `string` (optional). Needed only for `marker: 'advanced'`.
- `version`: `string` (optional). Bootstrap `v`. Default: `'weekly'`.
- `language`: `string` (optional). Bootstrap `language`. Default: the picker's lang.
- `region`: `string` (optional). Bootstrap `region`. Example: `'LB'`
- `mapOptions`: `google.maps.MapOptions` (optional). Merged over the picker defaults (`clickableIcons: false`, `disableDefaultUI: true` + zoom control, `keyboardShortcuts: true`, `fullscreenControl: false`).
- `searchOptions`: `google.maps.places.PlaceAutocompleteElementOptions` (optional). Passed to `new PlaceAutocompleteElement(…)`. Example: `{ includedRegionCodes: ['lb'] }`
- `engine`: `typeof google.maps` (optional). Default: `globalThis.google.maps`.

### `googleProvider`

Function: `googleProvider(options?: GoogleProviderOptions): ProviderAdapter<google.maps.Map>`

Google Maps adapter: map via `importLibrary('maps')` (or a classic, already-loaded `google.maps.Map`, mounted
synchronously); CSS-overlay pin (no Marker, no mapId); AdvancedMarkerElement for `marker: 'advanced'`; search =
PlaceAutocompleteElement (`gmp-select` -> `placePrediction.toPlace()` -> `fetchFields({ fields: ['location',
'formattedAddress'] })`), never legacy `places.Autocomplete`; reverse = google.maps.Geocoder (opt-in). Wheel and
double-click zoom are re-anchored at the centre. `window.gm_authFailure` is chained into GOOGLE_AUTH_FAILED.

Example: `new LocationPicker<google.maps.Map>('#map', { provider: googleProvider({ apiKey: 'AIza…' }), search: true })`

### `googleGeocoder`

Function: `googleGeocoder(options?: { region?: string; language?: string }): Geocoder`

google.maps.Geocoder for reverse lookups and `geocode()` (Geocoding API). `pairsWith: ['google']`.

### `loadGoogleMaps`

Function: `loadGoogleMaps(options: { apiKey: string; version?: string; language?: string; region?: string; nonce?: string }): Promise<typeof google.maps>`

Idempotent: injects Google's official inline bootstrap once (nonce-aware) and resolves after `importLibrary('maps')`.

Example: `const maps = await loadGoogleMaps({ apiKey: 'AIza…' });`

### `GoogleLocationPicker`

Type: `type GoogleLocationPicker = LocationPicker<google.maps.Map>`

### `GoogleLocationPickerOptions`

Type: `type GoogleLocationPickerOptions = LocationPickerOptions<google.maps.Map>`

## `location-picker/maplibre`

### `MapLibreMap`

Interface.

Minimal structural view of `maplibregl.Map`.

**Members:**

- `getCenter`: `(): { lng: number; lat: number }`.
- `getZoom`: `(): number`.
- `getContainer`: `(): HTMLElement`.
- `remove`: `(): void`.

### `MapLibreProviderOptions`

Interface.

Options for `maplibreProvider`.

**Members:**

- `engine`: `object` (optional). `import * as maplibregl from 'maplibre-gl'`. Default: globalThis.maplibregl; otherwise ENGINE_MISSING.
- `mapStyle`: `string | object` (optional). Default: `OPENFREEMAP_STYLE_URL`.
- `engineUrl`: `string` (optional). Opt-in ESM URL loaded with import() (no SRI possible). Default: undefined (never loaded).
- `engineCssUrl`: `string | false` (optional). MapLibre CSS URL to load (opt-in; no SRI unless it is your own pinned file). By default nothing is fetched: readable document CSS is used (copied into shadow roots), else ENGINE_CSS_MISSING (warn) is reported with a fix that shows `import 'maplibre-gl/dist/maplibre-gl.css'` and the exact `engine-css-url` for the running `maplibregl.getVersion()`. Default: undefined (no fetch; `false` is equivalent).
- `mapOptions`: `Record<string, unknown>` (optional). Merged into `new maplibregl.Map(…)`, last. Default: `{}`.

### `OPENFREEMAP_STYLE_URL`

Constant: `OPENFREEMAP_STYLE_URL: 'https://tiles.openfreemap.org/styles/liberty'`

### `maplibreProvider`

Function: `maplibreProvider<TMap = MapLibreMap>(options?: MapLibreProviderOptions): ProviderAdapter<TMap>`

MapLibre GL adapter (v5/v6). Zoom around the centre; rotation off; `cooperative` maps to `cooperativeGestures`.
Paired geocoder: Photon. The public API stays lat-first; the adapter converts to [lng, lat].

<!-- prettier-ignore-start -->
<!-- doctest:skip "JSDoc fragment quoted from api.d.ts" -->
```ts
import * as maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
new LocationPicker('#map', { provider: maplibreProvider({ engine: maplibregl }) });
```
<!-- prettier-ignore-end -->

## `location-picker/photon`

### `PhotonOptions`

Interface.

Options for `photonGeocoder`.

**Members:**

- `url`: `string` (optional). Search endpoint. Production apps should self-host Photon or use a commercial endpoint (the public one is fair-use, no SLA). Default: `'https://photon.komoot.io/api'`.
- `reverseUrl`: `string` (optional). Default: `'https://photon.komoot.io/reverse'`.
- `lang`: `string` (optional). Sent only when the endpoint supports it (public Photon: en, de, fr); otherwise omitted, giving local names. Default: the picker's lang when supported.
- `limit`: `number` (optional). Default: `5`.
- `debounce`: `number` (optional). Debounce for typed queries, ms. Values below 300 are raised to 300 on the public endpoint. Default: `300`.
- `minChars`: `number` (optional). Default: `3`.
- `params`: `Record<string, string>` (optional). Extra query params (e.g. `{ osm_tag: 'place' }`). Default: `{}`.

### `PHOTON_URL`

Constant: `PHOTON_URL: 'https://photon.komoot.io/api'`

### `photonGeocoder`

Function: `photonGeocoder(options?: PhotonOptions): Geocoder`

Photon (komoot) geocoder: typeahead search biased to the map centre, reverse lookup, LRU-cached, stale requests
aborted. `pairsWith: ['leaflet', 'maplibre']`. Nominatim is never a default; see docs for a custom geocoder recipe. (Usage policy: https://operations.osmfoundation.org/policies/nominatim/; recipe: [custom geocoders](providers.md#custom-geocoders).)

Example: `new LocationPicker('#map', { search: true, geocoder: photonGeocoder({ url: 'https://photon.example.org/api' }) })`

### `formatPhotonAddress`

Function: `formatPhotonAddress(properties: Record<string, unknown>): string`

Builds "name, housenumber street, postcode city, country" from Photon GeoJSON `properties`.

## `location-picker/webmcp`

### `WebMcpToolName`

Type: `type WebMcpToolName = 'get_location' | 'set_location' | 'search_places'`

### `WebMcpOptions`

Interface.

Options for `registerWebMcpTools`.

**Members:**

- `prefix`: `string` (optional). Tool-name prefix. Default: "location_picker", plus "_<id or name>" when the page has several pickers.
- `purpose`: `string` (optional). Sentence appended to every tool description (what the location is for). Default: `""`. Example: `{ purpose: 'Delivery drop-off point for this order.' }`
- `tools`: `readonly WebMcpToolName[]` (optional). Tools to register. `search_places` is skipped when no geocoder is available. There is never a locate tool (agents must not trigger permission prompts). Default: `['get_location', 'set_location', 'search_places']`.
- `signal`: `AbortSignal` (optional). Aborting unregisters the tools.

### `WebMcpRegistration`

Interface.

Result of `registerWebMcpTools`.

**Members:**

- `supported` (read-only): `boolean`. False when `document.modelContext` (or `navigator.modelContext`) is unavailable; then nothing was registered.
- `tools` (read-only): `readonly string[]`. Full names of the registered tools. Example: `['location_picker_get_location']`
- `unregister`: `(): void`. Idempotent.

### `isWebMcpSupported`

Function: `isWebMcpSupported(): boolean`

True when `document.modelContext.registerTool` (or the older `navigator.modelContext`) exists.

### `registerWebMcpTools`

Function: `registerWebMcpTools(target: LocationPicker | LocationPickerElement, options?: WebMcpOptions): WebMcpRegistration`

Registers tools via `document.modelContext.registerTool`:

- `<prefix>_get_location` (readOnlyHint): `{ value, lat, lng, address }` or `{ value: "" }`.
- `<prefix>_set_location`: input `{ lat, lng }` or `{ text }` (text -> parseLatLng, else the paired geocoder's first result); commits with source "api".
- `<prefix>_search_places` (readOnlyHint): `{ query }` -> up to 5 results, not committed.
  Never throws; returns `{ supported: false }` when WebMCP is unavailable.

Example: `const { supported } = registerWebMcpTools(document.querySelector('location-picker')!, { purpose: 'Where the sensor is installed.' });`

## `location-picker/global`

`<script src="https://cdn.jsdelivr.net/npm/location-picker@3"></script>` sets `window.LocationPicker` to the CLASS
itself (so `new LocationPicker('#map')` works) with every public export attached as a static, and defines
`<location-picker>`. It never writes the lowercase v1 global `locationPicker`. Self-contained: core, element, all
three adapters, search, Photon and WebMCP in one file with no chunks (safe to vendor).
TS users of the script build: `/// <reference types="location-picker/global" />`. This needs NO `@types/google.maps`:
the Google statics are typed structurally here. Programs that also `import type {} from 'location-picker/google'`
(which needs `@types/google.maps`) get the precise Google overloads through interface merging (see the
`location-picker/google` augmentation block below). That augmentation does not pull this global into ESM programs.

SHIPPED INSIDE `dist/google.d.mts` and `dist/google.d.cts` (not in `global.d.ts`): precise overloads merged into
the global's Google statics. Method merging puts these overloads FIRST, so a program that has both
`location-picker/global` and `location-picker/google` gets `ProviderAdapter<google.maps.Map>`. A program that only
imports `location-picker/google` does not load `global.d.ts` (verified on TS 7.0.2: no `LocationPicker` global leaks).
Written as a separate block here only because ambient module blocks cannot nest.

### `LocationPickerGoogleStatics`

Interface.

Google statics, structurally typed (no google.maps types). Declared as METHODS so `location-picker/google` can merge precise overloads.

**Members:**

- `googleProvider`: `(options?: { apiKey?: string; mapId?: string; version?: string; language?: string; region?: string; mapOptions?: Record<string, unknown>; searchOptions?: Record<string, unknown>; engine?: object; }): Core.ProviderAdapter`. See `googleProvider` in `location-picker/google`..
- `googleGeocoder`: `(options?: { region?: string; language?: string }): Core.Geocoder`. See `googleGeocoder` in `location-picker/google`..
- `loadGoogleMaps`: `(options: { apiKey: string; version?: string; language?: string; region?: string; nonce?: string }): Promise<unknown>`. See `loadGoogleMaps` in `location-picker/google`. Resolves to the `google.maps` namespace..
- `googleProvider`: `(options?: GoogleProviderOptions): ProviderAdapter<google.maps.Map>`.
- `googleGeocoder`: `(options?: { region?: string; language?: string }): Geocoder`.
- `loadGoogleMaps`: `(options: { apiKey: string; version?: string; language?: string; region?: string; nonce?: string }): Promise<typeof google.maps>`.

### `LocationPickerStatics`

Interface (`extends LocationPickerGoogleStatics`).

Every public runtime export of the package, attached to the IIFE global as a static (D12).

**Members:**

- `LocationPicker` (read-only): `typeof Core.LocationPicker`.
- `LocationPickerElement` (read-only): `typeof Element.LocationPickerElement`.
- `LocationPickerError` (read-only): `typeof Core.LocationPickerError`.
- `defineLocationPicker` (read-only): `typeof Element.defineLocationPicker`.
- `parseLatLng` (read-only): `typeof Core.parseLatLng`.
- `formatLatLng` (read-only): `typeof Core.formatLatLng`.
- `normalizeLatLng` (read-only): `typeof Core.normalizeLatLng`.
- `isLatLng` (read-only): `typeof Core.isLatLng`.
- `leafletProvider` (read-only): `typeof Leaflet.leafletProvider`.
- `maplibreProvider` (read-only): `typeof MapLibre.maplibreProvider`.
- `photonGeocoder` (read-only): `typeof Photon.photonGeocoder`.
- `formatPhotonAddress` (read-only): `typeof Photon.formatPhotonAddress`.
- `registerWebMcpTools` (read-only): `typeof WebMcp.registerWebMcpTools`.
- `isWebMcpSupported` (read-only): `typeof WebMcp.isWebMcpSupported`.
- `LEAFLET_VERSION` (read-only): `typeof Leaflet.LEAFLET_VERSION`.
- `LEAFLET_JS_URL` (read-only): `typeof Leaflet.LEAFLET_JS_URL`.
- `LEAFLET_JS_INTEGRITY` (read-only): `typeof Leaflet.LEAFLET_JS_INTEGRITY`.
- `LEAFLET_CSS_URL` (read-only): `typeof Leaflet.LEAFLET_CSS_URL`.
- `LEAFLET_CSS_INTEGRITY` (read-only): `typeof Leaflet.LEAFLET_CSS_INTEGRITY`.
- `OSM_TILE_URL` (read-only): `typeof Leaflet.OSM_TILE_URL`.
- `OSM_ATTRIBUTION` (read-only): `typeof Leaflet.OSM_ATTRIBUTION`.
- `OPENFREEMAP_STYLE_URL` (read-only): `typeof MapLibre.OPENFREEMAP_STYLE_URL`.
- `PHOTON_URL` (read-only): `typeof Photon.PHOTON_URL`.

### `LocationPickerGlobal`

Type: `type LocationPickerGlobal = typeof Core.LocationPicker & LocationPickerStatics`

The IIFE global: the class (with its static `version`) plus every public export as a static.

### `LocationPicker`

Global augmentation (`declare global`).

Declaration: `var LocationPicker: LocationPickerGlobal`.

## `location-picker/style.css`

`import 'location-picker/style.css'` — optional; needed only with `injectStyles: false` (strict CSP, class mode).

- `export {}`

## `location-picker/v1`

Types for the frozen v1-compatible file (global lowercase `locationPicker`, CommonJS `module.exports = class`, AMD).
Deliberately references NO google.maps types (LOCKED 10): `map` is `any` (it is a google.maps.Map).
The shipped `dist/location-picker.min.d.ts` also contains `export as namespace locationPicker;`.

<!-- prettier-ignore-start -->
<!-- doctest:skip "JSDoc fragment quoted from api.d.ts" -->
```ts
// npm users of 1.x: change one import
import locationPicker from 'location-picker/v1';
const lp = new locationPicker('map', { setCurrentPosition: false, lat: 48.8584, lng: 2.2945 });
google.maps.event.addListener(lp.map, 'idle', () => console.log(lp.getMarkerPosition()));
```
<!-- prettier-ignore-end -->

- `export = locationPicker`

### `Options`

Namespace `locationPicker`.

v1 options.

**Members:**

- `setCurrentPosition`: `boolean` (optional). Centre on the user's position when neither `lat` nor `lng` is given. Default: `true`.
- `lat`: `number` (optional). Default: 34.4346 (Tripoli) when not given.
- `lng`: `number` (optional). Default: 35.8362 (Tripoli) when not given.

### `locationPicker`

Class (augmentation).

v1 picker over a classic, already-loaded Google Maps script. Creates `.map` SYNCHRONOUSLY.

**Members:**

- `constructor`: `(element: string | HTMLElement, options?: locationPicker.Options, mapOptions?: object)`. Parameter `element`: element id or HTMLElement. Parameter `options`: v1 options. Parameter `mapOptions`: google.maps.MapOptions merged over `{ center, zoom: 15 }`.
- `map`: `any`. The google.maps.Map, created synchronously.
- `element`: `HTMLElement | null`.
- `getMarkerPosition`: `(): { lat: number; lng: number }`. Map centre; longitude wrapped to [-180, 180), latitude clamped (#12).
- `setLocation`: `(lat: number, lng: number): void`.
- `setCurrentPosition`: `(): void`. Never rejects; logs like v1 on failure.

## `location-picker/dist/location-picker.min.js`

- `export = locationPicker`

## `location-picker/jsx/react`

React 19 JSX typings. Usage: `import type {} from 'location-picker/jsx/react';` once.
React 19 sets `value`, `search`, `locate`, `form`… as PROPERTIES when they exist on the element (each has a setter)
and fires `onChange`/`onInput` for the element's native-named events (verified on react-dom 19.3 with createRoot).
Spell primitive config in kebab-case (SSR-correct).
Event props in React: `onChange`, `onInput` (synthetic), and the LOWERCASE native `onaddresschange`, `onready`,
`onerror`. `onAddressChange`/`onReady` listen for events that never fire and `onError` is React's own synthetic
event (never fired for this element), so all three are type errors here.
Hydration: with `hydrateRoot` (Next.js App Router, Remix), React applies neither object props (`messages`,
`mapOptions`, `engine`, `geocoder`, `geolocation`, an adapter-object `provider`) nor the lowercase native handlers.
Set them in a ref callback (refs ARE attached on hydration); attributes, `value` and `onChange`/`onInput` work.

<!-- prettier-ignore-start -->
<!-- doctest:skip "JSDoc fragment quoted from api.d.ts" -->
```ts
// shipped dist/jsx/react.d.ts
import type { LocationPickerAttributes, LocationPickerElement } from '../element.mjs';
import type { DetailedHTMLProps, HTMLAttributes, SyntheticEvent } from 'react';
declare module 'react' { namespace JSX { interface IntrinsicElements {
  'location-picker': Omit<DetailedHTMLProps<HTMLAttributes<LocationPickerElement>, LocationPickerElement>, 'onChange' | 'onInput' | 'onError' | 'onLoad' | 'placeholder'>
    & LocationPickerAttributes & {
      onChange?: (e: SyntheticEvent<LocationPickerElement, CustomEvent<LocationDetail>>) => void;
      onInput?: (e: SyntheticEvent<LocationPickerElement, CustomEvent<LocationDetail>>) => void;
      onaddresschange?: (e: CustomEvent<AddressDetail>) => void; onready?: (e: CustomEvent<ReadyDetail>) => void;
      onerror?: (e: CustomEvent<LocationPickerError>) => void;
      messages?: Partial<Messages>; mapOptions?: Record<string, unknown>; engine?: object; geocoder?: Geocoder | GeocodeFn | false;
      geolocation?: PositionOptions;
    } } } }
```
<!-- prettier-ignore-end -->

<!-- prettier-ignore-start -->
<!-- doctest:skip "JSDoc fragment quoted from api.d.ts" -->
```ts
// SSR-hydrated React: object props and native listeners via a ref callback (React 19 cleanup function)
<location-picker name="location" reverse-geocode ref={(el) => {
  if (!el) return;
  el.messages = { locate: 'Ma position' };
  const onAddress = (e: CustomEvent<AddressDetail>) => setAddress(e.detail.address);
  el.addEventListener('addresschange', onAddress);
  return () => el.removeEventListener('addresschange', onAddress);
}} />
```
<!-- prettier-ignore-end -->

- `export {}`

## `location-picker/jsx/preact`

Preact JSX typings (`preact` JSX.IntrinsicElements; same attribute set, `onchange`/`oninput` lowercase handlers).

- `export {}`

## `location-picker/jsx/solid`

Solid JSX typings (`solid-js` JSX.IntrinsicElements; `prop:value`, `on:change`, `on:addresschange`).

- `export {}`

## `location-picker/jsx/vue`

Vue typings (`vue` GlobalComponents; `v-model` = `input` + `el.value`, `v-model.lazy` = `change`).

- `export {}`

## `location-picker/jsx/svelte`

Svelte 5 typings (`svelte/elements` SvelteHTMLElements; `onchange`, `oninput`, `onaddresschange`).

- `export {}`
