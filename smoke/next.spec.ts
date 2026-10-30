// WP5-12 next (App Router SSR) hydrateRoot cell: the React hydration recipe from docs/frameworks.md.
import type { LocationPickerElement } from '../src/element/location-picker-element.js';
import {
  LAT_LNG,
  expect,
  pan,
  ready,
  split,
  submitAndEcho,
  test,
  watchConsole,
} from './harness.js';

test('SSR + hydration: the ref recipe applies messages and addresschange, a bare messages prop does not; POST', async ({
  page,
}) => {
  const problems = watchConsole(page);
  const response = await page.goto('/');
  expect(await response?.text()).toMatch(/<location-picker[^>]*id="recipe"/);
  const recipe = page.locator('#recipe');
  const bare = page.locator('#bare');
  await ready(recipe);
  await ready(bare);
  expect(
    await page.evaluate(
      () => Reflect.get(window, '__ssrPicker') === document.getElementById('recipe'),
    ),
  ).toBe(true);

  await expect
    .poll(() => recipe.evaluate((el: LocationPickerElement) => el.messages.locate))
    .toBe('Use my position');
  await expect(recipe.locator('[part="locate-button"]')).toHaveAccessibleName('Use my position');
  // React does not apply object props on hydration (docs/frameworks.md); flip this when React does.
  expect(await bare.evaluate((el: LocationPickerElement) => el.messages.locate)).toBeUndefined();

  const value = await pan(recipe);
  await expect(page.locator('#state')).toHaveText(value);
  await expect(page.locator('#address')).not.toHaveText('No address yet');

  const fields = await submitAndEcho(page, page.getByRole('button', { name: 'Save' }));
  expect(fields.location).toMatch(LAT_LNG);
  expect(Number(fields.lat)).toBeCloseTo(Number(split(value).lat), 5);
  expect(Number(fields.lng)).toBeCloseTo(Number(split(value).lng), 5);
  expect(problems).toEqual([]);
});
