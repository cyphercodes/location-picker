/// <reference types="location-picker/global" />
// The IIFE global (`<script>` users). Needs no @types/google.maps: the Google statics are typed structurally.

const picker = new LocationPicker('#map', { value: '48.8584,2.2945' });
const version: string = LocationPicker.version;
const parsed = LocationPicker.parseLatLng('48.8584, 2.2945');
const google = LocationPicker.googleProvider({ apiKey: 'AIza-test' });
const leaflet = LocationPicker.leafletProvider();
const Element: typeof LocationPicker.LocationPickerElement = LocationPicker.LocationPickerElement;
const viaGlobalThis: typeof LocationPicker = globalThis.LocationPicker;
export const used = [
  picker.value,
  version,
  parsed,
  google.name,
  leaflet.name,
  Element,
  viaGlobalThis,
];
