import { describe, expect, it } from 'vitest';
import { formatLatLng } from '../../src/utils.js';
import { roundTo } from '../../src/utils/format.js';

// WP2-02
describe('formatLatLng (decimal)', () => {
  it('produces the canonical value: latitude first, dot decimal, trailing zeros trimmed', () => {
    expect(formatLatLng({ lat: 48.85837009, lng: 2.29448128 })).toBe('48.85837,2.294481');
    expect(formatLatLng({ lat: 48.85837, lng: 2.294481 })).toBe('48.85837,2.294481');
    expect(formatLatLng({ lat: 48.85837, lng: 2 })).toBe('48.85837,2');
    expect(formatLatLng({ lat: 10, lng: -100 })).toBe('10,-100');
  });

  it('never writes -0', () => {
    expect(formatLatLng({ lat: -0, lng: -0 })).toBe('0,0');
    expect(formatLatLng({ lat: -0.0000001, lng: -0.0000004 })).toBe('0,0');
    expect(formatLatLng({ lat: -0.4, lng: 0 }, { precision: 0 })).toBe('0,0');
  });

  it('rounds before normalising: 179.9999996 becomes -180', () => {
    expect(formatLatLng({ lat: 0, lng: 179.9999996 })).toBe('0,-180');
    expect(formatLatLng({ lat: 0, lng: 179.96 }, { precision: 1 })).toBe('0,-180');
    expect(formatLatLng({ lat: 0, lng: 179.94 }, { precision: 1 })).toBe('0,179.9');
  });

  it.each([
    [0, '49,2'],
    [1, '48.9,2.3'],
    [2, '48.86,2.29'],
    [3, '48.858,2.295'],
    [4, '48.8584,2.2945'],
    [5, '48.8584,2.2945'],
    [6, '48.8584,2.2945'],
    [10, '48.8584,2.2945'],
  ])('precision %i', (precision, expected) => {
    expect(formatLatLng({ lat: 48.8584, lng: 2.2945 }, { precision })).toBe(expected);
  });

  it('uses up to 10 decimals and never an exponent', () => {
    expect(formatLatLng({ lat: 0.0000001, lng: 1e-10 }, { precision: 10 })).toBe(
      '0.0000001,0.0000000001',
    );
    expect(formatLatLng({ lat: 1.23456789012, lng: 0 }, { precision: 10 })).toBe('1.2345678901,0');
    expect(formatLatLng({ lat: 0.0000001, lng: 0 })).toBe('0,0');
  });

  it('clamps precision into 0–10', () => {
    expect(formatLatLng({ lat: 1.23456789012, lng: 0 }, { precision: 14 })).toBe('1.2345678901,0');
    expect(formatLatLng({ lat: 1.5, lng: 0 }, { precision: -3 })).toBe('2,0');
    expect(formatLatLng({ lat: 1.5, lng: 0 }, { precision: Number.NaN })).toBe('2,0');
  });

  it('keeps integer zeros at precision 0', () => {
    expect(formatLatLng({ lat: 10, lng: 100 }, { precision: 0 })).toBe('10,100');
  });

  it('accepts a separator and any LatLngInput', () => {
    expect(formatLatLng({ lat: 48.8584, lng: 2.2945 }, { separator: ', ' })).toBe(
      '48.8584, 2.2945',
    );
    expect(formatLatLng('48.8584, 2.2945')).toBe('48.8584,2.2945');
    expect(formatLatLng({ latitude: 1, longitude: 2 })).toBe('1,2');
    expect(formatLatLng({ lat: 0, lng: 190 })).toBe('0,-170');
  });
});

describe('formatLatLng (dms)', () => {
  it('matches the JSDoc example', () => {
    expect(formatLatLng({ lat: 48.8584, lng: 2.2945 }, { format: 'dms' })).toBe(
      `48°51'30.2"N 2°17'40.2"E`,
    );
  });

  it('writes S and W for negative values and N/E for zero', () => {
    expect(formatLatLng({ lat: -33.865, lng: -74.006111 }, { format: 'dms' })).toBe(
      `33°51'54.0"S 74°0'22.0"W`,
    );
    expect(formatLatLng({ lat: -0.00000001, lng: 0 }, { format: 'dms' })).toBe(
      `0°0'0.0"N 0°0'0.0"E`,
    );
  });

  it('carries rounded seconds into minutes and degrees', () => {
    expect(formatLatLng({ lat: 48.99999999, lng: 1.99999 }, { format: 'dms' })).toBe(
      `49°0'0.0"N 2°0'0.0"E`,
    );
    expect(formatLatLng({ lat: 0, lng: 179.99999999 }, { format: 'dms' })).toBe(
      `0°0'0.0"N 180°0'0.0"W`,
    );
  });

  it('uses precision for the seconds', () => {
    expect(formatLatLng({ lat: 48.8584, lng: 2.2945 }, { format: 'dms', precision: 0 })).toBe(
      `48°51'30"N 2°17'40"E`,
    );
    expect(formatLatLng({ lat: 48.8584, lng: 2.2945 }, { format: 'dms', precision: 3 })).toBe(
      `48°51'30.240"N 2°17'40.200"E`,
    );
  });
});

describe('formatLatLng rejects what parseLatLng rejects', () => {
  it.each([
    ['abc'],
    [''],
    [{ lat: 95, lng: 0 }],
    [{ lat: Number.NaN, lng: 0 }],
    [{ lat: 0, lng: Number.POSITIVE_INFINITY }],
    [[48.8, 2.3]],
    [null],
  ])('%j throws TypeError', (input) => {
    expect(() => Reflect.apply(formatLatLng, undefined, [input])).toThrow(TypeError);
  });
});

describe('roundTo (internal)', () => {
  it('is the rounding the canonical string uses, without -0', () => {
    expect(roundTo(48.85837009, 6)).toBe(48.85837);
    expect(Object.is(roundTo(-0.0000001, 6), 0)).toBe(true);
  });
});
