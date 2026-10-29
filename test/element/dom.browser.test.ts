// WP4-08 (no host mutations, open shadow root), WP4-12 (focus and labels), WP4-13 (moveBefore, hidden then shown)
// and WP4-22 (hidden), browser project.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import classCss from '../../src/styles/class.css?inline';
import { nextFrame } from '../fixtures/fake-adapter.js';
import { create, flush, must, part, render, resetStore, summary } from './helpers.js';

const frames: HTMLIFrameElement[] = [];
beforeEach(() => resetStore());
afterEach(() => {
  vi.restoreAllMocks();
  for (const frame of frames.splice(0)) frame.remove();
  document.body.innerHTML = '';
  document.head.querySelectorAll('style[data-test]').forEach((style) => style.remove());
});

const box = (el: Element): { width: number; height: number } => {
  const { width, height } = el.getBoundingClientRect();
  return { width, height };
};
const userCss = (css: string): void => {
  const style = document.createElement('style');
  style.dataset.test = '';
  style.textContent = css;
  document.head.append(style);
};

describe('WP4-08 hydration safety', () => {
  it('zero picker-caused host mutations from connect through ready; the shadow root is open with delegatesFocus', async () => {
    const { el } = create();
    el.setAttribute('name', 'loc');
    const records: MutationRecord[] = [];
    const observer = new MutationObserver((list) => records.push(...list));
    observer.observe(el, { attributes: true, childList: true, subtree: false });
    document.body.append(el);
    await el.ready;
    await flush();
    observer.disconnect();
    expect(records).toEqual([]);
    expect(el.getAttributeNames()).toEqual(['name']);
    expect(el.childNodes).toHaveLength(0);
    expect(el.shadowRoot?.mode).toBe('open');
    expect(el.shadowRoot?.delegatesFocus).toBe(true);
    expect(el.shadowRoot?.adoptedStyleSheets.length).toBeGreaterThan(0);
  });
});

describe('WP4-12 focus and labels', () => {
  it('<label for> click and el.focus() focus the map region; focus/blur reach the host', async () => {
    const { el } = render(
      '<label for="loc">Store location</label><location-picker id="loc"></location-picker><button id="after">x</button>',
    );
    await flush();
    const seen: string[] = [];
    el.addEventListener('focus', () => seen.push('focus'));
    el.addEventListener('blur', () => seen.push('blur'));
    document.querySelector('label')!.click();
    expect(el.shadowRoot?.activeElement).toBe(part(el, 'map'));
    expect(document.activeElement).toBe(el);
    document.getElementById('after')!.focus();
    el.focus();
    expect(el.shadowRoot?.activeElement).toBe(part(el, 'map'));
    expect(seen).toEqual(['focus', 'blur', 'focus']);
    expect(part(el, 'map').getAttribute('aria-label')).toBe('Store location');
  });

  it('with search, focus goes to the search input; blur after focus sets :state(interacted)', async () => {
    const { el } = render(
      '<location-picker search></location-picker><button id="after">x</button>',
    );
    await flush();
    // The combobox (WP3) renders an input into part="search"; stand in for it.
    const input = document.createElement('input');
    part(el, 'search').append(input);
    el.focus();
    expect(el.shadowRoot?.activeElement).toBe(input);
    expect(el.matches(':state(interacted)')).toBe(false);
    document.getElementById('after')!.focus();
    expect(el.matches(':state(interacted)')).toBe(true);
  });

  it('the host is a group named by its label; the map region has a role and a description', async () => {
    const { el } = render('<location-picker aria-label="Pickup point"></location-picker>');
    await flush();
    const map = part(el, 'map');
    expect(map.getAttribute('role')).toBe('application');
    expect(map.getAttribute('aria-label')).toBe('Pickup point');
    const described = must(map.getAttribute('aria-describedby'));
    expect(el.shadowRoot?.getElementById(described)?.textContent).toContain('arrow keys');
    expect(el.hasAttribute('role')).toBe(false);
    expect(el.hasAttribute('tabindex')).toBe(false);
  });
});

describe('WP4-13 lifecycle (browser)', () => {
  it('moveBefore(), where supported, keeps the map: no remount and no second ready', async () => {
    const { el, fake, log } = render('<div id="a"></div><location-picker></location-picker>');
    await flush();
    const parent = document.getElementById('a')!;
    const moveBefore: unknown = Reflect.get(parent, 'moveBefore');
    if (typeof moveBefore != 'function') return;
    Reflect.apply(moveBefore, parent, [el, null]);
    await flush();
    expect(el.parentElement).toBe(parent);
    expect(fake.mountCount).toBe(1);
    expect(fake.handle?.map.destroyed).toBe(false);
    expect(summary(log)).toEqual(['ready']);
  });

  it('initialised while hidden, then shown: the map is resized and re-centred', async () => {
    const { el, fake } = render('<location-picker hidden value="1,2"></location-picker>');
    await flush();
    expect(box(el)).toEqual({ width: 0, height: 0 });
    const resized = fake.calls.resize;
    el.hidden = false;
    await nextFrame();
    await nextFrame();
    expect(fake.calls.resize).toBeGreaterThan(resized);
    expect(fake.calls.setView.at(-1)?.center).toEqual({ lat: 1, lng: 2 });
  });
});

describe('WP4-22 hidden', () => {
  it('<location-picker hidden> has a zero-size box, and hidden toggles live', async () => {
    const { el } = render('<location-picker hidden></location-picker>');
    await flush();
    expect(box(el)).toEqual({ width: 0, height: 0 });
    el.hidden = false;
    expect(box(el).height).toBe(320);
    el.hidden = true;
    expect(box(el)).toEqual({ width: 0, height: 0 });
  });

  it('the :not(:defined):not([hidden]) placeholder does not show a hidden undefined element', async () => {
    const frame = document.createElement('iframe');
    frames.push(frame);
    const loaded = new Promise((resolve) =>
      frame.addEventListener('load', resolve, { once: true }),
    );
    frame.srcdoc = `<!doctype html><style>${classCss}</style><location-picker id="a"></location-picker><location-picker id="b" hidden></location-picker>`;
    document.body.append(frame);
    await loaded;
    const doc = must(frame.contentDocument);
    expect(box(must(doc.getElementById('a'))).height).toBe(320);
    expect(box(must(doc.getElementById('b')))).toEqual({ width: 0, height: 0 });
  });

  it('hidden parts stay unrendered even when user CSS sets display on ::part()', async () => {
    userCss(
      'location-picker::part(controls){display:grid} location-picker::part(locate-button){display:flex}' +
        ' location-picker::part(confirm-button), location-picker::part(hint), location-picker::part(error-message),' +
        ' location-picker::part(fallback){display:block}',
    );
    const { el } = render('<location-picker></location-picker>');
    await flush();
    const parts = ['confirm-button', 'locate-button', 'hint', 'error-message', 'fallback'];
    const shown = parts.map((name) => {
      const node = part(el, name);
      return `${name}:${node.hidden}:${getComputedStyle(node).display}`;
    });
    expect(shown).toEqual(parts.map((name) => `${name}:true:none`));
    expect(getComputedStyle(part(el, 'controls')).display).toBe('grid');
  });
});
