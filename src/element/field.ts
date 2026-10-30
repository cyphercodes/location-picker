// Field mode (A10, A13.3), eager half: the compact control that stands in for the map until the sheet opens. It is the
// focus, label and validity target, so it renders synchronously on connect; the sheet itself is a lazy chunk
// (./sheet.ts). DOM calls only (no innerHTML), so Trusted Types pages work.
import type { Messages } from '../core.js';

/** `presentation="auto"` is field mode where this matches (phones), else inline. */
export const PHONE_QUERY = '(pointer: coarse) and (max-width: 640px)';
export const SHOW_PICKER_INLINE =
  'showPicker() opens the map sheet in field mode only; set presentation="field" (or "auto")';

/**
 * The host box and the control. The `:host` rules follow the attribute and the `auto` query (not JS state), so the host
 * is compact from the first paint; they never match an inline picker.
 */
export const FIELD_CSS: string = `:host([presentation=field]){block-size:auto;min-block-size:0}
@media ${PHONE_QUERY}{:host([presentation=auto]){block-size:auto;min-block-size:0}}
.lp-field{display:flex;align-items:center;gap:8px;min-block-size:var(--lp-control-size,44px);padding-inline-start:12px;box-sizing:border-box;border:1px solid color-mix(in srgb,currentColor 35%,transparent);border-radius:var(--lp-radius,8px);background:var(--lp-surface,light-dark(#fff,#1f1f1f));color:var(--lp-on-surface,light-dark(#1f2937,#f3f4f6));font:var(--lp-font,inherit)}
.lp-field-value{flex:1;min-inline-size:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.lp-field-value[data-unset]{opacity:.7}
.lp-field-button{flex:none;align-self:stretch;min-inline-size:var(--lp-control-size,44px);padding-inline:12px;border:0;border-start-end-radius:inherit;border-end-end-radius:inherit;background:var(--lp-accent,light-dark(#1d4ed8,#93c5fd));color:light-dark(#fff,#000);font:inherit;cursor:pointer}
.lp-field-button:focus-visible{outline:2px solid var(--lp-accent,light-dark(#1d4ed8,#93c5fd));outline-offset:2px}
.lp-field-button:disabled{opacity:.5;cursor:default}`;

let uid = 0;

/** The `field`, `field-value` and `field-button` parts. */
export class FieldControl {
  readonly root: HTMLElement;
  readonly value: HTMLElement;
  readonly button: HTMLButtonElement;

  constructor(doc: Document, open: () => void, warm: () => void) {
    const node = <K extends 'div' | 'span' | 'button'>(
      tag: K,
      part: string,
    ): HTMLElementTagNameMap[K] => {
      const el = doc.createElement(tag);
      el.className = `lp-${part}`;
      el.setAttribute('part', part);
      return el;
    };
    this.root = node('div', 'field');
    this.value = node('span', 'field-value');
    this.button = node('button', 'field-button');
    this.value.id = `lp-f-${++uid}`;
    this.button.type = 'button';
    this.button.setAttribute('aria-haspopup', 'dialog');
    // The button's description is the chosen location, so screen readers read both on focus.
    this.button.setAttribute('aria-describedby', this.value.id);
    this.button.addEventListener('click', open);
    // Optional warm-up: load the sheet chunk while the pointer approaches or the control has focus.
    this.root.addEventListener('pointerenter', warm);
    this.button.addEventListener('focus', warm);
    this.root.append(this.value, this.button);
  }

  /** The address when known, else the coordinates, else the placeholder. */
  render(value: string, address: string | null, messages: Messages, disabled: boolean): void {
    const { value: text, button } = this;
    text.textContent = value ? address || value.replace(',', ', ') : messages.fieldPlaceholder;
    text.toggleAttribute('data-unset', !value);
    button.textContent = messages.chooseOnMap;
    button.disabled = disabled;
  }
}
