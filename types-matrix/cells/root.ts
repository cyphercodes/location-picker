// Root entry: named and default exports, element types and the HTMLElementTagNameMap augmentation.
import LocationPicker, {
  LocationPicker as NamedPicker,
  LocationPickerElement,
  LocationPickerError,
  defineLocationPicker,
  formatLatLng,
  parseLatLng,
  version,
  type LocationDetail,
  type LocationPickerOptions,
} from 'location-picker';

type Equals<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;

const sameClass: Equals<typeof LocationPicker, typeof NamedPicker> = true;
const options: LocationPickerOptions = {
  value: '48.8584, 2.2945',
  search: true,
  onChange: (detail: LocationDetail) => detail.source,
};
const picker = new LocationPicker('#map', options);
picker.addEventListener('change', (event) => event.detail.value.length);
const created: LocationPickerElement = document.createElement('location-picker');
const found: LocationPickerElement | null = document.querySelector('location-picker');
const defined: typeof LocationPickerElement | undefined = defineLocationPicker('geo-picker');
const parsed = parseLatLng('48.8584, 2.2945');
export const used = [sameClass, picker.value, created.value, found, defined, parsed?.format];
export const more = [formatLatLng({ lat: 1, lng: 2 }), version];
export const code = (e: unknown) => (e instanceof LocationPickerError ? e.code : undefined);
