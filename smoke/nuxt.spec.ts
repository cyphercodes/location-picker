// WP5-12 nuxt (SSR): the Vue/Nuxt recipe from docs/frameworks.md, server-rendered and hydrated.
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

test('SSR + hydration: v-model follows a pan and the form posts lat/lng', async ({ page }) => {
  const problems = watchConsole(page);
  const response = await page.goto('/');
  expect(await response?.text()).toMatch(/<location-picker[^>]*id="loc"/);
  const picker = page.locator('#loc');
  await ready(picker);
  expect(await valueOf(picker)).toBe('48.8584,2.2945');

  const value = await pan(picker);
  await expect(page.locator('#state')).toHaveText(value);

  const fields = await submitAndEcho(page, page.getByRole('button', { name: 'Save' }));
  expect(fields.location).toMatch(LAT_LNG);
  expect(Number(fields.lat)).toBeCloseTo(Number(split(value).lat), 5);
  expect(Number(fields.lng)).toBeCloseTo(Number(split(value).lng), 5);
  expect(problems).toEqual([]);
});
