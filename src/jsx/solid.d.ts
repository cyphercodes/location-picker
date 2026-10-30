/**
 * Solid JSX typings for `<location-picker>`. Usage: `import type {} from 'location-picker/jsx/solid';` once.
 * Bind the live value with `prop:value`, listen with `on:change`, `on:input`, `on:addresschange`, `on:ready`,
 * `on:error` (native CustomEvents) and `on:toggle` (field mode). Object config (`messages`, `mapOptions`, `engine`, `geocoder`, `geolocation`) is
 * set as properties.
 * @example
 * <location-picker name="location" prop:value={value()} on:change={(e) => setValue(e.detail.value)} />
 */
import type { JSX } from 'solid-js';
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

type Handler<D> = JSX.EventHandlerWithOptionsUnion<LocationPickerElement, CustomEvent<D>>;

/** `<location-picker>` in Solid JSX: Solid's own props, with the picker's attributes and events taking precedence. */
type LocationPickerProps = Omit<
  JSX.HTMLAttributes<LocationPickerElement>,
  keyof LocationPickerAttributes | 'on:change' | 'on:input' | 'on:error' | 'on:toggle'
> &
  LocationPickerAttributes & {
    'prop:value'?: string;
    'on:change'?: Handler<LocationDetail>;
    'on:input'?: Handler<LocationDetail>;
    'on:addresschange'?: Handler<AddressDetail>;
    'on:ready'?: Handler<ReadyDetail>;
    'on:error'?: Handler<LocationPickerError>;
    'on:toggle'?: JSX.EventHandlerWithOptionsUnion<LocationPickerElement, ToggleEvent>;
    messages?: Partial<Messages>;
    mapOptions?: Record<string, unknown>;
    engine?: object;
    geocoder?: Geocoder | GeocodeFn | false;
    geolocation?: PositionOptions;
  };

declare module 'solid-js' {
  namespace JSX {
    interface IntrinsicElements {
      'location-picker': LocationPickerProps;
    }
  }
}

export {};
