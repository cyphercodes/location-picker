// Checks that the npm tarball contains exactly the CONTRACT §1.2 file set (run after `npm run build`).
// Only dist/_chunks/* names may vary.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

const ENTRIES = [
  'index',
  'core',
  'element',
  'utils',
  'leaflet',
  'google',
  'maplibre',
  'photon',
  'webmcp',
];
const JSX = ['react', 'preact', 'solid', 'vue', 'svelte'];

const required = [
  ...ENTRIES.flatMap((e) => ['mjs', 'cjs', 'd.mts', 'd.cts'].map((ext) => `dist/${e}.${ext}`)),
  'dist/globals.d.ts',
  'dist/global.d.ts',
  'dist/location-picker.global.js',
  'dist/location-picker.min.js',
  'dist/location-picker.min.d.ts',
  'dist/location-picker.css',
  'dist/style.css.d.ts',
  ...JSX.map((j) => `dist/jsx/${j}.d.ts`),
  'dist/jsx/empty.js',
  'custom-elements.json',
  'package.json',
  'README.md',
  'CHANGELOG.md',
  'LICENSE',
];
const allowed = [
  /^dist\/_chunks\/[\w.-]+\.(mjs|cjs|d\.mts|d\.cts)$/,
  /^dist\/[\w.-]+\.(mjs|cjs|js)\.map$/,
  /^dist\/_chunks\/[\w.-]+\.(mjs|cjs)\.map$/,
  /^skills\//,
];

const [pack] = JSON.parse(
  execFileSync('npm', ['pack', '--dry-run', '--json', '--ignore-scripts'], { encoding: 'utf8' }),
);
const files = new Set(pack.files.map((f) => f.path));
const problems = [];

for (const file of required) if (!files.has(file)) problems.push(`missing: ${file}`);
for (const file of files) {
  if (!required.includes(file) && !allowed.some((re) => re.test(file)))
    problems.push(`unexpected: ${file}`);
}

// §1.2: every ESM, CJS and IIFE output ships a sourcemap with sourcesContent.
const NO_MAP = new Set(['dist/location-picker.min.js', 'dist/jsx/empty.js']);
// Placeholder outputs with no code yet produce no map; drop each line when its owner lands the real entry.
const PENDING_MAP = new Set([
  'dist/index.mjs', // WP4 (src/index.ts)
  'dist/index.cjs', // WP4 (src/index.ts)
  'dist/location-picker.global.js', // WP4 (src/global.ts)
]);
for (const file of files) {
  if (!/\.(mjs|cjs|js)$/.test(file) || NO_MAP.has(file) || PENDING_MAP.has(file)) continue;
  const mapFile = `${file}.map`;
  if (!files.has(mapFile)) problems.push(`missing sourcemap: ${mapFile}`);
  else if (!JSON.parse(readFileSync(mapFile, 'utf8')).sourcesContent?.length) {
    problems.push(`sourcemap without sourcesContent: ${mapFile}`);
  }
}
for (const file of files) {
  if (/\.d\.[cm]?ts$/.test(file) && readFileSync(file, 'utf8').includes('sourceMappingURL')) {
    problems.push(`declaration file names a sourcemap: ${file}`);
  }
}

const lock = readFileSync('test/compat/v1.lock', 'utf8').trim();
const sha = createHash('sha256').update(readFileSync('dist/location-picker.min.js')).digest('hex');
if (sha !== lock)
  problems.push(`frozen v1 file changed: sha256 ${sha} != test/compat/v1.lock ${lock}`);

if (problems.length) {
  console.error(`pack-check: ${problems.length} problem(s)\n  ${problems.join('\n  ')}`);
  process.exitCode = 1;
} else {
  console.log(`pack-check: ${files.size} files, §1.2 file set OK, v1 sha256 ${sha}`);
}
