<script setup>
// docs/frameworks.md Vue 3 / Nuxt recipe, server-rendered: the import is safe during SSR. Vue's SSR compiler refuses
// v-model on any element but input/textarea/select ("v-model can only be used on <input>…", custom elements too),
// so the template binds :value and @change (v-model.lazy semantics). With @input instead, Vue writes each live value
// back during the pan, and that write stops the pan without a commit (reported as a WP2/WP4 finding).
import 'location-picker';

const location = ref('48.8584,2.2945');
const address = ref(null);
</script>

<template>
  <form method="post" action="/api/echo">
    <label for="loc">Location</label>
    <location-picker
      id="loc"
      :value="location"
      @change="location = $event.detail.value"
      :zoom="15"
      name="location"
      lat-name="lat"
      lng-name="lng"
      reverse-geocode
      @addresschange="address = $event.detail.address"
      style="display: block; height: 320px"
    />
    <p>
      State: <output id="state">{{ location }}</output>
      <small id="address">{{ address ?? 'No address yet' }}</small>
    </p>
    <button>Save</button>
  </form>
</template>
