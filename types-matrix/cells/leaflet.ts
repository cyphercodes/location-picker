// location-picker/leaflet: factory, constants and the inferred map type.
import { LocationPicker, type LocationPickerOptions } from 'location-picker/core';
import {
  LEAFLET_CSS_INTEGRITY,
  LEAFLET_CSS_URL,
  LEAFLET_JS_INTEGRITY,
  LEAFLET_JS_URL,
  LEAFLET_VERSION,
  OSM_ATTRIBUTION,
  OSM_TILE_URL,
  leafletProvider,
  type LeafletMap,
} from 'location-picker/leaflet';

const provider = leafletProvider({
  tileUrl: OSM_TILE_URL,
  attribution: OSM_ATTRIBUTION,
  maxZoom: 19,
});
const picker = new LocationPicker('#map', { provider });
const map: LeafletMap | undefined = picker.map;
// A provider held in a variable stays assignable to the un-parameterised types (an Angular component field, shared options).
const options: LocationPickerOptions = { provider, onReady: ({ map: ready }) => void ready };
let field: LocationPicker;
field = picker;
const pinned: '1.9.4' = LEAFLET_VERSION;
const assets: string[] = [
  LEAFLET_JS_URL,
  LEAFLET_JS_INTEGRITY,
  LEAFLET_CSS_URL,
  LEAFLET_CSS_INTEGRITY,
];
export const used = [map?.getZoom(), pinned, assets, options, field];
