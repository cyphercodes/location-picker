// WP4-20 (and the WP4-10 head variant): <location-picker> on real pages in Chromium, Firefox and WebKit, with the
// built script (dist/location-picker.global.js) or the root ESM entry (dist/index.mjs) and the real Leaflet provider.
// Leaflet, tiles and Photon come from the §12.6 route table. User commits go through the keyboard (the map region is
// focusable; Enter commits the centre, arrows pan and commit), which behaves the same on the touch and mouse projects.
//
// Tags are the compat scenario ids (WP5-10) each test covers.
import type { Frame, Page } from '@playwright/test';
import type * as Leaflet from 'leaflet';
import type { LocationPickerElement } from '../src/element/location-picker-element.js';
import type * as Root from '../src/index.js';
import { lpPort } from './harness/server.js';
import { expect, test } from './harness/fixtures.js';

const BLANK = '/e2e/harness/blank.html';
const FORM = '/e2e/fixtures/element/form.html';
const HEAD = '/e2e/fixtures/element/head.html';
const LOCATE = '/e2e/fixtures/element/locate.html';
const IIFE = '/dist/location-picker.global.js';
const EIFFEL = '48.8584,2.2945';

type Target = Page | Frame;

/** One CustomEvent a <location-picker> dispatched, as the page saw it. */
interface Seen {
  readonly type: string;
  readonly id: string;
  readonly value?: string;
  readonly source?: string;
  readonly code?: string;
}

interface PickerState {
  readonly value: string;
  readonly zoom: number;
  readonly address: string | null;
}

/**
 * Init script (every page and frame, before any page script): records the picker CustomEvents in `__lpSeen` from a
 * capturing window listener, so non-bubbling events (`ready`) are seen too, and `pageshow.persisted` in `__lpPersisted`.
 */
function recordPickerEvents(): void {
  const seen: Seen[] = [];
  Reflect.set(window, '__lpSeen', seen);
  for (const type of ['input', 'change', 'error', 'addresschange', 'ready']) {
    window.addEventListener(
      type,
      (event) => {
        const { target } = event;
        if (!(event instanceof CustomEvent) || !(target instanceof Element)) return;
        if (target.localName != 'location-picker') return;
        const detail: unknown = event.detail;
        const field = (key: string): string | undefined => {
          const value: unknown = detail && typeof detail == 'object' && Reflect.get(detail, key);
          return typeof value == 'string' ? value : undefined;
        };
        seen.push({
          type,
          id: target.id,
          value: field('value'),
          source: field('source'),
          code: field('code'),
        });
      },
      true,
    );
  }
  window.addEventListener('pageshow', (event) =>
    Reflect.set(window, '__lpPersisted', event.persisted),
  );
}

/** Uncaught page errors and console.error lines (except the browser's own `expected` reports); both must stay empty. */
function watchErrors(page: Page, expected?: RegExp): string[] {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() == 'error' && !expected?.test(message.text()))
      errors.push(`console.error: ${message.text()}`);
  });
  return errors;
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(recordPickerEvents);
});

const seen = (target: Target, id?: string): Promise<Seen[]> =>
  target.evaluate((only) => {
    const log: Seen[] = Reflect.get(window, '__lpSeen') ?? [];
    return log.filter((entry) => only === undefined || entry.id == only);
  }, id);

const count = async (target: Target, id: string, type: string): Promise<number> =>
  (await seen(target, id)).filter((entry) => entry.type == type).length;

/** The form's FormData entries, in order. */
const formEntries = (page: Page): Promise<string[][]> =>
  page.evaluate(() => {
    const form = document.querySelector('form');
    if (!form) throw new Error('no form');
    return [...new FormData(form)].map(([key, value]) => [
      key,
      typeof value == 'string' ? value : value.name,
    ]);
  });

const ready = (target: Target, selector: string): Promise<void> =>
  target.locator(selector).evaluate(async (el: LocationPickerElement) => {
    await el.ready;
  });

const stateOf = (target: Target, selector: string): Promise<PickerState> =>
  target.locator(selector).evaluate((el: LocationPickerElement) => ({
    value: el.value,
    zoom: el.zoom,
    address: el.address,
  }));

/** Focuses the picker's map region and presses `key`; resolves after the commit's `change` event. */
async function commit(target: Target, id: string, key = 'ArrowRight'): Promise<string> {
  const before = await count(target, id, 'change');
  await target.locator(`#${id} [part="map"]`).press(key);
  await expect.poll(() => count(target, id, 'change')).toBe(before + 1);
  const change = (await seen(target, id)).findLast((entry) => entry.type == 'change');
  expect(change?.source).toBe('user');
  return change?.value ?? '';
}

/** The picker's map region box, Leaflet's own size, and the pin anchoring (v1: bottom 1 px below the centre). */
const geometry = (target: Target, selector: string) =>
  target.locator(selector).evaluate((el: LocationPickerElement) => {
    const region = el.shadowRoot?.querySelector('[part="map"]');
    const pin = el.shadowRoot?.querySelector('[part="pin"]');
    if (!region || !pin) throw new Error('no map region or pin');
    const map: Leaflet.Map = Reflect.get(Object(el), 'map');
    const box = region.getBoundingClientRect();
    const pinBox = pin.getBoundingClientRect();
    const size = map.getSize();
    return {
      width: Math.round(box.width),
      height: Math.round(box.height),
      leaflet: { width: size.x, height: size.y },
      dx: pinBox.left + pinBox.width / 2 - (box.left + box.width / 2),
      dy: pinBox.bottom - 1 - (box.top + box.height / 2),
    };
  });

/** A blank local page whose body is `body`, followed by the script build or the root ESM entry. */
async function openBlank(page: Page, body: string, entry: 'iife' | 'esm' = 'iife'): Promise<void> {
  await page.goto(BLANK);
  await page.setContent(
    `<!doctype html><html lang="en"><head><meta charset="utf-8">` +
      `<meta name="viewport" content="width=device-width, initial-scale=1">` +
      `<style>body{margin:0}</style></head><body>${body}</body></html>`,
  );
  // setContent goes through document.open(), which drops the window listeners the init script added.
  await page.evaluate(recordPickerEvents);
  if (entry == 'iife') {
    await page.addScriptTag({ url: IIFE });
  } else {
    await page.addScriptTag({
      type: 'module',
      content: `import * as root from '/dist/index.mjs'; window.lpRoot = root;`,
    });
    await page.waitForFunction(() => Reflect.has(window, 'lpRoot'));
  }
}

test.describe('forms', () => {
  test(
    'required blocks the submit and focuses the map; a commit submits every entry',
    {
      tag: ['@form-required', '@form-submit'],
    },
    async ({ page }) => {
      const errors = watchErrors(page);
      await page.goto(FORM);
      await ready(page, '#where');
      await expect(page.locator('#where:invalid')).toHaveCount(1);
      const message = await page
        .locator('#where')
        .evaluate((el: LocationPickerElement) => el.validity.valueMissing && el.validationMessage);
      expect(message).toBe('Please choose a location on the map.');

      await page.locator('#save').click();
      // Interactive validation failed: no navigation, and the UA focused the validation anchor (the map region).
      await expect
        .poll(() =>
          page.evaluate(() => {
            const host = document.activeElement;
            return host?.id == 'where' && host.shadowRoot?.activeElement?.getAttribute('part');
          }),
        )
        .toBe('map');
      expect(new URL(page.url()).pathname).toBe(FORM);

      const value = await commit(page, 'where', 'Enter');
      await expect(page.locator('#where:valid')).toHaveCount(1);
      await expect.poll(async () => (await stateOf(page, '#where')).address).not.toBeNull();
      const { address } = await stateOf(page, '#where');

      await page.locator('#save').click();
      await page.waitForURL((url) => url.pathname == BLANK);
      const [lat, lng] = value.split(',');
      expect([...new URL(page.url()).searchParams]).toEqual([
        ['loc', value],
        ['lat', lat],
        ['lng', lng],
        ['address', address],
      ]);
      expect(errors).toEqual([]);
    },
  );

  test(
    'reset unsets the picker silently and makes it invalid again',
    {
      tag: ['@form-reset'],
    },
    async ({ page }) => {
      const errors = watchErrors(page);
      await page.goto(FORM);
      await ready(page, '#where');
      await commit(page, 'where', 'Enter');
      await commit(page, 'where');
      const before = await seen(page, 'where');

      await page.locator('#reset').click();
      await expect.poll(async () => (await stateOf(page, '#where')).value).toBe('');
      await expect(page.locator('#where:invalid')).toHaveCount(1);
      expect(await formEntries(page)).toEqual([
        ['loc', ''],
        ['lat', ''],
        ['lng', ''],
        ['address', ''],
      ]);
      const after = (await seen(page, 'where')).slice(before.length);
      expect(after.filter((entry) => entry.type == 'input' || entry.type == 'change')).toEqual([]);
      expect(errors).toEqual([]);
    },
  );

  test(
    'back after a submit restores the value, zoom and address with no events',
    {
      tag: ['@form-restore', '@form-submit'],
    },
    async ({ page }, testInfo) => {
      const errors = watchErrors(page);
      await page.goto(FORM);
      await ready(page, '#where');
      await commit(page, 'where', 'Enter');
      const value = await commit(page, 'where');
      await page.locator('#where [part="map"]').press('Equal');
      await expect.poll(async () => (await stateOf(page, '#where')).zoom).toBe(16);
      await expect.poll(async () => (await stateOf(page, '#where')).address).not.toBeNull();
      const picked = await stateOf(page, '#where');
      expect(picked.value).toBe(value);

      await page.locator('#save').click();
      await page.waitForURL((url) => url.pathname == BLANK);
      expect(new URL(page.url()).searchParams.get('loc')).toBe(value);

      await page.goBack();
      await page.waitForURL((url) => url.pathname == FORM);
      await ready(page, '#where');
      await expect.poll(() => stateOf(page, '#where')).toEqual(picked);
      // Chromium under Playwright runs without the back/forward cache: there the page is re-created and the state comes
      // back through formStateRestoreCallback. Elsewhere it may come back from the cache with the page.
      const persisted: unknown = await page.evaluate(() => Reflect.get(window, '__lpPersisted'));
      testInfo.annotations.push({
        type: 'restore',
        description: persisted ? 'back/forward cache' : 'form state restore',
      });
      if (!persisted) {
        const events = (await seen(page, 'where')).map((entry) => entry.type);
        expect(events).not.toContain('input');
        expect(events).not.toContain('change');
      }
      await expect(page.locator('#where:valid')).toHaveCount(1);
      expect(errors).toEqual([]);
    },
  );

  test(
    'head variant: defined before parse, the picker seeds from the server values and reset returns to them',
    {
      tag: ['@form-reset', '@form-submit'],
    },
    async ({ page }) => {
      const errors = watchErrors(page);
      await page.goto(HEAD);
      await ready(page, '#store-location');
      expect((await stateOf(page, '#store-location')).value).toBe(EIFFEL);
      const inputs = () =>
        page.evaluate(() =>
          ['lat', 'lng'].map((id) => {
            const input = document.getElementById(id);
            return input instanceof HTMLInputElement ? input.value : null;
          }),
        );
      // The inputs keep the server's text (no re-formatting) and are not rendered once the element is defined.
      expect(await inputs()).toEqual(['48.8584', '2.2945']);
      await expect(page.locator('#lat')).toBeHidden();
      await expect(page.locator('#lng')).toBeHidden();

      await page.evaluate(() => {
        const record: Record<'host' | 'lat', string[]> = { host: [], lat: [] };
        for (const type of ['input', 'change']) {
          document.getElementById('store-location')?.addEventListener(type, (event) => {
            record.host.push(`${type}:${event instanceof CustomEvent ? 'custom' : 'native'}`);
          });
          document.getElementById('lat')?.addEventListener(type, () => record.lat.push(type));
        }
        Reflect.set(window, '__d18', record);
      });
      const d18 = (): Promise<Record<'host' | 'lat', string[]>> =>
        page.evaluate(() => Reflect.get(window, '__d18'));

      const value = await commit(page, 'store-location');
      expect(value).not.toBe(EIFFEL);
      expect(await inputs()).toEqual(value.split(','));
      const afterPan = await d18();
      // The animated keyboard pan fires `input` while it moves, then one `change`; the host never sees a native one.
      expect(new Set(afterPan.host)).toEqual(new Set(['input:custom', 'change:custom']));
      expect(afterPan.host.at(-1)).toBe('change:custom');
      expect(new Set(afterPan.lat)).toEqual(new Set(['input', 'change']));

      await page.evaluate(() => document.querySelector('form')?.reset());
      await expect.poll(async () => (await stateOf(page, '#store-location')).value).toBe(EIFFEL);
      expect(await inputs()).toEqual(['48.8584', '2.2945']);
      expect(await d18()).toEqual(afterPan);

      await commit(page, 'store-location');
      await expect
        .poll(async () => (await stateOf(page, '#store-location')).address)
        .not.toBeNull();
      const { address } = await stateOf(page, '#store-location');
      const [lat, lng] = await inputs();
      const posted = page.waitForRequest((request) => request.method() == 'POST');
      await page.locator('#save').click();
      const body = new URLSearchParams((await posted).postData() ?? '');
      expect(Object.fromEntries(body)).toEqual({ address, lat, lng });
      expect(errors).toEqual([]);
    },
  );
});

test(
  'inside a modal <dialog>: sized when shown, commits, and Escape closes it',
  {
    tag: ['@dialog', '@hidden-then-shown'],
  },
  async ({ page }) => {
    const errors = watchErrors(page);
    await openBlank(
      page,
      `<dialog id="d"><form method="dialog">` +
        `<location-picker id="p" name="loc" value="${EIFFEL}" zoom="15" style="width:400px;height:300px"></location-picker>` +
        `<button value="ok">OK</button></form></dialog>`,
    );
    await ready(page, '#p');
    expect((await geometry(page, '#p')).width).toBe(0);

    await page.evaluate(() => {
      const dialog = document.getElementById('d');
      if (dialog instanceof HTMLDialogElement) dialog.showModal();
    });
    await expect
      .poll(async () => (await geometry(page, '#p')).leaflet)
      .toEqual({ width: 400, height: 300 });
    const shown = await geometry(page, '#p');
    expect(Math.abs(shown.dx)).toBeLessThanOrEqual(0.5);
    expect(Math.abs(shown.dy)).toBeLessThanOrEqual(0.5);
    expect((await stateOf(page, '#p')).value).toBe(EIFFEL);
    expect(await count(page, 'p', 'change')).toBe(0);

    // The picker is in the top layer: the map, not the backdrop, is under the pointer.
    const hit = await page.evaluate(() => {
      const host = document.getElementById('p');
      const box = host?.getBoundingClientRect();
      return box && document.elementFromPoint(box.left + 20, box.top + box.height / 2)?.id;
    });
    expect(hit).toBe('p');

    const value = await commit(page, 'p');
    expect(value).not.toBe(EIFFEL);
    expect(await formEntries(page)).toEqual([['loc', value]]);

    await page.keyboard.press('Escape');
    await expect
      .poll(() => page.evaluate(() => document.querySelector('dialog')?.open))
      .toBe(false);
    expect(errors).toEqual([]);
  },
);

test(
  'an element moved in the DOM keeps its map: no remount, no second ready, re-fitted',
  {
    tag: ['@moved-element'],
  },
  async ({ page }) => {
    const errors = watchErrors(page);
    await openBlank(
      page,
      `<div id="a" style="width:400px;height:300px">` +
        `<location-picker id="p" value="${EIFFEL}" zoom="15" style="height:100%"></location-picker></div>` +
        `<div id="b" style="width:600px;height:240px"></div>`,
    );
    await ready(page, '#p');
    await page.locator('#p').evaluate((el: LocationPickerElement) => {
      Reflect.set(window, '__lpMap', el.map);
    });
    const sameMap = (): Promise<boolean> =>
      page
        .locator('#p')
        .evaluate((el: LocationPickerElement) => el.map === Reflect.get(window, '__lpMap'));

    // remove + insert in one task
    await page.evaluate(() => {
      const el = document.getElementById('p');
      if (el) document.getElementById('b')?.append(el);
    });
    await expect
      .poll(async () => (await geometry(page, '#p')).leaflet)
      .toEqual({ width: 600, height: 240 });
    const moved = await geometry(page, '#p');
    expect(Math.abs(moved.dx)).toBeLessThanOrEqual(0.5);
    expect(Math.abs(moved.dy)).toBeLessThanOrEqual(0.5);
    expect(await sameMap()).toBe(true);
    expect((await stateOf(page, '#p')).value).toBe(EIFFEL);

    // Element.moveBefore (atomic move, connectedMoveCallback) where the engine has it.
    const atomic = await page.evaluate(() => {
      const el = document.getElementById('p');
      const a = document.getElementById('a');
      if (!el || !a || !('moveBefore' in a) || typeof a.moveBefore != 'function') return false;
      a.moveBefore(el, null);
      return true;
    });
    if (atomic) {
      await expect
        .poll(async () => (await geometry(page, '#p')).leaflet)
        .toEqual({ width: 400, height: 300 });
      expect(await sameMap()).toBe(true);
    }

    expect(await count(page, 'p', 'ready')).toBe(1);
    expect(await count(page, 'p', 'change')).toBe(0);
    const value = await commit(page, 'p');
    expect(value).not.toBe(EIFFEL);
    expect(errors).toEqual([]);
  },
);

test(
  'a cross-origin iframe without allow="geolocation": the locate button fails fast and recovers',
  {
    tag: ['@iframe-without-geolocation'],
  },
  async ({ page }) => {
    // Chromium logs the blocked request itself.
    const errors = watchErrors(page, /^Permissions policy violation: Geolocation/);
    // localhost and 127.0.0.1 are different origins, and both are secure contexts.
    const src = `http://localhost:${lpPort()}${LOCATE}`;
    await openBlank(
      page,
      `<iframe id="f" src="${src}" style="width:600px;height:400px;border:0"></iframe>`,
    );
    const frame = page.frame({ url: (url) => url.pathname == LOCATE });
    if (!frame) throw new Error('no locate frame');
    await frame.waitForLoadState();
    await ready(frame, '#where');

    const context = await frame.evaluate(() => {
      const policy: unknown = Reflect.get(document, 'featurePolicy');
      const allows: unknown = policy && Reflect.get(Object(policy), 'allowsFeature');
      return {
        origin: location.origin,
        secure: isSecureContext,
        // Chromium exposes the effective permissions policy; elsewhere the denial below is the evidence.
        geolocationAllowed: typeof allows == 'function' ? allows.call(policy, 'geolocation') : null,
      };
    });
    expect(context.origin).toBe(new URL(src).origin);
    expect(context.secure).toBe(true);
    expect(context.geolocationAllowed ?? false).toBe(false);

    const button = frame.locator('#where [part="locate-button"]');
    await expect(button).toBeVisible();
    const started = Date.now();
    await button.click();
    await expect
      .poll(async () => (await seen(frame, 'where')).find((entry) => entry.type == 'error')?.code, {
        timeout: 8000,
      })
      .toMatch(/^GEOLOCATION_/);
    // Well inside the 10 s PositionOptions timeout: the denial was reported, not waited out.
    expect(Date.now() - started).toBeLessThan(8000);
    await expect(button).not.toHaveAttribute('aria-busy');
    await expect(button).toBeEnabled();
    const hint = await frame
      .locator('#where [part="hint"]')
      .evaluate((node) => node.textContent ?? '');
    expect(hint).not.toBe('');

    // The method channel rejects with the same kind of code and leaves the value alone.
    const rejected = await frame.locator('#where').evaluate((el: LocationPickerElement) =>
      el.locate().then(
        () => 'resolved',
        (error: unknown) => String(Reflect.get(Object(error), 'code')),
      ),
    );
    expect(rejected).toMatch(/^GEOLOCATION_/);
    expect((await stateOf(frame, '#where')).value).toBe(EIFFEL);
    expect(await count(frame, 'where', 'change')).toBe(0);
    expect(errors).toEqual([]);
  },
);

test(
  'multiple pickers on one page are independent and share one engine load',
  {
    tag: ['@multiple-pickers'],
  },
  async ({ page }) => {
    const errors = watchErrors(page);
    const leafletLoads: string[] = [];
    page.on('request', (request) => {
      if (/\/leaflet@1\.9\.4\/dist\/leaflet\.js/.test(request.url()))
        leafletLoads.push(request.url());
    });
    await openBlank(
      page,
      `<form id="f">` +
        `<location-picker id="p1" name="a" value="${EIFFEL}" zoom="15" style="height:200px"></location-picker>` +
        `<location-picker id="p2" lat-name="b_lat" lng-name="b_lng" value="33.8959,35.4784" zoom="14" style="height:200px"></location-picker>` +
        `<location-picker id="p3" name="c" center="34.4367,35.8497" zoom="13" style="height:200px"></location-picker>` +
        `</form>`,
    );
    await Promise.all(['#p1', '#p2', '#p3'].map((selector) => ready(page, selector)));

    const maps = await page.evaluate(() => {
      const all = [...document.querySelectorAll('location-picker')].map((el) =>
        Reflect.get(el, 'map'),
      );
      return { count: all.length, distinct: new Set(all).size };
    });
    expect(maps).toEqual({ count: 3, distinct: 3 });

    const moved = await commit(page, 'p2');
    const [bLat, bLng] = moved.split(',');
    expect(await formEntries(page)).toEqual([
      ['a', EIFFEL],
      ['b_lat', bLat],
      ['b_lng', bLng],
      ['c', ''],
    ]);
    expect(await count(page, 'p1', 'change')).toBe(0);
    expect(await count(page, 'p3', 'change')).toBe(0);

    const picked = await commit(page, 'p3', 'Enter');
    expect((await formEntries(page)).at(-1)).toEqual(['c', picked]);
    expect((await stateOf(page, '#p1')).value).toBe(EIFFEL);
    expect((await stateOf(page, '#p2')).value).toBe(moved);
    for (const id of ['p1', 'p2', 'p3']) expect(await count(page, id, 'ready')).toBe(1);
    expect(leafletLoads).toHaveLength(1);
    expect(errors).toEqual([]);
  },
);

test(
  'SPA: elements and class pickers destroyed and re-created leave nothing behind',
  {
    tag: ['@destroy-recreate'],
  },
  async ({ page }) => {
    const errors = watchErrors(page);
    await openBlank(page, `<main id="app"></main><div id="m" style="height:200px"></div>`, 'esm');

    const cycles = await page.evaluate(async () => {
      const app = document.getElementById('app');
      if (!app) throw new Error('no #app');
      const results: { map: boolean; tornDown: boolean }[] = [];
      for (let round = 0; round < 4; round++) {
        // What a framework does on a route change: create, mount, and later drop the node.
        const el = document.createElement('location-picker');
        el.id = 'spa';
        el.setAttribute('value', '48.8584,2.2945');
        el.style.height = '200px';
        app.replaceChildren(el);
        await el.ready;
        const map = !!el.map;
        el.remove();
        await new Promise((resolve) => setTimeout(resolve));
        results.push({ map, tornDown: !el.shadowRoot?.querySelector('.lp-base') });
      }
      return results;
    });
    expect(cycles).toEqual(Array.from({ length: 4 }, () => ({ map: true, tornDown: true })));
    expect(await count(page, 'spa', 'ready')).toBe(4);

    const classes = await page.evaluate(async () => {
      const root: typeof Root = Reflect.get(window, 'lpRoot');
      const target = document.getElementById('m');
      if (!target) throw new Error('no #m');
      for (let round = 0; round < 3; round++) {
        const picker = new root.LocationPicker(target, { value: '48.8584,2.2945' });
        await picker.ready;
        picker.destroy();
      }
      const last = new root.LocationPicker(target, { value: '48.8584,2.2945' });
      await last.ready;
      return {
        overlays: target.querySelectorAll('.lp-base').length,
        maps: target.querySelectorAll('.leaflet-container').length,
      };
    });
    expect(classes).toEqual({ overlays: 1, maps: 1 });

    // The last element still works.
    await page.evaluate(() => {
      const el = document.createElement('location-picker');
      el.id = 'last';
      el.setAttribute('value', '48.8584,2.2945');
      el.setAttribute('zoom', '15');
      el.style.height = '200px';
      document.getElementById('app')?.replaceChildren(el);
    });
    await ready(page, '#last');
    expect(await commit(page, 'last')).not.toBe(EIFFEL);
    expect(errors).toEqual([]);
  },
);
