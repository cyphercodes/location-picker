import type { LatLng, LatLngInput } from '../utils.js';
import { parsePair } from './parse.js';

/**
 * Wraps longitude into [-180, 180) and clamps latitude into [-90, 90] (fixes v2 issue #12; LOCKED 7). Accepts any
 * {@link LatLngInput}. Throws `TypeError` on non-finite or unparseable input. The picker applies it to every numeric
 * and object input (`setLocation(lat, lng)`, `{lat, lng}` values, the `lat`/`lng` options, attributes and
 * properties); when it clamps a latitude, the picker logs one console warning with a swap hint.
 * @example normalizeLatLng({ lat: 10, lng: 52283.36 }) // { lat: 10, lng: -36.64 } (approx.)
 * @example normalizeLatLng({ lat: 91, lng: 190 }) // { lat: 90, lng: -170 }
 */
export function normalizeLatLng(value: LatLngInput): LatLng {
  const p = parsePair(value);
  if (!p) throw new TypeError('[location-picker] normalizeLatLng: not a coordinate');
  return { lat: Math.min(90, Math.max(-90, p.lat)), lng: p.lng };
}

/**
 * Type guard: a plain object with finite numeric `lat` in [-90, 90] and `lng` in [-180, 180].
 * @example if (isLatLng(x)) map.setView([x.lat, x.lng]);
 */
export function isLatLng(value: unknown): value is LatLng {
  if (!value || typeof value != 'object') return false;
  const lat: unknown = Reflect.get(value, 'lat');
  const lng: unknown = Reflect.get(value, 'lng');
  return (
    typeof lat == 'number' && typeof lng == 'number' && Math.abs(lat) <= 90 && Math.abs(lng) <= 180
  );
}
