// Size attribution for `import { LocationPicker } from 'location-picker/core'` and for `location-picker/utils`.
//
//   node scripts/size-attribution.mjs              # src attribution + dist rows (run `npm run build` first for dist)
//   node scripts/size-attribution.mjs --marginal   # also brotli(bundle) - brotli(bundle without the module)
//   node scripts/size-attribution.mjs --ignore './_chunks/warnings-*'   # extra size-limit ignores (repeatable)
//   node scripts/size-attribution.mjs --json
//
// src: bundles the entry with esbuild (minified, tree-shaken, dynamic imports external) and prints bytesInOutput per
//   input module plus the bytes inside string literals and template chunks.
// dist: measures exactly what `npm run size` measures for the core and utils rows (same esbuild options, the same
//   ignore list read from .size-limit.json, brotli 11, minus size-limit's empty-project correction), then the same
//   with the --ignore extras, and lists every lazy chunk on its own.
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { brotliCompressSync, constants } from 'node:zlib';
import { parse, tokenizer } from 'acorn';
import esbuild from 'esbuild';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const extraIgnores = args.flatMap((arg, i) => (arg == '--ignore' ? [args[i + 1]] : []));
const brotli = (code) =>
  brotliCompressSync(code, { params: { [constants.BROTLI_PARAM_QUALITY]: 11 } }).length;
/**
 * size-limit's empty-project correction for `import` rows: ESBUILD_EMPTY_PROJECT_IMPORT_BROTLI (30), or
 * ESBUILD_EMPTY_PROJECT_IMPORT_IGNORE_BROTLI (182) when `ignore` made esbuild add its "Dynamic require of" shim.
 */
const emptyProject = (code, ignore) =>
  ignore.length && code.includes('Dynamic require of ') ? 182 : 30;

/** `?inline` CSS imports become a minified string (tsdown's CSS plugin does the same with lightningcss). */
const inlineCss = {
  name: 'inline-css',
  setup(build) {
    build.onResolve({ filter: /\.css\?inline$/ }, (a) => ({
      path: resolve(a.resolveDir, a.path.replace(/\?inline$/, '')),
      namespace: 'inline-css',
    }));
    build.onLoad({ filter: /.*/, namespace: 'inline-css' }, async (a) => {
      const css = await esbuild.build({
        entryPoints: [a.path],
        bundle: true,
        minify: true,
        write: false,
      });
      return {
        contents: `export default ${JSON.stringify(css.outputFiles[0].text.trim())}`,
        loader: 'js',
      };
    });
  },
};

/** Lazy chunks are separate downloads: the src view leaves every dynamic import() out. */
const dynamicExternal = {
  name: 'dynamic-external',
  setup(build) {
    build.onResolve({ filter: /.*/ }, (a) =>
      a.kind == 'dynamic-import' ? { path: a.path, external: true } : undefined,
    );
  },
};

const srcBuild = (entry, minifyWhitespace) =>
  esbuild.build({
    stdin: { contents: entry, resolveDir: root, sourcefile: 'entry.ts', loader: 'ts' },
    bundle: true,
    write: false,
    metafile: true,
    format: 'esm',
    platform: 'neutral',
    target: 'es2022',
    treeShaking: true,
    minifyIdentifiers: true,
    minifySyntax: true,
    minifyWhitespace,
    plugins: [inlineCss, dynamicExternal],
  });

function stringBytes(code) {
  let bytes = 0;
  for (const token of tokenizer(code, { ecmaVersion: 'latest', sourceType: 'module' }))
    if (token.type.label == 'string' || token.type.label == 'template')
      bytes += token.end - token.start;
  return bytes;
}

function stripComments(code) {
  const comments = [];
  parse(code, {
    ecmaVersion: 'latest',
    sourceType: 'module',
    onComment: (_, __, start, end) => comments.push([start, end]),
  });
  let out = '';
  let at = 0;
  for (const [start, end] of comments) {
    out += code.slice(at, start);
    at = end;
  }
  return out + code.slice(at);
}

/** brotli(bundle) - brotli(bundle without the module), per module, on a comment-free unminified-whitespace bundle. */
async function marginal(entry) {
  const code = (await srcBuild(entry, false)).outputFiles[0].text;
  // esbuild's `// path` markers delimit modules; strip every other comment after splitting.
  const parts = code.split(/^(?=\/\/ (?:src|inline-css|\(disabled\)))/m).map((part) => ({
    module: part.startsWith('// ')
      ? part.slice(3, part.indexOf('\n')).replace(/^inline-css:.*\/(?=src\/)/, '')
      : '(prelude)',
    code: stripCommentsSafe(part),
  }));
  const all = parts.map((p) => p.code).join('\n');
  const total = brotli(all);
  return parts
    .map((p, i) => ({
      module: p.module,
      brotli:
        total -
        brotli(
          parts
            .filter((_, j) => j != i)
            .map((q) => q.code)
            .join('\n'),
        ),
    }))
    .toSorted((a, b) => b.brotli - a.brotli);
}
/** A module slice is not always a parseable program on its own; fall back to a plain regex then. */
function stripCommentsSafe(part) {
  try {
    return stripComments(part);
  } catch {
    return part.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  }
}

async function attribute(entry, name) {
  const result = await srcBuild(entry, true);
  const output = Object.values(result.metafile.outputs)[0];
  const code = result.outputFiles[0].text;
  const modules = Object.entries(output.inputs)
    .filter(([, { bytesInOutput }]) => bytesInOutput > 0)
    .map(([path, { bytesInOutput }]) => {
      const module = path.replace(/^inline-css:/, '');
      return {
        module: module.startsWith('/') ? relative(root, module) : module,
        bytes: bytesInOutput,
      };
    })
    .toSorted((a, b) => b.bytes - a.bytes);
  return {
    name,
    minified: code.length,
    brotli: brotli(code),
    strings: stringBytes(code),
    modules,
    ...(args.includes('--marginal') && { brotliByModule: await marginal(entry) }),
  };
}

/** One .size-limit.json row, measured like @size-limit/esbuild + @size-limit/file do it. */
async function sizeLimitRow(row, ignore) {
  const path = join(root, row.path);
  if (!existsSync(path)) return null;
  const dir = mkdtempSync(join(tmpdir(), 'lp-size-'));
  try {
    const list = row.import == '*' ? 'all' : row.import.replace(/[{}]/g, '').trim();
    const imports = row.import == '*' ? '* as all' : row.import;
    writeFileSync(
      join(dir, 'index.js'),
      `import ${imports} from ${JSON.stringify(path)}\nconsole.log(${list})\n`,
    );
    const result = await esbuild.build({
      entryPoints: [join(dir, 'index.js')],
      bundle: true,
      write: false,
      outdir: dir,
      external: ignore,
      minifyIdentifiers: true,
      minifySyntax: true,
      minifyWhitespace: true,
      treeShaking: true,
    });
    const code = result.outputFiles.map((f) => f.text).join('');
    return {
      row: row.name,
      brotli: brotli(code) - emptyProject(code, ignore),
      minified: code.length,
    };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function lazyChunks() {
  const dir = join(root, 'dist', '_chunks');
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith('.mjs'))
    .map((f) => {
      const code = readFileSync(join(dir, f), 'utf8').replace(
        /\n\/\/# sourceMappingURL=.*\s*$/,
        '',
      );
      return { file: `_chunks/${f}`, raw: code.length, brotli: brotli(code) };
    });
}

const rows = JSON.parse(readFileSync(join(root, '.size-limit.json'), 'utf8')).filter((row) =>
  ['dist/core.mjs', 'dist/utils.mjs', 'dist/index.mjs'].includes(row.path),
);
const variants = [];
for (const row of rows) {
  const ignore = row.ignore ?? [];
  variants.push([row, ignore, 'as configured']);
  if (extraIgnores.length && row.path != 'dist/utils.mjs')
    variants.push([row, ignore.concat(extraIgnores), `+ ${extraIgnores.join(' ')}`]);
}
const dist = await Promise.all(
  variants.map(async ([row, ignore, label]) =>
    Object.assign((await sizeLimitRow(row, ignore)) ?? {}, { ignore: label }),
  ),
);
const report = {
  core: await attribute(`export { LocationPicker } from './src/core.ts';`, 'core'),
  utils: await attribute(`export * from './src/utils.ts';`, 'utils'),
  dist: dist.filter((d) => d.row),
  chunks: lazyChunks(),
};

if (args.includes('--json')) console.log(JSON.stringify(report, null, 2));
else {
  for (const part of [report.core, report.utils]) {
    console.log(
      `\nsrc ${part.name}: ${part.minified} B minified, ${part.brotli} B brotli, ${part.strings} B in string literals`,
    );
    for (const m of part.modules) console.log(`  ${String(m.bytes).padStart(6)}  ${m.module}`);
    if (part.brotliByModule) {
      console.log('  marginal brotli per module:');
      for (const m of part.brotliByModule)
        console.log(`  ${String(m.brotli).padStart(6)}  ${m.module}`);
    }
  }
  console.log('\ndist rows (as npm run size measures them):');
  for (const d of report.dist)
    console.log(`  ${String(d.brotli).padStart(6)} B  ${d.row}  [ignore ${d.ignore}]`);
  console.log('\ndist/_chunks (brotli each):');
  for (const c of report.chunks)
    console.log(`  ${String(c.brotli).padStart(6)} B  ${c.file} (${c.raw} B raw)`);
}
