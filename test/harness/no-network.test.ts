import { describe, expect, it } from 'vitest';
import { takeNetworkViolations } from '../setup/no-network.js';

// WP5-08 canary (unit/jsdom): the guard blocks and records every way a test could reach the network.
describe('no-network guard (jsdom)', () => {
  it('blocks fetch, XHR and URL-loading elements, and records each one', async () => {
    await expect(fetch('https://lp-canary.invalid/fetch')).rejects.toThrow('[no-network]');
    // jsdom has no route table, so even URLs the browser project routes are blocked for fetch.
    await expect(fetch('https://photon.komoot.io/api?q=paris')).rejects.toThrow('[no-network]');

    const xhr = new XMLHttpRequest();
    expect(() => xhr.open('GET', 'https://lp-canary.invalid/xhr')).toThrow('[no-network]');

    const script = document.createElement('script');
    script.src = 'https://lp-canary.invalid/script.js';
    document.head.append(script);
    script.remove();

    expect(takeNetworkViolations()).toEqual([
      'fetch https://lp-canary.invalid/fetch',
      'fetch https://photon.komoot.io/api?q=paris',
      'XMLHttpRequest https://lp-canary.invalid/xhr',
      '<script> https://lp-canary.invalid/script.js',
    ]);
  });

  it('lets local URLs through', () => {
    const xhr = new XMLHttpRequest();
    expect(() => xhr.open('GET', '/local.json')).not.toThrow();
    expect(takeNetworkViolations()).toEqual([]);
  });
});
