// WP5-12 react19 and WP4-21: the React 19 recipes from docs/frameworks.md, built with Vite from the packed tarball.
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

test.describe('createRoot', () => {
  test('value + onChange: a pan updates React state and the form posts lat/lng', async ({
    page,
  }) => {
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

  test('WP4-21: locate="button" and form="f1" are assigned as properties without a TypeError', async ({
    page,
  }) => {
    const problems = watchConsole(page);
    await page.goto('/');
    const outside = page.locator('#outside');
    await ready(outside);
    const state = await outside.evaluate((el: LocationPickerElement) => ({
      locateAttribute: el.getAttribute('locate'),
      locateIsMethod: typeof el.locate === 'function',
      locateIsStable: el.locate === el.locate,
      formId: el.form?.id,
    }));
    expect(state).toEqual({
      locateAttribute: 'button',
      locateIsMethod: true,
      locateIsStable: true,
      formId: 'f1',
    });
    await expect(outside.locator('[part="locate-button"]')).toBeVisible();
    expect(problems).toEqual([]);
  });

  test.describe('a forced ENGINE_LOAD_FAILED', () => {
    test.use({ routeOptions: { leaflet: 'fail' } });

    test('reaches the lowercase onerror handler', async ({ page }) => {
      // The failed script load and the library's own report of it are expected here; nothing else is.
      const problems = watchConsole(page, /ENGINE_LOAD_FAILED|Failed to load resource|leaflet/i);
      await page.goto('/');
      await expect(page.locator('#error')).toHaveText('ENGINE_LOAD_FAILED');
      expect(problems).toEqual([]);
    });
  });
});

test.describe('hydrateRoot', () => {
  test('hydrates the server HTML; the ref recipe applies messages and addresschange; a bare messages prop does not', async ({
    page,
  }) => {
    const problems = watchConsole(page);
    const response = await page.goto('/hydrate.html');
    expect(await response?.text()).toContain('<location-picker id="recipe"');
    const recipe = page.locator('#recipe');
    const bare = page.locator('#bare');
    await ready(recipe);
    await ready(bare);
    expect(
      await page.evaluate(
        () => Reflect.get(window, '__ssrPicker') === document.getElementById('recipe'),
      ),
    ).toBe(true);

    expect(await recipe.evaluate((el: LocationPickerElement) => el.messages.locate)).toBe(
      'Use my position',
    );
    await expect(recipe.locator('[part="locate-button"]')).toHaveAccessibleName('Use my position');
    // React does not apply object props on hydration (docs/frameworks.md); flip this when React does.
    expect(await bare.evaluate((el: LocationPickerElement) => el.messages.locate)).toBeUndefined();

    const value = await pan(recipe);
    await expect(page.locator('#state')).toHaveText(value);
    await expect(page.locator('#address')).not.toHaveText('No address yet');
    expect(problems).toEqual([]);
  });
});
