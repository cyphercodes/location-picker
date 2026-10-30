// Shared helpers for the WP3 provider, geocoder and search tests (unit and browser projects).
import { vi } from 'vitest';
import type { LocationPickerOptions, ProviderAdapter } from '../../src/core.js';
import { resolveConfig } from '../../src/core/config.js';
import { PickerCore } from '../../src/core/picker-core.js';
import type { CoreHost } from '../../src/internal/contracts.js';
import { photonResponse } from '../fixtures/photon-mock.js';

export { flush, must, record, resetStore, sleep, spyConsole, texts } from '../core/helpers.js';

export interface PhotonStub {
  /** Every requested URL, in order. */
  readonly urls: URL[];
  /** The `signal` of every request, in order. */
  readonly signals: AbortSignal[];
}

/**
 * Replaces fetch with the Photon mock (any `/api` or `/reverse` path), answering after `delayMs`; `fail` turns matching
 * requests into network errors. Restore with vi.unstubAllGlobals().
 */
export function stubPhoton(delayMs = 0, fail?: (url: URL) => boolean): PhotonStub {
  const stub: PhotonStub = { urls: [], signals: [] };
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(input instanceof Request ? input.url : String(input));
      const signal = init?.signal ?? new AbortController().signal;
      stub.urls.push(url);
      stub.signals.push(signal);
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(resolve, delayMs);
        signal.addEventListener('abort', () => {
          clearTimeout(timer);
          reject(new DOMException('aborted', 'AbortError'));
        });
      });
      if (fail?.(url)) throw new TypeError('Failed to fetch');
      return photonResponse(url) ?? new Response('not found', { status: 404 });
    }),
  );
  return stub;
}

/** Polls `test` until it returns a truthy value (real timers). */
export async function waitFor<T>(
  test: () => T,
  timeoutMs = 4000,
  what = 'a condition',
): Promise<NonNullable<T>> {
  const start = performance.now();
  for (;;) {
    const value = test();
    if (value) return value as NonNullable<T>;
    if (performance.now() - start > timeoutMs) throw new Error(`timed out waiting for ${what}`);
    // oxlint-disable-next-line no-await-in-loop -- polling
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

export interface ShadowPicker {
  readonly element: HTMLElement;
  readonly root: ShadowRoot;
  readonly core: PickerCore;
}

/**
 * The element's rendering model (CONTRACT §3.1) without the element (WP4): a PickerCore whose render and style root
 * is an open ShadowRoot on `element`, events dispatched on `element`.
 */
export function shadowPicker(
  element: HTMLElement,
  options: LocationPickerOptions<unknown> & { provider: ProviderAdapter<unknown> },
): ShadowPicker {
  const root = element.shadowRoot ?? element.attachShadow({ mode: 'open', delegatesFocus: true });
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
    resolveConfig(options, { mode: 'element', host: element }).config,
  );
  core.mount();
  return { element, root, core };
}
