import type { FormatLatLngOptions, LatLngInput } from '../utils.js';
import { parseLatLng, wrapLng } from './parse.js';

/** Internal: THE rounding of the canonical value (`toFixed`), so detail numbers and value strings always agree. */
export const roundTo = (x: number, precision: number): number => +x.toFixed(precision) + 0;

const decimal = (x: number, p: number): string => {
  const s = roundTo(x, p).toFixed(p);
  return p ? s.replace(/\.?0+$/, '') : s;
};

/** D°M'S.s"H with the seconds rounded first, so 59.96" carries into the minutes. */
const dms = (x: number, p: number, hemispheres: string, isLng: boolean): string => {
  const s = roundTo(Math.abs(x) * 3600, p);
  // Rounding can reach 180°E, which normalises to 180°W.
  const west = (x < 0 && s > 0) || (isLng && s >= 648000);
  return `${Math.floor(s / 3600)}°${Math.floor((s % 3600) / 60)}'${(s % 60).toFixed(p)}"${hemispheres[+west]}`;
};

/**
 * Locale-independent formatter. The default output is the canonical form value: latitude first, dot decimal,
 * `toFixed(precision)` with trailing zeros trimmed, no exponent, never `-0`. Rounds BEFORE normalising, so
 * `179.9999996` formats as `-180`. Throws `TypeError` for input that {@link parseLatLng} would reject.
 * @example formatLatLng({ lat: 48.85837009, lng: 2.29448128 }) // "48.85837,2.294481"
 * @example formatLatLng({ lat: 48.8584, lng: 2.2945 }, { format: 'dms' }) // `48°51'30.2"N 2°17'40.2"E`
 */
export function formatLatLng(value: LatLngInput, options: FormatLatLngOptions = {}): string {
  const p = parseLatLng(value);
  if (!p) throw new TypeError('[location-picker] formatLatLng: not a coordinate');
  const isDms = options.format == 'dms';
  const n = Math.min(10, Math.max(0, Math.round(options.precision ?? (isDms ? 1 : 6)))) || 0;
  return isDms
    ? `${dms(p.lat, n, 'NS', false)} ${dms(p.lng, n, 'EW', true)}`
    : decimal(p.lat, n) + (options.separator ?? ',') + decimal(wrapLng(roundTo(p.lng, n)), n);
}
