// §12.3/§12.4 runtime modules in jsdom: loaders, styles, provider loading and pairing, and the store shared by copies.
// jsdom never loads <script>/<link>: tests fire `load`/`error` themselves, on local URLs only (no-network guard).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Geocoder, MapHandle, MountContext, ProviderAdapter } from '../../src/core.js';
import { resolveConfig } from '../../src/core/config.js';
import {
  loadScript,
  loadStylesheet,
  adoptDocumentRules,
  detectNonce,
} from '../../src/core/loader.js';
import {
  BUILTIN_PROVIDERS,
  erased,
  checkPairing,
  loadProvider,
  normalizeProviderName,
  resolveGeocoder,
} from '../../src/core/providers.js';
import { adoptStyles } from '../../src/core/styles.js';
import { createFakeAdapter } from '../fixtures/fake-adapter.js';
import { must, query, resetStore, spyConsole } from './helpers.js';

beforeEach(() => {
  resetStore();
  document.head.innerHTML = '';
  document.body.innerHTML = '';
});
afterEach(() => vi.restoreAllMocks());

const scripts = (): HTMLScriptElement[] => [...document.head.querySelectorAll('script')];
const local = (path: string): string => new URL(path, location.href).href;
const firstScript = (): HTMLScriptElement => must(scripts().at(0), 'a script');
const config = (geocoder: Geocoder | false | undefined) =>
  resolveConfig({ geocoder }, { mode: 'class', host: document.createElement('div') }).config;

describe('loadScript', () => {
  it('inserts one classic script per URL with crossorigin, SRI and nonce; resolves on load', async () => {
    const a = loadScript(local('/leaflet.js'), { integrity: 'sha256-x', nonce: 'n1' });
    const b = loadScript('/leaflet.js');
    expect(scripts()).toHaveLength(1);
    const script = firstScript();
    expect(script).toMatchObject({
      src: local('/leaflet.js'),
      crossOrigin: 'anonymous',
      integrity: 'sha256-x',
    });
    expect(script.nonce).toBe('n1');
    script.dispatchEvent(new Event('load'));
    await expect(Promise.all([a, b])).resolves.toEqual([undefined, undefined]);
  });

  it('rejects ENGINE_LOAD_FAILED on error and forgets the URL so a later picker retries', async () => {
    const failed = loadScript('/engine.js');
    firstScript().dispatchEvent(new Event('error'));
    await expect(failed).rejects.toMatchObject({
      code: 'ENGINE_LOAD_FAILED',
      message: expect.stringContaining(local('/engine.js')),
    });
    expect(scripts()).toHaveLength(0);
    void loadScript('/engine.js').catch(() => {});
    expect(scripts()).toHaveLength(1);
  });

  it('a signal rejects only its caller with ABORTED', async () => {
    const control = new AbortController();
    const mine = loadScript('/slow.js', { signal: control.signal });
    const other = loadScript('/slow.js');
    control.abort();
    await expect(mine).rejects.toMatchObject({ code: 'ABORTED' });
    firstScript().dispatchEvent(new Event('load'));
    await expect(other).resolves.toBeUndefined();
  });
});

describe('loadStylesheet', () => {
  it('links once per root; crossorigin only with SRI; never rejects (load, error or timeout)', async () => {
    vi.useFakeTimers();
    try {
      const host = document.createElement('div');
      document.body.append(host);
      const shadow = host.attachShadow({ mode: 'open' });
      const sri = loadStylesheet(document, '/a.css', { integrity: 'sha256-y', nonce: 'n2' });
      void loadStylesheet(document, local('/a.css'));
      const plain = loadStylesheet(shadow, '/a.css');
      const hanging = loadStylesheet(document, '/b.css', { timeoutMs: 50 });
      const [link, other] = [...document.head.querySelectorAll('link')];
      expect(document.head.querySelectorAll('link')).toHaveLength(2);
      expect(link).toMatchObject({
        rel: 'stylesheet',
        integrity: 'sha256-y',
        crossOrigin: 'anonymous',
        nonce: 'n2',
      });
      const shadowLink = query(shadow, 'link', HTMLLinkElement);
      expect(shadowLink.crossOrigin).toBeNull();
      must(link).dispatchEvent(new Event('load'));
      shadowLink.dispatchEvent(new Event('error'));
      await expect(Promise.all([sri, plain])).resolves.toEqual([undefined, undefined]);
      expect(must(other).href).toBe(local('/b.css'));
      await vi.advanceTimersByTimeAsync(50);
      await expect(hanging).resolves.toBeUndefined();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('adoptDocumentRules', () => {
  it('copies matching rules (also inside @media) into the shadow root, with url() made absolute', async () => {
    const style = document.createElement('style');
    style.textContent =
      '.leaflet-pane{position:absolute}.other{color:red}' +
      '@media (min-width: 1px){.leaflet-tile{background:url(img/t.png)}}';
    document.head.append(style);
    const host = document.createElement('div');
    document.body.append(host);
    const shadow = host.attachShadow({ mode: 'open' });
    expect(await adoptDocumentRules(shadow, /\.leaflet-/)).toBe(2);
    const copied = query(shadow, 'style', HTMLStyleElement).textContent;
    expect(copied).toContain('.leaflet-pane');
    expect(copied).not.toContain('.other');
    expect(copied).toMatch(/@media \(min-width: 1px\) ?\{\.leaflet-tile/);
    expect(copied).toContain(`url("${local('/img/t.png')}")`);
    expect(await adoptDocumentRules(document, /\.leaflet-/)).toBe(0);
  });
});

describe('adoptStyles', () => {
  it('without adoptedStyleSheets (jsdom): one <style> per root and kind, with the nonce', () => {
    adoptStyles(document, 'class', 'n3');
    adoptStyles(document, 'class', 'n3');
    const styles = document.head.querySelectorAll('style');
    expect(styles).toHaveLength(1);
    expect(must(styles.item(0)).nonce).toBe('n3');
    expect(must(styles.item(0)).textContent).toContain('.location-picker .lp-pin.centerMarker');
    const host = document.createElement('div');
    document.body.append(host);
    const shadow = host.attachShadow({ mode: 'open' });
    adoptStyles(shadow, 'element');
    expect(query(shadow, 'style', HTMLStyleElement).textContent).toContain(':host');
  });

  it('detectNonce reads the first script[nonce]', () => {
    document.head.innerHTML = '<script nonce="abc"></script>';
    expect(detectNonce(document)).toBe('abc');
  });
});

describe('providers (§12.4)', () => {
  it('normalizeProviderName maps aliases and rejects unknown names', () => {
    expect(
      ['OSM', 'openstreetmap', 'google-maps', 'GoogleMaps', 'maplibre', 'bing'].map(
        normalizeProviderName,
      ),
    ).toEqual(['leaflet', 'leaflet', 'google', 'google', 'maplibre', null]);
  });

  it('loadProvider returns adapter objects synchronously and loads names lazily', async () => {
    const fake = createFakeAdapter({ name: 'leaflet' });
    const adapter = erased(fake.adapter);
    expect(loadProvider(adapter)).toBe(adapter);
    vi.spyOn(BUILTIN_PROVIDERS, 'leaflet').mockResolvedValue(adapter);
    const lazy = loadProvider('leaflet');
    expect(lazy).toBeInstanceOf(Promise);
    expect(await lazy).toBe(adapter);
  });

  it('the built-in loaders import the WP3 entries and call their factories', async () => {
    await expect(loadProvider('maplibre')).resolves.toMatchObject({ name: 'maplibre' });
  });

  it('checkPairing refuses a geocoder whose pairsWith excludes the provider', () => {
    expect(checkPairing({ pairsWith: ['leaflet', 'maplibre'] }, 'google')).toMatchObject({
      code: 'GEOCODER_MISMATCH',
      message: expect.stringContaining('google map'),
    });
    expect(checkPairing({ pairsWith: ['google'] }, 'google')).toBeNull();
    expect(checkPairing({}, 'google')).toBeNull();
  });

  it('resolveGeocoder: config.geocoder (false -> null) wins over the adapter pair; factories are called with ctx and handle', async () => {
    // Opaque stand-ins: resolveGeocoder only hands them to the factory.
    const ctx: MountContext = Object.create(null);
    const handle: MapHandle = Object.create(null);
    const pair: Geocoder = { pairsWith: ['fake'], search: async () => [] };
    const factory = vi.fn<(ctx: MountContext, handle: MapHandle) => Geocoder>(() => pair);
    const adapter: ProviderAdapter = {
      name: 'fake',
      mount: () => handle,
      geocoder: factory,
    };
    expect(await resolveGeocoder(adapter, config(undefined), ctx, handle)).toBe(pair);
    expect(factory).toHaveBeenCalledWith(ctx, handle);
    expect(await resolveGeocoder(adapter, config(false), ctx, handle)).toBeNull();
    const custom: Geocoder = { search: async () => [] };
    expect(await resolveGeocoder(adapter, config(custom), ctx, handle)).toBe(custom);
    await expect(
      resolveGeocoder(
        { ...adapter, geocoder: { pairsWith: ['google'] } },
        config(undefined),
        ctx,
        handle,
      ),
    ).rejects.toMatchObject({
      code: 'GEOCODER_MISMATCH',
    });
  });
});

describe('WP2-23 two library copies on one page share the store', () => {
  it('one <script> per URL across copies, and warnOnce keys are shared', async () => {
    const log = spyConsole();
    vi.resetModules();
    const a = await import('../../src/core/loader.js');
    const da = await import('../../src/core/diagnostics.js');
    vi.resetModules();
    const b = await import('../../src/core/loader.js');
    const db = await import('../../src/core/diagnostics.js');
    expect(a.loadScript).not.toBe(b.loadScript);
    const first = a.loadScript('/shared.js');
    const second = b.loadScript('/shared.js');
    expect(scripts()).toHaveLength(1);
    firstScript().dispatchEvent(new Event('load'));
    await Promise.all([first, second]);
    da.warnOnce('k', 'from copy A');
    db.warnOnce('k', 'from copy B');
    expect(log.warn.mock.calls).toEqual([['[location-picker] from copy A']]);
  });

  it('two copies adopt one sheet per document', async () => {
    vi.resetModules();
    const a = await import('../../src/core/styles.js');
    vi.resetModules();
    const b = await import('../../src/core/styles.js');
    a.adoptStyles(document, 'class');
    b.adoptStyles(document, 'class');
    expect(document.head.querySelectorAll('style')).toHaveLength(1);
  });
});
