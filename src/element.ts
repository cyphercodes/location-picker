// location-picker/element: the custom element entry. Importing it defines <location-picker> (CONTRACT §2, D2).
import { defineLocationPicker } from './element/define.js';

export { defineLocationPicker };
export { LocationPickerElement } from './element/location-picker-element.js';
export type {
  ChangeSource,
  LocationPickerAttributes,
  LocationPickerElementEventMap,
} from './element/location-picker-element.js';

defineLocationPicker();
