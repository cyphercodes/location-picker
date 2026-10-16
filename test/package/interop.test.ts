// WP5-06: with the packed tarball, every exported subpath can be require()d and import()ed in plain Node (this file
// runs on each CI Node version: 22, 24, 26), and `require('location-picker').LocationPicker === .default`.
// Exports snapshot: each JS entry's runtime exports equal the api.d.ts names, in CJS and ESM alike (no leaked
// internals such as `$1` aliases or chunk helpers).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  API_EXPORTS,
  node,
  packProject,
  placeholder,
  skipUnbuilt,
  type PackedProject,
} from './packed.js';

type Load = { ok: true; keys: string[] } | { ok: false; error: string };
type Report = Record<string, { require: Load; import: Load }>;

// One child process per module system loads every subpath and reports its export names (or the error).
const LOADER = `
const subpaths = JSON.parse(process.argv[1]);
const report = {};
const describe = (value) => value && typeof value === 'object' ? Object.keys(value).sort() : [typeof value];
const settle = async (load) => {
  try { return { ok: true, keys: describe(await load()) }; }
  catch (error) { return { ok: false, error: String(error && error.stack || error) }; }
};
for (const [subpath, kind] of subpaths) {
  const specifier = 'location-picker' + subpath.slice(1);
  report[subpath] = {
    require: await settle(() => kind === 'css' ? require.resolve(specifier) : require(specifier)),
    import: await settle(async () => kind === 'css' ? import.meta.resolve(specifier)
      : kind === 'json' ? (await import(specifier, { with: { type: 'json' } })).default
      : await import(specifier)),
  };
}
console.log(JSON.stringify(report));
`;

describe.skipIf(skipUnbuilt)('packed tarball in plain Node (needs `npm run build`)', () => {
  let packed: PackedProject;
  let subpaths: [subpath: string, kind: 'js' | 'json' | 'css'][];
  let report: Report;

  beforeAll(() => {
    packed = packProject('interop');
    const manifest: { exports: Record<string, unknown> } = JSON.parse(
      readFileSync(join(packed.pkg, 'package.json'), 'utf8'),
    );
    subpaths = Object.keys(manifest.exports).map((subpath) => {
      const target = JSON.stringify(manifest.exports[subpath]);
      return [subpath, /\.css"/.test(target) ? 'css' : /\.json"/.test(target) ? 'json' : 'js'];
    });
    // An .mjs file gets both `require` (createRequire) and ESM `import.meta.resolve`.
    const script = `import { createRequire } from 'node:module';\nconst require = createRequire(import.meta.url);\n${LOADER}`;
    report = JSON.parse(
      node(packed.dir, ['--input-type=module', '-e', script, JSON.stringify(subpaths)]),
    );
  }, 60_000);
  afterAll(() => packed?.dispose());

  it('covers every exported subpath', () => {
    expect(Object.keys(report).toSorted()).toEqual(subpaths.map(([subpath]) => subpath).toSorted());
    expect(Object.keys(report)).toEqual(expect.arrayContaining(Object.keys(API_EXPORTS)));
  });

  describe('WP5-06: every subpath loads', () => {
    it.each(['require', 'import'] as const)('%s() of every exported subpath succeeds', (mode) => {
      const failures = Object.entries(report)
        .filter(([, result]) => !result[mode].ok)
        .map(([subpath, result]) => `${subpath}: ${JSON.stringify(result[mode])}`);
      expect(failures).toEqual([]);
    });

    it("require('location-picker').LocationPicker === .default (CJS and ESM, root and core)", () => {
      const out = node(packed.dir, [
        '--input-type=module',
        '-e',
        `import { createRequire } from 'node:module';
         const require = createRequire(import.meta.url);
         const checks = [];
         for (const id of ['location-picker', 'location-picker/core']) {
           const cjs = require(id);
           const esm = await import(id);
           checks.push(typeof cjs.LocationPicker, cjs.LocationPicker === cjs.default, esm.LocationPicker === esm.default);
         }
         console.log(JSON.stringify(checks));`,
      ]);
      expect(JSON.parse(out)).toEqual(['function', true, true, 'function', true, true]);
    });
  });

  describe('exports snapshot: runtime exports are exactly the api.d.ts names', () => {
    const cases = Object.entries(API_EXPORTS).flatMap(([subpath, names]) =>
      (['require', 'import'] as const).map((mode) => ({ subpath, mode, names })),
    );

    it.each(cases)('$subpath ($mode) exports no other names', ({ subpath, mode, names }) => {
      const result = report[subpath]?.[mode];
      if (!result?.ok) throw new Error(`${subpath} did not load: ${JSON.stringify(result)}`);
      expect(result.keys.filter((key) => !names.includes(key))).toEqual([]);
    });

    it.for(cases)('$subpath ($mode) exports every api.d.ts name', (row, ctx) => {
      const result = report[row.subpath]?.[row.mode];
      if (!result?.ok) throw new Error(`${row.subpath} did not load: ${JSON.stringify(result)}`);
      const missing = row.names.filter((name) => !result.keys.includes(name));
      const pending = placeholder(row.subpath);
      if (missing.length && pending) ctx.skip(`${pending}; missing: ${missing.join(', ')}`);
      expect(missing).toEqual([]);
    });
  });
});
