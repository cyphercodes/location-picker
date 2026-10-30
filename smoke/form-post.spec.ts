// WP5-12 form-post: a Laravel-style server-rendered form (Express acting as the backend). The bound inputs seed the
// picker from the stored values, a pan writes them, and the POST carries lat/lng with the CSRF token.
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

const STORED = '48.8584,2.2945';

for (const path of ['/stores/1/edit', '/legacy']) {
  test(`${path}: the stored values seed the picker, a pan rewrites them and the POST receives lat/lng`, async ({
    page,
  }) => {
    const problems = watchConsole(page);
    await page.goto(path);
    const picker = page.locator('#store-location');
    await ready(picker);
    expect(await picker.evaluate((el: HTMLElement & { value: string }) => el.value)).toBe(STORED);
    await expect(page.locator('#lat')).toHaveValue('48.8584');

    const value = await pan(picker);
    expect(value).toMatch(LAT_LNG);
    const { lat, lng } = split(value);
    expect(Number(await page.locator('#lat').inputValue())).toBeCloseTo(Number(lat), 5);

    const fields = await submitAndEcho(page, page.getByRole('button', { name: 'Save' }));
    expect(fields).toMatchObject({ _token: 'smoke-csrf-token', _method: 'PUT' });
    expect(Number(fields.lat)).toBeCloseTo(Number(lat), 5);
    expect(Number(fields.lng)).toBeCloseTo(Number(lng), 5);
    expect(problems).toEqual([]);
  });
}
