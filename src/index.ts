// location-picker: the root entry, core + element. Importing it defines <location-picker> (D2); for a side-effect-free
// class-only import use location-picker/core.
import { defineLocationPicker } from './element/define.js';

export * from './core.js';
export { default } from './core.js';
export { defineLocationPicker };
export { LocationPickerElement } from './element/location-picker-element.js';
export type {
  LocationPickerAttributes,
  LocationPickerElementEventMap,
} from './element/location-picker-element.js';

defineLocationPicker();
