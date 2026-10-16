import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

// WP2-04: in bare Node (no DOM), require() and import() of the utils and core ENTRY FILES succeed, and evaluating them
// touches no window/document/customElements/HTMLElement. The entries are bundled from src/ (CI runs unit tests before
// `npm run build`), in a child process because esbuild refuses to run inside jsdom's realm.
const DOM_GLOBALS = ['window', 'document', 'customElements', 'HTMLElement'];
const ENTRIES = ['utils', 'core'];

const BUILD = `
import { build } from 'esbuild';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
const [outdir] = process.argv.slice(1);
const cssInline = {
  name: 'css-inline',
  setup(b) {
    b.onResolve({ filter: /\\.css\\?inline$/ }, (a) => ({ path: resolve(a.resolveDir, a.path.replace('?inline', '')), namespace: 'css' }));
    b.onLoad({ filter: /.*/, namespace: 'css' }, async (a) => ({ contents: await readFile(a.path, 'utf8'), loader: 'text' }));
  },
};
for (const [format, ext] of [['esm', '.mjs'], ['cjs', '.cjs']]) {
  await build({
    entryPoints: ${JSON.stringify(Object.fromEntries(ENTRIES.map((e) => [e, `src/${e}.ts`])))},
    bundle: true, format, platform: 'neutral', target: 'es2022', outdir, outExtension: { '.js': ext },
    plugins: [cssInline], logLevel: 'error',
  });
}`;

// Throwing getters: merely evaluating `typeof document` or `window.foo` at module level fails the import.
const GUARD = `for (const name of ${JSON.stringify(DOM_GLOBALS)}) {
  Object.defineProperty(globalThis, name, { configurable: true, get() { throw new Error('touched ' + name); } });
}`;

let dir = '';
const node = (args: string[]): string =>
  execFileSync(process.execPath, args, { cwd: process.cwd(), encoding: 'utf8', stdio: 'pipe' });

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'lp-node-import-'));
  writeFileSync(join(dir, 'guard.cjs'), GUARD);
  node(['--input-type=module', '-e', BUILD, dir]);
}, 60_000);

afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});

const exportsOf = (mode: 'require' | 'import', entry: string): unknown => {
  const file = join(dir, `${entry}.${mode == 'require' ? 'cjs' : 'mjs'}`);
  const load =
    mode == 'require'
      ? `const m = require(${JSON.stringify(file)});`
      : `const m = await import(${JSON.stringify(file)});`;
  const script = `${load} console.log(JSON.stringify(Object.keys(m).sort()));`;
  return JSON.parse(
    node([
      '--require',
      join(dir, 'guard.cjs'),
      `--input-type=${mode == 'require' ? 'commonjs' : 'module'}`,
      '-e',
      script,
    ]),
  );
};

describe('bare Node with DOM globals that throw', () => {
  it('the guard really trips on DOM access', () => {
    expect(() => node(['--require', join(dir, 'guard.cjs'), '-e', 'typeof document'])).toThrow(
      /touched document/,
    );
  });

  const utils = ['formatLatLng', 'isLatLng', 'normalizeLatLng', 'parseLatLng'];

  it.each(['require', 'import'] as const)('%s(location-picker/utils) succeeds', (mode) => {
    expect(exportsOf(mode, 'utils')).toEqual(utils);
  });

  it.each(['require', 'import'] as const)('%s(location-picker/core) succeeds', (mode) => {
    expect(exportsOf(mode, 'core')).toEqual(
      expect.arrayContaining([
        ...utils,
        'LocationPicker',
        'LocationPickerError',
        'default',
        'version',
      ]),
    );
  });
});
