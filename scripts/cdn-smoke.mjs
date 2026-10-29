// Post-publish CDN smoke (CONTRACT §13 WP5-13, A13.5): the URLs people paste into pages answer 200 with the expected
// file on unpkg and jsDelivr. CDNs pick up a new version within minutes, so failing URLs are retried with backoff
// until --max-wait runs out. On failure it prints the rollback command and exits 1.
//
//   node scripts/cdn-smoke.mjs --version 3.0.0 --rollback-to 2.1.0
//   node scripts/cdn-smoke.mjs --dry-run                prints the URL list for package.json's version
//
// Stable versions check the bare package, @<major>, @<major>/+esm and the pinned version. Prereleases are published
// under `next`, so the bare and @<major> URLs still serve `latest`: they check @next and the pinned version instead.
// Both check dist/location-picker.min.js pinned (byte-identical to test/compat/v1.lock) and unpinned, the URL
// that old pages load.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { parseArgs } from 'node:util';

const ROOT = resolve(dirname(new URL(import.meta.url).pathname), '..');
const PACKAGE = 'location-picker';
const V1_FILE = 'dist/location-picker.min.js';

const { values: args } = parseArgs({
  options: {
    version: { type: 'string' },
    'rollback-to': { type: 'string' },
    'max-wait': { type: 'string', default: '600' },
    'dry-run': { type: 'boolean', default: false },
  },
});
const version =
  args.version ?? JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).version;
const prerelease = version.includes('-');
const distTag = prerelease ? 'next' : 'latest';
const major = version.split('.')[0];
const maxWaitMs = Number(args['max-wait']) * 1000;
if (!(maxWaitMs >= 0)) throw new Error(`--max-wait takes seconds (got ${args['max-wait']})`);
const v1Sha = readFileSync(join(ROOT, 'test/compat/v1.lock'), 'utf8').trim();

const IIFE = {
  expect: 'script build (contains customElements.define)',
  test: ({ text }) => text.includes('customElements.define'),
};
// jsDelivr bundles the root entry, which defines the element (v2's ESM build does not).
const ESM = {
  expect: 'ES module of the root entry (exports, contains customElements.define)',
  test: ({ text }) => /\bexport\s*[{*]/.test(text) && text.includes('customElements.define'),
};
const V1 = {
  expect: 'frozen v1 file (contains locationPicker)',
  test: ({ text }) => text.includes('locationPicker'),
};
const V1_EXACT = {
  expect: `frozen v1 file (sha256 ${v1Sha.slice(0, 12)}…)`,
  test: ({ bytes }) => createHash('sha256').update(bytes).digest('hex') === v1Sha,
};

const aliases = prerelease ? ['next'] : ['', major];
const checks = [];
for (const [cdn, base] of [
  ['unpkg', 'https://unpkg.com'],
  ['jsdelivr', 'https://cdn.jsdelivr.net/npm'],
]) {
  for (const alias of aliases) {
    const spec = alias ? `${PACKAGE}@${alias}` : PACKAGE;
    checks.push({ url: `${base}/${spec}`, ...IIFE, alias: true });
    if (cdn === 'jsdelivr') checks.push({ url: `${base}/${spec}/+esm`, ...ESM, alias: true });
  }
  checks.push({ url: `${base}/${PACKAGE}@${version}`, ...IIFE });
  if (cdn === 'jsdelivr') checks.push({ url: `${base}/${PACKAGE}@${version}/+esm`, ...ESM });
  checks.push({ url: `${base}/${PACKAGE}@${version}/${V1_FILE}`, ...V1_EXACT });
  checks.push({ url: `${base}/${PACKAGE}/${V1_FILE}`, ...V1, alias: true });
}

function rollback() {
  if (args['rollback-to']) return `npm dist-tag add ${PACKAGE}@${args['rollback-to']} ${distTag}`;
  return prerelease
    ? `npm dist-tag rm ${PACKAGE} next`
    : `npm dist-tag add ${PACKAGE}@2.1.0 latest`;
}

console.log(`cdn-smoke: ${PACKAGE}@${version} (dist-tag ${distTag})`);
if (args['dry-run']) {
  for (const check of checks) console.log(`  ${check.url}\n      -> ${check.expect}`);
  console.log(`rollback on failure: ${rollback()}`);
  process.exit(0);
}

async function probe(check) {
  try {
    const response = await fetch(check.url, { signal: AbortSignal.timeout(30_000) });
    if (response.status !== 200) return `HTTP ${response.status}`;
    const bytes = Buffer.from(await response.arrayBuffer());
    // unpkg redirects aliases to the resolved version; jsDelivr reports it in a header.
    const served =
      response.headers.get('x-jsd-version') ?? /@([^/]+)\//.exec(response.url)?.[1] ?? '?';
    return check.test({ bytes, text: bytes.toString('utf8') })
      ? undefined
      : `served ${served}, which is not the ${check.expect}`;
  } catch (error) {
    return error.message;
  }
}

// jsDelivr caches alias URLs (bare, @major, unpinned files) for hours; a purge makes it resolve the new version.
await Promise.allSettled(
  checks
    .filter((check) => check.alias && check.url.startsWith('https://cdn.jsdelivr.net/'))
    .map((check) =>
      fetch(check.url.replace('https://cdn.jsdelivr.net/', 'https://purge.jsdelivr.net/'), {
        signal: AbortSignal.timeout(30_000),
      }),
    ),
);

const deadline = Date.now() + maxWaitMs;
let pending = checks;
let failures = new Map();
for (let delay = 10_000; ; delay = Math.min(delay * 2, 60_000)) {
  // oxlint-disable-next-line no-await-in-loop -- each round re-checks only the URLs still failing
  const results = await Promise.all(pending.map(probe));
  failures = new Map();
  pending = pending.filter((check, i) => {
    if (results[i]) failures.set(check.url, results[i]);
    else console.log(`ok   ${check.url}`);
    return Boolean(results[i]);
  });
  if (pending.length === 0 || Date.now() + delay > deadline) break;
  console.log(`cdn-smoke: ${pending.length} not ready, retrying in ${delay / 1000} s`);
  // oxlint-disable-next-line no-await-in-loop
  await new Promise((done) => setTimeout(done, delay));
}

if (failures.size) {
  for (const [url, why] of failures) console.error(`FAIL ${url}: ${why}`);
  console.error(
    `\ncdn-smoke: ${failures.size} of ${checks.length} URLs failed after ${Math.round(maxWaitMs / 1000)} s.` +
      `\nIf the published package is broken, move the dist-tag back (run locally; trusted publishing cannot):` +
      `\n  ${rollback()}`,
  );
  process.exit(1);
}
console.log(`cdn-smoke: all ${checks.length} URLs ok`);
