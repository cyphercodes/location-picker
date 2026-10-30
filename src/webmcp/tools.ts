// WebMCP tools (CONTRACT §2, WP4-16): `<prefix>_get_location`, `_set_location` and `_search_places`, registered with
// `document.modelContext.registerTool(tool, { signal })` (Chrome origin trial; the older `navigator.modelContext` is
// also detected). The picker is driven only through its public API, so this module carries no core code: it stays a
// small lazy chunk, and `set_location` commits exactly like `setLocation()` (source "api"). There is never a locate
// tool: an agent must not trigger a permission prompt.
import type { GeocodeResult, LocationPicker } from '../core.js';
import type { LocationPickerElement } from '../element/location-picker-element.js';
import type { WebMcpOptions, WebMcpRegistration, WebMcpToolName } from '../webmcp.js';

type Target = LocationPicker | LocationPickerElement;
/** What the tools use; both targets have it (a union of overloaded methods is not callable as such). */
type Picker = Pick<
  LocationPicker,
  'value' | 'valueAsLatLng' | 'address' | 'setLocation' | 'geocode'
>;
type Input = Record<string, unknown>;

interface Tool {
  readonly name: string;
  readonly description: string;
  readonly inputSchema: object;
  readonly annotations: { readonly readOnlyHint: boolean; readonly untrustedContentHint?: boolean };
  execute(input: unknown): Promise<unknown>;
}
interface ModelContext {
  registerTool(tool: Tool, options: { signal: AbortSignal }): unknown;
  unregisterTool?(name: string): unknown;
}

const OBJECT = 'object';
const ALL: readonly WebMcpToolName[] = ['get_location', 'set_location', 'search_places'];
/** Prefixes registered by this copy of the library (several pickers on one page get distinct ones). */
const active = new Set<string>();

function modelContext(): ModelContext | undefined {
  for (const owner of [globalThis.document, globalThis.navigator]) {
    const context: unknown = owner && Reflect.get(owner, 'modelContext');
    if (
      typeof context == OBJECT &&
      typeof Reflect.get(Object(context), 'registerTool') == 'function'
    )
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- feature-detected just above
      return context as ModelContext;
  }
  return undefined;
}

/** True when `document.modelContext.registerTool` (or the older `navigator.modelContext`) exists. */
export function isWebMcpSupported(): boolean {
  return !!modelContext();
}

const hostOf = (target: Target): HTMLElement => ('element' in target ? target.element : target);
const slug = (text: string | null): string =>
  (text ?? '')
    .toLowerCase()
    .replace(/[^a-z\d]+/g, '_')
    .replace(/^_|_$/g, '');

/** "location_picker"; with several pickers on the page, "_<id or name>" (or a counter) keeps the names unique. */
function prefixOf(target: Target): string {
  const host = hostOf(target);
  const base = 'location_picker';
  const tag = host.localName.includes('-') ? `${host.localName},` : '';
  const several =
    active.size > 0 ||
    host.ownerDocument.querySelectorAll(`${tag}location-picker,.location-picker`).length > 1;
  const suffix = several ? slug(host.id || host.getAttribute('name')) : '';
  let prefix = suffix ? `${base}_${suffix}` : base;
  for (let n = 2; active.has(prefix); n++) prefix = `${base}_${suffix ? `${suffix}_` : ''}${n}`;
  return prefix;
}

/** `search_places` needs a geocoder: a custom one, a built-in provider's pair, or an adapter that carries one. */
function hasGeocoder(target: Target): boolean {
  // The class does not expose its options; geocode() reports GEOCODER_MISSING when there is none.
  if ('element' in target) return true;
  const { geocoder, provider } = target;
  return geocoder !== false && (!!geocoder || typeof provider == 'string' || !!provider.geocoder);
}

function location(target: Picker): object {
  const at = target.valueAsLatLng;
  return at
    ? { value: target.value, lat: at.lat, lng: at.lng, address: target.address }
    : { value: '' };
}

const inRange = (value: unknown, limit: number): value is number =>
  typeof value == 'number' && Math.abs(value) <= limit;
/** Text meant as coordinates (numbers, DMS, a geo: URI or a map URL): its parse error is the answer, not a search. */
const COORDINATES = /^(?=.*\d)[\d\s.,;:°º'"′″+\-NSEW]+$|^(?:geo:|https?:\/\/)/i;

async function setLocation(target: Picker, { lat, lng, text }: Input): Promise<object> {
  if (typeof text == 'string' && text.trim()) {
    try {
      target.setLocation(text);
    } catch (error) {
      if (COORDINATES.test(text.trim())) throw error;
      const [place] = await target.geocode(text, { limit: 1 });
      if (!place) throw new Error(`No place found for "${text}".`, { cause: error });
      target.setLocation({ lat: place.lat, lng: place.lng });
    }
  } else if (inRange(lat, 90) && inRange(lng, 180)) {
    target.setLocation(lat, lng);
  } else {
    throw new Error(
      'Pass { lat, lng } in decimal degrees (latitude -90 to 90, longitude -180 to 180), or { text }.',
    );
  }
  return location(target);
}

async function searchPlaces(target: Picker, { query }: Input): Promise<object> {
  if (typeof query != 'string' || !query.trim()) throw new Error('Pass { query } as text.');
  const results = await target.geocode(query, { limit: 5 });
  return results
    .slice(0, 5)
    .map(({ lat, lng, label, address }: GeocodeResult) => ({ lat, lng, label, address }));
}

const DESCRIPTIONS: Readonly<Record<WebMcpToolName, string>> = {
  get_location:
    'Get the location chosen in the map location picker: { value: "lat,lng", lat, lng, address } (address may be null), or { value: "" } while nothing is chosen.',
  set_location:
    'Set the location in the map location picker, latitude first. Pass { lat, lng } in decimal degrees, or { text } with coordinates ("48.8584, 2.2945", degrees-minutes-seconds, a geo: URI or a map URL) or a place or address to look up. Returns the new location.',
  search_places:
    'Search places by name or address near the map view. Returns up to 5 results ({ lat, lng, label }); nothing is chosen until you pass one to set_location.',
};
const SCHEMAS: Readonly<Record<WebMcpToolName, object>> = {
  get_location: { type: OBJECT, properties: {} },
  set_location: {
    type: OBJECT,
    properties: {
      lat: {
        type: 'number',
        minimum: -90,
        maximum: 90,
        description: 'Latitude in decimal degrees.',
      },
      lng: {
        type: 'number',
        minimum: -180,
        maximum: 180,
        description: 'Longitude in decimal degrees.',
      },
      text: {
        type: 'string',
        description: 'Coordinates, a map URL, or a place or address to look up.',
      },
    },
  },
  search_places: {
    type: OBJECT,
    properties: { query: { type: 'string', description: 'Place name or address.' } },
    required: ['query'],
  },
};
const RUN: Readonly<Record<WebMcpToolName, (target: Picker, input: Input) => Promise<object>>> = {
  get_location: async (target) => location(target),
  set_location: setLocation,
  search_places: searchPlaces,
};

const noop = (): void => {};
const notRegistered = (name: string, error: unknown): void =>
  console.warn(`[location-picker] WebMCP tool ${name} was not registered:`, error);

/** Chrome before 155 passes the arguments as a JSON string. */
const inputOf = (input: unknown): Input => {
  const value: unknown = typeof input == 'string' ? JSON.parse(input) : input;
  return { ...Object(value) };
};

/**
 * Registers tools via `document.modelContext.registerTool`:
 * - `<prefix>_get_location` (readOnlyHint): `{ value, lat, lng, address }` or `{ value: "" }`.
 * - `<prefix>_set_location`: input `{ lat, lng }` or `{ text }` (text -> parseLatLng, else the paired geocoder's first result); commits with source "api".
 * - `<prefix>_search_places` (readOnlyHint): `{ query }` -> up to 5 results, not committed.
 * Never throws; returns `{ supported: false }` when WebMCP is unavailable.
 * @example const { supported } = registerWebMcpTools(document.querySelector('location-picker')!, { purpose: 'Where the sensor is installed.' });
 */
export function registerWebMcpTools(
  target: LocationPicker | LocationPickerElement,
  options: WebMcpOptions = {},
): WebMcpRegistration {
  const context = modelContext();
  const { signal, purpose } = options;
  const none: WebMcpRegistration = { supported: !!context, tools: [], unregister() {} };
  if (!context || signal?.aborted) return none;
  const prefix = options.prefix || prefixOf(target);
  const controller = new AbortController();
  const registered: [name: string, handle: unknown][] = [];
  for (const tool of ALL) {
    if (!(options.tools ?? ALL).includes(tool)) continue;
    if (tool == 'search_places' && !hasGeocoder(target)) continue;
    const name = `${prefix}_${tool}`;
    try {
      const handle: unknown = context.registerTool(
        {
          name,
          description: purpose ? `${DESCRIPTIONS[tool]} ${purpose}` : DESCRIPTIONS[tool],
          inputSchema: SCHEMAS[tool],
          annotations: { readOnlyHint: tool != 'set_location', untrustedContentHint: true },
          execute: async (input) => RUN[tool](target, inputOf(input)),
        },
        { signal: controller.signal },
      );
      // registerTool returns a promise that rejects, e.g. for a duplicate name: say so, never leave it unhandled.
      Promise.resolve(handle).catch((error: unknown) => notRegistered(name, error));
      registered.push([name, handle]);
    } catch (error) {
      notRegistered(name, error);
    }
  }
  if (!registered.length) return none;
  active.add(prefix);
  const unregister = (): void => {
    if (controller.signal.aborted) return;
    controller.abort();
    active.delete(prefix);
    signal?.removeEventListener('abort', unregister);
    // Older surfaces: a handle with unregister(), or modelContext.unregisterTool(name).
    for (const [name, handle] of registered) {
      try {
        const own: unknown = typeof handle == OBJECT && Reflect.get(Object(handle), 'unregister');
        if (typeof own == 'function') Reflect.apply(own, handle, []);
        else Promise.resolve(context.unregisterTool?.(name)).catch(noop);
      } catch {
        // already gone
      }
    }
  };
  signal?.addEventListener('abort', unregister, { once: true });
  return { supported: true, tools: registered.map(([name]) => name), unregister };
}
