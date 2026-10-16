// Bound inputs (CONTRACT §3.3, §3.4, D18): existing inputs that receive the rounded value and seed the initial one.
// They mirror the picker's events: native `input` for live changes, `input` + `change` on commits, nothing for silent
// writes. They are never written before their initial value has been read.
import type { InputRef, LocationPickerError } from '../core.js';
import type { ResolvedConfig } from '../internal/contracts.js';
import type { LatLng } from '../utils.js';
import { readLatLngInput } from './config.js';
import { REQUIRED_ON_HIDDEN, inputNotFound, warnOnce } from './diagnostics.js';

export type BoundInput = HTMLInputElement | HTMLTextAreaElement;
type Key = keyof ResolvedConfig['inputs'];
const KEYS: readonly Key[] = ['value', 'lat', 'lng', 'address'];
/** How a write is announced on the inputs: silent, live (`input`), or a commit (`input` + `change`). */
export type InputEvents = 'none' | 'input' | 'commit';

/** Structural, so inputs from another realm (an iframe's document) qualify too. */
const isInput = (node: unknown): node is BoundInput =>
  typeof node == 'object' &&
  node !== null &&
  Reflect.get(node, 'nodeType') === 1 &&
  /^(input|textarea)$/.test(String(Reflect.get(node, 'localName')));

/** An element, an id (tried first) or a CSS selector, resolved in `root`. */
export function resolveInputRef(
  root: Document | ShadowRoot,
  ref: InputRef | undefined,
): BoundInput | null {
  if (!ref) return null;
  if (typeof ref != 'string') return isInput(ref) ? ref : null;
  let found: Element | null = root.getElementById(ref);
  if (!found) {
    try {
      found = root.querySelector(ref);
    } catch {
      // not a valid selector: nothing matches
    }
  }
  return isInput(found) ? found : null;
}

export interface Seed {
  /** The inputs' current value (lat + lng, else value-input); null when empty or invalid. */
  readonly value: LatLng | null;
  /** The same from their default values (the server-rendered `value` attributes): the element's reset value. */
  readonly defaults: LatLng | null;
  /** INVALID_VALUE for a non-empty value that does not parse. */
  readonly error?: LocationPickerError;
}

export class BoundInputs {
  readonly inputs: Partial<Record<Key, BoundInput>> = {};
  readonly #nested: (input: BoundInput) => boolean;

  /**
   * @param naming how diagnostics spell the binding (`latInput` for the class, `lat-input` for the element)
   * @param nested inputs whose native events must not bubble (inside a `<location-picker>` element, D18)
   */
  constructor(
    root: Document | ShadowRoot,
    refs: ResolvedConfig['inputs'],
    naming: (key: Key) => string,
    nested: (input: BoundInput) => boolean,
  ) {
    this.#nested = nested;
    const parsed = root.ownerDocument?.readyState != 'loading';
    for (const key of KEYS) {
      const ref = refs[key];
      const input = resolveInputRef(root, ref);
      if (input) {
        this.inputs[key] = input;
        if (input.required && input.type == 'hidden')
          warnOnce('required-hidden', REQUIRED_ON_HIDDEN);
      } else if (ref && parsed) {
        const name = naming(key);
        const text = typeof ref == 'string' ? ref : `<${ref.localName}>`;
        warnOnce(`input:${name}:${text}`, inputNotFound(name, text));
      }
    }
  }

  /** Reads the seed once, before anything is written. */
  read(): Seed {
    const { value, lat, lng } = this.inputs;
    const pick = (of: (input: BoundInput) => string): string =>
      lat && lng ? (of(lat) || of(lng) ? `${of(lat)},${of(lng)}` : '') : value ? of(value) : '';
    const current = readLatLngInput(pick((i) => i.value));
    return {
      value: current.value,
      defaults: readLatLngInput(pick((i) => i.defaultValue)).value,
      ...(current.error && { error: current.error }),
    };
  }

  /**
   * Writes the canonical value ("" = unset; undefined = leave the coordinate inputs alone) and the address (undefined
   * = leave it alone), then dispatches the events of `events` on every input written.
   */
  write(value: string | undefined, address: string | null | undefined, events: InputEvents): void {
    const texts: Partial<Record<Key, string>> = {};
    if (value !== undefined) {
      const [lat = '', lng = ''] = value ? value.split(',') : [];
      Object.assign(texts, { value, lat, lng });
    }
    if (address !== undefined) texts.address = address ?? '';
    for (const key of KEYS) {
      const input = this.inputs[key];
      const text = texts[key];
      if (!input || text === undefined) continue;
      input.value = text;
      if (events == 'none') continue;
      const bubbles = !this.#nested(input);
      input.dispatchEvent(new Event('input', { bubbles }));
      if (events == 'commit') input.dispatchEvent(new Event('change', { bubbles }));
    }
  }
}
