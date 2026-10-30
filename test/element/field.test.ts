// A10 field mode in jsdom (no showModal, ToggleEvent, ResizeObserver or matchMedia): the control renders, nothing
// throws, `auto` stays inline without matchMedia, and the engine never mounts before the sheet opens.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flush, part, render, resetStore, sleep, spyConsole } from './helpers.js';

beforeEach(() => {
  resetStore();
  spyConsole();
});
afterEach(() => {
  vi.restoreAllMocks();
  document.body.innerHTML = '';
});

describe('A10 field mode (unit)', () => {
  it('renders the field parts, reflects presentation and keeps the form value', async () => {
    const { el, fake } = render(
      '<form><location-picker presentation="field" name="loc" value="1,2"></location-picker></form>',
    );
    await flush();
    expect(el.presentation).toBe('field');
    expect(part(el, 'field-value').textContent).toBe('1, 2');
    expect(part(el, 'field-button').textContent).toBe('Choose on map');
    expect(el.value).toBe('1,2');
    expect(fake.mountCount).toBe(0);
    el.presentation = null;
    expect(el.hasAttribute('presentation')).toBe(false);
    expect(el.presentation).toBe('inline');
    await flush();
    expect(part(el, 'map')).toBeTruthy();
    expect(fake.mountCount).toBe(1);
    expect(el.value).toBe('1,2');
  });

  it('showPicker() and close() never throw where <dialog> cannot open; no engine mounts', async () => {
    const { el, fake } = render('<location-picker presentation="field"></location-picker>');
    expect(() => el.showPicker()).not.toThrow();
    expect(() => el.close()).not.toThrow();
    await sleep(20);
    expect(el.matches(':state(open)')).toBe(false);
    expect(fake.mountCount).toBe(0);
  });

  it('presentation="auto" is inline without matchMedia; unknown values are inline', async () => {
    vi.stubGlobal('matchMedia', undefined);
    const { el } = render('<location-picker presentation="auto"></location-picker>');
    await flush();
    expect(el.shadowRoot?.querySelector('[part~="field"]')).toBeNull();
    expect(part(el, 'map')).toBeTruthy();
    el.setAttribute('presentation', 'sheet');
    expect(el.presentation).toBe('inline');
    vi.unstubAllGlobals();
  });
});
