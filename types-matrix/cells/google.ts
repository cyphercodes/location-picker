// location-picker/google (needs @types/google.maps). Importing it does not declare the IIFE global.
import { LocationPicker } from 'location-picker/core';
import {
  googleGeocoder,
  googleProvider,
  loadGoogleMaps,
  type GoogleLocationPicker,
} from 'location-picker/google';

const picker = new LocationPicker('#map', {
  provider: googleProvider({ apiKey: 'AIza-test', mapOptions: { clickableIcons: false } }),
  geocoder: googleGeocoder({ region: 'LB' }),
});
const map: google.maps.Map | undefined = picker.map;
const typed: GoogleLocationPicker = picker;
const loaded: Promise<typeof google.maps> = loadGoogleMaps({ apiKey: 'AIza-test' });
// @ts-expect-error the google types merge into location-picker/global without declaring the global
export const leaked = globalThis.LocationPicker;
export const used = [map, typed, loaded];
