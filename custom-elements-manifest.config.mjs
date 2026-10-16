// Custom Elements Manifest analyzer config: `cem analyze` writes ./custom-elements.json (GENERATED, git-ignored).
export default {
  globs: ['src/element/**/*.ts'],
  exclude: ['**/*.test.ts', '**/*.d.ts'],
  outdir: '.',
  // package.json already points `customElements` at ./custom-elements.json; never let the analyzer rewrite it.
  packagejson: false,
};
