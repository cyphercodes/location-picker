// Playwright reporter that writes compat/compat.json (CONTRACT §12.8, WP5-10). Every test tagged with scenario ids
// (e2e/scenarios.ts) becomes one result per environment (= Playwright project, e2e/matrix.ts) and scenario.
// Screenshots are copied to compat/screenshots/<env>/<scenario>.png: workflow artifacts, never committed.
//
// It runs live (`COMPAT_REPORT=1 npx playwright test`) or over sharded blob reports
// (`npx playwright merge-reports --reporter ./e2e/compat-reporter.ts <dir>`); both see the same suite. Output
// directory: COMPAT_OUT_DIR (default `compat`).
import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { FullConfig, FullResult, Reporter, Suite, TestCase } from '@playwright/test/reporter';
import { REAL_HARDWARE, validateCompatReport } from '../scripts/compat-report.mjs';
import type { CompatEnvironment, CompatReport, CompatResult } from '../src/internal/contracts.js';
import type { MatrixEnvironment } from './matrix.js';
import {
  BROWSER_VERSION_ANNOTATION,
  SCENARIOS,
  SCREENSHOT_ATTACHMENT,
  scenarioIdsOf,
} from './scenarios.js';

export const NOT_COVERED: readonly string[] = [
  REAL_HARDWARE,
  'Branded browsers (Chrome, Edge, Safari, Samsung Internet): the runs use the Playwright builds of Chromium, Firefox and WebKit',
  'Real screen readers (VoiceOver, TalkBack, NVDA, JAWS): only the accessibility tree is checked',
  'Google Maps with a real API key: the Maps JavaScript API is mocked',
  'Live OpenStreetMap tiles, Photon and jsDelivr: every external request is answered by a local fixture',
];

/** One test of one environment, as the reporter saw its final outcome. */
export interface RunTest {
  readonly env: MatrixEnvironment;
  readonly title: string;
  readonly tags: readonly string[];
  readonly outcome: 'expected' | 'unexpected' | 'flaky' | 'skipped';
  readonly durationMs: number;
  readonly browserVersion?: string;
  /** Why it was skipped (a `skip` annotation), when it was. */
  readonly skipReason?: string;
  /** Absolute path of the reference screenshot, or of the failure screenshot. */
  readonly screenshot?: string;
}

export interface RunMeta {
  readonly generatedAt: string;
  readonly packageVersion: string;
  readonly commit: string;
  readonly playwright: string;
  readonly node: string;
}

/** The report plus the screenshot copies it refers to (`to` is relative to the output directory). */
export interface BuiltReport {
  readonly report: CompatReport;
  readonly screenshots: readonly { readonly from: string; readonly to: string }[];
}

/** Aggregates per (environment, scenario): any failure fails, else any pass passes, else it is a skip. */
export function buildReport(
  environments: readonly MatrixEnvironment[],
  tests: readonly RunTest[],
  meta: RunMeta,
): BuiltReport {
  const versions = new Map<string, string>();
  for (const test of tests) {
    if (test.browserVersion && !versions.has(test.env.id)) {
      versions.set(test.env.id, test.browserVersion);
    }
  }
  const envs: CompatEnvironment[] = environments.map((env) => ({
    id: env.id,
    browser: env.browser,
    browserVersion: versions.get(env.id) ?? 'unknown',
    device: env.device,
    viewport: { width: env.viewport.width, height: env.viewport.height },
    dpr: env.dpr,
    input: env.input,
    emulated: true,
  }));

  const groups = new Map<string, { env: string; scenario: string; tests: RunTest[] }>();
  for (const test of tests) {
    for (const scenario of new Set(scenarioIdsOf(test.tags))) {
      const key = `${test.env.id}\u0000${scenario}`;
      const group = groups.get(key) ?? { env: test.env.id, scenario, tests: [] };
      group.tests.push(test);
      groups.set(key, group);
    }
  }

  const screenshots: { from: string; to: string }[] = [];
  const results: CompatResult[] = [];
  const envOrder = new Map(envs.map((env, i) => [env.id, i]));
  const scenarioOrder = new Map<string, number>(SCENARIOS.map((s, i) => [s.id, i]));
  const sorted = [...groups.values()].toSorted(
    (a, b) =>
      (envOrder.get(a.env) ?? 0) - (envOrder.get(b.env) ?? 0) ||
      (scenarioOrder.get(a.scenario) ?? 0) - (scenarioOrder.get(b.scenario) ?? 0),
  );
  for (const { env, scenario, tests: group } of sorted) {
    if (!envOrder.has(env)) continue;
    const failed = group.filter((t) => t.outcome === 'unexpected');
    const passed = group.filter((t) => t.outcome === 'expected' || t.outcome === 'flaky');
    const flaky = group.filter((t) => t.outcome === 'flaky');
    const status: CompatResult['status'] =
      failed.length > 0 ? 'fail' : passed.length > 0 ? 'pass' : 'skip';
    const note =
      status === 'fail'
        ? `failed: ${titles(failed)}`
        : status === 'skip'
          ? `skipped: ${[...new Set(group.map((t) => t.skipReason ?? t.title))].join('; ')}`
          : flaky.length > 0
            ? `passed on retry: ${titles(flaky)}`
            : undefined;
    const source = (status === 'fail' ? failed : passed).find((t) => t.screenshot)?.screenshot;
    const screenshot = source ? `screenshots/${env}/${scenario}.png` : undefined;
    if (source && screenshot) screenshots.push({ from: source, to: screenshot });
    results.push({
      env,
      scenario,
      status,
      durationMs: Math.round(group.reduce((sum, t) => sum + t.durationMs, 0)),
      ...(screenshot ? { screenshot } : {}),
      ...(note ? { note } : {}),
    });
  }

  const report: CompatReport = {
    schema: 1,
    generatedAt: meta.generatedAt,
    packageVersion: meta.packageVersion,
    commit: meta.commit,
    tools: { playwright: meta.playwright, node: meta.node },
    environments: envs,
    scenarios: SCENARIOS.map(({ id, title, tags, ownerWp }) => ({
      id,
      title,
      tags: [...tags],
      ownerWp,
    })),
    results,
    notCovered: NOT_COVERED,
  };
  return { report, screenshots };
}

function titles(tests: readonly RunTest[]): string {
  const names = [...new Set(tests.map((t) => t.title))];
  return names.length > 3
    ? `${names.slice(0, 3).join('; ')} (+${names.length - 3} more)`
    : names.join('; ');
}

function isMatrixEnvironment(value: unknown): value is MatrixEnvironment {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof Reflect.get(value, 'id') === 'string' &&
    typeof Reflect.get(value, 'browser') === 'string'
  );
}

function commitOf(): string {
  if (process.env.GITHUB_SHA) return process.env.GITHUB_SHA;
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  } catch {
    return 'unknown';
  }
}

export default class CompatReporter implements Reporter {
  private config: FullConfig | undefined;
  private root: Suite | undefined;
  private readonly outDir = resolve(process.env.COMPAT_OUT_DIR ?? 'compat');

  printsToStdio(): boolean {
    return false;
  }

  onBegin(config: FullConfig, suite: Suite): void {
    this.config = config;
    this.root = suite;
  }

  async onEnd(): Promise<{ status: FullResult['status'] } | undefined> {
    const config = this.config;
    const root = this.root;
    if (!config || !root) return undefined;

    const environments: MatrixEnvironment[] = [];
    const tests: RunTest[] = [];
    for (const projectSuite of root.suites) {
      const env: unknown = projectSuite.project()?.metadata?.env;
      if (!isMatrixEnvironment(env)) continue;
      environments.push(env);
      for (const test of projectSuite.allTests()) tests.push(runTest(env, test));
    }

    const pkg: { version?: unknown } = JSON.parse(readFileSync('package.json', 'utf8'));
    const version = typeof pkg.version === 'string' ? pkg.version : 'unknown';
    const { report, screenshots } = buildReport(environments, tests, {
      generatedAt: new Date().toISOString(),
      packageVersion: version,
      commit: commitOf(),
      playwright: config.version,
      node: process.version,
    });
    const errors = validateCompatReport(report);
    if (errors.length > 0) {
      console.error(`[compat] the report does not match CONTRACT §12.8:\n  ${errors.join('\n  ')}`);
      return { status: 'failed' };
    }

    rmSync(join(this.outDir, 'screenshots'), { recursive: true, force: true });
    for (const { from, to } of screenshots) {
      if (!existsSync(from)) continue;
      mkdirSync(join(this.outDir, to, '..'), { recursive: true });
      copyFileSync(from, join(this.outDir, to));
    }
    mkdirSync(this.outDir, { recursive: true });
    writeFileSync(join(this.outDir, 'compat.json'), `${JSON.stringify(report, null, 2)}\n`);
    const failed = report.results.filter((r) => r.status === 'fail').length;
    console.log(
      `[compat] ${join(this.outDir, 'compat.json')}: ${report.environments.length} environments, ` +
        `${report.results.length} results (${failed} failed), ${screenshots.length} screenshots`,
    );
    return undefined;
  }
}

function runTest(env: MatrixEnvironment, test: TestCase): RunTest {
  const last = test.results.at(-1);
  const annotations = [...test.annotations, ...(last?.annotations ?? [])];
  const attachments = test.results.flatMap((r) => r.attachments);
  const reference = attachments.find((a) => a.name === SCREENSHOT_ATTACHMENT && a.path);
  const failure = attachments.findLast((a) => a.name === 'screenshot' && a.path);
  return {
    env,
    title: test.titlePath().slice(2).join(' > '),
    tags: test.tags,
    outcome: test.outcome(),
    durationMs: last?.duration ?? 0,
    browserVersion: annotations.find((a) => a.type === BROWSER_VERSION_ANNOTATION)?.description,
    skipReason: annotations.find((a) => a.type === 'skip')?.description,
    screenshot: (reference ?? failure)?.path,
  };
}
