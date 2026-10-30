// docs/frameworks.md Preact recipe: value + lowercase onchange, plus a form post and WP4-21 locate="button".
import 'location-picker';
import { useState } from 'preact/hooks';

export function App() {
  const [location, setLocation] = useState('48.8584,2.2945');
  return (
    <>
      <form method="post" action="/echo">
        <label for="loc">Location</label>
        <location-picker
          id="loc"
          name="location"
          lat-name="lat"
          lng-name="lng"
          search
          zoom={15}
          value={location}
          onchange={(e) => setLocation(e.detail.value)}
          style={{ display: 'block', height: '320px' }}
        />
        <p>
          State: <output id="state">{location}</output>
        </p>
        <button>Save</button>
      </form>
      <location-picker
        id="locate-button"
        locate="button"
        style={{ display: 'block', height: '200px' }}
      />
    </>
  );
}
