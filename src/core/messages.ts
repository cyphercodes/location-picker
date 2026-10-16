import type { Messages } from '../core.js';

/**
 * Built-in English UI strings (api.d.ts `Messages` defaults). Values are never localised. `cooperativeHint` says
 * "Ctrl"; resolveConfig swaps in "⌘" on Apple platforms when the user did not override it.
 */
export const MESSAGES: Readonly<Messages> = {
  label: 'Location picker',
  roleDescription: 'map',
  instructions:
    'Drag the map or use the arrow keys to move the pin; plus and minus zoom. Press Enter to choose the point under the pin.',
  confirm: 'Use this location',
  locate: 'Use my location',
  locating: 'Finding your location…',
  searchLabel: 'Search for a place or paste coordinates',
  searchPlaceholder: 'Search or paste coordinates',
  noResults: 'No results',
  goTo: (coords) => `Go to ${coords}`,
  announce: (d) =>
    `Location set: ${d.lat.toFixed(5)}, ${d.lng.toFixed(5)}${d.address ? '. ' + d.address : ''}`,
  valueMissing: 'Please choose a location on the map.',
  geolocationDenied: 'Location permission was denied.',
  geolocationUnavailable: 'Your location is unavailable.',
  geolocationTimeout: 'Finding your location took too long.',
  geolocationUnsupported: 'Location needs HTTPS and a browser that supports it.',
  cooperativeHint: 'Use Ctrl + scroll to zoom the map',
  loadError: 'The map could not be loaded. Type coordinates instead.',
  fallbackLabel: 'Latitude, longitude',
};
