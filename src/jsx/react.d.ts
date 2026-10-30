/**
 * React 19 JSX typings. Usage: `import type {} from 'location-picker/jsx/react';` once.
 * React 19 sets `value`, `search`, `locate`, `form`… as PROPERTIES when they exist on the element (each has a setter)
 * and fires `onChange`/`onInput` for the element's native-named events (verified on react-dom 19.3 with createRoot).
 * Spell primitive config in kebab-case (SSR-correct).
 * Event props in React: `onChange`, `onInput` (synthetic), and the LOWERCASE native `onaddresschange`, `onready`,
 * `onerror`. `onAddressChange`/`onReady` listen for events that never fire and `onError` is React's own synthetic
 * event (never fired for this element), so all three are type errors here.
 * Hydration: with `hydrateRoot` (Next.js App Router, Remix), React applies neither object props (`messages`,
 * `mapOptions`, `engine`, `geocoder`, `geolocation`, an adapter-object `provider`) nor the lowercase native handlers.
 * Set them in a ref callback (refs ARE attached on hydration); attributes, `value` and `onChange`/`onInput` work.
 * @example
 * // SSR-hydrated React: object props and native listeners via a ref callback (React 19 cleanup function)
 * <location-picker name="location" reverse-geocode ref={(el) => {
 *   if (!el) return;
 *   el.messages = { locate: 'Ma position' };
 *   const onAddress = (e: CustomEvent<AddressDetail>) => setAddress(e.detail.address);
 *   el.addEventListener('addresschange', onAddress);
 *   return () => el.removeEventListener('addresschange', onAddress);
 * }} />
 */
import type { DetailedHTMLProps, HTMLAttributes, SyntheticEvent } from 'react';
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

/** React's own props, minus the ones the picker types itself (its attributes and events). */
type ReactProps = Omit<
  DetailedHTMLProps<HTMLAttributes<LocationPickerElement>, LocationPickerElement>,
  keyof LocationPickerAttributes | 'onChange' | 'onInput' | 'onError' | 'onLoad'
>;

/** `<location-picker>` in React 19 JSX. */
type LocationPickerProps = ReactProps &
  LocationPickerAttributes & {
    onChange?: (event: SyntheticEvent<LocationPickerElement, CustomEvent<LocationDetail>>) => void;
    onInput?: (event: SyntheticEvent<LocationPickerElement, CustomEvent<LocationDetail>>) => void;
    onaddresschange?: (event: CustomEvent<AddressDetail>) => void;
    onready?: (event: CustomEvent<ReadyDetail>) => void;
    onerror?: (event: CustomEvent<LocationPickerError>) => void;
    messages?: Partial<Messages>;
    mapOptions?: Record<string, unknown>;
    engine?: object;
    geocoder?: Geocoder | GeocodeFn | false;
    geolocation?: PositionOptions;
  };

declare module 'react' {
  namespace JSX {
    interface IntrinsicElements {
      'location-picker': LocationPickerProps;
    }
  }
}

export {};
