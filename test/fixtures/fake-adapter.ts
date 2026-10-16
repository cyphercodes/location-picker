// CONTRACT §12.6 fake adapter (WP2): an in-memory engine for core, element and provider-orchestration tests. Like
// Leaflet, setView/setZoom echo move/moveEnd synchronously; user gestures report interactionStart/End around them.
// Pans must cover at least one screen pixel (256 px tiles) at the current zoom: the core ignores sub-pixel drift, so at
// the unset default zoom 2 (about 0.35° per pixel) a 0.05° pan commits nothing.
import type { MapHandle, MountContext, ProviderAdapter } from '../../src/core.js';
import { createError } from '../../src/core/errors.js';
import { onFrame } from '../../src/core/picker-core.js';
import type * as C from '../../src/internal/contracts.js';
import type {
  FakeAdapterControl,
  FakeAdapterOptions,
  FakeMap,
} from '../../src/internal/contracts.js';
import type { LatLng } from '../../src/utils.js';

export type { FakeAdapterControl, FakeAdapterOptions, FakeMap };

/** Everything the adapter was asked to do, for assertions. */
export interface FakeCalls {
  readonly setView: { center: LatLng; zoom: number | undefined; options: { animate: boolean } }[];
  readonly setZoom: number[];
  readonly setInteractive: FakeMap['interactive'][];
  readonly updates: unknown[][];
  resize: number;
  destroy: number;
}

export interface FakeControl extends FakeAdapterControl {
  /** MountContext of the latest mount. */
  readonly ctx: MountContext | undefined;
  readonly calls: FakeCalls;
  /** One user gesture along `points`: interactionStart, one move() per animation frame, moveEnd, interactionEnd. */
  userPath(points: readonly LatLng[]): Promise<void>;
}

/** Resolves on the core's own frame source (rAF, or setTimeout 16 ms in jsdom). */
export const nextFrame = (): Promise<void> => new Promise((resolve) => onFrame(resolve));
const delay = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));
const lerp = (from: LatLng, to: LatLng, t: number): LatLng => ({
  lat: from.lat + (to.lat - from.lat) * t,
  lng: from.lng + (to.lng - from.lng) * t,
});

export function createFakeAdapter(options: FakeAdapterOptions = {}): FakeControl {
  const {
    sync = true,
    loadDelayMs = 0,
    failWith,
    drawsMarker = false,
    geocoder,
    name = 'fake',
  } = options;
  let handle: MapHandle<FakeMap> | undefined;
  let ctx: MountContext | undefined;
  let mountCount = 0;
  const calls: FakeCalls = {
    setView: [],
    setZoom: [],
    setInteractive: [],
    updates: [],
    resize: 0,
    destroy: 0,
  };
  const load = async (): Promise<void> => {
    await delay(loadDelayMs);
    if (failWith) throw createError(failWith);
  };

  const adapter: ProviderAdapter<FakeMap> = {
    name,
    ...(geocoder && { geocoder }),
    ...((!sync || loadDelayMs > 0 || failWith) && { load }),
    mount(context) {
      mountCount++;
      ctx = context;
      const { events } = context;
      const map: FakeMap = {
        center: { ...context.view.center },
        zoom: context.view.zoom,
        interactive: context.interactive,
        destroyed: false,
        container: context.container,
      };
      const mounted: MapHandle<FakeMap> & { update(...args: unknown[]): void } = {
        map,
        drawsMarker,
        getCenter: () => ({ ...map.center }),
        getZoom: () => map.zoom,
        setView(center, zoom, viewOptions) {
          calls.setView.push({ center: { ...center }, zoom, options: viewOptions });
          map.center = { ...center };
          if (zoom !== undefined) map.zoom = zoom;
          events.move(map.center);
          events.moveEnd(map.center, map.zoom);
        },
        setZoom(zoom) {
          calls.setZoom.push(zoom);
          map.zoom = zoom;
          events.move(map.center);
          events.moveEnd(map.center, zoom);
        },
        setInteractive(mode) {
          calls.setInteractive.push(mode);
          map.interactive = mode;
        },
        resize() {
          calls.resize++;
        },
        update(...args) {
          calls.updates.push(args);
        },
        destroy() {
          calls.destroy++;
          map.destroyed = true;
        },
      };
      handle = mounted;
      return mounted;
    },
  };

  const mounted = (): { handle: MapHandle<FakeMap>; events: MountContext['events'] } => {
    if (!handle || !ctx) throw new Error('fake adapter: not mounted yet');
    return { handle, events: ctx.events };
  };

  const userPath = async (points: readonly LatLng[]): Promise<void> => {
    const { handle: h, events } = mounted();
    events.interactionStart();
    for (const point of points) {
      // oxlint-disable-next-line no-await-in-loop -- one move per animation frame, in order
      await nextFrame();
      h.map.center = { ...point };
      events.move(h.map.center);
    }
    await nextFrame();
    events.moveEnd(h.map.center, h.map.zoom);
    events.interactionEnd();
  };

  return {
    adapter,
    calls,
    get handle() {
      return handle;
    },
    get ctx() {
      return ctx;
    },
    get mountCount() {
      return mountCount;
    },
    userPath,
    userPan(to, panOptions = {}) {
      const from = mounted().handle.map.center;
      const steps = panOptions.steps ?? 3;
      return userPath(Array.from({ length: steps }, (_, i) => lerp(from, to, (i + 1) / steps)));
    },
    async userZoom(delta) {
      const { handle: h, events } = mounted();
      events.interactionStart();
      await nextFrame();
      h.map.zoom += delta;
      events.move(h.map.center);
      events.moveEnd(h.map.center, h.map.zoom);
      events.interactionEnd();
    },
  };
}

createFakeAdapter satisfies typeof C.createFakeAdapter;
