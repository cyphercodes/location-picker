import { describe, expect, it } from 'vitest';
import {
  LocationPicker,
  type LocationPickerOptions,
  type ProviderAdapter,
} from '../../src/core.js';
import type { LocationPickerElement } from '../../src/element.js';
import { leafletProvider } from '../../src/leaflet.js';

// Compile-time regression test (npm run typecheck covers test files): an adapter typed for one map engine must stay
// assignable to the un-parameterised public types, the way apps store a shared provider or type a component field.
describe('provider adapter typing', () => {
  it('accepts an engine-typed adapter held in a variable', () => {
    const shared = leafletProvider();
    const options: LocationPickerOptions = { provider: shared, onReady: ({ map }) => void map };
    const asUnknown: ProviderAdapter = shared;
    const assign = (
      el: LocationPickerElement,
      picker: LocationPicker<
        ReturnType<typeof leafletProvider> extends ProviderAdapter<infer M> ? M : never
      >,
    ) => {
      el.provider = shared;
      const field: LocationPicker = picker;
      return field;
    };
    expect([options.provider, asUnknown.name, typeof assign]).toEqual([
      shared,
      'leaflet',
      'function',
    ]);
  });
});
