// The picker's own DOM (CONTRACT §3.1): ONE template for both surfaces. The element gets `part` attributes and slots
// inside its shadow root; the class gets the same nodes in light DOM with `lp-*` classes (both modes carry the classes,
// so one CSS source styles both). Built with DOM calls only: no innerHTML, so Trusted Types pages work.
import type { Messages } from '../core.js';
import type * as C from '../internal/contracts.js';
import type { OverlayRefs } from '../internal/contracts.js';

const SVG = 'http://www.w3.org/2000/svg';

function svg(
  doc: Document,
  className: string,
  viewBox: string,
  shapes: [string, Record<string, string>][],
): SVGSVGElement {
  const root = doc.createElementNS(SVG, 'svg');
  root.setAttribute('class', className);
  root.setAttribute('viewBox', viewBox);
  root.setAttribute('aria-hidden', 'true');
  for (const [tag, attrs] of shapes) {
    const shape = doc.createElementNS(SVG, tag);
    for (const [name, value] of Object.entries(attrs)) shape.setAttribute(name, value);
    root.append(shape);
  }
  return root;
}

/** Builds the overlay (not yet attached). `uid` makes ids unique per instance. */
export function renderOverlay(
  doc: Document,
  mode: 'class' | 'element',
  messages: Messages,
  uid: string,
): OverlayRefs {
  const element = mode == 'element';
  const node = <K extends keyof HTMLElementTagNameMap>(
    tag: K,
    name: string,
    parent: HTMLElement | null,
    part: string | null = name,
  ): HTMLElementTagNameMap[K] => {
    const el = doc.createElement(tag);
    el.className = `lp-${name}`;
    if (element && part) el.setAttribute('part', part);
    parent?.append(el);
    return el;
  };
  const slot = (name: string, parent: HTMLElement, ...fallback: Node[]): void => {
    if (!element) {
      parent.append(...fallback);
      return;
    }
    const s = doc.createElement('slot');
    s.name = name;
    s.append(...fallback);
    parent.append(s);
  };

  const base = node('div', 'base', null);
  const search = node('div', 'search', base);
  const map = node('div', 'map', base);
  const pin = node('div', 'pin', base);
  const confirm = node('button', 'confirm', base, 'confirm-button');
  const controls = node('div', 'controls', base);
  const locate = node('button', 'locate', controls, 'locate-button');
  const hint = node('div', 'hint', base);
  const error = node('div', 'error', base, 'error-message');
  const fallback = node('input', 'fallback', base);
  const instructions = node('div', 'sr', base, null);
  const status = node('div', 'status lp-sr', base, null);

  search.hidden =
    confirm.hidden =
    locate.hidden =
    hint.hidden =
    error.hidden =
    fallback.hidden =
      true;
  map.tabIndex = 0;
  map.setAttribute('role', 'application');
  map.setAttribute('aria-describedby', (instructions.id = `lp-i-${uid}`));
  pin.setAttribute('aria-hidden', 'true');
  if (!element) pin.classList.add('centerMarker');
  const icon = svg(doc, 'lp-pin-icon', '0 0 28 44', [
    ['path', { d: 'M14 1C6.8 1 1 6.8 1 14c0 9.5 13 29 13 29s13-19.5 13-29C27 6.8 21.2 1 14 1z' }],
    ['circle', { cx: '14', cy: '14', r: '5' }],
  ]);
  if (element) icon.setAttribute('part', 'pin-icon');
  slot('marker', pin, icon);
  node('span', 'pin-shadow', pin);
  confirm.type = locate.type = 'button';
  locate.append(
    svg(doc, 'lp-icon', '0 0 24 24', [
      ['circle', { cx: '12', cy: '12', r: '7' }],
      ['path', { d: 'M12 1v4m0 14v4M1 12h4m14 0h4' }],
    ]),
  );
  slot('controls', controls);
  hint.setAttribute('role', 'status');
  const errorText = doc.createElement('span');
  slot('error', error, errorText);
  fallback.type = 'text';
  fallback.inputMode = 'decimal';
  fallback.autocomplete = 'off';
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');

  const refs: OverlayRefs = {
    base,
    search,
    map,
    pin,
    confirm,
    controls,
    locate,
    hint,
    error,
    fallback,
    instructions,
    status,
  };
  applyTexts(refs, messages);
  return refs;
}

/** (Re)applies the UI strings, e.g. after `messages` changed. */
export function applyTexts(refs: OverlayRefs, messages: Messages): void {
  refs.map.setAttribute('aria-roledescription', messages.roleDescription);
  refs.confirm.textContent = messages.confirm;
  refs.locate.setAttribute('aria-label', messages.locate);
  refs.locate.title = messages.locate;
  refs.fallback.setAttribute('aria-label', messages.fallbackLabel);
  refs.fallback.placeholder = messages.fallbackLabel;
  refs.instructions.textContent = messages.instructions;
  const text = refs.error.querySelector('span');
  if (text) text.textContent = messages.loadError;
}

renderOverlay satisfies typeof C.renderOverlay;
