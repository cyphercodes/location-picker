# Frameworks

`<location-picker>` is a standard custom element, so every framework can render it. The rules are the same everywhere:

- **Bind `value`**, a `"lat,lng"` string (`""` while unset). Writing it is silent and idempotent, so bindings never loop.
- **Listen to `change`** for committed values, or **`input`** for live updates. Every commit fires `input` (final value) then `change`, so bindings that only listen to `input` still see search picks, locate results and `setLocation()`.
- **Spell configuration as HTML attributes** (`lat-name`, `api-key`, `reverse-geocode`). That is SSR-correct; the hyphen-less spellings (`latname`) are accepted too.
- **Never bind `lat`/`lng`** in a template: they only set the initial value.
- Objects (`messages`, `mapOptions`, `engine`, `geocoder`, `geolocation`) are properties, set from JavaScript.
- `import 'location-picker'` defines the element and is safe on the server (it does nothing there).

## Value binding

| Framework                         | Value binding                                                                                                  | Events                                                                                                           | Notes                                                                                                                               |
| --------------------------------- | -------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Plain `<form>`                    | FormData via ElementInternals                                                                                  | `change`, `input`                                                                                                | reset and bfcache restore handled                                                                                                   |
| React 19                          | `value={str}` (property)                                                                                       | `onChange`/`onInput` (synthetic); lowercase `onaddresschange`, `onready`, `onerror` (native; client render only) | `import type {} from 'location-picker/jsx/react'`; kebab-case config; after `hydrateRoot`, objects and native listeners go in a ref |
| Vue 3.5                           | `v-model` (`input` + `el.value`); `v-model.lazy` (`change`)                                                    | `@change`, `@addresschange`                                                                                      | `compilerOptions.isCustomElement`                                                                                                   |
| Angular 17+                       | `formControlName`/`ngModel` + **`ngDefaultControl`** (DefaultValueAccessor: `value` property, `input`, `blur`) | `(change)`, `(addresschange)`                                                                                    | `CUSTOM_ELEMENTS_SCHEMA`; no custom ControlValueAccessor needed                                                                     |
| Svelte 5                          | `value={v}`                                                                                                    | `onchange`, `onaddresschange`                                                                                    | `jsx/svelte` types                                                                                                                  |
| Solid                             | `prop:value`                                                                                                   | `on:change`                                                                                                      | `jsx/solid` types                                                                                                                   |
| jQuery / Livewire / Alpine / htmx | bound inputs (native events on the input itself) or `new FormData(form)`                                       | `change` on the picker for delegated or form-level listeners (htmx `hx-trigger="change from:location-picker"`)   | `.serialize()` ignores custom elements                                                                                              |

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

React's lowercase native handlers are attached on client render only. After `hydrateRoot`, use a ref (React hydration recipe below).

## React 19 and Next.js

Import `location-picker` in a client component, and the JSX typings once. React 19 sets `value`, `search`, `locate` and other props as properties when they exist on the element, and fires `onChange`/`onInput` for the element's events. React 18 sets attributes instead, so `value` binding needs React 19.

<!-- prettier-ignore-start -->
```tsx
'use client';
import 'location-picker';                          // defines <location-picker>; SSR-safe no-op on the server
import type {} from 'location-picker/jsx/react';   // JSX typings
import { useState } from 'react';

export function StoreLocationField({ initial = '' }: { initial?: string }) {
  const [value, setValue] = useState(initial);    // "lat,lng" or ""
  // Attributes, value and onChange/onInput survive SSR hydration; objects (messages…) and onaddresschange go in a ref (recipe below).
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

- Use `onerror` (lowercase) for the picker's errors. `onError`, `onAddressChange` and `onReady` are type errors in `location-picker/jsx/react`: those names never fire for this element.
- In a Server Action, read `formData.get('location')` (or `lat`/`lng` with `lat-name`/`lng-name`).
- `<location-picker form="f1">` works in React 19: the `form` property writes the attribute.

## Vue 3 and Nuxt

Tell the compiler that `location-picker` is a custom element, then use `v-model` (live, `input`) or `v-model.lazy` (`change`).

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

In Nuxt, set the same compiler option in `nuxt.config.ts`. The import is safe during server rendering.

<!-- prettier-ignore-start -->
<!-- doctest:project=nuxt -->
```ts
// nuxt.config.ts
export default defineNuxtConfig({
  vue: { compilerOptions: { isCustomElement: (tag) => tag === 'location-picker' } },
});
```
<!-- prettier-ignore-end -->

Types for templates: `import type {} from 'location-picker/jsx/vue'`. The element keeps its state across `<KeepAlive>`.

## Angular 17+

Use `ngDefaultControl`: Angular's DefaultValueAccessor writes the `value` property and listens to `input` and `blur`, which is exactly what the element provides. No custom ControlValueAccessor is needed. Add `CUSTOM_ELEMENTS_SCHEMA`.

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

- `[(ngModel)]` works the same way with `ngDefaultControl`.
- Listen to `(addresschange)="onAddress($event)"` for the address.
- With bound inputs nested inside the element, the control still holds `"lat,lng"`: the inputs' own events do not bubble to the host.

## Svelte 5

<!-- prettier-ignore-start -->
<!-- doctest:project=svelte -->
```svelte
<script lang="ts">
  import 'location-picker';
  import type {} from 'location-picker/jsx/svelte';
  let location = $state('');
</script>

<label for="loc">Location</label>
<location-picker id="loc" name="location" search value={location}
  onchange={(e) => (location = e.detail.value)} style="height: 360px"></location-picker>
<p>{location || 'Pan the map to choose'}</p>
```
<!-- prettier-ignore-end -->

## Solid

<!-- prettier-ignore-start -->
<!-- doctest:skip "solid-js is not installed in the doc-test consumer project" -->
```tsx
import 'location-picker';
import type {} from 'location-picker/jsx/solid';
import { createSignal } from 'solid-js';

export function LocationField() {
  const [location, setLocation] = createSignal('');
  return (
    <location-picker name="location" search prop:value={location()}
      on:change={(e) => setLocation(e.detail.value)} style={{ height: '360px' }} />
  );
}
```
<!-- prettier-ignore-end -->

## Preact

<!-- prettier-ignore-start -->
<!-- doctest:skip "preact is not installed in the doc-test consumer project" -->
```tsx
/** @jsxImportSource preact */
import 'location-picker';
import type {} from 'location-picker/jsx/preact';
import { useState } from 'preact/hooks';

export function LocationField() {
  const [location, setLocation] = useState('');
  return (
    <location-picker name="location" search value={location}
      onchange={(e) => setLocation(e.detail.value)} style={{ height: '360px' }} />
  );
}
```
<!-- prettier-ignore-end -->

## Astro and other server-rendered pages

Render the tag in the page and load the script on the client. In Astro, a `<script>` that imports the package is bundled for the browser:

<!-- prettier-ignore-start -->
<!-- doctest:skip "Astro component; it needs the Astro compiler" -->
```astro
<form method="post">
  <location-picker name="location" required style="height: 360px"></location-picker>
  <button>Save</button>
</form>
<script>
  import 'location-picker';
</script>
```
<!-- prettier-ignore-end -->

Templates without a bundler (Laravel Blade, Django, Rails ERB, Express views) use the script tag and bound inputs: see [forms.md](forms.md).

## jQuery, Livewire, Alpine and htmx

These libraries listen on inputs, so give the picker bound inputs and let them receive native `input` and `change` events:

```html
<form method="post" action="/places">
  <input type="hidden" name="lat" id="lat" /><input type="hidden" name="lng" id="lng" />
  <location-picker lat-input="lat" lng-input="lng" required style="height: 360px"></location-picker>
  <button>Save</button>
</form>
<script src="https://cdn.jsdelivr.net/npm/location-picker@3"></script>
<script>
  document
    .getElementById('lat')
    .addEventListener('change', (e) => console.log('lat', e.target.value));
</script>
```

- jQuery: `$('#lat').on('change', …)` fires. `$(form).serialize()` skips the picker itself, so submit bound inputs or `new FormData(form)`.
- Livewire: `<input type="hidden" id="lat" wire:model="lat">`. Alpine: `x-model="lat"` on the input.
- htmx: `hx-trigger="change from:location-picker"`.

## TypeScript

- `document.querySelector('location-picker')` is typed as `LocationPickerElement` (the package augments `HTMLElementTagNameMap`).
- JSX and template typings are opt-in: `import type {} from 'location-picker/jsx/react'` (or `preact`, `solid`, `vue`, `svelte`). They type the attributes, the `locate` modes and the event handlers.
- `instanceof` can differ when two copies of the library are on one page (for example the ESM and the script build). Check with `customElements.get('location-picker')` or duck typing instead.

## Component tests in jsdom or happy-dom

jsdom and happy-dom lack parts of the platform the element needs (form internals, `ResizeObserver`, constructable stylesheets). There the element runs **inert**: it never throws, it logs one console message naming the missing API, and `value`, `valueAsLatLng` and `setLocation()` still round-trip, so components that render a picker can be unit tested. Test maps and form submission in a real browser.
