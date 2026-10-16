// Every e2e test runs under the §12.6 route table: allowed external URLs are answered locally, anything else non-local
// is aborted and fails the test. Specs import { test, expect } from here, never from '@playwright/test' directly.
import { test as base, expect } from '@playwright/test';
import {
  installRoutes,
  takeBlockedRequests,
  type RouteOptions,
} from '../../test/fixtures/routes.js';

export interface NetworkFixture {
  /** Returns and clears the blocked requests (for tests that expect a block, like the canary). */
  takeBlocked(): string[];
}

export const test = base.extend<{ routeOptions: RouteOptions; network: NetworkFixture }>({
  /** Override per file or describe: `test.use({ routeOptions: { leaflet: 'fail' } })`. */
  routeOptions: [{}, { option: true }],
  network: [
    async ({ context, routeOptions }, use) => {
      await installRoutes(context, routeOptions);
      await use({ takeBlocked: () => takeBlockedRequests(context) });
      expect(takeBlockedRequests(context), 'non-local requests (add a route or a mock)').toEqual(
        [],
      );
    },
    { auto: true },
  ],
});

export { expect };
