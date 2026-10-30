<script>
  // docs/frameworks.md Svelte 5 recipe: value={…} and onchange, plus a form post and the locate button.
  import 'location-picker';

  let location = $state('48.8584,2.2945');
</script>

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
    onchange={(e) => (location = e.detail.value)}
    style="display: block; height: 320px"
  ></location-picker>
  <p>State: <output id="state">{location}</output></p>
  <button>Save</button>
</form>
<location-picker id="locate-button" locate="button" style="display: block; height: 200px"></location-picker>
