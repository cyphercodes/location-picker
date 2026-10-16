# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
