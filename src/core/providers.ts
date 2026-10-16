// Provider loading and geocoder pairing (CONTRACT §4.1, §5.1, §12.4). The built-in adapters are WP3 entries that the
// ESM/CJS builds import lazily; the IIFE (global.ts) replaces these loaders with eager ones.
import type { Geocoder, MapHandle, MountContext, ProviderAdapter, ProviderName } from '../core.js';
import type * as C from '../internal/contracts.js';
import type { ResolvedConfig } from '../internal/contracts.js';
import { createError, LocationPickerError } from './errors.js';

export { normalizeProviderName } from './config.js';

/**
 * `ProviderAdapter<T>` is not assignable to `ProviderAdapter` (its geocoder factory takes `MapHandle<T>`), yet the core
 * never depends on the map type: adapters are handled type-erased.
 */
// oxlint-disable-next-line typescript/no-unsafe-type-assertion -- erasing T is the point
export const erased = <T>(adapter: ProviderAdapter<T>): ProviderAdapter =>
  adapter as ProviderAdapter;

/** ESM/CJS: dynamic import() of the WP3 entry, calling its factory with no args. Mutable so global.ts and tests can swap loaders. */
export const BUILTIN_PROVIDERS: Record<ProviderName, () => Promise<ProviderAdapter>> = {
  leaflet: async () => erased((await import('../leaflet.js')).leafletProvider()),
  google: async () => erased((await import('../google.js')).googleProvider()),
  maplibre: async () => erased((await import('../maplibre.js')).maplibreProvider()),
};

/**
 * The built-in search combobox (§12.5), loaded only when `search` is on and the adapter has no `createSearch`.
 * WP3 owns src/search/combobox.ts; until it lands, this seam reports that the box is missing from the build.
 */
export const SEARCH_UI: {
  load: () => Promise<{ readonly createCombobox: typeof C.createCombobox }>;
} = {
  load: () =>
    Promise.reject(
      createError('GEOCODER_FAILED', {
        message: 'the built-in search box is not part of this build',
        fix: 'Use a provider with its own search UI, or call geocode() from your own input.',
      }),
    ),
};

const asError = (cause: unknown, spec: string): LocationPickerError =>
  cause instanceof LocationPickerError
    ? cause
    : createError('ENGINE_LOAD_FAILED', { cause, vars: { url: `location-picker/${spec}` } });

/** Adapter objects are returned synchronously (enables sync mount); names load lazily. */
export function loadProvider(
  spec: ProviderName | ProviderAdapter,
): ProviderAdapter | Promise<ProviderAdapter> {
  if (typeof spec == 'object') return spec;
  try {
    return BUILTIN_PROVIDERS[spec]().catch((cause: unknown) =>
      Promise.reject(asError(cause, spec)),
    );
  } catch (cause) {
    return Promise.reject(asError(cause, spec));
  }
}

/** GEOCODER_MISMATCH when `geocoder.pairsWith` excludes `providerName`; else null. */
export function checkPairing(geocoder: Geocoder, providerName: string): LocationPickerError | null {
  return geocoder.pairsWith && !geocoder.pairsWith.includes(providerName)
    ? createError('GEOCODER_MISMATCH', { vars: { provider: providerName } })
    : null;
}

/** config.geocoder (false -> null) ?? adapter.geocoder (object, or factory called once per mount). Pairing is checked here. */
export async function resolveGeocoder(
  adapter: ProviderAdapter,
  config: ResolvedConfig,
  ctx: MountContext,
  handle: MapHandle,
): Promise<Geocoder | null> {
  if (config.geocoder === false) return null;
  const source = config.geocoder ?? adapter.geocoder;
  const geocoder = typeof source == 'function' ? await source(ctx, handle) : source;
  if (!geocoder) return null;
  const mismatch = checkPairing(geocoder, adapter.name);
  if (mismatch) throw mismatch;
  return geocoder;
}

loadProvider satisfies typeof C.loadProvider;
checkPairing satisfies typeof C.checkPairing;
resolveGeocoder satisfies typeof C.resolveGeocoder;
