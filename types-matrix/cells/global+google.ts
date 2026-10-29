/// <reference types="location-picker/global" />
// With location-picker/google in the program, the global's Google statics get the precise overloads.
import type { ProviderAdapter } from 'location-picker/core';
import type {} from 'location-picker/google';

type Equals<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;

const adapter = LocationPicker.googleProvider({ apiKey: 'AIza-test' });
const precise: Equals<typeof adapter, ProviderAdapter<google.maps.Map>> = true;
const maps: Promise<typeof google.maps> = LocationPicker.loadGoogleMaps({ apiKey: 'AIza-test' });
export const used = [precise, maps];
