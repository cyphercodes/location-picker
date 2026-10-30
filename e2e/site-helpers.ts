// Shared by e2e/site.spec.ts and e2e/pick.spec.ts (WP6). The site is served from the built _site/ directory
// (`npm run build && node scripts/build-site.mjs`) by the harness's static server at /_site/.
import { existsSync } from 'node:fs';
import type { BrowserContext, Locator, Page } from '@playwright/test';
import { expect } from './harness/fixtures.js';

export const SITE = '/_site/';

/** The only hosts a site page may contact: itself, OSM tiles and Photon (Google only in keyed Google tests). */
export const SITE_HOSTS: readonly string[] = [
  '127.0.0.1',
  'tile.openstreetmap.org',
  'photon.komoot.io',
];

/** WP3's Google adapter and its mock land together; until then the keyed Google checks cannot run. */
export const GOOGLE_READY: boolean = existsSync('e2e/fixtures/google-maps-mock.js');

export function requireBuiltSite(): void {
  if (!existsSync('_site/index.html')) {
    throw new Error('_site/ is missing: run `npm run build && node scripts/build-site.mjs` first');
  }
}

/** Every http(s) host the context requests, popups and iframes included. */
export function trackHosts(context: BrowserContext): Set<string> {
  const hosts = new Set<string>();
  context.on('request', (request) => {
    const url = new URL(request.url());
    if (url.protocol === 'http:' || url.protocol === 'https:') hosts.add(url.hostname);
  });
  return hosts;
}

export function expectOnlyHosts(hosts: Set<string>, extra: readonly string[] = []): void {
  const allowed = new Set([...SITE_HOSTS, ...extra]);
  expect(
    [...hosts].filter((host) => !allowed.has(host)),
    'requests to other hosts',
  ).toEqual([]);
}

/**
 * Records clipboard writes in every engine (window.__copied). Chromium also gets the clipboard permissions, so
 * readClipboard() can check the real clipboard there.
 */
export async function recordClipboard(context: BrowserContext, browserName: string): Promise<void> {
  if (browserName === 'chromium')
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await context.addInitScript(() => {
    const copied: string[] = [];
    Reflect.set(window, '__copied', copied);
    const clipboard = navigator.clipboard as Clipboard | undefined;
    if (!clipboard) return;
    const original = clipboard.writeText.bind(clipboard);
    clipboard.writeText = (text: string) => {
      copied.push(text);
      return original(text).catch(() => undefined);
    };
  });
}

/** The last text the page copied; on Chromium it must also be what the system clipboard holds. */
export async function lastCopied(page: Page, browserName: string): Promise<string> {
  const copied = await page.evaluate(() => {
    const list: unknown = Reflect.get(window, '__copied');
    return Array.isArray(list) ? String(list.at(-1) ?? '') : '';
  });
  if (browserName === 'chromium') {
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(copied);
  }
  return copied;
}

export async function waitReady(picker: Locator, timeout = 8000): Promise<void> {
  await expect
    .poll(() => picker.evaluate((element) => element.matches(':state(ready)')), {
      timeout,
      message: 'the picker reaches :state(ready)',
    })
    .toBe(true);
}

export const valueOf = (picker: Locator): Promise<string> =>
  picker.evaluate((element) => String(Reflect.get(element, 'value')));

/** A real drag across the map (or arrow keys if the engine ignored it); resolves once the value changed. */
export async function pan(page: Page, picker: Locator): Promise<void> {
  const before = await valueOf(picker);
  const map = picker.locator('[part~="map"]');
  // Phone layouts put the map below the fold; the mouse only reaches what is in the viewport.
  await map.scrollIntoViewIfNeeded();
  const box = await map.boundingBox();
  if (!box) throw new Error('the map has no box');
  const start = { x: box.x + box.width / 2 + 30, y: box.y + box.height / 2 + 30 };
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(start.x - 80, start.y - 60, { steps: 10 });
  await page.mouse.up();
  const changed = (): Promise<boolean> =>
    valueOf(picker).then((value) => value !== before && value !== '');
  try {
    await expect.poll(changed, { timeout: 2000 }).toBe(true);
  } catch {
    await map.focus();
    await page.keyboard.press('ArrowRight');
    await expect.poll(changed, { timeout: 3000, message: 'a pan commits a value' }).toBe(true);
  }
}

/** pageerror and console.error messages, collected for a final empty check. */
export function collectProblems(page: Page): string[] {
  const problems: string[] = [];
  page.on('pageerror', (error) => problems.push(`pageerror: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error') problems.push(`console.error: ${message.text()}`);
  });
  return problems;
}
