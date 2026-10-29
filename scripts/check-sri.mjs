// Release check (CONTRACT §13 WP5-13): the Leaflet files that keyless pickers load from jsDelivr still hash to the
// Subresource Integrity constants in src/providers/leaflet.ts. If they do not, the browser refuses the script and
// every default picker fails with ENGINE_LOAD_FAILED.
//
//   node scripts/check-sri.mjs                fetches the jsDelivr URLs (release workflow only: uses the network)
//   node scripts/check-sri.mjs --local        hashes node_modules/leaflet/dist instead (offline; the same bytes the
//                                             test routes serve for those URLs)
//   node scripts/check-sri.mjs --source <file>  reads the constants from another file
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { parseArgs } from 'node:util';

const ROOT = resolve(dirname(new URL(import.meta.url).pathname), '..');
const { values: args } = parseArgs({
  options: {
    local: { type: 'boolean', default: false },
    source: { type: 'string', default: join(ROOT, 'src/providers/leaflet.ts') },
  },
});

/** Reads `export const NAME = '...'` string constants (an optional type annotation is allowed). */
function readConstants(file) {
  if (!existsSync(file)) {
    throw new Error(`${file} does not exist; the Leaflet SRI constants live there (WP3).`);
  }
  const text = readFileSync(file, 'utf8');
  const constants = {};
  for (const [, name, value] of text.matchAll(
    /export const (\w+)\s*(?::[^=]+)?=\s*['"]([^'"]+)['"]/g,
  )) {
    constants[name] = value;
  }
  return constants;
}

function sri(integrity, bytes) {
  const algorithm = /^(sha256|sha384|sha512)-/.exec(integrity)?.[1];
  if (!algorithm) throw new Error(`unsupported integrity value: ${integrity}`);
  return `${algorithm}-${createHash(algorithm).update(bytes).digest('base64')}`;
}

async function download(url) {
  let lastError;
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      // oxlint-disable-next-line no-await-in-loop -- retries are sequential on purpose
      const response = await fetch(url, { signal: AbortSignal.timeout(30_000) });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      // oxlint-disable-next-line no-await-in-loop
      return Buffer.from(await response.arrayBuffer());
    } catch (error) {
      lastError = error;
      // oxlint-disable-next-line no-await-in-loop
      await new Promise((done) => setTimeout(done, attempt * 5000));
    }
  }
  throw new Error(`${url}: ${lastError?.message ?? lastError}`);
}

function readLocal(url, version) {
  const installed = JSON.parse(
    readFileSync(join(ROOT, 'node_modules/leaflet/package.json'), 'utf8'),
  ).version;
  if (installed !== version) {
    throw new Error(`node_modules/leaflet is ${installed}, the constants pin ${version}`);
  }
  const file = /\/dist\/([\w.-]+)$/.exec(url)?.[1];
  if (!file) throw new Error(`not a leaflet dist URL: ${url}`);
  return readFileSync(join(ROOT, 'node_modules/leaflet/dist', file));
}

let constants;
try {
  constants = readConstants(resolve(args.source));
} catch (error) {
  console.error(`check-sri: ${error.message}`);
  process.exit(1);
}
const version = constants.LEAFLET_VERSION;
let failed = false;
for (const kind of ['JS', 'CSS']) {
  const url = constants[`LEAFLET_${kind}_URL`];
  const expected = constants[`LEAFLET_${kind}_INTEGRITY`];
  if (!url || !expected) {
    console.error(`check-sri: LEAFLET_${kind}_URL or LEAFLET_${kind}_INTEGRITY not found`);
    failed = true;
    continue;
  }
  // oxlint-disable-next-line no-await-in-loop -- two small files, checked in order
  const bytes = args.local ? readLocal(url, version) : await download(url);
  const actual = sri(expected, bytes);
  const where = args.local ? 'node_modules/leaflet' : url;
  if (actual === expected) {
    console.log(`check-sri: ok ${where} ${actual}`);
  } else {
    console.error(`check-sri: MISMATCH ${where}\n  expected ${expected}\n  actual   ${actual}`);
    failed = true;
  }
}
process.exitCode = failed ? 1 : 0;
