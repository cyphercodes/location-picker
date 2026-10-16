// CJS half of the `dual` cell (see esm.mts).
import { LocationPicker } from 'location-picker';

const el = document.createElement('location-picker');
el.value = '3,4';
export const cjs = [new LocationPicker('#b').value, el.valueAsLatLng];
