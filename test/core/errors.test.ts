import { afterEach, beforeEach, describe, expect, expectTypeOf, it, vi } from 'vitest';
import type * as C from '../../src/internal/contracts.js';
import { LocationPickerError as PublicError } from '../../src/core.js';
import {
  ERROR_TABLE,
  LocationPickerError,
  createError,
  reportError,
  type LocationPickerErrorCode,
} from '../../src/core/errors.js';

// The level column of the LocationPickerErrorCode JSDoc table (api.d.ts). `satisfies` keeps it exhaustive.
const LEVELS = {
  TARGET_NOT_FOUND: 'error',
  INVALID_OPTION: 'error',
  ENGINE_MISSING: 'error',
  ENGINE_LOAD_FAILED: 'error',
  API_KEY_MISSING: 'error',
  GOOGLE_AUTH_FAILED: 'error',
  GEOCODER_MISMATCH: 'error',
  GEOCODER_MISSING: 'error',
  INVALID_VALUE: 'warn',
  ENGINE_CSS_MISSING: 'warn',
  MAP_ID_REQUIRED: 'warn',
  GEOCODER_FAILED: 'warn',
  GEOLOCATION_UNSUPPORTED: 'warn',
  GEOLOCATION_DENIED: 'warn',
  GEOLOCATION_UNAVAILABLE: 'warn',
  GEOLOCATION_TIMEOUT: 'warn',
  ABORTED: 'silent',
} as const satisfies Record<LocationPickerErrorCode, 'error' | 'warn' | 'silent'>;
const CODES = Object.keys(LEVELS);

let consoleSpies: Record<'error' | 'warn' | 'info', ReturnType<typeof vi.spyOn>>;
beforeEach(() => {
  consoleSpies = {
    error: vi.spyOn(console, 'error').mockImplementation(() => {}),
    warn: vi.spyOn(console, 'warn').mockImplementation(() => {}),
    info: vi.spyOn(console, 'info').mockImplementation(() => {}),
  };
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe('ERROR_TABLE', () => {
  it('matches the contract types', () => {
    expectTypeOf(ERROR_TABLE).toEqualTypeOf<typeof C.ERROR_TABLE>();
    expectTypeOf(createError).toEqualTypeOf<typeof C.createError>();
    expectTypeOf(reportError).toEqualTypeOf<typeof C.reportError>();
  });

  it('has every code with the documented default level', () => {
    expect(Object.keys(ERROR_TABLE).toSorted()).toEqual([...CODES].toSorted());
    for (const [code, spec] of Object.entries(ERROR_TABLE)) {
      expect([code, spec.level]).toEqual([code, Reflect.get(LEVELS, code)]);
    }
  });

  it('has a message (no final period) and a one-line fix (a sentence) for every code', () => {
    for (const spec of Object.values(ERROR_TABLE)) {
      expect(spec.message).toMatch(/^[^\n]+[^.]$/);
      expect(spec.fix).toMatch(/^[A-Z][^\n]+\.$/);
    }
  });
});

describe('LocationPickerError', () => {
  it('is the class core.ts exports', () => {
    expect(PublicError).toBe(LocationPickerError);
  });

  it('takes its text, fix and level from the table', () => {
    const e = new LocationPickerError('API_KEY_MISSING');
    expect(e).toBeInstanceOf(Error);
    expect(e.name).toBe('LocationPickerError');
    expect(e.code).toBe('API_KEY_MISSING');
    expect(e.level).toBe('error');
    expect(e.fix).toBe('Add api-key="YOUR_KEY", or load the Google Maps JS API before the picker.');
    expect(e.message).toBe(
      '[location-picker] Google Maps needs an API key. Fix: Add api-key="YOUR_KEY", or load the Google Maps JS API before the picker.',
    );
    expect('cause' in e).toBe(false);
  });

  it.each(CODES)('%s: "[location-picker] <what happened>. Fix: <fix>"', (code) => {
    const e: LocationPickerError = Reflect.construct(LocationPickerError, [code]);
    expect(e.message).toMatch(/^\[location-picker\] .+[^.]\. Fix: .+\.$/);
    expect(e.message).not.toMatch(/\{\w+\}/); // no unfilled placeholder
  });

  it('accepts a message, a fix and a cause', () => {
    const cause = { code: 1, message: 'User denied Geolocation' };
    const e = new LocationPickerError('GEOLOCATION_DENIED', 'no way', {
      fix: 'Ask nicely.',
      cause,
    });
    expect(e.message).toBe('[location-picker] no way. Fix: Ask nicely.');
    expect(e.fix).toBe('Ask nicely.');
    expect(e.cause).toBe(cause);
    expect(e.cause).not.toBeInstanceOf(Error);
  });
});

describe('createError', () => {
  it('fills {placeholders} from vars, or with the bare name', () => {
    expect(createError('TARGET_NOT_FOUND', { vars: { target: '"#map"' } }).message).toMatch(
      /^\[location-picker\] no element matches "#map"\. Fix: /,
    );
    expect(createError('TARGET_NOT_FOUND').message).toMatch(/no element matches target\. Fix:/);
  });

  it('overrides the level per case (INVALID_OPTION for lat-only is warn)', () => {
    expect(createError('INVALID_OPTION').level).toBe('error');
    const e = createError('INVALID_OPTION', { message: 'only lat', level: 'warn' });
    expect(e.level).toBe('warn');
    expect(e).toBeInstanceOf(LocationPickerError);
  });

  it('keeps an explicit message, fix and cause', () => {
    const cause = new Event('error');
    const e = createError('ENGINE_LOAD_FAILED', { message: 'nope', fix: 'Retry.', cause });
    expect(e.message).toBe('[location-picker] nope. Fix: Retry.');
    expect(e.cause).toBe(cause);
  });
});

describe('reportError (D13)', () => {
  it('dispatches a cancelable, non-bubbling, non-composed `error` event with the error as detail', () => {
    const parent = document.createElement('div');
    const target = parent.appendChild(document.createElement('div'));
    const seen: CustomEvent[] = [];
    const bubbled = vi.fn<(e: Event) => void>();
    parent.addEventListener('error', bubbled);
    target.addEventListener('error', (e: Event) => {
      if (e instanceof CustomEvent) seen.push(e);
    });
    const error = createError('ENGINE_MISSING');
    reportError(target, error);
    const [event, ...more] = seen;
    expect(more).toEqual([]);
    expect(event?.detail).toBe(error);
    expect([event?.bubbles, event?.cancelable, event?.composed]).toEqual([false, true, false]);
    expect(bubbled).not.toHaveBeenCalled();
  });

  it('logs an unhandled error once with console[level]; the line has the prefix and the fix', () => {
    reportError(new EventTarget(), createError('INVALID_VALUE', { vars: { value: '"abc"' } }));
    reportError(new EventTarget(), createError('GOOGLE_AUTH_FAILED'));
    expect(consoleSpies.warn).toHaveBeenCalledTimes(1);
    expect(consoleSpies.warn.mock.calls.at(0)?.[0]).toMatch(
      /^\[location-picker\] "abc" is not a coordinate\. Fix: /,
    );
    expect(consoleSpies.error).toHaveBeenCalledTimes(1);
    expect(consoleSpies.error.mock.calls.at(0)?.[0]).toContain('Fix:');
  });

  it('does not log when a listener calls preventDefault()', () => {
    const target = new EventTarget();
    target.addEventListener('error', (e) => e.preventDefault());
    reportError(target, createError('ENGINE_MISSING'));
    expect(consoleSpies.error).not.toHaveBeenCalled();
  });

  it('does not log when an onError handled it', () => {
    reportError(new EventTarget(), createError('ENGINE_MISSING'), { handled: true });
    expect(consoleSpies.error).not.toHaveBeenCalled();
  });

  it('never logs ABORTED', () => {
    reportError(new EventTarget(), createError('ABORTED'));
    expect(Object.values(consoleSpies).every((spy) => spy.mock.calls.length == 0)).toBe(true);
  });

  it('dispatches in a microtask with async: true', async () => {
    const target = new EventTarget();
    const listener = vi.fn<(e: Event) => void>();
    target.addEventListener('error', listener);
    reportError(target, createError('ENGINE_MISSING'), { async: true });
    expect(listener).not.toHaveBeenCalled();
    await Promise.resolve();
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
