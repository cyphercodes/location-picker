// What the Leaflet and MapLibre adapters share: the engine CSS resolution order (CONTRACT §4.3) and option helpers.
// Mount never waits for CSS: every step only starts work, and the final check (step 5) reports ENGINE_CSS_MISSING
// once that work has settled.
import type { GestureHandling, LocationPickerError, MountContext } from '../core.js';

export type GestureMode = 'greedy' | 'cooperative' | 'none';

/** `auto` is cooperative (Ctrl/⌘ + wheel zooms) when the page itself scrolls at mount time, otherwise greedy. */
export const gestureMode = (gestures: GestureHandling, pageScrolls: boolean): GestureMode =>
  gestures == 'auto' ? (pageScrolls ? 'cooperative' : 'greedy') : gestures;

/** Factory options win over picker options; `''` means "not set" (the attribute default). */
export const prefer = <T>(own: T | '' | undefined, picker: T | undefined): T | undefined =>
  own === undefined || own === '' ? picker : own;

export interface EngineCss {
  /** Selector test for the engine's rules (step 3'). */
  readonly rules: RegExp;
  /** An engine element that the engine CSS positions absolutely (the step 3 and step 5 probe). */
  readonly probe: string;
  /** `engineCssUrl` after factory-over-picker precedence: a URL, `false` (never link), or `undefined` (default). */
  readonly url: string | false | undefined;
  /** The pinned default URL and its SRI hash (Leaflet). MapLibre has none, so steps 2 and 4 never run for it. */
  readonly pinned?: readonly [url: string, integrity: string];
  /** Step 5's error. */
  readonly missing: () => LocationPickerError;
}

/** One resolution per mount: load() may start it (step 2, with the engine script) before mount() finishes it. */
const jobs = new WeakMap<MountContext, Promise<unknown>>();

const styled = (ctx: MountContext, probe: string): boolean => {
  const element = ctx.container.querySelector(probe);
  return !!element && getComputedStyle(element).position == 'absolute';
};

/**
 * `early`: called from load() while auto-loading the pinned engine script, so the pinned sheet is inserted together
 * with it (step 2), or an explicit URL right away (step 1). Otherwise (from mount(), with the engine's elements in
 * the container) it runs whatever step is left, then verifies the result (step 5).
 */
export function engineCss(ctx: MountContext, css: EngineCss, early = false): void {
  const { url, pinned } = css;
  const link = (href: string): Promise<void> =>
    ctx.loadStylesheet(href, href == pinned?.[0] ? pinned[1] : undefined);
  let job = jobs.get(ctx);
  if (!job) {
    if (typeof url == 'string') job = link(url);
    else if (!early)
      job = (async () => {
        // 3: the root already styles the engine (a Document with leaflet.css; a ShadowRoot that adopted it before).
        if (styled(ctx, css.probe)) return;
        // 3': readable document rules copied into the ShadowRoot (0 for a Document).
        if (await ctx.adoptDocumentRules(css.rules)) return;
        // 4
        if (url !== false && pinned) await link(pinned[0]);
      })();
    // 2
    else if (url !== false && pinned) job = link(pinned[0]);
    if (job) jobs.set(ctx, job);
  }
  if (!early)
    void job?.then(() => {
      if (!ctx.signal.aborted && !styled(ctx, css.probe)) ctx.report(css.missing());
    });
}
