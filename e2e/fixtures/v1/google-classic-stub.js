// Minimal classic-mode Google Maps stub for the frozen v1 tests (WP1). As on a page that loads
// https://maps.googleapis.com/maps/api/js with a plain <script>, `google.maps` exists synchronously once this script has
// run. It covers only what the v1 file and its pages use; WP3's full mock (CONTRACT §12.6, mode 'classic') may replace
// it. Plain classic script: the e2e pages load it by URL and the jsdom tests evaluate its text.
// Test control object: globalThis.lpGoogleStub.
(() => {
  /** Event listeners per instance. A WeakMap also makes addListener(undefined, …) throw, as a missing `lp.map` would. */
  const listeners = new WeakMap();
  /** Map -> { div, center, zoom, idleTimer } */
  const state = new WeakMap();
  const stats = { mapInstances: [], mapOptions: [], setCenterCalls: [], setZoomCalls: [] };

  /** Keeps the raw numbers: Google's map.getCenter() is not wrapped after a pan across the antimeridian (#12). */
  class LatLng {
    #lat;
    #lng;
    constructor(lat, lng) {
      this.#lat = Number(lat);
      this.#lng = Number(lng);
    }
    lat() {
      return this.#lat;
    }
    lng() {
      return this.#lng;
    }
    toJSON() {
      return { lat: this.#lat, lng: this.#lng };
    }
  }

  const toLatLng = (value) => (value instanceof LatLng ? value : new LatLng(value.lat, value.lng));

  const event = {
    addListener(instance, name, handler) {
      const list = listeners.get(instance) ?? [];
      listeners.set(instance, list);
      const entry = { name, handler };
      list.push(entry);
      return {
        remove() {
          const index = list.indexOf(entry);
          if (index >= 0) list.splice(index, 1);
        },
      };
    },
    addListenerOnce(instance, name, handler) {
      const handle = event.addListener(instance, name, function once(...args) {
        handle.remove();
        handler.apply(this, args);
      });
      return handle;
    },
    removeListener(handle) {
      handle.remove();
    },
    clearInstanceListeners(instance) {
      listeners.delete(instance);
    },
    trigger(instance, name, ...args) {
      // A copy: a listener may remove itself while the event is dispatched.
      for (const entry of (listeners.get(instance) ?? []).slice()) {
        if (entry.name === name) entry.handler.apply(instance, args);
      }
    },
  };

  /** Google fires one `idle` once the map settles after creation or a move. */
  function scheduleIdle(map) {
    const s = state.get(map);
    clearTimeout(s.idleTimer);
    s.idleTimer = setTimeout(() => event.trigger(map, 'idle'), 0);
  }

  class GoogleMap {
    constructor(div, options = {}) {
      state.set(this, {
        div,
        center: options.center ? toLatLng(options.center) : undefined,
        zoom: options.zoom,
        idleTimer: 0,
      });
      stats.mapInstances.push(this);
      stats.mapOptions.push(options);
      if (div) {
        // Like Google: style the container and render into ONE child div (v1 appends its pin to that child).
        div.style.position = 'relative';
        div.style.overflow = 'hidden';
        const view = document.createElement('div');
        view.style.cssText =
          'position:absolute;top:0;left:0;width:100%;height:100%;background-color:#e5e3df';
        div.appendChild(view);
      }
      scheduleIdle(this);
    }
    getDiv() {
      return state.get(this).div;
    }
    getCenter() {
      return state.get(this).center;
    }
    setCenter(center) {
      stats.setCenterCalls.push(center);
      state.get(this).center = toLatLng(center);
      event.trigger(this, 'center_changed');
      scheduleIdle(this);
    }
    panTo(center) {
      this.setCenter(center);
    }
    getZoom() {
      return state.get(this).zoom;
    }
    setZoom(zoom) {
      stats.setZoomCalls.push(zoom);
      state.get(this).zoom = zoom;
      event.trigger(this, 'zoom_changed');
      scheduleIdle(this);
    }
  }

  /** Fires dragstart, drag + center_changed per step, dragend, then idle, as a real user drag would. */
  function simulateUserPan(map, to, steps = 4) {
    const s = state.get(map);
    const from = s.center;
    clearTimeout(s.idleTimer);
    event.trigger(map, 'dragstart');
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      s.center =
        i === steps
          ? toLatLng(to)
          : new LatLng(
              from.lat() + (to.lat - from.lat()) * t,
              from.lng() + (to.lng - from.lng()) * t,
            );
      event.trigger(map, 'drag');
      event.trigger(map, 'center_changed');
    }
    event.trigger(map, 'dragend');
    event.trigger(map, 'idle');
  }

  globalThis.google = { maps: { version: 'classic-stub', LatLng, Map: GoogleMap, event } };
  globalThis.lpGoogleStub = {
    stats,
    simulateUserPan,
    listenerCount: (instance, name) =>
      (listeners.get(instance) ?? []).filter((entry) => entry.name === name).length,
    uninstall() {
      delete globalThis.google;
      delete globalThis.lpGoogleStub;
    },
  };
})();
