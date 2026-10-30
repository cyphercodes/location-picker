import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

// WP4-01: in bare Node (no DOM), require() and import() of the root, element and webmcp ENTRY FILES succeed,
// defineLocationPicker() returns undefined and LocationPickerElement is a class. The entries are bundled from src/ in
// a child process (CI runs unit tests before `npm run build`; esbuild refuses to run inside jsdom's realm).
// window and document THROW when touched; HTMLElement and customElements are simply absent, as on a server: the
// element module reads `typeof HTMLElement` for its stub base, and the entries call defineLocationPicker().
const ENTRIES = ['index', 'element', 'webmcp'];

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

const GUARD = `for (const name of ['window', 'document']) {
  Object.defineProperty(globalThis, name, { configurable: true, get() { throw new Error('touched ' + name); } });
}
if (typeof HTMLElement != 'undefined' || typeof customElements != 'undefined') throw new Error('not a bare Node');`;

let dir = '';
const node = (args: string[]): string =>
  execFileSync(process.execPath, args, { cwd: process.cwd(), encoding: 'utf8', stdio: 'pipe' });

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'lp-element-import-'));
  writeFileSync(join(dir, 'guard.cjs'), GUARD);
  node(['--input-type=module', '-e', BUILD, dir]);
}, 60_000);

afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});

interface Probe {
  readonly keys: string[];
  readonly defined: string;
  readonly elementIsClass: boolean;
}

const probe = (mode: 'require' | 'import', entry: string): Probe => {
  const file = join(dir, `${entry}.${mode == 'require' ? 'cjs' : 'mjs'}`);
  const load =
    mode == 'require'
      ? `const m = require(${JSON.stringify(file)});`
      : `const m = await import(${JSON.stringify(file)});`;
  const script = `${load}
    const E = m.LocationPickerElement;
    console.log(JSON.stringify({
      keys: Object.keys(m).sort(),
      defined: typeof m.defineLocationPicker == 'function' ? String(m.defineLocationPicker()) : 'n/a',
      elementIsClass: typeof E == 'function' && /^class\\b/.test(Function.prototype.toString.call(E)),
    }));`;
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

describe('WP4-01 bare Node', () => {
  it.each(['require', 'import'] as const)('%s(location-picker) succeeds', (mode) => {
    const result = probe(mode, 'index');
    expect(result.keys).toEqual(
      expect.arrayContaining([
        'LocationPicker',
        'LocationPickerElement',
        'LocationPickerError',
        'default',
        'defineLocationPicker',
        'formatLatLng',
        'isLatLng',
        'normalizeLatLng',
        'parseLatLng',
        'version',
      ]),
    );
    expect(result.defined).toBe('undefined');
    expect(result.elementIsClass).toBe(true);
  });

  it.each(['require', 'import'] as const)('%s(location-picker/element) succeeds', (mode) => {
    const result = probe(mode, 'element');
    expect(result.keys).toEqual(['LocationPickerElement', 'defineLocationPicker']);
    expect(result.defined).toBe('undefined');
    expect(result.elementIsClass).toBe(true);
  });

  it.each(['require', 'import'] as const)('%s(location-picker/webmcp) succeeds', (mode) => {
    expect(probe(mode, 'webmcp').keys).toEqual(
      expect.arrayContaining(['isWebMcpSupported', 'registerWebMcpTools']),
    );
  });
});
