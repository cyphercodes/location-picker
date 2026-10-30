// compat/compat.json (CONTRACT §12.8) -> COMPATIBILITY.md. The compat workflow writes compat.json through
// e2e/compat-reporter.ts; this script validates it and renders the generated page that the docs link to.
//
//   node scripts/compat-report.mjs              validate compat/compat.json and write COMPATIBILITY.md
//   node scripts/compat-report.mjs --check      fail when COMPATIBILITY.md is not what compat.json renders
//   node scripts/compat-report.mjs --in <file> --out <file>
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';

/** The statement `notCovered` must always carry (§12.8). */
export const REAL_HARDWARE = 'Real iOS/Android hardware (emulation only)';

const BROWSERS = ['chromium', 'firefox', 'webkit'];
const INPUTS = ['mouse', 'touch', 'keyboard'];
const STATUSES = ['pass', 'fail', 'skip'];
const OWNERS = ['WP1', 'WP2', 'WP3', 'WP4', 'WP6'];
const ISO_DATE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;

/** Every problem that makes `report` not a §12.8 CompatReport; empty when it is valid. */
export function validateCompatReport(report) {
  const errors = [];
  const fail = (path, message) => errors.push(`${path}: ${message}`);
  if (!isObject(report)) return ['compat.json: not an object'];

  exactKeys(
    report,
    'report',
    [
      'schema',
      'generatedAt',
      'packageVersion',
      'commit',
      'tools',
      'environments',
      'scenarios',
      'results',
      'notCovered',
    ],
    [],
    fail,
  );
  if (report.schema !== 1) fail('schema', `must be 1, got ${JSON.stringify(report.schema)}`);
  if (typeof report.generatedAt !== 'string' || !ISO_DATE.test(report.generatedAt)) {
    fail('generatedAt', 'must be an ISO 8601 UTC timestamp');
  } else if (Number.isNaN(Date.parse(report.generatedAt))) fail('generatedAt', 'is not a date');
  nonEmpty(report.packageVersion, 'packageVersion', fail);
  nonEmpty(report.commit, 'commit', fail);
  if (isObject(report.tools)) {
    exactKeys(report.tools, 'tools', ['playwright', 'node'], [], fail);
    nonEmpty(report.tools.playwright, 'tools.playwright', fail);
    nonEmpty(report.tools.node, 'tools.node', fail);
  } else fail('tools', 'must be an object');

  const envIds = new Set();
  list(report.environments, 'environments', fail).forEach((env, i) => {
    const at = `environments[${i}]`;
    if (!isObject(env)) {
      fail(at, 'must be an object');
      return;
    }
    exactKeys(
      env,
      at,
      ['id', 'browser', 'browserVersion', 'device', 'viewport', 'dpr', 'input', 'emulated'],
      [],
      fail,
    );
    unique(env.id, `${at}.id`, envIds, fail);
    oneOf(env.browser, `${at}.browser`, BROWSERS, fail);
    nonEmpty(env.browserVersion, `${at}.browserVersion`, fail);
    if (env.device !== null) nonEmpty(env.device, `${at}.device`, fail);
    if (isObject(env.viewport)) {
      exactKeys(env.viewport, `${at}.viewport`, ['width', 'height'], [], fail);
      for (const side of ['width', 'height']) {
        if (!Number.isInteger(env.viewport[side]) || env.viewport[side] <= 0) {
          fail(`${at}.viewport.${side}`, 'must be a positive integer');
        }
      }
    } else fail(`${at}.viewport`, 'must be an object');
    oneOf(env.dpr, `${at}.dpr`, [1, 2, 3], fail);
    oneOf(env.input, `${at}.input`, INPUTS, fail);
    if (env.emulated !== true) fail(`${at}.emulated`, 'must be true');
  });

  const scenarioIds = new Set();
  list(report.scenarios, 'scenarios', fail).forEach((scenario, i) => {
    const at = `scenarios[${i}]`;
    if (!isObject(scenario)) {
      fail(at, 'must be an object');
      return;
    }
    exactKeys(scenario, at, ['id', 'title', 'tags', 'ownerWp'], [], fail);
    unique(scenario.id, `${at}.id`, scenarioIds, fail);
    nonEmpty(scenario.title, `${at}.title`, fail);
    if (!Array.isArray(scenario.tags) || !scenario.tags.every((tag) => typeof tag === 'string')) {
      fail(`${at}.tags`, 'must be an array of strings');
    }
    oneOf(scenario.ownerWp, `${at}.ownerWp`, OWNERS, fail);
  });

  const pairs = new Set();
  list(report.results, 'results', fail).forEach((result, i) => {
    const at = `results[${i}]`;
    if (!isObject(result)) {
      fail(at, 'must be an object');
      return;
    }
    exactKeys(
      result,
      at,
      ['env', 'scenario', 'status', 'durationMs'],
      ['screenshot', 'note'],
      fail,
    );
    if (!envIds.has(result.env))
      fail(`${at}.env`, `unknown environment ${JSON.stringify(result.env)}`);
    if (!scenarioIds.has(result.scenario)) {
      fail(`${at}.scenario`, `unknown scenario ${JSON.stringify(result.scenario)}`);
    }
    const pair = `${result.env} ${result.scenario}`;
    if (pairs.has(pair)) fail(at, `duplicate result for ${pair}`);
    pairs.add(pair);
    oneOf(result.status, `${at}.status`, STATUSES, fail);
    if (typeof result.durationMs !== 'number' || !(result.durationMs >= 0)) {
      fail(`${at}.durationMs`, 'must be a number >= 0');
    }
    if ('screenshot' in result) {
      const path = result.screenshot;
      if (
        typeof path !== 'string' ||
        !/^screenshots\/[^\\]+\.png$/.test(path) ||
        path.includes('..')
      ) {
        fail(`${at}.screenshot`, 'must be a relative screenshots/….png path');
      }
    }
    if ('note' in result && typeof result.note !== 'string') fail(`${at}.note`, 'must be a string');
  });

  const notCovered = list(report.notCovered, 'notCovered', fail);
  if (!notCovered.every((entry) => typeof entry === 'string')) {
    fail('notCovered', 'must be an array of strings');
  }
  if (!notCovered.includes(REAL_HARDWARE)) fail('notCovered', `must include "${REAL_HARDWARE}"`);
  return errors;
}

/** COMPATIBILITY.md for a valid report. */
export function renderCompatibility(report) {
  const date = report.generatedAt.slice(0, 10);
  const commit = report.commit.slice(0, 12);
  const browsers = BROWSERS.filter((browser) =>
    report.environments.some((e) => e.browser === browser),
  );
  const byScenario = groupBy(report.results, (r) => r.scenario);
  const byEnv = groupBy(report.results, (r) => r.env);
  const envById = new Map(report.environments.map((env) => [env.id, env]));
  const counts = countStatuses(report.results);
  const lines = [
    '<!-- Generated by scripts/compat-report.mjs from compat/compat.json. Do not edit: regenerate it. -->',
    '',
    '# Compatibility',
    '',
    '> **Generated file, do not edit.** It is rendered from `compat/compat.json`, which the compat workflow',
    '> (`.github/workflows/compat.yml`) writes from the Playwright end-to-end suite. Documentation links here instead of',
    '> stating browser support by hand.',
    '',
    `- Run: ${date} (\`${report.generatedAt}\`), location-picker ${report.packageVersion}, commit \`${commit}\``,
    `- Tools: Playwright ${report.tools.playwright}, Node ${report.tools.node}`,
    `- Coverage: ${report.environments.length} emulated environments x ${report.scenarios.length} scenarios;` +
      ` ${report.results.length} results: ${counts.pass} pass, ${counts.fail} fail, ${counts.skip} skip`,
    '- Every environment is a Playwright browser build with emulated viewport, device pixel ratio and input.',
    '',
    '## Scenarios',
    '',
    'Each cell counts the environments of that engine where the scenario passed, out of those that ran it.',
    '',
    `| Scenario | Id | Owner | ${browsers.map(title).join(' | ')} |`,
    `| --- | --- | --- | ${browsers.map(() => '---').join(' | ')} |`,
  ];
  for (const scenario of report.scenarios) {
    const results = byScenario.get(scenario.id) ?? [];
    const cells = browsers.map((browser) =>
      cell(results.filter((r) => envById.get(r.env)?.browser === browser)),
    );
    lines.push(
      `| ${escape(scenario.title)} | \`${scenario.id}\` | ${scenario.ownerWp} | ${cells.join(' | ')} |`,
    );
  }
  lines.push(
    '',
    '"no test yet" means the scenario is defined but no automated test covers it in this run.',
    '',
    '## Environments',
    '',
    '| Environment | Engine | Version | Device | Viewport | DPR | Input | Pass | Fail | Skip | Screenshot |',
    '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |',
  );
  for (const env of report.environments) {
    const results = byEnv.get(env.id) ?? [];
    const c = countStatuses(results);
    const shot = results.find((r) => r.scenario === 'render' && r.screenshot)?.screenshot;
    lines.push(
      `| \`${env.id}\` | ${title(env.browser)} | ${escape(env.browserVersion)} | ${escape(env.device ?? '-')} |` +
        ` ${env.viewport.width}x${env.viewport.height} | ${env.dpr} | ${env.input} | ${c.pass} | ${c.fail} | ${c.skip} |` +
        ` ${shot ? `\`${shot}\`` : '-'} |`,
    );
  }
  const failures = report.results.filter((r) => r.status === 'fail');
  if (failures.length > 0) {
    lines.push('', '## Failures', '', '| Environment | Scenario | Note |', '| --- | --- | --- |');
    for (const r of failures) {
      lines.push(`| \`${r.env}\` | \`${r.scenario}\` | ${escape(r.note ?? '')} |`);
    }
  }
  lines.push(
    '',
    '## Not covered',
    '',
    ...report.notCovered.map((entry) => `- ${entry}`),
    '',
    'Screenshots are workflow artifacts of the compat run (paths are relative to `compat/`); they are not committed.',
    '',
  );
  return lines.join('\n');
}

function cell(results) {
  if (results.length === 0) return 'no test yet';
  const c = countStatuses(results);
  const ran = c.pass + c.fail;
  if (ran === 0) return `skipped (${c.skip})`;
  const text = `${c.pass}/${ran}`;
  return c.fail > 0 ? `**${text}**` : text;
}

function countStatuses(results) {
  const counts = { pass: 0, fail: 0, skip: 0 };
  for (const r of results) counts[r.status] += 1;
  return counts;
}

function groupBy(items, key) {
  const map = new Map();
  for (const item of items) {
    const k = key(item);
    map.set(k, [...(map.get(k) ?? []), item]);
  }
  return map;
}

const ENGINE_NAMES = { chromium: 'Chromium', firefox: 'Firefox', webkit: 'WebKit' };
const title = (browser) => ENGINE_NAMES[browser] ?? browser;
const escape = (text) =>
  String(text)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('|', '\\|')
    .replaceAll('\n', ' ');
const isObject = (value) => typeof value === 'object' && value !== null && !Array.isArray(value);

function exactKeys(object, at, required, optional, fail) {
  for (const key of required) if (!(key in object)) fail(at, `missing ${key}`);
  for (const key of Object.keys(object)) {
    if (!required.includes(key) && !optional.includes(key)) fail(at, `unknown key ${key}`);
  }
}

function nonEmpty(value, at, fail) {
  if (typeof value !== 'string' || value.trim() === '') fail(at, 'must be a non-empty string');
}

function oneOf(value, at, allowed, fail) {
  if (!allowed.includes(value)) fail(at, `must be one of ${allowed.join(', ')}`);
}

function unique(id, at, seen, fail) {
  nonEmpty(id, at, fail);
  if (seen.has(id)) fail(at, `duplicate id ${JSON.stringify(id)}`);
  seen.add(id);
}

function list(value, at, fail) {
  if (Array.isArray(value)) return value;
  fail(at, 'must be an array');
  return [];
}

function main(args) {
  const option = (name, fallback) => {
    const i = args.indexOf(name);
    return i === -1 ? fallback : args[i + 1];
  };
  const input = resolve(option('--in', 'compat/compat.json'));
  const output = resolve(option('--out', 'COMPATIBILITY.md'));
  const report = JSON.parse(readFileSync(input, 'utf8'));
  const errors = validateCompatReport(report);
  if (errors.length > 0) {
    console.error(`${input} does not match CONTRACT §12.8:\n  ${errors.join('\n  ')}`);
    return 1;
  }
  const markdown = renderCompatibility(report);
  if (args.includes('--check')) {
    if (existsSync(output) && readFileSync(output, 'utf8') === markdown) return 0;
    console.error(`${output} is out of date: run node scripts/compat-report.mjs`);
    return 1;
  }
  writeFileSync(output, markdown);
  console.log(`wrote ${output} (${report.results.length} results)`);
  return 0;
}

// No import.meta: Playwright loads this file through its CommonJS transform when the reporter imports it.
if (basename(process.argv[1] ?? '') === 'compat-report.mjs') {
  process.exitCode = main(process.argv.slice(2));
}
