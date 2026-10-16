// WP2-24 (plus WP2-23 and the cross-engine half of WP2-15): the built core (dist/core.mjs) on real Leaflet 1.9.4 in
// Chromium, Firefox and WebKit across the e2e matrix.
//
// src/leaflet.ts (WP3) is still a placeholder, so the pages pass a test-local Leaflet adapter that follows §4.2's event
// mapping. Leaflet and its CSS come from the routed jsDelivr URLs (SRI), loaded through the core's MountContext loaders;
// tiles come from the routed OSM URL. Touch projects drive touch through synthetic pointer + touch events (Playwright
// has no touch-drag API); mouse projects use real mouse and wheel input. Keyboard runs everywhere.
import type { Browser, Page } from '@playwright/test';
import type * as Leaflet from 'leaflet';
import type * as Core from '../src/core.js';
import type { LocateMode, LocationPicker, MountContext } from '../src/core.js';
import { parseLatLng } from '../src/utils.js';
import { installRoutes, takeBlockedRequests } from '../test/fixtures/routes.js';
import { expect, test } from './harness/fixtures.js';

const BLANK = '/e2e/harness/blank.html';
const URLS = {
  js: 'https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.js',
  jsSri: 'sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=',
  css: 'https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.css',
  cssSri: 'sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=',
};
const EIFFEL = '48.8584,2.2945';

type Urls = typeof URLS;
type Input = 'mouse' | 'touch';
interface Point {
  readonly x: number;
  readonly y: number;
}
/** The options the tests pass into the page (the adapter is added there). */
interface PageOptions {
  readonly value?: string;
  readonly center?: string;
  readonly zoom?: number;
  readonly locate?: LocateMode;
}
/** One public event as the page saw it. */
interface Logged {
  readonly type: string;
  readonly value?: string;
  readonly lat?: number;
  readonly lng?: number;
  readonly source?: string;
  readonly zoom?: number;
  readonly code?: string;
}
/** window.lp: pickers by target id, their event logs, and the mount contexts the adapter received. */
interface Harness {
  /** The test-local Leaflet adapter (works with any library copy: it only talks to its MountContext). */
  readonly adapter: Core.ProviderAdapter<Leaflet.Map>;
  create(id: string, options?: PageOptions): Promise<void>;
  readonly pickers: Record<string, LocationPicker<Leaflet.Map>>;
  readonly logs: Record<string, Logged[]>;
  context(id: string): MountContext | undefined;
}

/**
 * Runs in the page. A minimal Leaflet adapter wired as CONTRACT §4.2 specifies (move -> move, moveend -> moveEnd +
 * interactionEnd, capture-phase pointerdown/wheel/keydown -> interactionStart, pointerup/pointercancel ->
 * interactionEnd); WP3's leafletProvider() replaces it once src/leaflet.ts lands.
 */
function installHarness(urls: Urls): void {
  const { core }: { core: typeof Core } = Reflect.get(window, 'lpModules');
  const contexts = new WeakMap<HTMLElement, MountContext>();
  const panKeys = /^(Arrow(Up|Down|Left|Right)|\+|-|=)$/;

  const adapter: Core.ProviderAdapter<Leaflet.Map> = {
    name: 'leaflet-e2e',
    async load(ctx) {
      void ctx.loadStylesheet(urls.css, urls.cssSri);
      await ctx.loadScript(urls.js, urls.jsSri);
    },
    mount(ctx) {
      contexts.set(ctx.container, ctx);
      const L: typeof Leaflet = Reflect.get(window, 'L');
      const { container, view, events, signal } = ctx;
      const map = new L.Map(container, {
        center: [view.center.lat, view.center.lng],
        zoom: view.zoom,
        scrollWheelZoom: 'center',
        doubleClickZoom: 'center',
        touchZoom: 'center',
        boxZoom: false,
        keyboard: true,
      });
      new L.TileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; OpenStreetMap contributors',
      }).addTo(map);
      const centre = (): { lat: number; lng: number } => {
        const { lat, lng } = map.getCenter();
        return { lat, lng };
      };
      map.on('move', () => events.move(centre()));
      map.on('moveend', () => {
        events.moveEnd(centre(), map.getZoom());
        events.interactionEnd();
      });
      const capture = { capture: true, signal };
      const start = (): void => events.interactionStart();
      container.addEventListener('pointerdown', start, capture);
      container.addEventListener('wheel', start, capture);
      container.addEventListener(
        'keydown',
        (event) => {
          if (panKeys.test(event.key)) start();
        },
        capture,
      );
      container.addEventListener('pointerup', () => events.interactionEnd(), capture);
      container.addEventListener('pointercancel', () => events.interactionEnd(), capture);
      return {
        map,
        getCenter: centre,
        getZoom: () => map.getZoom(),
        setView: (center, zoom, { animate }) =>
          map.setView([center.lat, center.lng], zoom ?? map.getZoom(), { animate }),
        setZoom: (zoom) => map.setZoom(zoom),
        setInteractive(mode) {
          for (const handler of [map.dragging, map.keyboard])
            handler[mode == 'full' ? 'enable' : 'disable']();
          for (const handler of [map.scrollWheelZoom, map.touchZoom, map.doubleClickZoom])
            handler[mode == 'none' ? 'disable' : 'enable']();
        },
        resize: () => map.invalidateSize(false),
        destroy: () => map.remove(),
      };
    },
  };

  const pickers: Harness['pickers'] = {};
  const logs: Harness['logs'] = {};
  const harness: Harness = {
    adapter,
    pickers,
    logs,
    async create(id, options = {}) {
      const target = document.getElementById(id);
      if (!target) throw new Error(`no #${id}`);
      const picker = new core.LocationPicker<Leaflet.Map>(target, {
        provider: adapter,
        ...options,
      });
      const log: Logged[] = (logs[id] = []);
      for (const type of ['input', 'change', 'error'] as const) {
        picker.addEventListener(type, ({ detail }) => {
          if (detail instanceof Error) log.push({ type, code: Reflect.get(detail, 'code') });
          else {
            const { value, lat, lng, source, zoom } = detail;
            log.push({ type, value, lat, lng, source, zoom });
          }
        });
      }
      pickers[id] = picker;
      await picker.ready;
    },
    context: (id) => {
      const picker = pickers[id];
      return picker && contexts.get(picker.container);
    },
  };
  Reflect.set(window, 'lp', harness);
}

/** Opens a page with the given body, the built core and utils as ES modules, and window.lp. */
async function openPage(page: Page, body: string, css = ''): Promise<void> {
  await page.goto(BLANK);
  await page.setContent(
    `<!doctype html><html lang="en"><head><meta charset="utf-8">` +
      `<meta name="viewport" content="width=device-width, initial-scale=1">` +
      `<style>body{margin:0}.map{height:280px}${css}</style></head><body>${body}</body></html>`,
  );
  await page.addScriptTag({
    type: 'module',
    content: `import * as core from '/dist/core.mjs'; window.lpModules = { core };`,
  });
  await page.waitForFunction(() => Reflect.has(window, 'lpModules'));
  await page.evaluate(installHarness, URLS);
}

async function create(page: Page, id: string, options: PageOptions = {}): Promise<void> {
  await page.evaluate(
    ([target, init]) => {
      const lp: Harness = Reflect.get(window, 'lp');
      return lp.create(target, init);
    },
    [id, options] as const,
  );
}

const logOf = (page: Page, id: string): Promise<Logged[]> =>
  page.evaluate((target) => {
    const lp: Harness = Reflect.get(window, 'lp');
    return lp.logs[target] ?? [];
  }, id);

const count = async (page: Page, id: string, type: string): Promise<number> =>
  (await logOf(page, id)).filter((entry) => entry.type == type).length;

const pickerState = (page: Page, id: string) =>
  page.evaluate((target) => {
    const lp: Harness = Reflect.get(window, 'lp');
    const picker = lp.pickers[target];
    if (!picker) throw new Error(`no picker on #${target}`);
    const { lat, lng } = picker.map?.getCenter() ?? { lat: NaN, lng: NaN };
    return {
      value: picker.value,
      zoom: picker.zoom,
      engineZoom: picker.map?.getZoom(),
      centre: { lat, lng },
      states: [...(picker.container.parentElement?.classList ?? [])].filter((name) =>
        name.startsWith('lp-is-'),
      ),
      animating: !!picker.container.querySelector('.leaflet-zoom-anim, .leaflet-pan-anim'),
    };
  }, id);

const nextFrame = (page: Page): Promise<void> =>
  page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));

async function mapCentre(page: Page, id: string): Promise<Point> {
  const box = await page.locator(`#${id} .lp-map`).boundingBox();
  if (!box) throw new Error(`#${id} .lp-map has no box`);
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

const inputOf = (hasTouch: boolean | undefined): Input => (hasTouch ? 'touch' : 'mouse');

/**
 * A pointer gesture with one finger (or the mouse) per `starts` entry, each moved by `delta[i]` in `steps` steps, one
 * animation frame apart. Touch dispatches what a touch screen produces: pointer events, then touch events.
 */
async function gesture(
  page: Page,
  id: string,
  input: Input,
  starts: readonly Point[],
  deltas: readonly Point[],
  options: { readonly steps?: number; readonly beforeRelease?: () => Promise<void> } = {},
): Promise<void> {
  const steps = options.steps ?? 8;
  const at = (step: number): Point[] =>
    starts.map((start, i) => ({
      x: start.x + ((deltas[i]?.x ?? 0) * step) / steps,
      y: start.y + ((deltas[i]?.y ?? 0) * step) / steps,
    }));
  if (input == 'mouse') {
    const [start] = at(0);
    if (!start || starts.length != 1) throw new Error('the mouse has one pointer');
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    for (let step = 1; step <= steps; step++) {
      const [point] = at(step);
      // oxlint-disable-next-line no-await-in-loop -- one move per animation frame, in order
      await page.mouse.move(point?.x ?? 0, point?.y ?? 0);
      // oxlint-disable-next-line no-await-in-loop
      await nextFrame(page);
    }
    await options.beforeRelease?.();
    await page.mouse.up();
    return;
  }
  const map = page.locator(`#${id} .lp-map`);
  const touches = (points: readonly Point[]) =>
    points.map((p, identifier) => ({ identifier, clientX: p.x, clientY: p.y }));
  const pointers = async (type: string, points: readonly Point[]): Promise<void> => {
    for (const [i, p] of points.entries()) {
      // oxlint-disable-next-line no-await-in-loop -- one finger after the other, as a touch screen reports them
      await map.dispatchEvent(type, {
        pointerId: 10 + i,
        pointerType: 'touch',
        isPrimary: i == 0,
        clientX: p.x,
        clientY: p.y,
        buttons: type == 'pointerup' ? 0 : 1,
      });
    }
  };
  const first = at(0);
  await pointers('pointerdown', first);
  await map.dispatchEvent('touchstart', {
    touches: touches(first),
    targetTouches: touches(first),
    changedTouches: touches(first),
  });
  let last = first;
  for (let step = 1; step <= steps; step++) {
    last = at(step);
    // oxlint-disable-next-line no-await-in-loop -- one move per animation frame, in order
    await pointers('pointermove', last);
    // oxlint-disable-next-line no-await-in-loop
    await map.dispatchEvent('touchmove', {
      touches: touches(last),
      targetTouches: touches(last),
      changedTouches: touches(last),
    });
    // oxlint-disable-next-line no-await-in-loop
    await nextFrame(page);
  }
  await options.beforeRelease?.();
  await pointers('pointerup', last);
  await map.dispatchEvent('touchend', {
    touches: [],
    targetTouches: [],
    changedTouches: touches(last),
  });
}

/** A one-pointer drag of the map by `delta` from its centre. */
async function drag(page: Page, id: string, input: Input, delta: Point): Promise<void> {
  await gesture(page, id, input, [await mapCentre(page, id)], [delta]);
}

/** Waits until the camera settled: no pan/zoom animation and no gesture in progress. */
async function settled(page: Page, id: string): Promise<void> {
  await expect
    .poll(async () => {
      const state = await pickerState(page, id);
      return !state.animating && !state.states.includes('lp-is-dragging');
    })
    .toBe(true);
  await nextFrame(page);
  await nextFrame(page);
}

/** §3.3/§3.5 value semantics of one user commit, plus the §12.10 detail invariant for every event. */
function expectUserCommit(log: readonly Logged[], from: string): Logged {
  const changes = log.filter((entry) => entry.type == 'change');
  expect(changes, 'exactly one change').toHaveLength(1);
  const change = changes[0];
  if (!change) throw new Error('no change');
  expect(change.source).toBe('user');
  expect(change.value).not.toBe(from);
  expect(log.at(-1), 'the change is the last event').toEqual(change);
  const inputs = log.slice(0, -1);
  expect(inputs.every((entry) => entry.type == 'input' && entry.source == 'user')).toBe(true);
  expect(inputs.length, 'live inputs, then the final input').toBeGreaterThanOrEqual(2);
  expect(inputs.at(-1)?.value, 'the final input carries the committed value').toBe(change.value);
  expectConsistent(log);
  return change;
}

/** §12.10: parseLatLng(detail.value) gives back the detail's lat and lng. */
function expectConsistent(log: readonly Logged[]): void {
  for (const entry of log) {
    expect(parseLatLng(entry.value)).toMatchObject({ lat: entry.lat, lng: entry.lng });
  }
}

test.describe('WP2-24 value semantics on real Leaflet', () => {
  test('a drag gives live inputs, a final input and one user change at the settled centre', async ({
    page,
  }, testInfo) => {
    const input = inputOf(testInfo.project.use.hasTouch);
    await openPage(page, '<div id="a" class="map"></div>');
    await create(page, 'a', { value: EIFFEL, zoom: 15 });
    expect(await page.locator('head script[src*="leaflet@1.9.4"]').count()).toBe(1);
    expect(await page.locator('head link[href*="leaflet@1.9.4"]').count()).toBe(1);

    await drag(page, 'a', input, { x: -120, y: 60 });
    await expect.poll(() => count(page, 'a', 'change')).toBe(1);
    await settled(page, 'a');

    const change = expectUserCommit(await logOf(page, 'a'), EIFFEL);
    // Dragging the map left and down moves the centre east and north.
    expect(change.lng).toBeGreaterThan(2.2945);
    expect(change.lat).toBeGreaterThan(48.8584);
    const state = await pickerState(page, 'a');
    expect(state.value).toBe(change.value);
    expect(parseLatLng(state.value)).toEqual(
      parseLatLng(`${state.centre.lat.toFixed(6)},${state.centre.lng.toFixed(6)}`),
    );
    expect(state.states).not.toContain('lp-is-dragging');
  });

  test('zoom gestures (wheel or pinch) never change the value', async ({ page }, testInfo) => {
    const input = inputOf(testInfo.project.use.hasTouch);
    await openPage(page, '<div id="a" class="map"></div>');
    await create(page, 'a', { value: EIFFEL, zoom: 12 });
    const centre = await mapCentre(page, 'a');

    if (input == 'mouse') {
      await page.mouse.move(centre.x, centre.y);
      await page.mouse.wheel(0, -240);
    } else {
      const fingers = [
        { x: centre.x - 30, y: centre.y },
        { x: centre.x + 30, y: centre.y },
      ];
      await gesture(page, 'a', 'touch', fingers, [
        { x: -60, y: 0 },
        { x: 60, y: 0 },
      ]);
    }
    await expect.poll(async () => (await pickerState(page, 'a')).zoom).toBeGreaterThan(12);
    await settled(page, 'a');

    const state = await pickerState(page, 'a');
    expect(state.zoom).toBe(state.engineZoom);
    expect(state.value).toBe(EIFFEL);
    expect(await logOf(page, 'a')).toEqual([]);
  });

  test('keyboard only: Tab, Enter commits the centre, arrows commit, +/- only zoom', async ({
    page,
  }) => {
    await openPage(page, '<div id="a" class="map"></div>');
    await create(page, 'a', { center: EIFFEL, zoom: 15 });
    expect((await pickerState(page, 'a')).states).toContain('lp-is-unset');
    await expect(page.locator('#a .lp-confirm')).toBeVisible();

    await page.keyboard.press('Tab');
    expect(await page.evaluate(() => document.activeElement?.classList.contains('lp-map'))).toBe(
      true,
    );

    await page.keyboard.press('Enter');
    expect(await logOf(page, 'a')).toEqual([
      { type: 'input', value: EIFFEL, lat: 48.8584, lng: 2.2945, source: 'user', zoom: 15 },
      { type: 'change', value: EIFFEL, lat: 48.8584, lng: 2.2945, source: 'user', zoom: 15 },
    ]);
    await expect(page.locator('#a .lp-confirm')).toBeHidden();
    expect((await pickerState(page, 'a')).states).not.toContain('lp-is-unset');

    await page.keyboard.press('ArrowRight');
    await expect.poll(() => count(page, 'a', 'change')).toBe(2);
    await settled(page, 'a');
    const afterArrow = (await logOf(page, 'a')).slice(2);
    const change = afterArrow.at(-1);
    expect(change).toMatchObject({ type: 'change', source: 'user' });
    // A pan east; Leaflet snaps the centre to whole pixels (1 px is about 0.00003° here).
    expect(change?.lng).toBeGreaterThan(2.2945 + 0.001);
    expect(Math.abs((change?.lat ?? 0) - 48.8584)).toBeLessThan(0.00003);
    expect(afterArrow.at(-2)).toMatchObject({ type: 'input', value: change?.value });
    expectConsistent(afterArrow);

    const before = (await logOf(page, 'a')).length;
    await page.keyboard.press('Equal');
    await expect.poll(async () => (await pickerState(page, 'a')).zoom).toBe(16);
    await page.keyboard.press('Minus');
    await expect.poll(async () => (await pickerState(page, 'a')).zoom).toBe(15);
    await settled(page, 'a');
    expect(await logOf(page, 'a')).toHaveLength(before);
    expect((await pickerState(page, 'a')).value).toBe(change?.value);
  });

  test('the pin lifts while dragging, except under prefers-reduced-motion (WP2-15)', async ({
    page,
  }, testInfo) => {
    const input = inputOf(testInfo.project.use.hasTouch);
    const pinTransform = (): Promise<string> =>
      page.locator('#a .lp-pin').evaluate((pin) => getComputedStyle(pin).transform);
    await openPage(page, '<div id="a" class="map"></div>');
    await create(page, 'a', { value: EIFFEL, zoom: 15 });

    const during: string[] = [];
    const record = async (): Promise<void> => {
      during.push(await pinTransform());
    };
    await gesture(page, 'a', input, [await mapCentre(page, 'a')], [{ x: 80, y: 0 }], {
      beforeRelease: record,
    });
    await settled(page, 'a');
    // A transition that is already running finishes even after the preference changes: let the drop end first.
    await expect
      .poll(() => page.locator('#a .lp-pin').evaluate((pin) => pin.getAnimations().length))
      .toBe(0);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await gesture(page, 'a', input, [await mapCentre(page, 'a')], [{ x: 80, y: 0 }], {
      beforeRelease: record,
    });
    await settled(page, 'a');

    expect(during[0]).not.toBe('none');
    expect(during[1]).toBe('none');
    expect(await pinTransform()).toBe('none');
  });
});

test.describe('WP2-24 layout, theming and isolation', () => {
  test('RTL puts the controls at inline-end and keeps the pin on the centre', async ({ page }) => {
    await openPage(page, '<div id="a" class="map" dir="rtl"></div><div id="b" class="map"></div>');
    await create(page, 'a', { value: EIFFEL, locate: 'button' });
    await create(page, 'b', { value: EIFFEL, locate: 'button' });

    const boxes = await page.evaluate(() =>
      ['a', 'b'].map((id) => {
        const box = (selector: string): DOMRect => {
          const element = document.querySelector(`#${id} ${selector}`);
          if (!element) throw new Error(`no #${id} ${selector}`);
          return element.getBoundingClientRect();
        };
        return { map: box('.lp-map'), controls: box('.lp-controls'), pin: box('.lp-pin') };
      }),
    );
    const [rtl, ltr] = boxes;
    if (!rtl || !ltr) throw new Error('two pickers');
    expect(rtl.controls.width).toBeGreaterThanOrEqual(44);
    expect(rtl.controls.left - rtl.map.left).toBeCloseTo(10, 0);
    expect(ltr.map.right - ltr.controls.right).toBeCloseTo(10, 0);
    for (const { map, pin } of boxes) {
      expect(pin.width).toBeCloseTo(28, 1);
      expect(pin.left + pin.width / 2 - (map.left + map.width / 2)).toBeCloseTo(0, 0);
    }
  });

  test('dark mode tokens follow color-scheme; --lp-tile-filter reaches the tile pane', async ({
    page,
  }) => {
    await openPage(
      page,
      '<div id="a" class="map"></div><div id="b" class="map"></div>',
      ':root{color-scheme:light dark}#b{color-scheme:dark;--lp-tile-filter:invert(1)}',
    );
    await create(page, 'a', { value: EIFFEL, locate: 'button' });
    await create(page, 'b', { value: EIFFEL, locate: 'button' });
    const colours = (id: string) =>
      page.locator(`#${id} .lp-locate`).evaluate((button) => {
        const style = getComputedStyle(button);
        return { background: style.backgroundColor, color: style.color };
      });
    const light = { background: 'rgb(255, 255, 255)', color: 'rgb(31, 41, 55)' };
    const dark = { background: 'rgb(31, 31, 31)', color: 'rgb(243, 244, 246)' };

    await page.emulateMedia({ colorScheme: 'light' });
    expect(await colours('a')).toEqual(light);
    expect(await colours('b')).toEqual(dark);
    await page.emulateMedia({ colorScheme: 'dark' });
    expect(await colours('a')).toEqual(dark);

    expect(
      await page.locator('#b .leaflet-tile-pane').evaluate((pane) => getComputedStyle(pane).filter),
    ).toBe('invert(1)');
    const schemes = await page.evaluate(() => {
      const lp: Harness = Reflect.get(window, 'lp');
      return [lp.context('a')?.colorScheme, lp.context('b')?.colorScheme];
    });
    expect(schemes).toEqual(['auto', 'dark']);
  });

  test('two pickers on one page stay independent', async ({ page }, testInfo) => {
    const input = inputOf(testInfo.project.use.hasTouch);
    await openPage(page, '<div id="a" class="map"></div><div id="b" class="map"></div>');
    await create(page, 'a', { value: EIFFEL, zoom: 15 });
    await create(page, 'b', { value: '-33.8688,151.2093', zoom: 12 });
    const before = await pickerState(page, 'b');

    await drag(page, 'a', input, { x: 100, y: 0 });
    await expect.poll(() => count(page, 'a', 'change')).toBe(1);
    await settled(page, 'a');
    expect(await logOf(page, 'b')).toEqual([]);
    // Leaflet re-derives an untouched centre from whole pixels after a resize: compare it within a pixel.
    const { centre, ...after } = await pickerState(page, 'b');
    const { centre: centreBefore, ...rest } = before;
    expect(after).toEqual(rest);
    expect(centre.lat).toBeCloseTo(centreBefore.lat, 3);
    expect(centre.lng).toBeCloseTo(centreBefore.lng, 3);

    const aLog = (await logOf(page, 'a')).length;
    await page.evaluate(() => {
      const lp: Harness = Reflect.get(window, 'lp');
      lp.pickers.b?.setLocation(-33.86, 151.21);
    });
    expect((await logOf(page, 'b')).map(({ type, source }) => [type, source])).toEqual([
      ['input', 'api'],
      ['change', 'api'],
    ]);
    expect(await logOf(page, 'a')).toHaveLength(aLog);
    expect(
      await page.evaluate(() => {
        const lp: Harness = Reflect.get(window, 'lp');
        return lp.pickers.a?.map !== lp.pickers.b?.map;
      }),
    ).toBe(true);
    expect(await page.locator('head script[src*="leaflet@1.9.4"]').count()).toBe(1);
  });

  test('200% page zoom (half the CSS viewport, twice the DPR): pin geometry and a drag commit', async ({
    browser,
  }, testInfo) => {
    const { viewport, deviceScaleFactor = 1, hasTouch } = testInfo.project.use;
    const context = await zoomedContext(browser, {
      width: Math.round((viewport?.width ?? 1280) / 2),
      height: Math.round((viewport?.height ?? 720) / 2),
      deviceScaleFactor: deviceScaleFactor * 2,
      hasTouch: !!hasTouch,
    });
    try {
      const page = await context.newPage();
      await openPage(page, '<div id="a" class="map"></div>', '.map{height:240px}');
      await create(page, 'a', { value: EIFFEL, zoom: 15 });
      const geometry = await page.evaluate(() => {
        const map = document.querySelector('#a .lp-map')?.getBoundingClientRect();
        const pin = document.querySelector('#a .lp-pin')?.getBoundingClientRect();
        if (!map || !pin) throw new Error('no map or pin');
        return {
          width: pin.width,
          height: pin.height,
          dx: pin.left + pin.width / 2 - (map.left + map.width / 2),
          tipDy: pin.top + (pin.height * 43) / 44 - (map.top + map.height / 2),
          dpr: devicePixelRatio,
        };
      });
      expect(geometry.dpr).toBe(deviceScaleFactor * 2);
      expect(geometry.width).toBeCloseTo(28, 1);
      expect(geometry.height).toBeCloseTo(44, 1);
      expect(Math.abs(geometry.dx)).toBeLessThanOrEqual(0.5);
      expect(Math.abs(geometry.tipDy)).toBeLessThanOrEqual(0.5);

      await drag(page, 'a', inputOf(hasTouch), { x: -60, y: 30 });
      await expect.poll(() => count(page, 'a', 'change')).toBe(1);
      await settled(page, 'a');
      expectUserCommit(await logOf(page, 'a'), EIFFEL);
    } finally {
      const blocked = takeBlockedRequests(context);
      await context.close();
      expect(blocked, 'non-local requests').toEqual([]);
    }
  });
});

test.describe('WP2-24 lifecycle', () => {
  test('20 destroy/re-create cycles leave listeners, observers and nodes stable', async ({
    page,
  }) => {
    await page.addInitScript(trackListeners);
    await openPage(page, '<div id="a" class="map"></div>');
    const cycle = (n: number) =>
      page.evaluate(async (i) => {
        const lp: Harness = Reflect.get(window, 'lp');
        await lp.create('a', { value: `48.85${i},2.29${i}`, zoom: 10 + (i % 5) });
        const picker = lp.pickers.a;
        picker?.setLocation(1 + i, 2 + i);
        if (picker) picker.zoom = 12;
        // Half the cycles destroy explicitly; the others leave it to the re-construct guard (WP2-06).
        if (i % 2 == 0) picker?.destroy();
      }, n);
    const snapshot = () =>
      page.evaluate(() => {
        const tracked: () => { listeners: number; observers: number } = Reflect.get(
          window,
          'lpTracked',
        );
        const target = document.getElementById('a');
        return {
          ...tracked(),
          bases: document.querySelectorAll('.lp-base').length,
          leafletMaps: document.querySelectorAll('.leaflet-container').length,
          scripts: document.querySelectorAll('script[src*="leaflet@1.9.4"]').length,
          links: document.querySelectorAll('link[href*="leaflet@1.9.4"]').length,
          sheets: document.adoptedStyleSheets.length,
          targetClass: target?.className,
          targetStyle: target?.getAttribute('style'),
        };
      });
    const destroy = () =>
      page.evaluate(() => {
        const lp: Harness = Reflect.get(window, 'lp');
        lp.pickers.a?.destroy();
      });

    await cycle(1);
    const live = await snapshot();
    await destroy();
    const idle = await snapshot();
    // 20 more cycles; the last one (odd) leaves its picker live, like cycle 1.
    for (let i = 2; i <= 21; i++) await cycle(i); // oxlint-disable-line no-await-in-loop -- sequential cycles
    expect(await snapshot()).toEqual(live);
    await destroy();
    expect(await snapshot()).toEqual(idle);

    expect(live).toMatchObject({ bases: 1, leafletMaps: 1, scripts: 1, links: 1, observers: 1 });
    expect(idle).toMatchObject({ bases: 0, leafletMaps: 0, observers: 0, targetClass: 'map' });
    expect(idle.targetStyle ?? '').toBe('');
  });

  test('WP2-23: the ESM and CJS builds on one page share the store', async ({ page }) => {
    const warnings: string[] = [];
    page.on('console', (message) => {
      if (message.type() == 'warning') warnings.push(message.text());
    });
    await openPage(
      page,
      '<div id="esm" class="map"></div><div id="cjs" class="map"></div><div id="z1"></div><div id="z2"></div>',
    );
    const result = await page.evaluate(async () => {
      // dist/core.cjs through a minimal CommonJS loader: every relative file it (transitively) requires is fetched up
      // front, except the provider entries, which load lazily and are never reached with an adapter object.
      const sources = new Map<string, string>();
      const modules = new Map<string, { exports: object }>();
      const lazy = /\/(leaflet|google|maplibre)\.cjs$/;
      const fetchTree = async (url: string): Promise<void> => {
        if (sources.has(url) || lazy.test(url)) return;
        sources.set(url, '');
        const source = await (await fetch(url)).text();
        sources.set(url, source);
        const required = [...source.matchAll(/require\("(\.\.?\/[^"]+)"\)/g)];
        await Promise.all(required.map(([, path = '']) => fetchTree(new URL(path, url).href)));
      };
      const load = (url: string): object => {
        const known = modules.get(url);
        if (known) return known.exports;
        const source = sources.get(url);
        if (source === undefined) throw new Error(`not available: ${url}`);
        const module = { exports: {} };
        modules.set(url, module);
        const require = (specifier: string): object => load(new URL(specifier, url).href);
        // oxlint-disable-next-line typescript/no-implied-eval -- evaluating the CommonJS build is the point
        new Function('module', 'exports', 'require', source)(module, module.exports, require);
        return module.exports;
      };
      const entry = new URL('/dist/core.cjs', location.href).href;
      await fetchTree(entry);
      load(entry);
      const cjs: typeof Core = Reflect.get(modules.get(entry) ?? {}, 'exports');
      const { core: esm }: { core: typeof Core } = Reflect.get(window, 'lpModules');
      const lp: Harness = Reflect.get(window, 'lp');
      const provider = lp.adapter;
      const pickers = [
        new esm.LocationPicker('esm', { provider, value: '1,2' }),
        new cjs.LocationPicker('cjs', { provider, value: '3,4' }),
        new esm.LocationPicker('z1', { provider }),
        new cjs.LocationPicker('z2', { provider }),
      ];
      await Promise.all(pickers.map((picker) => picker.ready));
      return {
        twoCopies: esm.LocationPicker !== cjs.LocationPicker,
        values: pickers.map((picker) => picker.value),
        scripts: document.querySelectorAll('script[src*="leaflet@1.9.4"]').length,
        links: document.querySelectorAll('link[href*="leaflet@1.9.4"]').length,
        sheets: document.adoptedStyleSheets.length,
      };
    });
    expect(result).toEqual({
      twoCopies: true,
      values: ['1,2', '3,4', '', ''],
      scripts: 1,
      links: 1,
      sheets: 1,
    });
    expect(warnings.filter((text) => text.includes('0 height'))).toHaveLength(1);
  });
});

/**
 * Runs before any page script. Counts live listeners on what outlives a picker (window, document and connected nodes
 * outside any .lp-base: tile images inside the map come and go with tile loading) and the elements being observed.
 */
function trackListeners(): void {
  const ids = new WeakMap<object, number>();
  let next = 0;
  const id = (listener: object): number => {
    const known = ids.get(listener) ?? ++next;
    ids.set(listener, known);
    return known;
  };
  const live = new Map<EventTarget, Set<string>>();
  const keyOf = (type: string, listener: object, options?: boolean | EventListenerOptions) =>
    `${type}|${typeof options == 'boolean' ? options : !!options?.capture}|${id(listener)}`;
  type Method = (...args: never[]) => unknown;
  const proto = EventTarget.prototype;
  const add: Method = Reflect.get(proto, 'addEventListener');
  const remove: Method = Reflect.get(proto, 'removeEventListener');
  proto.addEventListener = function (type, listener, options) {
    Reflect.apply(add, this, [type, listener, options]);
    const signal = typeof options == 'object' ? options.signal : undefined;
    if (!listener || signal?.aborted) return;
    const key = keyOf(type, listener, options);
    const keys = live.get(this) ?? new Set<string>();
    live.set(this, keys.add(key));
    if (signal) Reflect.apply(add, signal, ['abort', () => keys.delete(key), { once: true }]);
  };
  proto.removeEventListener = function (type, listener, options) {
    Reflect.apply(remove, this, [type, listener, options]);
    if (listener) live.get(this)?.delete(keyOf(type, listener, options));
  };
  const observed = new Map<ResizeObserver, Set<Element>>();
  const ro = ResizeObserver.prototype;
  const observe: Method = Reflect.get(ro, 'observe');
  const unobserve: Method = Reflect.get(ro, 'unobserve');
  const disconnect: Method = Reflect.get(ro, 'disconnect');
  ro.observe = function (target, options) {
    Reflect.apply(observe, this, [target, options]);
    observed.set(this, (observed.get(this) ?? new Set<Element>()).add(target));
  };
  ro.unobserve = function (target) {
    Reflect.apply(unobserve, this, [target]);
    observed.get(this)?.delete(target);
  };
  ro.disconnect = function () {
    Reflect.apply(disconnect, this, []);
    observed.delete(this);
  };
  Reflect.set(window, 'lpTracked', () => {
    let listeners = 0;
    for (const [target, keys] of live) {
      const lasting =
        target === window ||
        target === document ||
        (target instanceof Element && target.isConnected && !target.closest('.lp-base'));
      if (lasting) listeners += keys.size;
    }
    let observers = 0;
    for (const targets of observed.values()) observers += targets.size;
    return { listeners, observers };
  });
}

/** A context with the matrix project's engine and the given viewport/DPR, under the same route table. */
async function zoomedContext(
  browser: Browser,
  options: { width: number; height: number; deviceScaleFactor: number; hasTouch: boolean },
) {
  const { width, height, ...rest } = options;
  const context = await browser.newContext({ viewport: { width, height }, ...rest });
  await installRoutes(context);
  return context;
}
