// ESM half of the `dual` cell: index.d.mts and index.d.cts in one program must not conflict (no TS2717).
import { LocationPicker } from 'location-picker';

const el = document.createElement('location-picker');
el.value = '1,2';
export const esm = [new LocationPicker('#a').value, el.valueAsLatLng];
