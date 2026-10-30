// A10 field mode on real pages (the built script, the real Leaflet provider and the §12.6 route table): the compact
// control, the full-screen <dialog> sheet, Confirm and Cancel, close requests (Escape; the Android back gesture is the
// same close request and cannot be driven here), keyboard only, rotation while open, a field in a form in a dialog,
// `auto` at the breakpoint, and axe in the open state. Tags are compat scenario ids (WP5-10).
import type { Page } from '@playwright/test';
import axe from 'axe-core';
import type { LocationPickerElement } from '../src/element/location-picker-element.js';
import { expect, test } from './harness/fixtures.js';

const BLANK = '/e2e/harness/blank.html';
const IIFE = '/dist/location-picker.global.js';
const PHONE = '(pointer: coarse) and (max-width: 640px)';

interface Seen {
  readonly type: string;
  readonly value?: string;
  readonly source?: string;
  readonly state?: string;
}

/** Records the picker's events (and toggle states) on `window.__lpSeen`, from a capturing listener. */
function recordEvents(): void {
  const seen: Seen[] = [];
  Reflect.set(window, '__lpSeen', seen);
  for (const type of ['input', 'change', 'addresschange', 'ready', 'toggle'])
    window.addEventListener(
      type,
      (event) => {
        if (!(event.target instanceof Element) || event.target.localName != 'location-picker')
          return;
        const detail: unknown = Reflect.get(event, 'detail');
        const field = (key: string): string | undefined => {
          const value: unknown = detail && typeof detail == 'object' && Reflect.get(detail, key);
          return typeof value == 'string' ? value : undefined;
        };
        const state: unknown = Reflect.get(event, 'newState');
        seen.push({
          type,
          value: field('value'),
          source: field('source'),
          ...(typeof state == 'string' && { state }),
        });
      },
      true,
    );
}

const seen = (page: Page): Promise<Seen[]> =>
  page.evaluate(() => [...(Reflect.get(window, '__lpSeen') as Seen[])]);
const commits = async (page: Page): Promise<string[]> =>
  (await seen(page))
    .filter((entry) => entry.type == 'input' || entry.type == 'change')
    .map((entry) => `${entry.type}:${entry.value}:${entry.source}`);
const toggles = async (page: Page): Promise<string[]> =>
  (await seen(page)).filter((entry) => entry.type == 'toggle').map((entry) => entry.state ?? '');

/** A blank local page whose body is `body`, then the script build. */
async function openPage(page: Page, body: string): Promise<string[]> {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() == 'error') errors.push(`console.error: ${message.text()}`);
  });
  await page.goto(BLANK);
  await page.setContent(
    `<!doctype html><html lang="en"><head><meta charset="utf-8">` +
      `<meta name="viewport" content="width=device-width, initial-scale=1">` +
      `<style>body{margin:0;font:16px sans-serif}</style></head><body>${body}</body></html>`,
  );
  await page.evaluate(recordEvents);
  await page.addScriptTag({ url: IIFE });
  return errors;
}

const value = (page: Page, selector = 'location-picker'): Promise<string> =>
  page.locator(selector).evaluate((el: LocationPickerElement) => el.value);
/** `:state(open)`: set by showPicker(), cleared once a close finished (the dialog's own `close` event comes later). */
const sheetOpen = (page: Page, selector = 'location-picker'): Promise<boolean> =>
  page.locator(selector).evaluate((el: LocationPickerElement) => el.matches(':state(open)'));
/** The sheet's map region box and Leaflet's own size, once the map is ready. */
const mapSize = (page: Page, selector = 'location-picker') =>
  page.locator(selector).evaluate(async (el: LocationPickerElement) => {
    await el.ready;
    const region = el.shadowRoot?.querySelector('[part="map"]');
    const map = Reflect.get(Object(el), 'map') as { getSize(): { x: number; y: number } };
    const box = region?.getBoundingClientRect();
    return {
      region: [Math.round(box?.width ?? 0), Math.round(box?.height ?? 0)],
      leaflet: [map.getSize().x, map.getSize().y],
    };
  });

/** Opens the sheet through the field's button and waits for the map. */
async function openSheet(page: Page, selector = 'location-picker'): Promise<void> {
  await page.locator(`${selector} [part="field-button"]`).click();
  await expect.poll(() => sheetOpen(page, selector)).toBe(true);
  await expect(page.locator(`${selector} [part="sheet"]`)).toHaveJSProperty('open', true);
  expect(
    await page
      .locator(`${selector} [part="sheet"]`)
      .evaluate((dialog: HTMLDialogElement) => dialog.matches(':modal')),
  ).toBe(true);
  await page.locator(selector).evaluate(async (el: LocationPickerElement) => {
    await el.ready;
    // The sheet's entry animation (none under reduced motion) fades it in: measure and check it settled.
    await Promise.all(el.shadowRoot?.getAnimations().map((animation) => animation.finished) ?? []);
  });
}

/** A draft move by keyboard on the sheet's map region (focused when the sheet opens). */
async function pan(page: Page, key = 'ArrowRight'): Promise<void> {
  const map = page.locator('location-picker [part="map"]');
  await expect(map).toBeFocused();
  await map.press(key);
  // Leaflet's keyboard pan settles in an animation frame or two.
  await page.waitForTimeout(400);
}

test.describe('field mode', () => {
  test(
    'open, Confirm commits the draft with its source; Cancel restores it with no events; no engine before open',
    { tag: ['@field-open-confirm-cancel', '@field-phone'] },
    async ({ page }) => {
      const leaflet: string[] = [];
      page.on('request', (request) => {
        if (/leaflet/.test(request.url())) leaflet.push(request.url());
      });
      const errors = await openPage(
        page,
        `<form><label for="where">Delivery spot</label>
         <location-picker id="where" presentation="field" name="loc" center="48.8584,2.2945" zoom="15"></location-picker>
         </form>`,
      );
      const host = page.locator('#where');
      await expect(host.locator('[part="field-value"]')).toHaveText('No location selected');
      expect((await host.boundingBox())?.height).toBeLessThan(80);
      await page.waitForTimeout(300);
      expect(leaflet).toEqual([]);

      await openSheet(page);
      expect(leaflet.length).toBeGreaterThan(0);
      const viewport = page.viewportSize();
      const box = await host.locator('[part="sheet"]').boundingBox();
      expect([Math.round(box?.width ?? 0), Math.round(box?.height ?? 0)]).toEqual([
        viewport?.width,
        viewport?.height,
      ]);
      const size = await mapSize(page);
      expect(size.leaflet).toEqual(size.region);
      await pan(page);
      expect(await commits(page)).toEqual([]);
      expect(await value(page)).toBe('');

      await host.locator('.lp-sheet-confirm').click();
      await expect.poll(() => sheetOpen(page)).toBe(false);
      const [input, change] = await commits(page);
      expect(input).toMatch(/^input:48\.\d+,2\.\d+:user$/);
      expect(change).toBe(input?.replace('input', 'change'));
      const confirmed = await value(page);
      expect(change).toContain(confirmed);
      await expect(host.locator('[part="field-value"]')).toHaveText(confirmed.replace(',', ', '));
      expect(await page.evaluate(() => new FormData(document.forms[0]!).get('loc'))).toBe(
        confirmed,
      );

      await openSheet(page);
      await pan(page, 'ArrowUp');
      await host.locator('[part="cancel-button"]').click();
      await expect.poll(() => sheetOpen(page)).toBe(false);
      expect(await commits(page)).toHaveLength(2);
      expect(await value(page)).toBe(confirmed);
      expect(await toggles(page)).toEqual(['open', 'closed', 'open', 'closed']);
      expect(errors).toEqual([]);
    },
  );

  test(
    'a close request (Escape, the same request as the Android back gesture) closes as Cancel',
    { tag: ['@field-back-button'] },
    async ({ page }) => {
      const errors = await openPage(
        page,
        '<location-picker presentation="field" value="48.8584,2.2945"></location-picker>',
      );
      await openSheet(page);
      await pan(page);
      await page.keyboard.press('Escape');
      await expect.poll(() => sheetOpen(page)).toBe(false);
      expect(await value(page)).toBe('48.8584,2.2945');

      // requestClose() is the close request a CloseWatcher (the back gesture) sends, where the engine has it.
      await openSheet(page);
      await pan(page);
      const requested = await page
        .locator('location-picker')
        .evaluate((el: LocationPickerElement) => {
          const dialog = el.shadowRoot?.querySelector('dialog');
          if (!dialog || typeof Reflect.get(dialog, 'requestClose') != 'function') return false;
          Reflect.apply(Reflect.get(dialog, 'requestClose') as () => void, dialog, []);
          return true;
        });
      if (!requested) await page.keyboard.press('Escape');
      await expect.poll(() => sheetOpen(page)).toBe(false);
      expect(await value(page)).toBe('48.8584,2.2945');
      expect(await commits(page)).toEqual([]);
      expect(errors).toEqual([]);
    },
  );

  test(
    'keyboard only: Tab, Enter opens, arrows move, Shift+Tab to Confirm, Enter commits, focus returns',
    { tag: ['@field-keyboard', '@keyboard-only'] },
    async ({ page }) => {
      const errors = await openPage(
        page,
        `<input id="before" aria-label="Name">
         <location-picker presentation="field" aria-label="Delivery spot" center="48.8584,2.2945" zoom="15"></location-picker>
         <button id="after">Next</button>`,
      );
      await page.locator('#before').focus();
      await page.keyboard.press('Tab');
      await expect(page.locator('location-picker [part="field-button"]')).toBeFocused();
      await page.keyboard.press('Enter');
      await expect.poll(() => sheetOpen(page)).toBe(true);
      await page.locator('location-picker').evaluate(async (el: LocationPickerElement) => {
        await el.ready;
      });
      await pan(page, 'ArrowDown');
      await page.keyboard.press('Shift+Tab');
      await expect(page.locator('location-picker .lp-sheet-confirm')).toBeFocused();
      await page.keyboard.press('Enter');
      await expect.poll(() => sheetOpen(page)).toBe(false);
      await expect(page.locator('location-picker [part="field-button"]')).toBeFocused();
      const [, change] = await commits(page);
      expect(change).toMatch(/^change:\d+\.\d+,2\.\d+:user$/);
      expect(errors).toEqual([]);
    },
  );

  test(
    'rotation while open keeps the sheet open and resizes the map; auto switches once it closes',
    { tag: ['@field-rotation'] },
    async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 667 });
      const errors = await openPage(
        page,
        '<location-picker presentation="field" value="48.8584,2.2945"></location-picker>',
      );
      const phone = await page.evaluate((query) => matchMedia(query).matches, PHONE);
      // `auto` behaves as field only where the phone query matches (the touch projects).
      if (phone)
        await page.locator('location-picker').evaluate((el: LocationPickerElement) => {
          el.presentation = 'auto';
        });
      await openSheet(page);
      await page.setViewportSize({ width: 667, height: 375 });
      await expect.poll(async () => (await mapSize(page)).region[0]).toBe(667);
      expect(await sheetOpen(page)).toBe(true);
      await expect
        .poll(async () => {
          const size = await mapSize(page);
          return size.leaflet.join() == size.region.join();
        })
        .toBe(true);
      // The pin stays on the value.
      const centre = await page.locator('location-picker').evaluate((el: LocationPickerElement) => {
        const map = Reflect.get(Object(el), 'map') as { getCenter(): { lat: number; lng: number } };
        return map.getCenter();
      });
      expect(centre.lat).toBeCloseTo(48.8584, 3);
      expect(centre.lng).toBeCloseTo(2.2945, 3);
      await page.keyboard.press('Escape');
      await expect.poll(() => sheetOpen(page)).toBe(false);
      const parts = await page
        .locator('location-picker')
        .evaluate((el: LocationPickerElement) =>
          [...(el.shadowRoot?.querySelectorAll('[part]') ?? [])].map((node) =>
            node.getAttribute('part'),
          ),
        );
      // Landscape is wider than the breakpoint: auto is inline now; field stays field.
      expect(parts.includes('field')).toBe(!phone);
      expect(parts.includes('map')).toBe(true);
      expect(await value(page)).toBe('48.8584,2.2945');
      expect(errors).toEqual([]);
    },
  );

  test(
    'a field inside a form inside a modal dialog: the sheet opens above it, Escape closes only the sheet',
    { tag: ['@field-in-dialog-form', '@dialog'] },
    async ({ page }) => {
      const errors = await openPage(
        page,
        `<dialog id="outer"><form id="f" method="dialog">
           <label for="where">Where?</label>
           <location-picker id="where" presentation="field" name="loc" center="48.8584,2.2945" zoom="15"></location-picker>
           <button id="ok" value="ok">OK</button>
         </form></dialog>`,
      );
      await page.evaluate(() => document.querySelector<HTMLDialogElement>('#outer')?.showModal());
      await openSheet(page, '#where');
      // Top layer: the sheet is what a tap in the middle of the screen hits, above the outer dialog.
      const hit = await page.evaluate(() => {
        const host = document.elementFromPoint(innerWidth / 2, innerHeight / 2);
        const inner = host?.shadowRoot?.elementFromPoint(innerWidth / 2, innerHeight / 2);
        return [host?.id, inner?.closest('dialog')?.getAttribute('part')];
      });
      expect(hit).toEqual(['where', 'sheet']);
      await pan(page);
      await page.locator('#where .lp-sheet-confirm').click();
      await expect.poll(() => sheetOpen(page, '#where')).toBe(false);
      expect(
        await page.evaluate(() => document.querySelector('dialog#outer')?.matches(':modal')),
      ).toBe(true);
      const confirmed = await value(page, '#where');
      expect(confirmed).not.toBe('');
      expect(await page.evaluate(() => new FormData(document.forms[0]!).get('loc'))).toBe(
        confirmed,
      );

      await openSheet(page, '#where');
      await page.keyboard.press('Escape');
      await expect.poll(() => sheetOpen(page, '#where')).toBe(false);
      expect(
        await page.evaluate(() => document.querySelector<HTMLDialogElement>('dialog#outer')?.open),
      ).toBe(true);
      expect(errors).toEqual([]);
    },
  );

  test(
    'auto switches between field and inline at the breakpoint and keeps the value',
    { tag: ['@field-auto-breakpoint'] },
    async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 667 });
      const errors = await openPage(
        page,
        '<form><location-picker presentation="auto" name="loc" value="48.8584,2.2945"></location-picker></form>',
      );
      const presented = (): Promise<string> =>
        page
          .locator('location-picker')
          .evaluate((el: LocationPickerElement) =>
            el.shadowRoot?.querySelector('[part="field"]')
              ? 'field'
              : el.shadowRoot?.querySelector('[part="map"]')
                ? 'inline'
                : '',
          );
      const phone = (): Promise<boolean> =>
        page.evaluate((query) => matchMedia(query).matches, PHONE);
      await expect.poll(presented).toBe((await phone()) ? 'field' : 'inline');
      await page.setViewportSize({ width: 800, height: 600 });
      await expect.poll(presented).toBe('inline');
      await page.setViewportSize({ width: 375, height: 667 });
      await expect.poll(presented).toBe((await phone()) ? 'field' : 'inline');
      expect(await value(page)).toBe('48.8584,2.2945');
      expect(await page.evaluate(() => new FormData(document.forms[0]!).get('loc'))).toBe(
        '48.8584,2.2945',
      );
      expect(await commits(page)).toEqual([]);
      expect(errors).toEqual([]);
    },
  );

  test(
    'axe: no serious or critical violation with the sheet open',
    { tag: ['@field-screen-reader'] },
    async ({ page }) => {
      await openPage(
        page,
        `<main><label for="where">Delivery spot</label>
       <location-picker id="where" presentation="field" search locate="button" value="48.8584,2.2945"></location-picker></main>`,
      );
      await page.addScriptTag({ content: axe.source });
      // Serious and critical violations inside the picker (open shadow root included), as "rule: target" lines.
      const audit = (): Promise<string[]> =>
        page.evaluate(async () => {
          const engine = Reflect.get(window, 'axe') as typeof axe;
          const { violations } = await engine.run('#where', { resultTypes: ['violations'] });
          return violations
            .filter((v) => v.impact == 'serious' || v.impact == 'critical')
            .flatMap((v) => v.nodes.map((node) => `${v.id}: ${JSON.stringify(node.target)}`));
        });
      expect(await audit()).toEqual([]);
      await openSheet(page, '#where');
      expect(await audit()).toEqual([]);
    },
  );
});
