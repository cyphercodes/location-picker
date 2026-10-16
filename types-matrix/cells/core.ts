// location-picker/core: the class, its events and options, and a custom adapter (CONTRACT §4.7 shape).
import DefaultPicker, {
  LocationPicker,
  LocationPickerError,
  type LatLng,
  type LocationDetail,
  type MapHandle,
  type ProviderAdapter,
} from 'location-picker/core';

interface CustomMap {
  readonly id: string;
}

const custom: ProviderAdapter<CustomMap> = {
  name: 'custom',
  mount({ container, view, events }): MapHandle<CustomMap> {
    let center: LatLng = view.center;
    let zoom = view.zoom;
    container.addEventListener('pointerdown', () => events.interactionStart());
    return {
      map: { id: container.id },
      getCenter: () => center,
      getZoom: () => zoom,
      setView(next, nextZoom) {
        center = next;
        zoom = nextZoom ?? zoom;
        events.moveEnd(center, zoom);
      },
      setZoom: (next) => (zoom = next),
      setInteractive: () => undefined,
      resize: () => undefined,
      destroy: () => undefined,
    };
  },
};

const picker = new LocationPicker('#map', { provider: custom, value: { lat: 48.8584, lng: 2.2945 } });
const map: CustomMap | undefined = picker.map;
const same: LocationPicker<CustomMap> = picker;
const legacy = new DefaultPicker(document.body, { lat: 1, lng: 2, setCurrentPosition: false });
picker.setLocation(48.8584, 2.2945);
picker.setLocation('48.8584, 2.2945', { zoom: 17 });
picker.addEventListener('change', (event) => {
  const detail: LocationDetail = event.detail;
  return detail.source === 'user';
});
picker.addEventListener('error', (event) => event.detail.code);
const choice: LatLng | null = picker.valueAsLatLng;
const located: Promise<LocationDetail> = picker.locate({ timeout: 5000 });
// @ts-expect-error arrays are rejected (lat,lng vs GeoJSON lng,lat is ambiguous)
picker.setLocation([1, 2]);
export const used = [map, same, legacy.getMarkerPosition(), choice, located];
export const error = (e: unknown): string | undefined =>
  e instanceof LocationPickerError ? e.fix : undefined;
