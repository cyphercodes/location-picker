// FACE glue for <location-picker> (CONTRACT §3.4): the submitted entries, the restore state, validity and the
// name-collision diagnostic. Every ElementInternals feature is optional here (jsdom has no setFormValue/setValidity,
// happy-dom no attachInternals), and nothing in this module ever throws.
import type { InputRef } from '../core.js';
import { resolveInputRef } from '../core/bind-inputs.js';
import { nameCollision, warnOnce } from '../core/diagnostics.js';

/** The element state a form submission and a history restore need. */
export interface FormState {
  /** Canonical "lat,lng" or "". */
  readonly value: string;
  readonly zoom: number;
  readonly address: string | null;
}

/** The `*-name` attributes, in FormData order. */
export interface FormNames {
  readonly name: string;
  readonly latName: string;
  readonly lngName: string;
  readonly addressName: string;
}

/** What `formStateRestoreCallback` hands back: `JSON.stringify({ v: value, z: zoom, a: address })`. */
export function parseFormState(state: unknown): FormState | null {
  try {
    const { v, z, a }: Record<string, unknown> = JSON.parse(String(state));
    if (typeof v != 'string') return null;
    return { value: v, zoom: Number(z), address: typeof a == 'string' ? a : null };
  } catch {
    return null;
  }
}

/**
 * `internals.setFormValue(entries, state)`. The library appends `name` itself: the UA ignores the host `name` when the
 * value is a FormData. Without any `*-name` there is nothing to submit (`setFormValue(null)`); validation still works.
 */
export function submitValue(
  internals: ElementInternals | undefined,
  names: FormNames,
  state: FormState,
): void {
  if (typeof internals?.setFormValue != 'function') return;
  const { value, zoom, address } = state;
  const [lat = '', lng = ''] = value ? value.split(',') : [];
  let entries: FormData | null = null;
  for (const [name, text] of [
    [names.name, value],
    [names.latName, lat],
    [names.lngName, lng],
    [names.addressName, address ?? ''],
  ] as const) {
    if (name) (entries ??= new FormData()).append(name, text);
  }
  try {
    internals.setFormValue(entries, JSON.stringify({ v: value, z: zoom, a: address }));
  } catch {
    // never throw from a setter or callback
  }
}

/**
 * `internals.setValidity()`: `valueMissing` (required and unset) and `customError` (setCustomValidity). The anchor
 * (the map region) is passed only while it is connected: a disconnected anchor throws NotFoundError.
 */
export function updateValidity(
  internals: ElementInternals | undefined,
  missing: string | false,
  custom: string,
  anchor: HTMLElement | undefined,
): void {
  if (typeof internals?.setValidity != 'function') return;
  try {
    internals.setValidity(
      { valueMissing: !!missing, customError: !!custom },
      custom || missing || '',
      anchor?.isConnected ? anchor : undefined,
    );
  } catch {
    // e.g. an empty custom `messages.valueMissing`: the UA refuses a flag without a message
  }
}

/** One console diagnostic when a `*-name` equals the `name` of a bound input in the same form (submitted twice). */
export function warnNameCollisions(
  root: Document | ShadowRoot,
  form: HTMLFormElement | null,
  names: readonly (readonly [attr: string, name: string])[],
  inputs: readonly (InputRef | undefined)[],
): void {
  for (const ref of inputs) {
    const input = resolveInputRef(root, ref);
    const clash =
      input && input.name && input.form == form && names.find(([, n]) => n == input.name);
    if (clash) warnOnce(`name-collision:${clash[1]}`, nameCollision(clash[0], clash[1]));
  }
}
