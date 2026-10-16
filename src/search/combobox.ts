// The built-in search box (CONTRACT §5.2, §12.5): a WAI-ARIA combobox over `geocoder.search`, lazy-loaded by the core
// when `search` is on and the adapter renders no search UI of its own (Leaflet, MapLibre). Typed or pasted
// coordinates become one offline "Go to …" option with no request. Its native events never leave the box.
import type { GeocodeResult, Geocoder, SearchContext, SearchHandle } from '../core.js';
import { createError } from '../core/errors.js';
import type * as C from '../internal/contracts.js';
import type { ComboboxOptions } from '../internal/contracts.js';
import { formatLatLng } from '../utils/format.js';
import { normalizeLatLng } from '../utils/normalize.js';
import { parseLatLng } from '../utils/parse.js';

let uid = 0;

/** Renders the WAI-ARIA combobox into ctx.slot; coordinate text -> offline "Go to …" option; ctx.select() on pick. Contains its own input/change events. */
export function createCombobox(
  ctx: SearchContext,
  geocoder: Geocoder,
  options: ComboboxOptions,
): SearchHandle {
  const doc = ctx.slot.ownerDocument;
  const id = `lp-search-${++uid}`;
  // Both hooks on every node: `part` styles the element's shadow tree, `lp-*` classes the class mode's light DOM.
  const node = <K extends 'input' | 'ul' | 'li'>(
    tag: K,
    name: string,
    attributes: Record<string, string>,
  ): HTMLElementTagNameMap[K] => {
    const element = doc.createElement(tag);
    element.className = `lp-${name}`;
    element.setAttribute('part', name);
    for (const [key, value] of Object.entries(attributes)) element.setAttribute(key, value);
    return element;
  };
  const input = node('input', 'search-input', {
    type: 'search',
    role: 'combobox',
    'aria-autocomplete': 'list',
    'aria-expanded': 'false',
    'aria-controls': id,
    'aria-label': ctx.label,
    autocomplete: 'off',
    placeholder: ctx.placeholder,
  });
  const list = node('ul', 'search-listbox', { id, role: 'listbox', 'aria-label': ctx.label });
  list.hidden = true;
  ctx.slot.append(input, list);

  let results: GeocodeResult[] = [];
  let active = -1;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let request: AbortController | undefined;
  let failing = false;

  const activate = (index: number): void => {
    active = index;
    for (const [i, option] of [...list.children].entries())
      option.setAttribute('aria-selected', String(i == index));
    if (index < 0) input.removeAttribute('aria-activedescendant');
    else input.setAttribute('aria-activedescendant', `${id}-${index}`);
  };
  const open = (on: boolean): void => {
    list.hidden = !on;
    input.setAttribute('aria-expanded', String(on));
    if (!on) activate(-1);
  };
  const pick = (index: number): void => {
    const result = results[index];
    if (!result) return;
    input.value = result.label;
    open(false);
    ctx.select(result);
  };
  const show = (found: GeocodeResult[]): void => {
    results = found;
    active = -1;
    list.replaceChildren(
      ...found.map((result, i) => {
        const option = node('li', 'search-option', {
          id: `${id}-${i}`,
          role: 'option',
          'aria-selected': 'false',
        });
        option.textContent = result.label;
        if (result.address && result.address != result.label) {
          const detail = doc.createElement('small');
          detail.textContent = result.address;
          option.append(' ', detail);
        }
        option.addEventListener('click', () => pick(i));
        return option;
      }),
    );
    if (!found.length) {
      const empty = node('li', 'search-option', { role: 'option', 'aria-disabled': 'true' });
      empty.textContent = options.messages.noResults;
      list.append(empty);
    }
    open(true);
  };
  const cancel = (): void => {
    clearTimeout(timer);
    request?.abort();
    request = undefined;
  };
  const search = geocoder.search?.bind(geocoder);

  const query = (): void => {
    cancel();
    const text = input.value.trim();
    const at = parseLatLng(text);
    if (at) {
      // Offline: coordinates never reach the geocoder. The parsed URL zoom rides along for the core.
      const label = options.messages.goTo(formatLatLng(at, { separator: ', ' }));
      show([{ lat: at.lat, lng: at.lng, label, ...(at.zoom !== undefined && { zoom: at.zoom }) }]);
      return;
    }
    if (text.length < options.minChars || !search) return open(false);
    timer = setTimeout(() => {
      const controller = (request = new AbortController());
      const { signal } = controller;
      search(text, {
        signal,
        near: normalizeLatLng(ctx.handle.getCenter()),
        limit: options.limit,
        lang: ctx.lang,
      }).then(
        (found) => {
          if (signal.aborted) return;
          failing = false;
          show(found);
        },
        (cause: unknown) => {
          if (signal.aborted) return;
          show([]);
          // One report per failure burst.
          if (!failing) options.onError(createError('GEOCODER_FAILED', { cause }));
          failing = true;
        },
      );
    }, options.debounce);
  };

  input.addEventListener('input', (event) => {
    event.stopPropagation();
    query();
  });
  input.addEventListener('change', (event) => event.stopPropagation());
  input.addEventListener('blur', () => open(false));
  input.addEventListener('keydown', (event) => {
    const count = results.length;
    const key = event.key;
    if (key == 'ArrowDown' || key == 'ArrowUp') {
      event.preventDefault();
      if (!count) return;
      const next = key == 'ArrowDown' ? active + 1 : (active < 0 ? count : active) - 1;
      open(true);
      activate((next + count) % count);
    } else if (key == 'Enter') {
      // Never submits the surrounding form.
      event.preventDefault();
      if (!list.hidden) pick(Math.max(active, 0));
    } else if (key == 'Escape' && !list.hidden) {
      event.preventDefault();
      open(false);
    }
  });
  // Keeps the focus in the input while an option is clicked.
  list.addEventListener('mousedown', (event) => event.preventDefault());

  return {
    element: input,
    focus: () => input.focus(),
    clear() {
      cancel();
      input.value = '';
      open(false);
    },
    destroy() {
      cancel();
      input.remove();
      list.remove();
    },
  };
}

createCombobox satisfies typeof C.createCombobox;
