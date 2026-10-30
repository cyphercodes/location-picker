// The standalone e2e/fixtures/google-maps-mock.js is generated from test/fixtures/google-maps-mock.ts (§12.6) and
// committed; this keeps the two in step. esbuild needs plain Node, so the check runs in a child process.
import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

describe('e2e/fixtures/google-maps-mock.js', () => {
  it('matches a fresh build of test/fixtures/google-maps-mock.ts', () => {
    const check = (): string =>
      execFileSync(process.execPath, ['test/fixtures/emit-google-maps-mock.mts', '--check'], {
        encoding: 'utf8',
        stdio: 'pipe',
      });
    expect(check).not.toThrow();
  }, 30_000);
});
