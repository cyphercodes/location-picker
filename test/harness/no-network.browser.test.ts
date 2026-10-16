import { describe, expect, it } from 'vitest';
import { commands } from 'vitest/browser';
import { takeNetworkViolations } from '../setup/no-network.js';

// WP5-08 canary (browser project, 3 engines): the in-page guard and the route table both fire.
describe('no-network guard (browser)', () => {
  it('blocks non-routed requests in the page and at the network layer', async () => {
    await expect(fetch('https://lp-canary.invalid/fetch')).rejects.toThrow('[no-network]');

    // An image request is invisible to fetch/XHR patches: the route table aborts it.
    const img = new Image();
    await new Promise((resolve) => {
      img.addEventListener('error', resolve);
      img.addEventListener('load', resolve);
      img.src = 'https://lp-canary.invalid/pixel.png';
    });

    expect(takeNetworkViolations()).toEqual(['fetch https://lp-canary.invalid/fetch']);
    expect(await commands.lpTakeBlockedRequests()).toEqual(['https://lp-canary.invalid/pixel.png']);
  });

  it('answers routed URLs from local files', async () => {
    const css = await fetch('https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.css');
    expect(css.status).toBe(200);
    expect(await css.text()).toContain('.leaflet-container');

    const tile = await fetch('https://tile.openstreetmap.org/2/1/1.png');
    expect(tile.headers.get('content-type')).toBe('image/png');
  });
});
