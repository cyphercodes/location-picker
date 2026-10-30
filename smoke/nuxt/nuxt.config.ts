// docs/frameworks.md: the same compiler option as Vue, in nuxt.config.ts. `vue.compilerOptions` alone did not reach
// the template compiler in the Nuxt 4.6 build ("v-model can only be used on <input>…"); the Vite plugin option does.
const isCustomElement = (tag: string): boolean => tag === 'location-picker';

export default defineNuxtConfig({
  compatibilityDate: '2026-10-01',
  devtools: { enabled: false },
  telemetry: false,
  vue: { compilerOptions: { isCustomElement } },
  vite: { vue: { template: { compilerOptions: { isCustomElement } } } },
});
