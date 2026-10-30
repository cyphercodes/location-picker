// The checks every client-rendered smoke app shares (WP5-12): the page has a form posting to /echo with a picker #loc
// whose framework state is shown in #state, plus pickers with `locate` (WP4-21).
import type { LocationPickerElement } from '../src/element/location-picker-element.js';
import {
  LAT_LNG,
  expect,
  pan,
  ready,
  split,
  submitAndEcho,
  test,
  valueOf,
  watchConsole,
} from './harness.js';

export function spaSmokeTests(locate: readonly (readonly [id: string, attribute: string])[]): void {
  test('a pan updates framework state and the form posts lat/lng', async ({ page }) => {
    const problems = watchConsole(page);
    await page.goto('/');
    const picker = page.locator('#loc');
    await ready(picker);

    const value = await pan(picker);
    await expect(page.locator('#state')).toHaveText(value);
    expect(await valueOf(picker)).toBe(value);

    const fields = await submitAndEcho(page, page.getByRole('button', { name: 'Save' }));
    expect(fields.location).toMatch(LAT_LNG);
    expect(Number(fields.lat)).toBeCloseTo(Number(split(value).lat), 5);
    expect(Number(fields.lng)).toBeCloseTo(Number(split(value).lng), 5);
    expect(problems).toEqual([]);
  });

  for (const [id, attribute] of locate) {
    test(`WP4-21: locate="${attribute}" keeps locate() a stable method and shows the button`, async ({
      page,
    }) => {
      const problems = watchConsole(page);
      await page.goto('/');
      const picker = page.locator(`#${id}`);
      await ready(picker);
      const state = await picker.evaluate((el: LocationPickerElement) => ({
        attribute: el.getAttribute('locate'),
        isMethod: typeof el.locate === 'function',
        isStable: el.locate === el.locate,
      }));
      expect(state).toEqual({ attribute, isMethod: true, isStable: true });
      await expect(picker.locator('[part="locate-button"]')).toBeVisible();
      expect(problems).toEqual([]);
    });
  }
}
