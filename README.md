# location-picker

Form-ready map location picker: pan a map under a fixed pin to pick one latitude/longitude. Web component + class, keyless OpenStreetMap by default, Google and MapLibre optional.

**[Live demo](https://cyphercodes.github.io/location-picker/)** · [No-code embed](https://cyphercodes.github.io/location-picker/embed/) · [Pick link](https://cyphercodes.github.io/location-picker/pick/) · [API reference](docs/api.md) · [Forms](docs/forms.md) · [Frameworks](docs/frameworks.md) · [llms.txt](https://cyphercodes.github.io/location-picker/llms.txt) · MIT

```bash
npm i location-picker
```

No build step needed: one `<script>` tag gives you `<location-picker>` on OpenStreetMap, with no API key and no permission prompt until the button is clicked.

<!-- prettier-ignore-start -->
```html
<!doctype html>
<html lang="en">
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Pick a location</title>
<script src="https://cdn.jsdelivr.net/npm/location-picker@3"></script>
<label for="where">Where is it?</label>
<location-picker id="where" search locate="button" style="height: 400px"></location-picker>
<p>Picked: <output id="out">nothing yet</output></p>
<script>
  document.getElementById('where').addEventListener('change', (e) => {
    document.getElementById('out').textContent = e.detail.value; // "48.85837,2.294481"; e.detail has lat, lng, source, address
  });
</script>
</html>
```
<!-- prettier-ignore-end -->

Inside a `<form>` it submits like any input, here as `location=48.85837,2.294481`:

```html
<form method="post" action="/places">
  <location-picker name="location" required style="height: 360px"></location-picker>
  <button>Save</button>
</form>
<script src="https://cdn.jsdelivr.net/npm/location-picker@3"></script>
```

## When to use it

Use it when a form needs **one precise point**: a store, branch or sensor location in an admin screen, a delivery or pickup pin at checkout, an event venue, the place of a report, a home or work location in a profile. The user pans the map under a fixed centre pin (or searches, pastes coordinates, or taps "Use my location"), and you get `"lat,lng"` in `FormData`, in your framework state, or in existing hidden inputs.

- Plain HTML forms and server templates (Laravel, Django, Rails), React, Vue, Angular, Svelte, Solid and Preact; jQuery, Livewire, Alpine and htmx through bound inputs.
- OpenStreetMap with no API key by default; Google Maps or MapLibre when you choose them.
- Optional address search and reverse geocoding, paired with the map provider.
- Coordinate parsing built in: `"48.8584, 2.2945"`, DMS, `geo:` URIs and Google, OpenStreetMap or Apple Maps URLs.
- A phone-first [field mode](#phone-first-field-mode): a compact form control that opens the map full screen.
- No code at all: the [embed generator](https://cyphercodes.github.io/location-picker/embed/) writes a snippet for WordPress, Webflow, Squarespace, Shopify or a plain HTML form ([per-platform guide](docs/embed.md)), and the hosted [pick link](#ask-a-person-for-a-location-pick-link) asks someone for a location with nothing to install.

**When not to use it:** drawing shapes, routes or areas; several markers; a full mapping application (use Leaflet, MapLibre or the Google Maps JS API directly); text-only address autocomplete with no map; offline maps; React Native or other native mobile apps.

## Install

| How                     | Use                                                                                      |
| ----------------------- | ---------------------------------------------------------------------------------------- |
| Script tag (no bundler) | `<script src="https://cdn.jsdelivr.net/npm/location-picker@3"></script>`                 |
| npm                     | `npm i location-picker`, then `import 'location-picker'`                                 |
| npm, class only         | `import { LocationPicker } from 'location-picker/core'` (defines no element)             |
| Upgrading 1.x code      | `import locationPicker from 'location-picker/v1'` ([migration guide](docs/migration.md)) |

The script tag defines `<location-picker>` and sets `window.LocationPicker` (the class, with every export as a static). `https://unpkg.com/location-picker@3` serves the same file. Keep the `@3`: the unpinned `/dist/location-picker.min.js` path is the frozen v1 file. In ES modules from a CDN, `https://cdn.jsdelivr.net/npm/location-picker@3/+esm` defines the element too.

Leaflet 1.9.4 is loaded on demand from jsDelivr with Subresource Integrity, only when `window.L` is absent. Bundler users can pass their own Leaflet instead (see [the JavaScript class](#javascript-class)).

## How the value works

- The picker starts **unset** (`value === ""`) unless you give it a `value`. While unset, the map shows `center` (or a world view) and the pin is dimmed.
- The user **commits** a point by panning the map, using the arrow keys, pressing Enter on the map, clicking the confirm button (shown while unset when `center` is set), picking a search result, or locating. `setLocation()` commits too.
- Zooming never changes the value: zoom is anchored at the pin.
- Every commit fires `input` (final value), then `change`, with `detail.source`: `user`, `api`, `geolocation` or `search`. Live `input` events fire while the user drags.
- Writing `el.value = '48.8584,2.2945'` is silent (no events), like a native `<input>`.
- The value string is always latitude first, dot decimal, no spaces, rounded to `precision` decimals (6 by default): `"48.85837,2.294481"`.

## Forms

The element is form-associated: it validates with `required`, resets with the form and restores on back/forward navigation. Choose what it submits:

| Attributes                                       | Submitted entries                                             |
| ------------------------------------------------ | ------------------------------------------------------------- |
| `name="loc"`                                     | `loc=48.85837,2.294481`                                       |
| `lat-name="lat" lng-name="lng"`                  | `lat=48.85837`, `lng=2.294481`                                |
| `+ address-name="addr"`                          | `addr=<address>` (`""` while unknown)                         |
| `lat-input="lat" lng-input="lng"` (bound inputs) | your existing inputs submit themselves; the picker fills them |

The recommended server-rendered pattern puts the inputs inside the element. Without JavaScript they are visible and typed by hand; with it they are hidden, filled by the map, and still submitted. Their server values seed the picker, and a form reset brings them back.

<!-- prettier-ignore-start -->
```blade
<form method="POST" action="{{ route('stores.update', $store) }}">
  @csrf
  @method('PUT')
  <label for="store-location">Store location</label>
  <location-picker id="store-location" lat-input="lat" lng-input="lng" address-name="address"
                   required search reverse-geocode style="height: 360px">
    {{-- Without JS these are visible and typed by hand. With JS they are hidden, filled by the map, and still submitted.
         Their values seed the picker. No `required` here: the picker validates. --}}
    <input id="lat" name="lat" inputmode="decimal" value="{{ old('lat', $store->lat) }}" aria-label="Latitude">
    <input id="lng" name="lng" inputmode="decimal" value="{{ old('lng', $store->lng) }}" aria-label="Longitude">
  </location-picker>
  @error('lat') <p class="error">{{ $message }}</p> @enderror
  <button type="submit">Save</button>
</form>
<script src="https://cdn.jsdelivr.net/npm/location-picker@3"></script>
```
<!-- prettier-ignore-end -->

<!-- prettier-ignore-start -->
```php
// StoreController@update
$data = $request->validate([
    'lat' => ['required', 'numeric', 'between:-90,90'],
    'lng' => ['required', 'numeric', 'between:-180,180'],
    'address' => ['nullable', 'string', 'max:255'],
]);
$store->update($data);
```
<!-- prettier-ignore-end -->

The same in a Django template:

<!-- prettier-ignore-start -->
```django
{% load l10n %}
<location-picker lat-input="lat" lng-input="lng" required search>
  <input id="lat" name="lat" value="{{ form.lat.value|default_if_none:''|unlocalize }}" aria-label="Latitude">
  <input id="lng" name="lng" value="{{ form.lng.value|default_if_none:''|unlocalize }}" aria-label="Longitude">
</location-picker>
```
<!-- prettier-ignore-end -->

jQuery, Livewire (`wire:model`) and Alpine (`x-model`) listen on the bound inputs, which get native `input` and `change` events. jQuery `.serialize()` ignores custom elements, so use bound inputs or `new FormData(form)`. Style errors with `location-picker:state(interacted):invalid`. More in [docs/forms.md](docs/forms.md).

## Phone-first: field mode

On a phone, a map in the middle of a checkout form gets in the way of scrolling. `presentation="field"` turns the picker into a compact form control: the chosen address (or the coordinates) and a **Choose on map** button. The map opens in a full-screen sheet with search, the locate button, **Confirm** and **Cancel**; the value changes only on Confirm. The map engine loads when the sheet first opens.

<!-- prettier-ignore-start -->
```html
<form method="post" action="/deliveries">
  <label for="drop">Delivery spot</label>
  <location-picker id="drop" presentation="auto" name="location" search locate="button" reverse-geocode required></location-picker>
  <button>Continue</button>
</form>
<script src="https://cdn.jsdelivr.net/npm/location-picker@3"></script>
```
<!-- prettier-ignore-end -->

- `auto` shows the field on touch screens up to 640 px wide (`(pointer: coarse) and (max-width: 640px)`) and the inline map elsewhere; `field` always shows the field; `inline` (the default) always shows the map.
- Names, `FormData`, `required` and events are the same in every mode. Pans, search picks and locates inside the sheet are a draft: Confirm commits them (`input` then `change`, with their `source`); Cancel, Escape and `el.close()` change nothing and fire no `input`/`change`.
- `el.showPicker()` opens the sheet, `el.close()` cancels it, and the `toggle` event (a `ToggleEvent` with `oldState`/`newState`) fires on open and close.
- In field mode, `ready` and `el.map` wait for the first open. Do not gate the form on `el.ready`.
- Add `search locate="button"`: field mode uses the same attributes as the inline map and adds nothing on its own.
- A height you set on the element applies to the compact field too. Leave it off (the inline map is 320px tall by default), or set it in a `@media` rule that excludes phones.

Use the inline map when the map is the content, or when the form is used on desktops. Use `auto` (or `field`) in checkout, delivery and sign-up forms that people fill in on phones.

## Frameworks

Bind `value` (a `"lat,lng"` string) and update your state from `change`; `input` is for showing live updates. Do not write the value back from an `input` listener: in 3.0 that stops a pan in progress (Vue's `v-model` is fine). Spell configuration as HTML attributes (`lat-name`, `api-key`), which is SSR-safe.

**Event names per framework.** The class callbacks `onChange`/`onInput`/`onAddressChange`/`onReady`/`onError` are options of the JavaScript class only.

<!-- prettier-ignore-start -->
| Framework | `change` | `input` | `addresschange` | `ready` | `error` |
|---|---|---|---|---|---|
| Plain JS | `addEventListener('change')` | `'input'` | `'addresschange'` | `'ready'` | `'error'` |
| React 19 | `onChange` | `onInput` | `onaddresschange` | `onready` | `onerror` (NOT `onError`: React's synthetic `error` never fires for this element; a type error in `jsx/react`) |
| Vue 3 | `@change` | `@input` | `@addresschange` | `@ready` | `@error` |
| Angular | `(change)` | `(input)` | `(addresschange)` | `(ready)` | `(error)` |
| Svelte 5 | `onchange` | `oninput` | `onaddresschange` | `onready` | `onerror` |
| Solid | `on:change` | `on:input` | `on:addresschange` | `on:ready` | `on:error` |
| Preact | `onchange` | `oninput` | `onaddresschange` | `onready` | `onerror` |
<!-- prettier-ignore-end -->

React's lowercase native handlers are attached on client render only. After `hydrateRoot`, use a ref (React hydration recipe below). Field mode's `toggle` event is `ontoggle` in React, Preact and Svelte, `@toggle` in Vue, `(toggle)` in Angular and `on:toggle` in Solid.

### React 19 / Next.js App Router

<!-- prettier-ignore-start -->
```tsx
'use client';
import 'location-picker';                          // defines <location-picker>; SSR-safe no-op on the server
import type {} from 'location-picker/jsx/react';   // JSX typings
import { useState } from 'react';

export function StoreLocationField({ initial = '' }: { initial?: string }) {
  const [value, setValue] = useState(initial);    // "lat,lng" or ""
  // Attributes, value and onChange/onInput survive SSR hydration; objects (messages…) and onaddresschange go in a ref (see the React hydration recipe).
  return (
    <>
      <label htmlFor="loc">Location</label>
      <location-picker id="loc" name="location" lat-name="lat" lng-name="lng" required search
        value={value} onChange={(e) => setValue(e.currentTarget.value)} style={{ height: 360 }} />
      <p>{value || 'Pan the map to choose'}</p>
    </>
  );
}
// <form action={saveStore}>: formData.get('lat'), formData.get('lng'), formData.get('location')
```
<!-- prettier-ignore-end -->

**React hydration recipe.** With `hydrateRoot` (Next.js App Router, Remix), React applies neither object props (`messages`, `mapOptions`, `engine`, `geocoder`, `geolocation`, an adapter-object `provider`) nor the lowercase native handlers to custom elements. Set them in a ref callback; refs are attached on hydration. Attributes, `value` and `onChange`/`onInput` keep working.

```tsx
'use client';
import 'location-picker';
import type {} from 'location-picker/jsx/react';
import type { AddressDetail } from 'location-picker';
import { useState } from 'react';

export function AddressField() {
  const [address, setAddress] = useState<string | null>(null);
  return (
    <>
      <location-picker
        name="location"
        reverse-geocode
        ref={(el) => {
          if (!el) return;
          el.messages = { locate: 'Use my position' };
          const onAddress = (e: CustomEvent<AddressDetail>) => setAddress(e.detail.address);
          el.addEventListener('addresschange', onAddress);
          return () => el.removeEventListener('addresschange', onAddress);
        }}
      />
      <p>{address ?? 'No address yet'}</p>
    </>
  );
}
```

### Vue 3

<!-- prettier-ignore-start -->
```ts
// vite.config.ts
import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
export default defineConfig({
  plugins: [vue({ template: { compilerOptions: { isCustomElement: (tag) => tag === 'location-picker' } } })],
});
```
<!-- prettier-ignore-end -->

<!-- prettier-ignore-start -->
```vue
<script setup lang="ts">
import 'location-picker';
import { ref } from 'vue';
const location = ref('');                         // v-model uses `input` + el.value; v-model.lazy uses `change`
const address = ref<string | null>(null);
</script>
<template>
  <label for="loc">Location</label>
  <location-picker id="loc" v-model="location" name="location" search reverse-geocode
                   @addresschange="address = $event.detail.address" style="height: 360px" />
  <p>{{ location || 'Pan the map to choose' }} <small v-if="address">{{ address }}</small></p>
</template>
```
<!-- prettier-ignore-end -->

### Angular 17+ (reactive forms, no custom ControlValueAccessor)

<!-- prettier-ignore-start -->
<!-- doctest:project=angular -->
```ts
import { Component, CUSTOM_ELEMENTS_SCHEMA } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import 'location-picker';

@Component({
  selector: 'app-store-form',
  standalone: true,
  imports: [ReactiveFormsModule],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  template: `
    <form [formGroup]="form" (ngSubmit)="save()">
      <label for="loc">Location</label>
      <location-picker id="loc" formControlName="location" ngDefaultControl search locate="button" style="height:360px"></location-picker>
      @if (form.controls.location.touched && form.controls.location.invalid) { <p>Choose a location.</p> }
      <button [disabled]="form.invalid">Save</button>
    </form>`,
})
export class StoreFormComponent {
  form = new FormGroup({ location: new FormControl('', { nonNullable: true, validators: [Validators.required] }) });
  save() { const [lat, lng] = this.form.getRawValue().location.split(',').map(Number); console.log({ lat, lng }); }
}
```
<!-- prettier-ignore-end -->

Svelte 5, Solid, Preact, Nuxt, Astro, Livewire, Alpine, htmx and component tests in jsdom or happy-dom: [docs/frameworks.md](docs/frameworks.md).

## Reading the result

| Event           | `detail`                                                        | Fires                                                                                              |
| --------------- | --------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `change`        | `{ value, lat, lng, source, zoom, address, accuracy?, place? }` | on every commit; de-duplicated; never for property writes, form reset or restore                   |
| `input`         | same as `change`                                                | live while the user drags (at most once per frame), and with the final value before every `change` |
| `addresschange` | `{ value, lat, lng, address, result }`                          | when the address for the current value resolves (`search` or `reverse-geocode`)                    |
| `ready`         | `{ provider, map }`                                             | when the map is mounted, and again after each remount                                              |
| `error`         | a `LocationPickerError` with `code`, `fix`, `level`             | on asynchronous failures; logged with its fix unless you call `preventDefault()`                   |
| `toggle`        | a native `ToggleEvent` (`oldState`, `newState`)                 | field mode: when the map sheet opens or closes                                                     |

Read the current state from properties: `el.value` (`"lat,lng"` or `""`), `el.valueAsLatLng` (`{ lat, lng }` or `null`), `el.address` and `el.map` (the engine map, after `ready`). `el.ready` is a promise for the mounted picker.

## Google Maps

Google is used only when you ask for it: `provider="google"`, or `api-key`, `map-id` or `marker="advanced"`. Search then uses Google's `PlaceAutocompleteElement` and reverse geocoding uses the Google Geocoder, so Google results never appear on an OpenStreetMap map and vice versa.

<!-- prettier-ignore-start -->
```html
<script src="https://cdn.jsdelivr.net/npm/location-picker@3"></script>
<!-- Restrict the key by HTTP referrer. Enable Maps JavaScript API + Places API (New); Geocoding API only for reverse-geocode. -->
<form method="post" action="/checkout/address">
  <label for="drop">Drop-off point</label>
  <location-picker id="drop" provider="google" api-key="YOUR_BROWSER_KEY" name="dropoff" address-name="dropoff_address"
                   search reverse-geocode locate="button" required center="40.7128,-74.0060" style="height: 420px"></location-picker>
  <button>Continue</button>
</form>
<script>
  const drop = document.getElementById('drop');
  drop.addEventListener('change', (e) => console.log(e.detail.lat, e.detail.lng, e.detail.source));
  drop.addEventListener('error', (e) => console.log(e.detail.code, e.detail.fix)); // e.g. GOOGLE_AUTH_FAILED; also logged
  drop.addEventListener('ready', (e) => console.log('google.maps.Map:', e.detail.map)); // no unhandled rejection on failure
</script>
```
<!-- prettier-ignore-end -->

If the page already loads the Maps JavaScript API, `provider="google"` uses it and no key attribute is needed. Wheel and double-click zoom stay anchored at the pin; a pinch on Google Maps zooms around the fingers and commits the new centre.

## JavaScript class

`LocationPicker` renders into an element you own (light DOM), for pages that do not use the custom element or that need the engine map synchronously.

<!-- prettier-ignore-start -->
```html
<div id="map" style="height: 400px"></div>
<input type="hidden" name="lat" id="lat"><input type="hidden" name="lng" id="lng">
```
<!-- prettier-ignore-end -->

<!-- prettier-ignore-start -->
```ts
import * as L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { LocationPicker } from 'location-picker/core';        // class only, no custom element
import { leafletProvider } from 'location-picker/leaflet';

const picker = new LocationPicker<L.Map>('#map', {
  provider: leafletProvider<L.Map>({ engine: L }),
  value: '51.5074,-0.1278',
  zoom: 13,
  search: true,
  locate: 'button',
  latInput: '#lat',
  lngInput: '#lng',
  onChange: ({ lat, lng, source }) => console.log(source, lat, lng),
});
L.circle(picker.valueAsLatLng!, { radius: 200 }).addTo(picker.map!);   // synchronous: adapter object + engine present (never waits for CSS)
// later (SPA route change): picker.destroy();
```
<!-- prettier-ignore-end -->

Every option is also an element property and (for primitives) a kebab-case attribute: `latInput` = `lat-input`. Unknown option keys log a warning that lists the valid ones.

## Attributes

| Attribute                                                | Default                                                   | Notes                                                                                             |
| -------------------------------------------------------- | --------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `value`                                                  | `""` (unset)                                              | Initial value; lenient (`"48.8584, 2.2945"`, DMS, `geo:`, map URLs)                               |
| `center`, `zoom`                                         | world view `20,0`; zoom 15 with a value or center, else 2 | `center` is where the view starts while unset; it is never submitted                              |
| `name`, `lat-name`, `lng-name`, `address-name`           | `""`                                                      | FormData entries                                                                                  |
| `lat-input`, `lng-input`, `value-input`, `address-input` | `""`                                                      | Existing inputs to fill (id or CSS selector)                                                      |
| `required`, `disabled`, `readonly`                       | off                                                       | `readonly`: zoom allowed, the value cannot change                                                 |
| `provider`                                               | `leaflet` (`google` when `api-key` or `map-id` is set)    | `leaflet`, `google` or `maplibre`                                                                 |
| `api-key`, `map-id`                                      | `""`                                                      | Google only                                                                                       |
| `tile-url`, `attribution`                                | OpenStreetMap tiles and credit                            | Leaflet raster tiles; use your own tiles in production                                            |
| `map-style`                                              | `https://tiles.openfreemap.org/styles/liberty`            | MapLibre only                                                                                     |
| `engine-url`, `engine-css-url`                           | `""` (automatic)                                          | Engine JS and CSS to load: a URL, or `"none"` to never load them (you provide the engine)         |
| `search`, `placeholder`                                  | off                                                       | Search box; typed or pasted coordinates jump directly, with no network call                       |
| `reverse-geocode`                                        | off                                                       | Look up the address after each commit (fires `addresschange`)                                     |
| `locate`                                                 | `off`                                                     | `button` (prompts only on click) or `auto` (also tries once on load while unset); `""` = `button` |
| `marker`                                                 | `pin`                                                     | `none` hides the pin; `advanced` = Google AdvancedMarkerElement (needs `map-id`)                  |
| `gesture-handling`                                       | `auto`                                                    | `cooperative`, `greedy` or `none`; `auto` is cooperative (Ctrl/⌘ + wheel) when the page scrolls   |
| `max-zoom`, `precision`                                  | 19 for OSM tiles; 6 decimals                              |                                                                                                   |
| `presentation`                                           | `inline`                                                  | `field` (compact control, full-screen map sheet) or `auto` (field on phones); see field mode      |
| `webmcp`                                                 | off                                                       | Register experimental WebMCP tools for browser agents                                             |

Methods: `setLocation(lat, lng)` or `setLocation('lat,lng')` (commits with source `api`), `locate()` (geolocates, never hangs), `geocode(query)`, `lookupAddress()`, `showPicker()` and `close()` (field mode), plus the native `checkValidity()`, `reportValidity()` and `setCustomValidity()`. Object properties (`messages`, `geocoder`, `engine`, `mapOptions`, `geolocation`) are set from JavaScript. Full list: [docs/api.md](docs/api.md).

## Styling

The element renders into an open shadow root. Style it with CSS custom properties (`--lp-pin-color`, `--lp-pin-size`, `--lp-accent`, `--lp-tile-filter`, …), parts (`location-picker::part(pin)`), slots (`slot="marker"` for your own pin) and states (`location-picker:state(unset)`). It is 320px tall by default; set your own `height`. Dark mode follows `color-scheme`, and the layout uses logical properties for right-to-left pages. Field mode adds the parts `field`, `field-value`, `field-button`, `sheet`, `sheet-header` and `cancel-button` (Confirm is `confirm-button`) and the state `:state(open)`; its texts are the `chooseOnMap`, `fieldPlaceholder`, `cancel` and `confirm` keys of `messages`.

## Providers and usage policies

- **OpenStreetMap tiles** (the default) come from `https://tile.openstreetmap.org` under the [OSM tile usage policy](https://operations.osmfoundation.org/policies/tiles/): the "© OpenStreetMap contributors" attribution stays visible, and the service is best-effort with no SLA. For production traffic, use your own or a commercial tile server with `tile-url` and `attribution`.
- **Search and reverse geocoding** on Leaflet and MapLibre use [Photon](https://photon.komoot.io/), which is free under fair use with no SLA. Requests are debounced (at least 300 ms on the public endpoint), cached and need 3 characters. For production, self-host Photon or use a commercial endpoint: `geocoder: photonGeocoder({ url })`, or your own geocoder.
- **Google Maps** content stays on Google maps. The [Google Maps Platform Terms](https://cloud.google.com/maps-platform/terms) do not allow Google results on a non-Google map, so each provider gets its paired geocoder and a mismatch is refused with `GEOCODER_MISMATCH`. Switching providers clears the address.
- **MapLibre** is bring-your-own (`maplibre-gl` and its CSS), with OpenFreeMap vector tiles by default.

Nominatim is never a default and is not used by any example here. Before writing your own Nominatim geocoder, read its usage policy at https://operations.osmfoundation.org/policies/nominatim/: it forbids client-side autocomplete and caps use at one request per second.

Details, self-hosting and custom geocoders: [docs/providers.md](docs/providers.md). Content Security Policy recipes for each setup: [docs/csp.md](docs/csp.md).

## Common mistakes

- **The unpinned v1 URL.** `https://unpkg.com/location-picker/dist/location-picker.min.js` (and the same path on jsDelivr) is the frozen v1 file forever: global `locationPicker`, Google Maps only, no `<location-picker>` element. For v3, load `https://cdn.jsdelivr.net/npm/location-picker@3` and keep the `@3`.
- **Latitude first, no arrays.** Values are `"lat,lng"` strings or `{ lat, lng }` objects. Arrays are rejected because GeoJSON uses `[lng, lat]`. A swapped pair with both numbers in range (`"2.2945,48.8584"`) cannot be detected, so check the order.
- **Choose Google explicitly.** Google Maps is used only with `provider="google"`, `api-key`, `map-id` or `marker="advanced"`. Otherwise the picker uses OpenStreetMap, even when `google.maps` is already loaded on the page.
- **Put `required` on the picker,** never on hidden bound inputs. A hidden, empty, `required` input blocks the submit as "not focusable".
- **jQuery `.serialize()` skips custom elements.** Use bound inputs (`lat-input`/`lng-input`) or `new FormData(form)`.
- **`import 'location-picker'` defines the element.** `location-picker/core` is the class only and defines nothing, so importing only `core` leaves `<location-picker>` blank.
- **Read results from `value` or `valueAsLatLng`,** not `getMarkerPosition()`. While the picker is unset, `getMarkerPosition()` returns the view centre (for example the 20,0 world view), not a chosen point.
- **The `lat`/`lng` attributes are the initial value only.** Once the control is dirty (a pan, or the `el.value = ''` that `v-model` and `formControlName` write on mount), changing them is ignored with a warning. Bind `value="lat,lng"` or call `setLocation()`.
- **React SSR (`hydrateRoot`: Next.js App Router, Remix):** React applies no object props (`messages`, `geocoder`, …) and no lowercase native handlers (`onaddresschange`, `onready`, `onerror`) during hydration. Set them in a ref callback (see the React hydration recipe).
- **MapLibre CSS is yours to load:** `import 'maplibre-gl/dist/maplibre-gl.css'`, or set `engine-css-url`. The library never fetches MapLibre or its CSS by default.
- **The stylesheet path is `location-picker/style.css`.** `location-picker/dist/location-picker.css` is not exported. You only need it with `injectStyles: false`.

Every runtime problem is reported with a stable code and a one-line fix, for example `[location-picker] … Fix: Add api-key="YOUR_KEY", or load the Google Maps JS API before the picker.` See [docs/errors.md](docs/errors.md) and [docs/troubleshooting.md](docs/troubleshooting.md).

## Upgrading from 1.x or 2.x

The old script URL keeps working: `dist/location-picker.min.js` is a frozen copy of the v1 API (global `locationPicker`, Google Maps) with the longitude-wrap fix. npm users of 1.x change one import; 2.x Google code keeps a synchronous map with an adapter object:

<!-- prettier-ignore-start -->
```ts
// 1.x npm code: one-line change, identical behaviour (frozen file)
import locationPicker from 'location-picker/v1';

// 2.x Google code: keep a synchronous google.maps.Map with an adapter object
import { LocationPicker } from 'location-picker/core';
import { googleProvider } from 'location-picker/google';
const lp = new LocationPicker<google.maps.Map>('map', { provider: googleProvider(), value: { lat: 45.5, lng: -73.56 },
  onChange: (d) => console.log(d.lat, d.lng) });
google.maps.event.addListener(lp.map!, 'idle', () => console.log(lp.getMarkerPosition()));
```
<!-- prettier-ignore-end -->

Every v1 and v2 API, what changed and the one-line fixes: [docs/migration.md](docs/migration.md).

## Compatibility

Browser, device and framework results are generated by the test matrix, never written by hand: see [COMPATIBILITY.md](COMPATIBILITY.md) and the [compatibility page](https://cyphercodes.github.io/location-picker/compat/).

## Ask a person for a location: pick link

`https://cyphercodes.github.io/location-picker/pick/` is a hosted page that asks a person for an exact location with nothing to install: send the link from a chat bot, an AI agent, a support ticket or a no-code automation. The person moves the map (or searches, or taps "Use my location") and confirms.

- Start it with `?lat=48.8584&lng=2.2945` (a starting point to confirm or adjust), `zoom` (1 to 19), `q=Eiffel Tower` (picks the first search result) and `lang`.
- By default the page shows the result with copy buttons (decimal, DMS, `geo:` URI, Google Maps and OpenStreetMap links) and Web Share.
- `redirect=https://example.com/done` sends the person there after a click, with `lat`, `lng` and (when known) `address` appended. Only `https://` URLs are accepted, and the page shows the destination host first.
- `return=postmessage&origin=https://example.com` posts `{ type: 'location-picker:pick', lat, lng, address }` to the page that opened it (`window.open`) or embeds it (an iframe), only to that exact origin. `address` is `null` while unknown.
- The page has no server, no storage, no cookies and no analytics; the state lives only in the URL. It uses OpenStreetMap and Photon. For heavy use, host your own copy (it is a static page in `site/pick/`, MIT).

Details and a `postMessage` listener: [docs/ai-agents.md](docs/ai-agents.md#ask-a-person-for-a-location-the-pick-link).

## For AI agents

- [llms.txt](https://cyphercodes.github.io/location-picker/llms.txt) and [llms-full.txt](https://cyphercodes.github.io/location-picker/llms-full.txt)
- An Agent Skill, shipped in the npm package: [skills/location-picker/SKILL.md](skills/location-picker/SKILL.md)
- `custom-elements.json` (the package's `customElements` field) for editor and agent tooling
- Typed errors with a `code` and a `fix`, and JSDoc with defaults and examples on every option
- Opt-in WebMCP tools so browser agents can read and set the location: [docs/ai-agents.md](docs/ai-agents.md)
- The [pick link](#ask-a-person-for-a-location-pick-link), the zero-install way for an agent or a bot to ask a person for a location

Working on this repository: [AGENTS.md](AGENTS.md).

## Documentation

[API reference](docs/api.md) · [Forms](docs/forms.md) · [No-code embed](docs/embed.md) · [Frameworks](docs/frameworks.md) · [Providers](docs/providers.md) · [CSP](docs/csp.md) · [Errors](docs/errors.md) · [Troubleshooting](docs/troubleshooting.md) · [Migration](docs/migration.md) · [AI agents](docs/ai-agents.md) · [Changelog](CHANGELOG.md) · [Contributing](CONTRIBUTING.md)

## License

[MIT](LICENSE) © 2018-2026 Rayan Salhab. The MIT License applies to all prior versions of location-picker as well.
