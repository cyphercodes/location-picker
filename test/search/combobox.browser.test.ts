// WP3-17 in real browsers: the built-in search box over Photon (answered by the §12.6 route table), mounted by the
// real core through its lazy chunk, checked with axe-core and driven with real keyboard input.
import axe from 'axe-core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { userEvent } from 'vitest/browser';
import { LocationPicker } from '../../src/core.js';
import { photonGeocoder } from '../../src/photon.js';
import { createFakeAdapter, type FakeMap } from '../fixtures/fake-adapter.js';
import { record, resetStore, waitFor } from '../providers/helpers.js';

const EIFFEL = '48.8584,2.2945';
const pickers: LocationPicker<FakeMap>[] = [];

async function create() {
  document.body.innerHTML =
    '<main><form id="form" action="/never"><label for="name">Name</label><input id="name">' +
    '<div id="map" style="height:300px"></div></form></main>';
  const picker = new LocationPicker<FakeMap>('#map', {
    provider: createFakeAdapter({ name: 'leaflet' }).adapter,
    value: EIFFEL,
    search: true,
    geocoder: photonGeocoder(),
  });
  pickers.push(picker);
  const log = record(picker, ['input', 'change', 'error']);
  await picker.ready;
  const input = await waitFor(
    () => document.querySelector<HTMLInputElement>('#map .lp-search-input'),
    3000,
    'the search box',
  );
  return { picker, log, input };
}

const options = (): HTMLElement[] => [
  ...document.querySelectorAll<HTMLElement>('#map .lp-search-option'),
];

beforeEach(() => resetStore());
afterEach(async () => {
  for (const picker of pickers.splice(0)) picker.destroy();
  await userEvent.cleanup();
  vi.restoreAllMocks();
});

describe('WP3-17 the search combobox in a real browser', () => {
  it('has no serious or critical axe issues, closed and open', async () => {
    const { input } = await create();
    const check = async (): Promise<string[]> => {
      const { violations } = await axe.run(document.querySelector('#map') ?? document, {
        resultTypes: ['violations'],
      });
      return violations
        .filter((v) => v.impact == 'serious' || v.impact == 'critical')
        .map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`);
    };
    expect(await check()).toEqual([]);
    await userEvent.click(input);
    await userEvent.keyboard('eiffel');
    await waitFor(() => options().length > 0, 3000, 'the options');
    await userEvent.keyboard('{ArrowDown}');
    expect(input.getAttribute('aria-expanded')).toBe('true');
    expect(await check()).toEqual([]);
  });

  it('updates the ARIA state with the keys; Enter picks without submitting the form', async () => {
    const { picker, log, input } = await create();
    const submits = vi.fn<(event: Event) => void>((event) => event.preventDefault());
    document.querySelector('#form')?.addEventListener('submit', submits);
    const host: string[] = [];
    for (const type of ['input', 'change'])
      document.querySelector('#map')?.addEventListener(type, (event) => {
        if (event.target != document.querySelector('#map')) host.push(type);
      });

    await userEvent.click(input);
    await userEvent.keyboard('eiffel');
    await waitFor(() => options().length > 0, 3000, 'the options');
    const listbox = document.querySelector('#map .lp-search-listbox');
    expect(input.getAttribute('aria-controls')).toBe(listbox?.id);
    expect(input.getAttribute('aria-expanded')).toBe('true');

    await userEvent.keyboard('{ArrowDown}');
    const first = options()[0];
    expect(input.getAttribute('aria-activedescendant')).toBe(first?.id);
    expect(first?.getAttribute('aria-selected')).toBe('true');

    await userEvent.keyboard('{Escape}');
    expect(input.getAttribute('aria-expanded')).toBe('false');
    expect(input.hasAttribute('aria-activedescendant')).toBe(false);

    await userEvent.keyboard('{ArrowDown}');
    await userEvent.keyboard('{Enter}');
    await waitFor(() => log.some((e) => e.type == 'change'), 3000, 'the pick');
    expect(submits).not.toHaveBeenCalled();
    expect(
      log.filter((e) => e.type == 'change').map((e) => Reflect.get(Object(e.detail), 'source')),
    ).toEqual(['search']);
    expect(picker.address).toContain('Tour Eiffel');
    // The box's own input/change events stay inside it; the host only sees the picker's.
    expect(host).toEqual([]);
  });

  it('a coordinate shows one offline "Go to …" option and commits it with no request', async () => {
    const { picker, log, input } = await create();
    const requests = performance.getEntriesByType('resource').length;
    await userEvent.click(input);
    await userEvent.keyboard('48.85, 2.29');
    await waitFor(() => options().length == 1, 3000, 'the offline option');
    expect(options()[0]?.textContent).toBe('Go to 48.85, 2.29');
    await userEvent.keyboard('{Enter}');
    await waitFor(() => log.some((e) => e.type == 'change'), 3000, 'the commit');
    expect(picker.value).toBe('48.85,2.29');
    expect(
      performance
        .getEntriesByType('resource')
        .slice(requests)
        .filter((entry) => entry.name.includes('photon')),
    ).toEqual([]);
  });
});
