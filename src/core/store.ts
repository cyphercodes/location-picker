import type { GlobalStore } from '../internal/contracts.js';

/**
 * globalThis[Symbol.for('location-picker')], shared by the ESM, CJS and IIFE copies on a page (CONTRACT §1.3, §12.3).
 * Created lazily (never at module evaluation). A store left by another copy is completed IN PLACE: fields it lacks
 * are added, existing ones are kept, so every copy keeps seeing the same Maps and Sets (the schema is append-only).
 */
export function getStore(): GlobalStore {
  const key = Symbol.for('location-picker');
  const found: Partial<GlobalStore> | undefined = Reflect.get(globalThis, key);
  const store: GlobalStore = Object.assign(found ?? {}, {
    schema: found?.schema ?? 1,
    scripts: found?.scripts ?? new Map(),
    stylesheets: found?.stylesheets ?? new WeakMap(),
    sheets: found?.sheets ?? new Map(),
    googleAuthListeners: found?.googleAuthListeners ?? new Set(),
    googleAuthChained: found?.googleAuthChained ?? false,
    defined: found?.defined ?? new Map(),
    warned: found?.warned ?? new Set(),
    reverseCache: found?.reverseCache ?? new Map(),
  } as const);
  if (!found) Reflect.set(globalThis, key, store);
  return store;
}
