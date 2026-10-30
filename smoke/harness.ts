// Shared checks for the smoke specs. They reuse the e2e fixtures, so every request outside 127.0.0.1 is answered by
// the §12.6 route table (Leaflet, tiles, Photon) or fails the test.
import type { Locator, Page } from '@playwright/test';
import type { LocationPickerElement } from '../src/element/location-picker-element.js';
import { expect } from '../e2e/harness/fixtures.js';

export { expect, test } from '../e2e/harness/fixtures.js';

/** A committed "lat,lng" value. */
export const LAT_LNG = /^-?\d+(\.\d+)?,-?\d+(\.\d+)?$/;

/**
 * Page errors, console errors and hydration warnings (React, Vue and Angular wording); a smoke page keeps it empty.
 * `expected` excuses messages a test provokes on purpose.
 */
export function watchConsole(page: Page, expected?: RegExp): string[] {
  const problems: string[] = [];
  const add = (text: string): void => {
    if (!expected?.test(text)) problems.push(text);
  };
  page.on('pageerror', (error) => add(`pageerror: ${error.message}`));
  page.on('console', (message) => {
    const text = message.text();
    if (message.type() === 'error') add(`console.error: ${text}`);
    else if (/hydrat|NG0[5-9]\d\d/i.test(text)) add(`console.${message.type()}: ${text}`);
  });
  return problems;
}

export async function ready(picker: Locator): Promise<void> {
  await picker.evaluate(async (el: LocationPickerElement) => {
    await el.ready;
  });
}

export function valueOf(picker: Locator): Promise<string> {
  return picker.evaluate((el: LocationPickerElement) => el.value);
}

/**
 * A user pan: ArrowRight on the map region animates the map (live `input` events) and commits once with `change`.
 * Returns the committed value, once the element holds it.
 */
export async function pan(picker: Locator): Promise<string> {
  await picker.evaluate((el: LocationPickerElement) => {
    const committed = new Promise<string>((resolve) => {
      const onChange = (event: Event): void => {
        const detail: unknown = event instanceof CustomEvent ? event.detail : null;
        resolve(String(Reflect.get(Object(detail), 'value')));
      };
      el.addEventListener('change', onChange, { once: true });
    });
    Reflect.set(el, '__smokeCommitted', committed);
  });
  await picker.locator('[part="map"]').press('ArrowRight');
  const value = await picker.evaluate((el): Promise<string> => Reflect.get(el, '__smokeCommitted'));
  expect(value).toMatch(LAT_LNG);
  await expect.poll(() => valueOf(picker)).toBe(value);
  return value;
}

/** Clicks `submit` and returns the fields the server's POST handler received. */
export async function submitAndEcho(page: Page, submit: Locator): Promise<Record<string, string>> {
  const response = page.waitForResponse((r) => r.request().method() === 'POST');
  await submit.click();
  const body: { fields: Record<string, string> } = await (await response).json();
  return body.fields;
}

/** The latitude and longitude of a "lat,lng" value as the strings a form submits. */
export function split(value: string): { lat: string; lng: string } {
  const [lat = '', lng = ''] = value.split(',');
  return { lat, lng };
}
