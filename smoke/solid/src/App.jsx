// docs/frameworks.md Solid recipe: prop:value and on:change, plus a form post and locate="button".
import 'location-picker';
import { createSignal } from 'solid-js';

export function App() {
  const [location, setLocation] = createSignal('48.8584,2.2945');
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
          prop:value={location()}
          on:change={(e) => setLocation(e.detail.value)}
          style={{ display: 'block', height: '320px' }}
        />
        <p>
          State: <output id="state">{location()}</output>
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
