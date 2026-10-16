// The frozen v1 file's behaviour in jsdom over the classic Google stub (WP1-07..13). Layout-dependent checks (pin
// geometry) and the real pages run in e2e/v1.spec.ts.
import { runInThisContext } from 'node:vm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  artifact,
  evaluateV1,
  installGoogleStub,
  stubLatLngClass,
  type GoogleStub,
  type V1Constructor,
} from './v1-harness.js';

const TRIPOLI = { lat: 34.4346, lng: 35.8362 };

let stub: GoogleStub;
let LocationPickerV1: V1Constructor;
let target: HTMLElement;

beforeEach(() => {
  stub = installGoogleStub();
  LocationPickerV1 = evaluateV1();
  target = document.createElement('div');
  target.id = 'map';
  document.body.append(target);
});

afterEach(() => {
  stub.uninstall();
  Reflect.deleteProperty(navigator, 'geolocation');
  document.head.replaceChildren();
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

type PositionCallback = (position: { coords: { latitude: number; longitude: number } }) => void;
type ErrorCallback = (error: { code: number; message: string }) => void;

/** jsdom has no navigator.geolocation; this installs one whose getCurrentPosition is a spy. */
function stubGeolocation(answer?: (success: PositionCallback, failure: ErrorCallback) => void) {
  const getCurrentPosition = vi.fn<(success: PositionCallback, failure: ErrorCallback) => void>(
    (success, failure) => answer?.(success, failure),
  );
  Object.defineProperty(navigator, 'geolocation', {
    value: { getCurrentPosition },
    configurable: true,
  });
  return getCurrentPosition;
}

function centreOf(picker: { map: { getCenter(): { lat(): number; lng(): number } } }) {
  const centre = picker.map.getCenter();
  return { lat: centre.lat(), lng: centre.lng() };
}

describe('WP1-07: target element', () => {
  it('keeps an HTMLElement as lp.element and puts the pin inside the map child Google renders', () => {
    const lp = new LocationPickerV1(target, { lat: 1, lng: 2 });
    expect(lp.element).toBe(target);
    const pin = target.querySelector('.centerMarker');
    expect(target.children).toHaveLength(1);
    expect(pin?.parentElement).toBe(target.children[0]);
  });

  it('resolves an id string', () => {
    const lp = new LocationPickerV1('map', { lat: 1, lng: 2 });
    expect(lp.element).toBe(target);
    expect(lp.map.getDiv()).toBe(target);
  });
});

describe('WP1-08: injected stylesheet and host class', () => {
  it('injects exactly one v1 <style> per script evaluation with the 28x44 pin rule', () => {
    expect(document.querySelectorAll('style[data-location-picker="v1"]')).toHaveLength(1);
    evaluateV1();
    expect(document.querySelectorAll('style[data-location-picker="v1"]')).toHaveLength(2);

    const style = document.querySelector('style[data-location-picker="v1"]');
    const rule = style instanceof HTMLStyleElement ? style.sheet?.cssRules[0] : undefined;
    expect(rule).toBeInstanceOf(CSSStyleRule);
    if (!(rule instanceof CSSStyleRule)) return;
    expect(rule.selectorText).toBe('.location-picker .centerMarker');
    expect({
      position: rule.style.position,
      top: rule.style.top,
      left: rule.style.left,
      width: rule.style.width,
      height: rule.style.height,
      marginLeft: rule.style.marginLeft,
      marginTop: rule.style.marginTop,
    }).toEqual({
      position: 'absolute',
      top: '50%',
      left: '50%',
      width: '28px',
      height: '44px',
      marginLeft: '-14px',
      marginTop: '-43px',
    });
  });

  it('adds the location-picker class to the host once, keeping existing classes', () => {
    target.className = 'card';
    for (let i = 0; i < 2; i++) {
      expect(new LocationPickerV1(target, { lat: 1, lng: 2 }).element).toBe(target);
    }
    expect(target.className).toBe('card location-picker');
  });
});

describe('WP1-09: defaults', () => {
  it('without lat/lng: Tripoli, zoom 15, one geolocation request', () => {
    const getCurrentPosition = stubGeolocation();
    const lp = new LocationPickerV1(target);
    expect(centreOf(lp)).toEqual(TRIPOLI);
    expect(lp.map.getZoom()).toBe(15);
    expect(getCurrentPosition).toHaveBeenCalledOnce();
  });

  it('{lat: 0, lng: 0}: centre (0, 0) and no geolocation (#11)', () => {
    const getCurrentPosition = stubGeolocation();
    const lp = new LocationPickerV1(target, { lat: 0, lng: 0 });
    expect(centreOf(lp)).toEqual({ lat: 0, lng: 0 });
    expect(getCurrentPosition).not.toHaveBeenCalled();
  });

  it('{lat: 10}: centre (10, Tripoli lng) and no geolocation', () => {
    const getCurrentPosition = stubGeolocation();
    const lp = new LocationPickerV1(target, { lat: 10 });
    expect(centreOf(lp)).toEqual({ lat: 10, lng: TRIPOLI.lng });
    expect(getCurrentPosition).not.toHaveBeenCalled();
  });

  it('{setCurrentPosition: false}: Tripoli and no geolocation', () => {
    const getCurrentPosition = stubGeolocation();
    const lp = new LocationPickerV1(target, { setCurrentPosition: false });
    expect(centreOf(lp)).toEqual(TRIPOLI);
    expect(getCurrentPosition).not.toHaveBeenCalled();
  });

  it('NaN lat/lng (parseFloat of empty inputs, as OpenWebRX passes them) count as not given', () => {
    const getCurrentPosition = stubGeolocation();
    const lp = new LocationPickerV1(target, { lat: Number.NaN, lng: Number.NaN });
    expect(centreOf(lp)).toEqual(TRIPOLI);
    expect(getCurrentPosition).toHaveBeenCalledOnce();
  });

  it('3rd argument {zoom: 3}: zoom 3, other map options passed through', () => {
    const lp = new LocationPickerV1(
      target,
      { lat: 1, lng: 2 },
      { zoom: 3, streetViewControl: false },
    );
    expect(lp.map.getZoom()).toBe(3);
    expect(stub.stats.mapOptions[0]).toMatchObject({ zoom: 3, streetViewControl: false });
  });
});

describe('WP1-10: getMarkerPosition()', () => {
  it('wraps an unwrapped longitude into [-180, 180) (#12)', () => {
    const lp = new LocationPickerV1(target, { lat: 1, lng: 2 });
    for (const lng of [52283.36, -52283.36, 180.5, -180.5, 540]) {
      lp.setLocation(10, lng);
      const wrapped = lp.getMarkerPosition().lng;
      expect(wrapped).toBeGreaterThanOrEqual(-180);
      expect(wrapped).toBeLessThan(180);
      const turns = (wrapped - lng) / 360;
      expect(turns).toBeCloseTo(Math.round(turns), 9);
    }
    lp.setLocation(10, 52283.36);
    expect(lp.getMarkerPosition().lng).toBeCloseTo(83.36, 9);
  });

  it('clamps latitude to [-90, 90]', () => {
    const lp = new LocationPickerV1(target, { lat: 1, lng: 2 });
    lp.setLocation(95, 10);
    expect(lp.getMarkerPosition()).toEqual({ lat: 90, lng: 10 });
    lp.setLocation(-95, 10);
    expect(lp.getMarkerPosition()).toEqual({ lat: -90, lng: 10 });
  });

  it('returns in-range values bit-identical to the map centre', () => {
    const lp = new LocationPickerV1(target, { lat: 1, lng: 2 });
    for (const [lat, lng] of [
      [45.50170000000001, -73.56730000000002],
      [-0, -0],
      [90, -180],
      [-33.868820000000014, 151.20929000000004],
    ] as const) {
      lp.setLocation(lat, lng);
      const position = lp.getMarkerPosition();
      expect(Object.is(position.lat, lat) && Object.is(position.lng, lng)).toBe(true);
    }
  });
});

describe('WP1-11: setCurrentPosition()', () => {
  it('denied: logs like v1, returns nothing, never throws or rejects', async () => {
    stubGeolocation((_success, failure) =>
      failure({ code: 1, message: 'User denied Geolocation' }),
    );
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const unhandled = vi.fn<(reason: unknown) => void>();
    process.on('unhandledRejection', unhandled);
    try {
      const lp = new LocationPickerV1(target, { lat: 1, lng: 2 });
      expect(lp.setCurrentPosition()).toBeUndefined();
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(log).toHaveBeenCalledExactlyOnceWith('Could not determine your location...');
      expect(unhandled).not.toHaveBeenCalled();
    } finally {
      process.off('unhandledRejection', unhandled);
    }
  });

  it('without navigator.geolocation: logs that the browser has no Geolocation', () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const lp = new LocationPickerV1(target, { lat: 1, lng: 2 });
    expect(() => lp.setCurrentPosition()).not.toThrow();
    expect(log).toHaveBeenCalledExactlyOnceWith('Your browser does not support Geolocation.');
  });

  it('success: map.setCenter({lat, lng}) with the position', () => {
    stubGeolocation((success) => success({ coords: { latitude: 35.6762, longitude: 139.6503 } }));
    const lp = new LocationPickerV1(target, { lat: 1, lng: 2 });
    lp.setCurrentPosition();
    expect(stub.stats.setCenterCalls.at(-1)).toStrictEqual({ lat: 35.6762, lng: 139.6503 });
    expect(lp.getMarkerPosition()).toEqual({ lat: 35.6762, lng: 139.6503 });
  });

  it('runs on construction without lat/lng and centres on the position', () => {
    stubGeolocation((success) => success({ coords: { latitude: 48.8566, longitude: 2.3522 } }));
    const lp = new LocationPickerV1(target);
    expect(lp.getMarkerPosition()).toEqual({ lat: 48.8566, lng: 2.3522 });
  });
});

describe('WP1-12: setLocation()', () => {
  it('setLocation(1, 2) calls map.setCenter with a google.maps.LatLng(1, 2)', () => {
    const lp = new LocationPickerV1(target, { lat: 5, lng: 6 });
    lp.setLocation(1, 2);
    const arg = stub.stats.setCenterCalls.at(-1);
    expect(arg).toBeInstanceOf(stubLatLngClass());
    expect(centreOf(lp)).toEqual({ lat: 1, lng: 2 });
  });
});

describe('WP1-13: no v3 globals, no element definition, no network', () => {
  it('a <script>-style evaluation defines only window.locationPicker', () => {
    const before = new Set(Object.keys(globalThis));
    runInThisContext(artifact);
    try {
      const added = Object.keys(globalThis).filter((key) => !before.has(key));
      expect(added).toEqual(['locationPicker']);
      expect(Reflect.get(window, 'LocationPicker')).toBeUndefined();
      expect(customElements.get('location-picker')).toBeUndefined();
      // Only the v1 stylesheets: nothing that loads a URL (the no-network guard fails the test on any request).
      expect([...document.head.children].map((el) => el.tagName)).toEqual(['STYLE', 'STYLE']);
      const LocationPickerGlobal: V1Constructor = Reflect.get(globalThis, 'locationPicker');
      expect(new LocationPickerGlobal(target, { setCurrentPosition: false }).element).toBe(target);
    } finally {
      Reflect.deleteProperty(globalThis, 'locationPicker');
    }
  });
});
