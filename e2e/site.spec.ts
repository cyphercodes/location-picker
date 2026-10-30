// WP6-01..10: the GitHub Pages site, built into _site/ by scripts/build-site.mjs and served at /_site/.
// Every request goes through the §12.6 route table; the site may contact only itself, OSM tiles and Photon.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Locator, Page } from '@playwright/test';
import type { CompatReport } from '../src/internal/contracts.js';
import { expect, test } from './harness/fixtures.js';
import {
  collectProblems,
  expectOnlyHosts,
  lastCopied,
  pan,
  recordClipboard,
  requireBuiltSite,
  SITE,
  trackHosts,
  valueOf,
  waitReady,
} from './site-helpers.js';

const PAGES = ['', 'example/', 'embed/', 'pick/', 'compat/'] as const;
const KEY_STORE = 'location-picker-site:google-key';

test.beforeAll(requireBuiltSite);

test.describe('WP6-01 landing page', () => {
  test('a keyless picker from the local script build, and the SEO metadata', async ({
    page,
    context,
  }) => {
    const hosts = trackHosts(context);
    const scripts: string[] = [];
    page.on('request', (request) => {
      if (request.resourceType() === 'script') scripts.push(request.url());
    });
    const problems = collectProblems(page);
    await page.goto(SITE);
    const picker = page.locator('#picker');
    await waitReady(picker);
    await pan(page, picker);
    expect(await valueOf(picker)).toMatch(/^-?\d+(\.\d+)?,-?\d+(\.\d+)?$/);

    expect(scripts.some((url) => url.endsWith('/_site/location-picker.global.js'))).toBe(true);
    expect(scripts.filter((url) => /location-picker@|unpkg|jsdelivr/.test(url))).toEqual([]);
    expectOnlyHosts(hosts);

    expect(await page.title()).toMatch(/location-picker/);
    expect(await page.locator('meta[name="description"]').getAttribute('content')).toBeTruthy();
    expect(await page.locator('link[rel="canonical"]').getAttribute('href')).toBe(
      'https://cyphercodes.github.io/location-picker/',
    );
    expect(await page.locator('meta[property="og:image"]').getAttribute('content')).toBe(
      'https://cyphercodes.github.io/location-picker/og.png',
    );
    expect(pngSize(readFileSync('_site/og.png'))).toEqual({ width: 1200, height: 630 });

    const ld: unknown = JSON.parse(
      (await page.locator('script[type="application/ld+json"]').textContent()) ?? '',
    );
    expect(ld).toMatchObject({
      '@context': 'https://schema.org',
      '@type': 'SoftwareSourceCode',
      name: 'location-picker',
      codeRepository: 'https://github.com/cyphercodes/location-picker',
      license: expect.stringContaining('MIT'),
      programmingLanguage: expect.anything(),
    });
    expect(problems).toEqual([]);
  });
});

test('WP6-02 /example/ and /example/index.html serve the full demo', async ({ page, request }) => {
  for (const path of ['example/', 'example/index.html']) {
    expect((await request.get(SITE + path)).status()).toBe(200);
  }
  await page.goto(`${SITE}example/index.html`);
  const picker = page.locator('#play');
  await waitReady(picker);
  await page.getByRole('button', { name: 'setLocation(48.8584, 2.2945)' }).click();
  await expect(page.locator('#log li[data-type="change"]').first()).toContainText('48.8584,2.2945');
  await page.getByRole('button', { name: 'Submit', exact: true }).click();
  await expect(page.locator('#submitted-out')).toContainText('location=48.8584,2.2945');
  await expect(page.locator('#submitted-out')).toContainText('lat=48.8584');
});

test('WP6-03 deep links set value and zoom; a pan rewrites the URL in place', async ({ page }) => {
  await page.goto(`${SITE}?lat=48.8584&lng=2.2945&zoom=17`);
  const picker = page.locator('#picker');
  await waitReady(picker);
  expect(await valueOf(picker)).toBe('48.8584,2.2945');
  expect(await picker.evaluate((element) => Number(Reflect.get(element, 'zoom')))).toBe(17);
  const length = await page.evaluate(() => history.length);
  await pan(page, picker);
  // The address bar follows the committed value (Leaflet inertia may commit once more after the drag).
  const linked = async (): Promise<string> => {
    const url = new URL(page.url());
    return `${url.searchParams.get('lat')},${url.searchParams.get('lng')}`;
  };
  await expect.poll(async () => (await linked()) === (await valueOf(picker))).toBe(true);
  expect(new URL(page.url()).searchParams.get('zoom')).toBe('17');
  expect(await page.evaluate(() => history.length)).toBe(length);
});

test('WP6-03 ?q= searches and commits the first result', async ({ page }) => {
  await page.goto(`${SITE}?q=eiffel`);
  const picker = page.locator('#picker');
  await expect.poll(() => valueOf(picker)).toMatch(/^48\.858\d*,2\.294\d*$/);
});

test.describe('WP6-04 Google tab', () => {
  test('without a key: no Google request, the map stays on OpenStreetMap', async ({
    page,
    context,
  }) => {
    const hosts = trackHosts(context);
    await page.goto(SITE);
    const picker = page.locator('#picker');
    await waitReady(picker);
    await page.getByRole('radio', { name: 'Google Maps' }).check();
    await expect(page.locator('#key-panel')).toBeVisible();
    await expect(page.getByRole('textbox', { name: 'Google Maps API key' })).toBeVisible();
    expect(await picker.getAttribute('provider')).toBe('leaflet');
    await page.getByRole('radio', { name: 'OpenStreetMap' }).check();
    await expect(page.locator('#key-panel')).toBeHidden();
    expectOnlyHosts(hosts);
    expect(await page.evaluate((key) => localStorage.getItem(key), KEY_STORE)).toBeNull();
  });

  test('the key lives only in localStorage and goes only to the Google bootstrap', async ({
    page,
    context,
  }) => {
    const KEY = 'TEST_KEY_wp6_04';
    const carriers: string[] = [];
    page.on('request', (request) => {
      if (request.url().includes(KEY) || (request.postData() ?? '').includes(KEY)) {
        carriers.push(new URL(request.url()).hostname);
      }
    });
    await page.goto(SITE);
    await waitReady(page.locator('#picker'));
    await page.getByRole('radio', { name: 'Google Maps' }).check();
    await page.getByRole('textbox', { name: 'Google Maps API key' }).fill(KEY);
    await page.getByRole('button', { name: 'Load Google Maps' }).click();
    await expect.poll(() => page.locator('#picker').getAttribute('provider')).toBe('google');
    await waitReady(page.locator('#picker'));
    expect(await page.evaluate((key) => localStorage.getItem(key), KEY_STORE)).toBe(KEY);
    expect(await context.cookies()).toEqual([]);
    expect(new Set(carriers)).toEqual(new Set(['maps.googleapis.com']));
    expect(page.url()).not.toContain(KEY);
  });

  test('ten rapid toggles never show two engine containers', async ({ page }) => {
    await page.addInitScript(([store]) => localStorage.setItem(store, 'TEST_KEY_toggle'), [
      KEY_STORE,
    ] as const);
    await page.goto(SITE);
    const picker = page.locator('#picker');
    await waitReady(picker);
    await page.evaluate(() => {
      // Per-frame maxima: map containers, Leaflet map panes and Google maps (.gm-style, as Google and the mock render).
      const most = { containers: 0, leaflet: 0, google: 0, engines: 0 };
      Reflect.set(window, '__most', most);
      const host = document.getElementById('picker');
      const sample = (): void => {
        const root = host?.shadowRoot;
        const count = (selector: string): number => root?.querySelectorAll(selector).length ?? 0;
        const leaflet = count('.leaflet-map-pane');
        const google = count('.gm-style');
        most.containers = Math.max(most.containers, count('[part~="map"]'));
        most.leaflet = Math.max(most.leaflet, leaflet);
        most.google = Math.max(most.google, google);
        most.engines = Math.max(most.engines, leaflet + google);
        requestAnimationFrame(sample);
      };
      sample();
    });
    const google = page.getByRole('radio', { name: 'Google Maps' });
    const osm = page.getByRole('radio', { name: 'OpenStreetMap' });
    for (let i = 0; i < 10; i++) await (i % 2 ? osm : google).check();
    // Settle on Google once, so the sampler provably sees a Google map.
    await google.check();
    await expect.poll(() => picker.getAttribute('provider')).toBe('google');
    await waitReady(picker);
    await expect
      .poll(() => picker.evaluate((el) => el.shadowRoot?.querySelectorAll('.gm-style').length))
      .toBe(1);
    expect(await page.evaluate(() => Reflect.get(window, '__most'))).toEqual({
      containers: 1,
      leaflet: 1,
      google: 1,
      engines: 1,
    });
  });

  test('a provider switch leaves no address of the other provider anywhere', async ({ page }) => {
    const GOOGLE_ADDRESS = 'Google address marker, Paris';
    await page.addInitScript(([store]) => localStorage.setItem(store, 'TEST_KEY_switch'), [
      KEY_STORE,
    ] as const);
    await page.goto(SITE);
    const picker = page.locator('#picker');
    await waitReady(picker);
    await page.getByRole('radio', { name: 'Google Maps' }).check();
    await expect.poll(() => picker.getAttribute('provider')).toBe('google');
    await waitReady(picker);
    await expect
      .poll(() =>
        picker.evaluate((el) => Boolean(el.shadowRoot?.querySelector('gmp-place-autocomplete'))),
      )
      .toBe(true);
    await page.evaluate(
      (address) =>
        Reflect.get(window, 'lpGoogleMock').selectPlace({
          lat: 48.8584,
          lng: 2.2945,
          formattedAddress: address,
        }),
      GOOGLE_ADDRESS,
    );
    await expect(page.locator('#address-out')).toHaveText(GOOGLE_ADDRESS);

    await page.getByRole('radio', { name: 'OpenStreetMap' }).check();
    await waitReady(picker);
    await expect(page.locator('#address-out')).not.toContainText(GOOGLE_ADDRESS);
    expect(await visibleText(page, picker)).not.toContain(GOOGLE_ADDRESS);
    // Photon (mock) looks the kept point up again; then back to Google, which must drop it too.
    await expect(page.locator('#address-out')).toContainText('Paris');
    const photonAddress = (await page.locator('#address-out').textContent()) ?? '';
    await page.getByRole('radio', { name: 'Google Maps' }).check();
    await waitReady(picker);
    expect(await visibleText(page, picker)).not.toContain(photonAddress);
  });
});

test('WP6-05 /docs/ refreshes to the home page and is canonical to it', async ({
  page,
  request,
}) => {
  const html = await (await request.get(`${SITE}docs/`)).text();
  expect(html).toMatch(/<meta http-equiv="refresh" content="0; url=\.\.\/"/);
  expect(html).toContain(
    '<link rel="canonical" href="https://cyphercodes.github.io/location-picker/"',
  );
  await page.goto(`${SITE}docs/`);
  await page.waitForURL((url) => url.pathname === SITE);
});

test('WP6-06 robots.txt, sitemap.xml and llms.txt', async ({ request }) => {
  const robots = await (await request.get(`${SITE}robots.txt`)).text();
  expect(robots).toContain('Sitemap: https://cyphercodes.github.io/location-picker/sitemap.xml');
  const sitemap = await (await request.get(`${SITE}sitemap.xml`)).text();
  for (const path of PAGES) {
    expect(sitemap).toContain(`<loc>https://cyphercodes.github.io/location-picker/${path}</loc>`);
  }
  const llms = await request.get(`${SITE}llms.txt`);
  expect(llms.status()).toBe(200);
  expect(llms.headers()['content-type']).toMatch(/^text\/plain/);
  expect(await llms.text()).toMatch(/^# location-picker/);
});

test('WP6-07 the lat/long finder copies decimal, DMS, geo:, Google and OSM links', async ({
  page,
  context,
  browserName,
}) => {
  await recordClipboard(context, browserName);
  await page.goto(`${SITE}?lat=48.8584&lng=2.2945&zoom=17`);
  await waitReady(page.locator('#picker'));
  const expected: Record<string, string> = {
    decimal: '48.8584, 2.2945',
    dms: `48°51'30.2"N 2°17'40.2"E`,
    geo: 'geo:48.8584,2.2945',
    google: 'https://www.google.com/maps/search/?api=1&query=48.8584,2.2945',
    osm: 'https://www.openstreetmap.org/?mlat=48.8584&mlon=2.2945#map=17/48.8584/2.2945',
  };
  for (const [kind, text] of Object.entries(expected)) {
    await page.locator(`button[data-copy="${kind}"]`).click();
    expect(await lastCopied(page, browserName), kind).toBe(text);
  }
  await page.locator('button[data-copy="link"]').click();
  const link = new URL(await lastCopied(page, browserName));
  expect(link.pathname).toBe(SITE);
  expect(Object.fromEntries(link.searchParams)).toEqual({
    lat: '48.8584',
    lng: '2.2945',
    zoom: '17',
  });
});

test.describe('WP6-08 compatibility page', () => {
  test('renders compat.json only: one row per result', async ({ page }) => {
    const report = compatFixture();
    await page.route('**/_site/compat/compat.json', (route) =>
      route.fulfill({ body: JSON.stringify(report), contentType: 'application/json' }),
    );
    await page.goto(`${SITE}compat/`);
    // The per-result table is built when its section is first opened.
    await expect(page.locator('#compat-results')).toHaveCount(0);
    await page.locator('.compat-details summary').click();
    await expect(page.locator('#compat-results tbody tr')).toHaveCount(report.results.length);
    await expect(page.locator('#compat-matrix tbody tr')).toHaveCount(report.scenarios.length);
    await expect(page.locator('#generated')).toContainText(
      'Real iOS/Android hardware (emulation only)',
    );
  });

  test('without compat.json it says no results are published', async ({ page }) => {
    await page.route('**/_site/compat/compat.json', (route) =>
      route.fulfill({ status: 404, body: '' }),
    );
    await page.goto(`${SITE}compat/`);
    await expect(page.locator('#compat-status')).toContainText('No results are published yet');
  });

  test('no browser or version claims in the site HTML outside the generated section', () => {
    const claims =
      /\b(chrome|chromium|firefox|safari|webkit|edge|opera|samsung internet|ios|android)\s*v?\d|\b(all|every|modern|evergreen|major|supported) browsers\b/i;
    for (const file of htmlFiles('_site')) {
      const html = readFileSync(file, 'utf8').replace(
        /<section id="generated"[\s\S]*?<\/section>/,
        '',
      );
      expect(claims.exec(html)?.[0] ?? null, file).toBeNull();
    }
  });
});

test.describe('WP6-09 layout, themes, RTL and accessibility', () => {
  test('no horizontal scroll at 320 px on any page', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 640 });
    for (const path of PAGES) {
      await page.goto(SITE + path);
      await page.waitForLoadState('load');
      const width = await page.evaluate(() => document.documentElement.scrollWidth);
      expect(width, `${path || '/'} scrollWidth`).toBeLessThanOrEqual(320);
    }
  });

  test('the theme toggle switches the page and the picker to dark', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'light' });
    await page.goto(SITE);
    const picker = page.locator('#picker');
    await waitReady(picker);
    const locate = picker.locator('[part~="locate-button"]');
    expect(luminance(await cssOf(page.locator('body'), 'background-color'))).toBeGreaterThan(0.8);
    await page.locator('#theme-toggle').click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    expect(luminance(await cssOf(page.locator('body'), 'background-color'))).toBeLessThan(0.1);
    expect(luminance(await cssOf(locate, 'background-color'))).toBeLessThan(0.2);
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  });

  test('the system dark scheme applies without the toggle', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.goto(SITE);
    expect(luminance(await cssOf(page.locator('body'), 'background-color'))).toBeLessThan(0.1);
  });

  test('the RTL toggle mirrors the picker controls', async ({ page }) => {
    await page.goto(SITE);
    const picker = page.locator('#picker');
    await waitReady(picker);
    const side = async (): Promise<'start' | 'end'> => {
      const map = await picker.locator('[part~="map"]').boundingBox();
      const button = await picker.locator('[part~="locate-button"]').boundingBox();
      if (!map || !button) throw new Error('no boxes');
      return button.x + button.width / 2 > map.x + map.width / 2 ? 'end' : 'start';
    };
    expect(await side()).toBe('end');
    await page.getByLabel('Right-to-left').check();
    await expect(page.locator('#finder')).toHaveAttribute('dir', 'rtl');
    await expect.poll(side).toBe('start');
  });

  for (const path of PAGES) {
    test(`axe: no serious or critical violations on /${path}`, async ({ page }) => {
      await page.goto(SITE + path);
      if (await page.locator('location-picker').count())
        await waitReady(page.locator('location-picker').first());
      expect(await seriousAxeViolations(page)).toEqual([]);
    });
  }
});

test.describe('WP6-10 the embed generator output passes the html snippet runner', () => {
  const configs: Record<string, (page: Page) => Promise<void>> = {
    default: async () => {},
    'form, separate fields, address': async (page) => {
      await page.getByLabel('Separate latitude and longitude').check();
      await page.getByLabel('Address field name (optional)').fill('address');
      await page.getByLabel(/Include a complete/).check();
      await page.getByLabel('Form action URL').fill('/echo');
    },
    'form, hidden inputs, start view, language': async (page) => {
      await page.getByLabel(/Hidden inputs/).check();
      await page
        .getByLabel('Start the map at (optional)')
        .fill('https://www.google.com/maps/@48.8584,2.2945,16z');
      await page.getByLabel('Language of search results').selectOption('de');
      await page.getByLabel(/Include a complete/).check();
      await page.getByLabel('Form action URL').fill('/echo');
    },
  };

  for (const [name, configure] of Object.entries(configs)) {
    test(name, async ({ page, baseURL }) => {
      await page.goto(`${SITE}embed/`);
      await configure(page);
      const code = page.locator('#snippet-code');
      await expect(code).toContainText('https://cdn.jsdelivr.net/npm/location-picker@3');
      const snippet = await code.evaluate(
        (element) => (element as HTMLElement).dataset.snippet ?? '',
      );
      expect(snippet).toBe(await code.textContent());
      await runHtmlSnippet(page, baseURL ?? '/', name, snippet);
    });
  }

  test('the live preview runs the snippet against the local build', async ({ page, context }) => {
    const hosts = trackHosts(context);
    await page.goto(`${SITE}embed/`);
    const frame = page.frameLocator('#preview');
    const picker = frame.locator('location-picker');
    await waitReady(picker);
    expectOnlyHosts(hosts);
  });
});

/** The §12.7 html pass condition (as e2e/docs.spec.ts): ready, no errors, and a form that submits after a pan. */
async function runHtmlSnippet(
  page: Page,
  baseURL: string,
  id: string,
  code: string,
): Promise<void> {
  // The docs:test runner's own page builder (an ES module; this spec is compiled as CommonJS).
  const { pageFor } = await import('../scripts/extract-snippets.mjs');
  const doc = pageFor({ id, file: 'site/embed', line: 1, lang: 'html', code });
  const origin = new URL(baseURL).origin;
  const url = `${origin}/__site_snippet__/${encodeURIComponent(id)}.html`;
  const submissions: string[] = [];
  await page.route('**/*', (route) => {
    const request = route.request();
    if (request.url() === url)
      return route.fulfill({ body: doc.html, contentType: 'text/html; charset=utf-8' });
    if (request.isNavigationRequest() && request.frame() === page.mainFrame()) {
      submissions.push(request.postData() ?? new URL(request.url()).search.slice(1));
      return route.fulfill({
        body: '<!doctype html><title>echo</title>',
        contentType: 'text/html',
      });
    }
    return route.fallback();
  });
  const problems = collectProblems(page);
  await page.goto(url);
  const picker = page.locator('location-picker').first();
  await waitReady(picker, 5000);
  const form = page.locator('form').first();
  if (await form.count()) {
    await pan(page, picker);
    await form.evaluate((element: HTMLFormElement) => element.requestSubmit());
    await expect.poll(() => submissions.length).toBeGreaterThan(0);
    const entries = [...new URLSearchParams(submissions[0])].filter(([, value]) => value !== '');
    expect(entries.length, 'the submission has non-empty entries').toBeGreaterThan(0);
    expect(entries.some(([, value]) => /^-?\d+(\.\d+)?(,-?\d+(\.\d+)?)?$/.test(value))).toBe(true);
  }
  expect(problems).toEqual([]);
}

/** axe-core's serious and critical violations (injected as a script; /pick/'s CSP is bypassed for the test only). */
async function seriousAxeViolations(page: Page): Promise<string[]> {
  await page.evaluate(readFileSync('node_modules/axe-core/axe.min.js', 'utf8'));
  return page.evaluate(async () => {
    interface Violation {
      id: string;
      impact?: string | null;
      nodes: { target: unknown[] }[];
    }
    const axe = Reflect.get(window, 'axe') as { run(): Promise<{ violations: Violation[] }> };
    const { violations } = await axe.run();
    return violations
      .filter((v) => v.impact === 'serious' || v.impact === 'critical')
      .map((v) => `${v.id}: ${v.nodes.map((n) => n.target.map(String).join(' ')).join(', ')}`);
  });
}

/** Text a person could see or copy: the readout, the copy buttons, FormData and the picker's live region. */
async function visibleText(page: Page, picker: Locator): Promise<string> {
  const readout = (await page.locator('#finder .readout').textContent()) ?? '';
  const copies = await page
    .locator('[data-copy]')
    .evaluateAll((buttons) => buttons.map((b) => (b as HTMLElement).dataset.text ?? '').join('\n'));
  const live = await picker.evaluate((el) =>
    [...(el.shadowRoot?.querySelectorAll('[aria-live], [role="status"]') ?? [])]
      .map((n) => n.textContent)
      .join('\n'),
  );
  const form = await page
    .locator('#demo-form')
    .evaluate((f: HTMLFormElement) =>
      [...new FormData(f)].map(([k, v]) => `${k}=${typeof v === 'string' ? v : v.name}`).join('\n'),
    );
  return [readout, copies, live, form].join('\n');
}

function cssOf(locator: Locator, property: string): Promise<string> {
  return locator.evaluate(
    (element, name) => getComputedStyle(element).getPropertyValue(name),
    property,
  );
}

/** Relative luminance of an rgb()/rgba() colour, 0 (black) to 1 (white). */
function luminance(color: string): number {
  const [r = 0, g = 0, b = 0] = (color.match(/[\d.]+/g) ?? []).map(Number);
  const channel = (c: number): number => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

function pngSize(png: Buffer): { width: number; height: number } {
  return { width: png.readUInt32BE(16), height: png.readUInt32BE(20) };
}

function htmlFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return path.includes('vendor') ? [] : htmlFiles(path);
    return entry.name.endsWith('.html') ? [path] : [];
  });
}

/** A small §12.8 report: 2 environments x 3 scenarios, with every status. */
function compatFixture(): CompatReport {
  const env = (browser: 'chromium' | 'webkit', input: 'mouse' | 'touch') => ({
    id: `${browser}-375x667-dpr2-${input}`,
    browser,
    browserVersion: '1.0',
    device: null,
    viewport: { width: 375, height: 667 },
    dpr: 2 as const,
    input,
    emulated: true as const,
  });
  const environments = [env('chromium', 'touch'), env('webkit', 'mouse')];
  const scenarios = ['form-submit', 'hidden-then-shown', 'strict-csp'].map((id) => ({
    id,
    title: `Scenario ${id}`,
    tags: [],
    ownerWp: 'WP2' as const,
  }));
  const statuses = ['pass', 'fail', 'skip'] as const;
  return {
    schema: 1,
    generatedAt: '2026-10-30T00:00:00.000Z',
    packageVersion: '3.0.0',
    commit: '0123456789abcdef0123456789abcdef01234567',
    tools: { playwright: '1.63.0', node: '24.21.0' },
    environments,
    scenarios,
    results: environments.flatMap((e, i) =>
      scenarios.map((s, j) => ({
        env: e.id,
        scenario: s.id,
        status: statuses[(i + j) % 3] ?? 'pass',
        durationMs: 100 + j,
      })),
    ),
    notCovered: ['Real iOS/Android hardware (emulation only)'],
  };
}
