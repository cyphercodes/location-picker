// WP4-14: axe-core finds no serious or critical violation in the default, search, locate-button, unset and error
// states (browser project, scoped to the element, open shadow root included), and the map region has a role, an
// accessible name and a description. The search state uses a fake adapter with a geocoder, so the built-in combobox
// is checked as soon as it is part of the build (WP3).
import axe from 'axe-core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Geocoder } from '../../src/core.js';
import type { LocationPickerElement } from '../../src/element/location-picker-element.js';
import { flush, must, part, render, resetStore, spyConsole } from './helpers.js';

const geocoder: Geocoder = { search: async () => [] };

beforeEach(() => {
  resetStore();
  spyConsole();
});
afterEach(() => {
  vi.restoreAllMocks();
  document.body.innerHTML = '';
});

/** Serious and critical violations inside `el`, as "rule: target" lines (empty when clean). */
async function violations(el: LocationPickerElement): Promise<string[]> {
  const results = await axe.run(el, {
    resultTypes: ['violations'],
    // Page-level rules: the test page has no landmarks or headings around the element.
    rules: { region: { enabled: false } },
  });
  return results.violations
    .filter((v) => v.impact == 'serious' || v.impact == 'critical')
    .flatMap((v) => v.nodes.map((node) => `${v.id} (${v.impact}): ${JSON.stringify(node.target)}`));
}

function expectNamedRegion(el: LocationPickerElement): void {
  const map = part(el, 'map');
  expect(map.getAttribute('role')).toBe('application');
  expect(map.getAttribute('aria-label')).toBeTruthy();
  const described = el.shadowRoot?.getElementById(must(map.getAttribute('aria-describedby')));
  expect(described?.textContent?.trim()).toBeTruthy();
}

describe('WP4-14 accessibility (axe-core)', () => {
  it('default: a labelled picker with a value', async () => {
    const { el } = render(
      '<label for="loc">Store location</label><location-picker id="loc" value="48.8584,2.2945"></location-picker>',
    );
    await el.ready;
    await flush();
    expectNamedRegion(el);
    expect(part(el, 'map').getAttribute('aria-label')).toBe('Store location');
    expect(await violations(el)).toEqual([]);
  });

  it('search', async () => {
    const { el } = render('<location-picker search aria-label="Pickup point"></location-picker>', {
      geocoder,
    });
    await el.ready;
    // The built-in combobox loads as a chunk after the mount; axe must see it, not an empty slot.
    const search = part(el, 'search');
    // oxlint-disable-next-line no-await-in-loop -- polls until the chunk rendered
    for (let i = 0; i < 50 && !search.querySelector('[role="combobox"]'); i++) await flush();
    expect(search.querySelector('[role="combobox"]')).toBeTruthy();
    expectNamedRegion(el);
    expect(await violations(el)).toEqual([]);
  });

  it('locate button', async () => {
    const { el } = render('<location-picker locate="button" value="1,2"></location-picker>');
    await el.ready;
    await flush();
    const button = part(el, 'locate-button');
    expect(button.hidden).toBe(false);
    expect(button.getAttribute('aria-label')).toBeTruthy();
    expect(await violations(el)).toEqual([]);
  });

  it('unset, with the confirm button shown for a given centre', async () => {
    const { el } = render('<location-picker center="48.8584,2.2945"></location-picker>');
    await el.ready;
    await flush();
    expect(el.value).toBe('');
    expect(part(el, 'confirm-button').hidden).toBe(false);
    expectNamedRegion(el);
    expect(await violations(el)).toEqual([]);
  });

  it('error: the engine failed to load', async () => {
    const { el } = render('<location-picker></location-picker>', {
      failWith: 'ENGINE_LOAD_FAILED',
    });
    await el.ready.catch(() => undefined);
    await flush();
    expect(el.matches(':state(error)')).toBe(true);
    expect(part(el, 'error-message').hidden).toBe(false);
    expect(await violations(el)).toEqual([]);
  });
});
