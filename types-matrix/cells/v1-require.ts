import locationPicker = require('location-picker/v1');
import legacyPath = require('location-picker/dist/location-picker.min.js');

type IsAny<T> = 0 extends 1 & T ? true : false;
const options: locationPicker.Options = { setCurrentPosition: false, lat: 0, lng: 0 };
const lp: locationPicker = new locationPicker('map', options, { zoom: 3 });
const other = new legacyPath(document.body);
const mapIsAny: IsAny<typeof lp.map> = true;
const position: { lat: number; lng: number } = lp.getMarkerPosition();
const element: HTMLElement | null = other.element;
lp.setLocation(position.lat, position.lng);
// @ts-expect-error getMarkerPosition() returns { lat, lng }
const wrong: string = lp.getMarkerPosition();
// @ts-expect-error setCurrentPosition is a boolean option
new locationPicker('map', { setCurrentPosition: 'yes' });
export const used = [mapIsAny, element, wrong, other.setCurrentPosition()];
