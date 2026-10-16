// navigator.geolocation that never hangs (D15): PositionOptions.timeout plus a watchdog at timeout + 30 s, because the
// spec's timeout excludes the time a permission prompt stays open. GeolocationPositionError is NOT an Error: its
// numeric code is mapped, and the object is kept as `cause`.
import type { LocateOptions, LocationPickerErrorCode } from '../core.js';
import { createError } from './errors.js';

const CODES: Readonly<Record<number, LocationPickerErrorCode>> = {
  1: 'GEOLOCATION_DENIED',
  2: 'GEOLOCATION_UNAVAILABLE',
  3: 'GEOLOCATION_TIMEOUT',
};
const WATCHDOG_MS = 30_000;
const MAX_DELAY = 2 ** 31 - 1;

/** True when a locate request can reach the API (the locate button is hidden otherwise). */
export function canGeolocate(): boolean {
  const secure: unknown = Reflect.get(globalThis, 'isSecureContext');
  return secure === true && typeof navigator != 'undefined' && 'geolocation' in navigator;
}

/** One position fix. Rejects GEOLOCATION_UNSUPPORTED | DENIED | UNAVAILABLE | TIMEOUT | ABORTED. */
export function geolocate(options: LocateOptions = {}): Promise<GeolocationPosition> {
  const { signal, ...position } = options;
  return new Promise((resolve, reject) => {
    if (!canGeolocate()) return reject(createError('GEOLOCATION_UNSUPPORTED'));
    if (signal?.aborted) return reject(createError('ABORTED', { cause: signal.reason }));
    const finish = (settle: () => void): void => {
      clearTimeout(watchdog);
      signal?.removeEventListener('abort', onAbort);
      settle();
    };
    const onAbort = (): void =>
      finish(() => reject(createError('ABORTED', { cause: signal?.reason })));
    const timeout = position.timeout ?? Infinity;
    const watchdog = Number.isFinite(timeout)
      ? setTimeout(
          () => finish(() => reject(createError('GEOLOCATION_TIMEOUT'))),
          Math.min(MAX_DELAY, Math.max(0, timeout) + WATCHDOG_MS),
        )
      : undefined;
    signal?.addEventListener('abort', onAbort);
    const fail = (cause: unknown, code?: number): void =>
      finish(() =>
        reject(createError((code && CODES[code]) || 'GEOLOCATION_UNAVAILABLE', { cause })),
      );
    try {
      navigator.geolocation.getCurrentPosition(
        (fix) => finish(() => resolve(fix)),
        (error) => fail(error, error.code),
        position,
      );
    } catch (cause) {
      fail(cause);
    }
  });
}
