// Browser project only (after no-network.ts): installs the §12.6 route table on the Playwright context and fails a
// test whose page requested a non-routed external URL that the in-page guard cannot see (CSS url(), new Image(),
// workers). The commands run in Node; they are defined in vitest.config.mts.
import { afterEach, beforeAll } from 'vitest';
import { commands } from 'vitest/browser';
import type { RouteOptions } from '../fixtures/routes.js';

declare module 'vitest/browser' {
  interface BrowserCommands {
    /** Installs the route table once per browser context; pass options to re-install a variant (fail/slow). */
    lpInstallRoutes(options?: RouteOptions): Promise<void>;
    /** Returns and clears the non-local requests the route table aborted. */
    lpTakeBlockedRequests(): Promise<string[]>;
  }
}

beforeAll(async () => {
  await commands.lpInstallRoutes();
});

afterEach(async () => {
  const blocked = await commands.lpTakeBlockedRequests();
  if (blocked.length) {
    throw new Error(`[no-network] the route table aborted:\n  ${blocked.join('\n  ')}`);
  }
});
