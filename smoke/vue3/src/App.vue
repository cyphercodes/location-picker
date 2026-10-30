<script setup>
// docs/frameworks.md Vue 3 recipe: v-model (input + el.value), @addresschange, kebab-case attributes; plus the
// WP4-21 locate cases (a valued and a bare `locate`, which Vue assigns as properties).
import 'location-picker';
import { ref } from 'vue';

const location = ref('48.8584,2.2945');
const address = ref(null);
</script>

<template>
  <form method="post" action="/echo">
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
  <location-picker id="locate-button" locate="button" style="display: block; height: 200px" />
  <location-picker id="locate-bare" locate style="display: block; height: 200px" />
</template>
