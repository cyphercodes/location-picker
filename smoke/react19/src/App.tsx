// createRoot page (WP5-12 react19, WP4-21): value + onChange state, a lowercase native onerror, and a second picker
// outside the form with form="f1" and locate="button" (both are element properties that React 19 assigns).
import 'location-picker';
import type {} from 'location-picker/jsx/react';
import { useState } from 'react';

export function App() {
  const [value, setValue] = useState('48.8584,2.2945');
  const [error, setError] = useState('');
  return (
    <>
      <form id="f1" method="post" action="/echo">
        <label htmlFor="loc">Location</label>
        <location-picker
          id="loc"
          name="location"
          lat-name="lat"
          lng-name="lng"
          required
          zoom={15}
          value={value}
          onChange={(e) => setValue(e.currentTarget.value)}
          onerror={(e) => setError(e.detail.code)}
          style={{ display: 'block', height: 320 }}
        />
        <p>
          State: <output id="state">{value}</output>
        </p>
        <p>
          Error: <output id="error">{error}</output>
        </p>
        <button>Save</button>
      </form>
      <location-picker
        id="outside"
        form="f1"
        locate="button"
        style={{ display: 'block', height: 240 }}
      />
    </>
  );
}
