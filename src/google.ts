/// <reference types="google.maps" />
// location-picker/google: the Google Maps adapter, its paired geocoder and the bootstrap loader. The only entry whose
// declarations reference google.maps (@types/google.maps is an optional peer).
import type { Geocoder, LocationPicker, LocationPickerOptions, ProviderAdapter } from './core.js';
import type { GoogleProviderOptions } from './providers/google.js';

export { googleGeocoder } from './geocoders/google-geocoder.js';
export { loadGoogleMaps } from './providers/google-bootstrap.js';
export { googleProvider, type GoogleProviderOptions } from './providers/google.js';

export type GoogleLocationPicker = LocationPicker<google.maps.Map>;
export type GoogleLocationPickerOptions = LocationPickerOptions<google.maps.Map>;

// The script build's Google statics (dist/global.d.ts) get these precise overloads whenever this entry is in the
// program; method merging puts them first. This entry never declares the global itself.
declare module 'location-picker/global' {
  interface LocationPickerGoogleStatics {
    googleProvider(options?: GoogleProviderOptions): ProviderAdapter<google.maps.Map>;
    googleGeocoder(options?: { region?: string; language?: string }): Geocoder;
    loadGoogleMaps(options: {
      apiKey: string;
      version?: string;
      language?: string;
      region?: string;
      nonce?: string;
    }): Promise<typeof google.maps>;
  }
}
