// Engine script/stylesheet loading and the MountContext handed to adapters (CONTRACT §4.2, §4.3, §12.3). Loads are
// deduplicated through the global store, so every picker and every library copy on a page inserts a URL once.
import type { MountContext, ProviderMountOptions } from '../core.js';
import type * as C from '../internal/contracts.js';
import type { LatLng } from '../utils.js';
import { DEFAULTS } from './config.js';
import { createError } from './errors.js';
import type { PickerCore } from './picker-core.js';
import { getStore } from './store.js';
import { adoptCss, docOf } from './styles.js';

export { detectNonce } from './config.js';

const absolute = (url: string, doc: Document): string => new URL(url, doc.baseURI).href;

/** Classic <script> into document.head, deduped by URL; nonce + crossorigin="anonymous" + optional SRI. Rejects ENGINE_LOAD_FAILED. */
export function loadScript(
  src: string,
  options: {
    readonly integrity?: string;
    readonly nonce?: string;
    readonly signal?: AbortSignal;
  } = {},
): Promise<void> {
  const url = absolute(src, document);
  const { scripts } = getStore();
  let load = scripts.get(url);
  if (!load) {
    load = new Promise<void>((resolve, reject) => {
      const script = document.createElement('script');
      script.crossOrigin = 'anonymous';
      if (options.integrity) script.integrity = options.integrity;
      if (options.nonce) script.nonce = options.nonce;
      script.addEventListener('load', () => resolve());
      script.addEventListener('error', (cause) => {
        // Forget the failure so a later picker may retry.
        scripts.delete(url);
        script.remove();
        reject(createError('ENGINE_LOAD_FAILED', { cause, vars: { url } }));
      });
      script.src = url;
      document.head.append(script);
    });
    scripts.set(url, load);
  }
  const { signal } = options;
  if (!signal) return load;
  return new Promise((resolve, reject) => {
    const abort = (): void => reject(createError('ABORTED', { cause: signal.reason }));
    if (signal.aborted) return abort();
    signal.addEventListener('abort', abort, { once: true });
    load.then(resolve, reject);
  });
}

/** <link rel=stylesheet> into `root` (document.head for a Document), deduped per root; nonce; crossorigin="anonymous" whenever `integrity` is set (SRI needs CORS). Never rejects: resolves on load, on error, or after timeoutMs (default 3000). */
export function loadStylesheet(
  root: Document | ShadowRoot,
  href: string,
  options: {
    readonly integrity?: string;
    readonly nonce?: string;
    readonly timeoutMs?: number;
  } = {},
): Promise<void> {
  const doc = docOf(root);
  const url = absolute(href, doc);
  const { stylesheets } = getStore();
  const loads = stylesheets.get(root) ?? new Map<string, Promise<void>>();
  stylesheets.set(root, loads);
  let load = loads.get(url);
  if (!load) {
    load = new Promise<void>((resolve) => {
      const link = doc.createElement('link');
      const done = (): void => {
        clearTimeout(timer);
        resolve();
      };
      const timer = setTimeout(done, options.timeoutMs ?? 3000);
      link.rel = 'stylesheet';
      if (options.integrity) {
        link.integrity = options.integrity;
        link.crossOrigin = 'anonymous';
      }
      if (options.nonce) link.nonce = options.nonce;
      link.addEventListener('load', done);
      link.addEventListener('error', done);
      link.href = url;
      (root === doc ? doc.head : root).append(link);
    });
    loads.set(url, load);
  }
  return load;
}

/** Relative url(...) references resolve against the sheet they came from, not the constructed copy. */
const rebase = (css: string, base: string): string =>
  css.replace(/url\((["']?)([^"')]+)\1\)/g, (match, _q, url: string) => {
    try {
      return `url("${new URL(url, base).href}")`;
    } catch {
      return match;
    }
  });

// Structural checks: the rules may come from another realm (a document in an iframe).
const isStyleRule = (rule: CSSRule): rule is CSSStyleRule => 'selectorText' in rule;
const isImport = (rule: CSSRule): rule is CSSImportRule => 'styleSheet' in rule;
const isGrouping = (rule: CSSRule): rule is CSSRule & { readonly cssRules: CSSRuleList } =>
  'cssRules' in rule;

function matching(rules: CSSRuleList, test: RegExp, base: string): string[] {
  const out: string[] = [];
  for (const rule of rules) {
    if (isStyleRule(rule)) {
      if (test.test(rule.selectorText)) out.push(rebase(rule.cssText, base));
    } else if (isImport(rule)) {
      const sheet = rule.styleSheet;
      try {
        if (sheet) out.push(...matching(sheet.cssRules, test, sheet.href ?? base));
      } catch {
        // cross-origin @import without CORS: unreadable
      }
    } else if (isGrouping(rule)) {
      const inner = matching(rule.cssRules, test, base);
      const head = rule.cssText.slice(0, rule.cssText.indexOf('{'));
      if (inner.length && head.startsWith('@')) out.push(`${head}{${inner.join('')}}`);
    }
  }
  return out;
}

/** §4.3 step 3': copy matching rules from readable document sheets into one constructed sheet adopted by a ShadowRoot. Returns the count. */
export async function adoptDocumentRules(
  root: Document | ShadowRoot,
  selectorTest: RegExp,
): Promise<number> {
  if (root.nodeType == 9) return 0;
  const doc = docOf(root);
  const rules: string[] = [];
  for (const sheet of doc.styleSheets) {
    try {
      rules.push(...matching(sheet.cssRules, selectorTest, sheet.href ?? doc.baseURI));
    } catch {
      // cross-origin sheet without CORS: unreadable, skipped
    }
  }
  if (rules.length) adoptCss(root, `document:${selectorTest.source}`, rules.join('\n'));
  return rules.length;
}

function colorScheme(host: HTMLElement): MountContext['colorScheme'] {
  const scheme = host.ownerDocument.defaultView?.getComputedStyle(host).colorScheme ?? '';
  const dark = scheme.includes('dark');
  return dark && scheme.includes('light') ? 'auto' : dark ? 'dark' : 'light';
}

/** Provider-relevant options; an option the user did not set stays undefined, so adapters apply their own defaults. */
export function providerOptions(config: C.ResolvedConfig): ProviderMountOptions {
  const custom = config.tileUrlGiven;
  return {
    apiKey: config.apiKey,
    mapId: config.mapId,
    tileUrl: custom ? config.tileUrl : undefined,
    attribution: custom ? config.attribution : undefined,
    mapStyle: config.mapStyle === DEFAULTS.mapStyle ? undefined : config.mapStyle,
    engine: config.engine,
    engineUrl: config.engineUrl,
    engineCssUrl: config.engineCssUrl,
    mapOptions: config.mapOptions,
    maxZoom: config.maxZoom,
    marker: typeof config.marker == 'object' ? 'element' : config.marker,
    search: config.search,
  };
}

/**
 * Builds the MountContext handed to adapters (§4); `events` feed back into `core` until `signal` aborts. Takes the
 * real PickerCore (§12.3 types it as the contract class), whose adapter-facing members are not part of §12.1.
 */
export function createMountContext(
  core: PickerCore,
  signal: AbortSignal,
  view: { readonly center: LatLng; readonly zoom: number },
): MountContext {
  const { config, refs, host } = core;
  const root = host.styleRoot;
  const nonce = config.nonce;
  const live =
    <A extends unknown[]>(fn: (...args: A) => void) =>
    (...args: A): void => {
      if (!signal.aborted) fn(...args);
    };
  const doc = refs.map.ownerDocument;
  const page = doc.scrollingElement ?? doc.documentElement;
  return {
    container: refs.map,
    root,
    view,
    gestureHandling: config.gestureHandling,
    pageScrolls: page.scrollHeight > page.clientHeight,
    interactive: config.disabled ? 'none' : config.readOnly ? 'zoom-only' : 'full',
    lang: config.lang,
    colorScheme: colorScheme(host.host),
    options: providerOptions(config),
    signal,
    events: {
      move: live((center) => core.events.move(center)),
      moveEnd: live((center, zoom) => core.events.moveEnd(center, zoom)),
      interactionStart: live(() => core.events.interactionStart()),
      interactionEnd: live(() => core.events.interactionEnd()),
    },
    nonce,
    loadScript: (src, integrity) => loadScript(src, { integrity, nonce, signal }),
    loadStylesheet: (href, integrity) => loadStylesheet(root, href, { integrity, nonce }),
    adoptDocumentRules: (test) => adoptDocumentRules(root, test),
    showHint: live((text: string) => core.showHint(text)),
    report: live((error) => core.report(error)),
  };
}

loadScript satisfies typeof C.loadScript;
loadStylesheet satisfies typeof C.loadStylesheet;
adoptDocumentRules satisfies typeof C.adoptDocumentRules;
