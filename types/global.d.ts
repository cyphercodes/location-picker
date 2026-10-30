// Types for the script build, dist/location-picker.global.js (CONTRACT §1.2, D12): `/// <reference types="location-picker/global" />`.
// It imports NO google.maps types: the Google statics are typed structurally, and dist/google.d.mts/.d.cts merge the
// precise overloads into LocationPickerGoogleStatics. Imports use the CommonJS declarations, like globals.d.ts, so
// this file reads the same in every module mode.
import type * as Core from './core.cjs';
import type * as Element from './element.cjs';
import type * as Leaflet from './leaflet.cjs';
import type * as MapLibre from './maplibre.cjs';
import type * as Photon from './photon.cjs';
import type * as WebMcp from './webmcp.cjs';

/** Google statics, structurally typed (no google.maps types). Declared as METHODS so `location-picker/google` can merge precise overloads. */
export interface LocationPickerGoogleStatics {
  /** @see `googleProvider` in `location-picker/google`. */
  googleProvider(options?: {
    apiKey?: string;
    mapId?: string;
    version?: string;
    language?: string;
    region?: string;
    mapOptions?: Record<string, unknown>;
    searchOptions?: Record<string, unknown>;
    engine?: object;
  }): Core.ProviderAdapter;
  /** @see `googleGeocoder` in `location-picker/google`. */
  googleGeocoder(options?: { region?: string; language?: string }): Core.Geocoder;
  /** @see `loadGoogleMaps` in `location-picker/google`. Resolves to the `google.maps` namespace. */
  loadGoogleMaps(options: {
    apiKey: string;
    version?: string;
    language?: string;
    region?: string;
    nonce?: string;
  }): Promise<unknown>;
}

/** Every public runtime export of the package, attached to the IIFE global as a static (D12). */
export interface LocationPickerStatics extends LocationPickerGoogleStatics {
  readonly LocationPicker: typeof Core.LocationPicker;
  readonly LocationPickerElement: typeof Element.LocationPickerElement;
  readonly LocationPickerError: typeof Core.LocationPickerError;
  readonly defineLocationPicker: typeof Element.defineLocationPicker;
  readonly parseLatLng: typeof Core.parseLatLng;
  readonly formatLatLng: typeof Core.formatLatLng;
  readonly normalizeLatLng: typeof Core.normalizeLatLng;
  readonly isLatLng: typeof Core.isLatLng;
  readonly leafletProvider: typeof Leaflet.leafletProvider;
  readonly maplibreProvider: typeof MapLibre.maplibreProvider;
  readonly photonGeocoder: typeof Photon.photonGeocoder;
  readonly formatPhotonAddress: typeof Photon.formatPhotonAddress;
  readonly registerWebMcpTools: typeof WebMcp.registerWebMcpTools;
  readonly isWebMcpSupported: typeof WebMcp.isWebMcpSupported;
  readonly LEAFLET_VERSION: typeof Leaflet.LEAFLET_VERSION;
  readonly LEAFLET_JS_URL: typeof Leaflet.LEAFLET_JS_URL;
  readonly LEAFLET_JS_INTEGRITY: typeof Leaflet.LEAFLET_JS_INTEGRITY;
  readonly LEAFLET_CSS_URL: typeof Leaflet.LEAFLET_CSS_URL;
  readonly LEAFLET_CSS_INTEGRITY: typeof Leaflet.LEAFLET_CSS_INTEGRITY;
  readonly OSM_TILE_URL: typeof Leaflet.OSM_TILE_URL;
  readonly OSM_ATTRIBUTION: typeof Leaflet.OSM_ATTRIBUTION;
  readonly OPENFREEMAP_STYLE_URL: typeof MapLibre.OPENFREEMAP_STYLE_URL;
  readonly PHOTON_URL: typeof Photon.PHOTON_URL;
}

/** The IIFE global: the class (with its static `version`) plus every public export as a static. */
export type LocationPickerGlobal = typeof Core.LocationPicker & LocationPickerStatics;

declare global {
  // oxlint-disable-next-line no-var -- a global declared by a script is a var
  var LocationPicker: LocationPickerGlobal;
}
