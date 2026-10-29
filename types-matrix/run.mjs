// Types matrix (CONTRACT §13 WP5-03, plus WP1-14 and WP4-18): every consumer cell in types-matrix/cells, compiled
// against the PACKED tarball with TypeScript 5.9.3 / 6.0.3 / 7.0.2 in four module modes, `strict`,
// `skipLibCheck: false`, `types: []`, once WITH and once WITHOUT @types/google.maps.
//
//   npm run types-matrix                       (needs `npm run build` first)
//   node types-matrix/run.mjs --ts 7.0.2 --mode bundler --cell root,core --google with --json report.json
//
// Expected: with @types/google.maps every cell passes; without it every cell passes except the Google ones, which
// may fail only with TS2688/TS2503. A failing cell whose source is still a placeholder (first line
// "// placeholder: owned by WPx") is reported as PENDING and does not fail the run; it counts as soon as the
// placeholder is replaced.
//
// TypeScript and the framework type packages are installed into a cache dir, never into the repo's devDependencies:
// $LP_TYPES_MATRIX_CACHE, default node_modules/.cache/lp-types-matrix. The first run needs the npm registry.
import { execFile, execFileSync } from 'node:child_process';
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { availableParallelism, tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { parseArgs } from 'node:util';

const ROOT = resolve(dirname(new URL(import.meta.url).pathname), '..');
const CELLS_DIR = join(ROOT, 'types-matrix/cells');
const CACHE = resolve(
  process.env.LP_TYPES_MATRIX_CACHE ?? join(ROOT, 'node_modules/.cache/lp-types-matrix'),
);

const TS_VERSIONS = ['5.9.3', '6.0.3', '7.0.2'];
/** Consumer-side type packages (exact versions; bump deliberately). */
const DEPS = {
  '@types/google.maps': '3.66.7',
  '@types/react': '19.3.0',
  preact: '11.0.1',
  'solid-js': '1.9.17',
  vue: '3.5.44',
  svelte: '5.57.2',
};
const GOOGLE_TYPES = '@types/google.maps';
/** The only errors a Google cell may report when @types/google.maps is absent. */
const MISSING_GOOGLE_CODES = new Set(['TS2688', 'TS2503']);

/** `ext` is the extension a `.ts` cell gets; `.tsx` cells take their format from the package.json `type`. */
const MODES = {
  bundler: { module: 'esnext', moduleResolution: 'bundler', ext: '.ts', type: 'module' },
  'nodenext-esm': { module: 'nodenext', moduleResolution: 'nodenext', ext: '.mts', type: 'module' },
  'nodenext-cjs': {
    module: 'nodenext',
    moduleResolution: 'nodenext',
    ext: '.cts',
    type: 'commonjs',
  },
  'node16-cjs': { module: 'node16', moduleResolution: 'node16', ext: '.cts', type: 'commonjs' },
};

const ELEMENT = ['src/element.ts', 'types/globals.d.ts'];
const ESM_ONLY_FRAMEWORK =
  'ESM-only framework types: a CommonJS file cannot import them under module node16 (TS1479/TS1541); ' +
  'nodenext-cjs covers CommonJS consumers';
/**
 * files: sources under cells/ (default `<name>.ts`); google: needs @types/google.maps; na: modes where the cell is
 * not valid TypeScript, with the reason; pending: placeholder files that excuse a failure until their owner lands
 * them; listed: declaration files that must be part of the program; compilerOptions: per-cell additions.
 */
const CELLS = {
  root: { pending: ['src/index.ts', ...ELEMENT] },
  core: {},
  'element-side-effect': { pending: ELEMENT },
  'element-types': { pending: ELEMENT },
  utils: {},
  leaflet: { pending: ['src/leaflet.ts'] },
  photon: { pending: ['src/photon.ts'] },
  maplibre: { pending: ['src/maplibre.ts'] },
  webmcp: { pending: ['src/webmcp.ts', ...ELEMENT] },
  style: {},
  'v1-require': {
    na: { bundler: 'TS1202: `import x = require()` is not ESM syntax under module esnext' },
  },
  'v1-esm': {},
  global: { pending: ['types/global.d.ts', 'src/global.ts'] },
  'global+google': { google: true, pending: ['types/global.d.ts', 'src/google.ts'] },
  google: { google: true, pending: ['src/google.ts'] },
  dual: {
    files: ['dual/esm.mts', 'dual/cjs.cts'],
    listed: ['dist/index.d.mts', 'dist/index.d.cts'],
    pending: ['src/index.ts', ...ELEMENT],
  },
  'jsx-react': {
    files: ['jsx-react.tsx'],
    compilerOptions: { jsx: 'react-jsx' },
    pending: ['src/jsx/react.d.ts', ...ELEMENT],
  },
  'jsx-preact': {
    files: ['jsx-preact.tsx'],
    compilerOptions: { jsx: 'react-jsx', jsxImportSource: 'preact' },
    pending: ['src/jsx/preact.d.ts', ...ELEMENT],
  },
  'jsx-solid': {
    files: ['jsx-solid.tsx'],
    compilerOptions: { jsx: 'preserve', jsxImportSource: 'solid-js' },
    na: { 'node16-cjs': ESM_ONLY_FRAMEWORK },
    pending: ['src/jsx/solid.d.ts', ...ELEMENT],
  },
  'jsx-vue': { pending: ['src/jsx/vue.d.ts', ...ELEMENT] },
  'jsx-svelte': {
    na: { 'node16-cjs': ESM_ONLY_FRAMEWORK },
    pending: ['src/jsx/svelte.d.ts', ...ELEMENT],
  },
};

const { values: args } = parseArgs({
  options: {
    ts: { type: 'string' },
    mode: { type: 'string' },
    cell: { type: 'string' },
    google: { type: 'string', default: 'both' },
    json: { type: 'string' },
    keep: { type: 'boolean', default: false },
  },
});
const pick = (all, list) => {
  if (!list) return all;
  const wanted = list.split(',');
  const unknown = wanted.filter((item) => !all.includes(item));
  if (unknown.length) throw new Error(`unknown: ${unknown.join(', ')} (known: ${all.join(', ')})`);
  return wanted;
};
const tsVersions = pick(TS_VERSIONS, args.ts);
const modes = pick(Object.keys(MODES), args.mode);
const cells = pick(Object.keys(CELLS), args.cell);
const variants =
  args.google === 'both' ? ['with', 'without'] : pick(['with', 'without'], args.google);

if (!existsSync(join(ROOT, 'dist/index.mjs'))) {
  console.error('types-matrix: dist/ is missing; run `npm run build` first.');
  process.exit(1);
}

// ---------------------------------------------------------------------------------------------------------------
// Cache: one install per TypeScript version (they cannot share a node_modules) and one for the type packages.

function ensureInstalled(dir, dependencies) {
  const stamp = join(dir, 'installed.json');
  const want = JSON.stringify(dependencies);
  if (existsSync(stamp) && readFileSync(stamp, 'utf8') === want) return;
  console.log(`types-matrix: installing ${Object.keys(dependencies).join(', ')} into ${dir}`);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ private: true, dependencies }));
  execFileSync(
    'npm',
    ['install', '--no-audit', '--no-fund', '--ignore-scripts', '--loglevel=error'],
    {
      cwd: dir,
      stdio: 'inherit',
    },
  );
  writeFileSync(stamp, want);
}

const tscOf = (version) => join(CACHE, `typescript-${version}/node_modules/typescript/bin/tsc`);
for (const version of tsVersions)
  ensureInstalled(join(CACHE, `typescript-${version}`), { typescript: version });
const depsDir = join(CACHE, 'deps/node_modules');
ensureInstalled(dirname(depsDir), DEPS);

// ---------------------------------------------------------------------------------------------------------------
// Workspace: per variant, node_modules = the extracted tarball (a real directory, so its own `react`/`google.maps`
// lookups resolve next to it) + symlinks to the cached packages (without @types/google.maps for "without").

const work = mkdtempSync(join(tmpdir(), 'lp-types-matrix-'));
const [pack] = JSON.parse(
  execFileSync('npm', ['pack', '--ignore-scripts', '--json', '--pack-destination', work], {
    cwd: ROOT,
    encoding: 'utf8',
  }),
);

function linkDeps(nodeModules, skip) {
  for (const entry of readdirSync(depsDir)) {
    if (entry.startsWith('.')) continue;
    if (entry.startsWith('@')) {
      mkdirSync(join(nodeModules, entry), { recursive: true });
      for (const child of readdirSync(join(depsDir, entry))) {
        if (`${entry}/${child}` !== skip) {
          symlinkSync(join(depsDir, entry, child), join(nodeModules, entry, child), 'dir');
        }
      }
    } else if (entry !== skip) {
      symlinkSync(join(depsDir, entry), join(nodeModules, entry), 'dir');
    }
  }
}

for (const variant of variants) {
  const nodeModules = join(work, variant, 'node_modules');
  mkdirSync(nodeModules, { recursive: true });
  execFileSync('tar', ['-xzf', join(work, pack.filename), '-C', nodeModules]);
  cpSync(join(nodeModules, 'package'), join(nodeModules, 'location-picker'), { recursive: true });
  rmSync(join(nodeModules, 'package'), { recursive: true });
  linkDeps(nodeModules, variant === 'without' ? GOOGLE_TYPES : undefined);
}

// ---------------------------------------------------------------------------------------------------------------
// Jobs

function placeholderOwner(file) {
  const path = join(ROOT, file);
  if (!existsSync(path)) return undefined;
  const first = readFileSync(path, 'utf8').split('\n', 1)[0] ?? '';
  return /placeholder/.test(first) ? (/owned by (WP\d)/.exec(first)?.[1] ?? '?') : undefined;
}

const jobs = [];
for (const variant of variants) {
  for (const ts of tsVersions) {
    for (const mode of modes) {
      for (const cell of cells) {
        const spec = CELLS[cell];
        const na = spec.na?.[mode];
        const dir = join(work, variant, ts, mode, cell);
        jobs.push({ variant, ts, mode, cell, spec, dir, na });
      }
    }
  }
}

function prepare({ spec, mode, cell, dir }) {
  const config = MODES[mode];
  mkdirSync(dir, { recursive: true });
  const files = (spec.files ?? [`${cell}.ts`]).map((source) => {
    const target = source.endsWith('.ts') ? source.replace(/\.ts$/, config.ext) : source;
    const name = target.split('/').pop();
    cpSync(join(CELLS_DIR, source), join(dir, name));
    return name;
  });
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ private: true, type: config.type }));
  const compilerOptions = {
    strict: true,
    noEmit: true,
    skipLibCheck: false,
    target: 'es2022',
    lib: ['es2022', 'dom', 'dom.iterable'],
    module: config.module,
    moduleResolution: config.moduleResolution,
    types: [],
    ...spec.compilerOptions,
  };
  writeFileSync(join(dir, 'tsconfig.json'), JSON.stringify({ compilerOptions, files }, null, 2));
}

function compile(job) {
  const start = Date.now();
  return new Promise((done) => {
    const argv = [tscOf(job.ts), '-p', join(job.dir, 'tsconfig.json'), '--pretty', 'false'];
    if (job.spec.listed) argv.push('--listFiles');
    execFile(
      process.execPath,
      argv,
      { cwd: job.dir, maxBuffer: 64 << 20 },
      (error, stdout, stderr) => {
        const output = `${stdout}${stderr}`;
        const codes = [...new Set([...output.matchAll(/error (TS\d+)/g)].map((m) => m[1]))];
        // tsc prints paths relative to the realpath of cwd; keep only the cell-relative part.
        const errors = output
          .split('\n')
          .filter((line) => /error TS\d+/.test(line))
          .map((line) => line.replace(/^.*\/(?:with|without)\/[^/]+\/[^/]+\/[^/]+\//, ''));
        const missing = (job.spec.listed ?? []).filter(
          (file) => !output.includes(`node_modules/location-picker/${file}`),
        );
        done({
          exit: error ? (error.code ?? 1) : 0,
          codes,
          errors,
          missing,
          ms: Date.now() - start,
        });
      },
    );
  });
}

function judge(job, result) {
  if (job.na) return { status: 'n/a', note: job.na };
  const passed = result.exit === 0 && result.missing.length === 0;
  const note = result.missing.length
    ? `not in the program: ${result.missing.join(', ')}`
    : result.errors.slice(0, 3).join(' | ');
  if (passed) return { status: 'pass' };
  if (
    job.variant === 'without' &&
    job.spec.google &&
    result.codes.length > 0 &&
    result.codes.every((code) => MISSING_GOOGLE_CODES.has(code))
  ) {
    return { status: 'expected', note: `without ${GOOGLE_TYPES}: ${result.codes.join(' ')}` };
  }
  const owners = (job.spec.pending ?? [])
    .map((file) => [file, placeholderOwner(file)])
    .filter(([, owner]) => owner);
  if (owners.length) {
    const why = owners.map(([file, owner]) => `${file} (${owner})`).join(', ');
    return { status: 'pending', note: `placeholder ${why}: ${note}` };
  }
  return { status: 'FAIL', note };
}

async function runAll() {
  for (const job of jobs) if (!job.na) prepare(job);
  const queue = [...jobs];
  const workers = Array.from({ length: Math.max(1, availableParallelism() - 1) }, async () => {
    for (let job = queue.shift(); job; job = queue.shift()) {
      // oxlint-disable-next-line no-await-in-loop -- each worker compiles one cell at a time
      const result = job.na ? { exit: 0, codes: [], errors: [], missing: [] } : await compile(job);
      Object.assign(job, result, judge(job, result));
    }
  });
  await Promise.all(workers);
}

const started = Date.now();
await runAll();

// ---------------------------------------------------------------------------------------------------------------
// Report

const SYMBOL = { pass: 'ok', expected: 'ok*', 'n/a': 'n/a', pending: 'PEND', FAIL: 'FAIL' };
for (const variant of variants) {
  const columns = tsVersions.flatMap((ts) => modes.map((mode) => [ts, mode]));
  console.log(`\n## ${variant} ${GOOGLE_TYPES}\n`);
  console.log(`| cell | ${columns.map(([ts, mode]) => `${ts} ${mode}`).join(' | ')} |`);
  console.log(`|---|${columns.map(() => '---').join('|')}|`);
  for (const cell of cells) {
    const row = columns.map(([ts, mode]) => {
      const job = jobs.find(
        (j) => j.variant === variant && j.ts === ts && j.mode === mode && j.cell === cell,
      );
      return SYMBOL[job.status];
    });
    console.log(`| ${cell} | ${row.join(' | ')} |`);
  }
}
console.log(
  '\nok* = fails only with TS2688/TS2503 because @types/google.maps is absent (allowed).',
);

const count = (status) => jobs.filter((job) => job.status === status).length;
const pendingCells = new Map();
for (const job of jobs.filter((j) => j.status === 'pending')) {
  pendingCells.set(job.cell, job.note.split(':')[0]);
}
if (pendingCells.size) {
  console.log('\nPENDING (failing only because a placeholder is not replaced yet):');
  for (const [cell, why] of pendingCells) console.log(`  ${cell}: ${why}`);
}
const failures = jobs.filter((job) => job.status === 'FAIL');
for (const job of failures) {
  console.error(`FAIL ${job.variant} ts${job.ts} ${job.mode} ${job.cell}: ${job.note}`);
}
console.log(
  `\ntypes-matrix: ${count('pass') + count('expected')} ok, ${count('pending')} pending, ` +
    `${failures.length} failed, ${count('n/a')} n/a (${jobs.length} cells, ${Math.round((Date.now() - started) / 1000)} s)`,
);

if (args.json) {
  const rows = jobs.map(({ variant, ts, mode, cell, status, note, codes, ms }) => ({
    variant,
    ts,
    mode,
    cell,
    status,
    note,
    codes,
    ms,
  }));
  writeFileSync(resolve(args.json), `${JSON.stringify(rows, null, 2)}\n`);
}
if (args.keep) console.log(`workspace kept at ${work}`);
else rmSync(work, { recursive: true, force: true });
process.exitCode = failures.length ? 1 : 0;
