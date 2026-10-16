// Types for the frozen v1 file, published as dist/location-picker.min.d.ts for `location-picker/v1` and
// `location-picker/dist/location-picker.min.js`. Hand-written: `map` is `any`, so this file needs no Google Maps types.
// New code should use the v3 API instead: https://cyphercodes.github.io/location-picker/

declare namespace locationPicker {
  /** v1 picker options. */
  interface Options {
    /**
     * Centre the map on the user's position when neither `lat` nor `lng` is given. Failures are only logged.
     * @default true
     */
    setCurrentPosition?: boolean;
    /** Initial latitude; `0` is valid. @default 34.4346 */
    lat?: number;
    /** Initial longitude; `0` is valid. @default 35.8362 */
    lng?: number;
  }
  /** The 1.x name of {@link Options}. */
  type LocationPickerOptions = Options;
}

/**
 * The v1 picker: a fixed centre pin over a classic Google map. Needs the Google Maps JavaScript API loaded by a plain
 * `<script>` first; the map is created synchronously in the constructor.
 * @example
 * var lp = new locationPicker('map', { lat: 45.5017, lng: -73.5673 }, { zoom: 15 });
 * lp.map.addListener('idle', function () {
 *   var position = lp.getMarkerPosition();
 * });
 */
declare class locationPicker {
  /**
   * @param element the map element, or its id
   * @param options v1 options
   * @param mapOptions Google Maps `MapOptions`, merged over `{ center, zoom: 15 }`
   */
  constructor(element: string | HTMLElement, options?: locationPicker.Options, mapOptions?: object);
  /** The Google `Map` instance, created synchronously by the constructor. */
  map: any;
  /** The map element (`null` when an id matched nothing). */
  element: HTMLElement | null;
  /**
   * The map centre: longitude wrapped to [-180, 180), latitude clamped to [-90, 90] (#12).
   * @example lp.getMarkerPosition() // { lat: 45.5017, lng: -73.5673 }
   */
  getMarkerPosition(): { lat: number; lng: number };
  /** Centres the map on `lat`, `lng`. @example lp.setLocation(48.8584, 2.2945) */
  setLocation(lat: number, lng: number): void;
  /** Centres the map on the user's position. Never throws; a failure is logged to the console as in v1. */
  setCurrentPosition(): void;
}

export = locationPicker;
export as namespace locationPicker;
