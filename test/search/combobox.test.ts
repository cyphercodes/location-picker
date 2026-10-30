// WP3-17 (jsdom part): the search combobox (§5.2, §12.5) driven directly through createCombobox with a stub context.
// Real keyboard input, form submission, axe and the host-event containment run in combobox.browser.test.ts.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  GeocodeResult,
  Geocoder,
  GeocodeSearchOptions,
  SearchContext,
} from '../../src/core.js';
import { MESSAGES } from '../../src/core/messages.js';
import type { ComboboxOptions } from '../../src/internal/contracts.js';
import { createCombobox } from '../../src/search/combobox.js';

const RESULTS: GeocodeResult[] = [
  { lat: 34.4367, lng: 35.8497, label: 'Tripoli', address: 'Tripoli, 1300, Lebanon' },
  { lat: 32.896672, lng: 13.1777923, label: 'Tripoli', address: 'Tripoli, Libya' },
  { lat: 33.8959, lng: 35.4784, label: 'Beirut' },
];

interface Setup {
  readonly input: HTMLInputElement;
  readonly list: HTMLUListElement;
  readonly selected: GeocodeResult[];
  readonly calls: [string, GeocodeSearchOptions][];
  readonly errors: unknown[];
  readonly slot: HTMLElement;
  readonly destroy: () => void;
  readonly clear: () => void;
}

function setup(
  search: Geocoder['search'] = async () => RESULTS,
  overrides: Partial<ComboboxOptions> = {},
): Setup {
  document.body.innerHTML = '<form><div class="lp-search"></div></form>';
  const slot = document.querySelector<HTMLElement>('.lp-search')!;
  const selected: GeocodeResult[] = [];
  const calls: [string, GeocodeSearchOptions][] = [];
  const errors: unknown[] = [];
  const ctx = {
    slot,
    placeholder: 'Search or paste coordinates',
    label: 'Search for a place or paste coordinates',
    lang: 'fr',
    handle: { getCenter: () => ({ lat: 48.8584, lng: 362.2945 }) },
    select: (result: GeocodeResult) => selected.push(result),
  } as unknown as SearchContext;
  const geocoder: Geocoder = {
    search: (query, options) => {
      calls.push([query, options]);
      return search!(query, options);
    },
  };
  const handle = createCombobox(ctx, geocoder, {
    debounce: 300,
    minChars: 3,
    limit: 5,
    messages: MESSAGES,
    onError: (error) => errors.push(error),
    ...overrides,
  });
  const input = slot.querySelector('input')!;
  expect(handle.element).toBe(input);
  return {
    input,
    list: slot.querySelector('ul')!,
    selected,
    calls,
    errors,
    slot,
    destroy: () => handle.destroy(),
    clear: () => handle.clear(),
  };
}

const type = (input: HTMLInputElement, value: string): void => {
  input.value = value;
  input.dispatchEvent(new Event('input', { bubbles: true }));
};
const key = (input: HTMLInputElement, name: string): KeyboardEvent => {
  const event = new KeyboardEvent('keydown', { key: name, bubbles: true, cancelable: true });
  input.dispatchEvent(event);
  return event;
};
const options = (list: HTMLElement): HTMLElement[] => [
  ...list.querySelectorAll<HTMLElement>('[role=option]'),
];

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe('createCombobox', () => {
  it('renders the WAI-ARIA combobox with parts and lp-* classes', () => {
    const { input, list } = setup();
    expect(input).toMatchObject({ type: 'search', placeholder: 'Search or paste coordinates' });
    expect(input.className).toBe('lp-search-input');
    expect(input.getAttribute('part')).toBe('search-input');
    expect(input.getAttribute('role')).toBe('combobox');
    expect(input.getAttribute('aria-autocomplete')).toBe('list');
    expect(input.getAttribute('aria-expanded')).toBe('false');
    expect(input.getAttribute('aria-label')).toBe('Search for a place or paste coordinates');
    expect(input.getAttribute('aria-controls')).toBe(list.id);
    expect(input.hasAttribute('name')).toBe(false);
    expect(list.getAttribute('role')).toBe('listbox');
    expect(list.getAttribute('part')).toBe('search-listbox');
    expect(list.hidden).toBe(true);
  });

  it('debounces typing into one request with the map centre (normalised), limit and lang', async () => {
    const { input, list, calls } = setup();
    type(input, 'Tri');
    await vi.advanceTimersByTimeAsync(200);
    type(input, 'Tripo');
    await vi.advanceTimersByTimeAsync(299);
    expect(calls).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(1);
    expect(calls.map(([q]) => q)).toEqual(['Tripo']);
    const sent = calls[0]![1];
    expect(sent).toMatchObject({ limit: 5, lang: 'fr' });
    expect(sent.near.lat).toBeCloseTo(48.8584, 9);
    expect(sent.near.lng).toBeCloseTo(2.2945, 9);
    expect(options(list).map((o) => o.textContent)).toEqual([
      'Tripoli Tripoli, 1300, Lebanon',
      'Tripoli Tripoli, Libya',
      'Beirut',
    ]);
    expect(options(list).map((o) => o.getAttribute('part'))).toEqual(
      Array(3).fill('search-option'),
    );
    expect(list.hidden).toBe(false);
    expect(input.getAttribute('aria-expanded')).toBe('true');
  });

  it('sends nothing below the minimum length and closes the list', async () => {
    const { input, list, calls } = setup();
    type(input, 'Tripoli');
    await vi.advanceTimersByTimeAsync(300);
    expect(list.hidden).toBe(false);
    type(input, 'Tr');
    await vi.advanceTimersByTimeAsync(1000);
    expect(calls).toHaveLength(1);
    expect(list.hidden).toBe(true);
    expect(input.getAttribute('aria-expanded')).toBe('false');
  });

  it('aborts a stale request and ignores its answer', async () => {
    let resolveFirst: (r: GeocodeResult[]) => void = () => {};
    const { input, list, calls } = setup((query) =>
      query == 'Tripoli'
        ? new Promise((resolve) => (resolveFirst = resolve))
        : Promise.resolve(RESULTS.slice(2)),
    );
    type(input, 'Tripoli');
    await vi.advanceTimersByTimeAsync(300);
    type(input, 'Beirut');
    expect(calls[0]![1].signal.aborted).toBe(true);
    await vi.advanceTimersByTimeAsync(300);
    resolveFirst(RESULTS);
    await vi.advanceTimersByTimeAsync(0);
    expect(options(list).map((o) => o.textContent)).toEqual(['Beirut']);
  });

  it('ArrowDown/ArrowUp move aria-activedescendant and aria-selected; Enter picks; Escape closes', async () => {
    const { input, list, selected } = setup();
    type(input, 'Tripoli');
    await vi.advanceTimersByTimeAsync(300);
    const ids = options(list).map((o) => o.id);
    expect(new Set(ids).size).toBe(3);

    expect(key(input, 'ArrowDown').defaultPrevented).toBe(true);
    expect(input.getAttribute('aria-activedescendant')).toBe(ids[0]);
    expect(options(list).map((o) => o.getAttribute('aria-selected'))).toEqual([
      'true',
      'false',
      'false',
    ]);
    key(input, 'ArrowDown');
    key(input, 'ArrowDown');
    key(input, 'ArrowDown');
    expect(input.getAttribute('aria-activedescendant')).toBe(ids[0]);
    key(input, 'ArrowUp');
    expect(input.getAttribute('aria-activedescendant')).toBe(ids[2]);

    expect(key(input, 'Escape').defaultPrevented).toBe(true);
    expect(list.hidden).toBe(true);
    expect(input.hasAttribute('aria-activedescendant')).toBe(false);

    key(input, 'ArrowUp');
    expect(list.hidden).toBe(false);
    expect(input.getAttribute('aria-activedescendant')).toBe(ids[2]);
    expect(key(input, 'Enter').defaultPrevented).toBe(true);
    expect(selected).toEqual([RESULTS[2]]);
    expect(input.value).toBe('Beirut');
    expect(list.hidden).toBe(true);
  });

  it('Enter without an active option picks the first result, and never submits', async () => {
    const { input, selected } = setup();
    const submit = vi.fn<(event: Event) => void>((event) => event.preventDefault());
    document.querySelector('form')!.addEventListener('submit', submit);
    expect(key(input, 'Enter').defaultPrevented).toBe(true);
    expect(selected).toEqual([]);
    type(input, 'Tripoli');
    await vi.advanceTimersByTimeAsync(300);
    key(input, 'Enter');
    expect(selected).toEqual([RESULTS[0]]);
    expect(submit).not.toHaveBeenCalled();
  });

  it('a click picks an option; mousedown keeps the focus in the input', async () => {
    const { input, list, selected } = setup();
    type(input, 'Tripoli');
    await vi.advanceTimersByTimeAsync(300);
    const down = new MouseEvent('mousedown', { bubbles: true, cancelable: true });
    options(list)[1]!.dispatchEvent(down);
    expect(down.defaultPrevented).toBe(true);
    options(list)[1]!.click();
    expect(selected).toEqual([RESULTS[1]]);
  });

  it('coordinates show one offline "Go to …" option with zero requests; Enter commits it', async () => {
    const { input, list, calls, selected } = setup();
    type(input, '48.8584, 2.2945');
    expect(options(list).map((o) => o.textContent)).toEqual(['Go to 48.8584, 2.2945']);
    await vi.advanceTimersByTimeAsync(1000);
    expect(calls).toHaveLength(0);
    key(input, 'Enter');
    expect(selected).toEqual([{ lat: 48.8584, lng: 2.2945, label: 'Go to 48.8584, 2.2945' }]);

    type(input, 'https://www.google.com/maps/@48.8584,2.2945,17z');
    key(input, 'Enter');
    expect(selected[1]).toMatchObject({ lat: 48.8584, lng: 2.2945, zoom: 17 });
    expect(calls).toHaveLength(0);
  });

  it('shows "No results" as a disabled option', async () => {
    const { input, list, selected } = setup(async () => []);
    type(input, 'nowhere at all');
    await vi.advanceTimersByTimeAsync(300);
    expect(options(list).map((o) => [o.textContent, o.getAttribute('aria-disabled')])).toEqual([
      ['No results', 'true'],
    ]);
    key(input, 'Enter');
    expect(selected).toEqual([]);
  });

  it('a failure shows "No results" and reports GEOCODER_FAILED once per burst', async () => {
    let fail = true;
    const { input, list, errors } = setup(async () => {
      if (fail) throw new Error('Photon answered 500');
      return RESULTS;
    });
    for (const query of ['error', 'errors', 'errorss']) {
      type(input, query);
      // oxlint-disable-next-line no-await-in-loop -- one debounced request after the other
      await vi.advanceTimersByTimeAsync(300);
    }
    expect(options(list).map((o) => o.textContent)).toEqual(['No results']);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatchObject({ code: 'GEOCODER_FAILED', level: 'warn' });
    expect((errors[0] as Error).cause).toBeInstanceOf(Error);
    fail = false;
    type(input, 'Tripoli');
    await vi.advanceTimersByTimeAsync(300);
    fail = true;
    type(input, 'error');
    await vi.advanceTimersByTimeAsync(300);
    expect(errors).toHaveLength(2);
  });

  it('keeps its own input and change events', () => {
    const { input, slot } = setup();
    const outside = vi.fn<() => void>();
    slot.parentElement!.addEventListener('input', outside);
    slot.parentElement!.addEventListener('change', outside);
    type(input, 'Tri');
    input.dispatchEvent(new Event('change', { bubbles: true }));
    expect(outside).not.toHaveBeenCalled();
  });

  it('clear() empties and closes; destroy() aborts and removes its nodes', async () => {
    const { input, list, calls, slot, clear, destroy } = setup(() => new Promise(() => {}));
    type(input, 'Tripoli');
    await vi.advanceTimersByTimeAsync(300);
    clear();
    expect(input.value).toBe('');
    expect(list.hidden).toBe(true);
    expect(calls[0]![1].signal.aborted).toBe(true);
    type(input, 'Beirut');
    destroy();
    await vi.advanceTimersByTimeAsync(1000);
    expect(calls).toHaveLength(1);
    expect(slot.children).toHaveLength(0);
  });

  it('gives each instance its own ids', () => {
    const first = setup().list.id;
    const second = setup().list.id;
    expect(first).not.toBe(second);
  });
});
