// WP5-12 angular (SSR + hydration) and WP4-10: the Angular recipe from docs/frameworks.md in a server-rendered app.
import { LAT_LNG, expect, pan, ready, split, test, valueOf, watchConsole } from './harness.js';

test('SSR + hydration: formControlName + ngDefaultControl with bound inputs holds "lat,lng"; the form posts it', async ({
  page,
}) => {
  const problems = watchConsole(page);
  const response = await page.goto('/');
  const html = (await response?.text()) ?? '';
  expect(html).toContain('ng-server-context="ssr"');
  expect(html).toMatch(/<location-picker[^>]*id="loc"/);

  const picker = page.locator('#loc');
  await ready(picker);
  // Non-destructive hydration: Angular kept the server-rendered element.
  expect(
    await page.evaluate(
      () => Reflect.get(window, '__ssrPicker') === document.getElementById('loc'),
    ),
  ).toBe(true);
  expect(await valueOf(picker)).toBe('48.8584,2.2945');
  await expect(page.locator('#state')).toHaveText('48.8584,2.2945');

  const value = await pan(picker);
  await expect(page.locator('#state')).toHaveText(value);
  expect(await page.locator('#state').textContent()).toMatch(LAT_LNG);
  const { lat, lng } = split(value);
  expect(Number(await page.locator('#lat').inputValue())).toBeCloseTo(Number(lat), 5);

  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.locator('#echo')).toContainText('"lat"');
  const echoed: { fields: Record<string, string> } = JSON.parse(
    (await page.locator('#echo').textContent()) ?? '{}',
  );
  expect(Number(echoed.fields.lat)).toBeCloseTo(Number(lat), 5);
  expect(Number(echoed.fields.lng)).toBeCloseTo(Number(lng), 5);
  expect(echoed.fields.location).toMatch(LAT_LNG);
  expect(problems).toEqual([]);
});
