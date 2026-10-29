// location-picker/jsx/preact (WP4-18): kebab-case attributes, typed lowercase handlers.
import type {} from 'location-picker/jsx/preact';

export function Picker() {
  return (
    <location-picker
      name="location"
      value="48.8584,2.2945"
      lat-name="lat"
      locate="button"
      onchange={(event) => event.detail.value}
      oninput={(event) => event.detail.lat}
      onaddresschange={(event) => event.detail.address}
    />
  );
}

// @ts-expect-error locate modes are 'off' | 'button' | 'auto'
export const wrong = <location-picker locate="sometimes" />;
