// The ONE HTMLElementTagNameMap augmentation (CONTRACT §1.2, §2), referenced by index/element .d.mts AND .d.cts, so a
// program that sees both the ESM and the CJS types declares it once (no TS2717). The element class has no private
// members, so the ESM and CJS declarations of it are mutually assignable.
import type { LocationPickerElement } from './element.cjs';

declare global {
  interface HTMLElementTagNameMap {
    'location-picker': LocationPickerElement;
  }
}

export {};
