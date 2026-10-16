import { afterEach, beforeEach, describe, expect, expectTypeOf, it, vi } from 'vitest';
import type * as C from '../../src/internal/contracts.js';
import {
  WRONG_GUESSES,
  clampedLatitude,
  emitDiagnostics,
  infoOnce,
  unknownOption,
  warnOnce,
  wrongGuess,
} from '../../src/core/diagnostics.js';
import { getStore } from '../../src/core/store.js';

beforeEach(() => {
  Reflect.deleteProperty(globalThis, Symbol.for('location-picker'));
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'info').mockImplementation(() => {});
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe('warnOnce / infoOnce (§12.2)', () => {
  it('match the contract signatures', () => {
    expectTypeOf(warnOnce).toEqualTypeOf<typeof C.warnOnce>();
    expectTypeOf(infoOnce).toEqualTypeOf<typeof C.infoOnce>();
  });

  it('log once per key per page, with the [location-picker] prefix', () => {
    warnOnce('k', 'first');
    warnOnce('k', 'again');
    warnOnce('other', 'second');
    infoOnce('i', 'hint');
    infoOnce('i', 'hint');
    expect(vi.mocked(console.warn).mock.calls).toEqual([
      ['[location-picker] first'],
      ['[location-picker] second'],
    ]);
    expect(vi.mocked(console.info).mock.calls).toEqual([['[location-picker] hint']]);
  });

  it('share the keys of another library copy through the global store', () => {
    getStore().warned.add('seen-by-the-cjs-copy');
    warnOnce('seen-by-the-cjs-copy', 'x');
    expect(console.warn).not.toHaveBeenCalled();
  });

  it('emitDiagnostics logs each diagnostic once at its level', () => {
    const list = [
      { level: 'warn', key: 'a', message: 'A' },
      { level: 'info', key: 'b', message: 'B' },
    ] as const;
    emitDiagnostics(list);
    emitDiagnostics(list);
    expect(console.warn).toHaveBeenCalledTimes(1);
    expect(console.info).toHaveBeenCalledTimes(1);
  });
});

describe('diagnostic texts', () => {
  it('unknownOption lists the valid keys and suggests a near match', () => {
    const text = unknownOption('apikey', ['provider', 'apiKey', 'value']);
    expect(text).toBe(
      'Unknown option "apikey" (did you mean "apiKey"?). Valid options: provider, apiKey, value.',
    );
    expect(unknownOption('api_key', ['apiKey'])).toContain('did you mean "apiKey"');
    expect(unknownOption('zzz', ['value'])).toBe('Unknown option "zzz". Valid options: value.');
  });

  it('clampedLatitude carries the D19 swap hint', () => {
    expect(clampedLatitude(95, 10)).toBe(
      'latitude 95 was clamped to 90; did you swap lat and lng? try (10, 95)',
    );
    expect(clampedLatitude(-91, 0)).toBe(
      'latitude -91 was clamped to -90; did you swap lat and lng? try (0, -91)',
    );
    expect(clampedLatitude(120, 150)).toBe('latitude 120 was clamped to 90');
  });

  it('names the right attribute for every §3.11 wrong guess', () => {
    const guesses = ['latitude', 'longitude', 'lon', 'location', 'coordinates', 'key', 'api_key'];
    const more = ['tiles', 'pin', 'controls', 'autolocate', 'locate-button'];
    expect(Object.keys(WRONG_GUESSES).toSorted()).toEqual([...guesses, ...more].toSorted());
    expect(wrongGuess('key')).toBe('<location-picker key> is not an attribute; use api-key.');
    expect(wrongGuess('autolocate')).toContain('locate="auto"');
    expect(wrongGuess('constructor')).toContain('the documented attributes');
  });
});
