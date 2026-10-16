// The frozen v1 file as consumers get it, from the packed npm tarball in a temp project outside the repo (so Node's
// self-reference cannot resolve `location-picker` back to the checkout): Node require/import (WP1-02, WP1-03), esbuild
// and rolldown bundles (WP1-04) and consumer types (WP1-14, TS 7 only; the full matrix is WP5's types-matrix).
// The tarball needs dist/, so this file is skipped until `npm run build` has run.
import { execFileSync, spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { runInThisContext } from 'node:vm';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import {
  DIST_PATH,
  evaluateV1,
  installGoogleStub,
  type GoogleStub,
  type V1Constructor,
  type V1Picker,
} from './v1-harness.js';

const DTS_PATH = 'dist/location-picker.min.d.ts';
const TSC = resolve('node_modules/typescript/bin/tsc');
const BUNDLE_SCRIPT = resolve('test/compat/bundle-v1.mjs');
const built = existsSync(DIST_PATH) && existsSync(DTS_PATH);

let project = '';

beforeAll(() => {
  if (!built) return;
  project = mkdtempSync(join(tmpdir(), 'lp-v1-consumer-'));
  const [pack]: { filename: string }[] = JSON.parse(
    execFileSync('npm', ['pack', '--ignore-scripts', '--json', '--pack-destination', project], {
      encoding: 'utf8',
    }),
  );
  mkdirSync(join(project, 'node_modules'));
  execFileSync('tar', [
    '-xzf',
    join(project, pack?.filename ?? ''),
    '-C',
    join(project, 'node_modules'),
  ]);
  renameSync(join(project, 'node_modules/package'), join(project, 'node_modules/location-picker'));
  writeFileSync(join(project, 'package.json'), '{ "name": "v1-consumer", "private": true }\n');
}, 60_000);

afterAll(() => {
  if (project) rmSync(project, { recursive: true, force: true });
});

/** Runs plain Node (no DOM) in the temp project and returns its stdout. */
function node(args: string[]): string {
  return execFileSync(process.execPath, args, { cwd: project, encoding: 'utf8' });
}

function v1Styles(): number {
  return document.querySelectorAll('style[data-location-picker="v1"]').length;
}

/** The Google stub plus a #map target, as on a v1 page. */
function setUpPage(): { stub: GoogleStub; target: HTMLElement } {
  const stub = installGoogleStub();
  const target = document.createElement('div');
  target.id = 'map';
  document.body.append(target);
  return { stub, target };
}

describe.skipIf(!built)('packed tarball (needs `npm run build`)', () => {
  afterEach(() => {
    const stub: GoogleStub | undefined = Reflect.get(globalThis, 'lpGoogleStub');
    stub?.uninstall();
    document.head.replaceChildren();
    document.body.replaceChildren();
    Reflect.deleteProperty(globalThis, '__v1Bundle');
  });

  it('WP1-02: require() of location-picker/v1 and the deep path returns the constructor in plain Node', () => {
    const out = node([
      '-e',
      `const a = require('location-picker/v1');
       const b = require('location-picker/dist/location-picker.min.js');
       console.log(JSON.stringify([typeof a, a === b, typeof a.prototype.getMarkerPosition]));`,
    ]);
    expect(JSON.parse(out)).toEqual(['function', true, 'function']);
  });

  it('WP1-02: new X(el) over the Google stub has the v1 instance shape', () => {
    const { stub, target } = setUpPage();
    const require = createRequire(join(project, 'consumer.js'));
    for (const specifier of ['location-picker/v1', 'location-picker/dist/location-picker.min.js']) {
      const X: V1Constructor = require(specifier);
      expect(typeof X).toBe('function');
      const lp = new X(target, { setCurrentPosition: false });
      expect(lp.map).toBe(stub.stats.mapInstances.at(-1));
      expect(lp.element).toBe(target);
      for (const method of ['getMarkerPosition', 'setLocation', 'setCurrentPosition'] as const) {
        expect(typeof lp[method]).toBe('function');
      }
    }
  });

  it('WP1-03: Node ESM default-imports the constructor from both paths', () => {
    const out = node([
      '--input-type=module',
      '-e',
      `import a from 'location-picker/v1';
       import b from 'location-picker/dist/location-picker.min.js';
       console.log(JSON.stringify([typeof a, a === b]));`,
    ]);
    expect(JSON.parse(out)).toEqual(['function', true]);
  });

  describe('WP1-04: bundlers resolve the deep path to the v1 class', () => {
    const ENTRY = `import X from 'location-picker/dist/location-picker.min.js';
globalThis.__v1Bundle = { X, picker: new X(document.getElementById('map'), { setCurrentPosition: false }) };
`;

    const V1 = evaluateV1();

    function runBundle(bundler: 'esbuild' | 'rolldown'): string {
      const entry = join(project, 'entry.mjs');
      writeFileSync(entry, ENTRY);
      const { version, code }: { version: string; code: string } = JSON.parse(
        node([BUNDLE_SCRIPT, bundler, entry, project]),
      );

      const { stub, target } = setUpPage();
      const stylesBefore = v1Styles();
      runInThisContext(code);
      const { X, picker }: { X: V1Constructor; picker: V1Picker } = Reflect.get(
        globalThis,
        '__v1Bundle',
      );
      // Bundlers reformat the code, so compare the class by its surface and behaviour, not its source text.
      expect(X.length).toBe(V1.length);
      expect(Object.getOwnPropertyNames(X.prototype)).toEqual(
        Object.getOwnPropertyNames(V1.prototype),
      );
      expect(v1Styles()).toBe(stylesBefore + 1);
      expect(picker.map).toBe(stub.stats.mapInstances[0]);
      expect(picker.element).toBe(target);
      expect(target.querySelector('.centerMarker')?.parentElement).toBe(target.children[0]);
      expect(picker.getMarkerPosition()).toEqual({ lat: 34.4346, lng: 35.8362 });
      picker.setLocation(95, 540);
      expect(picker.getMarkerPosition()).toEqual({ lat: 90, lng: -180 });
      return version;
    }

    it('esbuild 0.28', () => {
      expect(runBundle('esbuild')).toMatch(/^0\.28\./);
    });

    it('rolldown', () => {
      expect(runBundle('rolldown')).toMatch(/^\d+\./);
    });
  });

  describe('WP1-14: consumer types without @types/google.maps (TS 7)', () => {
    const BODY = `
type IsAny<T> = 0 extends 1 & T ? true : false;
const options: locationPicker.Options = { setCurrentPosition: false, lat: 0, lng: 0 };
const lp: locationPicker = new locationPicker('map', options, { zoom: 3 });
const other = new legacyPath(document.body);
const mapIsAny: IsAny<typeof lp.map> = true;
const position: { lat: number; lng: number } = lp.getMarkerPosition();
const element: HTMLElement | null = other.element;
lp.setLocation(position.lat, position.lng);
// @ts-expect-error getMarkerPosition() returns { lat, lng }
const wrong: string = lp.getMarkerPosition();
// @ts-expect-error setCurrentPosition is a boolean option
new locationPicker('map', { setCurrentPosition: 'yes' });
export const used = [mapIsAny, element, wrong, other.setCurrentPosition()];
`;
    const CELLS = {
      'v1-esm': `import locationPicker from 'location-picker/v1';
import legacyPath from 'location-picker/dist/location-picker.min.js';
${BODY}`,
      'v1-require': `import locationPicker = require('location-picker/v1');
import legacyPath = require('location-picker/dist/location-picker.min.js');
${BODY}`,
    };
    // `import x = require()` is not ESM syntax (TS1202 under module esnext), so v1-require skips plain bundler mode.
    const MODES = [
      { mode: 'bundler', ext: '.ts', module: 'esnext', resolution: 'bundler', cells: ['v1-esm'] },
      {
        mode: 'nodenext-esm',
        ext: '.mts',
        module: 'nodenext',
        resolution: 'nodenext',
        cells: ['v1-esm', 'v1-require'],
      },
      {
        mode: 'nodenext-cjs',
        ext: '.cts',
        module: 'nodenext',
        resolution: 'nodenext',
        cells: ['v1-esm', 'v1-require'],
      },
      {
        mode: 'node16-cjs',
        ext: '.cts',
        module: 'node16',
        resolution: 'node16',
        cells: ['v1-esm', 'v1-require'],
      },
    ] as const;

    it('dist/location-picker.min.d.ts has no google.maps reference', () => {
      const dts = readFileSync(DTS_PATH, 'utf8');
      expect(dts).toBe(readFileSync('src/compat/v1.d.ts', 'utf8'));
      expect(dts).not.toContain('google');
      expect(dts).toContain('export = locationPicker;');
      expect(dts).toContain('export as namespace locationPicker;');
    });

    it.each(MODES.flatMap((m) => m.cells.map((cell) => ({ ...m, cell }))))(
      '$cell compiles in $mode mode with lp.map: any',
      ({ cell, mode, ext, module, resolution }) => {
        expect(existsSync(join(project, 'node_modules/@types/google.maps'))).toBe(false);
        const file = `${cell}-${mode}${ext}`;
        const config = `tsconfig.${cell}-${mode}.json`;
        writeFileSync(join(project, file), CELLS[cell]);
        writeFileSync(
          join(project, config),
          JSON.stringify({
            compilerOptions: {
              strict: true,
              noEmit: true,
              skipLibCheck: false,
              target: 'es2022',
              lib: ['es2022', 'dom'],
              module,
              moduleResolution: resolution,
              types: [],
            },
            files: [file],
          }),
        );
        const result = spawnSync(process.execPath, [TSC, '-p', config], {
          cwd: project,
          encoding: 'utf8',
        });
        expect(result.status, `${result.stdout}${result.stderr}`).toBe(0);
      },
    );
  });
});
