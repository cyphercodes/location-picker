import vue from '@vitejs/plugin-vue';
import { defineConfig } from 'vite';

// docs/frameworks.md: tell the Vue compiler that location-picker is a custom element.
export default defineConfig({
  plugins: [
    vue({ template: { compilerOptions: { isCustomElement: (tag) => tag === 'location-picker' } } }),
  ],
});
