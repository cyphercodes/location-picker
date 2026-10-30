// WP5-12 plain-html: the script build from the packed tarball on a page with no bundler and no framework.
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

test('the script build defines the element, a pan updates the page and the form posts lat/lng', async ({
  page,
}) => {
  const problems = watchConsole(page);
  await page.goto('/');
  const picker = page.locator('#where');
  await ready(picker);
  expect(await page.evaluate(() => typeof customElements.get('location-picker'))).toBe('function');

  const value = await pan(picker);
  await expect(page.locator('#out')).toHaveText(value);

  const fields = await submitAndEcho(page, page.getByRole('button', { name: 'Save' }));
  expect(fields.location).toMatch(LAT_LNG);
  expect(Number(fields.lat)).toBeCloseTo(Number(split(value).lat), 5);
  expect(Number(fields.lng)).toBeCloseTo(Number(split(value).lng), 5);
  expect(problems).toEqual([]);
});
