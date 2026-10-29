// WP5-05: what esbuild keeps from the packed tarball. `sideEffects` and the side-effect-free core/utils entries
// let a bundler drop the element definition, and the root import keeps it. Adapter code exists once in the ESM dist,
// so a bundle that imports an adapter both directly and through the core's lazy loader carries one copy.
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { node, packProject, placeholder, skipUnbuilt, type PackedProject } from './packed.js';

const BUNDLE_SCRIPT = resolve('test/package/bundle.mjs');

const ENTRIES = {
  utils: `import { parseLatLng } from 'location-picker/utils';\nconsole.log(parseLatLng('1,2'));\n`,
  core: `import { LocationPicker } from 'location-picker/core';\nconsole.log(LocationPicker);\n`,
  root: `import 'location-picker';\n`,
  adapters: `import { LocationPicker } from 'location-picker';
import { leafletProvider } from 'location-picker/leaflet';
import { googleProvider } from 'location-picker/google';
import { maplibreProvider } from 'location-picker/maplibre';
import { photonGeocoder } from 'location-picker/photon';
console.log(LocationPicker, leafletProvider, googleProvider, maplibreProvider, photonGeocoder);
`,
};

const ADAPTERS = {
  leafletProvider: './leaflet',
  googleProvider: './google',
  maplibreProvider: './maplibre',
  photonGeocoder: './photon',
} as const;

function files(dir: string, pattern: RegExp): string[] {
  return readdirSync(dir, { withFileTypes: true, recursive: true })
    .filter((entry) => entry.isFile() && pattern.test(entry.name))
    .map((entry) => join(entry.parentPath, entry.name));
}

describe.skipIf(skipUnbuilt)(
  'WP5-05: esbuild bundles of the packed tarball (needs `npm run build`)',
  () => {
    let packed: PackedProject;
    let bundles: Record<keyof typeof ENTRIES, string>;

    beforeAll(() => {
      packed = packProject('bundle');
      bundles = JSON.parse(node(packed.dir, [BUNDLE_SCRIPT, packed.dir, JSON.stringify(ENTRIES)]));
    }, 60_000);
    afterAll(() => packed?.dispose());

    it("{ parseLatLng } from 'location-picker/utils' contains no customElements", () => {
      expect(bundles.utils).toContain('parseLatLng');
      expect(bundles.utils).not.toContain('customElements');
    });

    it("{ LocationPicker } from 'location-picker/core' contains no customElements.define", () => {
      expect(bundles.core).toContain('LocationPicker');
      expect(bundles.core).not.toContain('customElements.define');
    });

    it("import 'location-picker' keeps customElements.define", (ctx) => {
      const pending = placeholder('.') ?? placeholder('./element');
      if (pending && !bundles.root.includes('customElements.define')) ctx.skip(pending);
      expect(bundles.root).toContain('customElements.define');
    });

    it.for(Object.entries(ADAPTERS))(
      '%s is bundled once when imported directly and through the root',
      ([name, subpath], ctx) => {
        const declaration = new RegExp(
          `(?:function ${name}\\d*\\(|(?:const|let|var) ${name}\\d* =)`,
          'g',
        );
        const definitions = bundles.adapters.match(declaration) ?? [];
        if (definitions.length === 0 && placeholder(subpath)) ctx.skip(placeholder(subpath));
        expect(definitions).toHaveLength(1);
      },
    );

    it.each(['mjs', 'cjs'])(
      'every source module appears in exactly one %s file of dist/',
      (ext) => {
        const owners = new Map<string, string[]>();
        for (const file of files(join(packed.pkg, 'dist'), new RegExp(`\\.${ext}$`))) {
          const code = readFileSync(file, 'utf8');
          for (const [, module = ''] of code.matchAll(/^\/\/#region (\S+)$/gm)) {
            owners.set(module, [...(owners.get(module) ?? []), relative(packed.pkg, file)]);
          }
        }
        expect(owners.size).toBeGreaterThan(0);
        const duplicated = [...owners].filter(([, where]) => where.length > 1);
        expect(duplicated).toEqual([]);
      },
    );
  },
);
