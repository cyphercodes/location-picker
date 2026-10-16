// Shared helpers for the WP2 core tests (unit and browser projects).
import { vi } from 'vitest';
import type { AddressDetail, LocationDetail, LocationPickerOptions } from '../../src/core.js';
import { LocationPicker, LocationPickerError } from '../../src/core.js';
import {
  createFakeAdapter,
  type FakeAdapterOptions,
  type FakeControl,
  type FakeMap,
} from '../fixtures/fake-adapter.js';

export interface Logged {
  readonly type: string;
  readonly detail: unknown;
  readonly event: Event;
}

const TYPES = ['input', 'change', 'addresschange', 'ready', 'error'] as const;

/** Records every picker event on `target` in order. */
export function record(target: EventTarget, types: readonly string[] = TYPES): Logged[] {
  const log: Logged[] = [];
  for (const type of types) {
    target.addEventListener(type, (event) => {
      log.push({
        type,
        detail: event instanceof CustomEvent ? (event.detail as unknown) : null,
        event,
      });
    });
  }
  return log;
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value == 'object' && value !== null;
export const isLocationDetail = (value: unknown): value is LocationDetail =>
  isObject(value) && typeof value.value == 'string' && typeof value.source == 'string';
const isAddressDetail = (value: unknown): value is AddressDetail =>
  isObject(value) && 'result' in value;

export const details = (log: readonly Logged[], type: string): LocationDetail[] =>
  log
    .filter((entry) => entry.type == type)
    .map((entry) => entry.detail)
    .filter(isLocationDetail);
export const addressDetails = (log: readonly Logged[]): AddressDetail[] =>
  log.map((entry) => entry.detail).filter(isAddressDetail);
export const errors = (log: readonly Logged[]): LocationPickerError[] =>
  log
    .map((entry) => entry.detail)
    .filter((d): d is LocationPickerError => d instanceof LocationPickerError);
export const eventOf = (log: readonly Logged[], type: string): Event =>
  must(
    log.find((entry) => entry.type == type),
    `a ${type} event`,
  ).event;
/** "type", "type:CODE" or "type:value:source" per entry. */
export const summary = (log: readonly Logged[]): string[] =>
  log.map(({ type, detail }) =>
    detail instanceof LocationPickerError
      ? `${type}:${detail.code}`
      : isLocationDetail(detail)
        ? `${type}:${detail.value}:${detail.source}`
        : type,
  );

/** Lets queued microtasks and zero-delay timers (ready, construction-time errors) run. */
export const flush = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));
export const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

export function must<T>(value: T | null | undefined, what = 'a value'): T {
  if (value == null) throw new Error(`expected ${what}`);
  return value;
}

/** The first match of `selector` under `root`, checked to be a `type`. */
export function query<T extends Element>(
  root: ParentNode,
  selector: string,
  type: abstract new () => T,
): T {
  const node = root.querySelector(selector);
  if (!(node instanceof type)) throw new Error(`expected a ${type.name} at ${selector}`);
  return node;
}
export const byId = (id: string): HTMLElement => query(document, `#${id}`, HTMLElement);
export const inputById = (id: string): HTMLInputElement =>
  query(document, `#${id}`, HTMLInputElement);

export interface Mounted {
  readonly picker: LocationPicker<FakeMap>;
  readonly fake: FakeControl;
  readonly log: Logged[];
  readonly target: HTMLElement;
}

/** A class picker on a fresh `#map` target, driven by the fake adapter; events are recorded from construction. */
export function mountPicker(
  options: Omit<LocationPickerOptions<FakeMap>, 'provider'> = {},
  fakeOptions: FakeAdapterOptions = {},
  html = '<div id="map"></div>',
): Mounted {
  document.body.innerHTML = html;
  const fake = createFakeAdapter(fakeOptions);
  const picker = new LocationPicker('#map', { provider: fake.adapter, ...options });
  return { picker, fake, log: record(picker), target: byId('map') };
}

/** Clears the page-wide store (warnOnce keys, caches) so each test sees first-time diagnostics. */
export function resetStore(): void {
  Reflect.deleteProperty(globalThis, Symbol.for('location-picker'));
}

export function spyConsole() {
  return {
    warn: vi.spyOn(console, 'warn').mockImplementation(() => {}),
    info: vi.spyOn(console, 'info').mockImplementation(() => {}),
    error: vi.spyOn(console, 'error').mockImplementation(() => {}),
  };
}
/** The text of each console call, in order. */
export const texts = (spy: { mock: { calls: unknown[][] } }): string[] =>
  spy.mock.calls.map((call) => String(call[0]));

type GetCurrentPosition = Geolocation['getCurrentPosition'];

/** A navigator.geolocation stub in a secure context (jsdom has neither). */
export function stubGeolocation(
  impl: GetCurrentPosition,
): ReturnType<typeof vi.fn<GetCurrentPosition>> {
  const getCurrentPosition = vi.fn<GetCurrentPosition>(impl);
  vi.stubGlobal('isSecureContext', true);
  Object.defineProperty(navigator, 'geolocation', {
    configurable: true,
    value: {
      getCurrentPosition,
      watchPosition: vi.fn<Geolocation['watchPosition']>(),
      clearWatch: vi.fn<Geolocation['clearWatch']>(),
    },
  });
  return getCurrentPosition;
}

export function unstubGeolocation(): void {
  Reflect.deleteProperty(navigator, 'geolocation');
}

export function position(latitude: number, longitude: number, accuracy = 12): GeolocationPosition {
  const coords = {
    latitude,
    longitude,
    accuracy,
    altitude: null,
    altitudeAccuracy: null,
    heading: null,
    speed: null,
    toJSON: () => ({ latitude, longitude, accuracy }),
  };
  return { coords, timestamp: 0, toJSON: () => ({ coords }) };
}

/** A GeolocationPositionError look-alike: a plain object, NOT an Error (as in browsers). */
export function positionError(code: number): GeolocationPositionError {
  return {
    code,
    message: `code ${code}`,
    PERMISSION_DENIED: 1,
    POSITION_UNAVAILABLE: 2,
    TIMEOUT: 3,
  };
}
