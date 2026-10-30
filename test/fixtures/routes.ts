// CONTRACT §12.6 route table. Runs in Node (Playwright, and vitest-browser through the `lpInstallRoutes` command)
// and answers every allowed external request from local files; any other non-local request is aborted and recorded.
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join, normalize, sep } from 'node:path';
import type * as Contract from '../../src/internal/contracts.js';
import type { RouteOptions, RouteTarget } from '../../src/internal/contracts.js';
import { ALLOWED_EXTERNAL_PATTERNS, ROUTED_URLS } from './network-policy.js';
import { photonResponse } from './photon-mock.js';

export { ALLOWED_EXTERNAL_PATTERNS };
export type { RouteOptions, RouteTarget };

/** What this table sends: files go by `path`, so a body is always a string. Playwright also takes `headers`. */
interface Response {
  status?: number;
  body?: string;
  contentType?: string;
  path?: string;
  headers?: Record<string, string>;
}
interface Route {
  fulfill(response: Response): Promise<void>;
  abort(errorCode?: string): Promise<void>;
  request(): { url(): string };
}
/**
 * Playwright's Page and BrowserContext are not assignable to the §12.6 `RouteTarget` (its `body?: string | Uint8Array`
 * is not a Playwright `Buffer`), so the table accepts this wider shape, which covers both and `RouteTarget` itself.
 */
export interface Routable {
  route(url: RegExp, handler: (route: Route) => unknown): Promise<unknown>;
}

/** Both runners start from the repository root (npm scripts). */
const ROOT = process.cwd();
const LEAFLET_DIST = join(ROOT, 'node_modules/leaflet/dist');
const DIST = join(ROOT, 'dist');
const GOOGLE_MOCK = join(ROOT, 'e2e/fixtures/google-maps-mock.js');
/** Delay used by the `slow` variants (CONTRACT §13 WP3-21/22: a 3 s engine). */
export const SLOW_MS = 3000;

const CORS = { 'access-control-allow-origin': '*' };
const CONTENT_TYPES: Record<string, string> = {
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.css': 'text/css',
  '.png': 'image/png',
  '.map': 'application/json',
};

/** Responders that work packages plug in: Photon answers from photon-mock.ts (WP3); the Google stub waits for WP3. */
export const responders: {
  photon: (url: URL) => globalThis.Response | null;
  google: (url: URL, mode: NonNullable<RouteOptions['google']>) => Promise<string>;
} = {
  photon: photonResponse,
  google: async (_url, mode) => {
    const prelude = `globalThis.__LP_GOOGLE_MOCK__ = ${JSON.stringify({ mode })};\n`;
    if (existsSync(GOOGLE_MOCK)) return prelude + (await readFile(GOOGLE_MOCK, 'utf8'));
    return `throw new Error('[routes] e2e/fixtures/google-maps-mock.js does not exist yet (WP3)');\n`;
  },
};

/** What the routed OpenFreeMap style URL serves. */
export const OPENFREEMAP_STYLE = {
  version: 8,
  name: 'location-picker test style',
  sources: {},
  layers: [{ id: 'background', type: 'background', paint: { 'background-color': '#d4e6f1' } }],
} as const;

const blocked = new WeakMap<Routable, string[]>();

/** Returns and clears the non-local requests that were aborted on `target` since the last call. */
export function takeBlockedRequests(target: Routable): string[] {
  const urls = blocked.get(target) ?? [];
  blocked.set(target, []);
  return urls;
}

/** Non-local http(s) URLs: the catch-all that aborts and records. Local servers are never routed. */
const NON_LOCAL = /^https?:\/\/(?!(?:localhost|127\.0\.0\.1|\[::1\])(?::\d+)?\/)/;

export async function installRoutes(target: Routable, options: RouteOptions = {}): Promise<void> {
  const { leaflet = 'ok', tiles = 'ok', photon = 'ok', google = 'importLibrary' } = options;
  if (!blocked.has(target)) blocked.set(target, []);

  // Playwright tries the most recently registered route first, so the catch-all goes in first.
  // 'accessdenied': WebKit never fires `error` on an <img> aborted with 'blockedbyclient' or 'aborted'.
  await target.route(NON_LOCAL, (route) => {
    blocked.get(target)?.push(route.request().url());
    return route.abort('accessdenied');
  });

  await target.route(ROUTED_URLS.leaflet, async (route) => {
    if (leaflet === 'fail') return route.abort('failed');
    if (leaflet === 'slow') await delay(SLOW_MS);
    const file = /\/dist\/([^?#]+)/.exec(route.request().url())?.[1] ?? '';
    return fulfillFile(route, LEAFLET_DIST, file);
  });

  await target.route(ROUTED_URLS.tiles, (route) =>
    tiles === 'fail' ? route.abort('failed') : fulfillFile(route, ROOT, 'test/fixtures/tile.png'),
  );

  await target.route(ROUTED_URLS.photon, async (route) => {
    if (photon === 'fail') return route.abort('failed');
    if (photon === 'slow') await delay(SLOW_MS);
    const response = responders.photon(new URL(route.request().url()));
    if (!response) return fulfill(route, { status: 404, body: '', contentType: 'text/plain' });
    return fulfill(route, {
      status: response.status,
      body: await response.text(),
      contentType: response.headers.get('content-type') ?? 'application/json',
    });
  });

  // The MapLibre default style: a background layer only, so it triggers no source, sprite or glyph requests.
  await target.route(ROUTED_URLS.openfreemap, (route) =>
    fulfill(route, {
      body: JSON.stringify(OPENFREEMAP_STYLE),
      contentType: 'application/json',
    }),
  );

  await target.route(ROUTED_URLS.google, async (route) =>
    fulfill(route, {
      body: await responders.google(new URL(route.request().url()), google),
      contentType: 'text/javascript',
    }),
  );

  // location-picker@3 (bare) is the IIFE; location-picker@3/dist/* maps onto the local dist/. Other paths (such as
  // /+esm, which jsDelivr bundles on the fly) have no local equivalent: 404, recorded so the test fails loudly.
  await target.route(ROUTED_URLS.library, (route) => {
    const url = route.request().url();
    const file = /\/dist\/([^?#]+)/.exec(url)?.[1];
    if (file) return fulfillFile(route, DIST, file);
    if (/location-picker@[^/]+\/?(?:[?#]|$)/.test(url)) {
      return fulfillFile(route, DIST, 'location-picker.global.js');
    }
    blocked.get(target)?.push(url);
    return fulfill(route, {
      status: 404,
      body: `no local equivalent: ${url}`,
      contentType: 'text/plain',
    });
  });
}

function fulfill(route: Route, response: Response): Promise<void> {
  return route.fulfill({ ...response, headers: { ...CORS, ...response.headers } });
}

function fulfillFile(route: Route, root: string, file: string): Promise<void> {
  const path = normalize(join(root, file));
  if (!path.startsWith(root + sep) || !existsSync(path)) {
    return fulfill(route, { status: 404, body: `not found: ${file}`, contentType: 'text/plain' });
  }
  const ext = /\.[^.]+$/.exec(path)?.[0] ?? '';
  return fulfill(route, { path, contentType: CONTENT_TYPES[ext] ?? 'application/octet-stream' });
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Compile-time proof that the implementation satisfies the frozen signatures (CONTRACT §12.6).
installRoutes satisfies typeof Contract.installRoutes;
ALLOWED_EXTERNAL_PATTERNS satisfies typeof Contract.ALLOWED_EXTERNAL_PATTERNS;
