// Doc snippet pages (CONTRACT §12.7, §13 WP5-11): every html, js, blade and django block of the README, llms.txt,
// SKILL.md and docs/*.md, loaded by real navigation (page.route + page.goto, never setContent) under the §12.6 routes.
// Pass: no pageerror and no console.error; every <location-picker> reaches :state(ready) within 5 s; a <form> submits
// non-empty entries after a simulated pan. Template blocks also seed from their bound inputs and post lat/lng.
//
// `npm run docs:test` extracts the blocks (scripts/extract-snippets.mjs) and passes the manifest in LP_DOCTEST.
// Without it this file registers no tests, so `npm run test:e2e` does not run the doc pages.
import { readFileSync } from 'node:fs';
import type { Locator, Page } from '@playwright/test';
import { expect, test } from './harness/fixtures.js';

/** One entry of the manifest written by scripts/extract-snippets.mjs (pageFor). */
interface DocPage {
  readonly id: string;
  readonly lang: string;
  readonly html: string;
  /** The value the picker must hold before the pan (seeded from the template's bound inputs). */
  readonly seed?: string;
  /** Entries the submission must carry, non-empty. */
  readonly fields?: readonly string[];
}
interface Submission {
  readonly method: string;
  readonly url: string;
  readonly body: string;
}

const READY_MS = 5000;
const manifestPath = process.env.LP_DOCTEST;
const pages: readonly DocPage[] = manifestPath ? readManifest(manifestPath) : [];

for (const doc of pages) {
  test(doc.id, async ({ page, baseURL }) => {
    const origin = new URL(baseURL ?? '/').origin;
    const url = `${origin}/__doctest__/${encodeURIComponent(doc.id.replaceAll(/[/:]/g, '_'))}.html`;
    const problems: string[] = [];
    page.on('pageerror', (error) => problems.push(`pageerror: ${error.message}`));
    page.on('console', (message) => {
      if (message.type() === 'error') problems.push(`console.error: ${message.text()}`);
    });
    const submissions: Submission[] = [];
    await page.route('**/*', (route) => {
      const request = route.request();
      const target = new URL(request.url());
      if (target.origin !== origin) return route.fallback();
      if (request.url() === url) {
        return route.fulfill({ body: doc.html, contentType: 'text/html; charset=utf-8' });
      }
      if (target.pathname === '/favicon.ico') return route.fulfill({ status: 204 });
      if (request.isNavigationRequest() && request.frame() === page.mainFrame()) {
        // The form-POST echo: every navigation away from the snippet page is a form submission.
        const body = request.postData() ?? target.search.slice(1);
        submissions.push({ method: request.method(), url: request.url(), body });
        return route.fulfill({
          body: '<!doctype html><title>echo</title>',
          contentType: 'text/html',
        });
      }
      return route.fallback();
    });
    const seen = () => (problems.length ? `\n${problems.join('\n')}` : '');

    await page.goto(url);
    const pickers = page.locator('location-picker');
    if ((await pickers.count()) > 0) {
      const defined = await page.evaluate(
        () => customElements.get('location-picker') !== undefined,
      );
      expect(defined, `<location-picker> is not defined after load${seen()}`).toBe(true);
      await expect
        .poll(() => page.evaluate(notReady), {
          timeout: READY_MS,
          message: `every <location-picker> reaches :state(ready) within ${READY_MS} ms${seen()}`,
        })
        .toEqual([]);
    }

    if (doc.seed !== undefined) {
      expect(await valueOf(pickers.first()), `seeded from the bound inputs${seen()}`).toBe(
        doc.seed,
      );
    }

    const form = page.locator('form').first();
    if ((await form.count()) > 0) {
      const picker = form.locator('location-picker').first();
      if ((await picker.count()) > 0) await pan(page, picker, seen);
      const validity = await form.evaluate((element: HTMLFormElement) =>
        // Native controls and form-associated custom elements alike: checkValidity() and validationMessage.
        [...element.elements]
          .filter((control) => {
            const check: unknown = Reflect.get(control, 'checkValidity');
            return typeof check === 'function' && Reflect.apply(check, control, []) === false;
          })
          .map(
            (control) =>
              `${control.localName}: ${String(Reflect.get(control, 'validationMessage'))}`,
          ),
      );
      expect(validity, `the form is valid after the pan${seen()}`).toEqual([]);
      await form.evaluate((element: HTMLFormElement) => element.requestSubmit());
      await expect
        .poll(() => submissions.length, { message: `the form submits${seen()}` })
        .toBeGreaterThan(0);
      const entries = new URLSearchParams(submissions[0]?.body ?? '');
      const filled = [...entries].filter(([, value]) => value !== '');
      expect(
        filled.length,
        `the submission has non-empty entries: ${entries.toString()}`,
      ).toBeGreaterThan(0);
      for (const field of doc.fields ?? []) {
        expect(
          entries.get(field) ?? '',
          `the echo receives ${field}: ${entries.toString()}`,
        ).toMatch(/^-?\d+(\.\d+)?$/);
      }
    }

    expect(problems, 'no pageerror and no console.error').toEqual([]);
  });
}

function readManifest(path: string): DocPage[] {
  const manifest: unknown = JSON.parse(readFileSync(path, 'utf8'));
  if (typeof manifest !== 'object' || manifest === null || !('pages' in manifest)) {
    throw new Error(`LP_DOCTEST=${path} is not a docs:test manifest`);
  }
  if (!Array.isArray(manifest.pages)) throw new Error(`${path}: pages is not an array`);
  return manifest.pages;
}

/** Pickers (by index and id) that have not reached :state(ready). */
function notReady(): string[] {
  return [...document.querySelectorAll('location-picker')]
    .map((element, index) => ({
      element,
      label: `#${index}${element.id ? ` (id=${element.id})` : ''}`,
    }))
    .filter(({ element }) => !element.matches(':state(ready)'))
    .map(({ label }) => label);
}

function valueOf(picker: Locator): Promise<string> {
  return picker.evaluate((element) => String(Reflect.get(element, 'value')));
}

/**
 * A simulated pan: a real mouse drag of 100 px across the map (A8: a gesture under 1 px is not a pan), then, if the
 * engine did not commit, the arrow keys on the focused map. Resolves once the value changed.
 */
async function pan(page: Page, picker: Locator, seen: () => string): Promise<void> {
  const before = await valueOf(picker);
  const map = picker.locator('[part~="map"]');
  const box = (await map.count()) > 0 ? await map.boundingBox() : await picker.boundingBox();
  expect(box, `the picker has a box to drag${seen()}`).not.toBeNull();
  if (!box) return;
  const start = { x: box.x + box.width / 2 + 30, y: box.y + box.height / 2 + 30 };
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(start.x - 80, start.y - 60, { steps: 10 });
  await page.mouse.up();
  const changed = () => valueOf(picker).then((value) => value !== before && value !== '');
  try {
    await expect.poll(changed, { timeout: 2000 }).toBe(true);
  } catch {
    await map.focus();
    await page.keyboard.press('ArrowRight');
    await expect
      .poll(changed, {
        timeout: 2000,
        message: `a pan (drag or arrow key) commits a value${seen()}`,
      })
      .toBe(true);
  }
}
