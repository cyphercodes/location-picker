// WP5-12 astro: the Astro recipe from docs/frameworks.md (static output, bundled client script).
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

test('the bundled script defines the element, a pan updates the page and the form posts lat/lng', async ({
  page,
}) => {
  const problems = watchConsole(page);
  await page.goto('/');
  const picker = page.locator('#loc');
  await ready(picker);

  const value = await pan(picker);
  await expect(page.locator('#state')).toHaveText(value);

  const fields = await submitAndEcho(page, page.getByRole('button', { name: 'Save' }));
  expect(fields.location).toMatch(LAT_LNG);
  expect(Number(fields.lat)).toBeCloseTo(Number(split(value).lat), 5);
  expect(Number(fields.lng)).toBeCloseTo(Number(split(value).lng), 5);
  expect(problems).toEqual([]);
});
