/**
 * Preact JSX typings for `<location-picker>`. Usage: `import type {} from 'location-picker/jsx/preact';` once.
 * Same attribute set as the element (kebab-case is SSR-correct); events are the lowercase native handlers
 * `onchange`, `oninput`, `onaddresschange`, `onready` and `onerror`. Preact assigns props that exist on the element
 * (`value`, `locate`, `form`, `messages`…) as properties; each has a setter with the attribute's meaning.
 * @example
 * <location-picker name="location" locate="button" onchange={(e) => setValue(e.detail.value)} />
 */
import type { HTMLAttributes } from 'preact';
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

/** `<location-picker>` in Preact JSX: Preact's own props, with the picker's attributes and events taking precedence. */
type LocationPickerProps = Omit<
  HTMLAttributes<LocationPickerElement>,
  keyof LocationPickerAttributes | 'onChange' | 'onInput' | 'onError'
> &
  LocationPickerAttributes & {
    onchange?: Handler<LocationDetail>;
    oninput?: Handler<LocationDetail>;
    onaddresschange?: Handler<AddressDetail>;
    onready?: Handler<ReadyDetail>;
    onerror?: Handler<LocationPickerError>;
    messages?: Partial<Messages>;
    mapOptions?: Record<string, unknown>;
    engine?: object;
    geocoder?: Geocoder | GeocodeFn | false;
    geolocation?: PositionOptions;
  };

declare module 'preact' {
  namespace JSX {
    interface IntrinsicElements {
      'location-picker': LocationPickerProps;
    }
  }
}

export {};
