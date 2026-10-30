/// <reference types="google.maps" />
// location-picker/google: the Google Maps adapter, its paired geocoder and the bootstrap loader. The only entry whose
// declarations reference google.maps (@types/google.maps is an optional peer).
import type { LocationPicker, LocationPickerOptions } from './core.js';

export { googleGeocoder } from './geocoders/google-geocoder.js';
export { loadGoogleMaps } from './providers/google-bootstrap.js';
export { googleProvider, type GoogleProviderOptions } from './providers/google.js';

export type GoogleLocationPicker = LocationPicker<google.maps.Map>;
export type GoogleLocationPickerOptions = LocationPickerOptions<google.maps.Map>;
