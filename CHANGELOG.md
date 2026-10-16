# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [3.0.0] - Unreleased

A rewrite around one use case: capturing one precise point in a form. The default map is now OpenStreetMap through Leaflet, with no API key; Google Maps and MapLibre are opt-in providers. The upgrade guide with every v1 and v2 API is [docs/migration.md](docs/migration.md).

The MIT License applies to this release and to all prior versions of location-picker.

### Added

- `<location-picker>`, a form-associated custom element: it submits through `FormData` (`name`, `lat-name`, `lng-name`, `address-name`), validates with `required`, resets with the form and restores on back/forward navigation. `import 'location-picker'` and the script build define it; `location-picker/core` stays side-effect free.
- Keyless default: Leaflet 1.9.4 (loaded on demand from jsDelivr with Subresource Integrity, only when `window.L` is absent) and OpenStreetMap tiles, with the attribution always visible.
- Providers as adapters: `leafletProvider()`, `googleProvider()` (`importLibrary`, a CSS-overlay pin, optional `AdvancedMarkerElement`) and `maplibreProvider()` (bring your own `maplibre-gl`, OpenFreeMap style by default). Custom engines plug in through the public `ProviderAdapter` contract.
- Address search (`search`) and reverse geocoding (`reverse-geocode`, `addresschange`), paired with the provider: Photon for Leaflet and MapLibre, `PlaceAutocompleteElement` and the Google Geocoder for Google. Custom geocoders are supported.
- A locate button (`locate="button"`) that prompts only on click; `locate()` with a timeout and a watchdog, so it never hangs.
- Bound inputs (`lat-input`, `lng-input`, `value-input`, `address-input`) that receive native `input`/`change` events, for jQuery, Livewire, Alpine and server-rendered forms with progressive enhancement.
- `input` and `change` events with `detail.source` (`user`, `api`, `geolocation`, `search`); `ready` and `error` events; `onInput`, `onChange`, `onAddressChange`, `onReady` and `onError` class callbacks.
- `LocationPickerError` with stable `code`, one-line `fix` and `level`; messages read `[location-picker] … Fix: …`.
- `location-picker/utils`: `parseLatLng` (decimal, DMS, `geo:` URIs, Google, OpenStreetMap and Apple Maps URLs), `formatLatLng`, `normalizeLatLng`, `isLatLng`.
- Script build `dist/location-picker.global.js` (the `unpkg` and `jsdelivr` fields; `https://cdn.jsdelivr.net/npm/location-picker@3`), which sets `window.LocationPicker` and defines the element.
- Theming through CSS custom properties, `::part()`, slots and `:state()`; dark mode and right-to-left layouts; keyboard support and a polite live region.
- Experimental, opt-in WebMCP tools (`webmcp` attribute, `registerWebMcpTools()`).
- JSX typings for React 19, Preact, Solid, Vue and Svelte (`location-picker/jsx/*`), `custom-elements.json`, `llms.txt`, an Agent Skill (`skills/location-picker/SKILL.md`, shipped in the package) and `AGENTS.md`.

### Breaking

- `.map` (sync `google.maps.Map`, v1/v2) is now `undefined` until `ready`. It is still set synchronously with `provider: googleProvider()` on a page where Google Maps is already loaded with a classic script tag (a one-line fix).
- Implicit Google provider (v2): Google is selected only by `apiKey`, `mapId`, `useAdvancedMarker` or a 3rd constructor argument (or an explicit `provider: 'google'`). Otherwise the picker uses OpenStreetMap and logs a hint when `google.maps` is loaded.

### Default changed

- Option `setCurrentPosition` (default **true**): `true` now maps to `locate: 'auto'`, and the default is `locate: 'off'`. Nothing prompts for location on load unless you ask for it.

### Changed

- `onLocationChange(pos)` is called like `onChange` (de-duplicated; the detail is a superset of `LatLng`). Like v2's first `idle`, it is also called once after `ready` with the current value (source `api`), but only when a value is set: an unset picker has no position to report.
- `.centerMarker` / PNG pin: the pin is an SVG themed with CSS custom properties. Class mode keeps `.lp-pin.centerMarker` (the alias class), and the element exposes `::part(pin)`.
- `"type": "module"`, `engines.node >= 18`: the package is now `"type": "commonjs"` with `.mjs`/`.cjs` files and has no `engines` field. The deep `.mjs`/`.cjs` paths are kept.
- `setLocation(lat, lng)` now commits: it fires `input` then `change` with source `api`. It also accepts any `LatLngInput` (`'48.8584, 2.2945'`, `{ lat, lng }`). An out-of-range latitude is clamped with a warning.
- `setCurrentPosition()` is an alias of `locate()` that keeps the current zoom. It resolves with a `LocationDetail` and rejects with a `LocationPickerError` that has a `.code`.

### Removed

- The Tripoli fallback. With no value and no `center`, the map shows a world view (20, 0) at zoom 2 and the picker stays unset (#7). The frozen v1 file keeps the old behaviour.

### Fixed

- `getMarkerPosition()` returns a normalised position (longitude wrapped into [-180, 180), latitude clamped; #12) and never a fake `{ 0, 0 }`. While the picker is unset it returns the view centre and warns once.
- `destroy()` removes the created map, every listener and every node.
- Type declarations: `@types/google.maps` is an optional peer referenced only by `location-picker/google`, specifiers carry explicit extensions, and no declaration file imports CSS (#2).
- `0` is a valid latitude and longitude everywhere.

## [2.1.0] - 2026-10-16

### Fixed

- Restored `dist/location-picker.min.js`, the v1 browser build (global `locationPicker`). Pages that load `https://unpkg.com/location-picker/dist/location-picker.min.js` without a version have returned 404 since 2.0.0; they work again. The file is a frozen copy of the v1 API with two bug fixes: longitude is wrapped into [-180, 180) and latitude clamped (#12), and `0` is accepted as a `lat`/`lng` option (#11). The pin is now an SVG with the same 28x44 size and anchor.

### Changed

- Relicensed under the MIT License. The author grants the MIT License for all prior versions of location-picker as well.

## [2.0.0] - 2026-04-12

### Added

- `destroy()` method to cleanly tear down a picker instance and its listeners.
- `onLocationChange` option — callback fired whenever the selected location changes.
- `useAdvancedMarker` option for opting into Google Maps' Advanced Markers (`AdvancedMarkerElement`).
- Named export: `import { LocationPicker } from 'location-picker'`.

### Changed

- **BREAKING:** `setCurrentPosition()` now returns a `Promise` that resolves once the browser geolocation lookup completes (or rejects on error / denial). Previously it was fire-and-forget.
- Replaced the deprecated `@types/googlemaps` with the official `@types/google.maps`.
- Toolchain modernized: TypeScript 5, ESLint 9 (flat config), Rollup 4, Vitest for tests.

### Removed

- **BREAKING:** Dropped the UMD bundle. The package now ships ESM (`dist/index.mjs`) and CJS (`dist/index.cjs`) only.

## [1.0.x]

Earlier 1.x releases — see the [git history](https://github.com/cyphercodes/location-picker/commits/master) for details.
