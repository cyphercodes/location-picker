---
name: location-picker
description: >-
  Add a map location picker to a web form or web app with the location-picker npm package (the
  <location-picker> web component and the LocationPicker JavaScript class). Use it when a user must choose one
  precise latitude/longitude point on a map, such as a store, branch or sensor location, a delivery or pickup pin,
  an event venue, the place of a report or a home address, and the point must be submitted with a form, bound in
  React, Vue, Angular, Svelte, Solid or Preact, or written into hidden lat/lng inputs (Laravel, Django, Rails,
  jQuery, Livewire, Alpine, htmx). Covers the keyless OpenStreetMap default, Google Maps and MapLibre providers,
  address search, reverse geocoding, a locate-me button, parsing coordinates from text or map URLs, Content
  Security Policy, SSR and hydration, a phone-first field mode, the hosted pick link that asks a person for a
  location by URL, and upgrading location-picker 1.x or 2.x code (global locationPicker, getMarkerPosition,
  setCurrentPosition).
license: MIT
metadata:
  homepage: https://cyphercodes.github.io/location-picker/
  repository: https://github.com/cyphercodes/location-picker
---

# location-picker

`location-picker` captures one precise point: the user pans a map under a fixed centre pin (or searches, pastes coordinates, or taps "Use my location"), and the page gets `"lat,lng"`. It ships a form-associated custom element, `<location-picker>`, and an imperative class, `LocationPicker`. The default map is OpenStreetMap through Leaflet, with no API key.

Do not use it for drawing shapes or routes, several markers, a full mapping application, or text-only address autocomplete.

## Steps

1. **Pick the entry point.**
   - No bundler: `<script src="https://cdn.jsdelivr.net/npm/location-picker@3"></script>` (keep the `@3`). It defines `<location-picker>` and `window.LocationPicker`.
   - Bundler: `npm i location-picker`, then `import 'location-picker'` once in client code. It defines the element and is a no-op on the server.
   - Need the engine map synchronously, or no custom element: `import { LocationPicker } from 'location-picker/core'`.
2. **Wire the value.** In a form, use `name` (one `"lat,lng"` field), `lat-name` + `lng-name` (two fields), or `lat-input` + `lng-input` (fill inputs the page already has). In a framework, bind `value` and update state from `change` (committed); use `input` only to display live updates, and never write the value back from an `input` listener (in 3.0 that stops a pan in progress). Use the per-framework event names below.
3. **Choose the provider.** Leave it out for OpenStreetMap. For Google Maps add `provider="google" api-key="YOUR_BROWSER_KEY"`. For MapLibre, the project must provide `maplibre-gl` and its CSS.
4. **Choose the presentation.** Default inline (the map in the page). For checkout, delivery or sign-up forms that people fill in on phones, use `presentation="auto"`: a compact field with a "Choose on map" button on phones, the inline map elsewhere. In field mode `ready` resolves at the first open, so never gate the form on `el.ready`.
5. **Add features only when asked:** `search`, `reverse-geocode` (with `address-name` or `addresschange`), `locate="button"`, `required`, `center` and `zoom`.
6. **Check the result against "Common mistakes"** before you finish.

If the user has no code at all (WordPress, Webflow, Squarespace, Shopify, a Formspree or Netlify form), point them to the snippet generator at https://cyphercodes.github.io/location-picker/embed/ and the platform guide https://github.com/cyphercodes/location-picker/blob/master/docs/embed.md. If an agent or a bot only needs to ask a person for a location, use the pick link (below) instead of building a page.

## Plain HTML

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

## Forms and server-rendered pages

The element submits like an input. Existing hidden inputs (the most common pattern in Laravel, Django, Rails, PHP and Express apps) are filled by the picker and get native `input`/`change` events, which jQuery, Livewire and Alpine listen to. Their server values seed the picker, and a form reset restores them.

```html
<form method="post" action="/places">
  <input type="hidden" name="lat" id="lat" value="48.8584" />
  <input type="hidden" name="lng" id="lng" value="2.2945" />
  <label for="loc">Location</label>
  <location-picker
    id="loc"
    lat-input="lat"
    lng-input="lng"
    required
    search
    style="height: 360px"
  ></location-picker>
  <button>Save</button>
</form>
<script src="https://cdn.jsdelivr.net/npm/location-picker@3"></script>
```

- `name="loc"` submits `loc=48.85837,2.294481`; `lat-name="lat" lng-name="lng"` submits two fields; `address-name="addr"` adds the address (needs `search` or `reverse-geocode`).
- Progressive enhancement: put the inputs inside `<location-picker>`; without JavaScript they are visible and typeable.
- Validate on the server too: latitude in [-90, 90], longitude in [-180, 180].

## Phones: field mode

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

- `auto` is field mode where `(pointer: coarse) and (max-width: 640px)` matches, else inline; `field` always; `inline` is the default.
- The map opens in a full-screen sheet; pans, search picks and locates there are a draft. Confirm commits (`input` then `change`); Cancel, Escape and `el.close()` change nothing and fire no `input`/`change`. `el.showPicker()` opens it; `toggle` fires on open and close.
- Same names, `FormData`, `required` and events as inline. Do not set an inline `height` on a field-mode picker: it stretches the compact field (the inline map defaults to 320px).
- Texts: `messages.chooseOnMap`, `fieldPlaceholder`, `cancel`, `confirm`. Parts: `field`, `field-value`, `field-button`, `sheet`, `sheet-header`, `cancel-button`; state `:state(open)`.

## Asking a person for a location (agents and bots)

To get one exact point from a person with nothing to install, send them `https://cyphercodes.github.io/location-picker/pick/`. It is a static page (no server, no storage) on OpenStreetMap.

- Start: `lat` and `lng` (a point to confirm or adjust), `zoom` (1 to 19), `q` (search text; the first result is picked), `lang`.
- Default: the person sees the result with copy buttons (decimal, DMS, `geo:`, map links) and can share it back to you.
- `redirect=<https URL>`: after a click, the page goes there with `lat`, `lng` and `address` (when known) appended. `https://` only.
- `return=postmessage&origin=<your origin>`: for a page that opened it with `window.open` or embeds it in an iframe. It posts `{ type: 'location-picker:pick', lat, lng, address }` (`address` may be `null`) to that origin only. Check `event.origin` and `event.data.type` in your listener.

## React 19 / Next.js App Router

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

## Vue 3

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

## Angular 17+

`ngDefaultControl` is all that is needed: no custom ControlValueAccessor.

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

## Events in each framework

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

React's lowercase native handlers are attached on client render only. After `hydrateRoot`, use a ref (React hydration recipe above). Field mode's `toggle` event is `ontoggle` in React, Preact and Svelte, `@toggle` in Vue, `(toggle)` in Angular and `on:toggle` in Solid.

## Google Maps

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

Google search uses `PlaceAutocompleteElement` and reverse geocoding uses the Google Geocoder. Never pair Google results with a non-Google map (Google Maps Platform Terms); the picker refuses a mismatched geocoder with `GEOCODER_MISMATCH`.

## JavaScript class with a bundled Leaflet

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

Options are camelCase versions of the attributes (`latInput` = `lat-input`). Callbacks: `onChange`, `onInput`, `onAddressChange`, `onReady`, `onError`. Call `destroy()` when the view goes away.

## Upgrading 1.x or 2.x code

The unpinned v1 URL still serves the frozen v1 file, so old pages keep working. For npm code:

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

In new code, replace `setCurrentPosition: true` with `locate: 'button'`, `lat`/`lng` options with `value`, and `onLocationChange` with `onChange`. Every v1 and v2 API is mapped in the [migration guide](https://github.com/cyphercodes/location-picker/blob/master/docs/migration.md).

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

## Policies to respect

- OpenStreetMap's tiles require the visible "© OpenStreetMap contributors" attribution (the picker always shows it) and are not meant for heavy production traffic: suggest `tile-url` with the project's own or a commercial tile server ([tile usage policy](https://operations.osmfoundation.org/policies/tiles/)).
- Search and reverse geocoding use the public Photon endpoint under fair use. For production, suggest a self-hosted or commercial Photon (`geocoder: photonGeocoder({ url })`) or a custom geocoder.
- Google results stay on Google maps; the picker enforces the pairing.

Never configure Nominatim as the geocoder or suggest it for the search box. Its usage policy, https://operations.osmfoundation.org/policies/nominatim/, forbids client-side autocomplete; mention it only as a user-written reverse geocoder after linking that policy.

## Reading results and errors

- `el.value` is `"lat,lng"` (`""` while unset), `el.valueAsLatLng` is `{ lat, lng }` or `null`, `el.address` is the address or `null`.
- `change` and `input` carry `detail: { value, lat, lng, source, zoom, address }`; `source` is `user`, `api`, `geolocation` or `search`.
- Errors are `LocationPickerError` objects with `code` and `fix`. Unhandled ones are logged as `[location-picker] … Fix: …`; act on the `Fix:` text. Code list: https://github.com/cyphercodes/location-picker/blob/master/docs/errors.md

## More

- API reference: https://github.com/cyphercodes/location-picker/blob/master/docs/api.md
- Forms: https://github.com/cyphercodes/location-picker/blob/master/docs/forms.md
- Frameworks (Svelte, Solid, Preact, Nuxt, Astro, htmx): https://github.com/cyphercodes/location-picker/blob/master/docs/frameworks.md
- No-code sites (WordPress, Webflow, Squarespace, Shopify): https://github.com/cyphercodes/location-picker/blob/master/docs/embed.md
- AI agents, WebMCP and the pick link: https://github.com/cyphercodes/location-picker/blob/master/docs/ai-agents.md
- Providers, Content Security Policy, troubleshooting: https://github.com/cyphercodes/location-picker/blob/master/docs/providers.md, https://github.com/cyphercodes/location-picker/blob/master/docs/csp.md, https://github.com/cyphercodes/location-picker/blob/master/docs/troubleshooting.md
- Everything in one file: https://cyphercodes.github.io/location-picker/llms-full.txt
