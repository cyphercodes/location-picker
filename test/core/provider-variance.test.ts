import { describe, expect, it } from 'vitest';
import type { LocationPicker, LocationPickerOptions, ProviderAdapter } from '../../src/core.js';
import type { LocationPickerElement } from '../../src/element.js';
import { leafletProvider, type LeafletMap } from '../../src/leaflet.js';

// Compile-time regression test (npm run typecheck covers test files): an adapter typed for one map engine must stay
// assignable to the un-parameterised public types, the way apps store a shared provider or type a component field.
describe('provider adapter typing', () => {
  it('accepts an engine-typed adapter held in a variable', () => {
    const shared = leafletProvider();
    const options: LocationPickerOptions = { provider: shared, onReady: ({ map }) => void map };
    const plain: ProviderAdapter = shared;
    const store = (
      el: LocationPickerElement,
      picker: LocationPicker<LeafletMap>,
    ): LocationPicker => {
      el.provider = shared;
      return picker;
    };
    expect([options.provider, plain.name, typeof store]).toEqual([shared, 'leaflet', 'function']);
  });
});
