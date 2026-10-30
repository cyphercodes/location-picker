// WP4-17: the generated custom-elements.json (from the LocationPickerElement JSDoc) lists every ATTRIBUTES attribute,
// the 5 events, and every part, slot, state and CSS custom property of CONTRACT §3.7; the package `customElements`
// field resolves to it. Supersets are checked, so later additions (field mode) only need their JSDoc.
// Needs `npm run build` (it runs `cem analyze`): skipped locally without it, a failure in CI.
import { existsSync, readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ATTRIBUTES } from '../../src/element/attributes.js';
import type { PickerStateName } from '../../src/internal/contracts.js';
import { skipUnbuilt } from '../package/packed.js';
import { flush, render, spyConsole } from './helpers.js';

interface Named {
  readonly name: string;
  readonly description?: string;
  readonly default?: string;
}
interface Declaration {
  readonly name: string;
  readonly tagName?: string;
  readonly customElement?: boolean;
  readonly attributes?: readonly Named[];
  readonly events?: readonly Named[];
  readonly cssParts?: readonly Named[];
  readonly slots?: readonly Named[];
  readonly cssStates?: readonly Named[];
  readonly cssProperties?: readonly Named[];
}
interface Manifest {
  readonly schemaVersion: string;
  readonly modules: readonly { readonly declarations?: readonly Declaration[] }[];
}

const PARTS = [
  'base',
  'search',
  'search-input',
  'search-listbox',
  'search-option',
  'map',
  'pin',
  'pin-icon',
  'pin-shadow',
  'confirm-button',
  'controls',
  'locate-button',
  'hint',
  'error-message',
  'fallback',
];
const STATES: readonly PickerStateName[] = [
  'unset',
  'loading',
  'ready',
  'error',
  'dragging',
  'locating',
  'searching',
  'interacted',
];
const CSS_PROPERTIES = [
  '--lp-pin-color',
  '--lp-pin-inner',
  '--lp-pin-size',
  '--lp-pin-lift',
  '--lp-pin-shadow',
  '--lp-unset-opacity',
  '--lp-accent',
  '--lp-surface',
  '--lp-on-surface',
  '--lp-radius',
  '--lp-control-size',
  '--lp-font',
  '--lp-tile-filter',
  '--lp-transition',
];
/** Native HTMLElement attributes the picker also reads; they are documented by the platform, not the manifest. */
const NATIVE = new Set(['lang', 'nonce']);

const names = (list: readonly Named[] | undefined): string[] => (list ?? []).map((n) => n.name);

function read(): Declaration {
  const manifest: Manifest = JSON.parse(readFileSync('custom-elements.json', 'utf8'));
  const found = manifest.modules
    .flatMap((module) => module.declarations ?? [])
    .find((declaration) => declaration.customElement);
  if (!found) throw new Error('custom-elements.json declares no custom element');
  return found;
}

describe.skipIf(skipUnbuilt)('WP4-17 custom-elements.json', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    document.body.innerHTML = '';
  });

  it('declares LocationPickerElement as <location-picker>', () => {
    const element = read();
    expect(element.name).toBe('LocationPickerElement');
    expect(element.tagName).toBe('location-picker');
  });

  it('lists every ATTRIBUTES attribute', () => {
    const listed = names(read().attributes);
    const expected = ATTRIBUTES.map((spec) => spec.attr).filter((attr) => !NATIVE.has(attr));
    expect(expected.filter((attr) => !listed.includes(attr))).toEqual([]);
  });

  it('lists the 5 events, with their detail types', () => {
    const events = read().events ?? [];
    expect(names(events)).toEqual(['input', 'change', 'addresschange', 'ready', 'error']);
    for (const event of events) expect(event.description).toMatch(/CustomEvent<\w+>/);
  });

  it('lists every part, slot, state and CSS property of §3.7', () => {
    const element = read();
    expect(PARTS.filter((part) => !names(element.cssParts).includes(part))).toEqual([]);
    expect(names(element.slots)).toEqual(expect.arrayContaining(['marker', 'controls', 'error']));
    expect(STATES.filter((state) => !names(element.cssStates).includes(state))).toEqual([]);
    const properties = element.cssProperties ?? [];
    expect(CSS_PROPERTIES.filter((p) => !names(properties).includes(p))).toEqual([]);
    expect(properties.filter((property) => !property.default).map((p) => p.name)).toEqual([]);
  });

  it('every part the element renders is in the manifest', async () => {
    spyConsole();
    const { el } = render('<location-picker locate="button" search></location-picker>');
    await flush();
    const rendered = new Set(
      [...(el.shadowRoot?.querySelectorAll('[part]') ?? [])].flatMap((node) =>
        (node.getAttribute('part') ?? '').split(/\s+/).filter(Boolean),
      ),
    );
    expect(rendered.size).toBeGreaterThan(5);
    const listed = names(read().cssParts);
    expect([...rendered].filter((part) => !listed.includes(part))).toEqual([]);
    el.remove();
  });

  it('the package customElements field and export resolve to it', () => {
    const pkg: { customElements: string; exports: Record<string, unknown> } = JSON.parse(
      readFileSync('package.json', 'utf8'),
    );
    expect(pkg.customElements).toBe('./custom-elements.json');
    expect(pkg.exports['./custom-elements.json']).toBe('./custom-elements.json');
    expect(existsSync(pkg.customElements)).toBe(true);
  });
});
