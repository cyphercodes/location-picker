// location-picker/utils: DOM-free helpers.
import {
  formatLatLng,
  isLatLng,
  normalizeLatLng,
  parseLatLng,
  type LatLng,
  type LatLngInput,
  type ParsedLatLng,
} from 'location-picker/utils';

const parsed: ParsedLatLng | null = parseLatLng('geo:48.8584,2.2945?z=17');
const zoom: number | undefined = parsed?.zoom;
const text: string = formatLatLng({ lat: 48.85837, lng: 2.2945 }, { format: 'dms', precision: 1 });
const input: LatLngInput = { latitude: 48.8584, longitude: 2.2945 };
const normal: LatLng = normalizeLatLng(input);
const value: unknown = JSON.parse('{"lat":1,"lng":2}');
if (isLatLng(value)) normal.lat = value.lat;
// @ts-expect-error arrays are not a LatLngInput
formatLatLng([1, 2]);
export const used = [zoom, text, normal];
