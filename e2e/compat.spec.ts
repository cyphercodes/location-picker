// Compat scenarios that no work-package spec covers yet (WP5-10): the per-environment reference screenshot, geolocation
// granted/denied/timeout/insecure, container resize and orientation change, and the accessibility tree. All of them
// use the script build on a real page (e2e/fixtures/compat/render.html) under the §12.6 route table.
import { readFile } from 'node:fs/promises';
import type { Locator, Page } from '@playwright/test';
import type { LocationPickerElement } from '../src/element/location-picker-element.js';
import { expect, test } from './harness/fixtures.js';
import { SCREENSHOT_ATTACHMENT, scenarios } from './scenarios.js';

const RENDER = '/e2e/fixtures/compat/render.html';
/** Runners start from the repository root (like the route table). */
const AXE = 'node_modules/axe-core/axe.min.js';
const EIFFEL = '48.8584,2.2945';

interface Outcome {
  readonly type: string;
  readonly value?: string;
  readonly source?: string;
  readonly code?: string;
}

/** Page errors and console errors (warnings, which the picker uses for expected failures, are not collected). */
function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`console.error: ${message.text()}`);
  });
  return errors;
}

async function openPicker(page: Page, url = RENDER): Promise<Locator> {
  await page.goto(url);
  const picker = page.locator('#where');
  await picker.evaluate(async (el: LocationPickerElement) => {
    await el.ready;
  });
  return picker;
}

/** Arms a listener in the page; the returned function resolves with the next `change` or `error` event. */
async function nextOutcome(picker: Locator): Promise<() => Promise<Outcome>> {
  await picker.evaluate((el: LocationPickerElement) => {
    const outcome = new Promise((resolve) => {
      const done = (event: Event): void => {
        el.removeEventListener('change', done);
        el.removeEventListener('error', done);
        const detail: unknown = event instanceof CustomEvent ? event.detail : null;
        const field = (key: string): string | undefined => {
          const value: unknown = Reflect.get(Object(detail), key);
          return typeof value === 'string' ? value : undefined;
        };
        resolve({
          type: event.type,
          value: field('value'),
          source: field('source'),
          code: field('code'),
        });
      };
      el.addEventListener('change', done);
      el.addEventListener('error', done);
    });
    Reflect.set(el, '__compatOutcome', outcome);
  });
  return () => picker.evaluate((el): Promise<Outcome> => Reflect.get(el, '__compatOutcome'));
}

test(
  'the default picker renders and reaches ready',
  scenarios('render'),
  async ({ page }, testInfo) => {
    const errors = watchErrors(page);
    const picker = await openPicker(page);
    expect(await picker.evaluate((el: LocationPickerElement) => el.value)).toBe(EIFFEL);
    await expect
      .poll(() => page.locator('#where img.leaflet-tile-loaded').count())
      .toBeGreaterThan(0);
    await expect(page.locator('#where [part="map"]')).toBeVisible();

    const path = testInfo.outputPath('compat.png');
    await page.screenshot({ path });
    await testInfo.attach(SCREENSHOT_ATTACHMENT, { path, contentType: 'image/png' });
    expect(errors).toEqual([]);
  },
);

test.describe('geolocation', () => {
  test(
    'granted: the locate button commits the position',
    scenarios('geolocation-granted'),
    async ({ page, context, baseURL }) => {
      await context.grantPermissions(['geolocation'], { origin: new URL(baseURL ?? '/').origin });
      await context.setGeolocation({ latitude: 48.8606, longitude: 2.3376 });
      const errors = watchErrors(page);
      const picker = await openPicker(page);
      const outcome = await nextOutcome(picker);
      await picker.locator('[part="locate-button"]').click();
      const result = await outcome();
      expect(result).toMatchObject({ type: 'change', source: 'geolocation' });
      const [lat, lng] = (result.value ?? '').split(',').map(Number);
      expect(lat).toBeCloseTo(48.8606, 4);
      expect(lng).toBeCloseTo(2.3376, 4);
      expect(errors).toEqual([]);
    },
  );

  // GeolocationPositionError codes 1 and 3, delivered the way browsers do (plain objects, not Error instances).
  for (const [scenario, code, expected] of [
    ['geolocation-denied', 1, 'GEOLOCATION_DENIED'],
    ['geolocation-timeout', 3, 'GEOLOCATION_TIMEOUT'],
  ] as const) {
    test(
      `${expected}: an error event, the value is kept, nothing hangs`,
      scenarios(scenario),
      async ({ page }) => {
        await page.addInitScript((failure) => {
          const error = {
            code: failure,
            message: 'stubbed',
            PERMISSION_DENIED: 1,
            POSITION_UNAVAILABLE: 2,
            TIMEOUT: 3,
          };
          Object.defineProperty(navigator.geolocation, 'getCurrentPosition', {
            value: (_ok: unknown, fail: (e: unknown) => void) => setTimeout(() => fail(error), 50),
          });
        }, code);
        const errors = watchErrors(page);
        const picker = await openPicker(page);
        const outcome = await nextOutcome(picker);
        await picker.locator('[part="locate-button"]').click();
        expect(await outcome()).toMatchObject({ type: 'error', code: expected });
        expect(await picker.evaluate((el: LocationPickerElement) => el.value)).toBe(EIFFEL);
        await expect(picker.locator('[part="locate-button"]')).toBeEnabled();
        expect(errors).toEqual([]);
      },
    );
  }

  test(
    'insecure context: no locate button, and locate() rejects GEOLOCATION_UNSUPPORTED',
    scenarios('geolocation-insecure'),
    async ({ page }) => {
      // An http origin that is not localhost is not a secure context; it serves the same page and the local dist.
      const origin = 'http://lp-insecure.test';
      await page.route(`${origin}/**`, async (route) => {
        const path = new URL(route.request().url()).pathname;
        const file = path === '/' ? RENDER.slice(1) : path.slice(1);
        if (!/^(e2e\/fixtures\/compat\/render\.html|dist\/[\w./-]+)$/.test(file)) {
          return route.fulfill({ status: 404, body: '' });
        }
        return route.fulfill({
          body: await readFile(file),
          contentType: file.endsWith('.html') ? 'text/html' : 'text/javascript',
        });
      });
      const errors = watchErrors(page);
      const picker = await openPicker(page, `${origin}/`);
      expect(await page.evaluate(() => window.isSecureContext)).toBe(false);
      await expect(picker.locator('[part="locate-button"]')).toBeHidden();
      const code = await picker.evaluate((el: LocationPickerElement) =>
        el.locate().then(
          () => 'resolved',
          (error: unknown) => String(Reflect.get(Object(error), 'code')),
        ),
      );
      expect(code).toBe('GEOLOCATION_UNSUPPORTED');
      expect(errors).toEqual([]);
    },
  );
});

test(
  'container resize and orientation change keep the value and the map interactive',
  scenarios('resize-orientation'),
  async ({ page }) => {
    const errors = watchErrors(page);
    const picker = await openPicker(page);
    const map = picker.locator('[part="map"]');
    const engineSize = (): Promise<{ x: number; y: number }> =>
      picker.evaluate((el: LocationPickerElement) => {
        const engine = el.map as { getSize(): { x: number; y: number } };
        const { x, y } = engine.getSize();
        return { x, y };
      });
    const fits = async (): Promise<boolean> => {
      const box = await map.boundingBox();
      const size = await engineSize();
      return !!box && Math.abs(box.width - size.x) <= 1 && Math.abs(box.height - size.y) <= 1;
    };

    await picker.evaluate((el: LocationPickerElement) => {
      el.style.height = '220px';
    });
    await expect.poll(async () => (await engineSize()).y).toBe(220);

    const viewport = page.viewportSize();
    if (!viewport) throw new Error('no viewport');
    await page.setViewportSize({ width: viewport.height, height: viewport.width });
    await expect.poll(fits).toBe(true);
    expect(await picker.evaluate((el: LocationPickerElement) => el.value)).toBe(EIFFEL);

    const outcome = await nextOutcome(picker);
    await map.press('ArrowRight');
    expect(await outcome()).toMatchObject({ type: 'change', source: 'user' });
    expect(errors).toEqual([]);
  },
);

test(
  'accessibility tree: no axe violations; the map region and the locate button are named',
  scenarios('a11y-tree'),
  async ({ page }) => {
    const picker = await openPicker(page);
    await page.addScriptTag({ path: AXE });
    const violations = await page.evaluate(async () => {
      const axe: {
        run(context: Element): Promise<{ violations: { id: string; help: string }[] }>;
      } = Reflect.get(window, 'axe');
      const target = document.getElementById('where');
      if (!target) throw new Error('no #where');
      const { violations } = await axe.run(target);
      return violations.map((violation) => `${violation.id}: ${violation.help}`);
    });
    expect(violations).toEqual([]);
    await expect(picker.locator('[part="map"]')).toHaveRole('application');
    await expect(picker.locator('[part="map"]')).toHaveAccessibleName(/.+/);
    await expect(picker.locator('[part="locate-button"]')).toHaveAccessibleName(/.+/);
  },
);
