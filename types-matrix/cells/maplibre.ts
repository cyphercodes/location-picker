// location-picker/maplibre: factory, style constant and the inferred map type.
import { LocationPicker } from 'location-picker/core';
import {
  OPENFREEMAP_STYLE_URL,
  maplibreProvider,
  type MapLibreMap,
} from 'location-picker/maplibre';

const picker = new LocationPicker('#map', {
  provider: maplibreProvider({ mapStyle: OPENFREEMAP_STYLE_URL, engineCssUrl: false }),
});
const map: MapLibreMap | undefined = picker.map;
export const used = [map?.getZoom()];
