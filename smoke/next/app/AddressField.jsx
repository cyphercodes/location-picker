'use client';
// docs/frameworks.md React hydration recipe in the App Router: value + onChange survive hydration; messages and the
// addresschange listener go in a ref. #bare passes messages as a prop, which React does not apply on hydration.
import 'location-picker';
import { useState } from 'react';

export function AddressField() {
  const [value, setValue] = useState('48.8584,2.2945');
  const [address, setAddress] = useState(null);
  return (
    <>
      <form method="post" action="/echo">
        <label htmlFor="recipe">Location</label>
        <location-picker
          id="recipe"
          name="location"
          lat-name="lat"
          lng-name="lng"
          reverse-geocode
          locate="button"
          zoom={15}
          value={value}
          onChange={(e) => setValue(e.currentTarget.value)}
          ref={(el) => {
            if (!el) return;
            el.messages = { locate: 'Use my position' };
            const onAddress = (e) => setAddress(e.detail.address);
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
        <button>Save</button>
      </form>
      <location-picker
        id="bare"
        locate="button"
        messages={{ locate: 'Bare prop' }}
        style={{ display: 'block', height: 200 }}
      />
    </>
  );
}
