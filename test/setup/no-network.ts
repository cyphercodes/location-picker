// No-network guard (CONTRACT §13 "every test runs under the no-network guard"; WP5-08). Setup file for both vitest
// projects. A request to a non-local URL is blocked and recorded, and the test fails in afterEach even when the code
// under test swallowed the rejection. "Routed" URLs (test/fixtures/network-policy.ts) are allowed only where the route
// table answers them: in the browser project (see no-network.browser.ts), never in jsdom. Tests that need a response in
// jsdom stub `fetch` (vi.stubGlobal) instead. Script/link/img elements are checked too: jsdom never loads them, and in
// browsers the route table aborts what is not routed.
import { afterEach } from 'vitest';
import { isLocalUrl, isRoutedUrl } from '../fixtures/network-policy.js';

const inJsdom = navigator.userAgent.includes('jsdom');
const violations: string[] = [];

/** Returns and clears the requests blocked in this realm since the last call (the canary uses it). */
export function takeNetworkViolations(): string[] {
  flushElementChecks();
  return violations.splice(0);
}

function absolute(url: string): string {
  try {
    return new URL(url, location.href).href;
  } catch {
    return url;
  }
}

function allowed(url: string, routed: boolean): boolean {
  return isLocalUrl(url, location.href) || (routed && isRoutedUrl(absolute(url)));
}

function block(kind: string, url: string): TypeError {
  violations.push(`${kind} ${absolute(url)}`);
  return new TypeError(
    `[no-network] blocked ${kind} ${absolute(url)}: tests must not reach the network. ` +
      'Use the route table (test/fixtures/routes.ts) or stub the request.',
  );
}

// fetch, XHR, sendBeacon, WebSocket, EventSource: answered by the route table in browsers, by nothing in jsdom.
const programmatic = !inJsdom;
const realFetch = globalThis.fetch;
globalThis.fetch = function guardedFetch(input: RequestInfo | URL, init?: RequestInit) {
  const url = input instanceof Request ? input.url : String(input);
  if (!allowed(url, programmatic)) return Promise.reject(block('fetch', url));
  return realFetch.call(globalThis, input, init);
};

const xhrProto = XMLHttpRequest.prototype;
const realOpen: XMLHttpRequest['open'] = Reflect.get(xhrProto, 'open');
xhrProto.open = function open(this: XMLHttpRequest, ...args: unknown[]): void {
  const url = String(args[1]);
  if (!allowed(url, programmatic)) throw block('XMLHttpRequest', url);
  Reflect.apply(realOpen, this, args);
};

if (typeof navigator.sendBeacon === 'function') {
  const realBeacon = navigator.sendBeacon.bind(navigator);
  navigator.sendBeacon = (url, data) => {
    if (!allowed(String(url), programmatic)) throw block('sendBeacon', String(url));
    return realBeacon(url, data);
  };
}

for (const name of ['WebSocket', 'EventSource'] as const) {
  if (typeof globalThis[name] !== 'function') continue;
  const guarded = new Proxy(globalThis[name], {
    construct(target, args: unknown[], newTarget) {
      const url = String(args[0]);
      if (!allowed(url, programmatic)) throw block(name, url);
      return Reflect.construct(target, args, newTarget);
    },
  });
  Object.defineProperty(globalThis, name, { value: guarded, writable: true, configurable: true });
}

// Elements that load a URL as soon as they are connected or their URL attribute changes.
const URL_ATTRIBUTES: Record<string, string> = {
  SCRIPT: 'src',
  LINK: 'href',
  IMG: 'src',
  IFRAME: 'src',
  SOURCE: 'src',
  VIDEO: 'src',
  AUDIO: 'src',
  EMBED: 'src',
  OBJECT: 'data',
};

function checkElement(node: Node): void {
  if (!(node instanceof Element)) return;
  for (const el of [node, ...node.querySelectorAll(Object.keys(URL_ATTRIBUTES).join(','))]) {
    const attr = URL_ATTRIBUTES[el.tagName];
    const url = attr ? el.getAttribute(attr) : null;
    if (url && !allowed(url, true)) block(`<${el.tagName.toLowerCase()}>`, url);
  }
}

const observer = new MutationObserver(handleRecords);
observer.observe(document, {
  childList: true,
  subtree: true,
  attributes: true,
  attributeFilter: [...new Set(Object.values(URL_ATTRIBUTES))],
});

function handleRecords(records: MutationRecord[]): void {
  for (const record of records) {
    if (record.type === 'attributes') checkElement(record.target);
    else record.addedNodes.forEach(checkElement);
  }
}

function flushElementChecks(): void {
  handleRecords(observer.takeRecords());
}

afterEach(() => {
  const blocked = takeNetworkViolations();
  if (blocked.length) {
    throw new Error(
      `[no-network] this test tried to reach the network:\n  ${blocked.join('\n  ')}`,
    );
  }
});
