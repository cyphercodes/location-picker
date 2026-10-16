import type { ErrorSpec } from '../internal/contracts.js';

/**
 * Stable error codes. `level` (see {@link LocationPickerError.level}) decides how an unhandled `error` event is logged.
 * Default level per code (the `ERROR_TABLE`); the only per-case override is listed in the last column:
 * | level | codes | per-case override |
 * |---|---|---|
 * | `error` (console.error) | TARGET_NOT_FOUND, INVALID_OPTION, ENGINE_MISSING, ENGINE_LOAD_FAILED, API_KEY_MISSING, GOOGLE_AUTH_FAILED, GEOCODER_MISMATCH, GEOCODER_MISSING | INVALID_OPTION for "only one of `lat`/`lng` given" is `warn` |
 * | `warn` (console.warn) | INVALID_VALUE, ENGINE_CSS_MISSING, MAP_ID_REQUIRED, GEOCODER_FAILED, GEOLOCATION_UNSUPPORTED, GEOLOCATION_DENIED, GEOLOCATION_UNAVAILABLE, GEOLOCATION_TIMEOUT | – |
 * | `silent` (never logged) | ABORTED | – |
 * Unknown provider names are INVALID_OPTION at `error`. Console diagnostics (unknown keys, wrong-guess attributes,
 * name/bound-input collisions, a 0-height target, a clamped latitude) are separate `console.warn` lines, never events.
 */
export type LocationPickerErrorCode =
  | 'TARGET_NOT_FOUND'
  | 'INVALID_VALUE'
  | 'INVALID_OPTION'
  | 'ENGINE_MISSING'
  | 'ENGINE_LOAD_FAILED'
  | 'ENGINE_CSS_MISSING'
  | 'API_KEY_MISSING'
  | 'GOOGLE_AUTH_FAILED'
  | 'MAP_ID_REQUIRED'
  | 'GEOCODER_MISMATCH'
  | 'GEOCODER_MISSING'
  | 'GEOCODER_FAILED'
  | 'GEOLOCATION_UNSUPPORTED'
  | 'GEOLOCATION_DENIED'
  | 'GEOLOCATION_UNAVAILABLE'
  | 'GEOLOCATION_TIMEOUT'
  | 'ABORTED';

type Level = ErrorSpec['level'];

/**
 * Source of truth for messages, fixes and DEFAULT levels; docs/errors.md is generated from it (WP7). A message is
 * "what happened" with no final period; `{name}` placeholders are filled from `createError` vars, or with the bare
 * name when a caller passes none (`new LocationPickerError('INVALID_VALUE')` reads "value is not a coordinate").
 */
export const ERROR_TABLE: Readonly<Record<LocationPickerErrorCode, ErrorSpec>> = {
  TARGET_NOT_FOUND: {
    message: 'no element matches {target}',
    fix: 'Pass an element, an id ("map") or a selector ("#map") that exists when the picker is created.',
    level: 'error',
  },
  INVALID_VALUE: {
    message: '{value} is not a coordinate',
    fix: 'Pass "lat,lng" (latitude first), e.g. "48.8584,2.2945", or {lat, lng}.',
    level: 'warn',
  },
  INVALID_OPTION: {
    message: 'invalid option {option}',
    fix: 'Check the option name and value against the LocationPickerOptions docs.',
    level: 'error',
  },
  ENGINE_MISSING: {
    message: 'the map engine is not loaded',
    fix: 'Load Leaflet first, pass engine: L, or remove engine-url="none".',
    level: 'error',
  },
  ENGINE_LOAD_FAILED: {
    message: 'the map engine could not be loaded from {url}',
    fix: 'Check the network and the CSP script-src, or self-host the engine and set engine-url.',
    level: 'error',
  },
  ENGINE_CSS_MISSING: {
    message: 'the map engine CSS is missing',
    fix: 'Load leaflet.css on the page, set engine-css-url, or allow https://cdn.jsdelivr.net.',
    level: 'warn',
  },
  API_KEY_MISSING: {
    message: 'Google Maps needs an API key',
    fix: 'Add api-key="YOUR_KEY", or load the Google Maps JS API before the picker.',
    level: 'error',
  },
  GOOGLE_AUTH_FAILED: {
    message: 'Google Maps rejected the API key',
    fix: "Check the key's HTTP-referrer restrictions, billing, and that Maps JavaScript API is enabled.",
    level: 'error',
  },
  MAP_ID_REQUIRED: {
    message: 'marker="advanced" needs a Google map ID; showing the CSS pin',
    fix: 'Set map-id (mapId), or use marker="pin".',
    level: 'warn',
  },
  GEOCODER_MISMATCH: {
    message: 'this geocoder may not be shown on a {provider} map',
    fix: "Use the provider's paired geocoder; Google's terms forbid mixing Google and non-Google content.",
    level: 'error',
  },
  GEOCODER_MISSING: {
    message: 'no geocoder is available',
    fix: 'Remove geocoder: false, or pass a geocoder.',
    level: 'error',
  },
  GEOCODER_FAILED: {
    message: 'the geocoding request failed',
    fix: "Check the network and the service's rate limits; use your own geocoder in production.",
    level: 'warn',
  },
  GEOLOCATION_UNSUPPORTED: {
    message: 'geolocation is not available here',
    fix: 'Serve the page over HTTPS, and add allow="geolocation" to a containing iframe.',
    level: 'warn',
  },
  GEOLOCATION_DENIED: {
    message: 'location permission was denied',
    fix: "Allow location access in the browser's site settings, or pick the point on the map.",
    level: 'warn',
  },
  GEOLOCATION_UNAVAILABLE: {
    message: 'the position could not be determined',
    fix: 'Try again (Wi-Fi helps), or pick the point on the map.',
    level: 'warn',
  },
  GEOLOCATION_TIMEOUT: {
    message: 'finding the position took too long',
    fix: 'Try again, or raise geolocation.timeout.',
    level: 'warn',
  },
  ABORTED: {
    message: 'the operation was aborted',
    fix: 'Nothing to fix: the picker was destroyed or a newer request replaced this one.',
    level: 'silent',
  },
};

const fill = (text: string, vars: Readonly<Record<string, string>> = {}): string =>
  text.replace(/\{(\w+)\}/g, (_, name: string) => vars[name] ?? name);

/**
 * Every thrown error, every promise rejection and every `error` event detail.
 * `message` format: `"[location-picker] <what happened>. Fix: <fix>"`.
 * Geolocation codes come from the numeric `GeolocationPositionError.code` (which is NOT an `Error` instance; it is
 * kept as `cause`).
 * @example
 * try { await picker.locate(); } catch (e) {
 *   if (e instanceof LocationPickerError && e.code === 'GEOLOCATION_DENIED') showHelp(e.fix);
 * }
 */
export class LocationPickerError extends Error {
  override readonly name = 'LocationPickerError' as const;
  /** Stable, documented code. @example "GEOLOCATION_DENIED" */
  readonly code: LocationPickerErrorCode;
  /** One-line, machine-readable remedy for humans and agents. @example 'Add api-key="YOUR_KEY", or load the Google Maps JS API before the picker.' */
  readonly fix: string;
  /** How an unhandled `error` event with this error is logged. */
  readonly level: 'error' | 'warn' | 'silent';
  /** Underlying failure (GeolocationPositionError, script `error` Event, fetch error, AbortSignal reason). */
  declare readonly cause?: unknown;
  /**
   * @param code stable code
   * @param message human text; the built-in text for `code` when omitted
   * @param options `fix` (one-line remedy; built-in when omitted) and `cause`
   */
  constructor(
    code: LocationPickerErrorCode,
    message?: string,
    options?: { fix?: string; cause?: unknown },
  ) {
    const spec = ERROR_TABLE[code];
    const fix = options?.fix ?? fill(spec.fix);
    super(
      `[location-picker] ${message ?? fill(spec.message)}. Fix: ${fix}`,
      options && 'cause' in options ? { cause: options.cause } : undefined,
    );
    this.code = code;
    this.fix = fix;
    this.level = spec.level;
  }
}

/** Builds an error from the table: `vars` fill `{name}` placeholders; `level` overrides the default (e.g. lat-only). */
export function createError(
  code: LocationPickerErrorCode,
  details: {
    readonly message?: string;
    readonly fix?: string;
    readonly cause?: unknown;
    readonly vars?: Readonly<Record<string, string>>;
    readonly level?: Level;
  } = {},
): LocationPickerError {
  const spec = ERROR_TABLE[code];
  const error = new LocationPickerError(code, details.message ?? fill(spec.message, details.vars), {
    fix: details.fix ?? fill(spec.fix, details.vars),
    ...('cause' in details && { cause: details.cause }),
  });
  return details.level ? Object.assign(error, { level: details.level }) : error;
}

/**
 * Dispatches a cancelable, non-bubbling `error` event (detail = the error) on `target`, then logs
 * `console[level](error.message)` unless a listener called `preventDefault()`, an `onError` handled it, or the level
 * is `silent`. `async` dispatches in a microtask (construction-time errors, so listeners added right after still run).
 */
export function reportError(
  target: EventTarget,
  error: LocationPickerError,
  options: { readonly handled?: boolean; readonly async?: boolean } = {},
): void {
  const dispatch = (): void => {
    const event = new CustomEvent('error', { detail: error, cancelable: true });
    target.dispatchEvent(event);
    if (!event.defaultPrevented && !options.handled && error.level != 'silent') {
      console[error.level](error.message);
    }
  };
  if (options.async) queueMicrotask(dispatch);
  else dispatch();
}
