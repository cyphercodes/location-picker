import { describe, expect, it } from 'vitest';
import { isLatLng, normalizeLatLng } from '../../src/utils.js';

// WP2-03
describe('normalizeLatLng', () => {
  it.each([
    [
      { lat: 91, lng: 190 },
      { lat: 90, lng: -170 },
    ],
    [
      { lat: -95, lng: -190 },
      { lat: -90, lng: 170 },
    ],
    [
      { lat: 0, lng: 180 },
      { lat: 0, lng: -180 },
    ],
    [
      { lat: 0, lng: -180 },
      { lat: 0, lng: -180 },
    ],
    [
      { lat: 0, lng: 540 },
      { lat: 0, lng: -180 },
    ],
    [
      { lat: 0, lng: 360 },
      { lat: 0, lng: 0 },
    ],
    [
      { lat: -0, lng: -0 },
      { lat: 0, lng: 0 },
    ],
    [
      { latitude: 1, longitude: 2 },
      { lat: 1, lng: 2 },
    ],
    [
      { lat: 1, lon: 2 },
      { lat: 1, lng: 2 },
    ],
    [
      { lat: () => 95, lng: () => 10 },
      { lat: 90, lng: 10 },
    ],
    ['48.8584, 2.2945', { lat: 48.8584, lng: 2.2945 }],
  ])('%j -> %j', (input, expected) => {
    expect(normalizeLatLng(input)).toEqual(expected);
  });

  it('wraps far longitudes (the JSDoc example: 52283.36 is 145 turns plus 83.36)', () => {
    const r = normalizeLatLng({ lat: 10, lng: 52283.36 });
    expect(r.lat).toBe(10);
    expect(r.lng).toBeCloseTo(83.36, 9);
  });

  it('leaves in-range values bit-identical', () => {
    for (const lng of [2.294481, -179.99999999999997, 179.99999999999997, 0.1 + 0.2]) {
      expect(Object.is(normalizeLatLng({ lat: 0.1 + 0.2, lng }).lng, lng)).toBe(true);
    }
  });

  it('never returns lng === 180', () => {
    const near = [180, 180 - 1e-13, 180 + 1e-13, -180, -180 - 1e-13, 540, -540, 1e6 * 360 + 180];
    for (let k = -3; k <= 3; k++)
      for (const x of near) {
        const { lng } = normalizeLatLng({ lat: 0, lng: x + k * 360 });
        expect(lng).toBeGreaterThanOrEqual(-180);
        expect(lng).toBeLessThan(180);
      }
  });

  it.each([
    [{ lat: Number.NaN, lng: 0 }],
    [{ lat: 0, lng: Number.NaN }],
    [{ lat: Number.POSITIVE_INFINITY, lng: 0 }],
    [{ lat: 0, lng: Number.NEGATIVE_INFINITY }],
    ['abc'],
    [[1, 2]],
    [null],
  ])('throws TypeError on %j', (input) => {
    expect(() => Reflect.apply(normalizeLatLng, undefined, [input])).toThrow(TypeError);
  });
});

describe('isLatLng', () => {
  class Point {
    constructor(
      readonly lat: number,
      readonly lng: number,
    ) {}
  }

  it.each([
    [{ lat: 0, lng: 0 }],
    [{ lat: 90, lng: 180 }],
    [{ lat: -90, lng: -180 }],
    [{ lat: 48.8584, lng: 2.2945, extra: true }],
    [new Point(1, 2)],
  ])('accepts %j', (value) => {
    expect(isLatLng(value)).toBe(true);
  });

  it.each([
    [null],
    [undefined],
    ['48.8584,2.2945'],
    [[48.8584, 2.2945]],
    [{ lat: '1', lng: 2 }],
    [{ lat: 91, lng: 0 }],
    [{ lat: 0, lng: 180.5 }],
    [{ lat: Number.NaN, lng: 0 }],
    [{ lat: 0, lng: Number.POSITIVE_INFINITY }],
    [{ latitude: 1, longitude: 2 }],
    [{ lat: () => 1, lng: () => 2 }],
  ])('rejects %j', (value) => {
    expect(isLatLng(value)).toBe(false);
  });
});
