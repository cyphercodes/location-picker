import { playwright } from '@vitest/browser-playwright';
import type { BrowserContext } from 'playwright';
import { defineConfig } from 'vitest/config';
import { installRoutes, takeBlockedRequests, type RouteOptions } from './test/fixtures/routes.js';

// Test file convention (every work package follows it):
//   test/**/*.test.ts          unit project: Node + jsdom 30 (no FACE, no ResizeObserver, no real layout)
//   test/**/*.browser.test.ts  browser project: real Chromium, Firefox and WebKit through Playwright (FACE lives here)
// e2e/**/*.spec.ts belongs to Playwright (playwright.config.ts), never to vitest.
//
// Ports: every local server derives from LP_PORT (default 4173) so parallel runs can avoid collisions. The vitest
// browser server listens on LP_PORT + 1; the Playwright e2e static server on LP_PORT.
const port = Number(process.env.LP_PORT ?? 4173) + 1;

const routed = new WeakSet<BrowserContext>();

export default defineConfig({
  test: {
    // Vitest replaces CSS (including `?inline`) with '' by default; the core injects that string, so process it.
    css: { include: [/\.css$/, /\.css\?inline$/] },
    projects: [
      {
        extends: true,
        test: {
          name: 'unit',
          environment: 'jsdom',
          include: ['test/**/*.test.ts'],
          exclude: ['test/**/*.browser.test.ts'],
          setupFiles: ['test/setup/no-network.ts'],
        },
      },
      {
        extends: true,
        // Pre-bundled up front: discovering a dependency mid-run reloads the page and fails the running files.
        optimizeDeps: { include: ['axe-core', 'leaflet'] },
        test: {
          name: 'browser',
          include: ['test/**/*.browser.test.ts'],
          setupFiles: ['test/setup/no-network.ts', 'test/setup/no-network.browser.ts'],
          api: { host: '127.0.0.1', port, strictPort: true },
          browser: {
            enabled: true,
            // Only the headless shells are cached for playwright 1.63.0; headed Chromium would trigger a download.
            headless: true,
            provider: playwright(),
            instances: [{ browser: 'chromium' }, { browser: 'firefox' }, { browser: 'webkit' }],
            commands: {
              async lpInstallRoutes(ctx, options?: RouteOptions) {
                if (!options && routed.has(ctx.context)) return;
                routed.add(ctx.context);
                await installRoutes(ctx.context, options);
              },
              lpTakeBlockedRequests: (ctx) => takeBlockedRequests(ctx.context),
            },
          },
        },
      },
    ],
  },
});
