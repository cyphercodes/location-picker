import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LocationPicker } from '../location-picker';

// --- Minimal Google Maps mock -----------------------------------------------
interface Listener {
  type: string;
  cb: (...args: unknown[]) => void;
}

class FakeMap {
  public center: { lat: number; lng: number };
  public zoom: number;
  public listeners: Listener[] = [];

  constructor(
    public element: HTMLElement,
    public opts: { center: { lat: number; lng: number }; zoom?: number },
  ) {
    this.center = { ...opts.center };
    this.zoom = opts.zoom ?? 15;
  }
  getCenter() {
    const { lat, lng } = this.center;
    return {
      lat: () => lat,
      lng: () => lng,
    };
  }
  setCenter(c: { lat: number; lng: number }) {
    this.center = { ...c };
    this.fire('center_changed');
    this.fire('idle');
  }
  addListener(type: string, cb: (...args: unknown[]) => void) {
    const listener: Listener = { type, cb };
    this.listeners.push(listener);
    return {
      remove: () => {
        this.listeners = this.listeners.filter((l) => l !== listener);
      },
    };
  }
  fire(type: string) {
    for (const l of this.listeners.filter((l) => l.type === type)) {
      l.cb();
    }
  }
}

function installMapsMock() {
  const g = globalThis as unknown as { google: unknown };
  g.google = {
    maps: {
      Map: FakeMap,
      Marker: class {},
      event: {
        addListener: (
          target: { addListener: (t: string, cb: () => void) => unknown },
          type: string,
          cb: () => void,
        ) => target.addListener(type, cb),
      },
    },
  };
}

function installGeolocationMock(coords: { lat: number; lng: number } | 'fail') {
  Object.defineProperty(globalThis.navigator, 'geolocation', {
    configurable: true,
    value: {
      getCurrentPosition: (
        success: (pos: { coords: { latitude: number; longitude: number } }) => void,
        error?: (e: Error) => void,
      ) => {
        if (coords === 'fail') {
          error?.(new Error('denied'));
        } else {
          success({ coords: { latitude: coords.lat, longitude: coords.lng } });
        }
      },
    },
  });
}

// ---------------------------------------------------------------------------

describe('LocationPicker', () => {
  beforeEach(() => {
    installMapsMock();
    document.body.innerHTML = '<div id="map"><div class="gm-inner"></div></div>';
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('accepts an element id string', () => {
    const lp = new LocationPicker('map', { setCurrentPosition: false, lat: 1, lng: 2 });
    expect(lp.element).toBe(document.getElementById('map'));
    expect(lp.getMarkerPosition()).toEqual({ lat: 1, lng: 2 });
  });

  it('accepts an HTMLElement', () => {
    const el = document.getElementById('map') as HTMLElement;
    const lp = new LocationPicker(el, { setCurrentPosition: false, lat: 10, lng: 20 });
    expect(lp.element).toBe(el);
  });

  it('setLocation calls map.setCenter', () => {
    const lp = new LocationPicker('map', { setCurrentPosition: false, lat: 0, lng: 0 });
    const spy = vi.spyOn(lp.map as unknown as FakeMap, 'setCenter');
    lp.setLocation(5, 6);
    expect(spy).toHaveBeenCalledWith({ lat: 5, lng: 6 });
    expect(lp.getMarkerPosition()).toEqual({ lat: 5, lng: 6 });
  });

  it('setCurrentPosition resolves with geolocation coords', async () => {
    installGeolocationMock({ lat: 42, lng: -71 });
    const lp = new LocationPicker('map', { setCurrentPosition: false, lat: 0, lng: 0 });
    await expect(lp.setCurrentPosition()).resolves.toEqual({ lat: 42, lng: -71 });
    expect(lp.getMarkerPosition()).toEqual({ lat: 42, lng: -71 });
  });

  it('setCurrentPosition rejects on geolocation failure', async () => {
    installGeolocationMock('fail');
    const lp = new LocationPicker('map', { setCurrentPosition: false, lat: 0, lng: 0 });
    await expect(lp.setCurrentPosition()).rejects.toBeInstanceOf(Error);
  });

  it('onLocationChange fires on idle', () => {
    const onLocationChange = vi.fn();
    const lp = new LocationPicker('map', {
      setCurrentPosition: false,
      lat: 0,
      lng: 0,
      onLocationChange,
    });
    lp.setLocation(3, 4);
    expect(onLocationChange).toHaveBeenCalledWith({ lat: 3, lng: 4 });
  });

  it('destroy cleans up listeners and DOM', () => {
    const onLocationChange = vi.fn();
    const lp = new LocationPicker('map', {
      setCurrentPosition: false,
      lat: 0,
      lng: 0,
      onLocationChange,
    });
    expect(document.querySelector('.centerMarker')).not.toBeNull();
    lp.destroy();
    expect(document.querySelector('.centerMarker')).toBeNull();
    expect((lp.map as unknown as FakeMap).listeners.filter((l) => l.type === 'idle')).toHaveLength(
      0,
    );
    // post-destroy idle should not invoke callback
    (lp.map as unknown as FakeMap).fire('idle');
    expect(onLocationChange).not.toHaveBeenCalled();
  });
});
