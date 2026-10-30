// location-picker/webmcp (experimental, feature-detected): opt-in WebMCP tools that let a browser agent read and set
// the picked location without dragging the map. The `webmcp` attribute of <location-picker> lazy-loads this entry.
export type WebMcpToolName = 'get_location' | 'set_location' | 'search_places';

/** Options for {@link registerWebMcpTools}. */
export interface WebMcpOptions {
  /** Tool-name prefix. @default "location_picker", plus "_<id or name>" when the page has several pickers */
  prefix?: string;
  /** Sentence appended to every tool description (what the location is for). @default "" @example { purpose: 'Delivery drop-off point for this order.' } */
  purpose?: string;
  /** Tools to register. `search_places` is skipped when no geocoder is available. There is never a locate tool (agents must not trigger permission prompts). @default ['get_location', 'set_location', 'search_places'] */
  tools?: readonly WebMcpToolName[];
  /** Aborting unregisters the tools. */
  signal?: AbortSignal;
}

/** Result of {@link registerWebMcpTools}. */
export interface WebMcpRegistration {
  /** False when `document.modelContext` (or `navigator.modelContext`) is unavailable; then nothing was registered. */
  readonly supported: boolean;
  /** Full names of the registered tools. @example ['location_picker_get_location'] */
  readonly tools: readonly string[];
  /** Idempotent. */
  unregister(): void;
}

export { isWebMcpSupported, registerWebMcpTools } from './webmcp/tools.js';
