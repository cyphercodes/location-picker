// A10 / A13.3 field mode, browser project (native <dialog>, ToggleEvent, ElementInternals): the compact control, the
// sheet's draft session (Confirm commits, Cancel restores silently), lazy engine, bound inputs, forms and `auto`.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { userEvent } from 'vitest/browser';
import type { Geocoder } from '../../src/core.js';
import type { LocationPickerElement } from '../../src/element/location-picker-element.js';
import { flush, must, part, render, resetStore, sleep, spyConsole, summary } from './helpers.js';

const geocoder: Geocoder = {
  reverse: async (at) => ({ ...at, label: 'x', address: `Street ${at.lat}` }),
};

beforeEach(() => resetStore());
afterEach(async () => {
  vi.restoreAllMocks();
  await userEvent.cleanup();
  document.body.innerHTML = '';
});

const sheet = (el: LocationPickerElement): HTMLDialogElement =>
  must(el.shadowRoot?.querySelector('dialog'), 'the sheet');
const toggles = (el: LocationPickerElement): string[] => {
  const log: string[] = [];
  el.addEventListener('toggle', (event) => {
    log.push(`${event.oldState}>${event.newState}`);
    expect(event.bubbles).toBe(false);
  });
  return log;
};
const isOpen = (el: LocationPickerElement): boolean =>
  !!el.matches(':state(open)') && sheet(el).open && sheet(el).matches(':modal');
/** Opens the sheet and waits for the lazy chunk, the mount and the ready microtask. */
async function open(el: LocationPickerElement): Promise<void> {
  el.showPicker();
  await expect.poll(() => el.shadowRoot?.querySelector('dialog')?.open).toBe(true);
  await flush();
}

describe('A10 field mode: the compact control', () => {
  beforeEach(() => spyConsole());

  it('renders field, field-value and field-button at once, compact, with no engine until opened', async () => {
    const { el, fake } = render(
      '<label for="loc">Delivery spot</label><location-picker id="loc" presentation="field" name="loc"></location-picker>',
    );
    expect(el.presentation).toBe('field');
    expect(part(el, 'field-value').textContent).toBe('No location selected');
    expect(part(el, 'field-button').textContent).toBe('Choose on map');
    expect(part(el, 'field-button').getAttribute('aria-haspopup')).toBe('dialog');
    expect(el.getBoundingClientRect().height).toBeLessThan(80);
    expect(el.matches(':state(unset)')).toBe(true);
    await sleep(50);
    expect(fake.mountCount).toBe(0);
    expect(el.shadowRoot?.querySelector('dialog')).toBeNull();
    // <label for> and el.focus() land on the field's button.
    document.querySelector('label')!.click();
    expect(el.shadowRoot?.activeElement).toBe(part(el, 'field-button'));
  });

  it('shows the coordinates, then the address once known; messages override every text', async () => {
    const { el } = render(
      '<location-picker presentation="field" value="48.8584,2.2945"></location-picker>',
    );
    await flush();
    expect(part(el, 'field-value').textContent).toBe('48.8584, 2.2945');
    el.messages = {
      chooseOnMap: 'Carte',
      fieldPlaceholder: 'Rien',
      cancel: 'Annuler',
      confirm: 'OK',
    };
    expect(part(el, 'field-button').textContent).toBe('Carte');
    el.value = '';
    expect(part(el, 'field-value').textContent).toBe('Rien');
    await open(el);
    expect(part(el, 'cancel-button').textContent).toBe('Annuler');
    expect(el.shadowRoot?.querySelector('.lp-sheet-confirm')?.textContent).toBe('OK');
  });

  it('showPicker() in inline mode does nothing and warns once', async () => {
    const { el } = render('<location-picker></location-picker>');
    const warn = vi.spyOn(console, 'warn');
    el.showPicker();
    el.showPicker();
    await flush();
    expect(el.shadowRoot?.querySelector('dialog')).toBeNull();
    expect(warn.mock.calls.filter(([m]) => String(m).includes('showPicker()'))).toHaveLength(1);
  });
});

describe('A10 field mode: the sheet', () => {
  beforeEach(() => spyConsole());

  it('opens modal (toggle, :state(open), focus on the map) and mounts the engine on first open', async () => {
    const { el, fake, log } = render('<location-picker presentation="field"></location-picker>');
    const toggled = toggles(el);
    let ready = false;
    void el.ready.then(() => (ready = true));
    await open(el);
    expect(isOpen(el)).toBe(true);
    expect(toggled).toEqual(['closed>open']);
    expect(fake.mountCount).toBe(1);
    expect(summary(log)).toEqual(['ready']);
    expect(ready).toBe(true);
    expect(el.shadowRoot?.activeElement).toBe(part(el, 'map'));
    // Full screen: the dialog fills the viewport, the map fills the space under the header.
    const box = sheet(el).getBoundingClientRect();
    expect([box.width, box.height]).toEqual([innerWidth, innerHeight]);
    expect(part(el, 'map').getBoundingClientRect().height).toBeGreaterThan(innerHeight / 2);
    // One Confirm: the inline confirm button never shows in the sheet.
    expect(el.shadowRoot?.querySelectorAll('[part~="confirm-button"]')).toHaveLength(2);
    expect(getComputedStyle(el.shadowRoot!.querySelector('.lp-confirm')!).display).toBe('none');
  });

  it('a pan is a draft: no events, value and form unchanged; Confirm commits it with its source', async () => {
    const { el, fake, log } = render(
      '<form><location-picker presentation="field" name="loc" value="48.8584,2.2945"></location-picker></form>',
    );
    const toggled = toggles(el);
    await open(el);
    log.length = 0;
    await fake.userPan({ lat: 48.86, lng: 2.3 });
    await flush();
    expect(summary(log)).toEqual([]);
    expect(el.value).toBe('48.8584,2.2945');
    expect(new FormData(document.querySelector('form')!).get('loc')).toBe('48.8584,2.2945');
    el.shadowRoot!.querySelector<HTMLButtonElement>('.lp-sheet-confirm')!.click();
    expect(isOpen(el)).toBe(false);
    expect(toggled).toEqual(['closed>open', 'open>closed']);
    expect(summary(log)).toEqual(['input:48.86,2.3:user', 'change:48.86,2.3:user']);
    expect(el.value).toBe('48.86,2.3');
    expect(new FormData(document.querySelector('form')!).get('loc')).toBe('48.86,2.3');
    expect(part(el, 'field-value').textContent).toBe('48.86, 2.3');
    expect(el.shadowRoot?.activeElement).toBe(part(el, 'field-button'));
  });

  it('Cancel, close() and Escape restore the value with no input/change; the map returns to it', async () => {
    const { el, fake, log } = render(
      '<location-picker presentation="field" value="10,20"></location-picker>',
    );
    const toggled = toggles(el);
    for (const how of ['cancel', 'close', 'escape'] as const) {
      await open(el);
      log.length = 0;
      await fake.userPan({ lat: 11, lng: 21 });
      if (how == 'cancel') part(el, 'cancel-button').click();
      else if (how == 'close') el.close();
      else await userEvent.keyboard('{Escape}');
      await expect.poll(() => isOpen(el)).toBe(false);
      await flush();
      expect(summary(log)).toEqual([]);
      expect(el.value).toBe('10,20');
      expect(fake.handle?.map.center).toEqual({ lat: 10, lng: 20 });
    }
    expect(toggled).toEqual([
      'closed>open', 'open>closed', 'closed>open', 'open>closed', 'closed>open', 'open>closed',
    ]); // prettier-ignore
    expect(fake.mountCount).toBe(1);
  });

  it('a gesture that ends after the sheet closed is reverted, never committed', async () => {
    const { el, fake, log } = render(
      '<location-picker presentation="field" value="10,20"></location-picker>',
    );
    await open(el);
    el.close();
    log.length = 0;
    await fake.userPan({ lat: 12, lng: 22 });
    await flush();
    expect(summary(log)).toEqual([]);
    expect(el.value).toBe('10,20');
    expect(fake.handle?.map.center).toEqual({ lat: 10, lng: 20 });
  });

  it('Confirm while unset: disabled without a center; with one it chooses the centre (source user)', async () => {
    const { el, log } = render('<location-picker presentation="field"></location-picker>');
    await open(el);
    const confirm = el.shadowRoot!.querySelector<HTMLButtonElement>('.lp-sheet-confirm')!;
    expect(confirm.disabled).toBe(true);
    el.center = '30,40';
    expect(confirm.disabled).toBe(false);
    log.length = 0;
    confirm.click();
    expect(summary(log)).toEqual(['input:30,40:user', 'change:30,40:user']);
  });

  it('Confirm without a change fires nothing; property writes while open change the value at once', async () => {
    const { el, log } = render(
      '<location-picker presentation="field" value="1,2"></location-picker>',
    );
    await open(el);
    log.length = 0;
    el.value = '3,4';
    expect(el.value).toBe('3,4');
    el.shadowRoot!.querySelector<HTMLButtonElement>('.lp-sheet-confirm')!.click();
    expect(summary(log)).toEqual([]);
    expect(el.value).toBe('3,4');
  });

  it('the address of a confirmed draft follows the change (addresschange), and the field shows it', async () => {
    const { el, fake, log } = render(
      '<location-picker presentation="field" reverse-geocode address-name="addr" name="loc"></location-picker>',
    );
    el.geocoder = geocoder;
    await open(el);
    await fake.userPan({ lat: 5, lng: 6 });
    el.shadowRoot!.querySelector<HTMLButtonElement>('.lp-sheet-confirm')!.click();
    await expect.poll(() => el.address).toBe('Street 5');
    expect(summary(log).filter((t) => t != 'ready')).toEqual([
      'input:5,6:user',
      'change:5,6:user',
      'addresschange',
    ]);
    expect(part(el, 'field-value').textContent).toBe('Street 5');
  });
});

describe('A10 field mode: methods, forms and bound inputs', () => {
  beforeEach(() => spyConsole());

  it('setLocation() commits while closed (source api) and mounts the engine in the closed sheet', async () => {
    const { el, fake, log } = render('<location-picker presentation="field"></location-picker>');
    el.setLocation(1, 2);
    await expect.poll(() => el.value).toBe('1,2');
    expect(summary(log).filter((t) => t != 'ready')).toEqual(['input:1,2:api', 'change:1,2:api']);
    expect(fake.mountCount).toBe(1);
    expect(sheet(el).open).toBe(false);
    // Opening later shows the map on the value.
    await open(el);
    expect(fake.handle?.map.center).toEqual({ lat: 1, lng: 2 });
  });

  it('bound inputs seed the value at connect, get no events for drafts, and input + change on Confirm', async () => {
    const { el, fake } = render(
      `<form><location-picker presentation="field" lat-input="lat" lng-input="lng">
         <input id="lat" name="lat" value="48.5"><input id="lng" name="lng" value="2.5">
       </location-picker></form>`,
    );
    await flush();
    expect(el.value).toBe('48.5,2.5');
    expect(part(el, 'field-value').textContent).toBe('48.5, 2.5');
    const lat = document.querySelector<HTMLInputElement>('#lat')!;
    const seen: string[] = [];
    for (const type of ['input', 'change'])
      lat.addEventListener(type, (event) => seen.push(`${type}:${String(event.bubbles)}`));
    await open(el);
    await fake.userPan({ lat: 48.6, lng: 2.6 });
    expect(lat.value).toBe('48.5');
    expect(seen).toEqual([]);
    el.shadowRoot!.querySelector<HTMLButtonElement>('.lp-sheet-confirm')!.click();
    expect(lat.value).toBe('48.6');
    // Nested in the element: non-bubbling (D18).
    expect(seen).toEqual(['input:false', 'change:false']);
    // Reset: back to the server values, silently.
    document.querySelector('form')!.reset();
    expect(el.value).toBe('48.5,2.5');
    expect(lat.value).toBe('48.5');
    expect(seen).toHaveLength(2);
  });

  it('required: a blocked submit reports on the field button, not the hidden map', async () => {
    const { el } = render(
      '<form><location-picker presentation="field" name="loc" required></location-picker><button>Save</button></form>',
    );
    await flush();
    expect(el.checkValidity()).toBe(false);
    expect(el.reportValidity()).toBe(false);
    expect(el.shadowRoot?.activeElement).toBe(part(el, 'field-button'));
    let submitted = false;
    document.querySelector('form')!.addEventListener('submit', (event) => {
      submitted = true;
      event.preventDefault();
    });
    document.querySelector('form')!.requestSubmit();
    expect(submitted).toBe(false);
    el.value = '1,2';
    document.querySelector('form')!.requestSubmit();
    expect(submitted).toBe(true);
  });

  it('disabled: the button is disabled and showPicker() does nothing', async () => {
    const { el } = render('<location-picker presentation="field" disabled></location-picker>');
    expect(part(el, 'field-button')).toHaveProperty('disabled', true);
    el.showPicker();
    await sleep(20);
    expect(el.shadowRoot?.querySelector('dialog')?.open ?? false).toBe(false);
  });
});

describe('A10 presentation switching', () => {
  beforeEach(() => spyConsole());

  it('inline <-> field keeps the value and the form entry', async () => {
    const { el } = render(
      '<form><location-picker name="loc" value="1,2"></location-picker></form>',
    );
    await flush();
    expect(part(el, 'map')).toBeTruthy();
    el.presentation = 'field';
    expect(el.getAttribute('presentation')).toBe('field');
    expect(el.shadowRoot?.querySelector('[part~="map"]')).toBeNull();
    expect(part(el, 'field-value').textContent).toBe('1, 2');
    el.presentation = 'inline';
    await flush();
    expect(el.shadowRoot?.querySelector('[part~="field"]')).toBeNull();
    expect(el.value).toBe('1,2');
    expect(new FormData(document.querySelector('form')!).get('loc')).toBe('1,2');
  });

  it('auto follows the phone query; a change while the sheet is open waits for it to close', async () => {
    const listeners: (() => void)[] = [];
    const query = {
      matches: true,
      addEventListener: (_: string, fn: () => void) => listeners.push(fn),
    };
    vi.spyOn(window, 'matchMedia').mockReturnValue(query as unknown as MediaQueryList);
    const { el } = render('<location-picker presentation="auto" value="1,2"></location-picker>');
    expect(part(el, 'field')).toBeTruthy();
    await open(el);
    query.matches = false;
    for (const fn of listeners) fn();
    expect(isOpen(el)).toBe(true);
    el.close();
    await flush();
    expect(el.shadowRoot?.querySelector('[part~="field"]')).toBeNull();
    expect(part(el, 'map')).toBeTruthy();
    expect(el.value).toBe('1,2');
  });
});
