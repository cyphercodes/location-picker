// The e2e environment matrix (CONTRACT §12.8, WP5-10, AMENDMENTS A4). Each environment becomes one Playwright project
// whose name is the stable environment id; compat.json results reference that id.
import { devices, type Project } from '@playwright/test';
import type { CompatEnvironment } from '../src/internal/contracts.js';

/** The static part of a CompatEnvironment (browserVersion is read at run time). */
export type MatrixEnvironment = Omit<CompatEnvironment, 'browserVersion' | 'emulated' | 'input'> & {
  readonly input: 'mouse' | 'touch';
};

const BROWSERS = ['chromium', 'firefox', 'webkit'] as const;
const VIEWPORTS = [
  { width: 320, height: 568 },
  { width: 375, height: 667 },
  { width: 390, height: 844 },
  { width: 412, height: 915 },
  { width: 768, height: 1024 },
  { width: 1024, height: 768 },
  { width: 1440, height: 900 },
  { width: 2560, height: 1440 },
] as const;
const DPRS = [1, 2, 3] as const;
const INPUTS = ['mouse', 'touch'] as const;
/** Device profiles run on their native engine only (Firefox has no isMobile emulation). */
const DEVICES = [
  { name: 'iPhone 15', browser: 'webkit' },
  { name: 'Pixel 9', browser: 'chromium' },
  { name: 'iPad Pro 11', browser: 'webkit' },
] as const;

function generic(
  browser: MatrixEnvironment['browser'],
  viewport: MatrixEnvironment['viewport'],
  dpr: MatrixEnvironment['dpr'],
  input: MatrixEnvironment['input'],
): MatrixEnvironment {
  const id = `${browser}-${viewport.width}x${viewport.height}-dpr${dpr}-${input}`;
  return { id, browser, device: null, viewport, dpr, input };
}

function device({ name, browser }: (typeof DEVICES)[number]): MatrixEnvironment {
  const { viewport, deviceScaleFactor } = devices[name];
  const dpr = asDpr(deviceScaleFactor);
  const slug = name.toLowerCase().replace(/[^a-z0-9]/g, '');
  const id = `${browser}-${slug}-${viewport.width}x${viewport.height}-dpr${dpr}-touch`;
  return { id, browser, device: name, viewport, dpr, input: 'touch' };
}

function asDpr(value: number): MatrixEnvironment['dpr'] {
  if (value === 1 || value === 2 || value === 3) return value;
  throw new Error(`device profiles in the matrix need an integer DPR of 1-3, got ${value}`);
}

/** Pull requests (A4): 3 engines x {375 touch, 1440 mouse}. */
export const SMALL_MATRIX: readonly MatrixEnvironment[] = BROWSERS.flatMap((browser) => [
  generic(browser, { width: 375, height: 667 }, 2, 'touch'),
  generic(browser, { width: 1440, height: 900 }, 1, 'mouse'),
]);

/** Compat workflow (LOCKED 16): 3 engines x 8 viewports x DPR 1/2/3 x mouse/touch, plus the device profiles. */
export const FULL_MATRIX: readonly MatrixEnvironment[] = [
  ...BROWSERS.flatMap((browser) =>
    VIEWPORTS.flatMap((viewport) =>
      DPRS.flatMap((dpr) => INPUTS.map((input) => generic(browser, viewport, dpr, input))),
    ),
  ),
  ...DEVICES.map(device),
];

export function toProject(env: MatrixEnvironment): Project {
  const base = env.device ? devices[env.device] : {};
  return {
    name: env.id,
    metadata: { env },
    use: {
      ...base,
      browserName: env.browser,
      viewport: env.viewport,
      deviceScaleFactor: env.dpr,
      hasTouch: env.input === 'touch',
    },
  };
}
