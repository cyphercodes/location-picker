// WP5-01: `npm run build` produces exactly the CONTRACT §1.2 file set. The snapshot is the npm tarball listing with
// dist/_chunks/* names collapsed (only chunk names may vary) and sourcemaps left out (scripts/pack-check.mjs checks
// those per output, since re-export facades and empty placeholders have none).
import { existsSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { packProject, skipUnbuilt, type PackedProject } from './packed.js';

const shape = (files: readonly string[]): string[] =>
  [
    ...new Set(
      files
        .filter((file) => !file.endsWith('.map'))
        .map((file) =>
          file.replace(/^dist\/_chunks\/[^/]+?((?:\.d)?\.[cm]?[jt]s)$/, 'dist/_chunks/*$1'),
        ),
    ),
  ].toSorted();

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? walk(join(dir, entry.name)) : [join(dir, entry.name)],
  );
}

describe.skipIf(skipUnbuilt)('WP5-01: package tree (needs `npm run build`)', () => {
  let packed: PackedProject;
  beforeAll(() => {
    packed = packProject('tree');
  }, 60_000);
  afterAll(() => packed?.dispose());

  it('the tarball holds exactly the §1.2 file set', () => {
    expect(shape(packed.files)).toMatchInlineSnapshot(`
      [
        "CHANGELOG.md",
        "LICENSE",
        "README.md",
        "custom-elements.json",
        "dist/_chunks/*.cjs",
        "dist/_chunks/*.d.cts",
        "dist/_chunks/*.d.mts",
        "dist/_chunks/*.mjs",
        "dist/core.cjs",
        "dist/core.d.cts",
        "dist/core.d.mts",
        "dist/core.mjs",
        "dist/element.cjs",
        "dist/element.d.cts",
        "dist/element.d.mts",
        "dist/element.mjs",
        "dist/global.d.ts",
        "dist/globals.d.ts",
        "dist/google.cjs",
        "dist/google.d.cts",
        "dist/google.d.mts",
        "dist/google.mjs",
        "dist/index.cjs",
        "dist/index.d.cts",
        "dist/index.d.mts",
        "dist/index.mjs",
        "dist/jsx/empty.js",
        "dist/jsx/preact.d.ts",
        "dist/jsx/react.d.ts",
        "dist/jsx/solid.d.ts",
        "dist/jsx/svelte.d.ts",
        "dist/jsx/vue.d.ts",
        "dist/leaflet.cjs",
        "dist/leaflet.d.cts",
        "dist/leaflet.d.mts",
        "dist/leaflet.mjs",
        "dist/location-picker.css",
        "dist/location-picker.global.js",
        "dist/location-picker.min.d.ts",
        "dist/location-picker.min.js",
        "dist/maplibre.cjs",
        "dist/maplibre.d.cts",
        "dist/maplibre.d.mts",
        "dist/maplibre.mjs",
        "dist/photon.cjs",
        "dist/photon.d.cts",
        "dist/photon.d.mts",
        "dist/photon.mjs",
        "dist/style.css.d.ts",
        "dist/utils.cjs",
        "dist/utils.d.cts",
        "dist/utils.d.mts",
        "dist/utils.mjs",
        "dist/webmcp.cjs",
        "dist/webmcp.d.cts",
        "dist/webmcp.d.mts",
        "dist/webmcp.mjs",
        "package.json",
        "skills/location-picker/SKILL.md",
      ]
    `);
  });

  it('everything the build wrote to dist/ is in the tarball', () => {
    const onDisk = walk('dist').map((file) => relative('.', file).split('\\').join('/'));
    expect(onDisk.filter((file) => !packed.files.includes(file))).toEqual([]);
  });

  // `npm run size` passes --ignore-missing so the combobox row tolerates the chunk's absence before WP3 lands; this
  // keeps that row from being skipped silently afterwards.
  it.skipIf(!existsSync('src/search/combobox.ts'))(
    'the lazy search combobox ships as its own chunk (the size-limit row path)',
    () => {
      const chunks = packed.files.filter((file) =>
        /^dist\/_chunks\/combobox-[^/]+\.mjs$/.test(file),
      );
      expect(chunks).toHaveLength(1);
    },
  );
});
