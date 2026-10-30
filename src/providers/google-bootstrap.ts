/// <reference types="google.maps" />
// Google's official inline "Dynamic Library Import" bootstrap
// (https://developers.google.com/maps/documentation/javascript/load-maps-js-api), written out readably and run as
// module code rather than as an inline <script>, so a strict CSP needs no 'unsafe-inline'. It behaves like the snippet:
// `google.maps.importLibrary` exists at once; its first call inserts ONE <script> that asks for every library named in
// that tick and carries the nonce; the API then replaces `importLibrary` with its own and calls `google.maps.__ib__`.
import { getStore } from '../core/store.js';

/** Bootstrap parameters, as Google names them in the snippet. */
export interface BootstrapParams {
  readonly key: string;
  readonly v: string;
  readonly language?: string | undefined;
  readonly region?: string | undefined;
}

type ImportLibrary = (name: string) => Promise<unknown>;
type MapsGlobal = Partial<typeof google.maps> & { __ib__?: () => void };

export const MAPS_API_URL = 'https://maps.googleapis.com/maps/api/js';
const API = 'The Google Maps JavaScript API';

/** `globalThis.google.maps`, read when needed (never at module evaluation). */
export const mapsGlobal = (): MapsGlobal | undefined =>
  Reflect.get(Object(Reflect.get(globalThis, 'google')), 'maps');

function install(params: BootstrapParams, nonce: string | undefined): void {
  const google: { maps?: MapsGlobal } = Reflect.get(globalThis, 'google') ?? {};
  Reflect.set(globalThis, 'google', google);
  const maps = (google.maps ??= {});
  if (maps.importLibrary) {
    console.warn(`${API} only loads once. Ignoring:`, params);
    return;
  }
  const libraries = new Set<string>();
  let loading: Promise<void> | undefined;
  const load = (): Promise<void> =>
    (loading ??= new Promise<void>((resolve, reject) => {
      // One microtask later (the snippet's `await`), so libraries asked for in the same tick share one request.
      queueMicrotask(() => {
        const query = new URLSearchParams({ libraries: [...libraries].join(',') });
        for (const [name, value] of Object.entries(params)) if (value) query.set(name, value);
        query.set('callback', 'google.maps.__ib__');
        const script = document.createElement('script');
        script.src = `${MAPS_API_URL}?${query}`;
        maps.__ib__ = resolve;
        script.onerror = () => {
          // Forgotten, so a later call may retry.
          loading = undefined;
          reject(new Error(`${API} could not load.`));
        };
        script.nonce =
          nonce ?? document.querySelector<HTMLScriptElement>('script[nonce]')?.nonce ?? '';
        document.head.append(script);
      });
    }));
  const importLibrary: ImportLibrary = (name) => {
    libraries.add(name);
    // The API has replaced maps.importLibrary by the time `load` resolves.
    return load().then(() => (maps.importLibrary as ImportLibrary)(name));
  };
  Reflect.set(maps, 'importLibrary', importLibrary);
}

/**
 * Loads the `maps` library, installing the bootstrap first unless `google.maps.importLibrary` already exists. One
 * load per page: the promise lives in the global store, shared by every picker and every copy of the library.
 */
export function bootstrap(params: BootstrapParams, nonce?: string): Promise<void> {
  const store = getStore();
  store.googleBootstrap ??= (() => {
    if (!mapsGlobal()?.importLibrary) install(params, nonce);
    const importLibrary = mapsGlobal()?.importLibrary as ImportLibrary;
    return importLibrary('maps').then(
      () => {},
      (cause: unknown) => {
        store.googleBootstrap = undefined;
        throw cause;
      },
    );
  })();
  return store.googleBootstrap;
}

/**
 * Idempotent: injects Google's official inline bootstrap once (nonce-aware) and resolves after `importLibrary('maps')`.
 * @example const maps = await loadGoogleMaps({ apiKey: 'AIza…' });
 */
export async function loadGoogleMaps(options: {
  apiKey: string;
  version?: string;
  language?: string;
  region?: string;
  nonce?: string;
}): Promise<typeof google.maps> {
  if (!mapsGlobal()?.Map) {
    const { apiKey: key, version: v = 'weekly', language, region, nonce } = options;
    await bootstrap({ key, v, language, region }, nonce);
  }
  return mapsGlobal() as typeof google.maps;
}
