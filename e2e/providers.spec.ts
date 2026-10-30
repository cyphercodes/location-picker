// WP3-21 (slow engine, tile failure, the default CSP recipe, the engine CSS order in real engines), the real-engine
// half of WP3-02 and WP3-15, and WP3-19 (every external request is an allowed, fixture-answered URL). The pages load
// the built package (dist/*.mjs) and real Leaflet 1.9.4 / maplibre-gl 6.14.0 from node_modules, through the §12.6
// route table; spec-local page routes add the variants the table has no option for (no CORS, errors, hangs, CSP).
import type { Page, Request, Route } from '@playwright/test';
import type * as L from 'leaflet';
import type * as Core from '../src/core.js';
import type * as Leaflet from '../src/leaflet.js';
import type * as MapLibre from '../src/maplibre.js';
import { ALLOWED_EXTERNAL_PATTERNS } from '../test/fixtures/routes.js';
import { expect, test } from './harness/fixtures.js';

const BLANK = '/e2e/harness/blank.html';
const EIFFEL = '48.8584,2.2945';
const JS_URL = 'https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.js';
const CSS_URL = 'https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.css';
const CSS_SRI = 'sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=';
const OPENFREEMAP = 'https://tiles.openfreemap.org/styles/liberty';

interface Modules {
  readonly core: typeof Core;
  readonly leaflet: typeof Leaflet;
  readonly maplibre: typeof MapLibre;
}
/** What the pages keep on `window.lp`. */
interface Harness {
  readonly modules: Modules;
  readonly pickers: Record<string, Core.LocationPicker>;
  readonly log: {
    type: string;
    id: string;
    code?: string;
    level?: string;
    fix?: string;
    source?: string;
  }[];
}

/**
 * A blank page with the built core and adapters as ES modules on `window.lp`. `head` goes into the page head (for
 * a page's own Leaflet script or stylesheet); the map targets are 320 x 240.
 */
async function openPage(page: Page, body: string, head = ''): Promise<void> {
  await page.goto(BLANK);
  await page.setContent(
    `<!doctype html><html lang="en"><head><meta charset="utf-8">${head}` +
      `<style>body{margin:0}.map{width:320px;height:240px}</style></head><body>${body}</body></html>`,
  );
  await page.addScriptTag({
    type: 'module',
    content:
      `import * as core from '/dist/core.mjs'; import * as leaflet from '/dist/leaflet.mjs';` +
      `import * as maplibre from '/dist/maplibre.mjs';` +
      `window.lp = { modules: { core, leaflet, maplibre }, pickers: {}, log: [] };`,
  });
  await page.waitForFunction(() => Reflect.has(window, 'lp'));
}

/** Creates a class picker on `#id` (or on `#id` inside the shadow root of `#host`), recording its events. */
function create(
  page: Page,
  id: string,
  options: {
    provider?: 'leaflet' | 'leafletProvider';
    shadowHost?: string;
    init?: Record<string, unknown>;
  } = {},
): Promise<void> {
  return page.evaluate(
    ([target, { provider, shadowHost, init }]) => {
      const lp: Harness = Reflect.get(window, 'lp');
      let element: HTMLElement | null;
      if (shadowHost) {
        const host = document.getElementById(shadowHost);
        const root = host?.shadowRoot ?? host?.attachShadow({ mode: 'open' });
        element = document.createElement('div');
        element.id = target;
        element.style.cssText = 'display:block;width:320px;height:240px';
        root?.append(element);
      } else element = document.getElementById(target);
      if (!element) throw new Error(`no #${target}`);
      const picker = new lp.modules.core.LocationPicker(element, {
        value: '48.8584,2.2945',
        ...(provider == 'leafletProvider' && {
          provider: lp.modules.leaflet.leafletProvider<unknown>(),
        }),
        ...init,
      });
      lp.pickers[target] = picker;
      for (const type of ['input', 'change', 'error'] as const)
        picker.addEventListener(type, ({ detail }) => {
          const { code, level, fix, source } = Object(detail) as Record<string, string | undefined>;
          lp.log.push({ type, id: target, code, level, fix, source });
        });
      picker.ready.catch(() => {});
    },
    [id, options] as const,
  );
}

const ready = (page: Page, id: string): Promise<void> =>
  page.evaluate((target) => {
    const lp: Harness = Reflect.get(window, 'lp');
    return lp.pickers[target]?.ready.then(() => {});
  }, id);

const logOf = (page: Page): Promise<Harness['log']> =>
  page.evaluate(() => (Reflect.get(window, 'lp') as Harness).log);

/** `position` of the first `.leaflet-pane` under `#id` (looking through the shadow root of `host`). */
const panePosition = (page: Page, id: string, host?: string): Promise<string> =>
  page.evaluate(
    ([target, shadowHost]) => {
      const root = shadowHost ? document.getElementById(shadowHost)?.shadowRoot : document;
      const pane = root?.querySelector(`#${target} .leaflet-pane`);
      return pane ? getComputedStyle(pane).position : 'none';
    },
    [id, host] as const,
  );

/** The leaflet `<link>`s of the document head and of `host`'s shadow root. */
const links = (page: Page, host?: string) =>
  page.evaluate((shadowHost) => {
    const describe = (link: HTMLLinkElement) => ({
      href: link.href,
      integrity: link.integrity,
      crossorigin: link.getAttribute('crossorigin'),
    });
    const root = shadowHost ? document.getElementById(shadowHost)?.shadowRoot : null;
    return {
      head: [...document.head.querySelectorAll<HTMLLinkElement>('link[href*="leaflet"]')].map(
        describe,
      ),
      root: [...(root?.querySelectorAll<HTMLLinkElement>('link[href*="leaflet"]') ?? [])].map(
        describe,
      ),
    };
  }, host);

/** The page's own Leaflet (script) and, optionally, its own leaflet.css (CORS-readable or not). */
const pageLeaflet = (css: 'none' | 'cors' | 'no-cors'): string =>
  `<script src="${JS_URL}"></script>` +
  (css == 'none'
    ? ''
    : `<link rel="stylesheet" href="${CSS_URL}"${css == 'cors' ? ' crossorigin="anonymous"' : ''}>`);

/** Serves leaflet.css from node_modules on `url`, with no CORS header (like a CDN that sends none). */
async function noCorsCss(page: Page, url: RegExp): Promise<void> {
  await page.route(url, (route) =>
    route.fulfill({ path: 'node_modules/leaflet/dist/leaflet.css', contentType: 'text/css' }),
  );
}

async function pressInMap(page: Page, id: string, key: string): Promise<void> {
  const box = await page.locator(`#${id} .lp-map`).boundingBox();
  if (!box) throw new Error(`#${id} has no map`);
  // A click focuses the map as a user would (and arms Leaflet's keyboard handler in every engine).
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await page.keyboard.press(key);
}

test.describe('WP3-21 slow engine (3 s) @slow-engine-load', () => {
  test.use({ routeOptions: { leaflet: 'slow' } });

  test('the pin shows at once with :state(loading) (lp-is-loading), then ready', async ({
    page,
  }) => {
    await openPage(page, '<div id="map" class="map"></div>');
    const started = Date.now();
    await create(page, 'map');
    const early = await page.evaluate(() => {
      const base = document.querySelector('#map .lp-base') ?? document.querySelector('#map');
      const pin = document.querySelector<HTMLElement>('#map .lp-pin');
      const box = pin?.getBoundingClientRect();
      return {
        loading: !!document.querySelector('#map.lp-is-loading, #map .lp-is-loading'),
        pin:
          !!box &&
          box.width > 0 &&
          box.height > 0 &&
          getComputedStyle(pin!).visibility == 'visible',
        base: !!base,
      };
    });
    expect(early).toEqual({ loading: true, pin: true, base: true });
    await ready(page, 'map');
    expect(Date.now() - started).toBeGreaterThanOrEqual(2500);
    expect(await page.locator('#map .lp-is-loading, #map.lp-is-loading').count()).toBe(0);
    await expect.poll(() => panePosition(page, 'map')).toBe('absolute');
  });
});

test.describe('WP3-01 a failing engine route @engine-load-failure', () => {
  test.use({ routeOptions: { leaflet: 'fail' } });

  test('gives ENGINE_LOAD_FAILED and the fallback input, which still commits', async ({ page }) => {
    await openPage(page, '<div id="map" class="map"></div>');
    await create(page, 'map', { init: { value: undefined } });
    await expect
      .poll(async () => (await logOf(page)).filter((e) => e.type == 'error').map((e) => e.code))
      .toEqual(['ENGINE_LOAD_FAILED']);
    const fallback = page.locator('#map input.lp-fallback');
    await expect(fallback).toBeVisible();
    await fallback.fill('48.85, 2.29');
    await fallback.press('Enter');
    await expect
      .poll(async () => (await logOf(page)).filter((e) => e.type == 'change').map((e) => e.source))
      .toEqual(['user']);
  });
});

test.describe('WP3-21 tile failure @tile-failure', () => {
  test.use({ routeOptions: { tiles: 'fail' } });

  test('the map stays interactive and a keyboard pan commits', async ({ page }) => {
    await openPage(page, '<div id="map" class="map"></div>');
    await create(page, 'map');
    await ready(page, 'map');
    await expect
      .poll(() => page.locator('#map img.leaflet-tile').count(), { message: 'tiles requested' })
      .toBeGreaterThan(0);
    expect(await page.locator('#map img.leaflet-tile-loaded').count()).toBe(0);
    await pressInMap(page, 'map', 'ArrowRight');
    await expect
      .poll(async () => (await logOf(page)).filter((e) => e.type == 'change'))
      .toEqual([expect.objectContaining({ source: 'user' })]);
    const value = await page.evaluate(
      () => (Reflect.get(window, 'lp') as Harness).pickers.map?.value,
    );
    expect(value).not.toBe(EIFFEL);
    expect((await logOf(page)).filter((e) => e.type == 'error')).toEqual([]);
  });
});

test.describe('WP3-21 the default CSP recipe (§4.8) on a strict-CSP page @strict-csp', () => {
  test('auto-loads Leaflet with SRI, styles the panes, shows tiles and reverse-geocodes with no violation', async ({
    page,
    baseURL,
  }) => {
    // Row 1 + row 2 of §4.8, plus 'self' for this page's own module (the library is served locally here).
    const csp = [
      "default-src 'none'",
      "script-src 'self' https://cdn.jsdelivr.net",
      'style-src https://cdn.jsdelivr.net',
      'img-src https://tile.openstreetmap.org',
      'connect-src https://photon.komoot.io',
    ].join('; ');
    const boot = `
      window.violations = [];
      document.addEventListener('securitypolicyviolation', (e) =>
        window.violations.push(e.violatedDirective + ' ' + e.blockedURI));
      const { LocationPicker } = await import('/dist/core.mjs');
      const target = document.getElementById('map');
      target.style.width = '320px';
      target.style.height = '240px';
      const picker = new LocationPicker(target, { value: '48.8584,2.2945', reverseGeocode: true });
      window.picker = picker;
      window.address = new Promise((resolve) => picker.addEventListener('addresschange', () => resolve(picker.address)));
      await picker.ready;
      window.booted = true;
    `;
    const origin = new URL(baseURL ?? '').origin;
    await page.route(`${origin}/__lp/csp.html`, (route) =>
      route.fulfill({
        contentType: 'text/html',
        headers: { 'content-security-policy': csp },
        body:
          '<!doctype html><html lang="en"><head><meta charset="utf-8"><title>CSP</title>' +
          '<script type="module" src="/__lp/csp-boot.mjs"></script></head>' +
          '<body><div id="map"></div></body></html>',
      }),
    );
    await page.route(`${origin}/__lp/csp-boot.mjs`, (route) =>
      route.fulfill({ contentType: 'text/javascript', body: boot }),
    );
    const console: string[] = [];
    page.on('console', (message) => {
      const text = message.text();
      // Firefox's own favicon loader reports its /favicon.ico request under the page policy; that is not the page.
      if (/Content.Security.Policy|CSP/i.test(text) && !text.includes('/favicon.ico'))
        console.push(text);
    });
    const response = await page.goto('/__lp/csp.html');
    expect(response?.headers()['content-security-policy']).toBe(csp);
    await page.waitForFunction(() => Reflect.get(window, 'booted') === true);
    const script = await page.evaluate(() => {
      const node = document.querySelector<HTMLScriptElement>('script[src*="leaflet"]');
      return node && { src: node.src, integrity: node.integrity, crossorigin: node.crossOrigin };
    });
    expect(script).toEqual({
      src: JS_URL,
      integrity: 'sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=',
      crossorigin: 'anonymous',
    });
    await expect.poll(() => panePosition(page, 'map')).toBe('absolute');
    await expect
      .poll(() => page.locator('#map img.leaflet-tile-loaded').count())
      .toBeGreaterThan(0);
    expect(await page.evaluate(() => Reflect.get(window, 'address'))).toContain('Tour Eiffel');
    expect(await page.evaluate(() => Reflect.get(window, 'violations'))).toEqual([]);
    expect(console).toEqual([]);
  });
});

test.describe('WP3-02 / WP3-21 the engine CSS order (§4.3) in real engines', () => {
  test('step 2: the pinned sheet goes in together with the auto-loaded script', async ({
    page,
  }) => {
    await openPage(page, '<div id="map" class="map"></div>');
    await create(page, 'map');
    await page.waitForFunction(() => !!document.querySelector('script[src*="leaflet"]'));
    expect((await links(page)).head).toEqual([
      { href: CSS_URL, integrity: CSS_SRI, crossorigin: 'anonymous' },
    ]);
    await ready(page, 'map');
    await expect.poll(() => panePosition(page, 'map')).toBe('absolute');
  });

  test('step 3: a Document that already has leaflet.css links nothing', async ({ page }) => {
    await openPage(page, '<div id="map" class="map"></div>', pageLeaflet('cors'));
    await create(page, 'map', { provider: 'leafletProvider' });
    await ready(page, 'map');
    await expect.poll(() => panePosition(page, 'map')).toBe('absolute');
    expect((await links(page)).head).toEqual([
      { href: CSS_URL, integrity: '', crossorigin: 'anonymous' },
    ]);
    expect((await logOf(page)).filter((e) => e.type == 'error')).toEqual([]);
  });

  test("step 3': a user ShadowRoot copies the readable document rules and links nothing", async ({
    page,
  }) => {
    await openPage(page, '<div id="host"></div>', pageLeaflet('cors'));
    await create(page, 'map', { provider: 'leafletProvider', shadowHost: 'host' });
    await ready(page, 'map');
    await expect.poll(() => panePosition(page, 'map', 'host')).toBe('absolute');
    expect((await links(page, 'host')).root).toEqual([]);
  });

  test("a cross-origin no-CORS document sheet is unreadable: step 3' falls through to step 4", async ({
    page,
  }) => {
    await openPage(page, '<div id="host"></div>', pageLeaflet('no-cors'));
    await create(page, 'map', { provider: 'leafletProvider', shadowHost: 'host' });
    await ready(page, 'map');
    await expect.poll(() => panePosition(page, 'map', 'host')).toBe('absolute');
    expect((await links(page, 'host')).root).toEqual([
      { href: CSS_URL, integrity: CSS_SRI, crossorigin: 'anonymous' },
    ]);
  });

  test('step 1: a custom engineCssUrl gets no SRI and no crossorigin, and applies from a no-CORS route', async ({
    page,
  }) => {
    const custom = `${CSS_URL}?custom`;
    await noCorsCss(page, /leaflet\.css\?custom$/);
    for (const [id, host] of [
      ['doc', undefined],
      ['shadow', 'host'],
    ] as const) {
      // oxlint-disable-next-line no-await-in-loop -- one page per mode
      await openPage(
        page,
        '<div id="doc" class="map"></div><div id="host"></div>',
        pageLeaflet('none'),
      );
      // oxlint-disable-next-line no-await-in-loop
      await create(page, id, {
        provider: 'leafletProvider',
        init: { engineCssUrl: custom },
        ...(host && { shadowHost: host }),
      });
      // oxlint-disable-next-line no-await-in-loop
      await ready(page, id);
      // oxlint-disable-next-line no-await-in-loop
      await expect.poll(() => panePosition(page, id, host)).toBe('absolute');
      // oxlint-disable-next-line no-await-in-loop
      const linked = await links(page, host);
      expect(host ? linked.root : linked.head).toEqual([
        { href: custom, integrity: '', crossorigin: null },
      ]);
    }
  });

  test('a stylesheet that errors: loading settles at once and step 5 reports ENGINE_CSS_MISSING (warn)', async ({
    page,
  }) => {
    await page.route(/leaflet\.css\?broken$/, (route) => route.abort('failed'));
    await openPage(page, '<div id="map" class="map"></div>', pageLeaflet('none'));
    const started = Date.now();
    await create(page, 'map', {
      provider: 'leafletProvider',
      init: { engineCssUrl: `${CSS_URL}?broken` },
    });
    await expect
      .poll(async () => (await logOf(page)).filter((e) => e.type == 'error'))
      .toEqual([expect.objectContaining({ code: 'ENGINE_CSS_MISSING', level: 'warn' })]);
    expect(Date.now() - started).toBeLessThan(2500);
  });

  test('a stylesheet that hangs: loading settles after 3000 ms and step 5 reports', async ({
    page,
  }) => {
    const hung: Route[] = [];
    await page.route(/leaflet\.css\?hang$/, (route) => {
      hung.push(route);
    });
    await openPage(page, '<div id="map" class="map"></div>', pageLeaflet('none'));
    const started = Date.now();
    await create(page, 'map', {
      provider: 'leafletProvider',
      init: { engineCssUrl: `${CSS_URL}?hang` },
    });
    await ready(page, 'map');
    await expect
      .poll(async () => (await logOf(page)).filter((e) => e.type == 'error'), { timeout: 8000 })
      .toEqual([expect.objectContaining({ code: 'ENGINE_CSS_MISSING', level: 'warn' })]);
    expect(Date.now() - started).toBeGreaterThanOrEqual(2900);
    await Promise.all(hung.map((route) => route.abort('failed').catch(() => {})));
  });

  test('with every source removed, ENGINE_CSS_MISSING (warn) names the fixes', async ({ page }) => {
    await openPage(page, '<div id="map" class="map"></div>', pageLeaflet('none'));
    await create(page, 'map', { provider: 'leafletProvider', init: { engineCssUrl: false } });
    await ready(page, 'map');
    await expect
      .poll(async () => (await logOf(page)).filter((e) => e.type == 'error'))
      .toEqual([expect.objectContaining({ code: 'ENGINE_CSS_MISSING', level: 'warn' })]);
    expect((await links(page)).head).toEqual([]);
  });
});

test.describe('WP3-22 synchronous .map while leaflet.css takes 3 s', () => {
  test('picker.map is set in the constructor and L.circle().addTo(map) works on the next line', async ({
    page,
  }) => {
    await page.route(CSS_URL, async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 3000));
      await route.fulfill({
        path: 'node_modules/leaflet/dist/leaflet.css',
        contentType: 'text/css',
        headers: { 'access-control-allow-origin': '*' },
      });
    });
    await openPage(
      page,
      '<div id="map" class="map"></div><div id="host"></div>',
      pageLeaflet('none'),
    );
    const sync = await page.evaluate(() => {
      const lp: Harness = Reflect.get(window, 'lp');
      const engine = Reflect.get(window, 'L') as typeof L;
      const shadow = document.getElementById('host')?.attachShadow({ mode: 'open' });
      const inner = document.createElement('div');
      inner.style.cssText = 'display:block;width:320px;height:240px';
      shadow?.append(inner);
      return [document.getElementById('map'), inner].map((target) => {
        if (!target) return 'no target';
        const picker = new lp.modules.core.LocationPicker<L.Map>(target, {
          provider: lp.modules.leaflet.leafletProvider<L.Map>(),
          value: '48.8584,2.2945',
        });
        const map = picker.map;
        if (!(map instanceof engine.Map)) return 'no map';
        engine.circle([48.8584, 2.2945], { radius: 200 }).addTo(map);
        const link = (target.getRootNode() as Document | ShadowRoot).querySelector<HTMLLinkElement>(
          'link[href*="leaflet.css"]',
        );
        return link?.sheet ? 'css already applied' : 'ok';
      });
    });
    expect(sync).toEqual(['ok', 'ok']);
    await expect.poll(() => panePosition(page, 'map'), { timeout: 8000 }).toBe('absolute');
  });
});

/** Puts maplibre-gl 6.14 (node_modules, unbundled, so its worker resolves) on window.maplibregl; false without WebGL2. */
async function loadMapLibre(page: Page): Promise<boolean> {
  return page.evaluate(async () => {
    if (!document.createElement('canvas').getContext('webgl2')) return false;
    const maplibregl: object = await import(
      '/node_modules/maplibre-gl/dist/maplibre-gl.mjs' as string
    );
    Reflect.set(window, 'maplibregl', maplibregl);
    return true;
  });
}

test.describe('WP3-15 real maplibre-gl 6.14 @maplibre-provider', () => {
  test("with maplibre-gl.css in a Document, a user ShadowRoot (step 3') or engineCssUrl: no warning", async ({
    page,
    browserName,
  }) => {
    const css = '/node_modules/maplibre-gl/dist/maplibre-gl.css';
    for (const mode of ['document', 'shadow', 'engineCssUrl'] as const) {
      const host = mode == 'shadow' ? 'host' : undefined;
      // oxlint-disable-next-line no-await-in-loop -- one page per mode
      await openPage(
        page,
        '<div id="map" class="map"></div><div id="host"></div>',
        mode == 'engineCssUrl' ? '' : `<link rel="stylesheet" href="${css}">`,
      );
      // oxlint-disable-next-line no-await-in-loop
      test.skip(!(await loadMapLibre(page)), `no WebGL2 in this ${browserName} build`);
      // oxlint-disable-next-line no-await-in-loop
      await create(page, 'map', {
        init: { provider: 'maplibre', ...(mode == 'engineCssUrl' && { engineCssUrl: css }) },
        ...(host && { shadowHost: host }),
      });
      // oxlint-disable-next-line no-await-in-loop
      await ready(page, 'map');
      const state = () =>
        page.evaluate((shadowHost) => {
          const root = shadowHost ? document.getElementById(shadowHost)?.shadowRoot : document;
          const canvas = root?.querySelector('#map .maplibregl-canvas');
          const describe = (link: HTMLLinkElement) => ({
            href: new URL(link.href).pathname,
            integrity: link.integrity,
            crossorigin: link.getAttribute('crossorigin'),
          });
          return {
            canvas: canvas ? getComputedStyle(canvas).position : 'none',
            head: [...document.head.querySelectorAll<HTMLLinkElement>('link')].map(describe),
            root: [
              ...(document
                .getElementById('host')
                ?.shadowRoot?.querySelectorAll<HTMLLinkElement>('link') ?? []),
            ].map(describe),
          };
        }, host);
      // oxlint-disable-next-line no-await-in-loop
      await expect.poll(async () => (await state()).canvas).toBe('absolute');
      // Step 5 runs once the CSS work settled; give it a moment, then nothing may have been reported.
      // oxlint-disable-next-line no-await-in-loop
      await page.waitForTimeout(300);
      // oxlint-disable-next-line no-await-in-loop
      expect(
        (await logOf(page)).filter((e) => e.type == 'error'),
        mode,
      ).toEqual([]);
      // oxlint-disable-next-line no-await-in-loop
      const { head, root } = await state();
      const link = { href: css, integrity: '', crossorigin: null };
      expect(head, mode).toEqual([link]);
      expect(root, mode).toEqual([]);
    }
  });

  test('[lng, lat] centre, OpenFreeMap style, wheel zoom keeps the value, no rotation, CSS fix', async ({
    page,
    browserName,
  }) => {
    const requests: string[] = [];
    page.on('request', (request) => requests.push(request.url()));
    await openPage(page, '<div id="map" class="map"></div>');
    const webgl2 = await page.evaluate(
      () => !!document.createElement('canvas').getContext('webgl2'),
    );
    test.skip(!webgl2, `no WebGL2 in this ${browserName} build`);
    await page.evaluate(async () => {
      const maplibregl: object = await import(
        '/node_modules/maplibre-gl/dist/maplibre-gl.mjs' as string
      );
      Reflect.set(window, 'maplibregl', maplibregl);
    });
    await create(page, 'map', {
      init: { provider: 'maplibre', zoom: 12 },
    });
    await ready(page, 'map');
    // The style is fetched after ready (mount never waits for it).
    await expect.poll(() => requests).toContain(OPENFREEMAP);
    const state = () =>
      page.evaluate(() => {
        const lp: Harness = Reflect.get(window, 'lp');
        const picker = lp.pickers.map;
        const map = picker?.map as {
          getCenter(): { lng: number; lat: number };
          getZoom(): number;
          getBearing(): number;
          dragRotate: { isEnabled(): boolean };
        };
        const { lng, lat } = map.getCenter();
        return {
          value: picker?.value,
          lng: +lng.toFixed(4),
          lat: +lat.toFixed(4),
          zoom: map.getZoom(),
          bearing: map.getBearing(),
          rotate: map.dragRotate.isEnabled(),
        };
      });
    expect(await state()).toMatchObject({
      lng: 2.2945,
      lat: 48.8584,
      zoom: 12,
      bearing: 0,
      rotate: false,
    });

    const box = await page.locator('#map .lp-map').boundingBox();
    if (!box) throw new Error('no map box');
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.wheel(0, -300);
    await expect.poll(async () => (await state()).zoom).toBeGreaterThan(12);
    await page.waitForTimeout(500);
    const after = await state();
    expect(after).toMatchObject({ value: EIFFEL, bearing: 0 });
    expect(Math.abs(after.lng - 2.2945)).toBeLessThan(0.001);
    expect(Math.abs(after.lat - 48.8584)).toBeLessThan(0.001);

    const log = await logOf(page);
    expect(log.filter((e) => e.type == 'change' || e.type == 'input')).toEqual([]);
    // No document CSS and no engineCssUrl: nothing fetched, and the warning names both fixes.
    expect(requests.filter((url) => /\.css(\?|$)/.test(url))).toEqual([]);
    expect(log.filter((e) => e.type == 'error')).toEqual([
      expect.objectContaining({
        code: 'ENGINE_CSS_MISSING',
        level: 'warn',
        fix: expect.stringMatching(
          /maplibre-gl\/dist\/maplibre-gl\.css.*maplibre-gl@6\.14\.0\/dist\/maplibre-gl\.css/s,
        ),
      }),
    ]);
  });
});

test.describe('WP3-19 every external request is allowed and answered by a fixture', () => {
  test('auto-loaded Leaflet, tiles, search and reverse geocoding (Photon)', async ({ page }) => {
    const finished: string[] = [];
    const failed: string[] = [];
    const external = (request: Request): boolean =>
      !/^https?:\/\/127\.0\.0\.1[:/]/.test(request.url());
    page.on('requestfinished', (request) => {
      if (external(request)) finished.push(request.url());
    });
    page.on('requestfailed', (request) => {
      if (external(request)) failed.push(`${request.url()} ${request.failure()?.errorText}`);
    });
    await openPage(page, '<div id="map" class="map" style="height:320px"></div>');
    await create(page, 'map', { init: { search: true, reverseGeocode: true } });
    const reverses = (): number => finished.filter((url) => url.includes('/reverse?')).length;
    const sources = async (): Promise<unknown[]> =>
      (await logOf(page)).filter((e) => e.type == 'change').map((e) => e.source);
    await ready(page, 'map');
    // The initial value is looked up first; waiting for it keeps the next commit from aborting it (§5.3).
    await expect.poll(reverses).toBe(1);
    const input = page.locator('#map .lp-search-input');
    await input.fill('eiffel');
    await expect(page.locator('#map .lp-search-option').first()).toBeVisible();
    await input.press('Enter');
    await expect.poll(sources).toEqual(['search']);
    await pressInMap(page, 'map', 'ArrowDown');
    await expect.poll(sources).toEqual(['search', 'user']);
    await expect.poll(reverses).toBe(2);
    await expect
      .poll(() => page.evaluate(() => (Reflect.get(window, 'lp') as Harness).pickers.map?.address))
      .toContain('Tour Eiffel');
    await expect
      .poll(() => page.locator('#map img.leaflet-tile-loaded').count())
      .toBeGreaterThan(0);

    expect(failed).toEqual([]);
    expect(finished.length).toBeGreaterThan(0);
    const outside = finished.filter(
      (url) => !ALLOWED_EXTERNAL_PATTERNS.some((pattern) => pattern.test(url)),
    );
    expect(outside).toEqual([]);
    for (const host of ['cdn.jsdelivr.net', 'tile.openstreetmap.org', 'photon.komoot.io'])
      expect(
        finished.some((url) => new URL(url).host == host),
        host,
      ).toBe(true);
  });
});
