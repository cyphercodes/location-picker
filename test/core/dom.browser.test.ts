// Browser project (Chromium, Firefox, WebKit): CSS adoption, pin geometry, layout and observers in real engines.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cdp, server } from 'vitest/browser';
import { LocationPicker } from '../../src/core.js';
import { PickerCore } from '../../src/core/picker-core.js';
import { resolveConfig } from '../../src/core/config.js';
import { erased } from '../../src/core/providers.js';
import { getStore } from '../../src/core/store.js';
import { version } from '../../src/core/version.js';
import type { CoreHost } from '../../src/internal/contracts.js';
import { createFakeAdapter, nextFrame } from '../fixtures/fake-adapter.js';
import { byId, must, query, resetStore, spyConsole, texts } from './helpers.js';

const pickers: { destroy(): void }[] = [];
const frames: HTMLIFrameElement[] = [];

/** A class picker on `target`, destroyed after the test. */
function create(target: string | HTMLElement, options: object = {}) {
  const fake = createFakeAdapter();
  const picker = new LocationPicker(target, { provider: fake.adapter, ...options });
  pickers.push(picker);
  return { picker, fake };
}

function rect(element: Element): DOMRect {
  return element.getBoundingClientRect();
}

/** Pin box vs map centre: the tip sits at y = 43/44 of the box (v1's -43 px margin at 44 px). */
function pinGeometry(root: ParentNode) {
  // realm-agnostic lookups: the root may be an iframe's document
  const map = rect(must(root.querySelector('.lp-map'), '.lp-map'));
  const pin = rect(must(root.querySelector('.lp-pin'), '.lp-pin'));
  const centre = { x: map.left + map.width / 2, y: map.top + map.height / 2 };
  return {
    width: pin.width,
    height: pin.height,
    dx: pin.left + pin.width / 2 - centre.x,
    tipDy: pin.top + (pin.height * 43) / 44 - centre.y,
    bottomDy: pin.bottom - centre.y,
  };
}

async function iframe(srcdoc?: string): Promise<Document> {
  const frame = document.createElement('iframe');
  frame.style.cssText = 'width: 400px; height: 400px; border: 0';
  const loaded = new Promise((resolve) => frame.addEventListener('load', resolve, { once: true }));
  if (srcdoc !== undefined) frame.srcdoc = srcdoc;
  document.body.append(frame);
  frames.push(frame);
  if (srcdoc !== undefined) await loaded;
  return must(frame.contentDocument, 'an iframe document');
}

const classSheet = (): CSSStyleSheet =>
  must(getStore().sheets.get(`${version}:class`), 'the class sheet');

beforeEach(() => {
  resetStore();
  document.body.innerHTML = '';
});
afterEach(async () => {
  for (const picker of pickers.splice(0)) picker.destroy();
  for (const frame of frames.splice(0)) frame.remove();
  vi.restoreAllMocks();
  if (server.browser == 'chromium') {
    await cdp().send('Emulation.setEmulatedMedia', { features: [] });
  }
});

describe('WP2-14 styles', () => {
  it('5 pickers adopt the class sheet once per document', () => {
    document.body.innerHTML = [1, 2, 3, 4, 5]
      .map((i) => `<div id="m${i}" style="height:100px"></div>`)
      .join('');
    const before = document.adoptedStyleSheets.length;
    for (const i of [1, 2, 3, 4, 5]) create(`#m${i}`);
    expect(document.adoptedStyleSheets.filter((sheet) => sheet === classSheet())).toHaveLength(1);
    expect(document.adoptedStyleSheets.length - before).toBeLessThanOrEqual(1);
    expect(document.querySelectorAll('style[data-location-picker]')).toHaveLength(0);
  });

  it('adopts into a user ShadowRoot when the target lives there (and the pin is laid out there)', () => {
    document.body.innerHTML = '<div id="host"></div>';
    const shadow = byId('host').attachShadow({ mode: 'open' });
    const target = document.createElement('div');
    target.style.cssText = 'width: 300px; height: 200px';
    shadow.append(target);
    create(target);
    create(target);
    expect(shadow.adoptedStyleSheets.filter((sheet) => sheet === classSheet())).toHaveLength(1);
    expect(pinGeometry(shadow)).toMatchObject({ width: 28, height: 44 });
  });

  it('without adoptedStyleSheets: one <style> carrying the detected nonce', async () => {
    const doc = await iframe(
      '<!doctype html><html><head><script nonce="abc123"></script></head><body></body></html>',
    );
    Object.defineProperty(doc, 'adoptedStyleSheets', { configurable: true, value: undefined });
    for (const i of [1, 2, 3, 4, 5]) {
      const target = doc.createElement('div');
      target.id = `m${i}`;
      doc.body.append(target);
      create(target);
    }
    const styles = doc.head.querySelectorAll('style');
    expect(styles).toHaveLength(1);
    expect(must(styles.item(0)).nonce).toBe('abc123');
    expect(pinGeometry(doc)).toMatchObject({ width: 28, height: 44 });
  });

  it('injectStyles: false adds nothing', async () => {
    const doc = await iframe('<!doctype html><body><div id="map"></div></body>');
    create(must(doc.getElementById('map')), { injectStyles: false });
    expect(doc.adoptedStyleSheets).toHaveLength(0);
    expect(doc.querySelectorAll('style, link')).toHaveLength(0);
  });

  it("strict CSP page (style-src 'self'): the adopted sheet applies and the pin geometry is correct", async () => {
    const doc = await iframe(
      `<!doctype html><html><head><meta http-equiv="Content-Security-Policy" content="style-src 'self'"></head>` +
        '<body><div id="map"></div></body></html>',
    );
    const log = spyConsole();
    create(must(doc.getElementById('map')));
    const geometry = pinGeometry(doc);
    expect(geometry).toMatchObject({ width: 28, height: 44 });
    expect(Math.abs(geometry.dx)).toBeLessThanOrEqual(0.5);
    expect(Math.abs(geometry.tipDy)).toBeLessThanOrEqual(0.5);
    expect(texts(log.warn)).toEqual([expect.stringContaining('0 height')]);
  });
});

describe('WP2-15 pin (class mode)', () => {
  it('28x44 at the default size, its tip on the map centre, with the centerMarker alias', () => {
    document.body.innerHTML = '<div id="map" style="width: 401px; height: 301px"></div>';
    create('#map');
    const geometry = pinGeometry(document);
    expect([geometry.width, geometry.height]).toEqual([28, 44]);
    expect(Math.abs(geometry.dx)).toBeLessThanOrEqual(0.5);
    expect(Math.abs(geometry.tipDy)).toBeLessThanOrEqual(0.5);
    // the box bottom is 1 px below the centre: margin-block-start is calc(1px - size), exactly v1's -43 px
    expect(geometry.bottomDy).toBeCloseTo(1, 0);
    expect(query(document, '.lp-pin', HTMLElement).classList.contains('centerMarker')).toBe(true);
  });

  it('--lp-pin-size: 88px gives 56x88', () => {
    document.body.innerHTML =
      '<div id="map" style="width: 400px; height: 300px; --lp-pin-size: 88px"></div>';
    create('#map');
    const geometry = pinGeometry(document);
    expect([geometry.width, geometry.height]).toEqual([56, 88]);
    expect(Math.abs(geometry.dx)).toBeLessThanOrEqual(0.5);
  });

  it('lifts (transform != none) while dragging, and the unset pin is dimmed', async () => {
    document.body.innerHTML =
      '<div id="map" style="width: 400px; height: 300px; --lp-transition: 0s"></div>';
    const { picker, fake } = create('#map');
    await picker.ready;
    const pin = query(document, '.lp-pin', HTMLElement);
    expect(getComputedStyle(pin).opacity).toBe('0.6');
    expect(getComputedStyle(pin).transform).toBe('none');
    must(fake.ctx).events.interactionStart();
    expect(getComputedStyle(pin).transform).toBe('matrix(1, 0, 0, 1, 0, -10)');
    must(fake.ctx).events.interactionEnd();
    expect(getComputedStyle(pin).transform).toBe('none');
  });

  it.runIf(server.browser == 'chromium')(
    'no lift under an emulated prefers-reduced-motion: reduce (CDP)',
    async () => {
      document.body.innerHTML = '<div id="map" style="width: 400px; height: 300px"></div>';
      const { picker, fake } = create('#map');
      await picker.ready;
      const pin = query(document, '.lp-pin', HTMLElement);
      await cdp().send('Emulation.setEmulatedMedia', {
        features: [{ name: 'prefers-reduced-motion', value: 'reduce' }],
      });
      must(fake.ctx).events.interactionStart();
      expect(matchMedia('(prefers-reduced-motion: reduce)').matches).toBe(true);
      expect(getComputedStyle(pin).transform).toBe('none');
      expect(getComputedStyle(pin).transitionDuration).toBe('0s, 0s');
    },
  );

  it('the shipped sheet drops the lift and the transitions under prefers-reduced-motion: reduce', () => {
    document.body.innerHTML = '<div id="map" style="height: 100px"></div>';
    create('#map');
    const reduced = [...classSheet().cssRules].find(
      (rule): rule is CSSMediaRule =>
        'media' in rule && String(rule.media).includes('prefers-reduced-motion: reduce'),
    );
    const text = must(reduced, 'a reduced-motion rule').cssText;
    expect(text).toMatch(/\.lp-is-dragging \.lp-pin[^{]*\{[^}]*transform: none/);
    expect(text).toContain('--lp-transition: 0s');
  });

  it('a v1 sheet on the same page (before and after) does not change the v3 pin', () => {
    const v1 =
      '.location-picker .centerMarker{position:absolute;background:url("data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27/%3E") no-repeat;' +
      'top:50%;left:50%;z-index:1;margin-left:-14px;margin-top:-43px;height:44px;width:28px;cursor:pointer}';
    document.body.innerHTML = `<style>${v1}</style><div id="map" style="width: 400px; height: 300px; --lp-pin-size: 88px"></div><style>${v1}</style>`;
    create('#map');
    const pin = query(document, '.lp-pin', HTMLElement);
    expect(pinGeometry(document)).toMatchObject({ width: 56, height: 88 });
    expect(getComputedStyle(pin).backgroundImage).toBe('none');
    expect(getComputedStyle(pin).cursor).toBe('auto');
    document.head.insertAdjacentHTML(
      'beforeend',
      '<style id="hide">.location-picker .centerMarker{display:none}</style>',
    );
    expect(getComputedStyle(pin).display).toBe('none');
    byId('hide').remove();
  });
});

describe('WP2-16 0-height target', () => {
  it('gets min-block-size: 320px and exactly one warning', () => {
    const log = spyConsole();
    document.body.innerHTML =
      '<div id="a"></div><div id="b"></div><div id="c" style="display:none"></div>';
    create('#a');
    create('#b');
    create('#c');
    expect(byId('a').style.minBlockSize).toBe('320px');
    expect(rect(byId('a')).height).toBe(320);
    expect(byId('c').style.minBlockSize).toBe('');
    expect(texts(log.warn)).toEqual([expect.stringContaining('The target has 0 height')]);
    must(pickers.at(0)).destroy();
    expect(byId('a').style.minBlockSize).toBe('');
  });
});

describe('WP2-21 created inside display:none, then shown', () => {
  it('calls handle.resize() and re-centres on the value', async () => {
    document.body.innerHTML =
      '<div id="wrap" style="display:none"><div id="map" style="height: 200px"></div></div>';
    const { picker, fake } = create('#map', { value: '1,2' });
    await picker.ready;
    await nextFrame();
    await nextFrame();
    // a 0-size engine drifts while hidden (Leaflet keeps a stale centre)
    must(fake.handle).map.center = { lat: 0, lng: 0 };
    const [views, resizes] = [fake.calls.setView.length, fake.calls.resize];
    byId('wrap').style.display = 'block';
    await vi.waitFor(() => expect(fake.calls.resize).toBeGreaterThan(resizes));
    expect(fake.calls.setView.length).toBeGreaterThan(views);
    expect(fake.calls.setView.at(-1)?.center).toEqual({ lat: 1, lng: 2 });
    expect(must(fake.handle).map.center).toEqual({ lat: 1, lng: 2 });
    expect(picker.value).toBe('1,2');
  });
});

describe('WP2-25 class mode survives frameworks and hidden', () => {
  it('target.className rewrites keep the geometry, states, unset opacity, lift and the filling wrapper', async () => {
    document.body.innerHTML =
      '<section style="position: relative; padding: 50px"><div id="map" class="a" style="height: 300px; --lp-transition: 0s"></div></section>';
    const target = byId('map');
    const { picker, fake } = create(target);
    await picker.ready;
    target.className = 'x';
    target.setAttribute('class', 'y z');
    const base = query(target, '.lp-base', HTMLElement);
    expect(base.classList.contains('lp-is-unset')).toBe(true);
    expect(base.classList.contains('lp-is-ready')).toBe(true);
    expect(pinGeometry(target)).toMatchObject({ width: 28, height: 44 });
    expect(getComputedStyle(query(target, '.lp-pin', HTMLElement)).opacity).toBe('0.6');
    expect(rect(base).toJSON()).toEqual(rect(target).toJSON());
    must(fake.ctx).events.interactionStart();
    expect(getComputedStyle(query(target, '.lp-pin', HTMLElement)).transform).not.toBe('none');
  });

  it('a static target gets an inline position: relative, an absolute one gets none', () => {
    document.body.innerHTML =
      '<div id="s" style="height: 100px"></div><div style="position: relative; height: 100px"><div id="a" style="position: absolute; inset: 0"></div></div>';
    create('#s');
    create('#a');
    expect(byId('s').style.position).toBe('relative');
    expect(byId('a').style.position).toBe('absolute');
    expect(getComputedStyle(byId('a')).position).toBe('absolute');
  });

  it('hidden parts have zero size even when user CSS sets their display', async () => {
    document.body.innerHTML =
      '<style>.lp-controls button{display:grid}.lp-confirm,.lp-hint,.lp-error,.lp-fallback{display:block}</style>' +
      '<div id="map" style="height: 300px"></div>';
    const { picker } = create('#map', { locate: 'off' });
    await picker.ready;
    for (const selector of ['.lp-confirm', '.lp-hint', '.lp-error', '.lp-fallback', '.lp-locate']) {
      const part = query(document, selector, HTMLElement);
      expect(part.hidden).toBe(true);
      expect([rect(part).width, rect(part).height]).toEqual([0, 0]);
    }
  });
});

describe('element sheet (shadow root of an element host)', () => {
  it(':host is a 320px block, [hidden] parts stay hidden, and the pin is 28x44 on the centre', async () => {
    document.body.innerHTML = '<x-host id="el"></x-host>';
    const element = byId('el');
    const root = element.attachShadow({ mode: 'open' });
    const fake = createFakeAdapter();
    const host: CoreHost = {
      mode: 'element',
      host: element,
      renderRoot: root,
      styleRoot: root,
      lookupRoot: document,
      eventTarget: element,
      setState: () => {},
    };
    const core = new PickerCore(
      host,
      resolveConfig({ provider: erased(fake.adapter) }, { mode: 'element', host: element }).config,
    );
    core.mount();
    await core.ready;
    expect(rect(element).height).toBe(320);
    expect(getComputedStyle(element).display).toBe('block');
    const geometry = pinGeometry(root);
    expect([geometry.width, geometry.height]).toEqual([28, 44]);
    expect(Math.abs(geometry.tipDy)).toBeLessThanOrEqual(0.5);
    expect(rect(core.refs.confirm).width).toBe(0);
    element.hidden = true;
    expect(rect(element).height).toBe(0);
    core.destroy();
  });
});
