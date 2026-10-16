// Which URLs tests may reach. Pure (no Node or DOM imports): shared by the in-page guard and the route table.

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

/** True for the local servers (Vite, the e2e static server) and for non-network URLs (data:, blob:, about:). */
export function isLocalUrl(url: string | URL, base?: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url, base);
  } catch {
    return true; // not a fetchable URL
  }
  if (/^(https?|wss?):$/.test(parsed.protocol)) return LOCAL_HOSTS.has(parsed.hostname);
  return true;
}

/** External URLs the route table (test/fixtures/routes.ts) answers locally; everything else is blocked. */
export const ROUTED_URLS: {
  readonly leaflet: RegExp;
  readonly tiles: RegExp;
  readonly photon: RegExp;
  readonly google: RegExp;
  readonly library: RegExp;
} = {
  leaflet: /^https:\/\/cdn\.jsdelivr\.net\/npm\/leaflet@1\.9\.4\/dist\//,
  tiles: /^https:\/\/tile\.openstreetmap\.org\//,
  photon: /^https:\/\/photon\.komoot\.io\//,
  google: /^https:\/\/maps\.googleapis\.com\//,
  library: /^https:\/\/cdn\.jsdelivr\.net\/npm\/location-picker@3(\.[\d.]+[\w.-]*)?(\/|$)/,
};

export const ALLOWED_EXTERNAL_PATTERNS: readonly RegExp[] = Object.values(ROUTED_URLS);

export function isRoutedUrl(url: string): boolean {
  return ALLOWED_EXTERNAL_PATTERNS.some((pattern) => pattern.test(url));
}
