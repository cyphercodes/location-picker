// Shared helpers for the WP4 element tests (unit and browser projects).
import { LocationPickerElement } from '../../src/element/location-picker-element.js';
import { defineLocationPicker } from '../../src/element/define.js';
import { erased } from '../../src/core/providers.js';
import {
  createFakeAdapter,
  type FakeAdapterOptions,
  type FakeControl,
} from '../fixtures/fake-adapter.js';
import { record, type Logged } from '../core/helpers.js';

export {
  details,
  errors,
  flush,
  must,
  record,
  resetStore,
  sleep,
  spyConsole,
  summary,
  texts,
} from '../core/helpers.js';
export type { Logged };

// What types/globals.d.ts gives package consumers (that file resolves against dist/, so tests declare it here).
declare global {
  interface HTMLElementTagNameMap {
    'location-picker': LocationPickerElement;
  }
}

export interface Picked {
  readonly el: LocationPickerElement;
  readonly fake: FakeControl;
  readonly log: Logged[];
}

/** Defines <location-picker> once per realm. */
export function define(): typeof LocationPickerElement {
  const ctor = defineLocationPicker();
  if (!ctor) throw new Error('customElements is missing');
  return ctor;
}

/** The first <location-picker> under `root`. */
export function picker(root: ParentNode = document): LocationPickerElement {
  const el = root.querySelector('location-picker');
  if (!(el instanceof LocationPickerElement))
    throw new Error('expected an upgraded <location-picker>');
  return el;
}

/**
 * Renders `html` (which contains one <location-picker>) into the body and switches the picker to the fake adapter
 * before its connect microtask mounts it. Events are recorded from the start.
 */
export function render(html: string, fakeOptions: FakeAdapterOptions = {}): Picked {
  define();
  document.body.innerHTML = html;
  const el = picker();
  const fake = createFakeAdapter(fakeOptions);
  const log = record(el);
  el.provider = erased(fake.adapter);
  return { el, fake, log };
}

/** A fresh, unconnected element using the fake adapter. */
export function create(fakeOptions: FakeAdapterOptions = {}): Picked {
  define();
  const el = document.createElement('location-picker');
  const fake = createFakeAdapter(fakeOptions);
  const log = record(el);
  el.provider = erased(fake.adapter);
  return { el, fake, log };
}

/** The shadow-root part `name`. */
export function part(el: LocationPickerElement, name: string): HTMLElement {
  const node = el.shadowRoot?.querySelector(`[part~="${name}"]`);
  if (!(node instanceof HTMLElement)) throw new Error(`expected part ${name}`);
  return node;
}
