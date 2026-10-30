// The script build, dist/location-picker.global.js (CONTRACT §1.2, D12): `<script src>` sets globalThis.LocationPicker
// to the CLASS itself, so `new LocationPicker('#map')` works, with every public runtime export attached as a static,
// and defines <location-picker> (importing the root entry does that). It exports nothing and never writes the
// lowercase v1 global `locationPicker`. Everything is in this one file: the engines' entries are imported eagerly, and
// the provider loaders below return them without a chunk request.
import * as google from './google.js';
import * as root from './index.js';
import * as leaflet from './leaflet.js';
import * as maplibre from './maplibre.js';
import * as photon from './photon.js';
import * as webmcp from './webmcp.js';
import { BUILTIN_PROVIDERS, erased } from './core/providers.js';

// Elements defined by the root import mount a microtask later, so they already load through these.
BUILTIN_PROVIDERS.leaflet = async () => erased(leaflet.leafletProvider());
BUILTIN_PROVIDERS.google = async () => erased(google.googleProvider());
BUILTIN_PROVIDERS.maplibre = async () => erased(maplibre.maplibreProvider());

const { LocationPicker } = root;
for (const entry of [root, leaflet, google, maplibre, photon, webmcp]) {
  for (const [name, value] of Object.entries(entry)) {
    // `default` is the class itself; `version` is already its static.
    if (name != 'default' && !Object.hasOwn(LocationPicker, name))
      Object.defineProperty(LocationPicker, name, { value, enumerable: true, configurable: true });
  }
}
Reflect.set(globalThis, 'LocationPicker', LocationPicker);
