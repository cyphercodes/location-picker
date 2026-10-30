// Doc snippet tests (CONTRACT §12.7, §13 WP5-11, AGENTS.md "Documentation code blocks"). Every fenced block of the
// README, site/llms.txt, skills/location-picker/SKILL.md and docs/*.md runs according to its info string.
//
//   npm run docs:test                                   all of it (needs `npm run build` first)
//   node scripts/extract-snippets.mjs --list            print every block and how it runs; checks nothing
//   node scripts/extract-snippets.mjs --no-browser      tagging rules and the Node-side runners only
//   node scripts/extract-snippets.mjs -- --workers=2    arguments after `--` go to Playwright
//
// Node side (this file): the tagging rules; ts/tsx type-checked with the repo's tsc (7.0.2) in a consumer project
// that holds the PACKED tarball; vue compiled with @vue/compiler-sfc, then type-checked with vue-tsc; php, python and
// bash syntax-checked; jsonc parsed. `<!-- doctest:project=… -->` blocks are checked standalone while their smoke
// app does not exist. Browser side (e2e/docs.spec.ts, Chromium): html, js, blade and django pages, from the manifest
// written here and passed in LP_DOCTEST.
//
// Consumer packages are installed once into $LP_DOCS_CACHE (default node_modules/.cache/lp-doctest), never into the
// repo's devDependencies; the first run needs the npm registry.
import { execFileSync, spawnSync } from 'node:child_process';
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
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { stripVTControlCharacters } from 'node:util';

const ROOT = resolve(dirname(new URL(import.meta.url).pathname), '..');
const CACHE = resolve(process.env.LP_DOCS_CACHE ?? join(ROOT, 'node_modules/.cache/lp-doctest'));
const AI_FILES = ['README.md', 'site/llms.txt', 'skills/location-picker/SKILL.md'];
/** The Playwright project the pages run in (e2e/matrix.ts; a mouse project, so the pan is a real drag). */
const BROWSER_PROJECT = 'chromium-1440x900-dpr1-mouse';

const BROWSER_KINDS = new Set(['html', 'js', 'blade', 'django']);
const NODE_KINDS = new Set(['ts', 'tsx', 'vue', 'php', 'python', 'bash', 'jsonc']);
const RUNNABLE = new Set([...BROWSER_KINDS, ...NODE_KINDS]);
const PROJECTS = new Set(['angular', 'next', 'nuxt', 'svelte', 'vue']);

/** Consumer-side packages (exact versions; the shared ones match types-matrix/run.mjs). */
const DEPS = {
  '@types/google.maps': '3.66.7',
  '@types/leaflet': '1.9.22',
  '@types/node': '22.20.5',
  '@types/react': '19.3.0',
  vue: '3.5.44',
  vite: '8.3.5',
  '@vitejs/plugin-vue': '6.0.10',
  'vue-tsc': '3.3.14',
  // vue-tsc drives the TypeScript JS API, which TypeScript 7 does not ship; ts/tsx blocks use the repo's 7.0.2.
  typescript: '6.0.3',
  svelte: '5.57.2',
  '@angular/core': '22.2.4',
  '@angular/common': '22.2.4',
  '@angular/forms': '22.2.4',
  '@angular/platform-browser': '22.2.4',
  rxjs: '7.8.2',
};

// ---------------------------------------------------------------------------------------------------------------
// Extraction

/** README, llms.txt and SKILL.md first, then docs/*.md in name order. */
export function docFiles(root = ROOT) {
  const docs = readdirSync(join(root, 'docs'))
    .filter((name) => name.endsWith('.md'))
    .toSorted()
    .map((name) => `docs/${name}`);
  return [...AI_FILES, ...docs].filter((file) => existsSync(join(root, file)));
}

const FENCE = /^( {0,3})(`{3,}|~{3,})(.*)$/;
const TAG = /^<!--\s*doctest:(.*?)\s*-->$/;
const PRETTIER_IGNORE_START = /^<!--\s*prettier-ignore-start\s*-->$/;

/**
 * Every fenced block of one Markdown file, with its doctest tag. A tag sits on the line before its fence; one blank
 * line between them and `<!-- prettier-ignore-start -->` lines around them are tolerated.
 */
export function extract(file, text) {
  const lines = text.replaceAll('\r\n', '\n').split('\n');
  const blocks = [];
  const problems = [];
  const usedTags = new Set();
  for (let i = 0; i < lines.length; i++) {
    const open = FENCE.exec(lines[i]);
    if (!open) continue;
    const [, indent, fence, rest] = open;
    if (fence[0] === '`' && rest.includes('`')) continue; // inline code, not a fence
    const lang = rest.trim().split(/\s+/)[0]?.toLowerCase() ?? '';
    const start = i;
    const body = [];
    let closed = false;
    for (i++; i < lines.length; i++) {
      const line = lines[i];
      const close = /^ {0,3}(`{3,}|~{3,})\s*$/.exec(line);
      if (close && close[1][0] === fence[0] && close[1].length >= fence.length) {
        closed = true;
        break;
      }
      body.push(line.startsWith(indent) ? line.slice(indent.length) : line.trimStart());
    }
    const line = start + 1;
    if (!closed) problems.push(`${file}:${line}: the fence is never closed`);
    const tag = tagBefore(lines, start, usedTags);
    const block = { id: `${file}:${line}`, file, line, lang, code: body.join('\n') };
    if (tag) {
      const parsed = parseTag(tag.text);
      if (parsed.error) problems.push(`${file}:${tag.line}: ${parsed.error}`);
      Object.assign(block, parsed.value);
    }
    blocks.push(block);
  }
  lines.forEach((content, index) => {
    if (/<!--\s*doctest:/.test(content) && !usedTags.has(index)) {
      problems.push(
        `${file}:${index + 1}: a doctest tag must be on the line before a fence (one blank line allowed)`,
      );
    }
  });
  return { blocks, problems };
}

function tagBefore(lines, fenceIndex, usedTags) {
  let blanks = 0;
  for (let j = fenceIndex - 1; j >= 0; j--) {
    const text = lines[j].trim();
    if (text === '') {
      if (++blanks > 1) return undefined;
    } else if (PRETTIER_IGNORE_START.test(text)) {
      continue;
    } else if (TAG.test(text)) {
      usedTags.add(j);
      return { text: TAG.exec(text)[1], line: j + 1 };
    } else {
      return undefined;
    }
  }
  return undefined;
}

function parseTag(text) {
  const skip = /^skip\s+"([^"]+)"$/.exec(text);
  if (skip) return { value: { skip: skip[1] } };
  const project = /^project=([a-z]+)$/.exec(text);
  if (project && PROJECTS.has(project[1])) return { value: { project: project[1] } };
  return {
    error: `unknown doctest tag "${text}" (use skip "reason" or project=${[...PROJECTS].join('|')})`,
  };
}

/** How a block runs: 'browser', 'node', 'project', 'text' or 'skip'. */
export function runnerOf(block) {
  if (block.skip) return 'skip';
  if (block.project) return 'project';
  if (BROWSER_KINDS.has(block.lang)) return 'browser';
  if (NODE_KINDS.has(block.lang)) return 'node';
  return 'text';
}

/** The tagging rules of §12.7. */
export function checkRules(file, blocks, text) {
  const problems = [];
  for (const block of blocks) {
    const where = `${block.id} (\`\`\`${block.lang})`;
    if (block.skip && !file.startsWith('docs/')) {
      problems.push(`${where}: doctest:skip is allowed only in docs/*.md (zero skips in ${file})`);
    }
    if (!block.lang && !block.skip) {
      problems.push(`${where}: a fence needs an info string (\`\`\`text for prose and output)`);
    } else if (
      !RUNNABLE.has(block.lang) &&
      block.lang !== 'text' &&
      !block.project &&
      !block.skip
    ) {
      problems.push(
        `${where}: no runner for \`\`\`${block.lang}; use one of ${[...RUNNABLE, 'text'].join(', ')}, or tag it`,
      );
    }
  }
  // A cross-check that does not trust the parser: a raw scan for fences with a runnable info string.
  const kinds = [...RUNNABLE].join('|');
  const rawFences = new RegExp(`^ {0,3}(\`{3,}|~{3,})\\s*(${kinds})\\s*$`, 'm');
  if (rawFences.test(text) && !blocks.some((block) => RUNNABLE.has(block.lang))) {
    problems.push(`${file}: 0 runnable blocks extracted from a file that contains some`);
  }
  const runnable = blocks.filter((block) =>
    ['browser', 'node', 'project'].includes(runnerOf(block)),
  );
  if (AI_FILES.includes(file) && runnable.length === 0) {
    problems.push(`${file}: needs at least one runnable block (WP5-11)`);
  }
  return problems;
}

// ---------------------------------------------------------------------------------------------------------------
// Browser pages (rendered here, loaded by e2e/docs.spec.ts)

const IIFE = '/dist/location-picker.global.js';
const LIBRARY_SCRIPT = /<script\b[^>]*\bsrc=["'][^"']*location-picker[^"']*["']/i;
/** What the template fixtures render for the bound inputs (§12.7). */
export const SEED = { lat: '48.8584', lng: '2.2945' };

const skeleton = (body, head = '') =>
  '<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n' +
  '<meta name="viewport" content="width=device-width, initial-scale=1">\n<title>doc snippet</title>\n' +
  `${head}</head>\n<body>\n${body}\n</body>\n</html>\n`;

/** Bare specifiers for `js` blocks: the built dist/ and the installed Leaflet, served by the e2e static server. */
const IMPORT_MAP = {
  imports: {
    'location-picker': '/dist/index.mjs',
    ...Object.fromEntries(
      ['core', 'element', 'utils', 'leaflet', 'google', 'maplibre', 'photon', 'webmcp'].map(
        (entry) => [`location-picker/${entry}`, `/dist/${entry}.mjs`],
      ),
    ),
    leaflet: '/node_modules/leaflet/dist/leaflet-src.esm.js',
  },
};

/** The page a browser block loads as, plus what the spec asserts beyond the html pass condition. */
export function pageFor(block) {
  const page = { id: block.id, lang: block.lang };
  if (block.lang === 'js') {
    const body =
      '<div id="map" style="height:300px"></div>\n<input id="lat" name="lat"><input id="lng" name="lng">\n' +
      `<script type="module">\n${block.code}\n</script>`;
    const head = `<script type="importmap">${JSON.stringify(IMPORT_MAP)}</script>\n`;
    return { ...page, html: skeleton(body, head) };
  }
  if (block.lang === 'blade' || block.lang === 'django') {
    let html = renderTemplate(block.code);
    // Fixture decision: a bare template (the §8b django block) is posted from a wrapping form.
    if (!/<form\b/i.test(html)) {
      html = `<form method="post" action="/echo">\n${html}\n<button type="submit">Save</button>\n</form>`;
    }
    if (!LIBRARY_SCRIPT.test(html)) html += `\n<script src="${IIFE}"></script>`;
    return {
      ...page,
      html: skeleton(html),
      seed: `${SEED.lat},${SEED.lng}`,
      fields: ['lat', 'lng'],
    };
  }
  const full = /^\s*(<!doctype|<html[\s>])/i.test(block.code);
  return { ...page, html: full ? block.code : skeleton(block.code) };
}

/** The §12.7 Blade/Django fixture substitution. */
export function renderTemplate(code) {
  return code
    .replaceAll(/\{\{--[\s\S]*?--\}\}/g, '')
    .replaceAll(/\{#[\s\S]*?#\}/g, '')
    .replaceAll(/\{%\s*load\b[\s\S]*?%\}\n?/g, '')
    .replaceAll(/@csrf\b/g, '<input type="hidden" name="_token" value="test">')
    .replaceAll(
      /@method\(\s*['"]([A-Za-z]+)['"]\s*\)/g,
      '<input type="hidden" name="_method" value="$1">',
    )
    .replaceAll(/@error\([\s\S]*?@enderror/g, '')
    .replaceAll(/\{\{\s*route\([\s\S]*?\}\}/g, '/echo')
    .replaceAll(/\{%\s*url\b[\s\S]*?%\}/g, '/echo')
    .replaceAll(/\{\{([\s\S]*?)\}\}/g, (_, expression) => fixtureValue(expression));
}

function fixtureValue(expression) {
  if (/old\(\s*['"]lat['"]|form\.lat\.value/.test(expression)) return SEED.lat;
  if (/old\(\s*['"]lng['"]|form\.lng\.value/.test(expression)) return SEED.lng;
  return '';
}

// ---------------------------------------------------------------------------------------------------------------
// Cause hints: which unfinished source files a failing block depends on

function placeholders() {
  const found = new Map();
  const walk = (dir) => {
    for (const entry of readdirSync(join(ROOT, dir), { withFileTypes: true })) {
      const path = `${dir}/${entry.name}`;
      if (entry.isDirectory()) walk(path);
      else if (/\.(ts|js)$/.test(entry.name)) {
        const first = readFileSync(join(ROOT, path), 'utf8').split('\n', 1)[0] ?? '';
        if (/placeholder/.test(first)) found.set(path, /owned by (WP\d)/.exec(first)?.[1] ?? '?');
      }
    }
  };
  walk('src');
  walk('types');
  if (!existsSync(join(ROOT, 'e2e/fixtures/google-maps-mock.js'))) {
    found.set('e2e/fixtures/google-maps-mock.js', 'WP3');
  }
  return found;
}

const ENTRY_FILES = {
  'location-picker': ['src/index.ts', 'src/element.ts', 'types/globals.d.ts'],
  'location-picker/element': ['src/element.ts', 'types/globals.d.ts'],
  'location-picker/leaflet': ['src/leaflet.ts'],
  'location-picker/google': ['src/google.ts'],
  'location-picker/maplibre': ['src/maplibre.ts'],
  'location-picker/photon': ['src/photon.ts'],
  'location-picker/webmcp': ['src/webmcp.ts'],
  'location-picker/jsx/react': ['src/jsx/react.d.ts'],
  'location-picker/jsx/vue': ['src/jsx/vue.d.ts'],
  'location-picker/jsx/svelte': ['src/jsx/svelte.d.ts'],
  'location-picker/jsx/solid': ['src/jsx/solid.d.ts'],
  'location-picker/jsx/preact': ['src/jsx/preact.d.ts'],
};

/** Source files a block needs, so a failure can name the unfinished work package. */
function dependsOn(block) {
  const files = new Set();
  const code = block.code;
  // html and template pages load the IIFE; js blocks import entries (below).
  if (block.lang !== 'js' && BROWSER_KINDS.has(block.lang)) {
    if (/<location-picker\b/.test(code)) {
      files.add('src/global.ts').add('src/element.ts');
      const google = /provider=["']google|api-key=|map-id=|YOUR_BROWSER_KEY/.test(code);
      if (google) files.add('src/google.ts').add('e2e/fixtures/google-maps-mock.js');
      else files.add('src/leaflet.ts');
      if (!google && /\b(search|reverse-geocode)\b/.test(code)) files.add('src/photon.ts');
    }
  }
  // `querySelector('location-picker')` and friends are typed by the HTMLElementTagNameMap augmentation.
  if (/['"]location-picker['"]\)/.test(code)) files.add('types/globals.d.ts').add('src/element.ts');
  for (const match of code.matchAll(/(?:from|import)\s+['"](location-picker[^'"]*)['"]/g)) {
    for (const file of ENTRY_FILES[match[1]] ?? []) files.add(file);
  }
  return [...files];
}

function causeNote(block, unfinished) {
  const pending = dependsOn(block)
    .filter((file) => unfinished.has(file))
    .map((file) => `${file} (${unfinished.get(file)})`);
  return pending.length ? `depends on unfinished ${pending.join(', ')}` : '';
}

// ---------------------------------------------------------------------------------------------------------------
// Consumer project: the packed tarball plus the cached consumer packages

function ensureInstalled(dir, dependencies) {
  const stamp = join(dir, 'installed.json');
  const want = JSON.stringify(dependencies);
  if (existsSync(stamp) && readFileSync(stamp, 'utf8') === want) return;
  console.log(`docs:test: installing ${Object.keys(dependencies).join(', ')} into ${dir}`);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ private: true, dependencies }));
  execFileSync(
    'npm',
    [
      'install',
      '--prefer-offline',
      '--no-audit',
      '--no-fund',
      '--ignore-scripts',
      '--loglevel=error',
    ],
    { cwd: dir, stdio: 'inherit' },
  );
  writeFileSync(stamp, want);
}

function createConsumer(work) {
  ensureInstalled(CACHE, DEPS);
  const [pack] = JSON.parse(
    execFileSync('npm', ['pack', '--ignore-scripts', '--json', '--pack-destination', work], {
      cwd: ROOT,
      encoding: 'utf8',
    }),
  );
  const nodeModules = join(work, 'node_modules');
  mkdirSync(nodeModules, { recursive: true });
  execFileSync('tar', ['-xzf', join(work, pack.filename), '-C', nodeModules]);
  cpSync(join(nodeModules, 'package'), join(nodeModules, 'location-picker'), { recursive: true });
  rmSync(join(nodeModules, 'package'), { recursive: true });
  const cached = join(CACHE, 'node_modules');
  for (const entry of readdirSync(cached)) {
    if (entry.startsWith('.')) continue;
    if (entry.startsWith('@')) {
      mkdirSync(join(nodeModules, entry), { recursive: true });
      for (const child of readdirSync(join(cached, entry))) {
        symlinkSync(join(cached, entry, child), join(nodeModules, entry, child), 'dir');
      }
    } else {
      symlinkSync(join(cached, entry), join(nodeModules, entry), 'dir');
    }
  }
  writeFileSync(join(work, 'package.json'), JSON.stringify({ private: true, type: 'module' }));
}

/** A block's file name in the consumer: README.md:319 -> README.md-L319.ts */
const fileNameOf = (block, ext) => `${block.file.replaceAll('/', '__')}-L${block.line}.${ext}`;

const BASE_OPTIONS = {
  strict: true,
  noEmit: true,
  skipLibCheck: true, // the package's own .d.ts files are checked by the types matrix (skipLibCheck: false)
  target: 'es2022',
  lib: ['es2022', 'dom', 'dom.iterable'],
  module: 'esnext',
  moduleResolution: 'bundler',
  moduleDetection: 'force', // each block is its own module, even without imports
  jsx: 'react-jsx',
  types: ['google.maps'],
};

/** tsc (or vue-tsc) over one group of blocks; returns the diagnostics per block id. */
function typeCheck(work, group, blocks, { compilerOptions = {}, shims = [], tsc, ext }) {
  const dir = join(work, group);
  mkdirSync(dir, { recursive: true });
  const byName = new Map();
  for (const block of blocks) {
    const name = fileNameOf(block, ext(block));
    writeFileSync(join(dir, name), block.code.endsWith('\n') ? block.code : `${block.code}\n`);
    byName.set(name, block);
  }
  shims.forEach((shim, i) => writeFileSync(join(dir, `shim-${i}.d.ts`), shim));
  const files = [...byName.keys(), ...shims.map((_, i) => `shim-${i}.d.ts`)];
  const tsconfig = { compilerOptions: { ...BASE_OPTIONS, ...compilerOptions }, files };
  writeFileSync(join(dir, 'tsconfig.json'), JSON.stringify(tsconfig, null, 2));
  const run = spawnSync(
    process.execPath,
    [...tsc, '-p', join(dir, 'tsconfig.json'), '--pretty', 'false'],
    {
      cwd: dir,
      encoding: 'utf8',
      maxBuffer: 64 << 20,
    },
  );
  const output = `${run.stdout}${run.stderr}`;
  const diagnostics = new Map(blocks.map((block) => [block.id, []]));
  const unmatched = [];
  for (const line of output.split('\n')) {
    const match = /([^/\s(]+)\((\d+),\d+\): error (TS\d+: .*)$/.exec(line);
    const block = match && byName.get(match[1]);
    if (block)
      diagnostics.get(block.id).push(`${block.file}:${block.line + Number(match[2])} ${match[3]}`);
    else if (/error TS\d+/.test(line)) unmatched.push(line.trim());
  }
  // Errors outside the blocks (a shim, the program setup) or a crash fail every block of the group.
  const attributed = [...diagnostics.values()].some((list) => list.length > 0);
  if (unmatched.length || (run.status !== 0 && !attributed)) {
    const why = unmatched.join(' | ') || output.trim() || `exit ${run.status}`;
    for (const list of diagnostics.values()) list.push(`${group}: ${why}`);
  }
  return diagnostics;
}

// ---------------------------------------------------------------------------------------------------------------
// Node-side runners

function nodeRequire() {
  return createRequire(join(CACHE, 'package.json'));
}

const tsExtension = (block) => (block.lang === 'tsx' ? 'tsx' : 'ts');

function runTypeScript(work, blocks, results) {
  const tsc = [join(ROOT, 'node_modules/typescript/bin/tsc')];
  const css = "declare module '*.css';\n";
  const groups = [
    ['ts', blocks.filter((b) => !b.project || b.project === 'next' || b.project === 'vue'), {}],
    [
      'angular',
      blocks.filter((b) => b.project === 'angular'),
      // Angular's own tsconfig defaults; standalone because smoke/angular is not wired in (WP5-12).
      { compilerOptions: { experimentalDecorators: true, useDefineForClassFields: false } },
    ],
    [
      'nuxt',
      blocks.filter((b) => b.project === 'nuxt'),
      {
        shims: [
          'declare function defineNuxtConfig(config: {\n' +
            '  vue?: { compilerOptions?: { isCustomElement?: (tag: string) => boolean } };\n' +
            '}): unknown;\n',
        ],
      },
    ],
  ];
  for (const [group, list, options] of groups) {
    if (!list.length) continue;
    const diagnostics = typeCheck(work, group, list, {
      tsc,
      ext: tsExtension,
      ...options,
      shims: [css, ...(options.shims ?? [])],
    });
    for (const block of list) {
      const errors = diagnostics.get(block.id);
      const how = block.project ? `tsc, standalone (${standaloneNote(block.project)})` : 'tsc 7';
      results.push(result(block, errors.length ? 'fail' : 'pass', how, errors));
    }
  }
}

function standaloneNote(project) {
  return existsSync(join(ROOT, 'smoke', project))
    ? `smoke/${project} is not wired into docs:test yet`
    : `smoke/${project} does not exist yet`;
}

async function runVue(work, blocks, results) {
  if (!blocks.length) return;
  const { parse, compileScript, compileTemplate } = await import(
    pathToFileURL(nodeRequire().resolve('vue/compiler-sfc')).href
  );
  const compiled = [];
  for (const block of blocks) {
    const errors = [];
    const filename = fileNameOf(block, 'vue');
    const { descriptor, errors: parseErrors } = parse(block.code, { filename });
    errors.push(...parseErrors.map((e) => `${block.id} parse: ${e.message ?? e}`));
    const compilerOptions = { isCustomElement: (tag) => tag === 'location-picker' };
    if (!errors.length) {
      try {
        if (descriptor.script || descriptor.scriptSetup) {
          compileScript(descriptor, {
            id: filename,
            inlineTemplate: true,
            templateOptions: { compilerOptions },
          });
        } else if (descriptor.template) {
          const out = compileTemplate({
            source: descriptor.template.content,
            filename,
            id: filename,
            compilerOptions,
          });
          errors.push(...out.errors.map((e) => `${block.id} template: ${e.message ?? e}`));
        }
      } catch (error) {
        errors.push(`${block.id} compile: ${error.message}`);
      }
    }
    if (errors.length) results.push(result(block, 'fail', '@vue/compiler-sfc', errors));
    else compiled.push(block);
  }
  if (!compiled.length) return;
  const vueTsc = nodeRequire().resolve('vue-tsc/bin/vue-tsc.js');
  const diagnostics = typeCheck(work, 'vue', compiled, {
    tsc: [vueTsc],
    ext: () => 'vue',
    shims: ["declare module '*.css';\n"],
    compilerOptions: { jsx: 'preserve' },
  });
  for (const block of compiled) {
    const errors = diagnostics.get(block.id);
    results.push(
      result(block, errors.length ? 'fail' : 'pass', '@vue/compiler-sfc + vue-tsc', errors),
    );
  }
}

async function runSvelte(blocks, results) {
  if (!blocks.length) return;
  const compiler = await import(pathToFileURL(nodeRequire().resolve('svelte/compiler')).href);
  const compile = compiler.compile ?? compiler.default.compile;
  for (const block of blocks) {
    const how = `svelte/compiler, standalone (${standaloneNote('svelte')})`;
    try {
      compile(block.code, { filename: fileNameOf(block, 'svelte'), generate: 'client' });
      results.push(result(block, 'pass', how));
    } catch (error) {
      results.push(result(block, 'fail', how, [`${block.id}: ${error.message}`]));
    }
  }
}

const SYNTAX = {
  php: {
    bin: 'php',
    args: ['-l'],
    ext: 'php',
    prepare: (code) => (/^\s*<\?php/.test(code) ? code : `<?php\n${code}`),
  },
  python: { bin: 'python3', args: ['-m', 'py_compile'], ext: 'py' },
  bash: { bin: 'bash', args: ['-n'], ext: 'sh' },
};

function runSyntax(work, blocks, results) {
  mkdirSync(join(work, 'syntax'), { recursive: true });
  for (const block of blocks) {
    const { bin, args, ext, prepare = (code) => code } = SYNTAX[block.lang];
    const how = `${bin} ${args.join(' ')}`;
    if (spawnSync(bin, ['--version'], { stdio: 'ignore' }).error) {
      // Locally a missing interpreter skips with a reason; in CI it is a failure (the runners have all three).
      const status = process.env.CI ? 'fail' : 'skip';
      results.push(result(block, status, how, [`${bin} is not installed`]));
      continue;
    }
    const path = join(work, 'syntax', fileNameOf(block, ext));
    writeFileSync(path, `${prepare(block.code)}\n`);
    const run = spawnSync(bin, [...args, path], { encoding: 'utf8' });
    const output = `${run.stdout}${run.stderr}`.trim();
    results.push(
      result(block, run.status === 0 ? 'pass' : 'fail', how, run.status === 0 ? [] : [output]),
    );
  }
}

function runJsonc(blocks, results) {
  for (const block of blocks) {
    try {
      JSON.parse(stripJsonComments(block.code));
      results.push(result(block, 'pass', 'JSONC parse'));
    } catch (error) {
      results.push(result(block, 'fail', 'JSONC parse', [`${block.id}: ${error.message}`]));
    }
  }
}

/** Removes // and /* *\/ comments outside strings (URLs inside strings keep their //). */
export function stripJsonComments(text) {
  let out = '';
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char === '"') {
      const end = endOfString(text, i);
      out += text.slice(i, end);
      i = end - 1;
    } else if (char === '/' && text[i + 1] === '/') {
      while (i < text.length && text[i] !== '\n') i++;
      out += '\n';
    } else if (char === '/' && text[i + 1] === '*') {
      const end = text.indexOf('*/', i + 2);
      i = end === -1 ? text.length : end + 1;
    } else {
      out += char;
    }
  }
  return out;
}

function endOfString(text, start) {
  for (let i = start + 1; i < text.length; i++) {
    if (text[i] === '\\') i++;
    else if (text[i] === '"') return i + 1;
  }
  return text.length;
}

// ---------------------------------------------------------------------------------------------------------------
// Browser runner

function runBrowser(work, blocks, unfinished, results, playwrightArgs) {
  const pages = blocks.map(pageFor);
  const manifest = join(work, 'manifest.json');
  writeFileSync(manifest, JSON.stringify({ pages }, null, 2));
  const report = join(work, 'playwright.json');
  const args = [
    'playwright',
    'test',
    'e2e/docs.spec.ts',
    `--project=${BROWSER_PROJECT}`,
    '--reporter=list,json',
    ...playwrightArgs,
  ];
  console.log(`\ndocs:test: ${pages.length} pages in Chromium (npx ${args.join(' ')})\n`);
  const run = spawnSync('npx', args, {
    cwd: ROOT,
    stdio: 'inherit',
    env: {
      ...process.env,
      LP_DOCTEST: manifest,
      PLAYWRIGHT_JSON_OUTPUT_FILE: report,
      PLAYWRIGHT_JSON_OUTPUT_NAME: report,
    },
  });
  const outcomes = existsSync(report)
    ? playwrightOutcomes(JSON.parse(readFileSync(report, 'utf8')))
    : new Map();
  for (const block of blocks) {
    const outcome = outcomes.get(block.id);
    if (!outcome) {
      results.push(
        result(block, 'fail', 'Chromium page', [`no result (playwright exit ${run.status})`]),
      );
    } else if (outcome.ok) {
      results.push(result(block, 'pass', 'Chromium page'));
    } else {
      const note = causeNote(block, unfinished);
      results.push(
        result(block, 'fail', 'Chromium page', [outcome.error, ...(note ? [note] : [])]),
      );
    }
  }
}

function playwrightOutcomes(report) {
  const outcomes = new Map();
  const visit = (suite) => {
    for (const spec of suite.specs ?? []) {
      const runs = spec.tests.flatMap((test) => test.results);
      const last = runs.at(-1);
      const ok = spec.ok && last?.status === 'passed';
      const error = stripVTControlCharacters(last?.error?.message ?? last?.status ?? 'no result')
        .split('\n')
        .filter(Boolean)
        .slice(0, 4)
        .join(' / ');
      outcomes.set(spec.title, { ok, error });
    }
    for (const child of suite.suites ?? []) visit(child);
  };
  for (const suite of report.suites ?? []) visit(suite);
  return outcomes;
}

// ---------------------------------------------------------------------------------------------------------------
// Report

function result(block, status, how, details = []) {
  return {
    id: block.id,
    file: block.file,
    line: block.line,
    lang: block.lang,
    status,
    how,
    details,
  };
}

function printReport(results, problems) {
  const order = { fail: 0, skip: 1, pass: 2 };
  const sorted = results.toSorted(
    (a, b) =>
      order[a.status] - order[b.status] || a.id.localeCompare(b.id, 'en', { numeric: true }),
  );
  console.log('\n## docs:test\n');
  for (const r of sorted) {
    console.log(
      `${r.status.toUpperCase().padEnd(4)}  ${r.id.padEnd(44)} ${r.lang.padEnd(7)} ${r.how}`,
    );
    for (const detail of r.details.slice(0, 6)) console.log(`        ${detail}`);
  }
  if (problems.length) {
    console.log('\nTagging rules (§12.7):');
    for (const problem of problems) console.log(`  FAIL ${problem}`);
  }
  const count = (status) => results.filter((r) => r.status === status).length;
  console.log(
    `\ndocs:test: ${count('pass')} passed, ${count('fail')} failed, ${count('skip')} skipped, ` +
      `${problems.length} rule violations`,
  );
}

// ---------------------------------------------------------------------------------------------------------------
// Main

async function main() {
  const argv = process.argv.slice(2);
  const dashDash = argv.indexOf('--');
  const own = dashDash === -1 ? argv : argv.slice(0, dashDash);
  const playwrightArgs = dashDash === -1 ? [] : argv.slice(dashDash + 1);
  const list = own.includes('--list');
  const browser = !own.includes('--no-browser');
  const jsonOut = own.includes('--json') ? own[own.indexOf('--json') + 1] : undefined;

  const blocks = [];
  const problems = [];
  for (const file of docFiles()) {
    const text = readFileSync(join(ROOT, file), 'utf8');
    const extracted = extract(file, text);
    blocks.push(...extracted.blocks);
    problems.push(...extracted.problems, ...checkRules(file, extracted.blocks, text));
  }

  if (list) {
    for (const block of blocks) {
      const tag = block.skip
        ? ` skip "${block.skip}"`
        : block.project
          ? ` project=${block.project}`
          : '';
      console.log(`${block.id.padEnd(44)} ${block.lang.padEnd(7)} ${runnerOf(block)}${tag}`);
    }
    for (const problem of problems) console.log(`FAIL ${problem}`);
    return;
  }

  if (!existsSync(join(ROOT, 'dist/index.mjs'))) {
    console.error('docs:test: dist/ is missing; run `npm run build` first.');
    process.exitCode = 1;
    return;
  }

  const unfinished = placeholders();
  const results = [];
  for (const block of blocks.filter((b) => runnerOf(b) === 'skip')) {
    results.push(result(block, 'skip', 'doctest:skip', [block.skip]));
  }

  const work = mkdtempSync(join(tmpdir(), 'lp-doctest-'));
  process.on('exit', () => rmSync(work, { recursive: true, force: true }));
  createConsumer(work);

  const byKind = (predicate) =>
    blocks.filter((b) => ['node', 'project'].includes(runnerOf(b)) && predicate(b));
  runTypeScript(
    work,
    byKind((b) => b.lang === 'ts' || b.lang === 'tsx'),
    results,
  );
  await runVue(
    work,
    byKind((b) => b.lang === 'vue'),
    results,
  );
  await runSvelte(
    byKind((b) => b.lang === 'svelte' && b.project === 'svelte'),
    results,
  );
  runSyntax(
    work,
    byKind((b) => b.lang in SYNTAX),
    results,
  );
  runJsonc(
    byKind((b) => b.lang === 'jsonc'),
    results,
  );
  for (const block of byKind(() => true)) {
    if (!results.some((r) => r.id === block.id)) {
      results.push(
        result(block, 'fail', 'none', [
          `no runner for \`\`\`${block.lang} with project=${block.project}`,
        ]),
      );
    }
  }
  // Node-side failures also get their cause hints.
  for (const r of results.filter((x) => x.status === 'fail')) {
    const note = causeNote(
      blocks.find((b) => b.id === r.id),
      unfinished,
    );
    if (note) r.details.push(note);
  }

  const pageBlocks = blocks.filter((b) => runnerOf(b) === 'browser');
  if (browser) runBrowser(work, pageBlocks, unfinished, results, playwrightArgs);
  else
    for (const block of pageBlocks)
      results.push(result(block, 'skip', 'Chromium page', ['--no-browser']));

  printReport(results, problems);
  if (jsonOut)
    writeFileSync(resolve(jsonOut), `${JSON.stringify({ results, problems }, null, 2)}\n`);
  const failed = results.some((r) => r.status === 'fail') || problems.length > 0;
  process.exitCode = failed ? 1 : 0;
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(new URL(import.meta.url).pathname)) {
  await main();
}
