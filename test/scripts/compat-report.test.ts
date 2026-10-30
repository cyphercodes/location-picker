// WP5-10: the compat scenarios cover LOCKED 16, the reporter builds a compat.json that validates against CONTRACT
// §12.8, the validator rejects what the schema forbids, and COMPATIBILITY.md is generated with its header.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  REAL_HARDWARE,
  renderCompatibility,
  validateCompatReport,
} from '../../scripts/compat-report.mjs';
import { buildReport, type RunTest } from '../../e2e/compat-reporter.js';
import { FULL_MATRIX, SMALL_MATRIX, type MatrixEnvironment } from '../../e2e/matrix.js';
import { SCENARIOS, isScenarioId, scenarioIdsOf, scenarios } from '../../e2e/scenarios.js';

/**
 * The scenarios LOCKED 16 (BRIEF) and WP5-10 require, written out independently of e2e/scenarios.ts, plus the input
 * kinds of LOCKED 16 and the field-mode scenarios of AMENDMENTS A10.
 */
const REQUIRED: Record<string, readonly string[]> = {
  'form submit': ['form-submit'],
  'form reset': ['form-reset'],
  'form back/forward restore': ['form-restore'],
  'form required': ['form-required'],
  'inside <dialog>/modal': ['dialog'],
  'initialised while hidden then shown': ['hidden-then-shown'],
  'container resize/orientation change': ['resize-orientation'],
  'multiple pickers on one page': ['multiple-pickers'],
  'destroy/re-create (SPA route change)': ['destroy-recreate'],
  'element moved in the DOM': ['moved-element'],
  RTL: ['rtl'],
  'dark mode': ['dark-mode'],
  'reduced motion': ['reduced-motion'],
  '200% zoom': ['zoom-200'],
  'strict CSP page': ['strict-csp'],
  'tile/network failure': ['tile-failure', 'engine-load-failure'],
  'geolocation granted/denied/timeout/insecure context': [
    'geolocation-granted',
    'geolocation-denied',
    'geolocation-timeout',
    'geolocation-insecure',
  ],
  'iframe without allow="geolocation"': ['iframe-without-geolocation'],
  'slow engine load': ['slow-engine-load'],
  'mouse drag, touch drag': ['pan-drag'],
  'pinch, wheel': ['zoom-gesture'],
  'keyboard-only': ['keyboard-only'],
  'accessibility tree checks': ['a11y-tree'],
  'A10 field mode on phone viewports': ['field-phone'],
  'A10 open/confirm/cancel': ['field-open-confirm-cancel'],
  'A10 back button': ['field-back-button'],
  'A10 keyboard-only': ['field-keyboard'],
  'A10 screen reader': ['field-screen-reader'],
  'A10 rotation while open': ['field-rotation'],
  'A10 field inside a form inside a dialog': ['field-in-dialog-form'],
  'A10 auto switching at the breakpoint': ['field-auto-breakpoint'],
};

const META = {
  generatedAt: '2026-10-30T04:00:00.000Z',
  packageVersion: '3.0.0-alpha.0',
  commit: 'a48fdec0000000000000000000000000000000000',
  playwright: '1.63.0',
  node: 'v24.21.0',
};

const env = (id: string): MatrixEnvironment => {
  const found = FULL_MATRIX.find((entry) => entry.id === id);
  if (!found) throw new Error(`no ${id}`);
  return found;
};
const run = (overrides: Partial<RunTest> & Pick<RunTest, 'env' | 'tags'>): RunTest => ({
  title: 'a test',
  outcome: 'expected',
  durationMs: 100,
  ...overrides,
});

describe('compat scenarios (e2e/scenarios.ts)', () => {
  it.each(Object.entries(REQUIRED))('covers LOCKED 16: %s', (_, ids) => {
    expect(ids.filter((id) => !isScenarioId(id))).toEqual([]);
  });

  it('has unique, kebab-case ids and titles', () => {
    const ids = SCENARIOS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const s of SCENARIOS) {
      expect(s.id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
      expect(s.title.trim()).not.toBe('');
    }
  });

  it('turns ids into Playwright tags and back', () => {
    expect(scenarios('rtl', 'dark-mode')).toEqual({ tag: ['@rtl', '@dark-mode'] });
    expect(scenarioIdsOf(['@rtl', '@slow', 'dark-mode', '@nope'])).toEqual(['rtl', 'dark-mode']);
  });

  it('every scenario tag used by an e2e spec is a known scenario id', () => {
    const files = readdirSync('e2e', { recursive: true, encoding: 'utf8' }).filter((f) =>
      f.endsWith('.spec.ts'),
    );
    expect(files.length).toBeGreaterThan(0);
    let found = 0;
    const unknown: string[] = [];
    for (const file of files) {
      const text = readFileSync(join('e2e', file), 'utf8');
      // `tag: ['@rtl']` (or `tag: '@rtl'`) and title tags (`'RTL works @rtl'`); JSON-LD keys like '@type' are not tags.
      const tagged = [...text.matchAll(/\btag:\s*(\[[^\]]*\]|['"`][^'"`]*['"`])/g)].flatMap((m) =>
        [...(m[1] ?? '').matchAll(/@([a-z][a-z0-9-]*)/g)].map((t) => t[1] ?? ''),
      );
      const titled = [...text.matchAll(/\s@([a-z][a-z0-9-]*)['"`]/g)].map((m) => m[1] ?? '');
      const tags = [...tagged, ...titled];
      const called = [...text.matchAll(/\bscenarios\(([^)]*)\)/g)].flatMap((m) =>
        [...(m[1] ?? '').matchAll(/['"`]([^'"`]+)['"`]/g)].map((q) => q[1] ?? ''),
      );
      for (const id of [...tags, ...called]) {
        found += 1;
        if (!isScenarioId(id)) unknown.push(`${file}: ${id}`);
      }
    }
    expect(unknown).toEqual([]);
    expect(found).toBeGreaterThan(20);
  });
});

describe('the e2e matrix (e2e/matrix.ts)', () => {
  it('is 3 engines x 8 viewports x DPR 1/2/3 x mouse/touch plus 3 device profiles, with unique ids', () => {
    expect(FULL_MATRIX).toHaveLength(3 * 8 * 3 * 2 + 3);
    expect(new Set(FULL_MATRIX.map((e) => e.id)).size).toBe(FULL_MATRIX.length);
    expect(FULL_MATRIX.filter((e) => e.device).map((e) => e.device)).toEqual([
      'iPhone 15',
      'Pixel 9',
      'iPad Pro 11',
    ]);
    expect(SMALL_MATRIX.map((e) => e.id)).toEqual([
      'chromium-375x667-dpr2-touch',
      'chromium-1440x900-dpr1-mouse',
      'firefox-375x667-dpr2-touch',
      'firefox-1440x900-dpr1-mouse',
      'webkit-375x667-dpr2-touch',
      'webkit-1440x900-dpr1-mouse',
    ]);
  });
});

describe('buildReport (e2e/compat-reporter.ts)', () => {
  const desktop = env('chromium-1440x900-dpr1-mouse');
  const phone = env('webkit-iphone15-393x659-dpr3-touch');

  it('writes a §12.8 report for the whole full matrix, even with no results', () => {
    const { report } = buildReport(FULL_MATRIX, [], META);
    expect(validateCompatReport(report)).toEqual([]);
    expect(report.environments).toHaveLength(FULL_MATRIX.length);
    expect(report.scenarios.map((s) => s.id)).toEqual(SCENARIOS.map((s) => s.id));
    expect(report.notCovered).toContain(REAL_HARDWARE);
    expect(report.environments.every((e) => e.emulated && e.browserVersion === 'unknown')).toBe(
      true,
    );
  });

  it('aggregates per environment and scenario: a failure wins, then a pass, then a skip', () => {
    const { report, screenshots } = buildReport(
      [desktop, phone],
      [
        run({ env: desktop, tags: ['@form-submit', '@form-reset'], browserVersion: '150.0.1' }),
        run({
          env: desktop,
          tags: ['@form-submit'],
          outcome: 'unexpected',
          title: 'broken',
          screenshot: '/tmp/f.png',
        }),
        run({ env: desktop, tags: ['@rtl'], outcome: 'flaky', title: 'retried' }),
        run({ env: phone, tags: ['@rtl'], outcome: 'skipped', skipReason: 'no WebGL2' }),
        run({ env: phone, tags: ['@render'], screenshot: '/tmp/r.png', browserVersion: '26.0' }),
        run({ env: phone, tags: ['@slow', 'untagged'] }),
      ],
      META,
    );
    expect(validateCompatReport(report)).toEqual([]);
    expect(report.environments.map((e) => [e.id, e.browserVersion, e.input])).toEqual([
      [desktop.id, '150.0.1', 'mouse'],
      [phone.id, '26.0', 'touch'],
    ]);
    expect(report.results).toEqual([
      {
        env: desktop.id,
        scenario: 'form-submit',
        status: 'fail',
        durationMs: 200,
        screenshot: `screenshots/${desktop.id}/form-submit.png`,
        note: 'failed: broken',
      },
      { env: desktop.id, scenario: 'form-reset', status: 'pass', durationMs: 100 },
      {
        env: desktop.id,
        scenario: 'rtl',
        status: 'pass',
        durationMs: 100,
        note: 'passed on retry: retried',
      },
      {
        env: phone.id,
        scenario: 'render',
        status: 'pass',
        durationMs: 100,
        screenshot: `screenshots/${phone.id}/render.png`,
      },
      {
        env: phone.id,
        scenario: 'rtl',
        status: 'skip',
        durationMs: 100,
        note: 'skipped: no WebGL2',
      },
    ]);
    expect(screenshots).toEqual([
      { from: '/tmp/f.png', to: `screenshots/${desktop.id}/form-submit.png` },
      { from: '/tmp/r.png', to: `screenshots/${phone.id}/render.png` },
    ]);
  });
});

/** A valid report as plain JSON, for the validator cases to break. */
interface Mutable extends Record<string, unknown> {
  environments: Record<string, unknown>[];
  results: Record<string, unknown>[];
  scenarios: Record<string, unknown>[];
  notCovered: string[];
}
const firefox = env('firefox-320x568-dpr3-touch');
function valid(): Mutable {
  const { report } = buildReport([firefox], [run({ env: firefox, tags: ['@dialog'] })], META);
  return JSON.parse(JSON.stringify(report));
}
const cases: readonly [string, (r: Mutable) => void, string][] = [
  ['schema 2', (r) => void (r.schema = 2), 'schema: must be 1'],
  [
    'a local timestamp',
    (r) => void (r.generatedAt = '2026-10-30 04:00'),
    'generatedAt: must be an ISO',
  ],
  ['no commit', (r) => void (r.commit = ''), 'commit: must be a non-empty string'],
  [
    'DPR 1.5',
    (r) => void Object.assign(r.environments[0] ?? {}, { dpr: 1.5 }),
    'environments[0].dpr: must be one of 1, 2, 3',
  ],
  [
    'emulated false',
    (r) => void Object.assign(r.environments[0] ?? {}, { emulated: false }),
    'environments[0].emulated: must be true',
  ],
  [
    'a pen input',
    (r) => void Object.assign(r.environments[0] ?? {}, { input: 'pen' }),
    'environments[0].input: must be one of',
  ],
  [
    'an unknown browser',
    (r) => void Object.assign(r.environments[0] ?? {}, { browser: 'edge' }),
    'environments[0].browser',
  ],
  [
    'a fractional viewport',
    (r) => void Object.assign(r.environments[0] ?? {}, { viewport: { width: 1.5, height: 2 } }),
    'viewport.width',
  ],
  [
    'an extra key',
    (r) => void Object.assign(r.environments[0] ?? {}, { extra: 1 }),
    'environments[0]: unknown key extra',
  ],
  [
    'an unknown env',
    (r) => void Object.assign(r.results[0] ?? {}, { env: 'nope' }),
    'results[0].env: unknown environment',
  ],
  [
    'an unknown scenario',
    (r) => void Object.assign(r.results[0] ?? {}, { scenario: 'nope' }),
    'results[0].scenario: unknown',
  ],
  [
    'a flaky status',
    (r) => void Object.assign(r.results[0] ?? {}, { status: 'flaky' }),
    'results[0].status',
  ],
  [
    'a negative duration',
    (r) => void Object.assign(r.results[0] ?? {}, { durationMs: -1 }),
    'results[0].durationMs',
  ],
  [
    'an absolute screenshot',
    (r) => void Object.assign(r.results[0] ?? {}, { screenshot: '/tmp/x.png' }),
    'results[0].screenshot',
  ],
  [
    'a duplicate result',
    (r) => void r.results.push({ ...r.results[0] }),
    'results[1]: duplicate result',
  ],
  ['a duplicate scenario', (r) => void r.scenarios.push({ ...r.scenarios[0] }), 'duplicate id'],
  [
    'an unknown owner',
    (r) => void Object.assign(r.scenarios[0] ?? {}, { ownerWp: 'WP5' }),
    'scenarios[0].ownerWp',
  ],
  [
    'no real-hardware statement',
    (r) => void (r.notCovered = ['nothing']),
    `must include "${REAL_HARDWARE}"`,
  ],
];

describe('validateCompatReport (scripts/compat-report.mjs)', () => {
  it('accepts a valid report', () => {
    expect(validateCompatReport(valid())).toEqual([]);
  });

  it.each(cases)('rejects %s', (_, mutate, message) => {
    const report = valid();
    mutate(report);
    expect(validateCompatReport(report).join('\n')).toContain(message);
  });

  it('rejects what is not an object', () => {
    expect(validateCompatReport(null)).toEqual(['compat.json: not an object']);
    expect(validateCompatReport([])).toEqual(['compat.json: not an object']);
  });
});

describe('renderCompatibility (COMPATIBILITY.md)', () => {
  it('starts with the do-not-edit header and lists scenarios, environments and what is not covered', () => {
    const desktop = env('chromium-1440x900-dpr1-mouse');
    const { report } = buildReport(
      [desktop],
      [
        run({ env: desktop, tags: ['@render'], screenshot: '/tmp/r.png', browserVersion: '150.0' }),
        run({
          env: desktop,
          tags: ['@rtl'],
          outcome: 'unexpected',
          title: 'core.spec.ts > rtl | pipe',
        }),
      ],
      META,
    );
    const md = renderCompatibility(report);
    expect(md.split('\n')[0]).toBe(
      '<!-- Generated by scripts/compat-report.mjs from compat/compat.json. Do not edit: regenerate it. -->',
    );
    expect(md).toContain('**Generated file, do not edit.**');
    expect(md).toContain(
      '- Run: 2026-10-30 (`2026-10-30T04:00:00.000Z`), location-picker 3.0.0-alpha.0, commit `a48fdec00000`',
    );
    expect(md).toContain('| Renders the default picker and reaches ready | `render` | WP4 | 1/1 |');
    expect(md).toContain('| Right-to-left layout | `rtl` | WP2 | **0/1** |');
    expect(md).toContain('| Dark colour scheme | `dark-mode` | WP2 | no test yet |');
    expect(md).toContain(
      '| Inside a &lt;form&gt;: submit sends the value | `form-submit` | WP4 | no test yet |',
    );
    expect(md).toContain(
      `| \`${desktop.id}\` | Chromium | 150.0 | - | 1440x900 | 1 | mouse | 1 | 1 | 0 | \`screenshots/${desktop.id}/render.png\` |`,
    );
    expect(md).toContain(
      '| `chromium-1440x900-dpr1-mouse` | `rtl` | failed: core.spec.ts &gt; rtl \\| pipe |',
    );
    expect(md).toContain(`- ${REAL_HARDWARE}`);
  });
});
