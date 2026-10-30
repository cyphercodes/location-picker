// /compat/: renders compat.json (CONTRACT §12.8) and nothing else. Every browser, device and scenario named on this
// page comes from that file; without it the page says that no results are published yet.
import { setUpThemeToggle } from '../theme.js';

setUpThemeToggle();
const root = /** @type {HTMLElement} */ (document.getElementById('generated'));

load().catch(() => showStatus('The results could not be read.'));

async function load() {
  const response = await fetch('compat.json', { cache: 'no-cache' });
  if (!response.ok) {
    showStatus(
      'No results are published yet. The compatibility matrix runs weekly and for every release; until then, see COMPATIBILITY.md in the repository.',
    );
    return;
  }
  render(await response.json());
}

function showStatus(message) {
  root.replaceChildren(el('p', { class: 'callout', id: 'compat-status' }, message));
}

/** A tiny element builder: text children are escaped by the DOM. */
function el(tag, attributes = {}, ...children) {
  const node = document.createElement(tag);
  for (const [name, value] of Object.entries(attributes)) node.setAttribute(name, String(value));
  node.append(...children.flat().filter((child) => child !== null && child !== undefined));
  return node;
}

const STATUSES = ['pass', 'fail', 'skip'];

function render(report) {
  const envs = new Map(report.environments.map((env) => [env.id, env]));
  const scenarios = new Map(report.scenarios.map((scenario) => [scenario.id, scenario]));
  const counts = Object.fromEntries(STATUSES.map((status) => [status, 0]));
  for (const result of report.results) counts[result.status] = (counts[result.status] ?? 0) + 1;
  const browsers = [...new Set(report.environments.map((env) => env.browser))].sort((a, b) =>
    a.localeCompare(b),
  );

  const summary = el(
    'div',
    { class: 'compat-summary' },
    stat('Results', report.results.length),
    stat('Passed', counts.pass, 'pass'),
    stat('Failed', counts.fail, 'fail'),
    stat('Skipped', counts.skip, 'skip'),
    stat('Environments', report.environments.length),
    stat('Scenarios', report.scenarios.length),
  );
  const meta = el(
    'p',
    { class: 'hint' },
    `Generated ${formatDate(report.generatedAt)} for location-picker ${report.packageVersion} (commit `,
    el(
      'a',
      { href: `https://github.com/cyphercodes/location-picker/commit/${report.commit}` },
      report.commit.slice(0, 7),
    ),
    `), Playwright ${report.tools.playwright}, Node ${report.tools.node}. All environments are emulated.`,
  );

  // Scenario x browser engine: passed / run.
  // Wide tables scroll inside a keyboard-focusable, named region (axe: scrollable-region-focusable).
  const matrix = el(
    'div',
    {
      class: 'table-wrap',
      tabindex: '0',
      role: 'region',
      'aria-label': 'Results per scenario and browser engine',
    },
    el(
      'table',
      { id: 'compat-matrix' },
      el('caption', { class: 'sr-only' }, 'Passed results per scenario and browser engine'),
      el(
        'thead',
        {},
        el(
          'tr',
          {},
          el('th', { scope: 'col' }, 'Scenario'),
          browsers.map((b) => el('th', { scope: 'col' }, b)),
        ),
      ),
      el(
        'tbody',
        {},
        report.scenarios.map((scenario) =>
          el(
            'tr',
            {},
            el('th', { scope: 'row' }, scenario.title),
            browsers.map((browser) => {
              const runs = report.results.filter(
                (r) => r.scenario === scenario.id && envs.get(r.env)?.browser === browser,
              );
              const passed = runs.filter((r) => r.status === 'pass').length;
              const failed = runs.some((r) => r.status === 'fail');
              return el(
                'td',
                {},
                runs.length
                  ? el(
                      'span',
                      { class: 'pill', 'data-status': failed ? 'fail' : passed ? 'pass' : 'skip' },
                      `${passed}/${runs.length}`,
                    )
                  : '–',
              );
            }),
          ),
        ),
      ),
    ),
  );

  // Every result is thousands of rows: build that table only when someone opens it, so the page stays light.
  const details = el(
    'details',
    { class: 'compat-details' },
    el('summary', {}, `Every result (${report.results.length})`),
  );
  details.addEventListener(
    'toggle',
    () => details.append(resultsTable(report.results, envs, scenarios)),
    { once: true },
  );

  const notCovered = el(
    'div',
    { class: 'callout' },
    el('h2', { class: 'compat-h' }, 'Not covered'),
    el(
      'ul',
      {},
      report.notCovered.map((item) => el('li', {}, item)),
    ),
  );

  root.replaceChildren(
    summary,
    meta,
    el('h2', { class: 'compat-h' }, 'Scenarios by browser engine'),
    matrix,
    details,
    notCovered,
  );
}

function resultsTable(results, envs, scenarios) {
  return el(
    'div',
    { class: 'table-wrap', tabindex: '0', role: 'region', 'aria-label': 'Every result' },
    el(
      'table',
      { id: 'compat-results' },
      el(
        'thead',
        {},
        el(
          'tr',
          {},
          ['Environment', 'Scenario', 'Status', 'Time', 'Note'].map((h) =>
            el('th', { scope: 'col' }, h),
          ),
        ),
      ),
      el(
        'tbody',
        {},
        results.map((result) =>
          el(
            'tr',
            {},
            el('td', {}, describeEnv(envs.get(result.env)) ?? result.env),
            el('td', {}, scenarios.get(result.scenario)?.title ?? result.scenario),
            el(
              'td',
              {},
              el('span', { class: 'pill', 'data-status': result.status }, result.status),
            ),
            el('td', {}, `${Math.round(result.durationMs)} ms`),
            el('td', {}, result.note ?? ''),
          ),
        ),
      ),
    ),
  );
}

function stat(label, value, status) {
  return el(
    'div',
    { class: 'card compat-stat', ...(status && { 'data-status': status }) },
    el('strong', {}, String(value)),
    el('span', {}, label),
  );
}

function describeEnv(env) {
  if (!env) return null;
  const device = env.device ? `${env.device}, ` : '';
  return `${env.browser} ${env.browserVersion} · ${device}${env.viewport.width}×${env.viewport.height} @${env.dpr}x · ${env.input}`;
}

function formatDate(iso) {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : date.toISOString().slice(0, 10);
}
