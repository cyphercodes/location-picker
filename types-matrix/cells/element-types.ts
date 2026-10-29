// Type-only use of location-picker/element (no side effect at runtime).
import type { LocationDetail } from 'location-picker/core';
import type {
  LocationPickerAttributes,
  LocationPickerElement,
  LocationPickerElementEventMap,
} from 'location-picker/element';

const attributes: LocationPickerAttributes = {
  value: '48.8584,2.2945',
  name: 'location',
  'lat-name': 'lat',
  locate: 'button',
  provider: 'leaflet',
  required: true,
};
// @ts-expect-error provider names are 'leaflet' | 'google' | 'maplibre'
const unknownProvider: LocationPickerAttributes = { provider: 'bing' };
type ChangeDetail = LocationPickerElementEventMap['change']['detail'];
const read = (el: LocationPickerElement, detail: ChangeDetail): LocationDetail => {
  el.value = detail.value;
  return detail;
};
const tagged: LocationPickerElement | null = document.querySelector('location-picker');
export const used = [attributes, unknownProvider, read, tagged];
