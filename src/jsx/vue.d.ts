/**
 * Vue typings for `<location-picker>` in templates (Volar / vue-tsc). Usage: `import type {} from
 * 'location-picker/jsx/vue';` once, and tell the compiler it is a custom element
 * (`compilerOptions.isCustomElement: (tag) => tag === 'location-picker'`). `v-model` uses `input` + `el.value`;
 * `v-model.lazy` uses `change`. Listen with `@change`, `@input`, `@addresschange`, `@ready`, `@error` and `@toggle`
 * (field mode).
 * @example
 * <location-picker v-model="location" name="location" locate="button" @addresschange="onAddress" />
 */
import type { DefineComponent } from 'vue';
import type {
  AddressDetail,
  GeocodeFn,
  Geocoder,
  LocationDetail,
  LocationPickerError,
  Messages,
  ReadyDetail,
} from '../core.cjs';
import type { LocationPickerAttributes } from '../element.cjs';

/** Props of `<location-picker>` in Vue templates; `@x` listeners are the `onX` props. */
type LocationPickerProps = LocationPickerAttributes & {
  onChange?: (event: CustomEvent<LocationDetail>) => void;
  onInput?: (event: CustomEvent<LocationDetail>) => void;
  onAddresschange?: (event: CustomEvent<AddressDetail>) => void;
  onReady?: (event: CustomEvent<ReadyDetail>) => void;
  onError?: (event: CustomEvent<LocationPickerError>) => void;
  onToggle?: (event: ToggleEvent) => void;
  messages?: Partial<Messages>;
  mapOptions?: Record<string, unknown>;
  engine?: object;
  geocoder?: Geocoder | GeocodeFn | false;
  geolocation?: PositionOptions;
};

declare module 'vue' {
  interface GlobalComponents {
    'location-picker': DefineComponent<LocationPickerProps>;
  }
}

export {};
