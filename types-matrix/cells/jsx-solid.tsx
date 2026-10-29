// location-picker/jsx/solid (WP4-18): prop:value and on:* custom events.
import type {} from 'location-picker/jsx/solid';

export function Picker() {
  return (
    <location-picker
      name="location"
      prop:value="48.8584,2.2945"
      locate="button"
      on:change={(event) => event.detail.value}
      on:addresschange={(event) => event.detail.address}
    />
  );
}

// @ts-expect-error locate modes are 'off' | 'button' | 'auto'
export const wrong = <location-picker locate="sometimes" />;
