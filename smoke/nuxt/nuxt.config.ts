// docs/frameworks.md: the same compiler option as Vue, in nuxt.config.ts.
export default defineNuxtConfig({
  compatibilityDate: '2026-10-01',
  devtools: { enabled: false },
  telemetry: false,
  vue: { compilerOptions: { isCustomElement: (tag) => tag === 'location-picker' } },
});
