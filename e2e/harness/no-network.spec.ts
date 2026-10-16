import { expect, test } from './fixtures.js';

// WP5-08 canary (e2e): the route table aborts and records non-routed requests, and answers routed ones locally.
test('blocks and records a non-routed request', async ({ page, network }) => {
  await page.goto('/e2e/harness/blank.html');
  const outcome = await page.evaluate(() =>
    fetch('https://lp-canary.invalid/e2e').then(
      () => 'reached',
      () => 'blocked',
    ),
  );
  expect(outcome).toBe('blocked');
  expect(network.takeBlocked()).toEqual(['https://lp-canary.invalid/e2e']);
});

test('serves pinned Leaflet locally with CORS, so SRI passes', async ({ page }) => {
  await page.goto('/e2e/harness/blank.html');
  const version = await page.evaluate(
    () =>
      new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = 'https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.js';
        script.integrity = 'sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=';
        script.crossOrigin = 'anonymous';
        script.addEventListener('load', () => {
          const leaflet: { version: string } = Reflect.get(window, 'L');
          resolve(leaflet.version);
        });
        script.addEventListener('error', reject);
        document.head.append(script);
      }),
  );
  expect(version).toBe('1.9.4');
});

test('maps location-picker@3 onto the local dist and refuses paths it cannot serve', async ({
  page,
  network,
}) => {
  await page.goto('/e2e/harness/blank.html');
  const statuses = await page.evaluate(() =>
    Promise.all(
      [
        'https://cdn.jsdelivr.net/npm/location-picker@3',
        'https://cdn.jsdelivr.net/npm/location-picker@3/dist/location-picker.min.js',
        'https://cdn.jsdelivr.net/npm/location-picker@3/+esm',
      ].map((url) => fetch(url).then((response) => response.status)),
    ),
  );
  expect(statuses).toEqual([200, 200, 404]);
  expect(network.takeBlocked()).toEqual(['https://cdn.jsdelivr.net/npm/location-picker@3/+esm']);
});
