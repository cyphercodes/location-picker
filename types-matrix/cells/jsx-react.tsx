// location-picker/jsx/react with @types/react 19 (WP4-18).
import type { LocationPickerElement } from 'location-picker/element';
import type {} from 'location-picker/jsx/react';

export function Picker({ onPick }: { onPick: (value: string) => void }) {
  const ref = (el: LocationPickerElement | null) => {
    if (el) el.messages = { locate: 'Ma position' };
  };
  return (
    <form id="f1">
      <location-picker
        ref={ref}
        name="location"
        value="48.8584,2.2945"
        lat-name="lat"
        locate="button"
        form="f1"
        reverse-geocode
        onChange={(event) => onPick(event.nativeEvent.detail.value)}
        onInput={(event) => event.nativeEvent.detail.lat}
        onaddresschange={(event) => event.detail.address}
        onready={(event) => event.detail}
        onerror={(event) => event.detail.code}
      />
      {/* @ts-expect-error locate modes are 'off' | 'button' | 'auto' */}
      <location-picker locate="sometimes" />
      {/* @ts-expect-error onError is React's synthetic event and never fires here: use onerror */}
      <location-picker onError={() => undefined} />
      {/* @ts-expect-error onAddressChange never fires: use onaddresschange */}
      <location-picker onAddressChange={() => undefined} />
      {/* @ts-expect-error onReady never fires: use onready */}
      <location-picker onReady={() => undefined} />
    </form>
  );
}
