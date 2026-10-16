import { beforeEach, describe, expect, expectTypeOf, it, vi } from 'vitest';
import type * as C from '../../src/internal/contracts.js';
import { getStore } from '../../src/core/store.js';

const KEY = Symbol.for('location-picker');

beforeEach(() => {
  Reflect.deleteProperty(globalThis, KEY);
});

describe('getStore (§12.3)', () => {
  it('matches the contract signature', () => {
    expectTypeOf(getStore).toEqualTypeOf<typeof C.getStore>();
  });

  it('lives on globalThis[Symbol.for("location-picker")] and is the same object every time', () => {
    const store = getStore();
    expect(Reflect.get(globalThis, KEY)).toBe(store);
    expect(getStore()).toBe(store);
    expect(store).toMatchObject({ schema: 1, googleAuthChained: false });
    expect(store.scripts).toBeInstanceOf(Map);
    expect(store.stylesheets).toBeInstanceOf(WeakMap);
    expect(store.sheets).toBeInstanceOf(Map);
    expect(store.googleAuthListeners).toBeInstanceOf(Set);
    expect(store.defined).toBeInstanceOf(Map);
    expect(store.warned).toBeInstanceOf(Set);
    expect(store.reverseCache).toBeInstanceOf(Map);
    expect(store.googleBootstrap).toBeUndefined();
  });

  it('completes a store left by another copy in place, keeping its fields', () => {
    const warned = new Set(['from-another-copy']);
    const bootstrap = Promise.resolve();
    const other = { schema: 1, warned, googleBootstrap: bootstrap, googleAuthChained: true };
    Reflect.set(globalThis, KEY, other);
    const store = getStore();
    expect(store).toBe(other);
    expect(store.warned).toBe(warned);
    expect(store.googleBootstrap).toBe(bootstrap);
    expect(store.googleAuthChained).toBe(true);
    expect(store.scripts).toBeInstanceOf(Map);
    expect(store.defined).toBeInstanceOf(Map);
  });

  it('is not created when the module is evaluated', async () => {
    vi.resetModules();
    await import('../../src/core/store.js');
    await import('../../src/core/diagnostics.js');
    await import('../../src/core/config.js');
    expect(Reflect.has(globalThis, KEY)).toBe(false);
  });
});
