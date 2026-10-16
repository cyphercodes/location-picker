import type { OutputOptions, Plugin } from 'rolldown';
import { defineConfig, type UserConfig } from 'tsdown';

// Produces exactly the CONTRACT §1.2 file set. The frozen v1 UMD is NOT built here: it is a committed artifact
// (src/compat/location-picker.min.js, regenerated only by `npm run build:v1`) that is copied into dist/ as-is.

/** Shared (and lazy) chunks go to dist/_chunks/ for JS and d.ts alike (tsdown picks the names and extensions). */
const inChunksDir = (names: OutputOptions['chunkFileNames']): OutputOptions['chunkFileNames'] => {
  if (typeof names === 'function') return (chunk) => `_chunks/${names(chunk)}`;
  return names && `_chunks/${names}`;
};

// oxc's isolated declarations drop triple-slash directives (even with preserve="true"), so they are re-added here.
const dtsBanner = (fileName: string): string | undefined => {
  if (/^google\.d\.[cm]ts$/.test(fileName)) return '/// <reference types="google.maps" />';
  if (/^(index|element)\.d\.[cm]ts$/.test(fileName))
    return '/// <reference path="./globals.d.ts" />';
  return undefined;
};

// `sourcemap: true` also stamps a sourceMappingURL on d.ts chunks although no d.ts map is emitted (§1.2: JS maps only).
const dropDtsSourceMapUrl: Plugin = {
  name: 'lp:drop-dts-sourcemap-url',
  generateBundle(_options, bundle) {
    for (const file of Object.values(bundle)) {
      if (file.type === 'chunk' && /\.d\.[cm]ts$/.test(file.fileName)) {
        file.code = file.code.replace(/\n\/\/# sourceMappingURL=\S+\s*$/, '\n');
      }
    }
  },
};

const lib: UserConfig = {
  name: 'lib',
  entry: {
    index: 'src/index.ts',
    core: 'src/core.ts',
    element: 'src/element.ts',
    utils: 'src/utils.ts',
    leaflet: 'src/leaflet.ts',
    google: 'src/google.ts',
    maplibre: 'src/maplibre.ts',
    photon: 'src/photon.ts',
    webmcp: 'src/webmcp.ts',
  },
  format: ['esm', 'cjs'],
  platform: 'neutral',
  target: 'es2022',
  fixedExtension: true,
  dts: { sourcemap: false },
  sourcemap: true,
  css: { minify: true },
  clean: true,
  plugins: [dropDtsSourceMapUrl],
  inputOptions: { preserveEntrySignatures: 'allow-extension' },
  // CJS stays a plain exports object: require('location-picker').LocationPicker === .default (CONTRACT §1.3).
  outputOptions: (options, format, { cjsDts }) => ({
    ...options,
    chunkFileNames: inChunksDir(options.chunkFileNames),
    ...(format === 'cjs' ? { exports: 'named' as const } : {}),
    ...(cjsDts ? { sourcemap: false } : {}),
  }),
  banner: ({ fileName }) => {
    const dts = dtsBanner(fileName);
    return dts ? { dts } : undefined;
  },
};

const iife: UserConfig = {
  name: 'global',
  entry: { 'location-picker.global': 'src/global.ts' },
  format: 'iife',
  // No globalName: src/global.ts assigns globalThis.LocationPicker itself (the class with statics, D12).
  platform: 'browser',
  target: 'es2022',
  minify: true,
  sourcemap: true,
  css: { minify: true },
  dts: false,
  clean: false,
  outputOptions: { entryFileNames: 'location-picker.global.js', codeSplitting: false },
};

const assets: UserConfig = {
  name: 'assets',
  entry: { 'location-picker': 'src/styles/class.css' },
  css: { minify: true, fileName: 'location-picker.css' },
  dts: false,
  clean: false,
  copy: [
    { from: 'src/compat/location-picker.min.js', to: 'dist' },
    { from: 'src/compat/v1.d.ts', to: 'dist', rename: 'location-picker.min.d.ts' },
    { from: ['types/style.css.d.ts', 'types/globals.d.ts', 'types/global.d.ts'], to: 'dist' },
    { from: ['src/jsx/*.d.ts', 'src/jsx/empty.js'], to: 'dist/jsx' },
  ],
};

export default defineConfig([lib, iife, assets]);
