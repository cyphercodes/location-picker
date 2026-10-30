import { defineConfig } from '@playwright/test';

// Framework smoke apps (CONTRACT §13 WP5-12). Each app in smoke/<app>/ installs the PACKED tarball
// (smoke/location-picker.tgz, written by smoke.yml) and builds; smoke/<app>.spec.ts checks it in Chromium under the
// §12.6 route table (no real network). CI only: `SMOKE_APP=<app> npx playwright test -c smoke/playwright.config.ts`
// from the repository root (the route table serves Leaflet from the root node_modules).
const SERVERS: Record<string, string> = {
  'plain-html': 'node serve.mjs plain-html',
  'form-post': 'node form-post/server.mjs',
  react19: 'node serve.mjs react19/dist',
  vue3: 'node serve.mjs vue3/dist',
  angular: 'node angular/dist/smoke/server/server.mjs',
  svelte5: 'node serve.mjs svelte5/dist',
  preact: 'node serve.mjs preact/dist',
  solid: 'node serve.mjs solid/dist',
};

const app = process.env.SMOKE_APP;
const port = Number(process.env.SMOKE_PORT ?? 4300);
const command = app ? SERVERS[app] : undefined;
if (app && !command)
  throw new Error(`unknown SMOKE_APP ${app}: one of ${Object.keys(SERVERS).join(', ')}`);

export default defineConfig({
  testDir: '.',
  testMatch: app ? `${app}.spec.ts` : '*.spec.ts',
  outputDir: '../test-results/smoke',
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['list']] : [['list']],
  use: {
    baseURL: `http://127.0.0.1:${port}/`,
    browserName: 'chromium',
    viewport: { width: 1280, height: 800 },
    serviceWorkers: 'block',
    trace: 'retain-on-failure',
  },
  ...(command
    ? {
        webServer: {
          command,
          url: `http://127.0.0.1:${port}/`,
          env: { PORT: String(port) },
          reuseExistingServer: false,
          timeout: 60_000,
          stdout: 'pipe',
        },
      }
    : {}),
});
