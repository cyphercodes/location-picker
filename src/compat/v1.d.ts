// placeholder: owned by WP1. Hand-written types for the frozen v1 file (map is any; no google.maps reference).
declare namespace locationPicker {
  /** v1 options. */
  interface Options {
    /** Centre on the user's position when neither `lat` nor `lng` is given. @default true */
    setCurrentPosition?: boolean;
    /** @default 34.4346 (Tripoli) when not given */
    lat?: number;
    /** @default 35.8362 (Tripoli) when not given */
    lng?: number;
  }
}
/** v1 picker over a classic, already-loaded Google Maps script. Creates `.map` SYNCHRONOUSLY. */
declare class locationPicker {
  /**
   * @param element element id or HTMLElement
   * @param options v1 options
   * @param mapOptions google.maps.MapOptions merged over `{ center, zoom: 15 }`
   */
  constructor(element: string | HTMLElement, options?: locationPicker.Options, mapOptions?: object);
  /** The google.maps.Map, created synchronously. */
  map: any;
  element: HTMLElement | null;
  /** Map centre; longitude wrapped to [-180, 180), latitude clamped (#12). */
  getMarkerPosition(): { lat: number; lng: number };
  setLocation(lat: number, lng: number): void;
  /** Never rejects; logs like v1 on failure. */
  setCurrentPosition(): void;
}
export = locationPicker;
export as namespace locationPicker;
