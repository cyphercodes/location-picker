import { defineConfig, type ReporterDescription } from '@playwright/test';
import { lpPort, HOST } from './e2e/harness/server.js';
import { selectMatrix, toProject } from './e2e/matrix.js';
import { SCENARIOS } from './e2e/scenarios.js';

// `npm run test:e2e`: the small PR matrix (AMENDMENTS A4). `npm run compat` (COMPAT_FULL=1): the full LOCKED 16 matrix,
// only the tests tagged with a compat scenario (e2e/scenarios.ts), reported into compat/compat.json.
//   COMPAT_BROWSER=chromium   one engine of the matrix (compat.yml runs one job per engine)
//   COMPAT_BLOB=<name>.zip    write a blob report instead (merged later by playwright merge-reports)
//   COMPAT_REPORT=1           also write compat/compat.json from a small-matrix run
// The static server listens on LP_PORT (default 4173); set it to run several checkouts in parallel.
const full = process.env.COMPAT_FULL === '1';
const blob = process.env.COMPAT_BLOB;
const compatReport = (full || process.env.COMPAT_REPORT === '1') && !blob;
const scenarioTags = new RegExp(SCENARIOS.map(({ id }) => `@${id}(?![\\w-])`).join('|'));

function reporters(): ReporterDescription[] {
  if (blob) return [['blob', { fileName: blob }], ['dot']];
  const base: ReporterDescription[] = process.env.CI ? [['github'], ['list']] : [['list']];
  return compatReport ? [...base, ['./e2e/compat-reporter.ts']] : base;
}

export default defineConfig({
  testDir: 'e2e',
  testMatch: '**/*.spec.ts',
  // The doc pages and the network canary are not compat scenarios; ci.yml runs them.
  testIgnore: full ? ['docs.spec.ts', 'harness/**'] : [],
  ...(full ? { grep: scenarioTags } : {}),
  outputDir: 'test-results',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: reporters(),
  globalSetup: './e2e/harness/global-setup.ts',
  use: {
    baseURL: `http://${HOST}:${lpPort()}/`,
    serviceWorkers: 'block',
    trace: 'retain-on-failure',
    ...(full ? { screenshot: 'only-on-failure' } : {}),
  },
  projects: selectMatrix().map(toProject),
});
