# location-picker

[![CI](https://github.com/cyphercodes/location-picker/actions/workflows/ci.yml/badge.svg)](https://github.com/cyphercodes/location-picker/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/location-picker.svg)](https://www.npmjs.com/package/location-picker)
[![npm downloads](https://img.shields.io/npm/dm/location-picker.svg)](https://www.npmjs.com/package/location-picker)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

An open source location picker plugin using Google Maps v3, written in modern TypeScript, shipped as both ESM and CJS with full type definitions.

> v2 is a modernization release. See the [Migration from v1](#migration-from-v1) section below.

---

## Install

```bash
npm install location-picker
```

You also need the Google Maps JavaScript API loaded on your page (either via the classic script tag or the official `@googlemaps/js-api-loader`).

## Usage

### ESM (bundlers / modern browsers)

```ts
import { LocationPicker } from 'location-picker';
import 'location-picker/style.css';

const lp = new LocationPicker(
  'map',
  { setCurrentPosition: true, onLocationChange: (p) => console.log(p) },
  { zoom: 15 },
);
```

### CommonJS

```js
const { LocationPicker } = require('location-picker');
require('location-picker/style.css');

const lp = new LocationPicker('map');
```

### AdvancedMarkerElement

If you load the Google Maps `marker` library, set `useAdvancedMarker: true` and the picker will use `google.maps.marker.AdvancedMarkerElement` instead of the CSS-pin overlay:

```ts
const lp = new LocationPicker('map', { useAdvancedMarker: true }, { mapId: 'YOUR_MAP_ID' });
```

## API

### `new LocationPicker(element, options?, mapOptions?)`

- `element: string | HTMLElement` - element id or DOM node.
- `options: LocationPickerOptions`:
  - `setCurrentPosition?: boolean` - default `true`. Skipped if `lat`/`lng` provided.
  - `lat?: number`, `lng?: number` - initial center.
  - `useAdvancedMarker?: boolean` - default `false`.
  - `onLocationChange?: (pos: LatLng) => void` - called on each `idle` event.
- `mapOptions: google.maps.MapOptions` - forwarded to `new google.maps.Map`.

### Methods

- `getMarkerPosition(): { lat: number; lng: number }`
- `setLocation(lat: number, lng: number): void`
- `setCurrentPosition(): Promise<{ lat: number; lng: number }>` - **breaking in v2**, now returns a Promise.
- `destroy(): void` - removes listeners and the marker DOM.

### Types

```ts
import type { LatLng, LocationPickerOptions } from 'location-picker';
```

## Migration from v1

| v1                                             | v2                                                                      |
| ---------------------------------------------- | ----------------------------------------------------------------------- |
| `import LocationPicker from 'location-picker'` | Still works. Also: `import { LocationPicker } from 'location-picker'`.  |
| `setCurrentPosition()` returned `void`         | Returns `Promise<LatLng>`. Rejects on failure instead of `console.log`. |
| UMD / minified UMD bundle                      | Removed. Use ESM (`dist/index.mjs`) or CJS (`dist/index.cjs`).          |
| `@types/googlemaps`                            | Replaced by `@types/google.maps`.                                       |
| CSS was bundled automatically                  | Now opt-in: `import 'location-picker/style.css'`.                       |
| No `destroy()`                                 | `destroy()` available for cleanup (SPAs, HMR).                          |
| No idle callback                               | `onLocationChange` option.                                              |
| No AdvancedMarker                              | `useAdvancedMarker: true` opts into `AdvancedMarkerElement`.            |

Node >=18 is required to build/develop the library. Consumers are unaffected.

## Development

```bash
npm install
npm run lint
npm run typecheck
npm run test
npm run build
```

## License

MIT
