// WP3-08 through the real request path: the built adapter injects Google's inline bootstrap, the route table answers
// https://maps.googleapis.com/maps/api/js with the standalone mock (e2e/fixtures/google-maps-mock.js), and the mock
// installs the API and calls the bootstrap back. Also a classic <script src=…/maps/api/js> page with a synchronous
// picker.map, and a user drag that commits.
import type { Page, Request } from '@playwright/test';
import type * as Core from '../src/core.js';
import type * as Google from '../src/google.js';
import type { GoogleMapsMock } from '../test/fixtures/google-maps-mock.js';
import { expect, test } from './harness/fixtures.js';

const BLANK = '/e2e/harness/blank.html';
const API = /^https:\/\/maps\.googleapis\.com\/maps\/api\/js/;

interface Harness {
  readonly core: typeof Core;
  readonly google: typeof Google;
  readonly pickers: Core.LocationPicker<unknown>[];
  readonly log: string[];
}

async function openPage(page: Page, head = ''): Promise<void> {
  await page.goto(BLANK);
  await page.setContent(
    `<!doctype html><html lang="en"><head><meta charset="utf-8">${head}` +
      `<style>body{margin:0}.map{width:320px;height:240px}</style></head><body>` +
      `<div class="map" id="a"></div><div class="map" id="b"></div><div class="map" id="c"></div></body></html>`,
  );
  await page.addScriptTag({
    type: 'module',
    content:
      `import * as core from '/dist/core.mjs'; import * as google from '/dist/google.mjs';` +
      `window.lp = { core, google, pickers: [], log: [] };`,
  });
  await page.waitForFunction(() => Reflect.has(window, 'lp'));
}

test.describe('Google bootstrap through the route table (mode none)', () => {
  test.use({ routeOptions: { google: 'none' } });

  test('3 pickers with an api key: ONE bootstrap request (key, v=weekly, language, nonce), 3 maps', async ({
    page,
  }) => {
    const requests: Request[] = [];
    page.on('request', (request) => {
      if (API.test(request.url())) requests.push(request);
    });
    await openPage(page, '<script nonce="e2e-nonce">/* the page’s own nonce */</script>');
    const maps = await page.evaluate(async () => {
      const lp: Harness = Reflect.get(window, 'lp');
      for (const id of ['a', 'b', 'c']) {
        const target = document.getElementById(id);
        if (!target) throw new Error(`no #${id}`);
        lp.pickers.push(
          new lp.core.LocationPicker(target, {
            apiKey: 'TEST_KEY',
            lang: 'fr',
            value: '48.8584,2.2945',
          }),
        );
      }
      await Promise.all(lp.pickers.map((picker) => picker.ready));
      const mock: GoogleMapsMock = Reflect.get(window, 'lpGoogleMock');
      const script = document.querySelector<HTMLScriptElement>(
        'script[src^="https://maps.googleapis.com/"]',
      );
      return {
        providers: lp.pickers.map((picker) => picker.provider),
        instances: mock.stats.mapInstances.length,
        imported: [...new Set(mock.stats.importedLibraries)],
        nonce: script?.nonce,
      };
    });
    expect(requests).toHaveLength(1);
    const params = Object.fromEntries(new URL(must(requests[0]).url()).searchParams);
    expect(params).toEqual({
      libraries: 'maps',
      key: 'TEST_KEY',
      v: 'weekly',
      language: 'fr',
      callback: 'google.maps.__ib__',
    });
    expect(maps).toEqual({
      providers: ['google', 'google', 'google'],
      instances: 3,
      imported: ['maps'],
      nonce: 'e2e-nonce',
    });
  });
});

test.describe('a classic Google page (mode classic)', () => {
  test.use({ routeOptions: { google: 'classic' } });

  test('googleProvider() sets picker.map synchronously; a user drag commits once (source user)', async ({
    page,
  }) => {
    await openPage(
      page,
      '<script src="https://maps.googleapis.com/maps/api/js?key=TEST_KEY"></script>',
    );
    const result = await page.evaluate(async () => {
      const lp: Harness = Reflect.get(window, 'lp');
      const target = document.getElementById('a');
      if (!target) throw new Error('no #a');
      const picker = new lp.core.LocationPicker(target, {
        provider: lp.google.googleProvider(),
        value: '48.8584,2.2945',
      });
      const synchronous = picker.map instanceof google.maps.Map;
      picker.addEventListener('change', ({ detail }) =>
        lp.log.push(`${detail.value}:${detail.source}`),
      );
      await picker.ready;
      const mock: GoogleMapsMock = Reflect.get(window, 'lpGoogleMock');
      mock.simulateUserPan(picker.map, { lat: 48.86, lng: 2.3 });
      await new Promise((resolve) => setTimeout(resolve, 50));
      return { synchronous, importLibrary: typeof google.maps.importLibrary, log: lp.log };
    });
    expect(result).toEqual({
      synchronous: true,
      importLibrary: 'undefined',
      log: ['48.86,2.3:user'],
    });
  });
});

function must<T>(value: T | undefined): T {
  if (value === undefined) throw new Error('expected a value');
  return value;
}
