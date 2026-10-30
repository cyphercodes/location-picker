// The compat reference screenshot (WP5-10): every environment of the matrix renders the default picker from the script
// build and attaches one screenshot, which the compat reporter publishes per viewport as a workflow artifact.
import type { LocationPickerElement } from '../src/element/location-picker-element.js';
import { expect, test } from './harness/fixtures.js';
import { SCREENSHOT_ATTACHMENT, scenarios } from './scenarios.js';

test(
  'the default picker renders and reaches ready',
  scenarios('render'),
  async ({ page }, testInfo) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(`console.error: ${message.text()}`);
    });

    await page.goto('/e2e/fixtures/compat/render.html');
    const picker = page.locator('#where');
    await picker.evaluate(async (el: LocationPickerElement) => {
      await el.ready;
    });
    expect(await picker.evaluate((el: LocationPickerElement) => el.value)).toBe('48.8584,2.2945');
    await expect
      .poll(() => page.locator('#where img.leaflet-tile-loaded').count())
      .toBeGreaterThan(0);
    await expect(page.locator('#where [part="map"]')).toBeVisible();

    const path = testInfo.outputPath('compat.png');
    await page.screenshot({ path });
    await testInfo.attach(SCREENSHOT_ATTACHMENT, { path, contentType: 'image/png' });
    expect(errors).toEqual([]);
  },
);
