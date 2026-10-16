# Forms

`<location-picker>` is a form-associated custom element (built on `ElementInternals`). Inside a `<form>` it behaves like a native input: it submits a value, takes part in validation, resets with the form and restores its state on back/forward navigation.

## What gets submitted

Pick the names you want. The value is always latitude first, dot decimal, no spaces.

| Configuration                               | Entries when set                      | Entries when unset           |
| ------------------------------------------- | ------------------------------------- | ---------------------------- |
| `name="loc"`                                | `loc=48.85837,2.294481`               | `loc=`                       |
| `lat-name="lat" lng-name="lng"`             | `lat=48.85837`, `lng=2.294481`        | `lat=`, `lng=`               |
| `name` + `lat-name` + `lng-name`            | all three                             | all three empty              |
| `+ address-name="addr"`                     | `addr=<address>` (`""` while unknown) | `addr=`                      |
| none of the above                           | none                                  | none; validation still works |
| `disabled`, or inside `<fieldset disabled>` | none                                  | none                         |

`address-name` needs `search` or `reverse-geocode`. The address may arrive a moment after the coordinates (reverse geocoding is debounced by 400 ms).

```html
<form method="post" action="/stores">
  <label for="loc">Store location</label>
  <location-picker
    id="loc"
    name="location"
    lat-name="lat"
    lng-name="lng"
    required
    search
    style="height: 360px"
  ></location-picker>
  <button>Save</button>
</form>
<script src="https://cdn.jsdelivr.net/npm/location-picker@3"></script>
```

## Bound inputs

When the page already has inputs, let the picker fill them instead of adding its own entries. Pass an id (tried first) or a CSS selector:

| Attribute (class option)         | Receives                         |
| -------------------------------- | -------------------------------- |
| `lat-input` (`latInput`)         | the latitude                     |
| `lng-input` (`lngInput`)         | the longitude                    |
| `value-input` (`valueInput`)     | `"lat,lng"`                      |
| `address-input` (`addressInput`) | the address (`""` while unknown) |

- The bound inputs submit themselves; the picker never adds entries for them.
- Their initial values seed the picker when it has no `value`.
- They mirror the picker's events: a native `input` event for each live change, `input` + `change` on each commit, and nothing for silent writes (property writes, reset, restore). Their events are dispatched before the picker's own.
- Listeners on the input itself keep working: jQuery `$('#lat').on('change', …)`, Livewire `wire:model`, Alpine `x-model`.
- Clearing the value with a property write, a reset to an empty value or a restore sets them to `""` silently. They are never cleared at startup.

## Progressive enhancement (Laravel, Django, Rails)

Put the bound inputs inside the element:

- Without JavaScript they are visible and typed by hand.
- After the element upgrades they are no longer rendered, but they are still submitted, and the map writes them.
- Their server-rendered values seed the picker, even when the script runs in `<head>` before they are parsed.
- Their native events do not bubble, so a `change` listener on the picker only ever receives the picker's own `CustomEvent`.
- A form reset brings back the server values in the inputs and in the picker.

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

<!-- prettier-ignore-start -->
```django
{% load l10n %}
<location-picker lat-input="lat" lng-input="lng" required search>
  <input id="lat" name="lat" value="{{ form.lat.value|default_if_none:''|unlocalize }}" aria-label="Latitude">
  <input id="lng" name="lng" value="{{ form.lng.value|default_if_none:''|unlocalize }}" aria-label="Longitude">
</location-picker>
```
<!-- prettier-ignore-end -->

`unlocalize` keeps Django from writing a decimal comma. Validate on the server too, for example with Django's `DecimalField(min_value=-90, max_value=90)` for latitude:

```python
from django import forms


class StoreForm(forms.Form):
    lat = forms.DecimalField(min_value=-90, max_value=90, decimal_places=6)
    lng = forms.DecimalField(min_value=-180, max_value=180, decimal_places=6)
```

Hidden inputs outside the element work the same way (the most common pattern in existing apps):

```html
<form method="post" action="/places">
  <input type="hidden" name="lat" id="lat" value="48.8584" />
  <input type="hidden" name="lng" id="lng" value="2.2945" />
  <location-picker lat-input="lat" lng-input="lng" required style="height: 360px"></location-picker>
  <button>Save</button>
</form>
<script src="https://cdn.jsdelivr.net/npm/location-picker@3"></script>
```

## Validation

- `required` reports `valueMissing` while the picker is unset, with the message "Please choose a location on the map." (`messages.valueMissing`). `reportValidity()` focuses the map.
- `setCustomValidity(message)` works as on native inputs.
- **Put `required` on the picker, never on hidden bound inputs.** A hidden, empty, `required` input blocks the submit as "not focusable", and the picker warns about it.
- `readonly` (zoom allowed, the value cannot change) and `disabled` bar the element from validation, as on native inputs.
- Style errors after the user interacted with `location-picker:state(interacted):invalid`. `:user-invalid` is not reliable on custom elements.
- `:required` and `:read-only` never work on form-associated custom elements. Use `location-picker[required]` and `location-picker[readonly]`.
- `center` is only where the view starts. It is never submitted; the user has to commit a point (pan, Enter, the confirm button, search, locate).

```html
<style>
  location-picker:state(interacted):invalid {
    outline: 2px solid crimson;
  }
  location-picker[required] {
    border-inline-start: 4px solid #1d4ed8;
  }
</style>
<form method="post" action="/places">
  <location-picker name="location" required center="48.8584,2.2945"></location-picker>
  <button>Save</button>
</form>
<script src="https://cdn.jsdelivr.net/npm/location-picker@3"></script>
```

## Reset and back/forward

- `form.reset()` returns the picker to its reset value: the `value` attribute, else the `lat` + `lng` attributes, else the bound inputs' server-rendered values, else unset. It then writes that value into the bound inputs. Nothing fires: no `input`, no `change`.
- Back/forward navigation (bfcache, history) restores the value, the zoom and the address, again silently.
- The dirty flag works like a native input: once the user (or a property write) changed the value, later changes to the `value`, `lat` or `lng` attributes only update the default. A `lat`/`lng` change ignored this way logs one warning. To control the value, bind the `value` property or call `setLocation()`.

## jQuery, AJAX, Livewire, Alpine, htmx

- **jQuery `.serialize()` ignores custom elements:** it only serializes `input`, `select` and `textarea`. Use bound inputs, or `new FormData(form)`.
- **Livewire and Alpine:** bind the inputs (`wire:model="lat"`, `x-model="lat"`) and point `lat-input`/`lng-input` at them.
- **Delegated listeners** (`$(form).on('change', 'input', …)`, htmx `hx-trigger="change"` on the form) do not see the native events of inputs nested in the picker, because those do not bubble. Listen to the picker's own `change` instead: `hx-trigger="change from:location-picker"`.

## Name collisions

If a `*-name` attribute equals the `name` of a bound input in the same form, the value would be submitted twice. The picker logs one warning ("use either lat-name or lat-input") and never changes your inputs.

## The JavaScript class in a form

`LocationPicker` is not a form control. In class mode, bind inputs with `latInput`/`lngInput`/`valueInput`/`addressInput`; their native events bubble normally.

```ts
import { LocationPicker } from 'location-picker';

const picker = new LocationPicker('#map', { latInput: '#lat', lngInput: '#lng', search: true });
picker.addEventListener('change', (e) => console.log(e.detail.value));
```
