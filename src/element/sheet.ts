// Field mode (A10, A13.3), lazy half: the full-screen map sheet. A native modal <dialog> (top layer, Escape and the
// Android back gesture close it) holds the picker's map, pin, search and controls. The core inside it reports to a
// relay instead of the element, so pans, picks and locates stay a DRAFT: Confirm commits it (input + change with the
// draft's source), Cancel puts the committed value back silently. Loaded on first open, warm-up or a method call.
import type { AddressDetail, LocationDetail } from '../core.js';
import type { BoundInputs } from '../core/bind-inputs.js';
import type { PickerCore } from '../core/picker-core.js';
import type { PickerSnapshot, ResolvedConfig } from '../internal/contracts.js';
import type { FieldControl } from './field.js';
import { adoptCss } from '../core/styles.js';
import { version } from '../core/version.js';

/** What the sheet needs from the element's controller. */
export interface SheetHost {
  readonly el: HTMLElement;
  readonly root: ShadowRoot;
  readonly config: ResolvedConfig;
  readonly core: PickerCore | undefined;
  readonly field: FieldControl | undefined;
  readonly inputs: BoundInputs | undefined;
  readonly state: { readonly value: string; readonly address: string | null };
  /** Method locates (`locate()`, `setCurrentPosition()`) in flight: their results are commits even while closed. */
  readonly locating: number;
  setState(name: string, on: boolean): void;
  mirror(snapshot: PickerSnapshot): void;
  /** Puts the committed state back into the core, silently. */
  revert(): void;
  /** Applies a presentation change that waited for the sheet to close. */
  present(): void;
}

const SHEET_CSS = `.lp-sheet{position:fixed;inset:0;box-sizing:border-box;inline-size:100%;block-size:100%;block-size:100dvh;max-inline-size:none;max-block-size:none;margin:0;padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left);border:0;overflow:hidden;overscroll-behavior:contain;background:var(--lp-surface,light-dark(#fff,#1f1f1f));color:var(--lp-on-surface,light-dark(#1f2937,#f3f4f6));font:var(--lp-font,inherit)}
.lp-sheet[open]{display:flex;flex-direction:column}
.lp-sheet::backdrop{background:rgb(0 0 0 / .4)}
@media (prefers-reduced-motion:no-preference){.lp-sheet[open]{animation:lp-sheet-in var(--lp-transition,160ms ease-out)}}
@keyframes lp-sheet-in{from{translate:0 24px;opacity:0}}
.lp-sheet-header{display:flex;align-items:center;gap:8px;padding:8px}
.lp-sheet-title{flex:1;min-inline-size:0;margin:0;overflow:hidden;font:inherit;font-weight:600;text-align:center;text-overflow:ellipsis;white-space:nowrap}
.lp-sheet-header button{min-inline-size:var(--lp-control-size,44px);min-block-size:var(--lp-control-size,44px);padding-inline:12px;border:0;border-radius:var(--lp-radius,8px);background:none;color:var(--lp-accent,light-dark(#1d4ed8,#93c5fd));font:inherit;cursor:pointer}
.lp-sheet-header .lp-sheet-confirm{background:var(--lp-accent,light-dark(#1d4ed8,#93c5fd));color:light-dark(#fff,#000)}
.lp-sheet-header button:focus-visible{outline:2px solid var(--lp-accent,light-dark(#1d4ed8,#93c5fd));outline-offset:2px}
.lp-sheet-header button:disabled{opacity:.5;cursor:default}
.lp-sheet-body{position:relative;flex:1;min-block-size:0}
.lp-sheet-body .lp-confirm{display:none!important}`;

let uid = 0;

/** The `sheet`, `sheet-header`, `cancel-button` and Confirm (`confirm-button`) parts, and the draft session. */
export class Sheet {
  readonly dialog: HTMLDialogElement;
  /** The core's render root. */
  readonly body: HTMLElement;
  /** The core's event target: events reach the element only through `relay()`. */
  readonly relay: EventTarget = new EventTarget();
  readonly title: HTMLElement;
  readonly cancel: HTMLButtonElement;
  readonly confirm: HTMLButtonElement;
  open = false;
  readonly #host: SheetHost;
  #mounted = false;
  /** The last input/change detail of this session (its source is what Confirm reports). */
  #staged: LocationDetail | undefined;
  #visible = false;
  readonly #observer: ResizeObserver | undefined;

  constructor(host: SheetHost) {
    this.#host = host;
    const doc = host.el.ownerDocument;
    adoptCss(host.root, `${version}:sheet`, SHEET_CSS, host.config.nonce);
    const node = <K extends 'dialog' | 'div' | 'h2' | 'button'>(
      tag: K,
      name: string,
      part?: string,
    ): HTMLElementTagNameMap[K] => {
      const el = doc.createElement(tag);
      el.className = `lp-${name}`;
      if (part) el.setAttribute('part', part);
      return el;
    };
    const dialog = (this.dialog = node('dialog', 'sheet', 'sheet'));
    const header = node('div', 'sheet-header', 'sheet-header');
    this.cancel = node('button', 'sheet-cancel', 'cancel-button');
    this.title = node('h2', 'sheet-title');
    this.confirm = node('button', 'sheet-confirm', 'confirm-button');
    this.body = node('div', 'sheet-body');
    this.cancel.type = this.confirm.type = 'button';
    this.title.id = `lp-s-${++uid}`;
    dialog.setAttribute('aria-labelledby', this.title.id);
    header.append(this.cancel, this.title, this.confirm);
    dialog.append(header, this.body);
    host.root.append(dialog);

    this.cancel.addEventListener('click', () => this.close());
    this.confirm.addEventListener('click', () => this.commit());
    // Escape, the Android back gesture and requestClose() close the dialog natively: that is a Cancel.
    dialog.addEventListener('close', () => {
      if (this.open) this.#finish(true);
    });
    for (const type of ['input', 'change', 'addresschange', 'ready', 'error'])
      this.relay.addEventListener(type, (event) => this.#relay(event));
    // The map lives in the dialog, not in the (always visible) field: resize it when the sheet opens or rotates.
    const Observer = doc.defaultView?.ResizeObserver;
    this.#observer = Observer
      ? new Observer(([entry]) => {
          const { width = 0, height = 0 } = entry?.contentRect ?? {};
          const visible = width > 0 && height > 0;
          const core = host.core;
          const handle = core?.handle;
          if (core && handle) {
            handle.resize();
            // Shown again: back on the value (a map mounted while hidden measured nothing). Never under a gesture
            // that started first: that would end it and drop the pan.
            const { latLng, center, zoom } = core.snapshot;
            if (visible && !this.#visible && !core.refs.base.classList.contains('lp-is-dragging'))
              handle.setView(latLng ?? center, zoom, { animate: false });
          }
          this.#visible = visible;
        })
      : undefined;
    this.#observer?.observe(this.body);
    this.refresh();
  }

  /** Opens the sheet (showPicker): modal, focus on the map, the engine mounted on first open. */
  show(): void {
    const host = this.#host;
    if (this.open || !host.el.isConnected || host.config.disabled) return;
    try {
      this.dialog.showModal();
    } catch {
      return;
    }
    this.open = true;
    this.#staged = undefined;
    host.setState('open', true);
    this.mount();
    this.refresh();
    host.core?.refs.map.focus();
    this.#toggle('closed', 'open');
  }

  /** Loads and mounts the engine once (first open, or a method that needs the map). */
  mount(): void {
    const core = this.#host.core;
    if (this.#mounted || !core) return;
    this.#mounted = true;
    core.mount();
  }

  /** Confirm: the draft becomes the value (input + change with its source); unchanged, nothing fires. */
  commit(): void {
    const host = this.#host;
    const core = host.core;
    if (!this.open || !core) return;
    // While unset, Confirm chooses the point under the pin, as Enter does.
    if (!core.snapshot.value) core.commitCenter();
    const draft = core.snapshot;
    const changed = draft.value != host.state.value;
    if (changed) {
      host.mirror(draft);
      host.inputs?.write(draft.value, draft.address, 'commit');
    }
    this.#finish(false);
    if (!changed) return;
    const staged = this.#staged;
    const [lat = 0, lng = 0] = draft.value.split(',').map(Number);
    const detail: LocationDetail = {
      ...(staged?.value == draft.value
        ? staged
        : { lat, lng, value: draft.value, source: staged?.source ?? 'user' }),
      zoom: draft.zoom,
      address: draft.address,
    };
    this.#emit('input', detail, true);
    this.#emit('change', { ...detail }, false);
    if (draft.address !== null)
      queueMicrotask(() => {
        if (host.state.value != draft.value) return;
        const address: AddressDetail = {
          lat,
          lng,
          value: draft.value,
          address: draft.address,
          result: draft.addressResult,
        };
        this.#emit('addresschange', address, true);
      });
  }

  /** Cancel (and `close()`): the committed value goes back into the map silently; no input or change. */
  close(): void {
    if (this.open) this.#finish(true);
  }

  /** Texts, the title (the element's accessible name) and Confirm's state; called after every element update. */
  refresh(): void {
    const host = this.#host;
    const { messages, centerGiven, disabled } = host.config;
    const el = host.el;
    const labels = (el as Partial<HTMLInputElement>).labels;
    this.title.textContent =
      el.getAttribute('aria-label') || labels?.[0]?.textContent?.trim() || messages.chooseOnMap;
    this.cancel.textContent = messages.cancel;
    this.confirm.textContent = messages.confirm;
    // As the inline confirm button: the bare world view is never a choice, so unset needs a `center` (or a pan).
    this.confirm.disabled = !host.core?.snapshot.value && !centerGiven;
    if (this.open && disabled) queueMicrotask(() => this.close());
  }

  /** Closes as Cancel and removes the dialog (teardown, presentation switch). */
  destroy(): void {
    this.close();
    this.#observer?.disconnect();
    this.dialog.remove();
  }

  #finish(cancel: boolean): void {
    const host = this.#host;
    this.open = false;
    if (cancel) host.revert();
    if (this.dialog.open) this.dialog.close();
    host.setState('open', false);
    // The dialog gives focus back to where it was; when that was nowhere (a programmatic open), it goes to the field.
    const doc = host.el.ownerDocument;
    const lost = !doc.activeElement || doc.activeElement == doc.body;
    if (host.el.isConnected && (lost || this.dialog.contains(host.root.activeElement)))
      host.field?.button.focus();
    this.#toggle('open', 'closed');
    queueMicrotask(() => host.present());
  }

  /** Core events: drafts are staged while open; while closed only method commits pass (late gesture ends revert). */
  #relay(event: Event): void {
    const host = this.#host;
    const { type } = event;
    const detail: unknown = Reflect.get(event, 'detail');
    if (type == 'input' || type == 'change') {
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the core's input/change detail
      const location = detail as LocationDetail;
      if (this.open) {
        this.#staged = location;
        this.refresh();
        return;
      }
      if (location.source != 'api' && !(location.source == 'geolocation' && host.locating)) {
        queueMicrotask(() => host.revert());
        return;
      }
      if (type == 'input') {
        if (host.core) host.mirror(host.core.snapshot);
        host.inputs?.write(location.value, location.address, 'commit');
      }
    } else if (type == 'addresschange') {
      // A draft's address travels with Confirm.
      if (this.open) return;
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the core's addresschange detail
      host.inputs?.write(undefined, (detail as AddressDetail).address, 'commit');
    }
    const forwarded = new CustomEvent(type, {
      detail,
      bubbles: event.bubbles,
      composed: event.composed,
      cancelable: event.cancelable,
    });
    host.el.dispatchEvent(forwarded);
    if (forwarded.defaultPrevented) event.preventDefault();
  }

  #emit(type: string, detail: unknown, composed: boolean): void {
    this.#host.el.dispatchEvent(new CustomEvent(type, { detail, bubbles: true, composed }));
  }

  #toggle(oldState: string, newState: string): void {
    const init = { oldState, newState };
    this.#host.el.dispatchEvent(
      typeof ToggleEvent == 'function'
        ? new ToggleEvent('toggle', init)
        : Object.assign(new Event('toggle'), init),
    );
  }
}
