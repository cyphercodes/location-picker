import './location-picker.css';

export interface LatLng {
  lat: number;
  lng: number;
}

export interface LocationPickerOptions {
  /** Attempt to set the map center to the user's current position via Geolocation. Defaults to true. */
  setCurrentPosition?: boolean;
  /** Initial latitude. If provided along with `lng`, geolocation is skipped. */
  lat?: number;
  /** Initial longitude. If provided along with `lat`, geolocation is skipped. */
  lng?: number;
  /**
   * Use `google.maps.marker.AdvancedMarkerElement` instead of the CSS pin overlay when
   * available. Requires the `marker` library to be loaded.
   */
  useAdvancedMarker?: boolean;
  /** Fired on every `idle` event with the new marker (map center) position. */
  onLocationChange?: (pos: LatLng) => void;
}

type MaybeAdvancedMarker = google.maps.marker.AdvancedMarkerElement | null;

/**
 * LocationPicker - wraps a Google Map so the user can drag the map and the centered
 * marker reports the chosen position.
 */
export class LocationPicker {
  public element: HTMLElement | null;
  public map: google.maps.Map;

  private readonly options: Required<
    Pick<LocationPickerOptions, 'setCurrentPosition' | 'useAdvancedMarker'>
  > &
    LocationPickerOptions;
  private markerNode: HTMLDivElement | null = null;
  private advancedMarker: MaybeAdvancedMarker = null;
  private idleListener: google.maps.MapsEventListener | null = null;

  constructor(
    element: string | HTMLElement,
    options: LocationPickerOptions = {},
    mapOptions: google.maps.MapOptions = {},
  ) {
    this.options = {
      setCurrentPosition: true,
      useAdvancedMarker: false,
      ...options,
    };

    // Allow both a string id or a direct reference to the element
    if (element instanceof HTMLElement) {
      this.element = element;
    } else {
      this.element = document.getElementById(element);
    }

    if (!this.element) {
      throw new Error(`LocationPicker: element "${String(element)}" was not found.`);
    }

    const center: google.maps.LatLngLiteral = {
      lat: this.options.lat ?? 34.4346,
      lng: this.options.lng ?? 35.8362,
    };

    const mergedMapOptions: google.maps.MapOptions = {
      center,
      zoom: 15,
      ...mapOptions,
    };

    this.map = new google.maps.Map(this.element, mergedMapOptions);
    this.element.classList.add('location-picker');

    this.initMarker();

    // idle listener for onLocationChange
    this.idleListener = this.map.addListener('idle', () => {
      const pos = this.getMarkerPosition();
      this.options.onLocationChange?.(pos);
    });

    if (this.options.setCurrentPosition && this.options.lat == null && this.options.lng == null) {
      // fire and forget; caller can also call setCurrentPosition() themselves
      void this.setCurrentPosition().catch(() => {
        /* swallow - geolocation is best-effort at construction time */
      });
    }
  }

  /** Current marker position (map center). */
  public getMarkerPosition(): LatLng {
    const latLng = this.map.getCenter();
    if (!latLng) {
      return { lat: 0, lng: 0 };
    }
    return { lat: latLng.lat(), lng: latLng.lng() };
  }

  /** Center the map (and marker) on the given coordinates. */
  public setLocation(lat: number, lng: number): void {
    this.map.setCenter({ lat, lng });
  }

  /**
   * Request the user's current position via the Geolocation API and center the map on it.
   * Resolves with the resolved coordinates, rejects if geolocation is unavailable or denied.
   */
  public setCurrentPosition(): Promise<LatLng> {
    return new Promise<LatLng>((resolve, reject) => {
      if (typeof navigator === 'undefined' || !navigator.geolocation) {
        reject(new Error('Geolocation is not supported by this browser.'));
        return;
      }
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const pos: LatLng = {
            lat: position.coords.latitude,
            lng: position.coords.longitude,
          };
          this.map.setCenter(pos);
          resolve(pos);
        },
        (err) => {
          reject(err instanceof Error ? err : new Error('Could not determine your location.'));
        },
      );
    });
  }

  /** Remove listeners, marker DOM nodes, and related classes. The map instance is released. */
  public destroy(): void {
    if (this.idleListener) {
      this.idleListener.remove();
      this.idleListener = null;
    }
    if (this.markerNode && this.markerNode.parentNode) {
      this.markerNode.parentNode.removeChild(this.markerNode);
    }
    this.markerNode = null;
    if (this.advancedMarker) {
      this.advancedMarker.map = null;
      this.advancedMarker = null;
    }
    if (this.element) {
      this.element.classList.remove('location-picker');
    }
  }

  private initMarker(): void {
    const advancedAvailable =
      this.options.useAdvancedMarker &&
      typeof google !== 'undefined' &&
      !!google.maps?.marker?.AdvancedMarkerElement;

    if (advancedAvailable) {
      const AdvancedMarker = google.maps.marker.AdvancedMarkerElement;
      this.advancedMarker = new AdvancedMarker({
        map: this.map,
        position: this.map.getCenter() ?? undefined,
      });
      // Keep the advanced marker glued to the center on idle.
      this.map.addListener('center_changed', () => {
        const c = this.map.getCenter();
        if (this.advancedMarker && c) {
          this.advancedMarker.position = c;
        }
      });
      return;
    }

    // CSS-pin overlay fallback
    const node = document.createElement('div');
    node.classList.add('centerMarker');
    this.markerNode = node;
    const firstChild = this.element?.children[0];
    if (firstChild) {
      firstChild.appendChild(node);
    } else if (this.element) {
      this.element.appendChild(node);
    }
  }
}

export default LocationPicker;
