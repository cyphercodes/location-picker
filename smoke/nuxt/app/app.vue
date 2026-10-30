<script setup>
// docs/frameworks.md Vue 3 / Nuxt recipe, server-rendered: the import is safe during SSR; v-model after hydration.
import 'location-picker';

const location = ref('48.8584,2.2945');
const address = ref(null);
</script>

<template>
  <form method="post" action="/api/echo">
    <label for="loc">Location</label>
    <location-picker
      id="loc"
      v-model="location"
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
