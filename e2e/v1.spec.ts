// The frozen v1 file (dist/location-picker.min.js) on real pages in Chromium, Firefox and WebKit, over the classic
// Google Maps stub: the 2018 gh-pages example, an OpenWebRX-style settings page, and pages that also load the v3 IIFE.
import { existsSync, readFileSync } from 'node:fs';
import type { Page } from '@playwright/test';
import type { LocationPicker } from '../src/core.js';
import type { GoogleStub, V1Constructor, V1Picker } from '../test/compat/v1-harness.js';
import { expect, test } from './harness/fixtures.js';

const GH_PAGES = '/e2e/fixtures/v1/gh-pages-2018.html';
const OPENWEBRX = '/e2e/fixtures/v1/openwebrx-style.html';
const BLANK = '/e2e/harness/blank.html';
const STUB = '/e2e/fixtures/v1/google-classic-stub.js';
const V1 = '/dist/location-picker.min.js';
const IIFE = '/dist/location-picker.global.js';

/** Opens a blank local page whose <head> loads `scripts` in order, as plain <script src> tags do. */
async function openWithScripts(page: Page, scripts: readonly string[]): Promise<void> {
  await page.goto(BLANK);
  const tags = scripts.map((src) => `<script src="${src}"></script>`).join('');
  await page.setContent(`<!doctype html><html><head>${tags}</head><body></body></html>`);
}

/** Collects uncaught page errors and counts geolocation requests (answered with nothing). */
async function watchPage(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.addInitScript(() => {
    let calls = 0;
    navigator.geolocation.getCurrentPosition = () => {
      calls += 1;
    };
    Object.defineProperty(window, '__geolocationCalls', { get: () => calls });
  });
  return {
    errors,
    geolocationCalls: (): Promise<number> =>
      page.evaluate(() => Reflect.get(window, '__geolocationCalls')),
  };
}

test('WP1-06: the 2018 gh-pages example works unchanged @v1-page', async ({ page }) => {
  const { errors, geolocationCalls } = await watchPage(page);
  await page.goto(GH_PAGES);

  // The page registers its idle listener on the line after the constructor, so lp.map must already exist.
  const created = await page.evaluate(() => {
    const lp: V1Picker = Reflect.get(window, 'lp');
    const stub: GoogleStub = Reflect.get(window, 'lpGoogleStub');
    return {
      sameMap: stub.stats.mapInstances.length === 1 && stub.stats.mapInstances[0] === lp.map,
      idleListeners: stub.listenerCount(lp.map, 'idle'),
      zoom: lp.map.getZoom(),
    };
  });
  expect(created).toEqual({ sameMap: true, idleListeners: 1, zoom: 15 });

  // The first idle, once the map has settled, reports the initial position; so does the button.
  const montreal = 'The chosen location is 45.5017,-73.5673';
  await expect(page.locator('#onIdlePositionView')).toHaveText(montreal);
  await page.locator('#confirmPosition').click();
  await expect(page.locator('#onClickPositionView')).toHaveText(montreal);

  const panned = await page.evaluate(() => {
    const lp: V1Picker = Reflect.get(window, 'lp');
    const stub: GoogleStub = Reflect.get(window, 'lpGoogleStub');
    stub.simulateUserPan(lp.map, { lat: 48.8584, lng: 2.2945 });
    return {
      idleText: document.getElementById('onIdlePositionView')?.textContent,
      position: lp.getMarkerPosition(),
    };
  });
  expect(panned).toEqual({
    idleText: 'The chosen location is 48.8584,2.2945',
    position: { lat: 48.8584, lng: 2.2945 },
  });
  expect(await geolocationCalls()).toBe(0);
  expect(errors).toEqual([]);
});

test('WP1-07: an OpenWebRX-style page passes its HTMLElement and gets wrapped positions @v1-page', async ({
  page,
}) => {
  const { errors, geolocationCalls } = await watchPage(page);
  await page.goto(OPENWEBRX);
  await page.waitForFunction(() => Reflect.has(window, '__lp'));

  const mounted = await page.evaluate(() => {
    const lp: V1Picker = Reflect.get(window, '__lp');
    const host = document.querySelector('.map-input');
    return {
      sameElement: lp.element === host,
      children: host?.children.length,
      pinInMapChild: host?.querySelector('.centerMarker')?.parentElement === host?.children[0],
      zoom: lp.map.getZoom(),
      position: lp.getMarkerPosition(),
    };
  });
  // lon "0" is a real position (#11), so there is no geolocation prompt either.
  expect(mounted).toEqual({
    sameElement: true,
    children: 1,
    pinInMapChild: true,
    zoom: 7,
    position: { lat: 51.4779, lng: 0 },
  });

  // Panning east across the antimeridian: Google reports lng 511.2093; v1 wraps it before it reaches the form (#12).
  await page.evaluate(() => {
    const lp: V1Picker = Reflect.get(window, '__lp');
    const stub: GoogleStub = Reflect.get(window, 'lpGoogleStub');
    stub.simulateUserPan(lp.map, { lat: -33.8688, lng: 511.2093 });
  });
  await expect(page.locator('#receiver_gps-lat')).toHaveValue('-33.8688');
  const lon = Number(await page.locator('#receiver_gps-lon').inputValue());
  expect(lon).toBeCloseTo(151.2093, 9);
  expect(await geolocationCalls()).toBe(0);
  expect(errors).toEqual([]);
});

test('WP1-08: the pin is the v1 28x44 footprint, anchored at the map centre @v1-page', async ({
  page,
}) => {
  await page.goto(GH_PAGES);
  const pin = await page.evaluate(() => {
    const map = document.getElementById('map');
    const marker = map?.querySelector('.centerMarker');
    const sheet = document.querySelector('style[data-location-picker="v1"]');
    const rule = sheet instanceof HTMLStyleElement ? sheet.sheet?.cssRules[0] : undefined;
    if (!map || !(marker instanceof HTMLElement) || !(rule instanceof CSSStyleRule)) {
      throw new Error('v1 pin or stylesheet missing');
    }
    const style = getComputedStyle(marker);
    const mapBox = map.getBoundingClientRect();
    const pinBox = marker.getBoundingClientRect();
    return {
      width: style.width,
      height: style.height,
      marginLeft: style.marginLeft,
      marginTop: style.marginTop,
      position: style.position,
      declaredTopLeft: [rule.style.top, rule.style.left],
      svgPin: style.backgroundImage.startsWith('url("data:image/svg+xml'),
      hostClass: map.classList.contains('location-picker'),
      v1Styles: document.querySelectorAll('style[data-location-picker="v1"]').length,
      // top/left compute to pixels; at 50% the box sits at the centre plus the -14/-43 margins.
      dx: pinBox.left - (mapBox.left + mapBox.width / 2),
      dy: pinBox.top - (mapBox.top + mapBox.height / 2),
    };
  });
  const { dx, dy, ...rest } = pin;
  expect(rest).toEqual({
    width: '28px',
    height: '44px',
    marginLeft: '-14px',
    marginTop: '-43px',
    position: 'absolute',
    declaredTopLeft: ['50%', '50%'],
    svgPin: true,
    hostClass: true,
    v1Styles: 1,
  });
  expect(Math.abs(dx + 14)).toBeLessThanOrEqual(0.5);
  expect(Math.abs(dy + 43)).toBeLessThanOrEqual(0.5);
});

test.describe('WP1-09/WP1-11: geolocation granted @v1-page', () => {
  test.use({
    geolocation: { latitude: 35.6762, longitude: 139.6503 },
    permissions: ['geolocation'],
  });

  test('without lat/lng the picker centres on the position', async ({ page }) => {
    await page.goto(GH_PAGES);
    await page.evaluate(() => {
      const div = document.createElement('div');
      div.style.cssText = 'width:300px;height:200px';
      document.body.append(div);
      const LocationPickerV1: V1Constructor = Reflect.get(window, 'locationPicker');
      Reflect.set(window, 'lp2', new LocationPickerV1(div));
    });
    await expect
      .poll(() => page.evaluate(() => Reflect.get(window, 'lp2').getMarkerPosition()))
      .toEqual({ lat: 35.6762, lng: 139.6503 });
  });
});

test('WP1-11: a denied position is logged like v1 and the picker stays on Tripoli @v1-page', async ({
  page,
}) => {
  const logs: string[] = [];
  page.on('console', (message) => logs.push(message.text()));
  // Denial is stubbed: each engine handles an unanswered permission prompt differently.
  await page.addInitScript(() => {
    navigator.geolocation.getCurrentPosition = (_success, failure) =>
      failure?.({
        code: 1,
        message: 'User denied Geolocation',
        PERMISSION_DENIED: 1,
        POSITION_UNAVAILABLE: 2,
        TIMEOUT: 3,
      });
  });
  await page.goto(GH_PAGES);
  const position = await page.evaluate(() => {
    const div = document.createElement('div');
    div.style.cssText = 'width:300px;height:200px';
    document.body.append(div);
    const LocationPickerV1: V1Constructor = Reflect.get(window, 'locationPicker');
    return new LocationPickerV1(div).getMarkerPosition();
  });
  expect(position).toEqual({ lat: 34.4346, lng: 35.8362 });
  expect(logs).toContain('Could not determine your location...');
});

test('WP1-13: the v1 file defines only window.locationPicker and makes no requests @v1-page', async ({
  page,
  baseURL,
}) => {
  const requests: string[] = [];
  page.on('request', (request) => requests.push(request.url()));
  await openWithScripts(page, [STUB, V1]);

  const state = await page.evaluate(async () => {
    const div = document.createElement('div');
    div.style.cssText = 'width:320px;height:240px';
    document.body.append(div);
    const LocationPickerV1: V1Constructor = Reflect.get(window, 'locationPicker');
    const lp = new LocationPickerV1(div, { setCurrentPosition: false });
    // Let the pin (an inline SVG data: URL) paint.
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    return {
      v1: typeof LocationPickerV1,
      mounted: lp.element === div,
      v3: typeof Reflect.get(window, 'LocationPicker'),
      element: typeof customElements.get('location-picker'),
    };
  });
  expect(state).toEqual({ v1: 'function', mounted: true, v3: 'undefined', element: 'undefined' });
  // Only the page, the stub and the v1 file. Unique URLs: WebKit's preload scanner may fetch a written <script> twice.
  // data: URLs are not network requests (engines differ in whether they report them).
  const urls = new Set(requests.filter((url) => !url.startsWith('data:')));
  expect([...urls]).toEqual([BLANK, STUB, V1].map((path) => new URL(path, baseURL).href));
});

test('WP1-17: loading the v1 file twice on one page does not throw @v1-page', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await openWithScripts(page, [STUB, V1, V1]);

  const state = await page.evaluate(() => {
    const div = document.createElement('div');
    div.style.cssText = 'width:320px;height:240px';
    document.body.append(div);
    const LocationPickerV1: V1Constructor = Reflect.get(window, 'locationPicker');
    const lp = new LocationPickerV1(div, { lat: 1, lng: 2 });
    return {
      v1Styles: document.querySelectorAll('style[data-location-picker="v1"]').length,
      pins: div.querySelectorAll('.centerMarker').length,
      position: lp.getMarkerPosition(),
    };
  });
  expect(state).toEqual({ v1Styles: 2, pins: 1, position: { lat: 1, lng: 2 } });
  expect(errors).toEqual([]);
});

const iife = existsSync(`.${IIFE}`) ? readFileSync(`.${IIFE}`, 'utf8') : '';
const iifeBuilt = iife.includes('customElements') && iife.includes('LocationPicker');

test('WP1-17: v1 and the v3 IIFE share a page; the v3 class pin keeps its own geometry @v1-page', async ({
  page,
}) => {
  test.skip(
    !iifeBuilt,
    'dist/location-picker.global.js is still a placeholder (the v3 IIFE is WP4)',
  );
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  // v1 first AND last, so its `.location-picker .centerMarker` rule comes both before and after v3's styles.
  await openWithScripts(page, [STUB, V1, IIFE, V1]);

  const globals = await page.evaluate(() => {
    const div = document.createElement('div');
    div.style.cssText = 'width:320px;height:240px';
    document.body.append(div);
    const LocationPickerV1: V1Constructor = Reflect.get(window, 'locationPicker');
    const lp = new LocationPickerV1(div, { lat: 1, lng: 2 });
    return {
      v1: lp.getMarkerPosition(),
      v1Pin: div.querySelectorAll('.centerMarker').length,
      v3: typeof Reflect.get(window, 'LocationPicker'),
    };
  });
  expect(globals).toEqual({ v1: { lat: 1, lng: 2 }, v1Pin: 1, v3: 'function' });

  const v3 = await page.evaluate(async () => {
    const LocationPickerV3: typeof LocationPicker = Reflect.get(window, 'LocationPicker');
    const target = document.createElement('div');
    target.style.cssText = 'width:600px;height:400px';
    document.body.append(target);

    function currentPin(): HTMLElement {
      const pin = target.querySelector('.lp-pin');
      if (!(pin instanceof HTMLElement)) throw new Error('no .lp-pin');
      return pin;
    }
    /** v1's anchoring: horizontal centre on the map centre, box bottom 1px below it (-43px for a 44px pin). */
    function geometry(pin: HTMLElement) {
      const map = target.getBoundingClientRect();
      const box = pin.getBoundingClientRect();
      return {
        width: box.width,
        height: box.height,
        dx: box.left + box.width / 2 - (map.left + map.width / 2),
        dy: box.bottom - 1 - (map.top + map.height / 2),
      };
    }

    const picker = new LocationPickerV3(target, { value: '48.8584,2.2945' });
    await picker.ready;
    const value = picker.value;
    const pin = currentPin();
    const base = geometry(pin);
    const centerMarker = pin.classList.contains('centerMarker');
    const backgroundImage = getComputedStyle(pin).backgroundImage;

    pin.style.pointerEvents = 'auto';
    const box = pin.getBoundingClientRect();
    const hit = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
    const paintsAboveMap = hit !== null && pin.contains(hit);
    pin.style.pointerEvents = '';

    target.style.setProperty('--lp-pin-size', '88px');
    const large = geometry(pin);
    target.style.removeProperty('--lp-pin-size');

    const userRule = document.createElement('style');
    userRule.textContent = '.location-picker .centerMarker{display:none}';
    document.head.append(userRule);
    const hiddenByUserRule = getComputedStyle(pin).display === 'none';
    userRule.remove();
    picker.destroy();

    const marker = document.createElement('span');
    marker.style.cssText = 'display:block;width:20px;height:30px';
    const custom = new LocationPickerV3(target, { value: '48.8584,2.2945', marker });
    await custom.ready;
    const customBackground = getComputedStyle(currentPin()).backgroundImage;
    custom.destroy();

    return {
      value,
      centerMarker,
      base,
      large,
      backgroundImage,
      paintsAboveMap,
      hiddenByUserRule,
      customBackground,
    };
  });

  expect(v3).toMatchObject({
    value: '48.8584,2.2945',
    centerMarker: true,
    base: { width: 28, height: 44 },
    large: { width: 56, height: 88 },
    backgroundImage: 'none',
    paintsAboveMap: true,
    hiddenByUserRule: true,
    customBackground: 'none',
  });
  for (const { dx, dy } of [v3.base, v3.large]) {
    expect(Math.abs(dx)).toBeLessThanOrEqual(0.5);
    expect(Math.abs(dy)).toBeLessThanOrEqual(0.5);
  }
  expect(errors).toEqual([]);
});
