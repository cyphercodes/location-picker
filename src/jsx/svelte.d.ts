/**
 * Svelte 5 typings for `<location-picker>`. Usage: `import type {} from 'location-picker/jsx/svelte';` once (for
 * example in `src/app.d.ts`). Events are the lowercase handler props `onchange`, `oninput`, `onaddresschange`,
 * `onready` and `onerror` (native CustomEvents).
 * @example
 * <location-picker name="location" value={value} onchange={(e) => (value = e.detail.value)} />
 */
import type { HTMLAttributes } from 'svelte/elements';
import type {
  AddressDetail,
  GeocodeFn,
  Geocoder,
  LocationDetail,
  LocationPickerError,
  Messages,
  ReadyDetail,
} from '../core.cjs';
import type { LocationPickerAttributes, LocationPickerElement } from '../element.cjs';

type Handler<D> = (
  event: CustomEvent<D> & { readonly currentTarget: LocationPickerElement },
) => void;

/** `<location-picker>` in Svelte: Svelte's own props, with the picker's attributes and events taking precedence. */
type LocationPickerProps = Omit<
  HTMLAttributes<LocationPickerElement>,
  keyof LocationPickerAttributes | 'onchange' | 'oninput' | 'onerror'
> &
  LocationPickerAttributes & {
    onchange?: Handler<LocationDetail> | null;
    oninput?: Handler<LocationDetail> | null;
    onaddresschange?: Handler<AddressDetail> | null;
    onready?: Handler<ReadyDetail> | null;
    onerror?: Handler<LocationPickerError> | null;
    messages?: Partial<Messages>;
    mapOptions?: Record<string, unknown>;
    engine?: object;
    geocoder?: Geocoder | GeocodeFn | false;
    geolocation?: PositionOptions;
  };

declare module 'svelte/elements' {
  interface SvelteHTMLElements {
    'location-picker': LocationPickerProps;
  }
}

export {};
