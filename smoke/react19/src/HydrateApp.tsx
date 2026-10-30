// hydrateRoot page (WP5-12 react19 hydrateRoot cell): after hydration the ref recipe applies `messages` and the
// `addresschange` listener; a bare `messages={...}` prop is not applied by React on hydration (documented), which the
// smoke spec asserts so that a future React fix is noticed.
import 'location-picker';
import type {} from 'location-picker/jsx/react';
import type { AddressDetail } from 'location-picker';
import { useState } from 'react';

export function HydrateApp() {
  const [value, setValue] = useState('48.8584,2.2945');
  const [address, setAddress] = useState<string | null>(null);
  return (
    <>
      <location-picker
        id="recipe"
        name="location"
        reverse-geocode
        locate="button"
        zoom={15}
        value={value}
        onChange={(e) => setValue(e.currentTarget.value)}
        ref={(el) => {
          if (!el) return;
          el.messages = { locate: 'Use my position' };
          const onAddress = (e: CustomEvent<AddressDetail>) => setAddress(e.detail.address);
          el.addEventListener('addresschange', onAddress);
          return () => el.removeEventListener('addresschange', onAddress);
        }}
        style={{ display: 'block', height: 320 }}
      />
      <p>
        State: <output id="state">{value}</output>
      </p>
      <p>
        Address: <output id="address">{address ?? 'No address yet'}</output>
      </p>
      <location-picker
        id="bare"
        locate="button"
        messages={{ locate: 'Bare prop' }}
        style={{ display: 'block', height: 200 }}
      />
    </>
  );
}
