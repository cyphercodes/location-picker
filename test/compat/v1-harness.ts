// Shared by the WP1 tests: the committed frozen v1 artifact (`npm run build` copies it byte-for-byte to
// dist/location-picker.min.js) and the classic Google Maps stub, both evaluated in the test realm.
import { readFileSync } from 'node:fs';
import { compileFunction, runInThisContext } from 'node:vm';

export const ARTIFACT_PATH = 'src/compat/location-picker.min.js';
export const DIST_PATH = 'dist/location-picker.min.js';
export const LOCK_PATH = 'test/compat/v1.lock';
const STUB_PATH = 'e2e/fixtures/v1/google-classic-stub.js';

export const artifact: string = readFileSync(ARTIFACT_PATH, 'utf8');

export interface LatLngLiteral {
  lat: number;
  lng: number;
}
export interface StubLatLng {
  lat(): number;
  lng(): number;
}
export interface StubMap {
  getCenter(): StubLatLng;
  setCenter(center: StubLatLng | LatLngLiteral): void;
  getZoom(): number;
  getDiv(): HTMLElement | null;
}
/** The control object of e2e/fixtures/v1/google-classic-stub.js. */
export interface GoogleStub {
  stats: {
    mapInstances: StubMap[];
    mapOptions: Record<string, unknown>[];
    setCenterCalls: unknown[];
    setZoomCalls: number[];
  };
  simulateUserPan(map: StubMap, to: LatLngLiteral): void;
  listenerCount(instance: object, name: string): number;
  uninstall(): void;
}

export interface V1Options {
  setCurrentPosition?: boolean;
  lat?: number;
  lng?: number;
}
export interface V1Picker {
  map: StubMap;
  element: HTMLElement | null;
  getMarkerPosition(): LatLngLiteral;
  setLocation(lat: number, lng: number): void;
  setCurrentPosition(): void;
}
export type V1Constructor = new (
  element: string | HTMLElement,
  options?: V1Options,
  mapOptions?: object,
) => V1Picker;

/** Installs `google.maps` (classic mode) on globalThis, as the stub's <script> does on a page. */
export function installGoogleStub(): GoogleStub {
  runInThisContext(readFileSync(STUB_PATH, 'utf8'));
  return Reflect.get(globalThis, 'lpGoogleStub');
}

/** The stub's `google.maps.LatLng`, for instanceof checks. */
export function stubLatLngClass(): new (lat: number, lng: number) => StubLatLng {
  return Reflect.get(globalThis, 'google').maps.LatLng;
}

/** Evaluates the artifact through its CommonJS branch: one fresh evaluation (and one injected style) per call. */
export function evaluateV1(code: string = artifact): V1Constructor {
  const module: { exports?: V1Constructor } = {};
  compileFunction(code, ['module', 'exports'])(module, {});
  if (typeof module.exports !== 'function')
    throw new Error('the v1 file did not set module.exports');
  return module.exports;
}
