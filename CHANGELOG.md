# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
