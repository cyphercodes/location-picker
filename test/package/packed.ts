// Shared by test/package/*.test.ts: the npm tarball as consumers get it, extracted into a temp project outside the
// repository (so Node's self-reference cannot resolve `location-picker` back to the checkout), plus the public API
// table from api.d.ts. The tarball needs dist/: locally these tests skip until `npm run build`; in CI they fail.
import { execFileSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export const built = existsSync('dist/index.mjs') && existsSync('custom-elements.json');
/** Skip only outside CI: a CI run without dist/ must fail, not pass silently. */
export const skipUnbuilt = !built && !process.env.CI;

/** Runtime (value) exports of each JS entry, from api.d.ts. Types are erased, so they are not listed. */
const UTILS = ['formatLatLng', 'isLatLng', 'normalizeLatLng', 'parseLatLng'];
const CORE = [...UTILS, 'LocationPicker', 'LocationPickerError', 'default', 'version'];
const ELEMENT = ['LocationPickerElement', 'defineLocationPicker'];
export const API_EXPORTS: Readonly<Record<string, readonly string[]>> = {
  '.': [...CORE, ...ELEMENT],
  './core': CORE,
  './element': ELEMENT,
  './utils': UTILS,
  './leaflet': [
    'LEAFLET_CSS_INTEGRITY',
    'LEAFLET_CSS_URL',
    'LEAFLET_JS_INTEGRITY',
    'LEAFLET_JS_URL',
    'LEAFLET_VERSION',
    'OSM_ATTRIBUTION',
    'OSM_TILE_URL',
    'leafletProvider',
  ],
  './google': ['googleGeocoder', 'googleProvider', 'loadGoogleMaps'],
  './maplibre': ['OPENFREEMAP_STYLE_URL', 'maplibreProvider'],
  './photon': ['PHOTON_URL', 'formatPhotonAddress', 'photonGeocoder'],
  './webmcp': ['isWebMcpSupported', 'registerWebMcpTools'],
};

/** The source file behind each subpath, and its owner (for messages about placeholders). */
const SOURCES: Readonly<Record<string, readonly [file: string, owner: string]>> = {
  '.': ['src/index.ts', 'WP4'],
  './element': ['src/element.ts', 'WP4'],
  './webmcp': ['src/webmcp.ts', 'WP4'],
  './global': ['src/global.ts', 'WP4'],
  './leaflet': ['src/leaflet.ts', 'WP3'],
  './google': ['src/google.ts', 'WP3'],
  './maplibre': ['src/maplibre.ts', 'WP3'],
  './photon': ['src/photon.ts', 'WP3'],
  'globals.d.ts': ['types/globals.d.ts', 'WP4'],
  'global.d.ts': ['types/global.d.ts', 'WP4'],
};

/**
 * "placeholder: owned by WPx" while the owner has not landed the real file, else undefined. Checks that cannot hold
 * on a placeholder skip with this note and start applying, unedited, the moment the placeholder is replaced.
 */
export function placeholder(key: string): string | undefined {
  const source = SOURCES[key];
  if (!source || !readFileSync(source[0], 'utf8').startsWith('// placeholder')) return undefined;
  return `${source[0]} is still a placeholder (owned by ${source[1]})`;
}

export interface PackedProject {
  /** Consumer project root: package.json + node_modules/location-picker. */
  readonly dir: string;
  /** Extracted package root. */
  readonly pkg: string;
  /** Tarball paths relative to the package root, sorted. */
  readonly files: readonly string[];
  dispose(): void;
}

export function packProject(prefix: string): PackedProject {
  const dir = mkdtempSync(join(tmpdir(), `lp-${prefix}-`));
  // npm 10 and 11 print an array, npm 12 an object keyed by package name.
  const [pack]: { filename: string; files: { path: string }[] }[] = Object.values(
    JSON.parse(
      execFileSync('npm', ['pack', '--ignore-scripts', '--json', '--pack-destination', dir], {
        encoding: 'utf8',
      }),
    ),
  );
  if (!pack) throw new Error('npm pack printed no result');
  mkdirSync(join(dir, 'node_modules'));
  execFileSync('tar', ['-xzf', join(dir, pack.filename), '-C', join(dir, 'node_modules')]);
  const pkg = join(dir, 'node_modules/location-picker');
  renameSync(join(dir, 'node_modules/package'), pkg);
  writeFileSync(join(dir, 'package.json'), '{ "name": "lp-consumer", "private": true }\n');
  return {
    dir,
    pkg,
    files: pack.files.map((file) => file.path).toSorted(),
    dispose: () => rmSync(dir, { recursive: true, force: true }),
  };
}

/** Runs plain Node (no DOM) in `cwd` and returns stdout. */
export function node(cwd: string, args: readonly string[]): string {
  return execFileSync(process.execPath, args, { cwd, encoding: 'utf8', stdio: 'pipe' });
}
