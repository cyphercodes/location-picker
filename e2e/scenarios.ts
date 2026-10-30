// The compat scenarios (CONTRACT §12.8 CompatScenario, WP5-10): the single list of scenario ids. Playwright tests
// declare what they cover with tags, `test('…', scenarios('form-submit', 'form-reset'), async () => …)`, and the
// compat reporter turns every tagged result into a compat.json row. Pure data: the unit tests import it too.
import type { CompatScenario } from '../src/internal/contracts.js';

export const SCENARIOS = [
  // Rendering (every environment gets a reference screenshot from e2e/compat.spec.ts).
  s('render', 'Renders the default picker and reaches ready', ['render'], 'WP4'),
  // Inputs and accessibility.
  s('pan-drag', 'Pan by dragging the map (mouse or touch) commits once', ['input'], 'WP2'),
  s('zoom-gesture', 'Wheel and pinch zoom never change the value', ['input'], 'WP2'),
  s('keyboard-only', 'Keyboard only: focus, arrows and Enter commit', ['input', 'a11y'], 'WP2'),
  s('a11y-tree', 'Accessibility tree: roles, names and no axe violations', ['a11y'], 'WP4'),
  // Forms.
  s('form-submit', 'Inside a <form>: submit sends the value', ['form'], 'WP4'),
  s('form-reset', 'form.reset() brings back the default value', ['form'], 'WP4'),
  s('form-restore', 'Back/forward navigation restores the value', ['form', 'navigation'], 'WP4'),
  s('form-required', 'required blocks submission until a location is chosen', ['form'], 'WP4'),
  // Layout and lifecycle.
  s('dialog', 'Inside a <dialog> opened with showModal()', ['layout'], 'WP4'),
  s('hidden-then-shown', 'Initialised while hidden, then shown (no grey map)', ['layout'], 'WP2'),
  s('resize-orientation', 'Container resize and orientation change', ['layout'], 'WP2'),
  s('multiple-pickers', 'Several pickers on one page stay independent', ['layout'], 'WP2'),
  s('destroy-recreate', 'Destroy and re-create (SPA route change)', ['lifecycle'], 'WP2'),
  s('moved-element', 'The element moved to another place in the DOM', ['lifecycle'], 'WP4'),
  // Theming and user preferences.
  s('rtl', 'Right-to-left layout', ['theming', 'i18n'], 'WP2'),
  s('dark-mode', 'Dark colour scheme', ['theming'], 'WP2'),
  s('reduced-motion', 'prefers-reduced-motion: no pin animation', ['theming', 'a11y'], 'WP2'),
  s('zoom-200', '200% page zoom', ['theming', 'a11y'], 'WP2'),
  // Network and security.
  s(
    'strict-csp',
    'Strict Content-Security-Policy page (the documented recipe)',
    ['security'],
    'WP3',
  ),
  s('tile-failure', 'Map tiles fail to load', ['network'], 'WP3'),
  s('engine-load-failure', 'The map engine script fails to load', ['network'], 'WP3'),
  s('slow-engine-load', 'A slow map engine (3 s)', ['network'], 'WP3'),
  // Geolocation.
  s('geolocation-granted', 'Geolocation granted', ['geolocation'], 'WP2'),
  s('geolocation-denied', 'Geolocation denied', ['geolocation'], 'WP2'),
  s('geolocation-timeout', 'Geolocation times out', ['geolocation'], 'WP2'),
  s('geolocation-insecure', 'Geolocation in an insecure context', ['geolocation'], 'WP2'),
  s(
    'iframe-without-geolocation',
    'Inside an iframe without allow="geolocation"',
    ['geolocation'],
    'WP4',
  ),
  // Providers and the frozen v1 file.
  s('google-provider', 'Google Maps provider (mocked Maps JavaScript API)', ['provider'], 'WP3'),
  s(
    'maplibre-provider',
    'MapLibre provider (real maplibre-gl, WebGL2 permitting)',
    ['provider'],
    'WP3',
  ),
  s('v1-page', 'The frozen v1 file on a 2018-style page', ['v1'], 'WP1'),
  // Field mode (AMENDMENTS A10/A13.3).
  s('field-phone', 'Field mode on phone viewports', ['field'], 'WP4'),
  s('field-open-confirm-cancel', 'Field mode: open, confirm and cancel', ['field'], 'WP4'),
  s('field-back-button', 'Field mode: the back button closes the sheet', ['field'], 'WP4'),
  s('field-keyboard', 'Field mode: keyboard only', ['field', 'a11y'], 'WP4'),
  s('field-screen-reader', 'Field mode: screen reader semantics', ['field', 'a11y'], 'WP4'),
  s('field-rotation', 'Field mode: rotation while the sheet is open', ['field'], 'WP4'),
  s('field-in-dialog-form', 'Field mode: a field inside a form inside a dialog', ['field'], 'WP4'),
  s('field-auto-breakpoint', 'presentation="auto" switches at the breakpoint', ['field'], 'WP4'),
] as const satisfies readonly CompatScenario[];

/** The annotation e2e/harness/fixtures.ts adds to every test: Playwright knows the engine version only at run time. */
export const BROWSER_VERSION_ANNOTATION = 'browser-version';
/** The attachment of the per-environment reference screenshot (e2e/compat.spec.ts). */
export const SCREENSHOT_ATTACHMENT = 'compat-screenshot';

export type ScenarioId = (typeof SCENARIOS)[number]['id'];

const IDS: ReadonlySet<string> = new Set(SCENARIOS.map((scenario) => scenario.id));

export function isScenarioId(id: string): id is ScenarioId {
  return IDS.has(id);
}

/** Playwright test details for the scenarios a test covers: `test(title, scenarios('rtl'), body)`. */
export function scenarios(...ids: readonly ScenarioId[]): { tag: string[] } {
  return { tag: ids.map((id) => `@${id}`) };
}

/** The scenario ids among a test's tags (`@form-submit` -> `form-submit`); other tags are ignored. */
export function scenarioIdsOf(tags: readonly string[]): ScenarioId[] {
  return tags.map((tag) => tag.replace(/^@/, '')).filter(isScenarioId);
}

function s<const Id extends string>(
  id: Id,
  title: string,
  tags: readonly string[],
  ownerWp: CompatScenario['ownerWp'],
): CompatScenario & { readonly id: Id } {
  return { id, title, tags, ownerWp };
}
