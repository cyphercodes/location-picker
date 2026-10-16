import { defineConfig } from '@playwright/test';
import { lpPort, HOST } from './e2e/harness/server.js';
import { FULL_MATRIX, SMALL_MATRIX, toProject } from './e2e/matrix.js';

// `npm run test:e2e`: the small PR matrix (AMENDMENTS A4). `npm run compat` (COMPAT_FULL=1): the full LOCKED 16 matrix.
// The static server listens on LP_PORT (default 4173); set it to run several checkouts in parallel.
const matrix = process.env.COMPAT_FULL === '1' ? FULL_MATRIX : SMALL_MATRIX;

export default defineConfig({
  testDir: 'e2e',
  testMatch: '**/*.spec.ts',
  outputDir: 'test-results',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['list']] : [['list']],
  globalSetup: './e2e/harness/global-setup.ts',
  use: {
    baseURL: `http://${HOST}:${lpPort()}/`,
    serviceWorkers: 'block',
    trace: 'retain-on-failure',
  },
  projects: matrix.map(toProject),
});
