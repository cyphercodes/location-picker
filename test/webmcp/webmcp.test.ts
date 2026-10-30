// WP4-16: WebMCP tools against a mock `document.modelContext` (unit project). The mock follows Chrome's imperative
// API: `registerTool(tool, { signal })` returns a promise, rejects a duplicate name, and aborting the signal removes
// the tool.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { GeocodeResult, Geocoder } from '../../src/core.js';
import {
  isWebMcpSupported,
  registerWebMcpTools,
  type WebMcpRegistration,
} from '../../src/webmcp.js';
import { erased } from '../../src/core/providers.js';
import { createFakeAdapter } from '../fixtures/fake-adapter.js';
import { flush, picker, render, resetStore, spyConsole, summary } from '../element/helpers.js';

interface MockTool {
  readonly name: string;
  readonly description: string;
  readonly inputSchema: { readonly properties: Record<string, Record<string, unknown>> };
  readonly annotations: { readonly readOnlyHint: boolean };
  execute(input: unknown): Promise<unknown>;
}

function installModelContext(owner: Document | Navigator = document) {
  const tools = new Map<string, MockTool>();
  const registerTool = vi.fn<(tool: MockTool, options?: { signal?: AbortSignal }) => Promise<void>>(
    (spec, options) => {
      if (tools.has(spec.name)) return Promise.reject(new Error(`duplicate tool ${spec.name}`));
      tools.set(spec.name, spec);
      options?.signal?.addEventListener('abort', () => tools.delete(spec.name));
      return Promise.resolve();
    },
  );
  Object.defineProperty(owner, 'modelContext', { value: { registerTool }, configurable: true });
  return { tools, registerTool };
}

const EIFFEL: GeocodeResult = {
  lat: 48.8584,
  lng: 2.2945,
  label: 'Eiffel Tower',
  address: 'Paris',
};
const geocoder: Geocoder = {
  search: async (query) =>
    query == 'nowhere'
      ? []
      : Array.from({ length: 7 }, (_, i) => ({ ...EIFFEL, lat: EIFFEL.lat + i / 100 })),
};

const registrations: WebMcpRegistration[] = [];
function register(...args: Parameters<typeof registerWebMcpTools>): WebMcpRegistration {
  const registration = registerWebMcpTools(...args);
  registrations.push(registration);
  return registration;
}
function tool(tools: Map<string, MockTool>, name: string): MockTool {
  const found = tools.get(name);
  if (!found)
    throw new Error(`tool ${name} is not registered (have ${[...tools.keys()].join(', ')})`);
  return found;
}
/** Waits until the lazily imported entry registered the element's tools. */
async function settled(): Promise<void> {
  // oxlint-disable-next-line no-await-in-loop -- one macrotask after another, on purpose
  for (let i = 0; i < 20; i++) await flush();
}

let console$: ReturnType<typeof spyConsole>;
beforeEach(() => {
  resetStore();
  console$ = spyConsole();
});
afterEach(() => {
  for (const registration of registrations.splice(0)) registration.unregister();
  document.body.innerHTML = '';
  Reflect.deleteProperty(document, 'modelContext');
  Reflect.deleteProperty(navigator, 'modelContext');
  vi.restoreAllMocks();
});

describe('WP4-16 WebMCP', () => {
  it('without modelContext: { supported: false, tools: [] } and no throw', () => {
    const { el } = render('<location-picker></location-picker>');
    expect(isWebMcpSupported()).toBe(false);
    const registration = register(el);
    expect(registration).toMatchObject({ supported: false, tools: [] });
    expect(() => registration.unregister()).not.toThrow();
  });

  it('registers get_location and set_location, search_places only with a geocoder, never a locate tool', async () => {
    const { tools } = installModelContext();
    const { el } = render('<location-picker></location-picker>');
    await flush();
    expect(isWebMcpSupported()).toBe(true);
    const plain = register(el);
    expect(plain).toMatchObject({
      supported: true,
      tools: ['location_picker_get_location', 'location_picker_set_location'],
    });
    plain.unregister();
    expect(tools.size).toBe(0);

    el.provider = erased(createFakeAdapter({ geocoder }).adapter);
    const full = register(el);
    expect(full.tools).toEqual([
      'location_picker_get_location',
      'location_picker_set_location',
      'location_picker_search_places',
    ]);
    expect([...tools.keys()]).toEqual(full.tools);
    expect([...tools.keys()].some((name) => name.includes('locate'))).toBe(false);
    expect(tool(tools, 'location_picker_get_location').annotations.readOnlyHint).toBe(true);
    expect(tool(tools, 'location_picker_search_places').annotations.readOnlyHint).toBe(true);
    expect(tool(tools, 'location_picker_set_location').annotations.readOnlyHint).toBe(false);
    // `tools` limits the set; geocoder: false removes search_places.
    expect(register(el, { tools: ['get_location'], prefix: 'only' }).tools).toEqual([
      'only_get_location',
    ]);
    el.geocoder = false;
    expect(register(el, { prefix: 'nogeo' }).tools).not.toContain('nogeo_search_places');
  });

  it('two pickers get unique prefixes: the id, then the name, then a counter', async () => {
    installModelContext();
    document.body.innerHTML = `
      <location-picker id="pickup"></location-picker>
      <location-picker name="drop-off"></location-picker>
      <location-picker></location-picker>
      <location-picker></location-picker>`;
    const pickers = [...document.querySelectorAll('location-picker')];
    for (const el of pickers) el.provider = erased(createFakeAdapter().adapter);
    await flush();
    const prefixes = pickers.map((el) => register(el).tools[0]);
    expect(prefixes).toEqual([
      'location_picker_pickup_get_location',
      'location_picker_drop_off_get_location',
      'location_picker_get_location',
      'location_picker_2_get_location',
    ]);
    expect(new Set(prefixes).size).toBe(4);
  });

  it('a single picker on the page keeps the plain prefix; a later one gets its own', async () => {
    installModelContext();
    const { el } = render('<location-picker id="first"></location-picker>');
    await flush();
    expect(register(el).tools[0]).toBe('location_picker_get_location');
    const second = document.createElement('location-picker');
    second.id = 'second';
    second.provider = erased(createFakeAdapter().adapter);
    document.body.append(second);
    expect(register(second).tools[0]).toBe('location_picker_second_get_location');
  });

  it('set_location {text: "48.85, 2.29"} commits with source api and returns the location', async () => {
    const { tools } = installModelContext();
    const { el, log } = render('<location-picker></location-picker>');
    await flush();
    register(el);
    const result = await tool(tools, 'location_picker_set_location').execute({
      text: '48.85, 2.29',
    });
    expect(result).toEqual({ value: '48.85,2.29', lat: 48.85, lng: 2.29, address: null });
    expect(summary(log)).toEqual(['ready', 'input:48.85,2.29:api', 'change:48.85,2.29:api']);
  });

  it('set_location {lat, lng} commits; get_location reads the value', async () => {
    const { tools } = installModelContext();
    const { el, log } = render('<location-picker></location-picker>');
    await flush();
    register(el);
    const get = tool(tools, 'location_picker_get_location');
    expect(await get.execute({})).toEqual({ value: '' });
    await tool(tools, 'location_picker_set_location').execute({ lat: 48.8584, lng: 2.2945 });
    expect(summary(log)).toEqual([
      'ready',
      'input:48.8584,2.2945:api',
      'change:48.8584,2.2945:api',
    ]);
    expect(await get.execute({})).toEqual({
      value: '48.8584,2.2945',
      lat: 48.8584,
      lng: 2.2945,
      address: null,
    });
    // Chrome before 155 passes the arguments as a JSON string.
    await tool(tools, 'location_picker_set_location').execute('{"lat":1,"lng":2}');
    expect(el.value).toBe('1,2');
  });

  it('invalid input is a tool error and changes nothing', async () => {
    const { tools } = installModelContext();
    const { el, log } = render('<location-picker value="1,2"></location-picker>');
    await flush();
    register(el);
    const set = tool(tools, 'location_picker_set_location');
    // The schema bounds (D19): out-of-range numbers are never clamped into a commit.
    await expect(set.execute({ lat: 95, lng: 10 })).rejects.toThrow(/latitude -90 to 90/);
    await expect(set.execute({ lat: 10, lng: 200 })).rejects.toThrow(/longitude/);
    await expect(set.execute({ lat: '48', lng: '2' })).rejects.toThrow(/decimal degrees/);
    await expect(set.execute({})).rejects.toThrow(/\{ lat, lng \}/);
    // Coordinate text that does not parse reports the parser's hint instead of searching.
    await expect(set.execute({ text: '95, 10' })).rejects.toThrow(/did you swap lat and lng/);
    // A place name with no geocoder.
    await expect(set.execute({ text: 'Eiffel Tower' })).rejects.toMatchObject({
      code: 'GEOCODER_MISSING',
    });
    expect(summary(log)).toEqual(['ready']);
    expect(el.value).toBe('1,2');
    const schema = set.inputSchema.properties;
    expect(schema.lat).toMatchObject({ type: 'number', minimum: -90, maximum: 90 });
    expect(schema.lng).toMatchObject({ type: 'number', minimum: -180, maximum: 180 });
  });

  it('set_location {text: place} commits the geocoder’s first result; search_places returns 5, uncommitted', async () => {
    const { tools } = installModelContext();
    const { el, log } = render('<location-picker></location-picker>', { geocoder });
    await flush();
    register(el);
    const found = await tool(tools, 'location_picker_search_places').execute({
      query: 'Eiffel Tower',
    });
    expect(found).toHaveLength(5);
    expect(found).toContainEqual({
      lat: 48.8584,
      lng: 2.2945,
      label: 'Eiffel Tower',
      address: 'Paris',
    });
    expect(summary(log)).toEqual(['ready']);
    await tool(tools, 'location_picker_set_location').execute({ text: 'Eiffel Tower' });
    expect(summary(log)).toEqual([
      'ready',
      'input:48.8584,2.2945:api',
      'change:48.8584,2.2945:api',
    ]);
    await expect(
      tool(tools, 'location_picker_set_location').execute({ text: 'nowhere' }),
    ).rejects.toThrow(/No place found/);
    await expect(tool(tools, 'location_picker_search_places').execute({})).rejects.toThrow(/query/);
  });

  it('purpose is appended to every description', async () => {
    const { tools } = installModelContext();
    const { el } = render('<location-picker></location-picker>', { geocoder });
    await flush();
    register(el, { purpose: 'Delivery drop-off point for this order.' });
    expect(tools.size).toBe(3);
    for (const { description } of tools.values())
      expect(description).toMatch(/\. Delivery drop-off point for this order\.$/);
  });

  it('unregister() and aborting the signal remove the tools; both are idempotent', async () => {
    const { tools } = installModelContext();
    const { el } = render('<location-picker></location-picker>');
    await flush();
    const registration = register(el);
    expect(tools.size).toBe(2);
    registration.unregister();
    registration.unregister();
    expect(tools.size).toBe(0);

    const controller = new AbortController();
    register(el, { signal: controller.signal });
    expect(tools.size).toBe(2);
    controller.abort();
    expect(tools.size).toBe(0);
    // The prefix is free again.
    expect(register(el).tools[0]).toBe('location_picker_get_location');
    // An already-aborted signal registers nothing.
    expect(register(el, { signal: AbortSignal.abort() })).toMatchObject({
      supported: true,
      tools: [],
    });
  });

  it('a rejected registration (duplicate name) is logged, never unhandled', async () => {
    installModelContext();
    const { el } = render('<location-picker></location-picker>');
    await flush();
    register(el, { prefix: 'same' });
    register(el, { prefix: 'same' });
    await flush();
    expect(console$.warn.mock.calls.map(([text]) => String(text))).toContain(
      '[location-picker] WebMCP tool same_get_location was not registered:',
    );
  });

  it('the older navigator.modelContext with handle.unregister() is supported', async () => {
    const unregistered: string[] = [];
    const registerTool = vi.fn<(spec: MockTool) => { unregister(): void }>((spec) => ({
      unregister: () => unregistered.push(spec.name),
    }));
    Object.defineProperty(navigator, 'modelContext', {
      value: { registerTool },
      configurable: true,
    });
    const { el } = render('<location-picker></location-picker>');
    await flush();
    expect(isWebMcpSupported()).toBe(true);
    register(el).unregister();
    expect(registerTool).toHaveBeenCalledTimes(2);
    expect(unregistered).toEqual(['location_picker_get_location', 'location_picker_set_location']);
  });

  it('the webmcp attribute lazy-loads the entry and registers while connected', async () => {
    const { tools } = installModelContext();
    const { el } = render('<location-picker webmcp></location-picker>');
    expect(el.webmcp).toBe(true);
    await settled();
    expect([...tools.keys()]).toEqual([
      'location_picker_get_location',
      'location_picker_set_location',
    ]);
    el.webmcp = false;
    await settled();
    expect(tools.size).toBe(0);
    el.webmcp = true;
    await settled();
    expect(tools.size).toBe(2);
    // Removal tears down after a microtask, and that unregisters; a reconnect registers again.
    el.remove();
    await settled();
    expect(tools.size).toBe(0);
    document.body.append(el);
    await settled();
    expect(tools.size).toBe(2);
    expect(picker()).toBe(el);
    el.remove();
    await settled();
  });

  it('the webmcp attribute without modelContext stays silent', async () => {
    const { el, log } = render('<location-picker webmcp></location-picker>');
    await settled();
    expect(summary(log)).toEqual(['ready']);
    const logged = [...console$.warn.mock.calls, ...console$.error.mock.calls].join(' ');
    expect(logged).not.toMatch(/WebMCP|webmcp/);
    el.remove();
    await settled();
  });
});
