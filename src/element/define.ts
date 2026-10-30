// defineLocationPicker (CONTRACT §3.9, §12.3): guarded, idempotent across every copy of the library on the page.
import { duplicateDefinition, warnOnce } from '../core/diagnostics.js';
import { getStore } from '../core/store.js';
import { version } from '../core/version.js';
import { LocationPickerElement } from './location-picker-element.js';

/**
 * Defines the element. Idempotent: returns the existing constructor when the tag is taken by ANY copy of this
 * library (warns once if versions differ). Returns undefined where `customElements` does not exist (server).
 * Other tag names register a trivial subclass. Importing `location-picker` or `location-picker/element` already
 * calls this with the default tag.
 * @default tagName 'location-picker'
 * @example defineLocationPicker('geo-picker')
 */
export function defineLocationPicker(
  tagName: `${string}-${string}` = 'location-picker',
): typeof LocationPickerElement | undefined {
  if (typeof customElements == 'undefined') return undefined;
  const { defined } = getStore();
  const existing: unknown = customElements.get(tagName);
  if (existing) {
    const by = defined.get(tagName);
    if (by && by != version)
      warnOnce(`defined:${tagName}`, duplicateDefinition(tagName, by, version));
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- another copy's class has the same shape
    return existing as typeof LocationPickerElement;
  }
  // One constructor can back only one tag name.
  const element =
    tagName == 'location-picker' ? LocationPickerElement : class extends LocationPickerElement {};
  customElements.define(tagName, element);
  defined.set(tagName, version);
  return element;
}
