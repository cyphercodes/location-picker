import { describe, expect, it } from 'vitest';
import { formatLatLng, parseLatLng } from '../../src/utils.js';
import { PARSE_CASES } from './parse.cases.js';

const label = (input: unknown): string =>
  typeof input == 'string' ? JSON.stringify(input) : (JSON.stringify(input) ?? String(input));

// WP2-01
describe('parseLatLng: the case table', () => {
  it('has at least 80 cases', () => {
    expect(PARSE_CASES.length).toBeGreaterThanOrEqual(80);
  });

  const exact = PARSE_CASES.filter((c) => !c.approx);
  const approx = PARSE_CASES.flatMap((c) =>
    c.approx && c.expected ? [{ ...c, expected: c.expected }] : [],
  );

  it.each(exact.map((c) => [label(c.input), c] as const))('%s', (_, c) => {
    expect(parseLatLng(c.input)).toEqual(c.expected);
  });

  it.each(approx.map((c) => [label(c.input), c] as const))('%s (approx.)', (_, c) => {
    const { expected } = c;
    expect(parseLatLng(c.input)).toEqual({
      ...expected,
      lat: expect.closeTo(expected.lat, 6),
      lng: expect.closeTo(expected.lng, 6),
    });
  });
});

describe('parseLatLng: JSDoc examples', () => {
  it('matches every @example', () => {
    expect(parseLatLng('48.8584, 2.2945')).toEqual({
      lat: 48.8584,
      lng: 2.2945,
      format: 'decimal',
    });
    expect(parseLatLng('https://www.google.com/maps/@48.8584,2.2945,17z')).toEqual({
      lat: 48.8584,
      lng: 2.2945,
      zoom: 17,
      format: 'google-maps-url',
    });
    const dms = parseLatLng(`48°51'30.2"N 2°17'40.2"E`);
    expect(dms?.format).toBe('dms');
    expect(dms?.lat).toBeCloseTo(48.858389, 6);
    expect(dms?.lng).toBeCloseTo(2.2945, 6);
    expect(parseLatLng('not a place')).toBeNull();
  });
});

describe('parseLatLng: never throws', () => {
  const hostile: unknown[] = [
    Symbol('x'),
    10n,
    () => '48,2',
    new Proxy(
      {},
      {
        get() {
          throw new Error('trap');
        },
      },
    ),
    {
      get lat(): number {
        throw new Error('getter');
      },
      lng: 2,
    },
    {
      lat(): number {
        throw new Error('method');
      },
      lng: () => 2,
    },
    'https://www.google.com/maps/search/%E0%A4%A',
    'geo:',
    'geo:?q=',
    'https://',
    `${'1,'.repeat(5000)}1`,
    `${'1 '.repeat(5000)}x`,
    `(${'('.repeat(3000)}48,2${')'.repeat(3000)})`,
    `https://www.google.com/maps/${'@1,'.repeat(1000)}`,
  ];

  it('returns null for hostile input (symbols, traps, throwing getters, bad escapes, huge strings)', () => {
    for (const input of hostile) expect(parseLatLng(input)).toBeNull();
  });

  it('survives 5000 random strings built from coordinate-ish characters', () => {
    const alphabet = `0123456789.,; -+−°º'′"″NSEWnsew()geo:/?#&=@!3d4dhtps.googlemap`;
    let seed = 42;
    const random = (): number => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed / 2147483648;
    };
    const outOfRange: string[] = [];
    for (let i = 0; i < 5000; i++) {
      let s = '';
      for (let n = Math.floor(random() * 40); n > 0; n--)
        s += alphabet[Math.floor(random() * alphabet.length)];
      const r = parseLatLng(s);
      if (r && (Math.abs(r.lat) > 90 || r.lng < -180 || r.lng >= 180)) outOfRange.push(s);
    }
    expect(outOfRange).toEqual([]);
  });
});

// §12.10: parseLatLng(detail.value) deep-equals { lat: detail.lat, lng: detail.lng }.
describe('parseLatLng round-trips the canonical value', () => {
  it('parses every formatLatLng output back to the rounded numbers', () => {
    for (let i = 0; i < 2000; i++) {
      const precision = i % 11;
      const value = formatLatLng(
        { lat: Math.random() * 180 - 90, lng: Math.random() * 360 - 180 },
        { precision },
      );
      const [lat, lng] = value.split(',').map(Number);
      expect(parseLatLng(value)).toEqual({ lat, lng, format: 'decimal' });
    }
  });
});
