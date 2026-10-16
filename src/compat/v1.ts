/**
 * location-picker v1 compatibility build. FROZEN: do not change behaviour.
 *
 * Published at `dist/location-picker.min.js` (UMD: global `locationPicker`, CommonJS
 * `module.exports`, AMD) so pages that still load
 * `https://unpkg.com/location-picker/dist/location-picker.min.js` keep working on every
 * future major. It intentionally shares no code with the v3 core.
 *
 * Written in ES5 style on purpose (no classes, arrows, let/const, Object.assign, Promise or
 * Number.isNaN): the minified output must parse as ES5 for the old pages that load it.
 *
 * Differences from 1.1.1 (bug fixes only):
 * - `getMarkerPosition()` wraps longitude into [-180, 180) and clamps latitude (#12).
 * - `0` is a valid `lat` / `lng` option (PR #11).
 * - The pin is an SVG with the same 28x44 footprint and anchor as the old PNG.
 *
 * New code should use the v3 API instead: https://cyphercodes.github.io/location-picker/
 */

/* eslint-disable no-var */
declare var google: any;

export interface LocationPickerV1Options {
  /** Center the map on the user's position when no `lat`/`lng` is given. Default `true`. */
  setCurrentPosition?: boolean;
  lat?: number;
  lng?: number;
}

var PIN =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 28 44'%3E" +
  "%3Cpath fill='%23ea4335' stroke='%23c5221f' d='M14 1C6.8 1 1 6.8 1 14c0 9.5 13 29 13 29s13-19.5 13-29C27 6.8 21.2 1 14 1z'/%3E" +
  "%3Ccircle cx='14' cy='14' r='5' fill='%23a50e0e'/%3E%3C/svg%3E";

var CSS =
  '.location-picker .centerMarker{position:absolute;background:url("' +
  PIN +
  '") no-repeat;background-size:100%;top:50%;left:50%;z-index:1;margin-left:-14px;margin-top:-43px;height:44px;width:28px;cursor:pointer}';

// v1 injected its stylesheet as soon as the script was evaluated.
if (typeof document !== 'undefined') {
  var head = document.head || document.getElementsByTagName('head')[0];
  if (head) {
    var style = document.createElement('style');
    style.setAttribute('data-location-picker', 'v1');
    style.appendChild(document.createTextNode(CSS));
    head.appendChild(style);
  }
}

function isNum(v: unknown): boolean {
  // `v === v` is false only for NaN.
  return typeof v === 'number' && v === v;
}

function locationPicker(
  this: any,
  element: string | HTMLElement,
  options?: LocationPickerV1Options,
  mapOptions?: object,
): void {
  var pO: any = { setCurrentPosition: true };
  var k: string;
  for (k in options) {
    if (Object.prototype.hasOwnProperty.call(options, k)) pO[k] = (options as any)[k];
  }

  var hasLat = isNum(pO.lat);
  var hasLng = isNum(pO.lng);

  var mO: any = {
    center: new google.maps.LatLng(hasLat ? pO.lat : 34.4346, hasLng ? pO.lng : 35.8362),
    zoom: 15,
  };
  for (k in mapOptions) {
    if (Object.prototype.hasOwnProperty.call(mapOptions, k)) mO[k] = (mapOptions as any)[k];
  }

  // Allow both a string with the element's id or a direct reference to the element.
  var isElement =
    typeof element === 'object' && element !== null && (element as Node).nodeType === 1;
  this.element = isElement ? element : document.getElementById(element as string);

  this.map = new google.maps.Map(this.element, mO);

  // Append the CSS centered marker element.
  var node = document.createElement('div');
  node.className = 'centerMarker';

  if (this.element) {
    var el = this.element as HTMLElement;
    if ((' ' + el.className + ' ').indexOf(' location-picker ') < 0) {
      el.className = el.className ? el.className + ' location-picker' : 'location-picker';
    }
    (el.children[0] || el).appendChild(node);
  }

  // Center on the current position if requested and no initial position was given.
  if (pO.setCurrentPosition && !hasLat && !hasLng) {
    this.setCurrentPosition();
  }
}

locationPicker.prototype.getMarkerPosition = function (this: any): { lat: number; lng: number } {
  var latLng = this.map.getCenter();
  var lat = Math.max(-90, Math.min(90, latLng.lat()));
  var lng = latLng.lng();
  // Only touch out-of-range values so in-range output stays bit-identical to v1.
  if (lng < -180 || lng > 180) lng = ((((lng + 180) % 360) + 360) % 360) - 180;
  return { lat: lat, lng: lng };
};

locationPicker.prototype.setLocation = function (this: any, lat: number, lng: number): void {
  this.map.setCenter(new google.maps.LatLng(lat, lng));
};

locationPicker.prototype.setCurrentPosition = function (this: any): void {
  var self = this;
  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(
      function (position) {
        self.map.setCenter({ lat: position.coords.latitude, lng: position.coords.longitude });
      },
      function () {
        console.log('Could not determine your location...');
      },
    );
  } else {
    console.log('Your browser does not support Geolocation.');
  }
};

export default locationPicker;
