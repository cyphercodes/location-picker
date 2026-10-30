// A12: the hosted pick link (/pick/). Deep-link parameters, copy and share, the https-only redirect after a click,
// and postMessage to the opener or parent only at the required origin. The page stores nothing anywhere.
import { readFileSync } from 'node:fs';
import type { BrowserContext, Page } from '@playwright/test';
import { expect, test } from './harness/fixtures.js';
import {
  collectProblems,
  expectOnlyHosts,
  lastCopied,
  recordClipboard,
  requireBuiltSite,
  SITE,
  trackHosts,
  valueOf,
  waitReady,
} from './site-helpers.js';

const PICK = `${SITE}pick/`;
/** A cross-origin opener, answered by page.route. */
const PARENT = 'http://parent.test';

test.beforeAll(requireBuiltSite);

async function expectNoStorage(page: Page, context: BrowserContext): Promise<void> {
  expect(
    await page.evaluate(() => [localStorage.length, sessionStorage.length, document.cookie]),
  ).toEqual([0, 0, '']);
  expect(await context.cookies()).toEqual([]);
}

test('deep link: lat, lng and zoom start the pin; lang sets the search language', async ({
  page,
}) => {
  await page.goto(`${PICK}?lat=48.8584&lng=2.2945&zoom=16&lang=de`);
  const picker = page.locator('#picker');
  await waitReady(picker);
  expect(await valueOf(picker)).toBe('48.8584,2.2945');
  expect(await picker.evaluate((el) => Number(Reflect.get(el, 'zoom')))).toBe(16);
  expect(await picker.getAttribute('lang')).toBe('de');
  await expect(page.locator('#lat-out')).toHaveText('48.8584');
});

test('deep link: q starts at the first search result', async ({ page }) => {
  await page.goto(`${PICK}?q=eiffel`);
  const picker = page.locator('#picker');
  await expect.poll(() => valueOf(picker)).toMatch(/^48\.858\d*,2\.294\d*$/);
  await expect(page.locator('#address-out')).toContainText('Paris');
});

test('default mode: confirm shows copy buttons and Web Share; nothing is stored', async ({
  page,
  context,
  browserName,
}) => {
  const hosts = trackHosts(context);
  await recordClipboard(context, browserName);
  await context.addInitScript(() => {
    const shared: unknown[] = [];
    Reflect.set(window, '__shared', shared);
    Reflect.set(navigator, 'share', (data: unknown) => {
      shared.push(data);
      return Promise.resolve();
    });
  });
  const problems = collectProblems(page);
  await page.goto(`${PICK}?lat=48.8584&lng=2.2945&zoom=16`);
  await waitReady(page.locator('#picker'));
  await page.getByRole('button', { name: 'Confirm this location' }).click();
  await expect(page.locator('#result')).toBeVisible();

  await page.locator('button[data-copy="decimal"]').click();
  expect(await lastCopied(page, browserName)).toBe('48.8584, 2.2945');
  await page.locator('button[data-copy="google"]').click();
  expect(await lastCopied(page, browserName)).toBe(
    'https://www.google.com/maps/search/?api=1&query=48.8584,2.2945',
  );

  await page.getByRole('button', { name: 'Send this pin' }).click();
  const shared = await page.evaluate(() => Reflect.get(window, '__shared'));
  expect(shared).toEqual([
    expect.objectContaining({
      url: 'https://www.google.com/maps/search/?api=1&query=48.8584,2.2945',
      text: expect.stringContaining('48.8584, 2.2945'),
    }),
  ]);
  await expectNoStorage(page, context);
  expectOnlyHosts(hosts);
  expect(problems).toEqual([]);
});

test.describe('redirect', () => {
  test('https only: shows the host and goes there only after a click', async ({ page }) => {
    const arrivals: string[] = [];
    await page.route('https://example.com/**', (route) => {
      arrivals.push(route.request().url());
      return route.fulfill({
        body: '<!doctype html><title>done</title>',
        contentType: 'text/html',
      });
    });
    const redirect = encodeURIComponent('https://example.com/done?order=42');
    await page.goto(`${PICK}?lat=48.8584&lng=2.2945&redirect=${redirect}`);
    await waitReady(page.locator('#picker'));
    await expect(page.locator('#dest-host')).toHaveText('example.com');
    await expect(page.getByRole('button', { name: 'Confirm this location' })).toBeHidden();
    await page.waitForTimeout(500);
    expect(arrivals).toEqual([]);
    expect(new URL(page.url()).pathname).toBe(PICK);

    await page.getByRole('button', { name: 'Send to example.com' }).click();
    await page.waitForURL('https://example.com/**');
    const url = new URL(page.url());
    expect(url.pathname).toBe('/done');
    expect(url.searchParams.get('order')).toBe('42');
    expect(url.searchParams.get('lat')).toBe('48.8584');
    expect(url.searchParams.get('lng')).toBe('2.2945');
  });

  for (const bad of [
    'http://example.com/done',
    'javascript:alert(1)',
    'https://user:pass@example.com/',
  ]) {
    test(`refuses ${bad}`, async ({ page }) => {
      await page.goto(`${PICK}?lat=1&lng=2&redirect=${encodeURIComponent(bad)}`);
      await waitReady(page.locator('#picker'));
      await expect(page.locator('#mode-error')).toBeVisible();
      await expect(page.locator('#action-redirect')).toBeHidden();
      await page.getByRole('button', { name: 'Confirm this location' }).click();
      await expect(page.locator('#result')).toBeVisible();
      expect(new URL(page.url()).pathname).toBe(PICK);
    });
  }
});

test.describe('postMessage', () => {
  /** A cross-origin parent page that records the messages it receives. */
  async function openParent(page: Page): Promise<void> {
    await page.route(`${PARENT}/**`, (route) =>
      route.fulfill({
        contentType: 'text/html',
        body: `<!doctype html><title>parent</title><script>
          window.received = [];
          addEventListener('message', (e) => received.push({ origin: e.origin, data: e.data }));
        </script>`,
      }),
    );
    await page.goto(`${PARENT}/app`);
  }

  const pickUrl = (baseURL: string | undefined, origin: string | null): string => {
    const url = new URL(PICK, baseURL);
    url.search = 'lat=48.8584&lng=2.2945&return=postmessage';
    if (origin !== null) url.searchParams.set('origin', origin);
    return url.href;
  };

  test('posts to the opener at the given origin', async ({ page, context, baseURL }) => {
    await openParent(page);
    const [popup] = await Promise.all([
      context.waitForEvent('page'),
      page.evaluate((url) => void window.open(url, '_blank'), pickUrl(baseURL, PARENT)),
    ]);
    await waitReady(popup.locator('#picker'));
    await expect(popup.locator('#post-origin')).toHaveText(PARENT);
    await popup.getByRole('button', { name: 'Send location' }).click();
    await expect.poll(() => page.evaluate(() => Reflect.get(window, 'received').length)).toBe(1);
    const [message] = await page.evaluate(() => Reflect.get(window, 'received'));
    expect(message.origin).toBe(new URL(baseURL ?? '/').origin);
    expect(message.data).toMatchObject({ type: 'location-picker:pick', lat: 48.8584, lng: 2.2945 });
    expect(Object.keys(message.data).sort()).toEqual(['address', 'lat', 'lng', 'type']);
    expect(message.data.address === null || typeof message.data.address === 'string').toBe(true);
    await expect(popup.locator('#post-status')).toContainText(`Sent to ${PARENT}`);
    await expectNoStorage(popup, context);
  });

  test('posts to the parent of an iframe', async ({ page, baseURL }) => {
    // A real local parent page: Chromium's local network access checks stop a routed public page from framing
    // 127.0.0.1, so this parent shares the site's origin (the popup test above covers a cross-origin opener).
    const origin = new URL(baseURL ?? '/').origin;
    await page.goto('/e2e/harness/blank.html');
    await page.evaluate(
      (url) => {
        const received: unknown[] = [];
        Reflect.set(window, 'received', received);
        addEventListener('message', (e) => received.push({ origin: e.origin, data: e.data }));
        const frame = document.createElement('iframe');
        frame.src = url;
        frame.style.cssText = 'width:400px;height:900px';
        document.body.append(frame);
      },
      pickUrl(baseURL, origin),
    );
    const frame = page.frameLocator('iframe');
    await waitReady(frame.locator('#picker'));
    await frame.getByRole('button', { name: 'Send location' }).click();
    await expect.poll(() => page.evaluate(() => Reflect.get(window, 'received').length)).toBe(1);
    const [message] = await page.evaluate(() => Reflect.get(window, 'received'));
    expect(message.data).toMatchObject({ type: 'location-picker:pick', lat: 48.8584, lng: 2.2945 });
  });

  test('another origin receives nothing', async ({ page, context, baseURL }) => {
    await openParent(page);
    const [popup] = await Promise.all([
      context.waitForEvent('page'),
      page.evaluate(
        (url) => void window.open(url, '_blank'),
        pickUrl(baseURL, 'http://other.test'),
      ),
    ]);
    await waitReady(popup.locator('#picker'));
    await popup.getByRole('button', { name: 'Send location' }).click();
    await popup.waitForTimeout(500);
    expect(await page.evaluate(() => Reflect.get(window, 'received').length)).toBe(0);
  });

  test('without an origin it refuses and shows the result instead', async ({ page, baseURL }) => {
    await page.goto(pickUrl(baseURL, null));
    await waitReady(page.locator('#picker'));
    await expect(page.locator('#mode-error')).toContainText('origin');
    await expect(page.locator('#action-post')).toBeHidden();
    await expect(page.getByRole('button', { name: 'Confirm this location' })).toBeVisible();
  });

  test('the page never posts with a wildcard target origin', () => {
    const source = readFileSync('_site/pick/pick.js', 'utf8');
    expect(source).not.toMatch(/postMessage\([^)]*['"`]\*['"`]/);
    expect(source).toMatch(/postMessage\(\{ type: MESSAGE_TYPE, \.\.\.picked \}, mode\.origin\)/);
  });
});
